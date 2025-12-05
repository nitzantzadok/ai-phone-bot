/**
 * Admin Routes - Admin Dashboard API
 * Full access to all businesses, calls, analytics, and errors
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { User, Business, Call, Reservation, Error: ErrorModel } = require('../models');
const logger = require('../utils/logger');
const callHandlerService = require('../services/callHandler.service');

// All admin routes require authentication and admin role
router.use(auth);
router.use(adminOnly);

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * Get admin dashboard overview
 * GET /api/admin/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    // Get aggregate stats
    const [
      totalBusinesses,
      activeBusinesses,
      totalCalls,
      todayCalls,
      monthlyCallStats,
      recentErrors,
      activeCalls
    ] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true, isPaused: false }),
      Call.countDocuments(),
      Call.countDocuments({ startTime: { $gte: startOfDay } }),
      Call.aggregate([
        { $match: { startTime: { $gte: startOfMonth } } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalMinutes: { $sum: { $divide: ['$duration', 60] } },
            totalCost: { $sum: '$costs.total' },
            avgDuration: { $avg: '$duration' }
          }
        }
      ]),
      ErrorModel.countDocuments({ 
        status: { $ne: 'resolved' },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      callHandlerService.getActiveCallsCount()
    ]);

    const monthStats = monthlyCallStats[0] || {
      totalCalls: 0,
      totalMinutes: 0,
      totalCost: 0,
      avgDuration: 0
    };

    res.json({
      success: true,
      data: {
        businesses: {
          total: totalBusinesses,
          active: activeBusinesses,
          paused: totalBusinesses - activeBusinesses
        },
        calls: {
          total: totalCalls,
          today: todayCalls,
          active: activeCalls,
          thisMonth: monthStats.totalCalls,
          avgDuration: Math.round(monthStats.avgDuration || 0)
        },
        costs: {
          thisMonth: Math.round(monthStats.totalCost * 100) / 100,
          totalMinutes: Math.round(monthStats.totalMinutes)
        },
        errors: {
          unresolvedLast24h: recentErrors
        }
      }
    });

  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// BUSINESSES MANAGEMENT
// ============================================

/**
 * Get all businesses
 * GET /api/admin/businesses
 */
