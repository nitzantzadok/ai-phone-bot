/**
 * Services Index - Export all services
 */

const sttService = require('./stt.service');
const ttsService = require('./tts.service');
const gptService = require('./gpt.service');
const callHandlerService = require('./callHandler.service');
const sheetsService = require('./sheets.service');
const trainingPlanParser = require('./trainingPlan.parser');
const trainingPlanGenerator = require('./trainingPlan.generator');

module.exports = {
  sttService,
  ttsService,
  gptService,
  callHandlerService,
  sheetsService,
  trainingPlanParser,
  trainingPlanGenerator
};
