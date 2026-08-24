/**
 * נתוני דמו: שלושה סטודיואים בעלי ציוד שונה לחלוטין, ומתאמנים מגוונים.
 * מטרתם להוכיח שהמנוע מתמודד עם כל שילוב — מסטודיו בוטיק עם גומיות
 * ועד חדר כושר מלא — ועם מגוון פציעות, מטרות ורמות.
 */

import { Db } from './store/db.js';

export const STUDIOS = [
  {
    id: 'full_gym',
    name: 'סטודיו פול-ג׳ים',
    style: 'gym',
    concurrentTrainees: 3,
    sessionMinutes: 60,
    equipment: [
      { item: 'barbell', count: 3 }, { item: 'dumbbell', count: 20 }, { item: 'kettlebell', count: 8 },
      { item: 'ez_bar', count: 2 }, { item: 'bench_flat', count: 3 }, { item: 'bench_incline', count: 2 },
      { item: 'squat_rack', count: 2 }, { item: 'power_rack', count: 1 }, { item: 'smith_machine', count: 1 },
      { item: 'cable_crossover', count: 2 }, { item: 'lat_pulldown', count: 1 }, { item: 'seated_row_machine', count: 1 },
      { item: 'chest_press_machine', count: 1 }, { item: 'shoulder_press_machine', count: 1 }, { item: 'pec_deck', count: 1 },
      { item: 'leg_press', count: 1 }, { item: 'leg_extension', count: 1 }, { item: 'leg_curl_lying', count: 1 },
      { item: 'leg_curl_seated', count: 1 }, { item: 'abduction_machine', count: 1 }, { item: 'adduction_machine', count: 1 },
      { item: 'calf_raise_machine', count: 1 }, { item: 'back_extension_bench', count: 1 }, { item: 'pullup_bar', count: 2 },
      { item: 'dip_station', count: 1 }, { item: 'assisted_pullup_machine', count: 1 }, { item: 'preacher_curl_bench', count: 1 },
      { item: 'resistance_band', count: 10 }, { item: 'mini_band', count: 10 }, { item: 'mat', count: 10 },
      { item: 'plyo_box', count: 3 }, { item: 'medicine_ball', count: 4 }, { item: 'ab_wheel', count: 2 },
      { item: 'treadmill', count: 3 }, { item: 'bike', count: 3 }, { item: 'rower', count: 2 }, { item: 'step', count: 6 },
    ],
  },
  {
    id: 'functional_box',
    name: 'סטודיו פונקציונלי',
    style: 'functional',
    concurrentTrainees: 8,
    sessionMinutes: 50,
    equipment: [
      { item: 'kettlebell', count: 12 }, { item: 'dumbbell', count: 16 }, { item: 'barbell', count: 2 },
      { item: 'squat_rack', count: 1 }, { item: 'bench_flat', count: 2 }, { item: 'pullup_bar', count: 4 },
      { item: 'trx', count: 6 }, { item: 'resistance_band', count: 12 }, { item: 'mini_band', count: 12 },
      { item: 'slam_ball', count: 6 }, { item: 'medicine_ball', count: 6 }, { item: 'battle_rope', count: 2 },
      { item: 'plyo_box', count: 6 }, { item: 'sled', count: 1 }, { item: 'rower', count: 3 },
      { item: 'air_bike', count: 2 }, { item: 'ski_erg', count: 1 }, { item: 'jump_rope', count: 10 },
      { item: 'mat', count: 12 }, { item: 'step', count: 8 }, { item: 'ab_wheel', count: 4 }, { item: 'landmine', count: 2 },
    ],
  },
  {
    id: 'boutique_small',
    name: 'סטודיו בוטיק קטן',
    style: 'small_group',
    concurrentTrainees: 6,
    sessionMinutes: 45,
    allowSupersets: true,
    equipment: [
      { item: 'dumbbell', count: 10 }, { item: 'kettlebell', count: 4 }, { item: 'resistance_band', count: 12 },
      { item: 'mini_band', count: 12 }, { item: 'mat', count: 10 }, { item: 'step', count: 8 },
      { item: 'bench_flat', count: 2 }, { item: 'stability_ball', count: 4 }, { item: 'bosu', count: 2 },
      { item: 'trx', count: 4 }, { item: 'jump_rope', count: 8 }, { item: 'foam_roller', count: 6 },
    ],
  },
];

