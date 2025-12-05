/**
 * Reservation Model - Handles all bookings made through the AI bot
 */

const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema({
  // Reference to business
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },

  // Reference to the call that created this reservation
  call: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call'
  },

  // Reservation Details
  reservationNumber: {
    type: String,
    unique: true
  },
  
  // Customer Information
  customerName: {
    type: String,
    required: [true, 'Customer name is required']
  },
  customerPhone: {
    type: String,
    required: [true, 'Customer phone is required']
  },
  customerEmail: String,
  
  // Booking Details
  date: {
    type: Date,
    required: [true, 'Reservation date is required'],
    index: true
  },
  time: {
    type: String,
    required: [true, 'Reservation time is required']
  },
  partySize: {
    type: Number,
    required: [true, 'Party size is required'],
    min: 1,
    max: 100
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'pending'
  },
  
  // Special Requests
  specialRequests: String,
  dietaryRestrictions: [String],
  occasion: {
    type: String,
    enum: ['birthday', 'anniversary', 'business', 'date', 'family', 'other', 'none'],
    default: 'none'
  },
  
  // Table Assignment (for restaurant use)
  tableNumber: String,
  seatingArea: {
    type: String,
    enum: ['indoor', 'outdoor', 'bar', 'private', 'any'],
    default: 'any'
  },
  
  // Notifications
  confirmationSent: { type: Boolean, default: false },
  confirmationSentAt: Date,
  reminderSent: { type: Boolean, default: false },
  reminderSentAt: Date,
  
  // Source
  source: {
    type: String,
    enum: ['ai-bot', 'manual', 'website', 'app', 'walk-in'],
    default: 'ai-bot'
  },
  
  // Internal Notes
  internalNotes: String,
  
  // Cancellation
  cancelledAt: Date,
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['customer', 'business', 'system'],
  },

  // Timestamps for arrival
  arrivedAt: Date,
  seatedAt: Date,
  departedAt: Date

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
ReservationSchema.index({ business: 1, date: 1 });
ReservationSchema.index({ customerPhone: 1 });
ReservationSchema.index({ reservationNumber: 1 });
ReservationSchema.index({ status: 1 });

// Generate reservation number before saving
ReservationSchema.pre('save', async function(next) {
  if (!this.reservationNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.reservationNumber = `RES-${dateStr}-${random}`;
  }
  next();
});

// Virtual for formatted date
ReservationSchema.virtual('formattedDate').get(function() {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'Asia/Jerusalem'
  };
  return this.date.toLocaleDateString('he-IL', options);
});

// Virtual for formatted date in English
ReservationSchema.virtual('formattedDateEn').get(function() {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'Asia/Jerusalem'
  };
  return this.date.toLocaleDateString('en-IL', options);
});

// Check for conflicts
ReservationSchema.statics.checkAvailability = async function(businessId, date, time, partySize) {
  const Business = require('./Business.model');
  const business = await Business.findById(businessId);
  
  if (!business) {
    throw new Error('Business not found');
  }
  
  // Get reservations for the same date and time slot
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existingReservations = await this.find({
    business: businessId,
    date: { $gte: startOfDay, $lte: endOfDay },
    time: time,
    status: { $in: ['pending', 'confirmed'] }
  });
  
  // Simple availability check - can be made more sophisticated
  const totalGuests = existingReservations.reduce((sum, res) => sum + res.partySize, 0);
  
  // Assume maximum capacity per time slot (this should be configurable per business)
  const maxCapacityPerSlot = 50;
  
  return {
    available: (totalGuests + partySize) <= maxCapacityPerSlot,
    currentBookings: existingReservations.length,
    currentGuests: totalGuests,
    remainingCapacity: maxCapacityPerSlot - totalGuests
  };
};

// Get upcoming reservations for a business
ReservationSchema.statics.getUpcoming = async function(businessId, limit = 20) {
  const now = new Date();
  
  return this.find({
    business: businessId,
    date: { $gte: now },
    status: { $in: ['pending', 'confirmed'] }
  })
  .sort({ date: 1, time: 1 })
  .limit(limit);
};

// Get today's reservations
ReservationSchema.statics.getToday = async function(businessId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    business: businessId,
    date: { $gte: startOfDay, $lte: endOfDay }
  })
  .sort({ time: 1 });
};

// Get reservation stats
ReservationSchema.statics.getStats = async function(businessId, startDate, endDate) {
  const match = { business: businessId };
  
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = startDate;
    if (endDate) match.date.$lte = endDate;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        confirmed: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
        },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        noShow: {
          $sum: { $cond: [{ $eq: ['$status', 'no-show'] }, 1, 0] }
        },
        totalGuests: { $sum: '$partySize' },
        avgPartySize: { $avg: '$partySize' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    totalGuests: 0,
    avgPartySize: 0
  };
};

module.exports = mongoose.model('Reservation', ReservationSchema);
