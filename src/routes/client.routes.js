/**
 * Client Routes - Client Dashboard API
 * Access limited to businesses owned by the client
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Business, Call, Reservation, Error: ErrorModel } = require('../models');
const logger = require('../utils/logger');

// All client routes require authentication
router.use(auth);

// Middleware to verify business ownership
const verifyOwnership = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.body.businessId;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID is required'
      });
    }

    const business = await Business.findById(businessId);
    
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    // Check ownership (admin can access all)
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    req.business = business;
    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// DASHBOARD
// ============================================

/**
 * Get client dashboard overview
 * GET /api/client/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get all businesses owned by this client
    const businesses = await Business.find({ owner: req.user.id });

    if (businesses.length === 0) {
      return res.json({
        success: true,
        data: {
          businesses: [],
          summary: {
            totalCalls: 0,
            totalMinutes: 0,
            totalReservations: 0,
            totalCost: 0
          }
        }
      });
    }

    const businessIds = businesses.map(b => b._id);

    // Get aggregate stats across all businesses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [callStats, reservationStats] = await Promise.all([
      Call.aggregate([
        { 
          $match: { 
            business: { $in: businessIds },
            startTime: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalMinutes: { $sum: { $divide: ['$duration', 60] } },
            totalCost: { $sum: '$costs.total' }
          }
        }
      ]),
      Reservation.aggregate([
        {
          $match: {
            business: { $in: businessIds },
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            confirmed: {
              $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    const calls = callStats[0] || { totalCalls: 0, totalMinutes: 0, totalCost: 0 };
    const reservations = reservationStats[0] || { total: 0, confirmed: 0 };

    res.json({
      success: true,
      data: {
        businesses: businesses.map(b => ({
          id: b._id,
          name: b.nameHebrew,
          botId: b.botId,
          isActive: b.isActive,
          isPaused: b.isPaused,
          stats: b.stats
        })),
        summary: {
          totalCalls: calls.totalCalls,
          totalMinutes: Math.round(calls.totalMinutes),
          totalCost: Math.round(calls.totalCost * 100) / 100,
          totalReservations: reservations.total,
          confirmedReservations: reservations.confirmed
        }
      }
    });

  } catch (error) {
    logger.error('Client dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// BUSINESS MANAGEMENT
// ============================================

/**
 * Get business details
 * GET /api/client/businesses/:businessId
 */
