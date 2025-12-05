const fs = require('fs');
const content = fs.readFileSync('src/server.js', 'utf8');
const lines = content.split('\n');

// Find the line with app.use('/webhook'
let webhookLineIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("app.use('/webhook'")) {
    webhookLineIndex = i;
    break;
  }
}

// Find and remove the DIRECT TEST ROUTE at the end
let directRouteStart = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('// DIRECT TEST ROUTE')) {
    directRouteStart = i;
    break;
  }
}

if (directRouteStart > 0) {
  // Remove the route from the end (from // DIRECT TEST ROUTE to EOF)
  lines.splice(directRouteStart);
}

// Add the route BEFORE app.use('/webhook')
if (webhookLineIndex > 0) {
  const newRoute = `
// DIRECT TEST ROUTE - MUST BE BEFORE app.use('/webhook')
app.post('/webhook/voice/incoming', (req, res) => {
  console.log('🎯 DIRECT ROUTE HIT!');
  const twilio = require('twilio');
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Polly.Mia', language: 'he-IL' }, 'שלום זה בוט טסט');
  res.type('text/xml');
  res.send(twiml.toString());
});
`;
  lines.splice(webhookLineIndex, 0, newRoute);
  
  fs.writeFileSync('src/server.js', lines.join('\n'));
  console.log('✅ Route moved successfully!');
} else {
  console.log('❌ Could not find webhook line');
}
