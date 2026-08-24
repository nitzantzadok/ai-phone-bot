/**
 * טקסונומיה: קבוצות שרירים, דפוסי תנועה, ציוד, מישורי תנועה.
 * זהו "אוצר המילים" שכל שאר המערכת מדברת בו. אין כאן לוגיקה.
 */

/** קבוצות שריר ראשיות (ברמת התכנון השבועי). */
export const MUSCLES = [
  'chest', 'back_lats', 'back_upper', 'delts_front', 'delts_side', 'delts_rear',
  'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors',
  'abductors', 'calves', 'core_anterior', 'core_lateral', 'core_posterior', 'neck',
];

/** מיפוי שריר -> אזור גוף, לצורך חלוקות פלג עליון/תחתון. */
export const MUSCLE_REGION = {
  chest: 'upper', back_lats: 'upper', back_upper: 'upper', delts_front: 'upper',
  delts_side: 'upper', delts_rear: 'upper', biceps: 'upper', triceps: 'upper',
  forearms: 'upper', neck: 'upper',
  quads: 'lower', hamstrings: 'lower', glutes: 'lower', adductors: 'lower',
  abductors: 'lower', calves: 'lower',
  core_anterior: 'core', core_lateral: 'core', core_posterior: 'core',
};

/** מיפוי שריר -> תפקיד דחיפה/משיכה/רגליים, לצורך חלוקת PPL. */
export const MUSCLE_ROLE = {
  chest: 'push', delts_front: 'push', delts_side: 'push', triceps: 'push',
  back_lats: 'pull', back_upper: 'pull', delts_rear: 'pull', biceps: 'pull',
  forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', adductors: 'legs',
  abductors: 'legs', calves: 'legs',
  core_anterior: 'core', core_lateral: 'core', core_posterior: 'core', neck: 'push',
};

/**
 * דפוסי תנועה. איזון בין הדפוסים הוא מה שמונע תכניות "עקומות"
 * (למשל הרבה דחיפה אופקית בלי משיכה אופקית -> כתף קדמית כואבת).
 */
export const PATTERNS = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull',
  'squat', 'hinge', 'lunge', 'hip_abduction', 'calf',
  'elbow_flexion', 'elbow_extension', 'shoulder_isolation',
  'core_antiextension', 'core_antirotation', 'core_antilateralflexion', 'core_flexion',
  'carry', 'conditioning', 'mobility',
];

/** דפוסים שנחשבים זוגות מאזנים (משמש ל-balance score). */
export const PATTERN_BALANCE_PAIRS = [
  ['horizontal_push', 'horizontal_pull'],
  ['vertical_push', 'vertical_pull'],
  ['squat', 'hinge'],
];

/** קטגוריות ציוד. סטודיו מצהיר אילו פריטים יש לו, ומכמה. */
export const EQUIPMENT = [
  // משקולות חופשיות
  'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'fixed_barbell', 'weight_plate',
  'bench_flat', 'bench_incline', 'bench_decline', 'squat_rack', 'power_rack', 'smith_machine',
  'trap_bar', 'landmine',
  // כבלים ומכונות
  'cable_crossover', 'lat_pulldown', 'seated_row_machine', 'chest_press_machine',
  'shoulder_press_machine', 'pec_deck', 'rear_delt_machine', 'leg_press', 'hack_squat',
  'leg_extension', 'leg_curl_lying', 'leg_curl_seated', 'hip_thrust_machine',
  'abduction_machine', 'adduction_machine', 'calf_raise_machine', 'back_extension_bench',
  'ab_machine', 'assisted_pullup_machine', 'glute_kickback_machine', 'pullover_machine',
  'preacher_curl_bench', 'dip_station', 'pullup_bar', 'roman_chair', 'ghd',
  // פונקציונלי
  'trx', 'resistance_band', 'mini_band', 'medicine_ball', 'slam_ball', 'battle_rope',
  'plyo_box', 'bosu', 'stability_ball', 'ab_wheel', 'sled', 'sandbag', 'suspension_anchor',
  'foam_roller', 'step', 'mat',
  // קרדיו
  'treadmill', 'bike', 'rower', 'ski_erg', 'elliptical', 'air_bike', 'stair_climber', 'jump_rope',
  'recumbent_bike', 'arm_ergometer',
  // פילאטיס / ריפורמר
  'reformer', 'pilates_mat', 'pilates_ring', 'pilates_chair', 'cadillac', 'pilates_barrel', 'small_ball',
  // אגרוף / קרב
  'heavy_bag', 'boxing_pads', 'speed_bag',
  // נגישות ותמיכה
  'chair', 'wall', 'parallel_bars', 'stable_support',
  // ריק
  'bodyweight',
];

