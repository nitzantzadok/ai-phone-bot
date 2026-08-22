/**
 * English names for Israeli cities.
 *
 * A question generated in English must name the city in English. "Where should I go in
 * פתח תקווה for a toothache?" is not a question any English speaker types, and measuring
 * it produces a confidently meaningless result — the engine answers a query that has no
 * real-world demand behind it.
 *
 * Only cities we actually know are listed. An unknown city yields `null`, and the caller
 * is expected to drop the English variant rather than transliterate on the fly: a
 * mis-transliterated city name has exactly the same failure mode as leaving it in Hebrew.
 */
const ENGLISH_BY_HEBREW: Record<string, string> = {
  'תל אביב': 'Tel Aviv',
  'תל אביב-יפו': 'Tel Aviv',
  ירושלים: 'Jerusalem',
  חיפה: 'Haifa',
  'ראשון לציון': 'Rishon LeZion',
  'פתח תקווה': 'Petah Tikva',
  'פתח תקוה': 'Petah Tikva',
  אשדוד: 'Ashdod',
  נתניה: 'Netanya',
  'באר שבע': 'Beer Sheva',
  'בני ברק': 'Bnei Brak',
  חולון: 'Holon',
  'רמת גן': 'Ramat Gan',
  אשקלון: 'Ashkelon',
  רחובות: 'Rehovot',
  'בת ים': 'Bat Yam',
  'בית שמש': 'Beit Shemesh',
  'כפר סבא': 'Kfar Saba',
  הרצליה: 'Herzliya',
  חדרה: 'Hadera',
  מודיעין: 'Modiin',
  'מודיעין מכבים רעות': 'Modiin',
  נצרת: 'Nazareth',
  לוד: 'Lod',
  רמלה: 'Ramla',
  רעננה: 'Raanana',
  'ראש העין': 'Rosh HaAyin',
  'קרית גת': 'Kiryat Gat',
  'קריית גת': 'Kiryat Gat',
  'נס ציונה': 'Ness Ziona',
  עכו: 'Acre',
  אילת: 'Eilat',
  טבריה: 'Tiberias',
  'קרית אתא': 'Kiryat Ata',
  'קריית אתא': 'Kiryat Ata',
  נהריה: 'Nahariya',
  גבעתיים: 'Givatayim',
  'הוד השרון': 'Hod HaSharon',
  יבנה: 'Yavne',
  'קרית ביאליק': 'Kiryat Bialik',
  'אור יהודה': 'Or Yehuda',
  דימונה: 'Dimona',
  'קרית מוצקין': 'Kiryat Motzkin',
  'קרית ים': 'Kiryat Yam',
  צפת: 'Safed',
  'טירת כרמל': 'Tirat Carmel',
  יהוד: 'Yehud',
  אריאל: 'Ariel',
  כרמיאל: 'Karmiel',
  עפולה: 'Afula',
  רהט: 'Rahat',
  'מעלה אדומים': 'Maale Adumim',
}

const normalize = (city: string): string => city.trim().replace(/\s+/g, ' ')

/** The English name for a Hebrew city name, or null when we do not know it. */
export const englishCityName = (hebrewCity: string): string | null =>
  ENGLISH_BY_HEBREW[normalize(hebrewCity)] ?? null

/** True when the value contains no Hebrew letters, i.e. it needs no translation. */
export const containsHebrew = (value: string): boolean => /[֐-׿]/.test(value)

/** Every Hebrew city name we recognise, longest first so "קרית גת" wins over "קרית". */
const HEBREW_CITIES = Object.keys(ENGLISH_BY_HEBREW).sort((a, b) => b.length - a.length)

/**
 * Hebrew letters that attach to the front of a noun: "בחיפה" is ב + חיפה, and a business
 * writes "מוסך בחיפה" far more often than it writes the bare city name.
 */
const PREFIXES = '[\u05d1\u05d4\u05dc\u05de\u05d5\u05e9\u05db]?'
const HEBREW_LETTER = '[\u0590-\u05ff]'

const cityPattern = (city: string): RegExp =>
  new RegExp(`(?<!${HEBREW_LETTER})${PREFIXES}${city.replace(/ /g, '\\s+')}(?!${HEBREW_LETTER})`, 'g')

export interface CityMatch {
  readonly city: string
  readonly occurrences: number
}

/**
 * Finds Israeli cities named in Hebrew text.
 *
 * Vocabulary-based on purpose. Guessing that some noun is a place produces a business "in
 * ההסתדרות" from a street name, and a wrong city is worse than no city: it sends every
 * generated question to a town the business does not serve.
 *
 * Returns matches ordered by how often each city appears, so a page that names its own
 * city repeatedly outranks a passing reference to somewhere else.
 */
export const findCities = (text: string): readonly CityMatch[] => {
  const found: CityMatch[] = []
  for (const city of HEBREW_CITIES) {
    const occurrences = text.match(cityPattern(city))?.length ?? 0
    if (occurrences > 0) found.push({ city, occurrences })
  }
  // Longer names contain shorter ones ("תל אביב-יפו" and "תל אביב" both match): keep the
  // most specific reading and drop the substring.
  const kept: CityMatch[] = []
  for (const match of found) {
    if (kept.some((k) => k.city.includes(match.city))) continue
    kept.push(match)
  }
  return kept.sort((a, b) => b.occurrences - a.occurrences)
}
