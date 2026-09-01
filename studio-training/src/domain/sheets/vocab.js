/**
 * אוצר המילים של הייבוא.
 *
 * כל מה שסטודיו כותב בגיליון שלו מול מה שהמערכת קוראת לזה בפנים.
 * זו רשימה ארוכה בכוונה: ככל שהיא עשירה יותר, כך המאמן צריך לתקן פחות
 * אחרי הייבוא. מה שלא מזוהה כאן לא נזרק — הוא מוצג למאמן להכרעה.
 */

import { CONSTRAINTS } from '../constraints.js';
import { EXERCISES } from '../exercises.js';
import { EQUIPMENT_LABELS } from '../labels.js';
import { EQUIPMENT } from '../taxonomy.js';

/** בונה רשימת מועמדים להתאמה: לכל מפתח, כל הצורות שבהן כותבים אותו. */
/*
 * הרשימה נבנית פעם אחת לכל מילון. מעבר לחיסכון בהקצאות, זהות הרשימה היא
 * מה שמאפשר למטמון ההתאמות לזהות שמדובר באותם מועמדים — רשימה חדשה בכל
 * קריאה הייתה מבטלת את המטמון וכל תא היה נבדק מחדש מול כל המונחים.
 */
const candidateCache = new WeakMap();

export function shCandidates(map) {
  const hit = candidateCache.get(map);
  if (hit) return hit;
  const built = Object.entries(map).map(([key, terms]) => ({ key, terms }));
  candidateCache.set(map, built);
  return built;
}

/* ------------------------------------------------------------------ שדות */

/**
 * כותרות עמודה -> שדה במערכת.
 * הסדר לא משנה; ההכרעה נעשית לפי ניקוד ולא לפי סדר.
 */
