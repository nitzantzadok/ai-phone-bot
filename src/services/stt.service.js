/**
 * Hebrew Speech-to-Text Service
 * Uses Google Cloud Speech-to-Text with Hebrew optimization
 */

const speech = require('@google-cloud/speech');
const logger = require('../utils/logger');
const { Error: ErrorModel } = require('../models');

class SpeechToTextService {
  constructor() {
    this.client = new speech.SpeechClient();
    
    // Hebrew-optimized configuration
    this.defaultConfig = {
      encoding: 'MULAW',
      sampleRateHertz: 8000,
      languageCode: 'he-IL',
      model: 'phone_call', // Optimized for phone audio
      useEnhanced: true,
      enableAutomaticPunctuation: true,
      enableSpokenPunctuation: false,
      // Hebrew-specific adaptations
      speechContexts: [{
        phrases: [
          // Common restaurant/business phrases
          'הזמנה', 'שולחן', 'אנשים', 'שעה', 'תאריך',
          'מחר', 'היום', 'הערב', 'בוקר', 'צהריים', 'ערב',
          'כשר', 'צמחוני', 'טבעוני', 'אלרגיה',
          'תפריט', 'מנה', 'קינוח', 'שתייה',
          'חשבון', 'תשלום', 'כרטיס אשראי',
          'בבקשה', 'תודה', 'סליחה',
          // Numbers
          'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה',
          'שישה', 'שבעה', 'שמונה', 'תשעה', 'עשרה',
          // Time expressions
          'בשעה', 'וחצי', 'ורבע', 'פחות רבע'
        ],
        boost: 15
      }],
      // Profanity filter for business context
      profanityFilter: false,
      // Enable word-level confidence
      enableWordConfidence: true,
      // Enable word timestamps
      enableWordTimeOffsets: true
    };
  }

  /**
   * Transcribe audio from Twilio stream
   * @param {Buffer} audioBuffer - Audio data buffer
   * @param {Object} options - Additional options
   * @returns {Object} Transcription result
   */
  async transcribe(audioBuffer, options = {}) {
    const startTime = Date.now();
    
    try {
      const config = {
        ...this.defaultConfig,
        ...options.config
      };

      // Add business-specific phrases if provided
      if (options.businessPhrases && options.businessPhrases.length > 0) {
        config.speechContexts.push({
          phrases: options.businessPhrases,
          boost: 20
        });
      }

      const request = {
        config,
        audio: {
          content: audioBuffer.toString('base64')
        }
      };

      const [response] = await this.client.recognize(request);
      
      const transcription = this.processResponse(response);
      
      logger.debug('STT transcription completed', {
        duration: Date.now() - startTime,
        confidence: transcription.confidence,
        text: transcription.text
      });

      return transcription;

    } catch (error) {
      logger.error('STT error:', error);
      
      // Log error to database
      await ErrorModel.logError({
        category: 'stt',
        severity: 'high',
        code: error.code,
        message: error.message,
        details: {
          audioSize: audioBuffer?.length,
          options
        },
        business: options.businessId
      });

      // Return empty result on error
      return {
        text: '',
        textHebrew: '',
        confidence: 0,
        words: [],
        error: true,
        errorMessage: error.message
      };
    }
  }

  /**
   * Create a streaming recognition session for real-time transcription
   * @param {Object} options - Stream options
   * @returns {Object} Stream recognizer
   */
  createStreamingRecognition(options = {}) {
    const config = {
      ...this.defaultConfig,
      ...options.config
    };

    const streamingConfig = {
      config,
      interimResults: true,
      singleUtterance: false
    };

    // Add business-specific phrases
    if (options.businessPhrases && options.businessPhrases.length > 0) {
      config.speechContexts.push({
        phrases: options.businessPhrases,
        boost: 20
      });
    }

    const recognizeStream = this.client
      .streamingRecognize(streamingConfig)
      .on('error', (error) => {
        logger.error('Streaming STT error:', error);
        if (options.onError) options.onError(error);
      })
      .on('data', (data) => {
        const result = this.processStreamingResponse(data);
        if (options.onData) options.onData(result);
      });

    return recognizeStream;
  }