/** ציוד שתמיד קיים בכל סטודיו. */
export const ALWAYS_AVAILABLE = ['bodyweight'];

/** מישורי תנועה — משמש לגיוון וגם לאילוצי פציעה. */
export const PLANES = ['sagittal', 'frontal', 'transverse'];

/** מטרות אימון נתמכות. */
export const GOALS = [
  'hypertrophy',     // היפרטרופיה / חיטוב
  'strength',        // כוח מקסימלי
  'fat_loss',        // ירידה באחוזי שומן
  'general_fitness', // כושר כללי / בריאות
  'endurance',       // סיבולת שרירית
  'power',           // כוח מתפרץ / ספורטיבי
  'rehab',           // חזרה מפציעה / שיקום מודרך
  'posture',         // יציבה וכאבי גב
  'mobility',        // ניידות וגמישות
  'bone_density',    // צפיפות עצם (אוסטאופניה)
  'active_aging',    // תפקוד ועצמאות בגיל השלישי
  'athletic_performance', // ביצועים בענף ספורט
  'stress_relief',   // הפגה, בריאות נפשית, שינה
];

/** רמות ניסיון. */
export const LEVELS = ['beginner', 'novice', 'intermediate', 'advanced'];

/** ענפי ספורט שהמתאמן עוסק בהם מחוץ לסטודיו — משפיעים על נפח ועל עבודת מניעה. */
export const SPORTS = {
  running:    { legLoad: 'high', prehab: ['calf', 'hip_abduction', 'hinge'], impact: true },
  cycling:    { legLoad: 'high', prehab: ['hinge', 'core_antiextension', 'shoulder_isolation'], impact: false },
  swimming:   { legLoad: 'low', prehab: ['shoulder_isolation', 'horizontal_pull'], impact: false },
  football:   { legLoad: 'high', prehab: ['hinge', 'hip_abduction', 'core_antirotation'], impact: true },
  basketball: { legLoad: 'high', prehab: ['hinge', 'calf', 'hip_abduction'], impact: true },
  tennis:     { legLoad: 'moderate', prehab: ['shoulder_isolation', 'core_antirotation', 'hip_abduction'], impact: true },
  crossfit:   { legLoad: 'high', prehab: ['shoulder_isolation', 'core_antiextension'], impact: true },
  martial_arts: { legLoad: 'moderate', prehab: ['hip_abduction', 'core_antirotation', 'shoulder_isolation'], impact: true },
  dance:      { legLoad: 'moderate', prehab: ['calf', 'hip_abduction', 'core_antilateralflexion'], impact: true },
  climbing:   { legLoad: 'moderate', prehab: ['horizontal_pull', 'shoulder_isolation', 'elbow_extension'], impact: false },
  hiking:     { legLoad: 'moderate', prehab: ['calf', 'hinge', 'core_antilateralflexion'], impact: false },
  none:       { legLoad: 'none', prehab: [], impact: false },
};

/** אורח חיים תעסוקתי — עומס הבסיס שהמתאמן מגיע איתו. */
export const LIFESTYLES = {
  sedentary:    { volumeFactor: 1.0, prehab: ['hinge', 'shoulder_isolation'], note: 'ישיבה ממושכת — דגש על פתיחת ירך וחיזוק גב עליון.' },
  active:       { volumeFactor: 1.0, prehab: [], note: '' },
  physical_job: { volumeFactor: 0.85, prehab: [], note: 'עבודה פיזית — נפח מופחת כדי לא להצטבר על עומס היומיום.' },
  shift_work:   { volumeFactor: 0.9, prehab: [], note: 'עבודת משמרות — התאוששות פגיעה, נפח מתון ומעקב אחרי עייפות.' },
};

/** שלב במחזור החודשי — קלט אופציונלי בלבד, לוויסות עדין של עצימות. */
export const CYCLE_PHASES = ['unknown', 'menstrual', 'follicular', 'ovulation', 'luteal', 'perimenopause', 'postmenopause'];

/** סוגי חלוקה שבועית נתמכים. */
export const SPLITS = [
  'full_body', 'upper_lower', 'push_pull', 'push_pull_legs',
  'ab', 'abc', 'abcd', 'bro_split', 'hybrid_circuit', 'mobility_flow',
];

/** סוגי סט מיוחדים. */
export const SET_TYPES = ['straight', 'superset', 'giant', 'circuit', 'drop', 'cluster', 'amrap', 'emom'];

/** רמת מאמץ מכנית — כמה התרגיל "יקר" מבחינת עייפות מערכתית. */
export const FATIGUE_COST = { low: 1, moderate: 2, high: 3, very_high: 4 };
