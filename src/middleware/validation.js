/**
 * Validation Middleware
 * Request validation utilities
 */

const validator = require('validator');

/**
 * Validate request body against a schema
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip further validation if field is empty and not required
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // Type check
      if (rules.type) {
        switch (rules.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${field} must be a string`);
            }
            break;
          case 'number':
            if (typeof value !== 'number' && isNaN(Number(value))) {
              errors.push(`${field} must be a number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`${field} must be a boolean`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`${field} must be an array`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || Array.isArray(value)) {
              errors.push(`${field} must be an object`);
            }
            break;
        }
      }

      // Email validation
      if (rules.email && typeof value === 'string' && !validator.isEmail(value)) {
        errors.push(`${field} must be a valid email`);
      }

      // Phone validation (Israeli format)
      if (rules.phone && typeof value === 'string') {
        const phoneRegex = /^(\+972|0)([23489]|5[0-9]|77)[0-9]{7}$/;
        if (!phoneRegex.test(value.replace(/[-\s]/g, ''))) {
          errors.push(`${field} must be a valid Israeli phone number`);
        }
      }

      // Min length
      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }

      // Max length
      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      // Min value
      if (rules.min !== undefined && Number(value) < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }

      // Max value
      if (rules.max !== undefined && Number(value) > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      // Custom validation
      if (rules.custom && typeof rules.custom === 'function') {
        const customError = rules.custom(value, req.body);
        if (customError) {
          errors.push(customError);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
};

/**
 * Sanitize input to prevent XSS
 */
const sanitize = (obj) => {
  if (typeof obj === 'string') {
    return validator.escape(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitize(value);
    }
    return sanitized;
  }
  
  return obj;
};

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return /^[a-fA-F0-9]{24}$/.test(id);
};

/**
 * Validate date string
 */
const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Validate time string (HH:MM format)
 */
const isValidTime = (timeString) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString);
};

// Common validation schemas
const schemas = {
  login: {
    email: { required: true, email: true },
    password: { required: true, minLength: 8 }
  },
  register: {
    email: { required: true, email: true },
    password: { required: true, minLength: 8 },
    firstName: { required: true, minLength: 2, maxLength: 50 },
    lastName: { required: true, minLength: 2, maxLength: 50 }
  },
  createBusiness: {
    name: { required: true, minLength: 2, maxLength: 100 },
    nameHebrew: { required: true, minLength: 2, maxLength: 100 },
    phone: { required: true, phone: true },
    type: { 
      required: true, 
      enum: ['restaurant', 'cafe', 'bar', 'clinic', 'salon', 'hotel', 'service', 'other']
    }
  },
  createReservation: {
    customerName: { required: true, minLength: 2 },
    customerPhone: { required: true, phone: true },
    date: { required: true, custom: (v) => !isValidDate(v) ? 'Invalid date' : null },
    time: { required: true, custom: (v) => !isValidTime(v) ? 'Invalid time format' : null },
    partySize: { required: true, type: 'number', min: 1, max: 100 }
  }
};

module.exports = {
  validateRequest,
  sanitize,
  isValidObjectId,
  isValidDate,
  isValidTime,
  schemas
};
