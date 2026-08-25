/**
 * תוויות בעברית לכל מפתח שהמערכת משתמשת בו פנימית.
 * המנוע עובד עם מזהים באנגלית; כל מה שמוצג למאמן עובר דרך כאן.
 */

export const EQUIPMENT_LABELS = {
  barbell: 'מוט', dumbbell: 'משקולות יד', kettlebell: 'קטלבל', ez_bar: 'מוט EZ',
  fixed_barbell: 'מוט קבוע', weight_plate: 'צלחת משקל', bench_flat: 'ספסל ישר',
  bench_incline: 'ספסל שיפוע', bench_decline: 'ספסל שיפוע שלילי', squat_rack: 'כלוב סקוואט',
  power_rack: 'כלוב כוח', smith_machine: 'מכונת סמית', trap_bar: 'טראפ-בר', landmine: 'לנדמיין',
  cable_crossover: 'מכונת כבלים', lat_pulldown: 'פולי עליון', seated_row_machine: 'מכונת חתירה',
  chest_press_machine: 'מכונת לחיצת חזה', shoulder_press_machine: 'מכונת לחיצת כתפיים',
  pec_deck: 'מכונת פרפר', rear_delt_machine: 'מכונת פרפר אחורי', leg_press: 'לחיצת רגליים',
  hack_squat: 'האק סקוואט', leg_extension: 'פשיטת ברכיים', leg_curl_lying: 'כפיפת ברכיים בשכיבה',
  leg_curl_seated: 'כפיפת ברכיים בישיבה', hip_thrust_machine: 'מכונת היפ תראסט',
  abduction_machine: 'מכונת הרחקה', adduction_machine: 'מכונת קירוב', calf_raise_machine: 'מכונת תאומים',
  back_extension_bench: 'ספסל יישור גב', ab_machine: 'מכונת בטן',
  assisted_pullup_machine: 'מכונת מתח בסיוע', glute_kickback_machine: 'מכונת בעיטות ישבן',
  pullover_machine: 'מכונת פולאובר', preacher_curl_bench: 'ספסל סקוט', dip_station: 'מקבילים',
  pullup_bar: 'מוט מתח', roman_chair: 'כיסא רומי', ghd: 'GHD',
  trx: 'TRX', resistance_band: 'גומיית התנגדות', mini_band: 'מיני-band', medicine_ball: 'כדור כוח',
  slam_ball: 'כדור הטחה', battle_rope: 'חבלות קרב', plyo_box: 'קופסת קפיצה', bosu: 'בוסו',
  stability_ball: 'כדור פיזיו', ab_wheel: 'גלגל בטן', sled: 'מזחלת', sandbag: 'שק חול',
  suspension_anchor: 'עוגן תלייה', foam_roller: 'גליל עיסוי', step: 'סטפ', mat: 'מזרן',
  treadmill: 'הליכון', bike: 'אופני כושר', rower: 'מכשיר חתירה', ski_erg: 'סקי-ארג',
  elliptical: 'אליפטיקל', air_bike: 'אופני אוויר', stair_climber: 'מדרגות', jump_rope: 'חבל קפיצה',
  recumbent_bike: 'אופני שכיבה', arm_ergometer: 'ארגומטר ידיים',
  reformer: 'ריפורמר', pilates_mat: 'מזרן פילאטיס', pilates_ring: 'טבעת פילאטיס',
  pilates_chair: 'כיסא פילאטיס', cadillac: 'קדילק', pilates_barrel: 'חבית פילאטיס', small_ball: 'כדור קטן',
  heavy_bag: 'שק אגרוף', boxing_pads: 'מיטים', speed_bag: 'כדור מהירות',
  chair: 'כיסא', wall: 'קיר', parallel_bars: 'מוטות הליכה', stable_support: 'משענת יציבה',
  bodyweight: 'משקל גוף',
};

export const SPLIT_LABELS = {
  full_body: 'גוף מלא', upper_lower: 'עליון / תחתון', push_pull: 'דחיפה / משיכה',
  push_pull_legs: 'דחיפה / משיכה / רגליים', ab: 'A-B', abc: 'A-B-C', abcd: 'A-B-C-D',
  bro_split: 'חלוקה לפי קבוצות שריר', hybrid_circuit: 'מעגל תחנות', mobility_flow: 'ניידות ותנועה',
};

export const LEVEL_LABELS = {
  beginner: 'מתחיל', novice: 'מתאמן צעיר', intermediate: 'בינוני', advanced: 'מתקדם',
};

export const SEVERITY_LABELS = { acute: 'חריף', subacute: 'בהחלמה', managed: 'מנוהל' };

export const ROLE_LABELS = {
  warmup: 'חימום', prehab: 'מניעה', main: 'עיקרי', secondary: 'משני',
  accessory: 'עזר', core: 'ליבה', conditioning: 'קונדישן', cooldown: 'שחרור',
};

