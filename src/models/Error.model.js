/**
 * Error Model - Centralized error tracking
 * Stores all errors for admin dashboard visibility
 */

const mongoose = require('mongoose');

const ErrorSchema = new mongoose.Schema({
  // Reference to business (if applicable)
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    index: true
  },
  botId: String,

  // Reference to call (if applicable)
  call: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call'
  },
  twilioCallSid: String,

  // Error Classification
  category: {
    type: String,
    enum: [
      'stt',           // Speech-to-Text errors
      'tts',           // Text-to-Speech errors  
      'gpt',           // OpenAI/GPT errors
      'twilio',        // Twilio API errors
      'database',      // MongoDB errors
      'authentication',// Auth errors
      'validation',    // Input validation errors
      'timeout',       // Timeout errors
      'network',       // Network/connectivity errors
      'billing',       // Billing/payment errors
      'system',        // General system errors
      'unknown'        // Unclassified errors
    ],
    required: true,
    index: true
  },

  // Severity Level
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    default: 'medium',
    index: true
  },

  // Error Details
  code: String,
  message: {
    type: String,
    required: true
  },
  stack: String,
  details: mongoose.Schema.Types.Mixed,

  // Context
  context: {
    endpoint: String,
    method: String,
    userAgent: String,
    ip: String,
    userId: mongoose.Schema.Types.ObjectId,
    requestBody: mongoose.Schema.Types.Mixed,
    additionalInfo: mongoose.Schema.Types.Mixed
  },

  // Resolution
  status: {
    type: String,
    enum: ['new', 'acknowledged', 'investigating', 'resolved', 'ignored'],
    default: 'new',
    index: true
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: String,

  // Auto-recovery
  autoRecovered: { type: Boolean, default: false },
  recoveryAction: String,

  // Notifications
  notificationSent: { type: Boolean, default: false },
  notificationSentAt: Date,

  // Grouping (for similar errors)
  fingerprint: {
    type: String,
    index: true
  },
  occurrenceCount: { type: Number, default: 1 },
  firstOccurrence: { type: Date, default: Date.now },
  lastOccurrence: { type: Date, default: Date.now }

}, {
  timestamps: true
});

// Indexes
ErrorSchema.index({ createdAt: -1 });
ErrorSchema.index({ category: 1, severity: 1 });
ErrorSchema.index({ business: 1, createdAt: -1 });
ErrorSchema.index({ status: 1, severity: 1 });

// Generate fingerprint for error grouping
ErrorSchema.pre('save', function(next) {
  if (!this.fingerprint) {
    // Create a fingerprint based on category, code, and first line of message
    const messageKey = this.message.split('\n')[0].substring(0, 100);
    this.fingerprint = `${this.category}-${this.code || 'no-code'}-${Buffer.from(messageKey).toString('base64').substring(0, 20)}`;
  }
  next();
});

// Static method to log error (with deduplication)
ErrorSchema.statics.logError = async function(errorData) {
  // Generate fingerprint
  const messageKey = errorData.message.split('\n')[0].substring(0, 100);
  const fingerprint = `${errorData.category}-${errorData.code || 'no-code'}-${Buffer.from(messageKey).toString('base64').substring(0, 20)}`;
  
  // Check for recent similar error (within last hour)
  const recentError = await this.findOne({
    fingerprint,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    status: { $ne: 'resolved' }
  });
  
  if (recentError) {
    // Update existing error
    recentError.occurrenceCount += 1;
    recentError.lastOccurrence = new Date();
    if (errorData.details) {
      recentError.details = { ...recentError.details, ...errorData.details };
    }
    return recentError.save();
  }
  
  // Create new error
  return this.create({
    ...errorData,
    fingerprint,
    firstOccurrence: new Date(),
    lastOccurrence: new Date()
  });
};

// Get error stats
ErrorSchema.statics.getStats = async function(businessId, startDate, endDate) {
  const match = {};
  
  if (businessId) match.business = businessId;
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalOccurrences: { $sum: '$occurrenceCount' },
        critical: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        },
        high: {
          $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] }
        },
        medium: {
          $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] }
        },
        low: {
          $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] }
        },
        resolved: {
          $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
        },
        unresolved: {
          $sum: { $cond: [{ $ne: ['$status', 'resolved'] }, 1, 0] }
        }
      }
    }
  ]);
  
  // Get errors by category
  const byCategory = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        occurrences: { $sum: '$occurrenceCount' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    summary: stats[0] || {
      total: 0,
      totalOccurrences: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      resolved: 0,
      unresolved: 0
    },
    byCategory
  };
};

// Get recent errors for dashboard
ErrorSchema.statics.getRecent = async function(options = {}) {
  const {
    businessId,
    limit = 50,
    status,
    severity,
    category
  } = options;
  
  const query = {};
  
  if (businessId) query.business = businessId;
  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (category) query.category = category;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('business', 'name nameHebrew')
    .populate('resolvedBy', 'firstName lastName');
};

module.exports = mongoose.model('Error', ErrorSchema);