export const HEADER_TERMS = {
  name: ['שם', 'שם מלא', 'שם המתאמן', 'שם מתאמן', 'מתאמן', 'מתאמנת', 'לקוח', 'לקוחה', 'שם הלקוח', 'תלמיד', 'name', 'full name', 'client', 'trainee', 'member'],
  firstName: ['שם פרטי', 'פרטי', 'first name', 'first'],
  lastName: ['שם משפחה', 'משפחה', 'last name', 'surname', 'family name'],
  phone: ['טלפון', 'נייד', 'פלאפון', 'מספר טלפון', 'טל', 'phone', 'mobile', 'cell'],
  email: ['אימייל', 'מייל', 'דואל', 'דואר אלקטרוני', 'email', 'mail', 'e-mail'],
  sex: ['מין', 'מגדר', 'זכר נקבה', 'sex', 'gender'],
  age: ['גיל', 'age'],
  birthDate: ['תאריך לידה', 'תאריך הלידה', 'יום הולדת', 'לידה', 'birth', 'birthday', 'date of birth', 'dob'],
  heightCm: ['גובה', 'גובה סמ', 'height'],
  weightKg: ['משקל', 'משקל גוף', 'משקל נוכחי', 'קילו', 'weight', 'bodyweight'],
  bodyFatPct: ['אחוז שומן', 'שומן', 'אחוזי שומן', 'body fat', 'fat'],
  level: ['רמה', 'רמת המתאמן', 'רמת ניסיון', 'ותק', 'ניסיון', 'level', 'experience'],
  trainingAgeMonths: ['ותק אימונים', 'כמה זמן מתאמן', 'שנות אימון', 'training age'],
  goal: ['מטרה', 'מטרות', 'יעד', 'יעדים', 'מטרת האימון', 'goal', 'goals', 'objective', 'target'],
  goalDetail: ['פירוט מטרה', 'הערות מטרה', 'מטרה מפורטת', 'goal detail'],
  daysPerWeek: ['ימים בשבוע', 'תדירות', 'כמה פעמים בשבוע', 'אימונים בשבוע', 'מספר אימונים', 'פעמים בשבוע', 'days per week', 'frequency', 'sessions per week'],
  sessionMinutes: ['אורך אימון', 'משך אימון', 'זמן אימון', 'דקות', 'משך', 'session length', 'duration', 'minutes'],
  preferredDays: ['ימי אימון', 'ימים מועדפים', 'ימים', 'יום אימון', 'training days', 'preferred days'],
  preferredTime: ['שעה', 'שעת אימון', 'זמן מועדף', 'time', 'preferred time'],
  constraints: ['פציעות', 'פציעה', 'מגבלות', 'מגבלה', 'בעיות רפואיות', 'בעיות', 'רקע רפואי', 'מצב רפואי', 'כאבים', 'הגבלות', 'injuries', 'injury', 'limitations', 'medical', 'conditions', 'restrictions'],
  pastInjuries: ['פציעות עבר', 'עבר רפואי', 'פציעות ישנות', 'past injuries'],
  medications: ['תרופות', 'טיפול תרופתי', 'medication', 'medications', 'drugs'],
  medicalClearance: ['אישור רפואי', 'אישור רופא', 'הצהרת בריאות', 'medical clearance', 'doctor approval'],
  sport: ['ספורט', 'ענף ספורט', 'פעילות נוספת', 'פעילות חיצונית', 'sport', 'activity'],
  externalSessions: ['אימונים חיצוניים', 'אימוני ספורט', 'פעילות בשבוע', 'external sessions'],
  lifestyle: ['עיסוק', 'תעסוקה', 'עבודה', 'אורח חיים', 'מקצוע', 'job', 'occupation', 'lifestyle', 'work'],
  coach: ['מאמן', 'מאמנת', 'מאמן אחראי', 'שיוך למאמן', 'coach', 'trainer', 'instructor'],
  studio: ['סניף', 'סטודיו', 'מיקום', 'שלוחה', 'מועדון', 'branch', 'studio', 'location', 'gym', 'club'],
  startDate: ['תאריך הצטרפות', 'תאריך התחלה', 'הצטרף', 'הצטרפה', 'תחילת אימונים', 'start date', 'joined', 'join date'],
  targetDate: ['תאריך יעד', 'יעד תאריך', 'אירוע', 'תחרות', 'target date', 'deadline', 'event'],
  status: ['סטטוס', 'פעיל', 'מצב', 'status', 'active'],
  trainingStyle: ['סגנון אימון', 'סוג אימון', 'סוג האימון', 'סגנון', 'שיטת אימון', 'training style', 'style', 'workout type'],
  notes: ['הערות', 'הערה', 'תיאור', 'פרטים', 'notes', 'note', 'comments', 'remarks'],
  restingHR: ['דופק', 'דופק מנוחה', 'resting hr', 'heart rate'],
  bloodPressure: ['לחץ דם', 'blood pressure', 'bp'],
  // --- ציוד
  equipmentItem: ['ציוד', 'פריט', 'מכשיר', 'שם הפריט', 'שם הציוד', 'מכשור', 'equipment', 'item', 'machine', 'gear'],
  count: ['כמות', 'מספר', 'יחידות', 'כמה', 'qty', 'quantity', 'count', 'amount', 'units'],
  weightRange: ['טווח משקלים', 'משקלים', 'טווח', 'משקלי', 'weights', 'range'],
  // --- תכנית ואימון
  exercise: ['תרגיל', 'שם התרגיל', 'תרגילים', 'תנועה', 'exercise', 'movement', 'lift'],
  sets: ['סטים', 'סטס', 'מספר סטים', 'sets'],
  reps: ['חזרות', 'חז', 'רפס', 'reps', 'repetitions', 'rep'],
  load: ['משקל עבודה', 'עומס', 'קילוגרם', 'ק"ג', 'משקל בתרגיל', 'load', 'kg', 'weight used'],
  rest: ['מנוחה', 'הפסקה', 'זמן מנוחה', 'rest'],
  tempo: ['קצב', 'טמפו', 'tempo'],
  rpe: ['קושי', 'מאמץ', 'rpe', 'rir', 'difficulty'],
  day: ['יום', 'אימון', 'יום אימון', 'סבב', 'day', 'workout', 'session', 'routine'],
  date: ['תאריך', 'date', 'when'],
  week: ['שבוע', 'week'],
  pain: ['כאב', 'רמת כאב', 'pain'],
  // --- מדידות
  waist: ['מותן', 'היקף מותן', 'waist'],
  chest: ['היקף חזה', 'חזה', 'chest'],
  hips: ['ירכיים', 'היקף ירכיים', 'אגן', 'hips'],
  arm: ['היקף זרוע', 'זרוע', 'יד', 'arm'],
  thigh: ['היקף ירך', 'ירך', 'thigh'],
  calf: ['היקף שוק', 'שוק', 'calf'],
  neckSize: ['היקף צוואר', 'צוואר', 'neck'],
  // --- מה שמזוהה כדי *להתעלם* ממנו בכוונה
  price: ['מחיר', 'תשלום', 'עלות', 'חוב', 'יתרה', 'כרטיסייה', 'מנוי', 'סכום', 'חשבונית', 'price', 'payment', 'balance', 'subscription', 'invoice'],
  idNumber: ['תז', 'תעודת זהות', 'ת.ז', 'id', 'id number'],
  // עמודת מספר רץ. מזוהה רק כדי שלא תיקרא כמשקל או כגיל.
  code: ['קוד', 'מספר', 'מס', 'מזהה', 'מספר מתאמן', 'מספר לקוח', 'code', 'number', 'no'],
  address: ['כתובת', 'עיר', 'ישוב', 'address', 'city'],
};