router.get('/businesses/:businessId', verifyOwnership, async (req, res) => {
  try {
    const business = req.business;

    // Get recent stats
    const [callStats, todayReservations, missingInfo] = await Promise.all([
      Call.getBusinessStats(business._id),
      Reservation.getToday(business._id),
      business.missingInfo.filter(m => m.priority === 'high')
    ]);

    res.json({
      success: true,
      data: {
        business: {
          id: business._id,
          name: business.name,
          nameHebrew: business.nameHebrew,
          type: business.type,
          phone: business.phone,
          address: business.address,
          businessHours: business.businessHours,
          botPersonality: business.botPersonality,
          reservationSettings: business.reservationSettings,
          isActive: business.isActive,
          isPaused: business.isPaused,
          webhookUrl: business.webhookUrl,
          stats: business.stats,
          billing: {
            plan: business.billing.plan,
            minutesIncluded: business.billing.minutesIncluded,
            nextBillingDate: business.billing.nextBillingDate
          }
        },
        callStats,
        todayReservations,
        missingInfoSuggestions: missingInfo
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
 * Update business settings
 * PUT /api/client/businesses/:businessId
 */
router.put('/businesses/:businessId', verifyOwnership, async (req, res) => {
  try {
    // Fields clients can update
    const allowedFields = [
      'nameHebrew', 'description', 'descriptionHebrew',
      'phone', 'email', 'website', 'address',
      'businessHours', 'menuItems', 'menuCategories',
      'faqs', 'reservationSettings', 'botPersonality',
      'voiceConfig'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const business = await Business.findByIdAndUpdate(
      req.params.businessId,
      updates,
      { new: true, runValidators: true }
    );

    logger.info('Business updated by client', {
      businessId: business._id,
      userId: req.user.id
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

// ============================================
// RESERVATIONS
// ============================================

/**
 * Get reservations
 * GET /api/client/businesses/:businessId/reservations
 */
router.get('/businesses/:businessId/reservations', verifyOwnership, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      startDate,
      endDate
    } = req.query;

    const query = { business: req.business._id };
    
    if (status) query.status = status;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const reservations = await Reservation.find(query)
      .sort({ date: 1, time: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Reservation.countDocuments(query);
    const stats = await Reservation.getStats(req.business._id);

    res.json({
      success: true,
      data: {
        reservations,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get reservations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get today's reservations
 * GET /api/client/businesses/:businessId/reservations/today
 */
router.get('/businesses/:businessId/reservations/today', verifyOwnership, async (req, res) => {
  try {
    const reservations = await Reservation.getToday(req.business._id);

    res.json({
      success: true,
      data: reservations
    });

  } catch (error) {
    logger.error('Get today reservations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update reservation status
 * PUT /api/client/businesses/:businessId/reservations/:reservationId
 */
router.put('/businesses/:businessId/reservations/:reservationId', verifyOwnership, async (req, res) => {
  try {
    const { status, internalNotes, tableNumber, seatingArea } = req.body;

    const reservation = await Reservation.findOne({
      _id: req.params.reservationId,
      business: req.business._id
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    if (status) reservation.status = status;
    if (internalNotes) reservation.internalNotes = internalNotes;
    if (tableNumber) reservation.tableNumber = tableNumber;
    if (seatingArea) reservation.seatingArea = seatingArea;

    if (status === 'cancelled') {
      reservation.cancelledAt = new Date();
      reservation.cancelledBy = 'business';
      reservation.cancellationReason = req.body.cancellationReason;
    }

    if (status === 'completed') {
      reservation.departedAt = new Date();
    }

    await reservation.save();

    res.json({
      success: true,
      data: reservation
    });

  } catch (error) {
    logger.error('Update reservation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create manual reservation
 * POST /api/client/businesses/:businessId/reservations
 */
router.post('/businesses/:businessId/reservations', verifyOwnership, async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      date,
      time,
      partySize,
      specialRequests,
      seatingArea
    } = req.body;

    // Check availability
    const availability = await Reservation.checkAvailability(
      req.business._id,
      new Date(date),
      time,
      partySize
    );

    if (!availability.available) {
      return res.status(400).json({
        success: false,
        error: 'Time slot not available',
        data: availability
      });
    }

    const reservation = await Reservation.create({
      business: req.business._id,
      customerName,
      customerPhone,
      customerEmail,
      date: new Date(date),
      time,
      partySize,
      specialRequests,
      seatingArea,
      source: 'manual',
      status: 'confirmed'
    });

    res.status(201).json({
      success: true,
      data: reservation
    });

  } catch (error) {
    logger.error('Create reservation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// CALLS
// ============================================

/**
 * Get calls
 * GET /api/client/businesses/:businessId/calls
 */
router.get('/businesses/:businessId/calls', verifyOwnership, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate
    } = req.query;

    const query = { business: req.business._id };
    
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }

    const calls = await Call.find(query)
      .select('startTime duration status primaryIntent summaryHebrew costs.total hadErrors')
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
 * GET /api/client/businesses/:businessId/calls/:callId
 */
router.get('/businesses/:businessId/calls/:callId', verifyOwnership, async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.callId,
      business: req.business._id
    }).populate('reservation');

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

// ============================================
// ERRORS (Limited view for clients)
// ============================================

/**
 * Get errors for business
 * GET /api/client/businesses/:businessId/errors
 */
router.get('/businesses/:businessId/errors', verifyOwnership, async (req, res) => {
  try {
    const errors = await ErrorModel.find({
      business: req.business._id,
      severity: { $in: ['critical', 'high'] }
    })
    .select('category severity message createdAt status')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({
      success: true,
      data: errors
    });

  } catch (error) {
    logger.error('Get errors error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// MISSING INFO SUGGESTIONS
// ============================================

/**
 * Get AI-suggested missing information
 * GET /api/client/businesses/:businessId/missing-info
 */
router.get('/businesses/:businessId/missing-info', verifyOwnership, async (req, res) => {
  try {
    const business = req.business;
    
    // Get missing info sorted by priority
    const missingInfo = business.missingInfo
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    res.json({
      success: true,
      data: missingInfo
    });

  } catch (error) {
    logger.error('Get missing info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Dismiss missing info suggestion
 * DELETE /api/client/businesses/:businessId/missing-info/:infoId
 */
router.delete('/businesses/:businessId/missing-info/:infoId', verifyOwnership, async (req, res) => {
  try {
    await Business.findByIdAndUpdate(
      req.business._id,
      { $pull: { missingInfo: { _id: req.params.infoId } } }
    );

    res.json({
      success: true,
      message: 'Suggestion dismissed'
    });

  } catch (error) {
    logger.error('Dismiss missing info error:', error);
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
 * Get business analytics
 * GET /api/client/businesses/:businessId/analytics
 */
router.get('/businesses/:businessId/analytics', verifyOwnership, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const dailyStats = await Call.getDailyStats(req.business._id, parseInt(days));
    const reservationStats = await Reservation.getStats(req.business._id);
    const callStats = await Call.getBusinessStats(req.business._id);

    // Get intent distribution
    const intentDistribution = await Call.aggregate([
      { $match: { business: req.business._id } },
      { $group: { _id: '$primaryIntent', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        dailyStats,
        callStats,
        reservationStats,
        intentDistribution
      }
    });

  } catch (error) {
    logger.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
