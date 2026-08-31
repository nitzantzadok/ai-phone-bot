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
  {
    id: 'pilates_studio',
    name: 'סטודיו פילאטיס',
    style: 'pilates',
    concurrentTrainees: 6,
    trainersOnFloor: 1,
    sessionMinutes: 55,
    spaceLevel: 'medium',
    ceilingHeightCm: 260,
    noiseRestricted: true,
    equipment: [
      { item: 'reformer', count: 6 }, { item: 'pilates_mat', count: 8 }, { item: 'pilates_ring', count: 8 },
      { item: 'pilates_chair', count: 2 }, { item: 'cadillac', count: 1 }, { item: 'pilates_barrel', count: 2 },
      { item: 'small_ball', count: 8 }, { item: 'mini_band', count: 10 }, { item: 'resistance_band', count: 10 },
      { item: 'foam_roller', count: 6 }, { item: 'stability_ball', count: 4 }, { item: 'mat', count: 10 },
      { item: 'chair', count: 6 }, { item: 'wall', count: 1 }, { item: 'dumbbell', count: 8 },
    ],
    dumbbellMaxKg: 6,
    weightIncrementKg: 1,
  },
  {
    id: 'boxing_gym',
    name: 'מועדון אגרוף',
    style: 'boxing',
    concurrentTrainees: 12,
    trainersOnFloor: 2,
    sessionMinutes: 60,
    spaceLevel: 'large',
    ceilingHeightCm: 320,
    equipment: [
      { item: 'heavy_bag', count: 8 }, { item: 'boxing_pads', count: 4 }, { item: 'speed_bag', count: 2 },
      { item: 'jump_rope', count: 12 }, { item: 'kettlebell', count: 8 }, { item: 'dumbbell', count: 12 },
      { item: 'medicine_ball', count: 6 }, { item: 'slam_ball', count: 4 }, { item: 'battle_rope', count: 2 },
      { item: 'pullup_bar', count: 3 }, { item: 'plyo_box', count: 4 }, { item: 'mat', count: 12 },
      { item: 'resistance_band', count: 10 }, { item: 'bench_flat', count: 2 }, { item: 'barbell', count: 1 },
      { item: 'squat_rack', count: 1 }, { item: 'sled', count: 1 }, { item: 'air_bike', count: 2 },
    ],
    dumbbellMaxKg: 30,
  },
  {
    id: 'senior_center',
    name: 'מרכז פעילות לגיל השלישי',
    style: 'senior',
    concurrentTrainees: 10,
    trainersOnFloor: 2,
    sessionMinutes: 45,
    spaceLevel: 'medium',
    ceilingHeightCm: 265,
    noiseRestricted: true,
    equipment: [
      { item: 'chair', count: 12 }, { item: 'stable_support', count: 12 }, { item: 'wall', count: 1 },
      { item: 'parallel_bars', count: 1 }, { item: 'resistance_band', count: 14 }, { item: 'mini_band', count: 14 },
      { item: 'dumbbell', count: 12 }, { item: 'mat', count: 10 }, { item: 'step', count: 8 },
      { item: 'recumbent_bike', count: 3 }, { item: 'arm_ergometer', count: 2 }, { item: 'treadmill', count: 2 },
      { item: 'leg_press', count: 1 }, { item: 'seated_row_machine', count: 1 }, { item: 'chest_press_machine', count: 1 },
      { item: 'leg_curl_seated', count: 1 }, { item: 'leg_extension', count: 1 }, { item: 'small_ball', count: 8 },
    ],
    dumbbellMaxKg: 12,
    weightIncrementKg: 1,
  },
  {
    id: 'home_micro',
    name: 'סטודיו ביתי זעיר',
    style: 'personal',
    concurrentTrainees: 1,
    trainersOnFloor: 1,
    sessionMinutes: 40,
    spaceLevel: 'small',
    ceilingHeightCm: 235,
    noiseRestricted: true,
    equipment: [
      { item: 'dumbbell', count: 4 }, { item: 'resistance_band', count: 4 }, { item: 'mini_band', count: 4 },
      { item: 'mat', count: 2 }, { item: 'chair', count: 2 }, { item: 'wall', count: 1 }, { item: 'step', count: 1 },
    ],
    dumbbellMaxKg: 12,
    weightIncrementKg: 1,
  },
];