/** שדות שמזוהים רק כדי לא לבלבל אותם עם שדות אמיתיים. לא מיובאים. */
export const IGNORED_FIELDS = new Set(['price', 'idNumber', 'address', 'code']);

/* ------------------------------------------------------------------ ערכים */

export const GOAL_TERMS = {
  hypertrophy: ['מסה', 'היפרטרופיה', 'בניית שריר', 'שריר', 'חיטוב', 'עיצוב', 'מסת שריר', 'בניית מסה', 'hypertrophy', 'muscle', 'mass', 'toning'],
  strength: ['כוח', 'חיזוק', 'להתחזק', 'כוח מקסימלי', 'strength', 'strong'],
  fat_loss: ['ירידה במשקל', 'הרזיה', 'שריפת שומן', 'ירידה בשומן', 'לרזות', 'הורדת משקל', 'דיאטה', 'fat loss', 'weight loss', 'slimming'],
  general_fitness: ['כושר', 'כושר כללי', 'בריאות', 'תחזוקה', 'להיות בכושר', 'fitness', 'general', 'health'],
  endurance: ['סיבולת', 'סיבולת שרירית', 'אירובי', 'endurance', 'stamina'],
  power: ['כוח מתפרץ', 'פיצוץ', 'מהירות', 'קפיצה', 'explosive', 'power', 'speed'],
  rehab: ['שיקום', 'חזרה מפציעה', 'פיזיותרפיה', 'ריפוי', 'rehab', 'rehabilitation', 'recovery', 'physio'],
  posture: ['יציבה', 'כאבי גב', 'גב', 'תיקון יציבה', 'posture', 'back pain'],
  mobility: ['ניידות', 'גמישות', 'טווחי תנועה', 'מתיחות', 'mobility', 'flexibility', 'stretching'],
  bone_density: ['צפיפות עצם', 'אוסטאופורוזיס', 'אוסטאופניה', 'עצמות', 'bone density', 'osteoporosis'],
  active_aging: ['גיל שלישי', 'תפקוד', 'עצמאות', 'קשישים', 'הזדקנות פעילה', 'active aging', 'seniors', 'functional'],
  athletic_performance: ['ביצועים', 'ספורטיבי', 'שיפור ביצועים', 'תחרות', 'athletic', 'performance', 'sport specific'],
  stress_relief: ['הפגת מתחים', 'רגיעה', 'שינה', 'סטרס', 'נפש', 'stress', 'relax', 'mental'],
};

/** סגנון האימון כפי שמאמן כותב אותו בגיליון. */
export const TRAINING_STYLE_TERMS = {
  strength: ['כוח', 'פאוורליפטינג', 'הרמת כוח', 'strength', 'powerlifting'],
  bodybuilding: ['פיתוח גוף', 'בודיבילדינג', 'מסה', 'היפרטרופיה', 'bodybuilding', 'hypertrophy'],
  athletic: ['אתלטי', 'אתלטיות', 'ספורטיבי', 'אתלטיקה', 'קרוספיט', 'athletic', 'crossfit', 'sports'],
  functional: ['פונקציונלי', 'תפקודי', 'פונקציונאלי', 'functional'],
  conditioning: ['קונדישן', 'שריפת שומן', 'מטבולי', 'hiit', 'conditioning', 'metcon'],
  endurance: ['סיבולת', 'אירובי', 'endurance', 'cardio'],
  mobility: ['ניידות', 'גמישות', 'מתיחות', 'יוגה', 'פילאטיס', 'mobility', 'flexibility', 'yoga', 'pilates'],
  rehab: ['שיקום', 'שיקומי', 'פיזיותרפיה', 'rehab', 'physio'],
};