export const PHASE_LABELS = { accumulation: 'צבירה', intensification: 'העצמה', deload: 'הורדת עומס' };

export const SPORT_LABELS = {
  none: 'ללא', running: 'ריצה', cycling: 'רכיבה', swimming: 'שחייה', football: 'כדורגל',
  basketball: 'כדורסל', tennis: 'טניס', crossfit: 'קרוספיט', martial_arts: 'אומנויות לחימה',
  dance: 'ריקוד', climbing: 'טיפוס', hiking: 'טיולים',
};

export const LIFESTYLE_LABELS = {
  sedentary: 'עבודה יושבנית', active: 'אורח חיים פעיל',
  physical_job: 'עבודה פיזית', shift_work: 'עבודת משמרות',
};

export const MUSCLE_LABELS = {
  chest: 'חזה', back_lats: 'רחב גבי', back_upper: 'גב עליון', delts_front: 'כתף קדמית',
  delts_side: 'כתף צד', delts_rear: 'כתף אחורית', biceps: 'יד קדמית', triceps: 'יד אחורית',
  forearms: 'אמות', quads: 'ארבע ראשי', hamstrings: 'אחורי ירך', glutes: 'ישבן',
  adductors: 'מקרבים', abductors: 'מרחיקים', calves: 'תאומים', core_anterior: 'ליבה קדמית',
  core_lateral: 'ליבה צידית', core_posterior: 'ליבה אחורית', neck: 'צוואר',
};

/**
 * קטלוג הציוד לצ׳קליסט ההרשמה, מקובץ לקטגוריות שאדם חושב בהן.
 * זהו המקור היחיד — גם השרת וגם מסך ההרשמה קוראים ממנו.
 */
export const EQUIPMENT_CATEGORIES = [
  { key: 'free_weights', label: 'משקולות חופשיות',
    items: ['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'fixed_barbell', 'weight_plate', 'trap_bar', 'landmine', 'sandbag'] },
  { key: 'benches', label: 'ספסלים וכלובים',
    items: ['bench_flat', 'bench_incline', 'bench_decline', 'squat_rack', 'power_rack', 'smith_machine', 'preacher_curl_bench', 'back_extension_bench', 'roman_chair', 'ghd'] },
  { key: 'machines', label: 'מכונות',
    items: ['cable_crossover', 'lat_pulldown', 'seated_row_machine', 'chest_press_machine', 'shoulder_press_machine', 'pec_deck', 'rear_delt_machine', 'leg_press', 'hack_squat', 'leg_extension', 'leg_curl_lying', 'leg_curl_seated', 'hip_thrust_machine', 'abduction_machine', 'adduction_machine', 'calf_raise_machine', 'ab_machine', 'assisted_pullup_machine', 'glute_kickback_machine', 'pullover_machine'] },
  { key: 'functional', label: 'פונקציונלי',
    items: ['trx', 'resistance_band', 'mini_band', 'medicine_ball', 'slam_ball', 'battle_rope', 'plyo_box', 'bosu', 'stability_ball', 'ab_wheel', 'sled', 'suspension_anchor', 'foam_roller', 'step', 'mat', 'pullup_bar', 'dip_station'] },
  { key: 'cardio', label: 'קרדיו',
    items: ['treadmill', 'bike', 'rower', 'ski_erg', 'elliptical', 'air_bike', 'stair_climber', 'jump_rope', 'recumbent_bike', 'arm_ergometer'] },
  { key: 'pilates', label: 'פילאטיס',
    items: ['reformer', 'pilates_mat', 'pilates_ring', 'pilates_chair', 'cadillac', 'pilates_barrel', 'small_ball'] },
  { key: 'boxing', label: 'אגרוף',
    items: ['heavy_bag', 'boxing_pads', 'speed_bag'] },
  { key: 'support', label: 'נגישות ותמיכה',
    items: ['chair', 'wall', 'parallel_bars', 'stable_support'] },
];

const label = (map) => (key) => map[key] || key;
export const equipmentLabel = label(EQUIPMENT_LABELS);
export const splitLabel = label(SPLIT_LABELS);
export const levelLabel = label(LEVEL_LABELS);
export const severityLabel = label(SEVERITY_LABELS);
export const roleLabel = label(ROLE_LABELS);
export const phaseLabel = label(PHASE_LABELS);
export const sportLabel = label(SPORT_LABELS);
export const lifestyleLabel = label(LIFESTYLE_LABELS);
export const muscleLabel = label(MUSCLE_LABELS);

/** רשימת ציוד לתצוגה: "משקולות יד + ספסל ישר" */
export const equipmentList = (items = []) => items.map(equipmentLabel).join(' + ');
