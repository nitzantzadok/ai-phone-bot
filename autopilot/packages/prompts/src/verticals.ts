/**
 * Vertical configurations.
 *
 * Each vertical declares what its customers actually ask about: the services, occasions,
 * audiences and constraints that appear in real questions, plus the structured data and
 * page types a credible business in that vertical is expected to have.
 *
 * This is configuration, not logic. The optimization engine reads it; adding a vertical is
 * a data change, and the product is deliberately not hard-coded around restaurants
 * (brief section 4).
 */
export interface VerticalOccasion {
  readonly key: string
  readonly en: string
  readonly he: string
  /** Attribute keys an answer would need to satisfy this occasion. */
  readonly attributes: readonly string[]
}

export interface VerticalAudience {
  readonly key: string
  readonly en: string
  readonly he: string
}

export interface VerticalConfig {
  readonly id: string
  readonly labels: Readonly<Record<string, string>>
  /** Default schema.org type when the site declares none. */
  readonly entityType: string
  /** What the business IS, in customer words, per language. */
  readonly serviceTerms: Readonly<Record<string, readonly string[]>>
  /** Common differentiators customers add to a query. */
  readonly qualifiers: Readonly<Record<string, readonly string[]>>
  readonly occasions: readonly VerticalOccasion[]
  readonly audiences: readonly VerticalAudience[]
  /** Attribute keys that commonly appear as hard constraints in queries. */
  readonly constraints: readonly string[]
  readonly conversionActions: readonly string[]
  /** Structured data types worth having, if and only if the information is real. */
  readonly schemaTypes: readonly string[]
  readonly expectedPageTypes: readonly string[]
  /** Platforms where presence is commonly corroborated. Used in citation analysis. */
  readonly directories: readonly string[]
}