export const LEVEL_TERMS = {
  beginner: ['מתחיל', 'מתחילה', 'מתחילים', 'חדש', 'חדשה', 'ללא ניסיון', 'אפס', 'beginner', 'new', 'novice start'],
  novice: ['מתחיל מתקדם', 'בסיסי', 'התחלתי', 'צעיר', 'רמה 2', 'novice'],
  intermediate: ['בינוני', 'בינונית', 'ממוצע', 'מנוסה', 'רמה 3', 'intermediate', 'medium'],
  advanced: ['מתקדם', 'מתקדמת', 'ותיק', 'מקצועי', 'גבוה', 'רמה 4', 'advanced', 'expert', 'pro'],
};

export const SEX_TERMS = {
  male: ['זכר', 'גבר', 'ז', 'בן', 'male', 'm', 'man'],
  female: ['נקבה', 'אישה', 'אשה', 'נ', 'בת', 'female', 'f', 'woman'],
};

export const SPORT_TERMS = {
  running: ['ריצה', 'רץ', 'רצה', 'מרתון', 'running', 'run'],
  cycling: ['רכיבה', 'אופניים', 'ספינינג', 'cycling', 'bike'],
  swimming: ['שחייה', 'שחיה', 'בריכה', 'swimming', 'swim'],
  football: ['כדורגל', 'football', 'soccer'],
  basketball: ['כדורסל', 'basketball'],
  tennis: ['טניס', 'פאדל', 'סקווש', 'tennis', 'padel'],
  crossfit: ['קרוספיט', 'crossfit'],
  martial_arts: ['קרב מגע', 'אומנויות לחימה', 'ג׳ודו', 'קראטה', 'איגרוף', 'mma', 'boxing', 'martial'],
  dance: ['ריקוד', 'מחול', 'זומבה', 'dance'],
  climbing: ['טיפוס', 'climbing'],
  hiking: ['טיולים', 'הליכה', 'טרקים', 'hiking', 'walking'],
  none: ['ללא', 'אין', 'לא מתאמן', 'none'],
};

export const LIFESTYLE_TERMS = {
  sedentary: ['משרד', 'יושבני', 'ישיבה', 'הייטק', 'מחשב', 'פקידה', 'פקיד', 'office', 'desk', 'sedentary'],
  active: ['פעיל', 'פעילה', 'מורה', 'זז הרבה', 'active'],
  physical_job: ['עבודה פיזית', 'בניין', 'מחסן', 'שליח', 'חקלאות', 'physical'],
  shift_work: ['משמרות', 'לילות', 'אחות', 'אחיות', 'שיפטים', 'shift'],
};

export const SEVERITY_TERMS = {
  acute: ['חריף', 'חריפה', 'כואב', 'כואבת', 'עכשיו', 'טרי', 'פעיל', 'acute', 'current'],
  subacute: ['בהחלמה', 'משתפר', 'בשיקום', 'לאחרונה', 'subacute', 'healing'],
  managed: ['ישן', 'ישנה', 'עבר', 'מנוהל', 'לא מפריע', 'החלים', 'managed', 'old', 'past'],
};

export const SIDE_TERMS = {
  left: ['שמאל', 'שמאלית', 'שמאלי', 'left', 'l'],
  right: ['ימין', 'ימנית', 'ימני', 'right', 'r'],
  both: ['שתיים', 'דו צדדי', 'שני הצדדים', 'both', 'bilateral'],
};

export const WEEKDAY_TERMS = {
  sun: ['ראשון', 'א', 'sunday', 'sun'],
  mon: ['שני', 'ב', 'monday', 'mon'],
  tue: ['שלישי', 'ג', 'tuesday', 'tue'],
  wed: ['רביעי', 'ד', 'wednesday', 'wed'],
  thu: ['חמישי', 'ה', 'thursday', 'thu'],
  fri: ['שישי', 'ו', 'friday', 'fri'],
  sat: ['שבת', 'ש', 'saturday', 'sat'],
};

/* ------------------------------------------------------------- ציוד ותרגילים */

