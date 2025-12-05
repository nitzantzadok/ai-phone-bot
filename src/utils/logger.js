/**
 * Logger Utility
 * Centralized logging with Winston
 */

const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ai-phone-bot' },
  transports: [
    // Console transport (always enabled)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  logger.add(new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));

  // Combined log file
  logger.add(new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }));
}

// Stream for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