export const VERTICALS: Readonly<Record<string, VerticalConfig>> = {
  "restaurant": {
    "id": "restaurant",
    "labels": {
      "en": "Restaurant",
      "he": "מסעדה"
    },
    "entityType": "Restaurant",
    "serviceTerms": {
      "en": [
        "restaurant",
        "place to eat",
        "dinner spot"
      ],
      "he": [
        "מסעדה",
        "מקום לאכול בו",
        "מקום לארוחת ערב"
      ]
    },
    "qualifiers": {
      "en": [
        "Italian",
        "kosher",
        "vegan",
        "seafood",
        "chef"
      ],
      "he": [
        "איטלקית",
        "כשרה",
        "טבעונית",
        "דגים",
        "שף"
      ]
    },
    "occasions": [
      {
        "key": "first_date",
        "en": "a first date",
        "he": "דייט ראשון",
        "attributes": [
          "romantic",
          "quiet"
        ]
      },
      {
        "key": "anniversary",
        "en": "an anniversary",
        "he": "יום נישואין",
        "attributes": [
          "romantic",
          "upscale"
        ]
      },
      {
        "key": "birthday",
        "en": "a birthday dinner",
        "he": "ארוחת יום הולדת",
        "attributes": [
          "family_friendly"
        ]
      },
      {
        "key": "business_dinner",
        "en": "a business dinner",
        "he": "ארוחת ערב עסקית",
        "attributes": [
          "business_dinner",
          "quiet"
        ]
      },
      {
        "key": "family_meal",
        "en": "a family meal",
        "he": "ארוחה משפחתית",
        "attributes": [
          "family_friendly"
        ]
      },
      {
        "key": "friday_dinner",
        "en": "Friday night dinner",
        "he": "ארוחת שישי",
        "attributes": [
          "family_friendly",
          "kosher"
        ]
      }
    ],
    "audiences": [
      {
        "key": "couples",
        "en": "couples",
        "he": "זוגות"
      },
      {
        "key": "tourists",
        "en": "tourists",
        "he": "תיירים"
      },
      {
        "key": "families",
        "en": "families",
        "he": "משפחות"
      },
      {
        "key": "vegans",
        "en": "vegans",
        "he": "טבעונים"
      }
    ],
    "constraints": [
      "outdoor_seating",
      "vegan_options",
      "gluten_free",
      "kosher",
      "wheelchair_accessible",
      "parking",
      "late_night",
      "budget_friendly",
      "upscale"
    ],
    "conversionActions": [
      "reservation",
      "phone_call",
      "menu_view",
      "directions"
    ],
    "schemaTypes": [
      "Restaurant",
      "LocalBusiness",
      "Menu",
      "FAQPage",
      "BreadcrumbList",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "menu",
      "about",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "tripadvisor",
      "rest",
      "facebook"
    ]
  },
  "hotel": {
    "id": "hotel",
    "labels": {
      "en": "Hotel",
      "he": "מלון"
    },
    "entityType": "Hotel",
    "serviceTerms": {
      "en": [
        "hotel",
        "place to stay",
        "boutique hotel"
      ],
      "he": [
        "מלון",
        "מקום לינה",
        "מלון בוטיק"
      ]
    },
    "qualifiers": {
      "en": [
        "boutique",
        "family",
        "luxury",
        "budget"
      ],
      "he": [
        "בוטיק",
        "משפחתי",
        "יוקרתי",
        "זול"
      ]
    },
    "occasions": [
      {
        "key": "weekend",
        "en": "a weekend away",
        "he": "סוף שבוע",
        "attributes": [
          "sea_view",
          "pool"
        ]
      },
      {
        "key": "honeymoon",
        "en": "a honeymoon",
        "he": "ירח דבש",
        "attributes": [
          "boutique",
          "sea_view"
        ]
      },
      {
        "key": "business_trip",
        "en": "a business trip",
        "he": "נסיעת עסקים",
        "attributes": [
          "parking"
        ]
      },
      {
        "key": "family_holiday",
        "en": "a family holiday",
        "he": "חופשה משפחתית",
        "attributes": [
          "pool",
          "family_friendly"
        ]
      }
    ],
    "audiences": [
      {
        "key": "couples",
        "en": "couples",
        "he": "זוגות"
      },
      {
        "key": "families",
        "en": "families",
        "he": "משפחות"
      },
      {
        "key": "tourists",
        "en": "tourists",
        "he": "תיירים"
      }
    ],
    "constraints": [
      "sea_view",
      "pool",
      "pet_friendly",
      "parking",
      "wheelchair_accessible",
      "budget_friendly",
      "upscale",
      "kosher"
    ],
    "conversionActions": [
      "booking",
      "phone_call",
      "directions"
    ],
    "schemaTypes": [
      "Hotel",
      "LocalBusiness",
      "FAQPage",
      "BreadcrumbList",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "about",
      "contact",
      "faq",
      "booking"
    ],
    "directories": [
      "google_business_profile",
      "booking",
      "tripadvisor"
    ]
  },
  "lawyer": {
    "id": "lawyer",
    "labels": {
      "en": "Law firm",
      "he": "משרד עורכי דין"
    },
    "entityType": "LegalService",
    "serviceTerms": {
      "en": [
        "lawyer",
        "law firm",
        "attorney"
      ],
      "he": [
        "עורך דין",
        "משרד עורכי דין",
        "עורכת דין"
      ]
    },
    "qualifiers": {
      "en": [
        "family law",
        "labor law",
        "real estate",
        "criminal defense"
      ],
      "he": [
        "דיני משפחה",
        "דיני עבודה",
        "מקרקעין",
        "פלילי"
      ]
    },
    "occasions": [
      {
        "key": "divorce",
        "en": "a divorce",
        "he": "גירושין",
        "attributes": [
          "family_law"
        ]
      },
      {
        "key": "apartment_purchase",
        "en": "buying an apartment",
        "he": "רכישת דירה",
        "attributes": [
          "real_estate_law"
        ]
      },
      {
        "key": "dismissal",
        "en": "being dismissed from work",
        "he": "פיטורין",
        "attributes": [
          "labor_law"
        ]
      },
      {
        "key": "criminal_charge",
        "en": "a criminal charge",
        "he": "כתב אישום",
        "attributes": [
          "criminal_law"
        ]
      }
    ],
    "audiences": [
      {
        "key": "individuals",
        "en": "individuals",
        "he": "אנשים פרטיים"
      },
      {
        "key": "small_business",
        "en": "small businesses",
        "he": "עסקים קטנים"
      },
      {
        "key": "new_immigrants",
        "en": "new immigrants",
        "he": "עולים חדשים"
      }
    ],
    "constraints": [
      "free_consultation",
      "english_speaking",
      "russian_speaking",
      "emergency_service",
      "court_representation",
      "budget_friendly"
    ],
    "conversionActions": [
      "phone_call",
      "consultation_request",
      "contact_form"
    ],
    "schemaTypes": [
      "LegalService",
      "Attorney",
      "Service",
      "FAQPage",
      "BreadcrumbList",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "about",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "israel_bar",
      "facebook"
    ]
  },
  "dentist": {
    "id": "dentist",
    "labels": {
      "en": "Dental clinic",
      "he": "מרפאת שיניים"
    },
    "entityType": "Dentist",
    "serviceTerms": {
      "en": [
        "dentist",
        "dental clinic",
        "orthodontist"
      ],
      "he": [
        "רופא שיניים",
        "מרפאת שיניים",
        "אורתודונט"
      ]
    },
    "qualifiers": {
      "en": [
        "private",
        "children",
        "cosmetic"
      ],
      "he": [
        "פרטי",
        "לילדים",
        "אסתטי"
      ]
    },
    "occasions": [
      {
        "key": "toothache",
        "en": "a toothache",
        "he": "כאב שיניים",
        "attributes": [
          "emergency_service"
        ]
      },
      {
        "key": "braces",
        "en": "braces for a teenager",
        "he": "יישור שיניים לנוער",
        "attributes": [
          "orthodontics"
        ]
      },
      {
        "key": "implant",
        "en": "a dental implant",
        "he": "שתל דנטלי",
        "attributes": [
          "implants"
        ]
      }
    ],
    "audiences": [
      {
        "key": "children",
        "en": "children",
        "he": "ילדים"
      },
      {
        "key": "anxious_patients",
        "en": "anxious patients",
        "he": "מפחדים מרופא שיניים"
      }
    ],
    "constraints": [
      "emergency_service",
      "sedation",
      "pediatric_dentistry",
      "wheelchair_accessible",
      "parking",
      "budget_friendly",
      "english_speaking"
    ],
    "conversionActions": [
      "appointment",
      "phone_call"
    ],
    "schemaTypes": [
      "Dentist",
      "MedicalClinic",
      "Service",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "about",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "zap",
      "facebook"
    ]
  },
  "salon": {
    "id": "salon",
    "labels": {
      "en": "Beauty salon",
      "he": "מספרה"
    },
    "entityType": "BeautySalon",
    "serviceTerms": {
      "en": [
        "hair salon",
        "beauty salon",
        "barber"
      ],
      "he": [
        "מספרה",
        "סלון יופי",
        "ברבר"
      ]
    },
    "qualifiers": {
      "en": [
        "bridal",
        "men",
        "colour"
      ],
      "he": [
        "לכלות",
        "לגברים",
        "צבע"
      ]
    },
    "occasions": [
      {
        "key": "wedding",
        "en": "a wedding",
        "he": "חתונה",
        "attributes": [
          "bridal"
        ]
      },
      {
        "key": "event",
        "en": "an event",
        "he": "אירוע",
        "attributes": [
          "bridal"
        ]
      }
    ],
    "audiences": [
      {
        "key": "brides",
        "en": "brides",
        "he": "כלות"
      },
      {
        "key": "men",
        "en": "men",
        "he": "גברים"
      }
    ],
    "constraints": [
      "bridal",
      "keratin",
      "nails",
      "online_booking",
      "parking",
      "budget_friendly",
      "upscale"
    ],
    "conversionActions": [
      "appointment",
      "phone_call",
      "whatsapp"
    ],
    "schemaTypes": [
      "BeautySalon",
      "HealthAndBeautyBusiness",
      "Service",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "contact",
      "booking"
    ],
    "directories": [
      "google_business_profile",
      "facebook",
      "instagram"
    ]
  },
  "gym": {
    "id": "gym",
    "labels": {
      "en": "Gym",
      "he": "חדר כושר"
    },
    "entityType": "SportsActivityLocation",
    "serviceTerms": {
      "en": [
        "gym",
        "fitness studio",
        "training studio"
      ],
      "he": [
        "חדר כושר",
        "סטודיו לכושר",
        "סטודיו אימונים"
      ]
    },
    "qualifiers": {
      "en": [
        "boutique",
        "24 hour",
        "women only"
      ],
      "he": [
        "בוטיק",
        "24 שעות",
        "לנשים"
      ]
    },
    "occasions": [
      {
        "key": "getting_back_in_shape",
        "en": "getting back in shape",
        "he": "חזרה לכושר",
        "attributes": [
          "personal_training"
        ]
      },
      {
        "key": "postnatal",
        "en": "training after birth",
        "he": "אימון אחרי לידה",
        "attributes": [
          "personal_training",
          "women_only"
        ]
      }
    ],
    "audiences": [
      {
        "key": "beginners",
        "en": "beginners",
        "he": "מתחילים"
      },
      {
        "key": "women",
        "en": "women",
        "he": "נשים"
      }
    ],
    "constraints": [
      "personal_training",
      "group_classes",
      "women_only",
      "open_24h",
      "parking",
      "budget_friendly"
    ],
    "conversionActions": [
      "trial_session",
      "phone_call",
      "membership"
    ],
    "schemaTypes": [
      "SportsActivityLocation",
      "ExerciseGym",
      "Service",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "contact",
      "booking"
    ],
    "directories": [
      "google_business_profile",
      "facebook"
    ]
  },
  "home_services": {
    "id": "home_services",
    "labels": {
      "en": "Home services",
      "he": "שירותי בית"
    },
    "entityType": "HomeAndConstructionBusiness",
    "serviceTerms": {
      "en": [
        "plumber",
        "electrician",
        "locksmith",
        "air conditioning technician"
      ],
      "he": [
        "אינסטלטור",
        "חשמלאי",
        "מנעולן",
        "טכנאי מיזוג"
      ]
    },
    "qualifiers": {
      "en": [
        "emergency",
        "licensed",
        "24 hour"
      ],
      "he": [
        "חירום",
        "מורשה",
        "24 שעות"
      ]
    },
    "occasions": [
      {
        "key": "burst_pipe",
        "en": "a burst pipe",
        "he": "נזילה",
        "attributes": [
          "emergency_service"
        ]
      },
      {
        "key": "locked_out",
        "en": "being locked out",
        "he": "נעילת דלת",
        "attributes": [
          "emergency_service"
        ]
      },
      {
        "key": "ac_broken",
        "en": "a broken air conditioner",
        "he": "מזגן מקולקל",
        "attributes": [
          "same_day_service"
        ]
      }
    ],
    "audiences": [
      {
        "key": "homeowners",
        "en": "homeowners",
        "he": "בעלי דירות"
      },
      {
        "key": "landlords",
        "en": "landlords",
        "he": "משכירי דירות"
      }
    ],
    "constraints": [
      "emergency_service",
      "same_day_service",
      "licensed_insured",
      "warranty",
      "budget_friendly"
    ],
    "conversionActions": [
      "phone_call",
      "whatsapp",
      "quote_request"
    ],
    "schemaTypes": [
      "HomeAndConstructionBusiness",
      "Service",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "zap",
      "facebook"
    ]
  },
  "clinic": {
    "id": "clinic",
    "labels": {
      "en": "Clinic",
      "he": "מרפאה"
    },
    "entityType": "MedicalClinic",
    "serviceTerms": {
      "en": [
        "clinic",
        "physiotherapy clinic",
        "private doctor"
      ],
      "he": [
        "מרפאה",
        "מרפאת פיזיותרפיה",
        "רופא פרטי"
      ]
    },
    "qualifiers": {
      "en": [
        "private",
        "children",
        "sports"
      ],
      "he": [
        "פרטית",
        "לילדים",
        "ספורט"
      ]
    },
    "occasions": [
      {
        "key": "back_pain",
        "en": "back pain",
        "he": "כאבי גב",
        "attributes": [
          "emergency_service"
        ]
      },
      {
        "key": "sports_injury",
        "en": "a sports injury",
        "he": "פציעת ספורט",
        "attributes": [
          "same_day_service"
        ]
      }
    ],
    "audiences": [
      {
        "key": "adults",
        "en": "adults",
        "he": "מבוגרים"
      },
      {
        "key": "children",
        "en": "children",
        "he": "ילדים"
      }
    ],
    "constraints": [
      "emergency_service",
      "wheelchair_accessible",
      "parking",
      "english_speaking",
      "russian_speaking",
      "budget_friendly"
    ],
    "conversionActions": [
      "appointment",
      "phone_call"
    ],
    "schemaTypes": [
      "MedicalClinic",
      "Physician",
      "Service",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "about",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "zap"
    ]
  },
  "real_estate": {
    "id": "real_estate",
    "labels": {
      "en": "Real estate agency",
      "he": "משרד תיווך"
    },
    "entityType": "RealEstateAgent",
    "serviceTerms": {
      "en": [
        "real estate agent",
        "realtor",
        "property agency"
      ],
      "he": [
        "מתווך",
        "משרד תיווך",
        "סוכן נדלן"
      ]
    },
    "qualifiers": {
      "en": [
        "luxury",
        "rental",
        "commercial"
      ],
      "he": [
        "יוקרה",
        "השכרה",
        "מסחרי"
      ]
    },
    "occasions": [
      {
        "key": "buying_first_home",
        "en": "buying a first apartment",
        "he": "רכישת דירה ראשונה",
        "attributes": [
          "free_consultation"
        ]
      },
      {
        "key": "renting_out",
        "en": "renting out an apartment",
        "he": "השכרת דירה",
        "attributes": []
      }
    ],
    "audiences": [
      {
        "key": "first_time_buyers",
        "en": "first time buyers",
        "he": "רוכשי דירה ראשונה"
      },
      {
        "key": "investors",
        "en": "investors",
        "he": "משקיעים"
      }
    ],
    "constraints": [
      "english_speaking",
      "russian_speaking",
      "free_consultation",
      "budget_friendly"
    ],
    "conversionActions": [
      "phone_call",
      "contact_form",
      "valuation_request"
    ],
    "schemaTypes": [
      "RealEstateAgent",
      "Service",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "service",
      "about",
      "contact"
    ],
    "directories": [
      "google_business_profile",
      "yad2",
      "madlan"
    ]
  },
  "event": {
    "id": "event",
    "labels": {
      "en": "Event business",
      "he": "עסק אירועים"
    },
    "entityType": "EventVenue",
    "serviceTerms": {
      "en": [
        "event venue",
        "wedding venue",
        "catering"
      ],
      "he": [
        "אולם אירועים",
        "גן אירועים",
        "קייטרינג"
      ]
    },
    "qualifiers": {
      "en": [
        "boutique",
        "kosher",
        "outdoor"
      ],
      "he": [
        "בוטיק",
        "כשר",
        "בחוץ"
      ]
    },
    "occasions": [
      {
        "key": "wedding",
        "en": "a wedding",
        "he": "חתונה",
        "attributes": [
          "kosher"
        ]
      },
      {
        "key": "bar_mitzvah",
        "en": "a bar mitzvah",
        "he": "בר מצווה",
        "attributes": [
          "kosher",
          "family_friendly"
        ]
      },
      {
        "key": "corporate_event",
        "en": "a company event",
        "he": "אירוע חברה",
        "attributes": [
          "parking"
        ]
      }
    ],
    "audiences": [
      {
        "key": "couples",
        "en": "couples",
        "he": "זוגות"
      },
      {
        "key": "companies",
        "en": "companies",
        "he": "חברות"
      }
    ],
    "constraints": [
      "kosher",
      "parking",
      "wheelchair_accessible",
      "outdoor_seating",
      "budget_friendly",
      "upscale"
    ],
    "conversionActions": [
      "site_visit",
      "phone_call",
      "quote_request"
    ],
    "schemaTypes": [
      "EventVenue",
      "LocalBusiness",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "about",
      "contact",
      "faq"
    ],
    "directories": [
      "google_business_profile",
      "facebook"
    ]
  },
  "tourism": {
    "id": "tourism",
    "labels": {
      "en": "Tourism business",
      "he": "עסק תיירות"
    },
    "entityType": "TouristAttraction",
    "serviceTerms": {
      "en": [
        "tour",
        "guided tour",
        "attraction"
      ],
      "he": [
        "סיור",
        "טיול מודרך",
        "אטרקציה"
      ]
    },
    "qualifiers": {
      "en": [
        "walking",
        "food",
        "history"
      ],
      "he": [
        "רגלי",
        "קולינרי",
        "היסטורי"
      ]
    },
    "occasions": [
      {
        "key": "day_trip",
        "en": "a day trip",
        "he": "טיול יום",
        "attributes": []
      },
      {
        "key": "family_activity",
        "en": "a family activity",
        "he": "פעילות משפחתית",
        "attributes": [
          "family_friendly"
        ]
      }
    ],
    "audiences": [
      {
        "key": "tourists",
        "en": "tourists",
        "he": "תיירים"
      },
      {
        "key": "families",
        "en": "families",
        "he": "משפחות"
      }
    ],
    "constraints": [
      "english_speaking",
      "wheelchair_accessible",
      "family_friendly",
      "budget_friendly"
    ],
    "conversionActions": [
      "booking",
      "phone_call"
    ],
    "schemaTypes": [
      "TouristAttraction",
      "Event",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "about",
      "contact",
      "booking"
    ],
    "directories": [
      "google_business_profile",
      "tripadvisor"
    ]
  },
  "local_business": {
    "id": "local_business",
    "labels": {
      "en": "Local business",
      "he": "עסק מקומי"
    },
    "entityType": "LocalBusiness",
    "serviceTerms": {
      "en": [
        "business",
        "service",
        "shop"
      ],
      "he": [
        "עסק",
        "שירות",
        "חנות"
      ]
    },
    "qualifiers": {
      "en": [
        "local",
        "recommended"
      ],
      "he": [
        "מקומי",
        "מומלץ"
      ]
    },
    "occasions": [],
    "audiences": [
      {
        "key": "locals",
        "en": "locals",
        "he": "תושבי האזור"
      }
    ],
    "constraints": [
      "wheelchair_accessible",
      "parking",
      "budget_friendly",
      "english_speaking"
    ],
    "conversionActions": [
      "phone_call",
      "contact_form",
      "directions"
    ],
    "schemaTypes": [
      "LocalBusiness",
      "Service",
      "FAQPage",
      "WebSite"
    ],
    "expectedPageTypes": [
      "home",
      "about",
      "contact"
    ],
    "directories": [
      "google_business_profile",
      "facebook"
    ]
  }
}


export const VERTICAL_IDS = Object.keys(VERTICALS)

export const getVertical = (id: string): VerticalConfig =>
  VERTICALS[id] ?? VERTICALS.local_business!

/**
 * Best-effort vertical inference from an entity type and site text.
 *
 * Used only to pick sensible onboarding defaults; the customer confirms it before anything
 * is generated from it, because guessing a business's industry wrong is both obvious and
 * embarrassing.
 */
export const inferVertical = (entityType: string | null, text: string): string => {
  if (entityType) {
    const match = Object.values(VERTICALS).find((v) => v.entityType === entityType)
    if (match) return match.id
  }
  const haystack = text.toLowerCase()
  let best: { id: string; hits: number } | null = null
  for (const vertical of Object.values(VERTICALS)) {
    if (vertical.id === 'local_business') continue
    let hits = 0
    for (const terms of Object.values(vertical.serviceTerms)) {
      for (const term of terms) if (haystack.includes(term.toLowerCase())) hits++
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { id: vertical.id, hits }
  }
  return best?.id ?? 'local_business'
}