/** מילים נוספות לציוד, מעבר לשם הרשמי שבתוויות. */
const EQUIPMENT_EXTRA = {
  barbell: ['מוט אולימפי', 'מוט ברזל', 'ברבל', 'olympic bar'],
  dumbbell: ['דמבל', 'דמבלים', 'משקולות', 'משקולת יד', 'יד חופשיות', 'dumbbells'],
  kettlebell: ['קטלבלים', 'פעמון', 'גירייה', 'kettlebells'],
  ez_bar: ['מוט W', 'מוט מפותל', 'ez'],
  weight_plate: ['צלחות', 'פלטות', 'דיסקיות', 'plates'],
  bench_flat: ['ספסל', 'ספסל שטוח', 'bench'],
  bench_incline: ['ספסל משופע', 'ספסל נטוי', 'incline bench'],
  squat_rack: ['ראק', 'מתקן סקוואט', 'rack'],
  power_rack: ['כלוב', 'כלוב ברזל', 'cage'],
  smith_machine: ['סמית', 'מכונת סמית׳', 'smith'],
  cable_crossover: ['כבלים', 'פולי', 'מכונת פולי', 'קרוסאובר', 'cables', 'cable'],
  lat_pulldown: ['פולי גב', 'משיכת פולי', 'לט', 'lat'],
  seated_row_machine: ['חתירה', 'מכונת חתירה בישיבה', 'row machine'],
  chest_press_machine: ['לחיצת חזה מכונה', 'פרס חזה', 'chest press'],
  shoulder_press_machine: ['לחיצת כתפיים מכונה', 'shoulder press'],
  pec_deck: ['פרפר', 'butterfly', 'fly machine'],
  leg_press: ['לג פרס', 'מכונת רגליים', 'לחיצת רגליים במכונה'],
  leg_extension: ['פשיטת ברך', 'מכונת ארבע ראשי', 'leg ext'],
  leg_curl_lying: ['כפיפת ברך בשכיבה', 'מכונת אחורי ירך'],
  leg_curl_seated: ['כפיפת ברך בישיבה'],
  pullup_bar: ['מתח', 'מוט מתח', 'מתקן מתח', 'pull up bar', 'chin up'],
  dip_station: ['מקבילים', 'דיפס', 'dips'],
  treadmill: ['הליכון', 'ריצה', 'מסילה', 'treadmill'],
  bike: ['אופניים', 'ספינינג', 'אופני כושר', 'spinning'],
  rower: ['חתירה ארגומטר', 'מכונת חתירה', 'concept2', 'rowing'],
  air_bike: ['אופני אוויר', 'assault bike'],
  jump_rope: ['חבל', 'קפיצה בחבל', 'skipping rope'],
  resistance_band: ['גומייה', 'גומיות', 'גומיית כוח', 'bands'],
  mini_band: ['מיני גומייה', 'גומיית ישבן', 'loop band'],
  trx: ['רצועות', 'רצועות אימון', 'suspension'],
  medicine_ball: ['כדור רפואי', 'מדיסין בול'],
  slam_ball: ['כדור הטחות', 'סלאם בול'],
  plyo_box: ['קופסה', 'ארגז קפיצה', 'בוקס', 'box'],
  bosu: ['בוסו', 'חצי כדור'],
  stability_ball: ['כדור פיזיו', 'כדור ענק', 'פיטבול', 'swiss ball'],
  ab_wheel: ['גלגל', 'גלגל בטן'],
  sled: ['מזחלת', 'פראולר', 'prowler'],
  sandbag: ['שק חול', 'שק'],
  foam_roller: ['פוםרולר', 'גליל', 'roller'],
  step: ['סטפר', 'מדרגה', 'step platform'],
  mat: ['מזרון', 'מזרנים', 'מזרן יוגה', 'yoga mat'],
  reformer: ['ריפורמרים', 'מיטת פילאטיס'],
  heavy_bag: ['שק אגרוף', 'שק ניקוב', 'punching bag'],
  boxing_pads: ['פדים', 'כפפות מיקוד', 'focus mitts'],
  chair: ['כיסאות', 'כסא'],
  stable_support: ['מאחז', 'ידית תמיכה', 'מעקה'],
  bodyweight: ['משקל גוף', 'ללא ציוד', 'bodyweight'],
};

/*
 * רשימות המועמדים נבנות פעם אחת. הן נקראות פעם לכל תא בגיליון, וגיליון
 * של רשת סטודיו הוא אלפי תאים — בנייה מחדש בכל קריאה הופכת ייבוא של שתי
 * שניות לייבוא של דקה.
 */
let eqCache = null;
let coCache = null;
let exCache = null;

