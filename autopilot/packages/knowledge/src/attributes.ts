/**
 * Canonical attribute vocabulary.
 *
 * Attributes, not keywords, are what this product optimizes (brief §50). A prompt like
 * "romantic Italian restaurant for a date" is a demand for the `romantic` attribute; the
 * evidence graph answers whether the business can credibly claim it.
 *
 * The vocabulary is cross-tenant on purpose: `romantic` must mean the same thing for every
 * restaurant, or the intervention-outcome dataset that becomes the moat is worthless.
 *
 * `evidenceTerms` are the phrases that count as evidence on a page, per language. They are
 * matched against real page content — they are never injected into a customer's site to
 * game a model.
 */
export interface AttributeDefinition {
  readonly key: string
  /** ambience | amenity | audience | use_case | specialty | dietary | service | access | price | hours | trust */
  readonly category: string
  /** Vertical this attribute belongs to; null means it applies to any business. */
  readonly vertical: string | null
  readonly labels: Readonly<Record<string, string>>
  readonly evidenceTerms: Readonly<Record<string, readonly string[]>>
}

export const ATTRIBUTE_VOCABULARY: readonly AttributeDefinition[] = [
  {
    key: 'romantic',
    category: 'ambience',
    vertical: 'restaurant',
    labels: { en: "Romantic", he: "רומנטי" },
    evidenceTerms: {
      en: ["romantic", "date night", "intimate dinner", "couples"],
      he: ["רומנטי", "רומנטית", "דייט", "זוגות"],
    },
  },
  {
    key: 'quiet',
    category: 'ambience',
    vertical: 'restaurant',
    labels: { en: "Quiet", he: "שקט" },
    evidenceTerms: {
      en: ["quiet", "peaceful", "calm atmosphere"],
      he: ["שקט", "שקטה", "רגוע"],
    },
  },
  {
    key: 'outdoor_seating',
    category: 'amenity',
    vertical: 'restaurant',
    labels: { en: "Outdoor seating", he: "ישיבה בחוץ" },
    evidenceTerms: {
      en: ["outdoor seating", "terrace", "patio", "garden seating"],
      he: ["ישיבה בחוץ", "מרפסת", "חצר"],
    },
  },
  {
    key: 'family_friendly',
    category: 'audience',
    vertical: 'restaurant',
    labels: { en: "Family friendly", he: "ידידותי למשפחות" },
    evidenceTerms: {
      en: ["family friendly", "kids menu", "children welcome"],
      he: ["ידידותי למשפחות", "תפריט ילדים", "מתאים לילדים"],
    },
  },
  {
    key: 'business_dinner',
    category: 'use_case',
    vertical: 'restaurant',
    labels: { en: "Business dining", he: "ארוחות עסקיות" },
    evidenceTerms: {
      en: ["business dinner", "business lunch", "corporate dining"],
      he: ["ארוחה עסקית", "עסקית", "פגישות עסקיות"],
    },
  },
  {
    key: 'handmade_pasta',
    category: 'specialty',
    vertical: 'restaurant',
    labels: { en: "Handmade pasta", he: "פסטה בעבודת יד" },
    evidenceTerms: {
      en: ["handmade pasta", "fresh pasta", "pasta made in house"],
      he: ["פסטה בעבודת יד", "פסטה טרייה", "פסטה ביתית"],
    },
  },
  {
    key: 'vegan_options',
    category: 'dietary',
    vertical: 'restaurant',
    labels: { en: "Vegan options", he: "אפשרויות טבעוניות" },
    evidenceTerms: {
      en: ["vegan", "plant based", "vegan menu"],
      he: ["טבעוני", "טבעונית", "תפריט טבעוני"],
    },
  },
  {
    key: 'gluten_free',
    category: 'dietary',
    vertical: 'restaurant',
    labels: { en: "Gluten free", he: "ללא גלוטן" },
    evidenceTerms: {
      en: ["gluten free", "celiac"],
      he: ["ללא גלוטן", "צליאק"],
    },
  },
  {
    key: 'kosher',
    category: 'dietary',
    vertical: null,
    labels: { en: "Kosher", he: "כשר" },
    evidenceTerms: {
      en: ["kosher", "kosher certified", "rabbinate"],
      he: ["כשר", "כשרות", "תעודת כשרות"],
    },
  },
  {
    key: 'wine_list',
    category: 'amenity',
    vertical: 'restaurant',
    labels: { en: "Wine list", he: "רשימת יינות" },
    evidenceTerms: {
      en: ["wine list", "sommelier", "natural wine"],
      he: ["רשימת יינות", "יין", "סומלייה"],
    },
  },
  {
    key: 'chef_tasting',
    category: 'specialty',
    vertical: 'restaurant',
    labels: { en: "Tasting menu", he: "תפריט טעימות" },
    evidenceTerms: {
      en: ["tasting menu", "chef menu", "degustation"],
      he: ["תפריט טעימות", "תפריט שף"],
    },
  },
  {
    key: 'late_night',
    category: 'hours',
    vertical: 'restaurant',
    labels: { en: "Open late", he: "פתוח עד מאוחר" },
    evidenceTerms: {
      en: ["open late", "late night", "after midnight"],
      he: ["פתוח עד מאוחר", "שעות מאוחרות"],
    },
  },
  {
    key: 'breakfast',
    category: 'use_case',
    vertical: 'restaurant',
    labels: { en: "Breakfast", he: "ארוחת בוקר" },
    evidenceTerms: {
      en: ["breakfast", "brunch"],
      he: ["ארוחת בוקר", "בראנץ"],
    },
  },
  {
    key: 'delivery',
    category: 'service',
    vertical: 'restaurant',
    labels: { en: "Delivery", he: "משלוחים" },
    evidenceTerms: {
      en: ["delivery", "takeaway", "take away"],
      he: ["משלוח", "משלוחים", "טייק אווי"],
    },
  },
  {
    key: 'reservations',
    category: 'service',
    vertical: 'restaurant',
    labels: { en: "Reservations", he: "הזמנת מקום" },
    evidenceTerms: {
      en: ["reservations", "book a table", "reserve"],
      he: ["הזמנת מקום", "הזמנת שולחן", "להזמין"],
    },
  },
  {
    key: 'wheelchair_accessible',
    category: 'access',
    vertical: null,
    labels: { en: "Wheelchair accessible", he: "נגיש לכיסא גלגלים" },
    evidenceTerms: {
      en: ["wheelchair accessible", "accessible entrance", "step free"],
      he: ["נגיש", "נגישות", "כיסא גלגלים"],
    },
  },
  {
    key: 'parking',
    category: 'amenity',
    vertical: null,
    labels: { en: "Parking", he: "חניה" },
    evidenceTerms: {
      en: ["parking", "free parking", "valet"],
      he: ["חניה", "חנייה"],
    },
  },
  {
    key: 'english_speaking',
    category: 'service',
    vertical: null,
    labels: { en: "English spoken", he: "דוברי אנגלית" },
    evidenceTerms: {
      en: ["english spoken", "english speaking staff"],
      he: ["דוברי אנגלית", "אנגלית"],
    },
  },
  {
    key: 'russian_speaking',
    category: 'service',
    vertical: null,
    labels: { en: "Russian spoken", he: "דוברי רוסית" },
    evidenceTerms: {
      en: ["russian spoken", "russian speaking"],
      he: ["דוברי רוסית", "רוסית"],
    },
  },
  {
    key: 'arabic_speaking',
    category: 'service',
    vertical: null,
    labels: { en: "Arabic spoken", he: "דוברי ערבית" },
    evidenceTerms: {
      en: ["arabic spoken", "arabic speaking"],
      he: ["דוברי ערבית", "ערבית"],
    },
  },
  {
    key: 'budget_friendly',
    category: 'price',
    vertical: null,
    labels: { en: "Affordable", he: "מחיר נוח" },
    evidenceTerms: {
      en: ["affordable", "budget friendly", "good value", "cheap"],
      he: ["מחיר נוח", "משתלם", "זול"],
    },
  },
  {
    key: 'upscale',
    category: 'price',
    vertical: null,
    labels: { en: "Upscale", he: "יוקרתי" },
    evidenceTerms: {
      en: ["upscale", "fine dining", "premium", "luxury"],
      he: ["יוקרתי", "יוקרה", "פרימיום"],
    },
  },
  {
    key: 'open_saturday',
    category: 'hours',
    vertical: null,
    labels: { en: "Open on Saturday", he: "פתוח בשבת" },
    evidenceTerms: {
      en: ["open saturday", "open on shabbat"],
      he: ["פתוח בשבת", "פעיל בשבת"],
    },
  },
  {
    key: 'emergency_service',
    category: 'service',
    vertical: null,
    labels: { en: "Emergency service", he: "שירות חירום" },
    evidenceTerms: {
      en: ["emergency", "24/7", "urgent", "same day"],
      he: ["חירום", "24/7", "דחוף", "באותו יום"],
    },
  },
  {
    key: 'free_consultation',
    category: 'service',
    vertical: null,
    labels: { en: "Free consultation", he: "ייעוץ ראשוני חינם" },
    evidenceTerms: {
      en: ["free consultation", "no obligation consultation"],
      he: ["ייעוץ חינם", "פגישת ייעוץ ללא עלות"],
    },
  },
  {
    key: 'online_booking',
    category: 'service',
    vertical: null,
    labels: { en: "Online booking", he: "הזמנה אונליין" },
    evidenceTerms: {
      en: ["book online", "online booking", "schedule online"],
      he: ["הזמנה אונליין", "קביעת תור אונליין"],
    },
  },
  {
    key: 'family_law',
    category: 'specialty',
    vertical: 'lawyer',
    labels: { en: "Family law", he: "דיני משפחה" },
    evidenceTerms: {
      en: ["family law", "divorce", "custody", "alimony"],
      he: ["דיני משפחה", "גירושין", "משמורת", "מזונות"],
    },
  },
  {
    key: 'real_estate_law',
    category: 'specialty',
    vertical: 'lawyer',
    labels: { en: "Real estate law", he: "דיני מקרקעין" },
    evidenceTerms: {
      en: ["real estate law", "property law", "conveyancing"],
      he: ["דיני מקרקעין", "נדלן", "עסקאות נדלן"],
    },
  },
  {
    key: 'labor_law',
    category: 'specialty',
    vertical: 'lawyer',
    labels: { en: "Labor law", he: "דיני עבודה" },
    evidenceTerms: {
      en: ["labor law", "employment law", "wrongful dismissal"],
      he: ["דיני עבודה", "פיטורין", "זכויות עובדים"],
    },
  },
  {
    key: 'criminal_law',
    category: 'specialty',
    vertical: 'lawyer',
    labels: { en: "Criminal law", he: "דין פלילי" },
    evidenceTerms: {
      en: ["criminal law", "criminal defense"],
      he: ["דין פלילי", "הגנה פלילית"],
    },
  },
  {
    key: 'immigration_law',
    category: 'specialty',
    vertical: 'lawyer',
    labels: { en: "Immigration law", he: "הגירה" },
    evidenceTerms: {
      en: ["immigration law", "visa", "citizenship"],
      he: ["הגירה", "אשרה", "אזרחות"],
    },
  },
  {
    key: 'court_representation',
    category: 'service',
    vertical: 'lawyer',
    labels: { en: "Court representation", he: "ייצוג בבית משפט" },
    evidenceTerms: {
      en: ["court representation", "litigation", "trial"],
      he: ["ייצוג בבית משפט", "ליטיגציה"],
    },
  },
  {
    key: 'implants',
    category: 'specialty',
    vertical: 'dentist',
    labels: { en: "Dental implants", he: "שתלים" },
    evidenceTerms: {
      en: ["dental implants", "implantology"],
      he: ["שתלים", "השתלות שיניים"],
    },
  },
  {
    key: 'orthodontics',
    category: 'specialty',
    vertical: 'dentist',
    labels: { en: "Orthodontics", he: "יישור שיניים" },
    evidenceTerms: {
      en: ["orthodontics", "braces", "aligners"],
      he: ["יישור שיניים", "גשר", "קשתיות"],
    },
  },
  {
    key: 'pediatric_dentistry',
    category: 'specialty',
    vertical: 'dentist',
    labels: { en: "Pediatric dentistry", he: "רפואת שיניים לילדים" },
    evidenceTerms: {
      en: ["pediatric dentistry", "children dentist"],
      he: ["רפואת שיניים לילדים", "רופא שיניים לילדים"],
    },
  },
  {
    key: 'sedation',
    category: 'service',
    vertical: 'dentist',
    labels: { en: "Sedation available", he: "טיפול בהרדמה" },
    evidenceTerms: {
      en: ["sedation", "anxiety free", "pain free"],
      he: ["הרדמה", "ללא כאב", "טיפול בהרגעה"],
    },
  },
  {
    key: 'personal_training',
    category: 'service',
    vertical: 'gym',
    labels: { en: "Personal training", he: "אימון אישי" },
    evidenceTerms: {
      en: ["personal training", "personal trainer", "1 on 1"],
      he: ["אימון אישי", "מאמן אישי"],
    },
  },
  {
    key: 'group_classes',
    category: 'service',
    vertical: 'gym',
    labels: { en: "Group classes", he: "שיעורי קבוצה" },
    evidenceTerms: {
      en: ["group classes", "spinning", "yoga classes"],
      he: ["שיעורי קבוצה", "ספינינג", "שיעורי יוגה"],
    },
  },
  {
    key: 'women_only',
    category: 'audience',
    vertical: 'gym',
    labels: { en: "Women only", he: "לנשים בלבד" },
    evidenceTerms: {
      en: ["women only", "ladies only"],
      he: ["לנשים בלבד", "נשים"],
    },
  },
  {
    key: 'open_24h',
    category: 'hours',
    vertical: 'gym',
    labels: { en: "Open 24 hours", he: "פתוח 24 שעות" },
    evidenceTerms: {
      en: ["open 24 hours", "24/7 gym"],
      he: ["פתוח 24 שעות", "24 שעות"],
    },
  },
  {
    key: 'bridal',
    category: 'specialty',
    vertical: 'salon',
    labels: { en: "Bridal styling", he: "עיצוב לכלות" },
    evidenceTerms: {
      en: ["bridal", "wedding hair", "bridal makeup"],
      he: ["כלות", "תסרוקת כלה", "איפור כלות"],
    },
  },
  {
    key: 'keratin',
    category: 'specialty',
    vertical: 'salon',
    labels: { en: "Keratin treatment", he: "החלקת קרטין" },
    evidenceTerms: {
      en: ["keratin", "hair straightening", "smoothing"],
      he: ["קרטין", "החלקה"],
    },
  },
  {
    key: 'nails',
    category: 'service',
    vertical: 'salon',
    labels: { en: "Nails", he: "מניקור" },
    evidenceTerms: {
      en: ["nails", "manicure", "pedicure", "gel"],
      he: ["מניקור", "פדיקור", "לק ג'ל"],
    },
  },
  {
    key: 'sea_view',
    category: 'amenity',
    vertical: 'hotel',
    labels: { en: "Sea view", he: "נוף לים" },
    evidenceTerms: {
      en: ["sea view", "ocean view", "beachfront"],
      he: ["נוף לים", "מול הים", "על החוף"],
    },
  },
  {
    key: 'boutique',
    category: 'ambience',
    vertical: 'hotel',
    labels: { en: "Boutique", he: "בוטיק" },
    evidenceTerms: {
      en: ["boutique hotel", "design hotel"],
      he: ["מלון בוטיק", "בוטיק"],
    },
  },
  {
    key: 'pool',
    category: 'amenity',
    vertical: 'hotel',
    labels: { en: "Pool", he: "בריכה" },
    evidenceTerms: {
      en: ["swimming pool", "rooftop pool"],
      he: ["בריכה", "בריכת שחייה"],
    },
  },
  {
    key: 'pet_friendly',
    category: 'amenity',
    vertical: 'hotel',
    labels: { en: "Pet friendly", he: "ידידותי לחיות מחמד" },
    evidenceTerms: {
      en: ["pet friendly", "dogs allowed"],
      he: ["ידידותי לחיות", "כלבים מותרים"],
    },
  },
  {
    key: 'same_day_service',
    category: 'service',
    vertical: 'home_services',
    labels: { en: "Same day service", he: "שירות באותו יום" },
    evidenceTerms: {
      en: ["same day service", "today", "immediate"],
      he: ["באותו יום", "מיידי", "היום"],
    },
  },
  {
    key: 'licensed_insured',
    category: 'trust',
    vertical: 'home_services',
    labels: { en: "Licensed and insured", he: "מורשה ומבוטח" },
    evidenceTerms: {
      en: ["licensed", "insured", "certified technician"],
      he: ["מורשה", "מבוטח", "טכנאי מוסמך"],
    },
  },
  {
    key: 'warranty',
    category: 'trust',
    vertical: null,
    labels: { en: "Warranty", he: "אחריות" },
    evidenceTerms: {
      en: ["warranty", "guarantee"],
      he: ["אחריות", "התחייבות"],
    },
  },
]

