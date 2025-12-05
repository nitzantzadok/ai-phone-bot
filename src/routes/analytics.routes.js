/**
 * Analytics Routes
 * Advanced analytics and reporting
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Business, Call, Reservation, Error: ErrorModel } = require('../models');
const logger = require('../utils/logger');

router.use(auth);

/**
 * Get overall system analytics (admin only)
 * GET /api/analytics/system
 */
router.get('/system', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  try {
    const { startDate, endDate } = req.query;
    
    const match = {};
    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) match.startTime.$gte = new Date(startDate);
      if (endDate) match.startTime.$lte = new Date(endDate);
    }

    // Overall stats
    const [
      callStats,
      hourlyDistribution,
      intentDistribution,
      errorStats,
      topBusinesses
    ] = await Promise.all([
      // Total call stats
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalMinutes: { $sum: { $divide: ['$duration', 60] } },
            totalCost: { $sum: '$costs.total' },
            avgDuration: { $avg: '$duration' },
            successfulCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            failedCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        }
      ]),
      
      // Hourly distribution
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $hour: '$startTime' },
            calls: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Intent distribution
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$primaryIntent',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // Error stats
      ErrorModel.getStats(null, 
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      ),
      
      // Top businesses by calls
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$business',
            calls: { $sum: 1 },
            minutes: { $sum: { $divide: ['$duration', 60] } },
            cost: { $sum: '$costs.total' }
          }
        },
        { $sort: { calls: -1 } },
        { $limit: 10 },
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
            calls: 1,
            minutes: 1,
            cost: 1
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        overview: callStats[0] || {
          totalCalls: 0,
          totalMinutes: 0,
          totalCost: 0,
          avgDuration: 0,
          successfulCalls: 0,
          failedCalls: 0
        },
        hourlyDistribution,
        intentDistribution,
        errorStats,
        topBusinesses
      }
    });

  } catch (error) {
    logger.error('System analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get business performance comparison (admin only)
 * GET /api/analytics/comparison
 */
router.get('/comparison', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  try {
    const businesses = await Business.find({ isActive: true })
      .select('nameHebrew stats billing.plan');

    const comparison = businesses.map(b => ({
      name: b.nameHebrew,
      plan: b.billing?.plan || 'starter',
      totalCalls: b.stats?.totalCalls || 0,
      totalMinutes: b.stats?.totalMinutes || 0,
      totalReservations: b.stats?.totalReservations || 0,
      avgCallDuration: b.stats?.avgCallDuration || 0,
      successRate: b.stats?.successRate || 0
    }));

    // Sort by total calls
    comparison.sort((a, b) => b.totalCalls - a.totalCalls);

    res.json({
      success: true,
      data: comparison
    });

  } catch (error) {
    logger.error('Comparison analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cost breakdown
 * GET /api/analytics/costs
 */
router.get('/costs', async (req, res) => {
  try {
    const { businessId, startDate, endDate, groupBy = 'day' } = req.query;

    // Build match query
    const match = {};
    
    // For non-admin users, only show their businesses
    if (req.user.role !== 'admin') {
      const userBusinesses = await Business.find({ owner: req.user.id }).select('_id');
      match.business = { $in: userBusinesses.map(b => b._id) };
    } else if (businessId) {
      match.business = businessId;
    }

    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) match.startTime.$gte = new Date(startDate);
      if (endDate) match.startTime.$lte = new Date(endDate);
    }

    // Date grouping format
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'week':
        dateFormat = '%Y-W%V';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    const costTimeline = await Call.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$startTime' } },
          totalCost: { $sum: '$costs.total' },
          twilioCost: { $sum: '$costs.twilio' },
          googleSTTCost: { $sum: '$costs.googleSTT' },
          googleTTSCost: { $sum: '$costs.googleTTS' },
          openAICost: { $sum: '$costs.openAI' },
          calls: { $sum: 1 },
          minutes: { $sum: { $divide: ['$duration', 60] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate totals
    const totals = costTimeline.reduce((acc, item) => ({
      totalCost: acc.totalCost + item.totalCost,
      twilioCost: acc.twilioCost + item.twilioCost,
      googleSTTCost: acc.googleSTTCost + item.googleSTTCost,
      googleTTSCost: acc.googleTTSCost + item.googleTTSCost,
      openAICost: acc.openAICost + item.openAICost,
      calls: acc.calls + item.calls,
      minutes: acc.minutes + item.minutes
    }), {
      totalCost: 0, twilioCost: 0, googleSTTCost: 0,
      googleTTSCost: 0, openAICost: 0, calls: 0, minutes: 0
    });

    // Calculate cost per minute
    totals.costPerMinute = totals.minutes > 0 
      ? totals.totalCost / totals.minutes 
      : 0;

    res.json({
      success: true,
      data: {
        timeline: costTimeline,
        totals: {
          ...totals,
          totalCost: Math.round(totals.totalCost * 100) / 100,
          costPerMinute: Math.round(totals.costPerMinute * 1000) / 1000
        }
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

/**
 * Get conversation quality metrics
 * GET /api/analytics/quality
 */
router.get('/quality', async (req, res) => {
  try {
    const { businessId, startDate, endDate } = req.query;

    const match = {};
    
    if (req.user.role !== 'admin') {
      const userBusinesses = await Business.find({ owner: req.user.id }).select('_id');
      match.business = { $in: userBusinesses.map(b => b._id) };
    } else if (businessId) {
      match.business = businessId;
    }

    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) match.startTime.$gte = new Date(startDate);
      if (endDate) match.startTime.$lte = new Date(endDate);
    }

    const [qualityStats, sentimentDistribution] = await Promise.all([
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            avgTurns: { $avg: '$turnCount' },
            avgResponseTime: { $avg: '$metrics.avgResponseTime' },
            avgSTTAccuracy: { $avg: '$metrics.sttAccuracy' },
            avgSentiment: { $avg: '$sentimentScore' },
            resolvedCalls: {
              $sum: { $cond: ['$resolved', 1, 0] }
            },
            totalCalls: { $sum: 1 },
            callsWithErrors: {
              $sum: { $cond: ['$hadErrors', 1, 0] }
            }
          }
        }
      ]),
      
      Call.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$sentiment',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats = qualityStats[0] || {
      avgTurns: 0,
      avgResponseTime: 0,
      avgSTTAccuracy: 0,
      avgSentiment: 0,
      resolvedCalls: 0,
      totalCalls: 0,
      callsWithErrors: 0
    };

    res.json({
      success: true,
      data: {
        avgTurnsPerCall: Math.round(stats.avgTurns * 10) / 10,
        avgResponseTimeMs: Math.round(stats.avgResponseTime),
        avgSTTAccuracy: Math.round(stats.avgSTTAccuracy * 100),
        avgSentimentScore: Math.round(stats.avgSentiment * 100) / 100,
        resolutionRate: stats.totalCalls > 0 
          ? Math.round(stats.resolvedCalls / stats.totalCalls * 100) 
          : 0,
        errorRate: stats.totalCalls > 0
          ? Math.round(stats.callsWithErrors / stats.totalCalls * 100)
          : 0,
        sentimentDistribution: sentimentDistribution.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    logger.error('Quality analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Export analytics data
 * GET /api/analytics/export
 */
router.get('/export', async (req, res) => {
  try {
    const { businessId, startDate, endDate, format = 'json' } = req.query;

    const match = {};
    
    if (req.user.role !== 'admin') {
      const userBusinesses = await Business.find({ owner: req.user.id }).select('_id');
      match.business = { $in: userBusinesses.map(b => b._id) };
    } else if (businessId) {
      match.business = businessId;
    }

    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) match.startTime.$gte = new Date(startDate);
      if (endDate) match.startTime.$lte = new Date(endDate);
    }

    const calls = await Call.find(match)
      .populate('business', 'name nameHebrew')
      .select('startTime duration status primaryIntent costs.total summaryHebrew')
      .sort({ startTime: -1 })
      .limit(1000);

    if (format === 'csv') {
      const csv = [
        'Date,Business,Duration (s),Status,Intent,Cost (ILS),Summary',
        ...calls.map(c => [
          c.startTime.toISOString(),
          `"${c.business?.nameHebrew || 'N/A'}"`,
          c.duration,
          c.status,
          c.primaryIntent,
          c.costs?.total?.toFixed(2) || '0',
          `"${(c.summaryHebrew || '').replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=calls-export.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: {
        exportedAt: new Date(),
        count: calls.length,
        calls
      }
    });

  } catch (error) {
    logger.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