/** מועמדי ציוד: השם הרשמי + המזהה + כל הכינויים. */
export function equipmentCandidates() {
  if (eqCache) return eqCache;
  eqCache = EQUIPMENT.map((key) => ({
    key,
    terms: [EQUIPMENT_LABELS[key] || key, key.replace(/_/g, ' '), ...(EQUIPMENT_EXTRA[key] || [])],
  }));
  return eqCache;
}

/** מועמדי מגבלות: שם המגבלה + כינויים נפוצים שמאמנים כותבים. */
const CONSTRAINT_EXTRA = {
  shoulder_impingement: ['כאב כתף', 'כתף', 'כתפיים', 'shoulder'],
  rotator_cuff: ['שרוול מסובב', 'סופרהספינטוס', 'קרע בכתף'],
  low_back_pain: ['כאבי גב', 'גב תחתון', 'גב', 'מותניים', 'back pain', 'lower back'],
  disc_herniation: ['פריצת דיסק', 'דיסק', 'בלט דיסק', 'herniated disc'],
  knee_pain_patellofemoral: ['כאבי ברכיים', 'ברך', 'ברכיים', 'צ׳ונדרומלציה', 'knee pain'],
  acl_reconstruction: ['צלב קדמי', 'שחזור צלב', 'acl'],
  meniscus: ['מניסקוס', 'קרע מניסקוס'],
  tennis_elbow: ['מרפק טניס', 'מרפק'],
  wrist_pain: ['כאב יד', 'שורש כף יד', 'wrist'],
  hip_impingement: ['ירך', 'מפשעה', 'hip'],
  ankle_sprain: ['נקע', 'קרסול', 'ankle'],
  neck_pain: ['צוואר', 'כאבי צוואר', 'neck'],
  // "הריון" בלי פירוט -> השליש המאוחר, שהוא המגביל מבין השניים.
  // מגבלה מחמירה מדי אפשר להקל אחרי בירור; ההפך מסוכן.
  pregnancy_t2_t3: ['הריון', 'בהריון', 'pregnant', 'הריון מתקדם', 'טרימסטר שלישי'],
  pregnancy_t1: ['הריון שליש ראשון', 'טרימסטר ראשון', 'תחילת הריון'],
  postpartum: ['אחרי לידה', 'לאחר לידה', 'postpartum'],
  hypertension: ['לחץ דם גבוה', 'יתר לחץ דם', 'hypertension'],
  diabetes: ['סוכרת', 'סכרת', 'diabetes'],
  osteoporosis: ['אוסטאופורוזיס', 'בריחת סידן', 'osteoporosis'],
  asthma: ['אסתמה', 'קוצר נשימה', 'asthma'],
};

export function constraintCandidates() {
  if (coCache) return coCache;
  coCache = Object.entries(CONSTRAINTS).map(([key, c]) => ({
    key,
    terms: [c.name, key.replace(/_/g, ' '), ...(CONSTRAINT_EXTRA[key] || [])],
  }));
  return coCache;
}

/**
 * הכינויים שמאמנים כותבים בגיליון.
 * "סקוואט" בלי פירוט הוא סקוואט מוט על הגב, ולא סקוואט קדמי — ובלי
 * הכרעה כזאת ההתאמה נקבעת לפי סדר המאגר, וזה לא הסבר טוב לאף אחד.
 */
