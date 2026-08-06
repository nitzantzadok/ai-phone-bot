#!/usr/bin/env node
/**
 * Weekly Training Plan Generator - CLI
 *
 * Reads every trainee tab from the training spreadsheet, analyzes the
 * working weights and coaching notes across all months, and produces next
 * week's plan for each trainee.
 *
 * Usage:
 *   node src/scripts/generateWeeklyPlans.js                 # dry run, prints to console
 *   node src/scripts/generateWeeklyPlans.js --write         # writes a new tab per trainee
 *   node src/scripts/generateWeeklyPlans.js --trainee "דני" # single trainee
 *   node src/scripts/generateWeeklyPlans.js --json out.json # dump structured output
 *
 * Env:
 *   TRAINING_SHEET_ID              spreadsheet id (from its URL)
 *   TRAINING_SHEET_SKIP_TABS       comma separated tab titles to ignore
 *   GOOGLE_SERVICE_ACCOUNT_JSON    service account key as inline JSON
 *   GOOGLE_APPLICATION_CREDENTIALS path to the service account key file
 */

require('dotenv').config();

const fs = require('fs');
const sheetsService = require('../services/sheets.service');
const { parseTraineeTab } = require('../services/trainingPlan.parser');
const {
  generateWeeklyPlan,
  summarizePlan,
  planToGrid
} = require('../services/trainingPlan.generator');

function parseArgs(argv) {
  const args = { write: false, trainee: null, json: null, sheetId: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') args.write = true;
    else if (arg === '--trainee') args.trainee = argv[++i];
    else if (arg === '--json') args.json = argv[++i];
    else if (arg === '--sheet') args.sheetId = argv[++i];
  }

  return args;
}

/**
 * Tabs that hold reference data rather than a trainee's plan.
 */
function skipTabs() {
  const configured = (process.env.TRAINING_SHEET_SKIP_TABS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return new Set(['הוראות', 'תבנית', 'מאגר תרגילים', 'template', 'instructions', ...configured]);
}

/**
 * Tabs this script generated on a previous run should not be re-read as
 * trainee history.
 */
function isGeneratedTab(title) {
  return /^תכנית שבועית/.test(title);
}

function formatWeekLabel(date = new Date()) {
  const nextMonday = new Date(date);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);

  const dd = String(nextMonday.getDate()).padStart(2, '0');
  const mm = String(nextMonday.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

function printPlan(plan, summary) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`מתאמן: ${plan.trainee}`);
  console.log(`בסיס: ${plan.basedOnMonth || '-'} | חודשים שנותחו: ${(plan.monthsAnalyzed || []).join(', ')}`);
  if (summary) console.log(`\n${summary}`);

  plan.workouts.forEach((workout) => {
    console.log(`\n${workout.label}`);
    if (workout.notes.length) console.log(`  דגשים: ${workout.notes.join(' | ')}`);
    workout.exercises.forEach((exercise) => {
      const prev = exercise.previousWeight ? ` (קודם: ${exercise.previousWeight})` : '';
      console.log(`  ${exercise.name} - ${exercise.sets}x${exercise.reps} @ ${exercise.display}${prev}`);
      console.log(`      ${exercise.rationale}`);
    });
  });

  if (plan.warnings.length) {
    console.log(`\n אזהרות: ${plan.warnings.join(' | ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skip = skipTabs();
  const weekLabel = formatWeekLabel();

  const tabs = await sheetsService.listTabs(args.sheetId);
  const traineeTabs = tabs.filter(
    (tab) => !skip.has(tab.title) && !isGeneratedTab(tab.title) &&
      (!args.trainee || tab.title === args.trainee)
  );

  if (!traineeTabs.length) {
    console.error('לא נמצאו לשוניות של מתאמנים');
    process.exit(1);
  }

  console.log(`נמצאו ${traineeTabs.length} מתאמנים: ${traineeTabs.map((t) => t.title).join(', ')}`);

  const results = [];

  for (const tab of traineeTabs) {
    const grid = await sheetsService.readTab(tab.title, args.sheetId);
    const trainee = parseTraineeTab(tab.title, grid);
    const plan = generateWeeklyPlan(trainee);
    const summary = await summarizePlan(plan);

    printPlan(plan, summary);
    results.push({ plan, summary });

    if (args.write && plan.workouts.length) {
      const tabTitle = `תכנית שבועית ${weekLabel} - ${tab.title}`;
      await sheetsService.writeTab(tabTitle, planToGrid(plan, summary), args.sheetId);
      console.log(`\n נכתב ללשונית: ${tabTitle}`);
    }
  }

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nנשמר JSON: ${args.json}`);
  }

  if (!args.write) {
    console.log('\nהרצה יבשה בלבד. להוספת הלשוניות לגיליון הרץ עם --write');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('שגיאה:', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, formatWeekLabel, isGeneratedTab, skipTabs };
