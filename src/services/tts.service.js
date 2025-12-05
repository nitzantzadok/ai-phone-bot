/**
 * Hebrew Text-to-Speech Service
 * Uses Google Cloud TTS with high-quality Hebrew voices
 * Implements proper Hebrew nikud and natural speech patterns
 */

const textToSpeech = require('@google-cloud/text-to-speech');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { Error: ErrorModel } = require('../models');

class TextToSpeechService {
  constructor() {
    this.client = new textToSpeech.TextToSpeechClient();
    
    // Cache for TTS responses (reduces costs significantly)
    // TTL: 24 hours, check period: 1 hour
    this.cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
    
    // Available Hebrew voices (best quality)
    this.voices = {
      female: {
        wavenet: 'he-IL-Wavenet-A', // Best quality female
        standard: 'he-IL-Standard-A',
        neural: 'he-IL-Neural2-A' // Newest, most natural
      },
      male: {
        wavenet: 'he-IL-Wavenet-B', // Best quality male
        standard: 'he-IL-Standard-B',
        neural: 'he-IL-Neural2-B'
      }
    };

    // Hebrew nikud patterns for proper pronunciation
    this.nikudPatterns = this.initializeNikudPatterns();
    
    // Common phrases cache (pre-generate these)
    this.commonPhrases = new Map();
  }

