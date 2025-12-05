/**
 * Rate Limiter Middleware
 * Protects API endpoints from abuse
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for webhooks
    return req.path.startsWith('/webhook');
  }
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 login attempts per hour
  message: {
    success: false,
    error: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email
    });
    res.status(429).json(options.message);
  }
});

// Very strict limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 password reset requests per hour
  message: {
    success: false,
    error: 'Too many password reset attempts'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter
};
