/**
 * Call Model - Tracks all phone calls and their details
 * Used for analytics, billing, and debugging
 */

const mongoose = require('mongoose');

const ConversationTurnSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: String,
  contentHebrew: String,
  timestamp: { type: Date, default: Date.now },
  confidence: Number, // STT confidence
  duration: Number, // Duration of speech in ms
  tokens: Number, // Tokens used for this turn
  intent: String, // Detected intent
  entities: mongoose.Schema.Types.Mixed // Extracted entities
}, { _id: false });

const ErrorLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ['stt', 'tts', 'gpt', 'twilio', 'system', 'timeout', 'unknown']
  },
  code: String,
  message: String,
  details: mongoose.Schema.Types.Mixed,
  recovered: { type: Boolean, default: false }
}, { _id: false });

const CostBreakdownSchema = new mongoose.Schema({
  twilio: { type: Number, default: 0 },
  googleSTT: { type: Number, default: 0 },
  googleTTS: { type: Number, default: 0 },
  openAI: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const CallSchema = new mongoose.Schema({
  // Reference to business
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  botId: {
    type: String,
    required: true,
    index: true
  },

  // Twilio Call Details
  twilioCallSid: {
    type: String,
    unique: true,
    sparse: true
  },
  callerNumber: {
    type: String,
    required: true
  },
  calledNumber: String,
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: 'inbound'
  },

  // Call Status
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled'],
    default: 'initiated'
  },
  endReason: {
    type: String,
    enum: ['completed', 'caller-hangup', 'bot-hangup', 'error', 'timeout', 'transfer', 'unknown'],
    default: 'unknown'
  },

  // Timing
  startTime: {
    type: Date,
    default: Date.now
  },
  answerTime: Date,
  endTime: Date,
  duration: { type: Number, default: 0 }, // Total duration in seconds
  talkTime: { type: Number, default: 0 }, // Actual conversation time

  // Conversation
  conversation: [ConversationTurnSchema],
  turnCount: { type: Number, default: 0 },

  // AI Analysis
  summary: String,
  summaryHebrew: String,
  primaryIntent: {
    type: String,
    enum: ['reservation', 'inquiry', 'menu', 'hours', 'location', 'complaint', 'general', 'unknown'],
    default: 'unknown'
  },
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative', 'unknown'],
    default: 'unknown'
  },
  sentimentScore: Number, // -1 to 1
  customerSatisfaction: Number, // 1-5 estimated
  resolved: { type: Boolean, default: false },

  // Reservation (if created during call)
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation'
  },

  // Errors
  errors: [ErrorLogSchema],
  hadErrors: { type: Boolean, default: false },

  // Performance Metrics
  metrics: {
    avgResponseTime: Number, // Average AI response time in ms
    maxResponseTime: Number,
    sttAccuracy: Number, // Average STT confidence
    ttsCharacters: Number, // Total characters synthesized
    gptTokensInput: Number,
    gptTokensOutput: Number,
    gptModel: String
  },

  // Costs
  costs: {
    type: CostBreakdownSchema,
    default: () => ({})
  },

  // Missing Information Detected
  missingInfoDetected: [{
    field: String,
    context: String, // What the caller was asking about
    timestamp: Date
  }],

  // Recording (if enabled)
  recordingUrl: String,
  recordingSid: String,

  // Metadata
  userAgent: String,
  region: String,
  notes: String

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for common queries
CallSchema.index({ business: 1, startTime: -1 });
CallSchema.index({ botId: 1, startTime: -1 });
CallSchema.index({ twilioCallSid: 1 });
CallSchema.index({ status: 1 });
CallSchema.index({ startTime: -1 });
CallSchema.index({ 'costs.total': 1 });
CallSchema.index({ hadErrors: 1 });

// Virtual for formatted duration
CallSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Calculate costs before saving
CallSchema.pre('save', function(next) {
  if (this.isModified('duration') || this.isModified('metrics')) {
    const minutes = this.duration / 60;
    
    // Twilio cost
    this.costs.twilio = minutes * parseFloat(process.env.COST_PER_MINUTE_TWILIO || 0.02);
    
    // Google STT cost (per minute)
    this.costs.googleSTT = minutes * parseFloat(process.env.COST_PER_MINUTE_GOOGLE_STT || 0.016);
    
    // Google TTS cost (per character, estimated from minutes)
    const avgCharsPerMinute = 800;
    this.costs.googleTTS = (minutes * avgCharsPerMinute / 1000000) * 16; // $16 per million chars
    
    // OpenAI cost
    if (this.metrics) {
      const inputTokens = this.metrics.gptTokensInput || 0;
      const outputTokens = this.metrics.gptTokensOutput || 0;
      
      if (this.metrics.gptModel === 'gpt-4-turbo-preview') {
        this.costs.openAI = (inputTokens / 1000 * 0.01) + (outputTokens / 1000 * 0.03);
      } else {
        this.costs.openAI = ((inputTokens + outputTokens) / 1000) * 
          parseFloat(process.env.COST_PER_1K_TOKENS_GPT35 || 0.002);
      }
    }
    
    // Total cost in ILS (assuming conversion rate)
    const usdToIls = 3.7;
    this.costs.total = (this.costs.twilio + this.costs.googleSTT + 
                        this.costs.googleTTS + this.costs.openAI) * usdToIls;
  }
  
  // Check for errors
  this.hadErrors = this.errors && this.errors.length > 0;
  
  next();
});

// Static method to get aggregated stats for a business
CallSchema.statics.getBusinessStats = async function(businessId, startDate, endDate) {
  const match = { business: businessId };
  
  if (startDate || endDate) {
    match.startTime = {};
    if (startDate) match.startTime.$gte = startDate;
    if (endDate) match.startTime.$lte = endDate;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        totalCost: { $sum: '$costs.total' },
        avgDuration: { $avg: '$duration' },
        completedCalls: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        errorCalls: {
          $sum: { $cond: ['$hadErrors', 1, 0] }
        },
        reservationCalls: {
          $sum: { $cond: [{ $ne: ['$reservation', null] }, 1, 0] }
        },
        avgSentiment: { $avg: '$sentimentScore' }
      }
    }
  ]);
  
  return stats[0] || {
    totalCalls: 0,
    totalDuration: 0,
    totalCost: 0,
    avgDuration: 0,
    completedCalls: 0,
    errorCalls: 0,
    reservationCalls: 0,
    avgSentiment: 0
  };
};

// Static method to get daily stats
CallSchema.statics.getDailyStats = async function(businessId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        business: businessId,
        startTime: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } },
        calls: { $sum: 1 },
        duration: { $sum: '$duration' },
        cost: { $sum: '$costs.total' },
        errors: { $sum: { $cond: ['$hadErrors', 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('Call', CallSchema);
