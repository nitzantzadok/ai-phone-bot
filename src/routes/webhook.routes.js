/**
 * Webhook Routes - Twilio Integration
 * Handles all incoming Twilio webhooks
 */

const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const logger = require('../utils/logger');
const callHandlerService = require('../services/callHandler.service');
const { Business, Error: ErrorModel } = require('../models');

// Twilio request validation middleware
const validateTwilioRequest = (req, res, next) => {
  // Skip validation in development
  if (process.env.NODE_ENV === 'development') {
    return next();


// TEST ROUTE - Simple incoming call handler
router.post('/voice/incoming', async (req, res) => {
  try {
    logger.info('📞 Test call received!');
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Mia',
      language: 'he-IL'
    }, 'שלום! הבוט עובד בהצלחה!');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('✅ Test call handled successfully');
  } catch (error) {
    logger.error('❌ Test call error:', error);
    res.status(500).send('Error');
  }
});

// Simple test route - no botId required
router.post('/voice/incoming', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Mia',
      language: 'he-IL'
    }, 'שלום! זה בוט הבדיקה. המערכת עובדת בהצלחה!');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('Test call handled successfully');
  } catch (error) {
    logger.error('Test call error:', error);
    res.status(500).send('Error');
  }
});
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${process.env.API_URL}${req.originalUrl}`;
  
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    logger.warn('Invalid Twilio signature', { url });
    return res.status(403).send('Forbidden');
  }

  next();

// Simple test route - no botId required
router.post('/voice/incoming', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Mia',
      language: 'he-IL'
    }, 'שלום! זה בוט הבדיקה. המערכת עובדת בהצלחה!');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('Test call handled successfully');
  } catch (error) {
    logger.error('Test call error:', error);
    res.status(500).send('Error');
  }
});
};

// Set Socket.IO instance
router.use((req, res, next) => {
  const io = req.app.get('io');
  callHandlerService.setSocketIO(io);
  next();

// Simple test route - no botId required
router.post('/voice/incoming', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Mia',
      language: 'he-IL'
    }, 'שלום! זה בוט הבדיקה. המערכת עובדת בהצלחה!');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('Test call handled successfully');
  } catch (error) {
    logger.error('Test call error:', error);
    res.status(500).send('Error');
  }
});
});

/**
 * Handle incoming call
 * POST /webhook/:botId
 */
router.post('/:botId', validateTwilioRequest, async (req, res) => {
  const { botId } = req.params;
  
  try {
    // Find business by botId
    const business = await Business.findOne({ 
      botId, 
      isActive: true,
      isPaused: false 
    });

    if (!business) {
      logger.warn('Business not found or inactive', { botId });
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({
        language: 'he-IL'
      }, 'מצטערים, השירות אינו זמין כרגע.');
      twiml.hangup();
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Handle incoming call
    const twimlResponse = await callHandlerService.handleIncomingCall(req.body, business);
    
    res.type('text/xml');
    res.send(twimlResponse);

  } catch (error) {
    logger.error('Webhook error:', error);
    
    await ErrorModel.logError({
      category: 'twilio',
      severity: 'critical',
      message: error.message,
      stack: error.stack,
      details: { botId, body: req.body }
    });

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      language: 'he-IL'
    }, 'מצטערים, יש תקלה. נסו שוב.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Handle speech response
 * POST /webhook/:botId/respond
 */
router.post('/:botId/respond', validateTwilioRequest, async (req, res) => {
  const { botId } = req.params;
  
  try {
    const business = await Business.findOne({ botId, isActive: true });

    if (!business) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const twimlResponse = await callHandlerService.handleSpeechResponse(req.body, business);
    
    res.type('text/xml');
    res.send(twimlResponse);

  } catch (error) {
    logger.error('Respond webhook error:', error);
    
    await ErrorModel.logError({
      category: 'twilio',
      severity: 'high',
      message: error.message,
      details: { botId, body: req.body }
    });

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      language: 'he-IL',
      voice: 'Google.he-IL-Wavenet-A'
    }, 'סליחה, לא הבנתי. אפשר לחזור?');
    
    twiml.gather({
      input: 'speech',
      language: 'he-IL',
      action: `${process.env.API_URL}/webhook/${botId}/respond`,
      method: 'POST'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Handle timeout
 * POST /webhook/:botId/timeout
 */
router.post('/:botId/timeout', validateTwilioRequest, async (req, res) => {
  const { botId } = req.params;
  
  try {
    const business = await Business.findOne({ botId, isActive: true });
    const twimlResponse = await callHandlerService.handleTimeout(req.body, business);
    
    res.type('text/xml');
    res.send(twimlResponse);

  } catch (error) {
    logger.error('Timeout webhook error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Handle call end
 * POST /webhook/:botId/end
 */
router.post('/:botId/end', validateTwilioRequest, async (req, res) => {
  const { botId } = req.params;
  
  try {
    const business = await Business.findOne({ botId });
    const twimlResponse = await callHandlerService.handleCallEnd(
      req.body.CallSid, 
      'timeout',
      null,
      business
    );
    
    res.type('text/xml');
    res.send(twimlResponse);

  } catch (error) {
    logger.error('End webhook error:', error);
    
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Handle status callback
 * POST /webhook/:botId/status
 */
router.post('/:botId/status', validateTwilioRequest, async (req, res) => {
  try {
    await callHandlerService.handleStatusCallback(req.body);
    res.sendStatus(200);
  } catch (error) {
    logger.error('Status callback error:', error);
    res.sendStatus(200); // Always return 200 to Twilio
  }
});

/**
 * Handle recording callback (if enabled)
 * POST /webhook/:botId/recording
 */
router.post('/:botId/recording', validateTwilioRequest, async (req, res) => {
  const { RecordingSid, RecordingUrl, CallSid } = req.body;
  
  try {
    const { Call } = require('../models');
    await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      { 
        recordingSid: RecordingSid,
        recordingUrl: RecordingUrl 
      }
    );
    
    logger.info('Recording saved', { CallSid, RecordingSid });
    res.sendStatus(200);

  } catch (error) {
    logger.error('Recording callback error:', error);
    res.sendStatus(200);
  }
});

/**
 * Fallback webhook
 * POST /webhook/:botId/fallback
 */
router.post('/:botId/fallback', validateTwilioRequest, async (req, res) => {
  logger.warn('Fallback webhook triggered', { botId: req.params.botId, body: req.body });
  
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({
    language: 'he-IL'
  }, 'מצטערים, יש תקלה. אנא התקשרו שוב.');
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;
