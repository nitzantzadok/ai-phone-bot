/**
 * חוקי פציעות ומצבים רפואיים.
 *
 * כל רשומה מתרגמת "כאב בברך" או "הריון" לשפה שהמנוע מבין:
 *   forbidFlags  – דגלים שאסורים לחלוטין (התרגיל נפסל).
 *   avoidFlags   – דגלים שמורידים ניקוד אך אינם פוסלים.
 *   maxStress    – תקרת עומס למפרק מסוים (0-3). מעליה התרגיל נפסל.
 *   softStress   – תקרה "רכה": מעליה יש קנס בניקוד.
 *   preferTags   – תגיות שמקבלות בונוס.
 *   prescribe    – תרגילים שכדאי *לשלב* (עבודה שיקומית ממוקדת).
 *   note         – טקסט שמוצג למאמן בתכנית.
 *
 * severity: 'acute' (חריף/כואב עכשיו) | 'subacute' (בהחלמה) | 'managed' (מנוהל/ישן)
 * החומרה מכפילה את הקשיחות: acute מוריד את תקרות העומס בעוד דרגה.
 */

export const SEVERITIES = ['acute', 'subacute', 'managed'];

/** כמה להוריד מתקרות העומס לפי חומרה. */
export const SEVERITY_STRICTNESS = { acute: 1, subacute: 0, managed: -1 };