const EXERCISE_EXTRA = {
  bb_back_squat: ['סקוואט', 'סקווט', 'סקוואט חופשי', 'squat'],
  bb_bench_press: ['לחיצת חזה', 'בנצ', 'בנץ', 'חזה במוט', 'bench'],
  conventional_deadlift: ['דדליפט', 'הרמת מת', 'deadlift'],
  rdl_bb: ['רומנית', 'דדליפט רומני', 'rdl'],
  bb_ohp: ['לחיצת כתפיים', 'לחיצה מעל הראש', 'ohp'],
  pullup: ['מתח', 'עליות מתח', 'pull up'],
  chinup: ['מתח אחיזה תחתונה'],
  // "חתירה" לבדה אינה שם של תרגיל אחד: יש חתירה בהרכנה, בכבל, במכונה
  // ובמשקולת. כינוי כללי כזה גרם ל"חתירה בהרכנה" עם 90 ק״ג להיקלט
  // כחתירה בכבל, ואז המשקל של המתאמן נרשם לתרגיל הלא נכון.
  bb_row: ['חתירה במוט', 'חתירה בהרכנה', 'חתירה בהטיה', 'חתירה במוט בהרכנה',
    'barbell row', 'bent over row', 'bent-over row'],
  seated_cable_row: ['חתירה בכבל', 'חתירה בישיבה', 'חתירה בפולי'],
  lat_pulldown: ['פולי', 'משיכת פולי', 'לט פולדאון'],
  db_curl: ['כפיפת מרפקים', 'יד קדמית', 'ביצפס', 'קרל'],
  cable_pushdown: ['פשיטת מרפקים', 'יד אחורית', 'טרייספס', 'פושדאון'],
  leg_press: ['לחיצת רגליים', 'לג פרס'],
  hip_thrust: ['היפ תראסט', 'דחיקת אגן'],
  plank: ['פלאנק', 'קרש', 'plank'],
  crunch: ['כפיפות בטן', 'בטן'],
  walking_lunge: ['מכרעים', 'לאנג׳', 'לאנגים'],
  split_squat: ['בולגרי', 'סקוואט בולגרי'],
  kb_swing: ['סווינג', 'נדנוד קטלבל'],
  dips: ['מקבילים', 'דיפס'],
  pushup: ['שכיבות סמיכה', 'שכיבות', 'פוש אפ'],
  lateral_raise_db: ['הרחקות', 'הרחקות צד', 'כתף צד'],
  standing_calf_raise: ['תאומים', 'הרמת עקבים'],
  leg_curl_lying: ['כפיפת ברכיים', 'אחורי ירך במכונה'],
  leg_extension: ['פשיטת ברכיים', 'ארבע ראשי במכונה'],
  treadmill_incline_walk: ['הליכה', 'הליכון'],
  jump_rope: ['קפיצה בחבל', 'חבל'],
  farmer_carry: ['הליכת חקלאי', 'נשיאה'],
  shrug: ['משיכת כתפיים', 'שראגים'],
};

/** מועמדי תרגילים: השם בעברית, השם באנגלית, והמזהה. */
export function exerciseCandidates() {
  if (exCache) return exCache;
  exCache = EXERCISES.map((ex) => ({
    key: ex.id,
    terms: [ex.name, ex.nameEn, ex.id.replace(/_/g, ' '), ...(EXERCISE_EXTRA[ex.id] || [])].filter(Boolean),
    value: ex,
  }));
  return exCache;
}

/** שם השדה בעברית — מוצג למאמן במסך הייבוא. */
export const SH_FIELD_LABELS = {
  name: 'שם', firstName: 'שם פרטי', lastName: 'שם משפחה', phone: 'טלפון', email: 'אימייל',
  sex: 'מין', age: 'גיל', birthDate: 'תאריך לידה', heightCm: 'גובה', weightKg: 'משקל',
  bodyFatPct: 'אחוז שומן', level: 'רמה', trainingAgeMonths: 'ותק', goal: 'מטרה',
  goalDetail: 'פירוט מטרה', daysPerWeek: 'ימים בשבוע', sessionMinutes: 'אורך אימון',
  preferredDays: 'ימים מועדפים', preferredTime: 'שעה מועדפת', constraints: 'פציעות ומגבלות',
  pastInjuries: 'פציעות עבר', medications: 'תרופות', medicalClearance: 'אישור רפואי',
  sport: 'ספורט', externalSessions: 'אימונים חיצוניים', lifestyle: 'אורח חיים', coach: 'מאמן',
  studio: 'סניף', startDate: 'תאריך הצטרפות', targetDate: 'תאריך יעד', status: 'סטטוס',
  trainingStyle: 'סגנון אימון',
  notes: 'הערות', restingHR: 'דופק מנוחה', bloodPressure: 'לחץ דם',
  equipmentItem: 'פריט ציוד', count: 'כמות', weightRange: 'טווח משקלים',
  exercise: 'תרגיל', sets: 'סטים', reps: 'חזרות', load: 'משקל בתרגיל', rest: 'מנוחה',
  tempo: 'קצב', rpe: 'מאמץ', day: 'יום אימון', date: 'תאריך', week: 'שבוע', pain: 'כאב',
  waist: 'היקף מותן', chest: 'היקף חזה', hips: 'היקף ירכיים', arm: 'היקף זרוע',
  thigh: 'היקף ירך', calf: 'היקף שוק', neckSize: 'היקף צוואר',
  price: 'תשלום (לא מיובא)', idNumber: 'תעודת זהות (לא מיובאת)', address: 'כתובת (לא מיובאת)',
  code: 'מספר רץ (לא מיובא)',
};
