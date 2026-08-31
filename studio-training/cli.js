#!/usr/bin/env node
/**
 * כלי שורת פקודה: הצגת תכניות בטקסט קריא, ללא שרת ובלי דפדפן.
 *
 *   node cli.js demo               — תכנית לכל מתאמני הדמו
 *   node cli.js plan <traineeId>   — תכנית למתאמן מהמסד
 *   node cli.js studio <studioId>  — תכניות לכל מתאמני הסטודיו
 *   node cli.js json <traineeId>   — פלט JSON מלא
 */

import { buildProgram, Db, normalizeTrainee } from './src/index.js';
import { STUDIOS, TRAINEES } from './src/seed.js';

const LEVEL_MARK = { error: '✖', warning: '▲', info: 'ℹ' };

function printProgram(p) {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`${p.traineeName} — שבוע ${p.week} | מטרה: ${p.meta.goalLabel} | רמה: ${p.meta.level}`);
  console.log(`חלוקה: ${p.meta.split} — ${p.meta.splitReason}`);
  console.log(`${p.meta.daysPerWeek} ימים × ${p.meta.sessionMinutes} דק' | התאוששות ${(p.meta.recoveryScore * 100).toFixed(0)}%` +
    `${p.meta.deload ? ' | שבוע הורדת עומס' : ''} | ציון איכות ${p.qa.score}`);

  if (p.constraints.length) {
    console.log('\nמגבלות:');
    for (const c of p.constraints) console.log(`  • ${c.name} (${c.severity}) — ${c.note}`);
  }

  for (const d of p.days) {
    console.log(`\n▌ ${d.dayLabel} — ${d.label}  (${d.blocks.length} תרגילים, ~${d.estimatedMinutes} דק')`);
    d.blocks.forEach((b, i) => {
      const rx = b.prescription;
      const unit = rx.unit === 'seconds' ? '' : ' חזרות';
      console.log(`  ${String(i + 1).padStart(2)}. ${b.exercise.name}` +
        `  —  ${rx.sets}×${rx.reps}${unit} | מנוחה ${rx.restSec}שנ׳ | RIR ${rx.rir}` +
        `${b.setType === 'superset' ? ' | סופרסט' : ''}`);
      console.log(`      ציוד: ${b.exercise.equipment.join(' + ')} | ${b.slotLabel || b.role}`);
      if (b.coachingNotes.length) console.log(`      · ${b.coachingNotes.join(' · ')}`);
      if (b.alternatives.length) console.log(`      חלופות: ${b.alternatives.map((a) => a.name).join(' | ')}`);
    });
  }

  if (p.qa.issues.length) {
    console.log('\nבקרת איכות:');
    for (const i of p.qa.issues) console.log(`  ${LEVEL_MARK[i.level]} ${i.message}`);
  }
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'demo') {
  for (const t of TRAINEES) {
    const r = buildProgram(t, STUDIOS.find((s) => s.id === t.studioId));
    r.ok ? printProgram(r.program) : console.error(`${t.name}: ${r.errors.join(', ')}`);
  }
} else if (cmd === 'plan' || cmd === 'json') {
  const db = new Db();
  const t = db.getTrainee(arg) || TRAINEES.find((x) => x.id === arg);
  if (!t) { console.error('מתאמן לא נמצא. הרץ קודם: npm run seed'); process.exit(1); }
  const studio = db.getStudio(t.studioId) || STUDIOS.find((s) => s.id === t.studioId);
  const r = buildProgram(t, studio);
  if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }
  cmd === 'json' ? console.log(JSON.stringify(r.program, null, 2)) : printProgram(r.program);
} else if (cmd === 'studio') {
  const db = new Db();
  const studio = db.getStudio(arg) || STUDIOS.find((s) => s.id === arg);
  if (!studio) { console.error('סטודיו לא נמצא'); process.exit(1); }
  const trainees = db.listTrainees(studio.id).length ? db.listTrainees(studio.id) : TRAINEES.filter((t) => t.studioId === studio.id);
  for (const t of trainees) {
    const r = buildProgram(t, studio);
    r.ok ? printProgram(r.program) : console.error(`${normalizeTrainee(t).name}: ${r.errors.join(', ')}`);
  }
} else {
  console.log(`שימוש:
  node cli.js demo               תכניות לכל מתאמני הדמו
  node cli.js plan <traineeId>   תכנית למתאמן
  node cli.js studio <studioId>  תכניות לכל מתאמני הסטודיו
  node cli.js json <traineeId>   פלט JSON מלא`);
}
