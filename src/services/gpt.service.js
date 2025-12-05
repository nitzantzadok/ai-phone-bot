/**
 * GPT Conversation Engine
 * Handles AI conversations with Hebrew optimization
 * Smart model selection for cost optimization
 */

const OpenAI = require('openai');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const { Error: ErrorModel } = require('../models');

class GPTService {
  constructor() {
    // Initialize OpenAI only if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } else {
      this.openai = null;
      console.warn('⚠️ OPENAI_API_KEY not set - GPT service will not work');
    }

    // FAQ cache for instant responses
    this.faqCache = new NodeCache({ stdTTL: 3600 }); // 1 hour

    // Models configuration
    this.models = {
      fast: process.env.OPENAI_MODEL_FAST || 'gpt-3.5-turbo',
      smart: process.env.OPENAI_MODEL_SMART || 'gpt-4-turbo-preview'
    };

    // Intent patterns for routing
    this.intentPatterns = this.initializeIntentPatterns();
  }

  /**
   * Generate a response for the conversation
   * @param {Object} params - Conversation parameters
   * @returns {Object} Response with text and metadata
   */
  async generateResponse(params) {
    const {
      userMessage,
      conversationHistory = [],
      business,
      callContext = {}
    } = params;

    const startTime = Date.now();

    try {
      // 1. Check FAQ cache first
      const faqResponse = await this.checkFAQCache(userMessage, business);
      if (faqResponse) {
        logger.debug('FAQ cache hit');
        return {
          text: faqResponse.answer,
          intent: faqResponse.intent,
          source: 'faq_cache',
          tokensUsed: 0,
          model: 'cache',
          responseTime: Date.now() - startTime
        };
      }

      // 2. Detect intent to decide model and context
      const intent = this.detectIntent(userMessage);

      // 3. Select model based on complexity
      const model = this.selectModel(intent, userMessage, conversationHistory);

      // 4. Build system prompt
      const systemPrompt = this.buildSystemPrompt(business, callContext);

      // 5. Build messages array
      const messages = this.buildMessages(systemPrompt, conversationHistory, userMessage);

      // 6. Generate response
      const completion = await this.openai.chat.completions.create({
        model,
        messages,
        max_tokens: business.aiConfig?.maxResponseTokens || 150,
        temperature: business.aiConfig?.temperature || 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const response = completion.choices[0].message.content;
      const tokensUsed = completion.usage.total_tokens;

      // 7. Extract any structured data (reservations, etc.)
      const extractedData = await this.extractStructuredData(response, intent, userMessage);

      // 8. Cache FAQ if applicable
      if (intent === 'faq' || intent === 'hours' || intent === 'location') {
        this.cacheResponse(userMessage, response, intent, business._id);
      }

      logger.info('GPT response generated', {
        model,
        intent,
        tokensUsed,
        responseTime: Date.now() - startTime
      });

      return {
        text: response,
        intent,
        extractedData,
        tokensUsed,
        model,
        responseTime: Date.now() - startTime,
        source: 'gpt'
      };

    } catch (error) {
      logger.error('GPT error:', error);

      await ErrorModel.logError({
        category: 'gpt',
        severity: 'high',
        code: error.code || error.status,
        message: error.message,
        details: {
          userMessage: userMessage?.substring(0, 100),
          model: params.model
        },
        business: business?._id
      });

      // Return fallback response
      return {
        text: 'סליחה, לא הצלחתי להבין. אפשר לחזור על זה?',
        intent: 'error',
        error: true,
        errorMessage: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Build system prompt based on business context
   */
  buildSystemPrompt(business, callContext = {}) {
    const timeGreeting = business.getTimeBasedGreeting();
    const isOpen = business.isCurrentlyOpen();

    let prompt = `אתה ${business.botPersonality?.name || 'עוזר'} - עוזר טלפוני ישראלי מקצועי של ${business.nameHebrew}.

## הנחיות שפה וסגנון:
- דבר עברית רהוטה וטבעית כמו ישראלי אמיתי
- השתמש בניקוד מנטלי (הגה נכון כל מילה)
- היה ${business.botPersonality?.tone === 'professional' ? 'מקצועי ומנומס' : 'ידידותי וחם'}
- תשובות קצרות וענייניות (2-3 משפטים מקסימום)
- אל תחזור על עצמך

## פרטי העסק:
- שם: ${business.nameHebrew}
- סוג: ${business.type === 'restaurant' ? 'מסעדה' : business.type}
- כתובת: ${business.address?.street}, ${business.address?.city}
- טלפון: ${business.phone}
${business.website ? `- אתר: ${business.website}` : ''}

## שעות פעילות:
${business.businessHours.map(h => 
  `- יום ${this.getDayName(h.day)}: ${h.isOpen ? `${h.openTime}-${h.closeTime}` : 'סגור'}`
).join('\n')}

סטטוס נוכחי: ${isOpen ? 'פתוח' : 'סגור'}

## הזמנות:
${business.reservationSettings?.enabled ? `- הזמנות פעילות
- גודל שולחן מקסימלי: ${business.reservationSettings.maxPartySize} אנשים
- הזמנה עד ${business.reservationSettings.advanceBookingDays} ימים מראש` : '- הזמנות לא פעילות'}

## תפריט/שירותים עיקריים:
${business.menuItems?.slice(0, 10).map(item => 
  `- ${item.nameHebrew}: ${item.price}₪`
).join('\n') || 'לא הוגדר תפריט'}

## שאלות נפוצות:
${business.faqs?.slice(0, 5).map(faq => 
  `ש: ${faq.question}\nת: ${faq.answer}`
).join('\n\n') || ''}

## הנחיות התנהגות:
1. תמיד ברך בהתאם לשעה (${timeGreeting})
2. אם מבקשים הזמנה - בקש: תאריך, שעה, מספר אנשים, שם, טלפון
3. אם לא מבין - בקש הבהרה בנימוס
4. אם השאלה מחוץ לתחום - הפנה לטלפון העסק
5. סיים תמיד בצורה חיובית

${business.botPersonality?.customInstructions || ''}

## הקשר השיחה הנוכחית:
${callContext.isReturningCaller ? '- לקוח חוזר' : '- לקוח חדש'}
${callContext.previousIntent ? `- כוונה קודמת: ${callContext.previousIntent}` : ''}`;

    return prompt;
  }

  /**
   * Build messages array for the API
   */
  buildMessages(systemPrompt, conversationHistory, userMessage) {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (last 10 turns max)
    const recentHistory = conversationHistory.slice(-10);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    return messages;
  }

  /**
   * Detect user intent from message
   */
  detectIntent(message) {
    const normalized = message.toLowerCase().trim();

    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
          if (pattern.test(normalized)) return intent;
        } else {
          if (normalized.includes(pattern)) return intent;
        }
      }
    }

    return 'general';
  }

  /**
   * Initialize intent patterns
   */
  initializeIntentPatterns() {
    return {
      reservation: [
        'הזמנה', 'להזמין', 'שולחן', 'מקום', 'תור',
        /רוצ[הי] להזמין/, /אפשר (להזמין|לקבוע)/,
        'ריזרב', 'בוקינג'
      ],
      hours: [
        'שעות פתיחה', 'מתי פתוח', 'מתי סוגר', 'שעות פעילות',
        'פתוח היום', 'פתוחים', 'עד מתי', 'משעה'
      ],
      menu: [
        'תפריט', 'מנות', 'אוכל', 'מה יש', 'מחירים',
        'צמחוני', 'טבעוני', 'כשר', 'אלרגיה'
      ],
      location: [
        'איפה', 'כתובת', 'מיקום', 'איך מגיעים', 'חניה',
        'נווט', 'וויז', 'גוגל מפות'
      ],
      cancel: [
        'לבטל', 'ביטול', 'לשנות הזמנה', 'לדחות'
      ],
      confirm: [
        'כן', 'נכון', 'בסדר', 'מאשר', 'אישור',
        'בדיוק', 'זהו', 'טוב'
      ],
      deny: [
        'לא', 'אל', 'לא רוצה', 'ביי', 'להתראות',
        'תודה זהו', 'סיימתי'
      ],
      complaint: [
        'תלונה', 'בעיה', 'לא מרוצה', 'גרוע', 'נורא',
        'מתלונן', 'רוצה מנהל'
      ],
      faq: [
        'יש', 'האם', 'אפשר', 'מקבלים', 'עובד'
      ]
    };
  }

  /**
   * Select model based on task complexity
   */
  selectModel(intent, message, history) {
    // Use fast model for simple tasks
    const simpleIntents = ['hours', 'location', 'confirm', 'deny', 'faq'];
    
    if (simpleIntents.includes(intent)) {
      return this.models.fast;
    }

    // Use fast model for short conversations
    if (history.length < 4 && message.length < 50) {
      return this.models.fast;
    }

    // Use smart model for complex tasks
    const complexIntents = ['reservation', 'complaint', 'cancel'];
    
    if (complexIntents.includes(intent)) {
      // But only if complexity warrants it
      if (history.length > 6 || message.length > 100) {
        return this.models.smart;
      }
    }

    // Default to fast model
    return this.models.fast;
  }

  /**
   * Check FAQ cache for instant response
   */
  async checkFAQCache(message, business) {
    const cacheKey = `faq:${business._id}:${this.normalizeForCache(message)}`;
    return this.faqCache.get(cacheKey);
  }

  /**
   * Cache a response for future FAQ matching
   */
  cacheResponse(message, response, intent, businessId) {
    const cacheKey = `faq:${businessId}:${this.normalizeForCache(message)}`;
    this.faqCache.set(cacheKey, {
      answer: response,
      intent,
      cachedAt: new Date()
    });
  }

  /**
   * Normalize message for cache key
   */
  normalizeForCache(message) {
    return message
      .toLowerCase()
      .trim()
      .replace(/[?!.,]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 100);
  }

  /**
   * Extract structured data from conversation
   */
  async extractStructuredData(response, intent, userMessage) {
    if (intent !== 'reservation') return null;

    // Try to extract reservation details
    const extractionPrompt = `Extract reservation details from this Hebrew conversation.
User said: "${userMessage}"
Bot responded: "${response}"

Return a JSON object with any found details:
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null", 
  "partySize": number or null,
  "customerName": "string or null",
  "customerPhone": "string or null",
  "specialRequests": "string or null"
}

Only include fields that were clearly mentioned. Return valid JSON only.`;

    try {
      const extraction = await this.openai.chat.completions.create({
        model: this.models.fast,
        messages: [{ role: 'user', content: extractionPrompt }],
        max_tokens: 200,
        temperature: 0
      });

      const jsonStr = extraction.choices[0].message.content;
      return JSON.parse(jsonStr);
    } catch (error) {
      logger.debug('Could not extract structured data:', error.message);
      return null;
    }
  }

  /**
   * Generate call summary
   */
  async generateCallSummary(conversation, business) {
    const conversationText = conversation
      .map(turn => `${turn.role === 'user' ? 'לקוח' : 'בוט'}: ${turn.content}`)
      .join('\n');

    const prompt = `סכם את שיחת הטלפון הבאה בעברית ב-2-3 משפטים:

${conversationText}

סיכום:`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.models.fast,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating summary:', error);
      return 'לא ניתן ליצור סיכום';
    }
  }

  /**
   * Analyze sentiment of conversation
   */
  async analyzeSentiment(text) {
    const prompt = `Analyze the sentiment of this Hebrew text.
Text: "${text}"

Rate from -1 (very negative) to 1 (very positive).
Return only a number.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.models.fast,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0
      });

      const score = parseFloat(completion.choices[0].message.content);
      return isNaN(score) ? 0 : Math.max(-1, Math.min(1, score));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Detect missing business information from conversations
   */
  async detectMissingInfo(conversation, business) {
    const conversationText = conversation
      .map(turn => `${turn.role}: ${turn.content}`)
      .join('\n');

    const prompt = `Analyze this Hebrew conversation and identify any information about the business that was requested but not available.

Conversation:
${conversationText}

Business info available:
- Hours: ${business.businessHours ? 'Yes' : 'No'}
- Menu: ${business.menuItems?.length > 0 ? 'Yes' : 'No'}
- Reservations: ${business.reservationSettings?.enabled ? 'Yes' : 'No'}
- FAQs: ${business.faqs?.length || 0}

Return a JSON array of missing information:
[{"field": "fieldName", "context": "what customer was asking", "priority": "high/medium/low"}]

Return empty array [] if nothing is missing.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.models.fast,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get Hebrew day name
   */
  getDayName(day) {
    const days = {
      sunday: 'ראשון',
      monday: 'שני',
      tuesday: 'שלישי',
      wednesday: 'רביעי',
      thursday: 'חמישי',
      friday: 'שישי',
      saturday: 'שבת'
    };
    return days[day] || day;
  }

  /**
   * Get cost estimate for tokens
   */
  estimateCost(tokensUsed, model) {
    const costs = {
      'gpt-3.5-turbo': 0.002 / 1000,
      'gpt-4-turbo-preview': 0.03 / 1000,
      'gpt-4': 0.06 / 1000
    };
    
    const usdCost = tokensUsed * (costs[model] || costs['gpt-3.5-turbo']);
    return usdCost * 3.7; // Convert to ILS
  }
}

module.exports = new GPTService();