export const TRAINEES = [
  {
    id: 'dana', name: 'דנה', studioId: 'full_gym', sex: 'female', age: 34, level: 'novice',
    heightCm: 166, weightKg: 72,
    goals: ['fat_loss', 'general_fitness'], primaryGoal: 'fat_loss', daysPerWeek: 3, sessionMinutes: 60,
    constraints: [{ id: 'knee_pain_patellofemoral', severity: 'subacute', side: 'right' }],
    focusMuscles: ['glutes', 'core_anterior'], sleepQuality: 3, stressLevel: 4, nutritionAdherence: 3,
    preferredDays: ['sun', 'tue', 'thu'],
  },
  {
    id: 'yossi', name: 'יוסי', studioId: 'full_gym', sex: 'male', age: 41, level: 'intermediate',
    heightCm: 178, weightKg: 88,
    goals: ['hypertrophy'], primaryGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75,
    constraints: [{ id: 'shoulder_impingement', severity: 'subacute' }, { id: 'hypertension', severity: 'managed' }],
    likes: ['leg_press'], varietyPreference: 'balanced', mesocycleWeek: 2,
  },
  {
    id: 'maya', name: 'מאיה', studioId: 'boutique_small', sex: 'female', age: 29, level: 'beginner',
    heightCm: 170, weightKg: 63,
    goals: ['general_fitness'], primaryGoal: 'general_fitness', daysPerWeek: 2, sessionMinutes: 45,
    constraints: [{ id: 'pregnancy_t2_t3', severity: 'subacute', notes: 'שבוע 24, אישור רופא בתיק' }],
    medicalClearance: true,
  },
  {
    id: 'avi', name: 'אבי', studioId: 'full_gym', sex: 'male', age: 52, level: 'novice',
    heightCm: 175, weightKg: 92,
    goals: ['posture', 'general_fitness'], primaryGoal: 'posture', daysPerWeek: 3, sessionMinutes: 50,
    constraints: [{ id: 'disc_herniation', severity: 'managed' }, { id: 'neck_pain', severity: 'subacute' }],
    focusMuscles: ['back_upper', 'glutes'],
  },
  {
    id: 'noa', name: 'נועה', studioId: 'functional_box', sex: 'female', age: 26, level: 'advanced',
    heightCm: 169, weightKg: 64,
    goals: ['power', 'hypertrophy'], primaryGoal: 'power', daysPerWeek: 4, sessionMinutes: 60,
    constraints: [], varietyPreference: 'high', sleepQuality: 4, stressLevel: 2, nutritionAdherence: 4,
  },
  {
    id: 'tomer', name: 'תומר', studioId: 'functional_box', sex: 'male', age: 37, level: 'intermediate',
    heightCm: 182, weightKg: 86,
    goals: ['strength'], primaryGoal: 'strength', daysPerWeek: 4, sessionMinutes: 70,
    constraints: [{ id: 'low_back_pain', severity: 'acute' }],
  },
  {
    id: 'rivka', name: 'רבקה', studioId: 'boutique_small', sex: 'female', age: 67, level: 'beginner',
    heightCm: 160, weightKg: 68,
    goals: ['general_fitness'], primaryGoal: 'general_fitness', daysPerWeek: 2, sessionMinutes: 45,
    constraints: [{ id: 'osteoporosis', severity: 'managed' }, { id: 'limited_mobility_floor', severity: 'subacute' }, { id: 'hypertension', severity: 'managed' }],
    sleepQuality: 3, stressLevel: 2,
  },
  {
    id: 'shira', name: 'שירה', studioId: 'pilates_studio', sex: 'female', age: 45, level: 'novice',
    goals: ['posture', 'mobility'], primaryGoal: 'mobility', daysPerWeek: 3, sessionMinutes: 55,
    constraints: [{ id: 'hypermobility_eds', severity: 'managed' }],
    lifestyle: 'sedentary', heightCm: 168, weightKg: 60,
  },
  {
    id: 'eitan', name: 'איתן', studioId: 'boxing_gym', sex: 'male', age: 24, level: 'advanced',
    goals: ['athletic_performance'], primaryGoal: 'athletic_performance', daysPerWeek: 3, sessionMinutes: 60,
    sport: 'martial_arts', externalSessions: 4, lifestyle: 'active',
    constraints: [{ id: 'wrist_pain', severity: 'managed' }],
    heightCm: 180, weightKg: 78,
  },
  {
    id: 'miriam', name: 'מרים', studioId: 'senior_center', sex: 'female', age: 78, level: 'beginner',
    goals: ['active_aging'], primaryGoal: 'active_aging', daysPerWeek: 2, sessionMinutes: 45,
    constraints: [
      { id: 'knee_replacement', severity: 'managed', side: 'left' },
      { id: 'osteoporosis', severity: 'managed' },
      { id: 'hypotension', severity: 'subacute' },
    ],
    heightCm: 158, weightKg: 66, sleepQuality: 3, stressLevel: 2,
  },
  {
    id: 'ronen', name: 'רונן', studioId: 'home_micro', sex: 'male', age: 38, level: 'intermediate',
    goals: ['fat_loss'], primaryGoal: 'fat_loss', daysPerWeek: 4, sessionMinutes: 40,
    lifestyle: 'shift_work', heightCm: 176, weightKg: 104,
    constraints: [{ id: 'diabetes', severity: 'managed' }],
    sessionMinutesByDay: { thu: 60 },
  },
  {
    id: 'liat', name: 'ליאת', studioId: 'full_gym', sex: 'female', age: 33, level: 'novice',
    goals: ['general_fitness'], primaryGoal: 'general_fitness', daysPerWeek: 3, sessionMinutes: 60,
    constraints: [{ id: 'postpartum', severity: 'subacute' }, { id: 'pelvic_floor_dysfunction', severity: 'subacute' }],
    heightCm: 165, weightKg: 68, sleepQuality: 2, stressLevel: 4,
    notes: 'ארבעה חודשים אחרי לידה, ליווי פיזיותרפיסטית רצפת אגן.',
  },
  {
    id: 'omer', name: 'עומר', studioId: 'functional_box', sex: 'male', age: 15, level: 'beginner',
    goals: ['athletic_performance'], primaryGoal: 'athletic_performance', daysPerWeek: 2, sessionMinutes: 50,
    sport: 'basketball', externalSessions: 4, heightCm: 174, weightKg: 61,
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
