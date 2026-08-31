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
  // ---------------------------------------------------------------- עמוד שדרה — המשך
  lumbar_stenosis: {
    name: 'היצרות תעלת השדרה המותנית',
    region: 'spine',
    forbidFlags: ['spinal_loading'],
    avoidFlags: ['high_valsalva'],
    maxStress: { lumbar: 1 },
    preferTags: ['back_friendly', 'rehab_friendly'],
    prescribe: ['dead_bug', 'glute_bridge', 'bike_intervals'],
    note: 'בניגוד לפריצת דיסק — כאן דווקא כפיפה קלה מקלה ויישור/עומס צירי מחמיר. עדיפות לאופניים על הליכון.',
  },
  sciatica: {
    name: 'סיאטיקה / כאב מקרין לרגל',
    region: 'spine',
    forbidFlags: ['spinal_flexion', 'high_valsalva'],
    avoidFlags: ['spinal_loading', 'deep_hip_flexion'],
    maxStress: { lumbar: 1 },
    preferTags: ['back_friendly', 'rehab_friendly'],
    prescribe: ['bird_dog', 'dead_bug', 'glute_bridge'],
    note: 'לעצור כל תרגיל שמקרין מתחת לברך. הקרנה שמתקדמת כלפי מטה = להפסיק ולהפנות לגורם רפואי.',
  },
  scoliosis: {
    name: 'סקוליוזיס',
    region: 'spine',
    avoidFlags: ['spinal_loading', 'spinal_rotation'],
    maxStress: { lumbar: 2 },
    preferTags: ['back_friendly'],
    prescribe: ['side_plank', 'bird_dog', 'suitcase_carry'],
    note: 'דגש על עבודה חד-צדדית סימטרית בעומס שווה, ועל נשימה לצד הקעור. להימנע מעומס צירי כבד.',
  },
  spinal_fusion: {
    name: 'לאחר ניתוח קיבוע עמוד שדרה',
    region: 'spine',
    forbidFlags: ['spinal_flexion', 'spinal_rotation', 'spinal_loading', 'high_valsalva', 'impact'],
    maxStress: { lumbar: 1 },
    preferTags: ['rehab_friendly', 'back_friendly'],
    note: 'רק לפי פרוטוקול המנתח. ללא כפיפה, סיבוב או עומס צירי; בנייה הדרגתית של סיבולת ליבה.',
  },

  // ---------------------------------------------------------------- מפרקים מלאכותיים וניתוחים
  hip_replacement: {
    name: 'החלפת מפרק ירך',
    region: 'hip',
    forbidFlags: ['deep_hip_flexion', 'hip_adduction_load', 'impact', 'spinal_rotation'],
    avoidFlags: ['deep_knee_flexion', 'balance'],
    maxStress: { hip: 1 },
    preferTags: ['joint_friendly', 'rehab_friendly', 'low_impact'],
    prescribe: ['glute_bridge', 'band_clamshell', 'abduction_machine'],
    note: 'אמצעי זהירות קלאסיים: ללא כפיפת ירך מעבר ל-90°, ללא הצלבת רגליים וללא סיבוב פנימי. חיזוק מרחיקים הוא הליבה של התכנית.',
  },
  knee_replacement: {
    name: 'החלפת מפרק ברך',
    region: 'knee',
    forbidFlags: ['deep_knee_flexion', 'impact', 'ballistic'],
    maxStress: { knee: 1 },
    preferTags: ['knee_friendly', 'joint_friendly', 'low_impact', 'rehab_friendly'],
    prescribe: ['glute_bridge', 'wall_sit', 'bike_intervals'],
    note: 'עבודה בטווח ללא כאב לפי הפרוטוקול; דגש על יישור מלא ועל חיזוק ארבע ראשי וישבן.',
  },
  shoulder_replacement: {
    name: 'החלפת מפרק כתף',
    region: 'shoulder',
    forbidFlags: ['overhead', 'end_range_shoulder_ext', 'weight_over_head_free', 'ballistic'],
    maxStress: { shoulder: 1 },
    preferTags: ['rehab_friendly', 'shoulder_friendly'],
    note: 'רק לפי פרוטוקול המנתח; טווחים מוגבלים ועומסים קלים לאורך זמן.',
  },
  recent_surgery: {
    name: 'לאחר ניתוח (עד 12 שבועות)',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'impact', 'ballistic'],
    avoidFlags: ['spinal_flexion', 'grip_intensive'],
    preferTags: ['rehab_friendly', 'joint_friendly'],
    note: 'נדרש אישור המנתח לחזרה לפעילות, כולל מגבלות ספציפיות לאזור הניתוח. להתחיל בעצימות נמוכה מאוד.',
  },

  // ---------------------------------------------------------------- שרירים וגידים
  hamstring_strain: {
    name: 'מתיחה/קרע בהמסטרינג',
    region: 'hip',
    forbidFlags: ['ballistic', 'impact', 'end_range_joint'],
    maxStress: { hip: 1 },
    preferTags: ['rehab_friendly'],
    prescribe: ['glute_bridge', 'leg_curl_seated'],
    note: 'עבודה איזומטרית ואקסצנטרית בטווח קצר, ללא ריצה וללא מתיחות בקצה טווח עד להיעלמות הכאב.',
  },
  groin_strain: {
    name: 'מתיחה במקרבים (מפשעה)',
    region: 'hip',
    forbidFlags: ['hip_adduction_load', 'ballistic', 'impact'],
    avoidFlags: ['balance'],
    maxStress: { hip: 1 },
    prescribe: ['glute_bridge', 'band_clamshell'],
    note: 'להימנע מקירוב ירך בעומס ומתנועות צד רחבות; חזרה הדרגתית דרך איזומטרי.',
  },
  calf_strain: {
    name: 'מתיחה בתאומים',
    region: 'ankle',
    forbidFlags: ['impact', 'ballistic'],
    maxStress: { ankle: 1 },
    preferTags: ['low_impact'],
    prescribe: ['seated_calf_raise'],
    note: 'ללא קפיצות וריצה; בנייה דרך הרמות עקב בישיבה ואז בעמידה.',
  },
  plantar_fasciitis: {
    name: 'דלקת פאשיה כף הרגל',
    region: 'ankle',
    forbidFlags: ['impact'],
    avoidFlags: ['balance'],
    maxStress: { ankle: 1 },
    preferTags: ['low_impact', 'joint_friendly'],
    prescribe: ['seated_calf_raise'],
    note: 'ללא קפיצות והליכה ממושכת יחפה; חיזוק תאומים איטי וכף רגל.',
  },
  frozen_shoulder: {
    name: 'כתף קפואה (קפסוליטיס)',
    region: 'shoulder',
    forbidFlags: ['overhead', 'end_range_shoulder_ext', 'weight_over_head_free'],
    maxStress: { shoulder: 1 },
    preferTags: ['rehab_friendly', 'shoulder_friendly'],
    prescribe: ['external_rotation_band', 'band_pull_apart'],
    note: 'לעבוד רק בטווח הזמין ללא כאב חד; שיפור הטווח הוא תהליך ארוך ולא נכפה בכוח.',
  },
  hip_labral_tear: {
    name: 'קרע בלברום הירך',
    region: 'hip',
    forbidFlags: ['deep_hip_flexion', 'ballistic', 'spinal_rotation'],
    avoidFlags: ['deep_knee_flexion', 'hip_adduction_load'],
    maxStress: { hip: 1 },
    prescribe: ['glute_bridge', 'band_clamshell'],
    note: 'להימנע מכפיפת ירך עמוקה ומסיבוב בעומס; חיזוק מייצבי אגן בטווח בינוני.',
  },
  carpal_tunnel: {
    name: 'תסמונת התעלה הקרפלית',
    region: 'wrist',
    forbidFlags: ['wrist_extension_load'],
    avoidFlags: ['grip_intensive'],
    maxStress: { wrist: 1 },
    note: 'אחיזה ניטרלית, רצועות אחיזה, והימנעות מלחץ ישיר על כף היד.',
  },

  // ---------------------------------------------------------------- מפרקים כרוניים
  knee_oa: {
    name: 'שחיקת סחוס בברך',
    region: 'knee',
    forbidFlags: ['impact', 'deep_knee_flexion'],
    maxStress: { knee: 1 },
    preferTags: ['knee_friendly', 'low_impact', 'joint_friendly'],
    prescribe: ['leg_curl_seated', 'glute_bridge', 'bike_intervals'],
    note: 'תנועה היא טיפול — לא הימנעות. טווח ללא כאב, עומס מתון ותדירות גבוהה, ללא זעזועים.',
  },
  hip_oa: {
    name: 'שחיקת סחוס בירך',
    region: 'hip',
    forbidFlags: ['impact', 'deep_hip_flexion'],
    maxStress: { hip: 1 },
    preferTags: ['joint_friendly', 'low_impact'],
    prescribe: ['abduction_machine', 'glute_bridge'],
    note: 'חיזוק מרחיקים ומיישרי ירך בטווח נוח; קרדיו ללא זעזועים.',
  },
  rheumatoid_flare: {
    name: 'דלקת מפרקים שגרונית — התלקחות',
    region: 'systemic',
    forbidFlags: ['impact', 'ballistic', 'grip_intensive', 'high_valsalva'],
    maxStress: { knee: 1, wrist: 1, elbow: 1, shoulder: 1, hip: 1 },
    preferTags: ['rehab_friendly', 'joint_friendly', 'low_impact'],
    note: 'בהתלקחות פעילה — טווח תנועה ועומס מינימלי בלבד. להגביר רק כשההתלקחות שוככת.',
  },
  hypermobility_eds: {
    name: 'היפרמוביליות / EDS',
    region: 'systemic',
    forbidFlags: ['end_range_joint', 'ballistic'],
    avoidFlags: ['unstable', 'end_range_shoulder_ext'],
    preferTags: ['rehab_friendly', 'joint_friendly'],
    prescribe: ['plank', 'side_plank', 'glute_bridge', 'external_rotation_band'],
    note: 'הבעיה היא יציבות ולא גמישות — לעצור לפני קצה הטווח, לעבוד איטי ומבוקר, ולא למתוח.',
  },

  // ---------------------------------------------------------------- רצפת אגן
  pelvic_floor_dysfunction: {
    name: 'חולשת רצפת אגן / צניחה',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'impact', 'ballistic', 'spinal_flexion'],
    maxStress: { lumbar: 1 },
    preferTags: ['rehab_friendly', 'back_friendly'],
    prescribe: ['glute_bridge', 'dead_bug', 'pallof_press'],
    note: 'ללא עלייה בלחץ תוך-בטני, ללא קפיצות ומשקלים כבדים. נשיפה במאמץ. מומלץ ליווי פיזיותרפיסטית רצפת אגן.',
  },

  // ---------------------------------------------------------------- לב, ריאות, מטבוליזם
  asthma: {
    name: 'אסתמה',
    region: 'systemic',
    maxStress: { cardio: 2 },
    avoidFlags: ['high_valsalva'],
    note: 'חימום ארוך והדרגתי מפחית התכווצות סמפונות במאמץ. משאף זמין באימון; להימנע מעצימות מרבית באוויר קר ויבש.',
  },
  diabetes: {
    name: 'סוכרת',
    region: 'systemic',
    avoidFlags: ['high_valsalva'],
    note: 'בדיקת סוכר לפני ואחרי, פחמימה זמינה באימון, בדיקת כפות רגליים ונעליים מתאימות. אימוני התנגדות משפרים רגישות לאינסולין.',
  },
  beta_blockers: {
    name: 'נטילת חוסמי בטא',
    region: 'systemic',
    note: 'הדופק אינו מדד תקף לעצימות — לעבוד לפי RPE בלבד. עלייה איטית יותר בדופק ובלחץ הדם, ולכן חימום וקירור ארוכים.',
  },
  hypotension: {
    name: 'לחץ דם נמוך / סחרחורת בקימה',
    region: 'systemic',
    forbidFlags: ['rapid_position_change', 'head_below_heart'],
    avoidFlags: ['floor_transition'],
    note: 'מעברי תנוחה איטיים, שתייה מספקת, ולא לסיים אימון בעצירה פתאומית.',
  },
  pots: {
    name: 'POTS / דיסאוטונומיה',
    region: 'systemic',
    forbidFlags: ['rapid_position_change', 'head_below_heart'],
    avoidFlags: ['balance', 'floor_transition'],
    maxStress: { cardio: 2 },
    preferTags: ['low_impact', 'rehab_friendly'],
    prescribe: ['bike_intervals', 'leg_press', 'glute_bridge'],
    note: 'להתחיל בתנוחות אופקיות/נשענות ולהתקדם לעמידה לאורך שבועות. מלח ונוזלים לפי הנחיית רופא.',
  },
  post_exertional_malaise: {
    name: 'תשישות לאחר מאמץ (ME/CFS, קוביד ממושך)',
    region: 'systemic',
    forbidFlags: ['ballistic', 'impact', 'high_valsalva'],
    maxStress: { cardio: 1 },
    preferTags: ['rehab_friendly', 'low_impact'],
    note: 'קיצוב מאמץ (pacing) הוא העיקרון: לעצור הרבה לפני תחושת מאמץ, בלי לרדוף אחרי התקדמות. החמרה למחרת = לרדת בעומס.',
  },
  fibromyalgia: {
    name: 'פיברומיאלגיה',
    region: 'systemic',
    avoidFlags: ['impact', 'ballistic'],
    maxStress: { cardio: 2 },
    preferTags: ['low_impact', 'rehab_friendly', 'joint_friendly'],
    note: 'להתחיל נמוך מאוד ולהתקדם לאט מאוד; עקביות חשובה מעצימות. ימים גרועים — לצמצם, לא לוותר.',
  },
  anemia: {
    name: 'אנמיה',
    region: 'systemic',
    maxStress: { cardio: 2 },
    note: 'סבילות נמוכה למאמץ אירובי; מנוחות ארוכות יותר ומעקב אחרי סחרחורת וקוצר נשימה.',
  },
  oncology_treatment: {
    name: 'טיפול אונקולוגי / החלמה',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'impact', 'ballistic'],
    maxStress: { cardio: 2 },
    preferTags: ['rehab_friendly', 'joint_friendly', 'low_impact'],
    note: 'אימון מותאם משפר תפקוד ועייפות, אך לפי אישור האונקולוג. להימנע מכשל, מזיהומים ומעומס בימי טיפול.',
  },
  immunosuppressed: {
    name: 'מערכת חיסון מדוכאת',
    region: 'systemic',
    maxStress: { cardio: 2 },
    note: 'היגיינת ציוד קפדנית, הימנעות מאימון בעצימות מרבית ומשעות עומס בסטודיו.',
  },

  // ---------------------------------------------------------------- נוירולוגיה וחושים
  epilepsy: {
    name: 'אפילפסיה',
    region: 'systemic',
    forbidFlags: ['weight_over_head_free'],
    avoidFlags: ['unstable', 'balance'],
    note: 'ללא משקל חופשי מעל הפנים/הראש וללא אימון לבד בעמדות שבהן נפילה מסוכנת. מאמן נוכח לאורך האימון.',
  },
  post_concussion: {
    name: 'לאחר זעזוע מוח',
    region: 'systemic',
    forbidFlags: ['impact', 'ballistic', 'head_below_heart', 'rapid_position_change'],
    avoidFlags: ['balance', 'unstable'],
    maxStress: { cardio: 2 },
    note: 'חזרה מדורגת לפי פרוטוקול; כל החמרה בכאב ראש, סחרחורת או ראייה מחייבת עצירה.',
  },
  stroke_hemiparesis: {
    name: 'לאחר אירוע מוחי / חולשה חד-צדדית',
    region: 'systemic',
    forbidFlags: ['ballistic', 'impact', 'high_valsalva'],
    avoidFlags: ['unstable'],
    preferTags: ['rehab_friendly', 'beginner_friendly', 'joint_friendly'],
    prescribe: ['glute_bridge', 'band_row', 'wall_sit'],
    note: 'עבודה חד-צדדית עם תמיכה, דגש על הצד החלש ועל בטיחות שיווי משקל. אחיזה מותאמת בעת הצורך.',
  },
  multiple_sclerosis: {
    name: 'טרשת נפוצה',
    region: 'systemic',
    avoidFlags: ['balance', 'unstable', 'impact'],
    maxStress: { cardio: 2 },
    preferTags: ['rehab_friendly', 'low_impact', 'joint_friendly'],
    note: 'רגישות לחום — סטודיו ממוזג, הפסקות ושתייה. לעצור לפני עייפות מצטברת ולא אחריה.',
  },
  parkinsons: {
    name: 'פרקינסון',
    region: 'systemic',
    avoidFlags: ['unstable'],
    preferTags: ['rehab_friendly', 'beginner_friendly'],
    prescribe: ['step_up', 'glute_bridge', 'band_row'],
    note: 'תנועות גדולות ומודגשות, קצב חיצוני (מטרונום/ספירה), ותמיכה זמינה בכל תרגיל עמידה.',
  },
  vision_impairment: {
    name: 'לקות ראייה',
    region: 'systemic',
    forbidFlags: ['ballistic'],
    avoidFlags: ['balance', 'unstable'],
    preferTags: ['beginner_friendly', 'joint_friendly'],
    note: 'עדיפות למכונות ולמסלולי תנועה קבועים; הדרכה מילולית ומגע מכוון, סביבה פנויה ממכשולים.',
  },
  glaucoma: {
    name: 'גלאוקומה / לאחר ניתוח עיניים',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'head_below_heart'],
    avoidFlags: ['overhead'],
    note: 'ללא עצירת נשימה וללא תנוחות שבהן הראש מתחת לגובה הלב — שתיהן מעלות לחץ תוך-עיני.',
  },
  migraine: {
    name: 'מיגרנות',
    region: 'systemic',
    forbidFlags: ['high_valsalva', 'head_below_heart'],
    maxStress: { cardio: 2 },
    note: 'עלייה הדרגתית בעצימות, שתייה ותאורה נוחה; להימנע מקפיצות עצימות חדות.',
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