router.get('/businesses', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    if (status === 'active') query.isActive = true;
    if (status === 'paused') query.isPaused = true;
    if (status === 'inactive') query.isActive = false;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameHebrew: { $regex: search, $options: 'i' } },
        { botId: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const businesses = await Business.find(query)
      .populate('owner', 'firstName lastName email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Business.countDocuments(query);

    res.json({
      success: true,
      data: {
        businesses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get businesses error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get single business details
 * GET /api/admin/businesses/:id
 */
router.get('/businesses/:id', async (req, res) => {
  try {
    const business = await Business.findById(req.params.id)
      .populate('owner', 'firstName lastName email phone');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    // Get recent call stats
    const callStats = await Call.getBusinessStats(business._id);
    
    // Get recent calls
    const recentCalls = await Call.find({ business: business._id })
      .sort({ startTime: -1 })
      .limit(10)
      .select('startTime duration status primaryIntent costs.total');

    // Get upcoming reservations
    const upcomingReservations = await Reservation.getUpcoming(business._id, 5);

    res.json({
      success: true,
      data: {
        business,
        callStats,
        recentCalls,
        upcomingReservations
      }
    });

  } catch (error) {
    logger.error('Get business error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create new business
 * POST /api/admin/businesses
 */
router.post('/businesses', async (req, res) => {
  try {
    const businessData = req.body;
    
    // Create owner if provided
    let owner;
    if (businessData.ownerEmail) {
      owner = await User.findOne({ email: businessData.ownerEmail });
      if (!owner) {
        // Create new client user
        owner = await User.create({
          email: businessData.ownerEmail,
          password: businessData.ownerPassword || 'ChangeMe123!',
          firstName: businessData.ownerFirstName || 'Business',
          lastName: businessData.ownerLastName || 'Owner',
          phone: businessData.ownerPhone,
          role: 'client'
        });
      }
    }

    // Create business
    const business = await Business.create({
      ...businessData,
      owner: owner?._id || req.user.id,
      createdBy: req.user.id
    });

    // Add business to owner's list
    if (owner) {
      owner.businesses.push(business._id);
      await owner.save();
    }

    logger.info('Business created', { 
      businessId: business._id, 
      botId: business.botId,
      createdBy: req.user.id 
    });

    res.status(201).json({
      success: true,
      data: {
        business,
        webhookUrl: business.webhookUrl
      }
    });

  } catch (error) {
    logger.error('Create business error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update business
 * PUT /api/admin/businesses/:id
 */
router.put('/businesses/:id', async (req, res) => {
  try {
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    logger.info('Business updated', { 
      businessId: business._id,
      updatedBy: req.user.id 
    });

    res.json({
      success: true,
      data: business
    });

  } catch (error) {
    logger.error('Update business error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete business
 * DELETE /api/admin/businesses/:id
 */
router.delete('/businesses/:id', async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    // Soft delete - just deactivate
    business.isActive = false;
    business.isPaused = true;
    business.pauseReason = 'Deleted by admin';
    await business.save();

    logger.info('Business deleted', { 
      businessId: business._id,
      deletedBy: req.user.id 
    });

    res.json({
      success: true,
      message: 'Business deactivated'
    });

  } catch (error) {
    logger.error('Delete business error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Toggle business pause state
 * POST /api/admin/businesses/:id/toggle-pause
 */
router.post('/businesses/:id/toggle-pause', async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    business.isPaused = !business.isPaused;
    business.pauseReason = business.isPaused ? req.body.reason : undefined;
    await business.save();

    res.json({
      success: true,
      data: {
        isPaused: business.isPaused
      }
    });

  } catch (error) {
    logger.error('Toggle pause error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// CALLS MANAGEMENT
// ============================================

/**
 * Get all calls
 * GET /api/admin/calls
 */
router.get('/calls', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      businessId,
      status,
      startDate,
      endDate,
      hasErrors
    } = req.query;

    const query = {};
    
    if (businessId) query.business = businessId;
    if (status) query.status = status;
    if (hasErrors === 'true') query.hadErrors = true;
    
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }

    const calls = await Call.find(query)
      .populate('business', 'name nameHebrew botId')
      .sort({ startTime: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Call.countDocuments(query);

    res.json({
      success: true,
      data: {
        calls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get calls error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get call details
 * GET /api/admin/calls/:id
 */
router.get('/calls/:id', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('business', 'name nameHebrew')
      .populate('reservation');

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.json({
      success: true,
      data: call
    });

  } catch (error) {
    logger.error('Get call error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get active calls
 * GET /api/admin/calls/active
 */
router.get('/active-calls', async (req, res) => {
  try {
    const activeCalls = callHandlerService.getActiveCalls();
    
    res.json({
      success: true,
      data: {
        count: activeCalls.length,
        calls: activeCalls
      }
    });

  } catch (error) {
    logger.error('Get active calls error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ERRORS MANAGEMENT
// ============================================

/**
 * Get all errors
 * GET /api/admin/errors
 */
router.get('/errors', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      businessId,
      category,
      severity,
      status
    } = req.query;

    const errors = await ErrorModel.getRecent({
      businessId,
      category,
      severity,
      status,
      limit: parseInt(limit)
    });

    const stats = await ErrorModel.getStats(businessId);

    res.json({
      success: true,
      data: {
        errors,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get errors error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update error status
 * PUT /api/admin/errors/:id
 */
router.put('/errors/:id', async (req, res) => {
  try {
    const { status, resolution } = req.body;

    const error = await ErrorModel.findByIdAndUpdate(
      req.params.id,
      {
        status,
        resolution,
        resolvedAt: status === 'resolved' ? new Date() : undefined,
        resolvedBy: status === 'resolved' ? req.user.id : undefined
      },
      { new: true }
    );

    if (!error) {
      return res.status(404).json({
        success: false,
        error: 'Error not found'
      });
    }

    res.json({
      success: true,
      data: error
    });

  } catch (error) {
    logger.error('Update error error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// USERS MANAGEMENT
// ============================================

/**
 * Get all users
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query;

    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .populate('businesses', 'name nameHebrew')
      .select('-refreshTokens')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create admin user
 * POST /api/admin/users
 */
router.post('/users', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role: role || 'client'
    });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ANALYTICS
// ============================================

/**
 * Get cost analytics
 * GET /api/admin/analytics/costs
 */
router.get('/analytics/costs', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const match = {};
    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) match.startTime.$gte = new Date(startDate);
      if (endDate) match.startTime.$lte = new Date(endDate);
    }

    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'week':
        dateFormat = '%Y-W%U';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    const costs = await Call.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$startTime' } },
          totalCost: { $sum: '$costs.total' },
          twilioCost: { $sum: '$costs.twilio' },
          googleCost: { $sum: { $add: ['$costs.googleSTT', '$costs.googleTTS'] } },
          openAICost: { $sum: '$costs.openAI' },
          calls: { $sum: 1 },
          minutes: { $sum: { $divide: ['$duration', 60] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get cost by business
    const costByBusiness = await Call.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$business',
          totalCost: { $sum: '$costs.total' },
          calls: { $sum: 1 },
          minutes: { $sum: { $divide: ['$duration', 60] } }
        }
      },
      {
        $lookup: {
          from: 'businesses',
          localField: '_id',
          foreignField: '_id',
          as: 'business'
        }
      },
      { $unwind: '$business' },
      {
        $project: {
          businessName: '$business.nameHebrew',
          totalCost: 1,
          calls: 1,
          minutes: 1
        }
      },
      { $sort: { totalCost: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        timeline: costs,
        byBusiness: costByBusiness
      }
    });

  } catch (error) {
    logger.error('Cost analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
