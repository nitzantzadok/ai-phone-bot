const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const logger = require('../utils/logger');

// Simple incoming call handler - no botId required
router.post('/', async (req, res) => {
  try {
    logger.info('📞 Incoming call received!');
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Mia',
      language: 'he-IL'
    }, 'שלום! ברוכים הבאים לבוט הטלפוני. המערכת עובדת בהצלחה!');
    
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('✅ Call handled successfully');
  } catch (error) {
    logger.error('❌ Call error:', error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Error occurred');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

module.exports = router;