export const TRAINEES = [
  {
    id: 'dana', name: 'דנה', studioId: 'full_gym', sex: 'female', age: 34, level: 'novice',
    goals: ['fat_loss', 'general_fitness'], primaryGoal: 'fat_loss', daysPerWeek: 3, sessionMinutes: 60,
    constraints: [{ id: 'knee_pain_patellofemoral', severity: 'subacute', side: 'right' }],
    focusMuscles: ['glutes', 'core_anterior'], sleepQuality: 3, stressLevel: 4, nutritionAdherence: 3,
    preferredDays: ['sun', 'tue', 'thu'],
  },
  {
    id: 'yossi', name: 'יוסי', studioId: 'full_gym', sex: 'male', age: 41, level: 'intermediate',
    goals: ['hypertrophy'], primaryGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75,
    constraints: [{ id: 'shoulder_impingement', severity: 'subacute' }, { id: 'hypertension', severity: 'managed' }],
    likes: ['leg_press'], varietyPreference: 'balanced', mesocycleWeek: 2,
  },
  {
    id: 'maya', name: 'מאיה', studioId: 'boutique_small', sex: 'female', age: 29, level: 'beginner',
    goals: ['general_fitness'], primaryGoal: 'general_fitness', daysPerWeek: 2, sessionMinutes: 45,
    constraints: [{ id: 'pregnancy_t2_t3', severity: 'subacute', notes: 'שבוע 24, אישור רופא בתיק' }],
    medicalClearance: true,
  },
  {
    id: 'avi', name: 'אבי', studioId: 'full_gym', sex: 'male', age: 52, level: 'novice',
    goals: ['posture', 'general_fitness'], primaryGoal: 'posture', daysPerWeek: 3, sessionMinutes: 50,
    constraints: [{ id: 'disc_herniation', severity: 'managed' }, { id: 'neck_pain', severity: 'subacute' }],
    focusMuscles: ['back_upper', 'glutes'],
  },
  {
    id: 'noa', name: 'נועה', studioId: 'functional_box', sex: 'female', age: 26, level: 'advanced',
    goals: ['power', 'hypertrophy'], primaryGoal: 'power', daysPerWeek: 4, sessionMinutes: 60,
    constraints: [], varietyPreference: 'high', sleepQuality: 4, stressLevel: 2, nutritionAdherence: 4,
  },
  {
    id: 'tomer', name: 'תומר', studioId: 'functional_box', sex: 'male', age: 37, level: 'intermediate',
    goals: ['strength'], primaryGoal: 'strength', daysPerWeek: 4, sessionMinutes: 70,
    constraints: [{ id: 'low_back_pain', severity: 'acute' }],
  },
  {
    id: 'rivka', name: 'רבקה', studioId: 'boutique_small', sex: 'female', age: 67, level: 'beginner',
    goals: ['general_fitness'], primaryGoal: 'general_fitness', daysPerWeek: 2, sessionMinutes: 45,
    constraints: [{ id: 'osteoporosis', severity: 'managed' }, { id: 'limited_mobility_floor', severity: 'subacute' }, { id: 'hypertension', severity: 'managed' }],
    sleepQuality: 3, stressLevel: 2,
  },
];

/** טעינת נתוני הדמו למסד. */
export function seed(db = new Db()) {
  db.reset();
  for (const s of STUDIOS) db.putStudio(s);
  for (const t of TRAINEES) db.putTrainee(t);
  return db;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = seed();
  console.log(`נטענו ${db.listStudios().length} סטודיואים ו-${db.listTrainees().length} מתאמנים אל ${db.file}`);
}
