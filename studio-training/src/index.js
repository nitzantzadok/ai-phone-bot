/**
 * נקודת הכניסה הציבורית של המערכת.
 * מערכת עצמאית לחלוטין — אין לה תלות בקוד או בנתונים של אף מערכת אחרת.
 */

export { EXERCISES, BY_ID, getExercise } from './domain/exercises.js';
export { CONSTRAINTS, CONSTRAINT_IDS, getConstraint } from './domain/constraints.js';
export * as taxonomy from './domain/taxonomy.js';
export { normalizeStudio, normalizeTrainee, validateInput, WEEK_DAYS, DAY_LABEL } from './domain/models.js';
export { generateWeeklyProgram } from './engine/generate.js';
export { chooseSplit, scheduleDays, DAY_ARCHETYPES } from './engine/split.js';
export { buildCandidatePool, constraintCheck, equipmentCheck, spaceCheck, skillCheck } from './engine/filters.js';
export { prescribe, weeklyVolumeTargets, recoveryScore, volumeMultiplier, isDeloadWeek } from './engine/prescription.js';
export { applyFeedback, advanceWeek, EVENT_TYPES, PAIN_TO_CONSTRAINT } from './engine/feedback.js';
export { buildProbes, applyProbeResult, probeAllowed } from './engine/probe.js';
export { normalizeCustomExercise } from './domain/models.js';
export { customToExercise } from './domain/exercises.js';
export { DESCRIPTIONS, describe } from './domain/descriptions.js';
export { nextTarget, needsDeload, loadIncrement } from './engine/progression.js';
export { planLoad, startingLoad, roundToIncrement, loadFamily } from './engine/loads.js';
export { applyNotes, normalizeNote, upsertNote, removeNote, DIRECTIVES, DIRECTIVE_TYPES } from './domain/notes.js';
export * from './domain/measurements.js';
export { achievableLoad, barbellLoads, barbellBreakdown, inventorySummary, defaultInventory, normalizeInventory } from './domain/inventory.js';
export { runQualityChecks } from './engine/validate.js';
export * from './domain/labels.js';
export { Db } from './store/db.js';

import { normalizeStudio, normalizeTrainee, validateInput } from './domain/models.js';
import { generateWeeklyProgram } from './engine/generate.js';

/**
 * יצירת תכנית שבועית מקלט גולמי — נרמול, אימות ויצירה בקריאה אחת.
 * @returns {{ok: boolean, program: object|null, errors: string[], warnings: string[]}}
 */
export function buildProgram(rawTrainee, rawStudio, opts = {}) {
  const studio = normalizeStudio(rawStudio);
  const trainee = normalizeTrainee(rawTrainee);
  const v = validateInput(trainee, studio);
  if (!v.ok) return { ok: false, program: null, errors: v.errors, warnings: v.warnings };
  const program = generateWeeklyProgram(trainee, studio, opts);
  program.warnings = v.warnings;
  return { ok: true, program, errors: [], warnings: v.warnings };
}

/** יצירת תכניות לכל מתאמני הסטודיו בבת אחת. */
export function buildStudioPrograms(rawTrainees, rawStudio, opts = {}) {
  const studio = normalizeStudio(rawStudio);
  const results = rawTrainees.map((rt) => {
    const trainee = normalizeTrainee(rt);
    const v = validateInput(trainee, studio);
    if (!v.ok) return { traineeId: trainee.id, name: trainee.name, ok: false, errors: v.errors, warnings: v.warnings, program: null };
    const program = generateWeeklyProgram(trainee, studio, opts);
    program.warnings = v.warnings;
    return { traineeId: trainee.id, name: trainee.name, ok: true, errors: [], warnings: v.warnings, program };
  });
  return {
    studio: { id: studio.id, name: studio.name },
    generatedAt: new Date().toISOString(),
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    qaFailed: results.filter((r) => r.program && !r.program.qa.passed).length,
    results,
  };
}