  /**
   * Convert text to speech
   * @param {string} text - Text to synthesize
   * @param {Object} options - Voice options
   * @returns {Buffer} Audio buffer
   */
  async synthesize(text, options = {}) {
    const startTime = Date.now();
    
    try {
      // Apply Hebrew optimizations
      const processedText = this.processHebrewText(text, options);
      
      // Generate cache key
      const cacheKey = this.generateCacheKey(processedText, options);
      
      // Check cache
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('TTS cache hit', { cacheKey: cacheKey.substring(0, 20) });
        return cached;
      }

      // Select voice
      const voice = this.selectVoice(options);
      
      // Build SSML for better control
      const ssml = this.buildSSML(processedText, options);

      const request = {
        input: { ssml },
        voice: {
          languageCode: 'he-IL',
          name: voice,
          ssmlGender: options.gender === 'male' ? 'MALE' : 'FEMALE'
        },
        audioConfig: {
          audioEncoding: options.encoding || 'MP3',
          speakingRate: options.speakingRate || 1.0,
          pitch: options.pitch || 0,
          // Audio profile optimized for phone
          effectsProfileId: ['telephony-class-application'],
          sampleRateHertz: options.sampleRate || 8000
        }
      };

      const [response] = await this.client.synthesizeSpeech(request);
      
      // Cache the result
      this.cache.set(cacheKey, response.audioContent);
      
      logger.debug('TTS synthesis completed', {
        duration: Date.now() - startTime,
        textLength: text.length,
        voice,
        cached: false
      });

      return response.audioContent;

    } catch (error) {
      logger.error('TTS error:', error);
      
      await ErrorModel.logError({
        category: 'tts',
        severity: 'high',
        code: error.code,
        message: error.message,
        details: { text: text.substring(0, 100), options },
        business: options.businessId
      });

      // Return a fallback audio or throw
      throw error;
    }
  }

  /**
   * Synthesize with Twilio-compatible format (mulaw)
   */
  async synthesizeForTwilio(text, options = {}) {
    return this.synthesize(text, {
      ...options,
      encoding: 'MULAW',
      sampleRate: 8000
    });
  }

  /**
   * Generate audio URL for Twilio TwiML
   * Stores the audio and returns a URL
   */
  async generateAudioUrl(text, options = {}) {
    const audioBuffer = await this.synthesize(text, options);
    
    // In production, you'd upload to a CDN or serve from your server
    // For now, we'll use base64 data URI which Twilio doesn't support directly
    // So we need to serve this via an endpoint
    
    const cacheKey = this.generateCacheKey(text, options);
    this.cache.set(`audio:${cacheKey}`, audioBuffer, 3600); // 1 hour
    
    return `${process.env.API_URL}/api/audio/${cacheKey}`;
  }

  /**
   * Select the best voice based on options
   */
  selectVoice(options = {}) {
    const gender = options.gender || 'female';
    const quality = options.quality || 'wavenet';
    
    // Prefer Neural2 for most natural sound, fall back to Wavenet
    if (this.voices[gender].neural && quality !== 'standard') {
      return this.voices[gender].neural;
    }
    
    return this.voices[gender][quality] || this.voices[gender].wavenet;
  }

  /**
   * Process Hebrew text for optimal pronunciation
   */
  processHebrewText(text, options = {}) {
    let processed = text;
    
    // Add nikud for better pronunciation if not already present
    if (!this.hasNikud(text) && options.addNikud !== false) {
      processed = this.addBasicNikud(processed);
    }
    
    // Replace numbers with Hebrew words for natural speech
    processed = this.convertNumbersToHebrew(processed);
    
    // Handle abbreviations
    processed = this.expandAbbreviations(processed);
    
    // Add natural pauses
    processed = this.addNaturalPauses(processed);
    
    return processed;
  }

  /**
   * Build SSML for enhanced speech control
   */
  buildSSML(text, options = {}) {
    const rate = options.speakingRate || 1.0;
    const pitch = options.pitch || 0;
    
    // Split into sentences for better prosody
    const sentences = text.split(/([.!?])/);
    
    let ssml = '<speak>';
    
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i];
      const punctuation = sentences[i + 1] || '';
      
      if (!sentence.trim()) continue;
      
      // Add prosody based on sentence type
      if (punctuation === '?') {
        // Question - rising intonation
        ssml += `<prosody pitch="+${pitch + 2}st" rate="${rate}">${sentence}${punctuation}</prosody>`;
      } else if (punctuation === '!') {
        // Exclamation - emphasis
        ssml += `<prosody pitch="+${pitch + 1}st" rate="${rate * 1.1}">${sentence}${punctuation}</prosody>`;
      } else {
        // Statement
        ssml += `<prosody pitch="${pitch}st" rate="${rate}">${sentence}${punctuation}</prosody>`;
      }
      
      // Add break between sentences
      ssml += '<break time="300ms"/>';
    }
    
    ssml += '</speak>';
    
    return ssml;
  }

  /**
   * Check if text contains Hebrew nikud
   */
  hasNikud(text) {
    // Hebrew nikud Unicode range: 0x0591-0x05C7
    return /[\u0591-\u05C7]/.test(text);
  }

  /**
   * Add basic nikud to common words
   */
  addBasicNikud(text) {
    // This is a simplified version - in production, use a proper nikud library
    const nikudMap = this.nikudPatterns;
    
    let result = text;
    for (const [word, nikudWord] of Object.entries(nikudMap)) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      result = result.replace(regex, nikudWord);
    }
    
    return result;
  }

  /**
   * Initialize nikud patterns for common words
   */
  initializeNikudPatterns() {
    return {
      // Greetings
      'שלום': 'שָׁלוֹם',
      'בוקר טוב': 'בּוֹקֶר טוֹב',
      'ערב טוב': 'עֶרֶב טוֹב',
      'תודה': 'תּוֹדָה',
      'בבקשה': 'בְּבַקָּשָׁה',
      'סליחה': 'סְלִיחָה',
      
      // Restaurant terms
      'הזמנה': 'הַזְמָנָה',
      'שולחן': 'שֻׁלְחָן',
      'תפריט': 'תַּפְרִיט',
      'מנה': 'מָנָה',
      'חשבון': 'חֶשְׁבּוֹן',
      
      // Time
      'היום': 'הַיּוֹם',
      'מחר': 'מָחָר',
      'שעה': 'שָׁעָה',
      'דקות': 'דַּקּוֹת',
      
      // Numbers
      'אחד': 'אֶחָד',
      'שניים': 'שְׁנַיִם',
      'שלושה': 'שְׁלוֹשָׁה',
      'ארבעה': 'אַרְבָּעָה',
      'חמישה': 'חֲמִישָׁה'
    };
  }

  /**
   * Convert numbers to Hebrew words for natural speech
   */
  convertNumbersToHebrew(text) {
    const numberWords = {
      0: 'אֶפֶס', 1: 'אֶחָד', 2: 'שְׁנַיִם', 3: 'שְׁלוֹשָׁה',
      4: 'אַרְבָּעָה', 5: 'חֲמִישָׁה', 6: 'שִׁישָׁה', 7: 'שִׁבְעָה',
      8: 'שְׁמוֹנָה', 9: 'תִּשְׁעָה', 10: 'עֲשָׂרָה',
      11: 'אַחַד עָשָׂר', 12: 'שְׁנֵים עָשָׂר',
      20: 'עֶשְׂרִים', 30: 'שְׁלוֹשִׁים', 40: 'אַרְבָּעִים',
      50: 'חֲמִישִׁים'
    };

    // Replace standalone numbers (not in time format)
    return text.replace(/(?<!\d[:\/])\b(\d{1,2})\b(?![:\/]\d)/g, (match, num) => {
      const n = parseInt(num);
      if (numberWords[n]) return numberWords[n];
      if (n < 20) return numberWords[10] + ' ו' + numberWords[n - 10];
      if (n < 100) {
        const tens = Math.floor(n / 10) * 10;
        const ones = n % 10;
        if (ones === 0) return numberWords[tens];
        return numberWords[tens] + ' ו' + numberWords[ones];
      }
      return match;
    });
  }

  /**
   * Expand common abbreviations
   */
  expandAbbreviations(text) {
    const abbreviations = {
      "ד''ר": 'דּוֹקְטוֹר',
      "פרופ'": 'פְּרוֹפֶסוֹר',
      'וכו': 'וְכוּלֵי',
      'וכד': 'וְכַדּוֹמֶה',
      'ש"ח': 'שְׁקָלִים',
      'טל': 'טֶלֶפוֹן'
    };

    let result = text;
    for (const [abbr, full] of Object.entries(abbreviations)) {
      result = result.replace(new RegExp(abbr, 'g'), full);
    }
    
    return result;
  }

  /**
   * Add natural pauses at punctuation
   */
  addNaturalPauses(text) {
    return text
      .replace(/,/g, ', ')
      .replace(/\./g, '. ')
      .replace(/!/g, '! ')
      .replace(/\?/g, '? ');
  }

  /**
   * Generate cache key
   */
  generateCacheKey(text, options) {
    const data = JSON.stringify({ text, options });
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Pre-cache common phrases for faster response
   */
  async precacheCommonPhrases(businessId, phrases) {
    const options = { businessId };
    
    for (const phrase of phrases) {
      try {
        await this.synthesize(phrase, options);
        logger.info(`Pre-cached phrase: ${phrase.substring(0, 30)}...`);
      } catch (error) {
        logger.warn(`Failed to pre-cache phrase: ${phrase}`, error);
      }
    }
  }

  /**
   * Get common phrases for a business type
   */
  getCommonPhrases(businessType = 'restaurant') {
    const phrases = {
      restaurant: [
        'שָׁלוֹם! אֵיךְ אוּכַל לַעֲזוֹר?',
        'בְּאֵיזֶה תַּאֲרִיךְ תִּרְצוּ לְהַזְמִין?',
        'לְכַמָּה אֲנָשִׁים?',
        'בְּאֵיזוֹ שָׁעָה?',
        'הַהַזְמָנָה אוּשְׁרָה! נִשְׂמַח לְאָרֵחַ אֶתְכֶם.',
        'רֶגַע אֶחָד, אֲנִי בּוֹדֶקֶת.',
        'הָאִם יֵשׁ מַשֶּׁהוּ נוֹסָף שֶׁאוּכַל לַעֲזוֹר בּוֹ?',
        'תּוֹדָה שֶׁהִתְקַשַּׁרְתָּ! יוֹם נָעִים.',
        'סְלִיחָה, לֹא הֵבַנְתִּי. אֶפְשָׁר לַחֲזוֹר עַל זֶה?',
        'אֲנַחְנוּ פְּתוּחִים מִשָּׁעָה תֵּשַׁע בַּבֹּקֶר עַד עֶשֶׂר בָּעֶרֶב.'
      ],
      salon: [
        'שָׁלוֹם! בָּרוּכִים הַבָּאִים לְ',
        'לְאֵיזֶה טִיפּוּל תִּרְצוּ לְהַזְמִין תּוֹר?',
        'הָאִם יֵשׁ לָכֶם הַעֲדָפָה לְסַפָּר מְסוּיָּם?',
        'הַתּוֹר נִקְבַּע בְּהַצְלָחָה!',
      ],
      clinic: [
        'שָׁלוֹם, מִרְפָּאַת',
        'הָאִם זֶה תּוֹר לְמַעֲקָב אוֹ בִּיקּוּר רִאשׁוֹן?',
        'הָאִם יֵשׁ הֲפְנָיָה מֵרוֹפֵא מְשַׁפְּחָה?',
      ]
    };

    return phrases[businessType] || phrases.restaurant;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      hitRate: this.cache.getStats().hits / 
               (this.cache.getStats().hits + this.cache.getStats().misses) || 0
    };
  }
}

module.exports = new TextToSpeechService();