const BY_KEY = new Map(ATTRIBUTE_VOCABULARY.map((a) => [a.key, a]))

export const attributeByKey = (key: string): AttributeDefinition | undefined => BY_KEY.get(key)

/** Attributes relevant to a vertical: its own plus the universal ones. */
export const attributesForVertical = (vertical: string): readonly AttributeDefinition[] =>
  ATTRIBUTE_VOCABULARY.filter((a) => a.vertical === null || a.vertical === vertical)

export const attributeLabel = (key: string, language: string): string => {
  const attr = BY_KEY.get(key)
  if (!attr) return key.replace(/_/g, ' ')
  return attr.labels[language] ?? attr.labels.en ?? key
}

/**
 * Finds attribute evidence in a block of text.
 *
 * Deliberately simple and explainable: a matched term is shown to the customer as the
 * reason we believe the attribute is (or is not) present on their site. A statistical
 * model here would be marginally more accurate and far less defensible.
 */
export interface AttributeMatch {
  readonly key: string
  readonly matchedTerms: readonly string[]
  readonly occurrences: number
}

export const findAttributeEvidence = (
  text: string,
  vertical: string,
  languages: readonly string[] = ['en', 'he'],
): AttributeMatch[] => {
  const haystack = text.toLowerCase()
  const matches: AttributeMatch[] = []

  for (const attr of attributesForVertical(vertical)) {
    const matchedTerms: string[] = []
    let occurrences = 0
    for (const language of languages) {
      for (const term of attr.evidenceTerms[language] ?? []) {
        const needle = term.toLowerCase()
        let index = haystack.indexOf(needle)
        let count = 0
        while (index !== -1) {
          count++
          index = haystack.indexOf(needle, index + needle.length)
        }
        if (count > 0) {
          matchedTerms.push(term)
          occurrences += count
        }
      }
    }
    if (matchedTerms.length > 0) matches.push({ key: attr.key, matchedTerms, occurrences })
  }

  return matches
}