export const CONSTRAINTS = {
  // ---------------------------------------------------------------- כתף
  shoulder_impingement: {
    name: 'צביטה בכתף / כאב בכתף',
    region: 'shoulder',
    forbidFlags: ['overhead'],
    avoidFlags: ['end_range_shoulder_ext'],
    maxStress: { shoulder: 1 },
    softStress: { shoulder: 0 },
    preferTags: ['shoulder_friendly', 'rehab_friendly', 'joint_friendly'],
    prescribe: ['external_rotation_band', 'face_pull', 'ytw_prone', 'band_pull_apart'],
    note: 'ללא תנועות מעל גובה הכתף בשלב זה. עבודה בטווח ללא כאב בלבד, דגש על סיבוב חיצוני ויציבת שכמה.',
  },
  rotator_cuff: {
    name: 'קרע/גירוי בשרוול המסובב',
    region: 'shoulder',
    forbidFlags: ['overhead', 'end_range_shoulder_ext', 'ballistic'],
    maxStress: { shoulder: 1 },
    preferTags: ['rehab_friendly', 'shoulder_friendly'],
    prescribe: ['external_rotation_band', 'face_pull'],
    note: 'טווח חופשי מכאב, ללא תנועות בליסטיות וללא מתיחת קצה של החזה/הכתף.',
  },
  ac_joint: {
    name: 'מפרק AC (אקרומיו-קלביקולרי)',
    region: 'shoulder',
    forbidFlags: ['end_range_shoulder_ext'],
    avoidFlags: ['overhead'],
    maxStress: { shoulder: 2 },
    preferTags: ['shoulder_friendly'],
    note: 'להימנע מקירוב אופקי בעומס (פרפר עמוק, מקבילים).',
  },
  shoulder_instability: {
    name: 'אי-יציבות / נקע בכתף',
    region: 'shoulder',
    forbidFlags: ['overhead', 'end_range_shoulder_ext', 'unstable', 'ballistic'],
    maxStress: { shoulder: 1 },
    preferTags: ['rehab_friendly', 'joint_friendly'],
    prescribe: ['external_rotation_band', 'ytw_prone'],
    note: 'להישאר בטווח פנימי ובשליטה. ללא תנועות מעל הראש וללא סיבוב חיצוני בקצה טווח.',
  },

  // ---------------------------------------------------------------- גב תחתון
  low_back_pain: {
    name: 'כאב גב תחתון לא ספציפי',
    region: 'spine',
    forbidFlags: ['spinal_flexion'],
    avoidFlags: ['spinal_loading', 'high_valsalva'],
    maxStress: { lumbar: 1 },
    preferTags: ['back_friendly', 'rehab_friendly'],
    prescribe: ['dead_bug', 'bird_dog', 'side_plank', 'pallof_press', 'suitcase_carry'],
    note: 'ללא כפיפת עמוד שדרה בעומס. עדיפות לתמיכת חזה/ישיבה ולעבודת יציבות ליבה אנטי-תנועתית.',
  },
  disc_herniation: {
    name: 'פריצת דיסק מותנית',
    region: 'spine',
    forbidFlags: ['spinal_flexion', 'high_valsalva', 'ballistic'],
    avoidFlags: ['spinal_loading', 'spinal_rotation', 'deep_hip_flexion'],
    maxStress: { lumbar: 1 },
    preferTags: ['back_friendly', 'rehab_friendly'],
    prescribe: ['dead_bug', 'bird_dog', 'side_plank', 'glute_bridge'],
    note: 'ללא כפיפה ו/או סיבוב של עמוד השדרה בעומס, ללא הרמות מהרצפה. אישור פיזיותרפיסט נדרש לעליית עומסים.',
  },
  spondylolisthesis: {
    name: 'ספונדילוליסטזיס',
    region: 'spine',
    forbidFlags: ['spinal_loading', 'high_valsalva'],
    avoidFlags: ['spinal_flexion'],
    maxStress: { lumbar: 1 },
    preferTags: ['back_friendly'],
    note: 'ללא עומס צירי על עמוד השדרה; עדיפות למכונות ולעבודה נתמכת.',
  },
  si_joint: {
    name: 'מפרק סקרואיליאק (SI)',
    region: 'spine',
    avoidFlags: ['balance', 'ballistic'],
    maxStress: { lumbar: 1, hip: 2 },
    preferTags: ['rehab_friendly'],
    prescribe: ['glute_bridge', 'band_clamshell', 'side_plank'],
    note: 'להימנע מתנועות חד-צדדיות רחבות טווח בשלב ראשון; דגש על יציבות אגן.',
  },

  // ---------------------------------------------------------------- ברך
  knee_pain_patellofemoral: {
    name: 'כאב פיקת הברך',
    region: 'knee',
    forbidFlags: ['deep_knee_flexion', 'impact'],
    maxStress: { knee: 1 },
    preferTags: ['knee_friendly', 'rehab_friendly', 'low_impact'],
    prescribe: ['glute_bridge', 'band_clamshell', 'glute_activation_walk'],
    note: 'טווח כפיפה עד ~90° וללא כאב, ללא קפיצות. חיזוק ישבן והרחקה מפחית עומס על הפיקה.',
  },
  acl_reconstruction: {
    name: 'שחזור רצועה צולבת קדמית (ACL)',
    region: 'knee',
    forbidFlags: ['impact', 'ballistic', 'unstable'],
    avoidFlags: ['deep_knee_flexion', 'balance'],
    maxStress: { knee: 1 },
    preferTags: ['rehab_friendly', 'knee_friendly'],
    note: 'לפי פרוטוקול הפיזיותרפיסט. ללא פליומטריקה וללא תנועות סיבוביות בעומס עד אישור.',
  },
  meniscus: {
    name: 'מניסקוס',
    region: 'knee',
    forbidFlags: ['deep_knee_flexion', 'impact', 'spinal_rotation'],
    maxStress: { knee: 1 },
    preferTags: ['knee_friendly', 'low_impact'],
    note: 'ללא כפיפה עמוקה ולא סיבוב בעומס על רגל נושאת.',
  },

  // ---------------------------------------------------------------- מרפק / שורש כף יד
  tennis_elbow: {
    name: 'מרפק טניס',
    region: 'elbow',
    avoidFlags: ['grip_intensive'],
    maxStress: { elbow: 1 },
    preferTags: ['elbow_friendly'],
    note: 'להפחית אחיזה חזקה ופשיטות מרפק בעומס; רצועות אחיזה מותרות.',
  },
  golfers_elbow: {
    name: 'מרפק גולף',
    region: 'elbow',
    avoidFlags: ['grip_intensive'],
    maxStress: { elbow: 1 },
    note: 'להפחית כפיפות מרפק בעומס ואחיזה חזקה.',
  },
  wrist_pain: {
    name: 'כאב בשורש כף היד',
    region: 'wrist',
    forbidFlags: ['wrist_extension_load'],
    maxStress: { wrist: 1 },
    note: 'עדיפות לאחיזה ניטרלית ולידיות; להימנע מהישענות על כף היד ביישור.',
  },

  // ---------------------------------------------------------------- ירך / קרסול
  hip_impingement: {
    name: 'צביטה במפרק הירך (FAI)',
    region: 'hip',
    forbidFlags: ['deep_hip_flexion'],
    avoidFlags: ['deep_knee_flexion'],
    maxStress: { hip: 1 },
    preferTags: ['rehab_friendly'],
    note: 'טווח כפיפת ירך מוגבל, ללא סקוואט עמוק.',
  },
  ankle_sprain: {
    name: 'נקע בקרסול',
    region: 'ankle',
    forbidFlags: ['impact', 'balance'],
    maxStress: { ankle: 1 },
    preferTags: ['low_impact'],
    note: 'ללא קפיצות ותרגילי שיווי משקל בעמידה על רגל עד להחלמה.',
  },
  achilles: {
    name: 'טנדינופתיה של גיד אכילס',
    region: 'ankle',
    forbidFlags: ['impact'],
    maxStress: { ankle: 1 },
    preferTags: ['low_impact'],
    prescribe: ['seated_calf_raise'],
    note: 'עבודה איזומטרית ואקסצנטרית איטית של תאומים; ללא ריצה/קפיצות.',
  },

  // ---------------------------------------------------------------- צוואר
  neck_pain: {
    name: 'כאבי צוואר',
    region: 'neck',
    forbidFlags: ['axial_neck_load'],
    avoidFlags: ['overhead', 'spinal_flexion'],
    maxStress: { neck: 1 },
    preferTags: ['posture'],
    prescribe: ['band_pull_apart', 'face_pull', 'thoracic_rotation'],
    note: 'ללא עומס ישיר על הצוואר, ללא כפיפות בטן קלאסיות. דגש על ניידות חזית ויציבת שכמה.',
  },

  // ---------------------------------------------------------------- מצבים רפואיים
  pregnancy_t1: {
    name: 'הריון — טרימסטר ראשון',
    region: 'systemic',
    forbidFlags: ['high_valsalva'],
    avoidFlags: ['impact', 'unstable'],
    preferTags: ['joint_friendly'],
    note: 'ללא עצירות נשימה, ללא עלייה חדה בעומס. לפי אישור רופא מטפל.',
  },
  pregnancy_t2_t3: {
    name: 'הריון — טרימסטר שני/שלישי',
    region: 'systemic',
    forbidFlags: ['lying_supine', 'high_valsalva', 'spinal_flexion', 'impact', 'lying_prone'],
    avoidFlags: ['unstable', 'balance', 'floor_transition'],
    maxStress: { lumbar: 1 },
    preferTags: ['joint_friendly', 'rehab_friendly'],
    prescribe: ['side_plank', 'pallof_press', 'band_row'],
    note: 'ללא שכיבה על הגב/בטן, ללא כפיפות בטן וללא עצירת נשימה. לפי אישור רופא מטפל.',
  },
  postpartum: {
    name: 'לאחר לידה / דיאסטזיס',
    region: 'systemic',
    forbidFlags: ['spinal_flexion', 'high_valsalva'],
    avoidFlags: ['impact'],
    maxStress: { lumbar: 1 },
    preferTags: ['rehab_friendly', 'back_friendly'],
    prescribe: ['dead_bug', 'bird_dog', 'glute_bridge', 'pallof_press'],
    note: 'בנייה הדרגתית של ליבה עמוקה; ללא כפיפות בטן וללא לחץ תוך-בטני גבוה.',
  },
  hypertension: {
    name: 'יתר לחץ דם',
    region: 'systemic',
    forbidFlags: ['high_valsalva'],
    avoidFlags: ['overhead'],
    note: 'נשימה רציפה, ללא עצירת נשימה, ללא סטים עד כשל מוחלט. מנוחות ארוכות יותר.',
  },
  cardiac: {
    name: 'מצב לבבי מנוטר',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'ballistic'],
    maxStress: { cardio: 2 },
    note: 'עצימות מבוקרת לפי RPE, אישור קרדיולוג. ניטור דופק לאורך האימון.',
  },
  hernia: {
    name: 'בקע',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'spinal_flexion'],
    maxStress: { lumbar: 1 },
    note: 'ללא עלייה חדה בלחץ תוך-בטני.',
  },
  osteoporosis: {
    name: 'אוסטאופורוזיס',
    region: 'systemic',
    forbidFlags: ['spinal_flexion', 'impact', 'spinal_rotation'],
    preferTags: ['back_friendly'],
    note: 'עמידה בעומס מבוקר מועילה, אך ללא כפיפה/סיבוב של עמוד השדרה בעומס.',
  },
  vertigo: {
    name: 'סחרחורות / ורטיגו',
    region: 'systemic',
    forbidFlags: ['balance', 'unstable'],
    avoidFlags: ['floor_transition', 'overhead'],
    note: 'להימנע משינויי תנוחה מהירים ומעבודה על משטח לא יציב.',
  },
  obesity_joint_load: {
    name: 'עומס מפרקי עקב משקל גוף גבוה',
    region: 'systemic',
    forbidFlags: ['impact'],
    avoidFlags: ['floor_transition'],
    preferTags: ['low_impact', 'joint_friendly', 'beginner_friendly'],
    note: 'עדיפות למכונות, לישיבה ולקרדיו ללא זעזועים.',
  },
  limited_mobility_floor: {
    name: 'קושי בירידה/עלייה מהרצפה',
    region: 'systemic',
    forbidFlags: ['floor_transition'],
    preferTags: ['beginner_friendly'],
    note: 'להעדיף תרגילים בעמידה או בישיבה על מכונה.',
  },
};

/** @param {string} id */
export function getConstraint(id) {
  const c = CONSTRAINTS[id];
  if (!c) throw new Error(`מגבלה לא מוכרת: ${id}`);
  return c;
}

export const CONSTRAINT_IDS = Object.keys(CONSTRAINTS);
