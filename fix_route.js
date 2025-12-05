const fs = require('fs');
const content = fs.readFileSync('src/routes/webhook.routes.js', 'utf8');

// Find where to insert (after const validateTwilioRequest = ... };)
const lines = content.split('\n');
let insertIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('next();') && i > 10 && i < 100) {
    insertIndex = i + 2; // After next(); and };
    break;
  }
}

if (insertIndex > 0) {
  const newRoute = `
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
`;

  lines.splice(insertIndex, 0, newRoute);
  fs.writeFileSync('src/routes/webhook.routes.js', lines.join('\n'));
  console.log('✅ Route added successfully at line', insertIndex);
} else {
  console.log('❌ Could not find insertion point');
}
