/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Only admins can create admin users
    const userRole = role === 'admin' && req.user?.role !== 'admin' 
      ? 'client' 
      : role || 'client';

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      role: userRole
    });

    // Generate tokens
    const accessToken = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken(req.headers['user-agent']);
    await user.save();

    logger.info('User registered', { userId: user._id, email });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user and verify credentials
    const user = await User.findByCredentials(email, password);

    // Generate tokens
    const accessToken = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken(req.headers['user-agent']);
    await user.save();

    logger.info('User logged in', { userId: user._id, email });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          businesses: user.businesses
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    logger.warn('Login failed:', error.message);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Refresh token
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Find user and check if token is valid
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const tokenExists = user.refreshTokens.some(t => t.token === refreshToken);
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    // Generate new access token
    const accessToken = user.generateAuthToken();

    res.json({
      success: true,
      data: { accessToken }
    });

  } catch (error) {
    logger.warn('Token refresh failed:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.id);
      if (user && refreshToken) {
        user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
        await user.save();
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    // Always return success for logout
    res.json({
      success: true,
      message: 'Logged out'
    });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('businesses', 'name nameHebrew botId isActive');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        businesses: user.businesses,
        preferences: user.preferences,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update profile
 * PUT /api/auth/profile
 */
router.put('/profile', require('../middleware/auth'), async (req, res) => {
  try {
    const { firstName, lastName, phone, preferences } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        preferences: user.preferences
      }
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Change password
 * PUT /api/auth/password
 */
router.put('/password', require('../middleware/auth'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info('Password changed', { userId: user._id });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If an account exists, a reset email has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    
    await user.save();

    // In production, send email here
    logger.info('Password reset requested', { userId: user._id });

    res.json({
      success: true,
      message: 'If an account exists, a reset email has been sent',
      // Remove in production:
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset password
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info('Password reset completed', { userId: user._id });

    res.json({
      success: true,
      message: 'Password has been reset'
    });

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
