/**
 * Bot Routes - Bot management and configuration
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Business } = require('../models');
const ttsService = require('../services/tts.service');
const logger = require('../utils/logger');

router.use(auth);

/**
 * Test bot TTS
 * POST /api/bots/:botId/test-tts
 */
router.post('/:botId/test-tts', async (req, res) => {
  try {
    const { text } = req.body;
    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Check ownership
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const audioBuffer = await ttsService.synthesize(text, {
      businessId: business._id,
      gender: business.botPersonality?.gender,
      speakingRate: business.voiceConfig?.speakingRate,
      pitch: business.voiceConfig?.pitch
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length
    });
    res.send(audioBuffer);

  } catch (error) {
    logger.error('Test TTS error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get bot configuration
 * GET /api/bots/:botId/config
 */
router.get('/:botId/config', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId })
      .select('botPersonality voiceConfig aiConfig reservationSettings faqs');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Check ownership
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        botPersonality: business.botPersonality,
        voiceConfig: business.voiceConfig,
        aiConfig: business.aiConfig,
        reservationSettings: business.reservationSettings,
        faqCount: business.faqs?.length || 0
      }
    });

  } catch (error) {
    logger.error('Get bot config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update bot personality
 * PUT /api/bots/:botId/personality
 */
router.put('/:botId/personality', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Check ownership
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const allowedFields = [
      'name', 'gender', 'tone', 'greetingMessage',
      'goodbyeMessage', 'holdMessage', 'notUnderstoodMessage',
      'customInstructions'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        business.botPersonality[field] = req.body[field];
      }
    }

    await business.save();

    res.json({
      success: true,
      data: business.botPersonality
    });

  } catch (error) {
    logger.error('Update personality error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update voice configuration
 * PUT /api/bots/:botId/voice
 */
router.put('/:botId/voice', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Check ownership
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { speakingRate, pitch, voiceName } = req.body;

    if (speakingRate !== undefined) {
      business.voiceConfig.speakingRate = Math.max(0.5, Math.min(2.0, speakingRate));
    }
    if (pitch !== undefined) {
      business.voiceConfig.pitch = Math.max(-10, Math.min(10, pitch));
    }
    if (voiceName) {
      business.voiceConfig.voiceName = voiceName;
    }

    await business.save();

    res.json({
      success: true,
      data: business.voiceConfig
    });

  } catch (error) {
    logger.error('Update voice error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Manage FAQs
 * GET /api/bots/:botId/faqs
 */
router.get('/:botId/faqs', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId })
      .select('faqs');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    res.json({
      success: true,
      data: business.faqs
    });

  } catch (error) {
    logger.error('Get FAQs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add FAQ
 * POST /api/bots/:botId/faqs
 */
router.post('/:botId/faqs', async (req, res) => {
  try {
    const { question, answer, keywords } = req.body;

    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Check ownership
    if (req.user.role !== 'admin' && 
        business.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    business.faqs.push({
      question,
      answer,
      keywords: keywords || [],
      isAutoGenerated: false
    });

    await business.save();

    res.status(201).json({
      success: true,
      data: business.faqs[business.faqs.length - 1]
    });

  } catch (error) {
    logger.error('Add FAQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update FAQ
 * PUT /api/bots/:botId/faqs/:faqId
 */
router.put('/:botId/faqs/:faqId', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    const faq = business.faqs.id(req.params.faqId);
    if (!faq) {
      return res.status(404).json({
        success: false,
        error: 'FAQ not found'
      });
    }

    const { question, answer, keywords } = req.body;
    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (keywords) faq.keywords = keywords;

    await business.save();

    res.json({
      success: true,
      data: faq
    });

  } catch (error) {
    logger.error('Update FAQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete FAQ
 * DELETE /api/bots/:botId/faqs/:faqId
 */
router.delete('/:botId/faqs/:faqId', async (req, res) => {
  try {
    const business = await Business.findOne({ botId: req.params.botId });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    business.faqs.pull(req.params.faqId);
    await business.save();

    res.json({
      success: true,
      message: 'FAQ deleted'
    });

  } catch (error) {
    logger.error('Delete FAQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get TTS cache stats
 * GET /api/bots/cache-stats
 */
router.get('/cache-stats', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  const stats = ttsService.getCacheStats();
  
  res.json({
    success: true,
    data: stats
  });
});

module.exports = router;
