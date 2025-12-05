/**
 * Services Index - Export all services
 */

const sttService = require('./stt.service');
const ttsService = require('./tts.service');
const gptService = require('./gpt.service');
const callHandlerService = require('./callHandler.service');

module.exports = {
  sttService,
  ttsService,
  gptService,
  callHandlerService
};
