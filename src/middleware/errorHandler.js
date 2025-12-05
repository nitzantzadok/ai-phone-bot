/**
 * Global Error Handler Middleware
 */

const logger = require('../utils/logger');
const { Error: ErrorModel } = require('../models');

const errorHandler = async (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Log to database for critical errors
  if (err.status >= 500 || !err.status) {
    try {
      await ErrorModel.logError({
        category: 'system',
        severity: 'high',
        message: err.message,
        stack: err.stack,
        context: {
          endpoint: req.originalUrl,
          method: req.method,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          userId: req.user?.id
        }
      });
    } catch (logError) {
      logger.error('Failed to log error to database:', logError);
    }
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: messages
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: `Duplicate value for field: ${field}`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Default error response
  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