  /**
   * Process Google STT response
   */
  processResponse(response) {
    if (!response.results || response.results.length === 0) {
      return {
        text: '',
        textHebrew: '',
        confidence: 0,
        words: [],
        alternatives: []
      };
    }

    const result = response.results[0];
    const alternative = result.alternatives[0];

    return {
      text: alternative.transcript || '',
      textHebrew: alternative.transcript || '',
      confidence: alternative.confidence || 0,
      words: (alternative.words || []).map(word => ({
        word: word.word,
        startTime: this.parseTime(word.startTime),
        endTime: this.parseTime(word.endTime),
        confidence: word.confidence
      })),
      alternatives: result.alternatives.slice(1).map(alt => ({
        text: alt.transcript,
        confidence: alt.confidence
      })),
      isFinal: result.isFinal
    };
  }

  /**
   * Process streaming response
   */
  processStreamingResponse(data) {
    if (!data.results || data.results.length === 0) {
      return {
        text: '',
        confidence: 0,
        isFinal: false
      };
    }

    const result = data.results[0];
    const alternative = result.alternatives[0];

    return {
      text: alternative.transcript || '',
      confidence: alternative.confidence || 0,
      isFinal: result.isFinal,
      stability: result.stability
    };
  }

  /**
   * Parse Google's time format
   */
  parseTime(time) {
    if (!time) return 0;
    const seconds = parseInt(time.seconds || 0);
    const nanos = parseInt(time.nanos || 0);
    return seconds + nanos / 1e9;
  }

  /**
   * Get Hebrew number from text
   * Converts spoken Hebrew numbers to digits
   */
  parseHebrewNumber(text) {
    const hebrewNumbers = {
      'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2,
      'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4,
      'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6,
      'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'תשעה': 9, 'תשע': 9,
      'עשרה': 10, 'עשר': 10, 'אחד עשר': 11, 'שנים עשר': 12,
      'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50
    };

    const normalized = text.trim().toLowerCase();
    
    // Check direct match
    if (hebrewNumbers.hasOwnProperty(normalized)) {
      return hebrewNumbers[normalized];
    }

    // Check if it's already a number
    const parsed = parseInt(text);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // Try to parse compound numbers (e.g., "עשרים ושניים")
    const parts = normalized.split(/\s+ו?/);
    let total = 0;
    
    for (const part of parts) {
      if (hebrewNumbers.hasOwnProperty(part)) {
        total += hebrewNumbers[part];
      }
    }

    return total > 0 ? total : null;
  }

  /**
   * Parse Hebrew time expression
   * Returns time in HH:MM format
   */
  parseHebrewTime(text) {
    // Pattern: "בשעה X" or just time
    const patterns = [
      /(\d{1,2}):(\d{2})/,  // Digital format
      /(\d{1,2}) ?וחצי/,    // X:30
      /(\d{1,2}) ?ורבע/,    // X:15
      /(\d{1,2}) ?פחות רבע/, // X:45 (of previous hour)
      /בשעה (\d{1,2})/,     // "at X o'clock"
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let hour = parseInt(match[1]);
        let minute = parseInt(match[2]) || 0;

        if (text.includes('וחצי')) minute = 30;
        if (text.includes('ורבע')) minute = 15;
        if (text.includes('פחות רבע')) {
          hour = hour - 1;
          minute = 45;
        }

        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }

    // Try Hebrew number words
    const hebrewHour = this.parseHebrewNumber(text.replace(/בשעה|וחצי|ורבע/g, '').trim());
    if (hebrewHour && hebrewHour >= 0 && hebrewHour <= 23) {
      let minute = 0;
      if (text.includes('וחצי')) minute = 30;
      if (text.includes('ורבע')) minute = 15;
      return `${hebrewHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }

    return null;
  }

  /**
   * Parse Hebrew date expression
   * Returns a Date object
   */
  parseHebrewDate(text) {
    const today = new Date();
    const normalized = text.trim();

    // Common date expressions
    if (normalized.includes('היום')) {
      return today;
    }
    if (normalized.includes('מחר')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (normalized.includes('מחרתיים')) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      return dayAfter;
    }

    // Days of the week
    const daysHebrew = {
      'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3,
      'חמישי': 4, 'שישי': 5, 'שבת': 6
    };

    for (const [dayName, dayNum] of Object.entries(daysHebrew)) {
      if (normalized.includes(dayName)) {
        const result = new Date(today);
        const currentDay = today.getDay();
        let daysToAdd = dayNum - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        result.setDate(result.getDate() + daysToAdd);
        return result;
      }
    }

    // Try to parse DD/MM or DD.MM format
    const datePattern = /(\d{1,2})[\/\.](\d{1,2})/;
    const match = normalized.match(datePattern);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const result = new Date(today.getFullYear(), month, day);
      if (result < today) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }

    return null;
  }
}

module.exports = new SpeechToTextService();
