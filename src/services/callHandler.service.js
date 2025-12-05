/**
 * Call Handler Service
 * Main orchestrator for handling phone calls
 * Manages the conversation flow and integrates all services
 */

const twilio = require('twilio');
const logger = require('../utils/logger');
const sttService = require('./stt.service');
const ttsService = require('./tts.service');
const gptService = require('./gpt.service');
const { Business, Call, Reservation, Error: ErrorModel } = require('../models');

class CallHandlerService {
  constructor() {
    // Initialize Twilio only if credentials are available
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    } else {
      this.twilioClient = null;
      console.warn('⚠️ Twilio credentials not set - Call handler will not work');
    }

    // Active calls storage (in production, use Redis)
    this.activeCalls = new Map();

    // Conversation timeout (silence detection)
    this.conversationTimeout = 10000; // 10 seconds
    this.maxCallDuration = 600000; // 10 minutes
  }

  /**
   * Handle incoming call
   * @param {Object} params - Twilio webhook parameters
   * @param {Object} business - Business document
   * @returns {string} TwiML response
   */
  async handleIncomingCall(params, business) {
    const { CallSid, From, To } = params;
    const startTime = Date.now();

    try {
      // Create call record
      const call = await Call.create({
        business: business._id,
        botId: business.botId,
        twilioCallSid: CallSid,
        callerNumber: From,
        calledNumber: To,
        status: 'initiated',
        startTime: new Date()
      });

      // Initialize call state
      this.activeCalls.set(CallSid, {
        callId: call._id,
        businessId: business._id,
        conversation: [],
        currentIntent: null,
        reservationData: {},
        turnCount: 0,
        startTime
      });

      // Generate greeting
      const greeting = this.generateGreeting(business);

      // Pre-synthesize greeting for faster response
      const audioUrl = await ttsService.generateAudioUrl(greeting, {
        businessId: business._id,
        gender: business.botPersonality?.gender || 'female'
      });

      // Build TwiML response
      const twiml = new twilio.twiml.VoiceResponse();

      // Play greeting
      twiml.play(audioUrl);

      // Gather speech input
      const gather = twiml.gather({
        input: 'speech',
        language: 'he-IL',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: true,
        action: `${process.env.API_URL}/webhook/${business.botId}/respond`,
        method: 'POST'
      });

      // Fallback if no input
      twiml.say({
        language: 'he-IL',
        voice: 'Google.he-IL-Wavenet-A'
      }, 'לא שמעתי. להתראות.');

      logger.info('Incoming call handled', {
        callSid: CallSid,
        businessId: business._id,
        caller: From
      });

      // Emit real-time event
      this.emitCallEvent('call:started', {
        callSid: CallSid,
        businessId: business._id,
        caller: From,
        timestamp: new Date()
      });

      return twiml.toString();

    } catch (error) {
      logger.error('Error handling incoming call:', error);

      await ErrorModel.logError({
        category: 'twilio',
        severity: 'critical',
        message: error.message,
        details: { CallSid, From, To },
        business: business._id
      });

      // Return error TwiML
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({
        language: 'he-IL'
      }, 'מצטערים, יש תקלה. נסו שוב מאוחר יותר.');
      twiml.hangup();

      return twiml.toString();
    }
  }

  /**
   * Handle speech response from caller
   */
  async handleSpeechResponse(params, business) {
    const { CallSid, SpeechResult, Confidence } = params;
    const callState = this.activeCalls.get(CallSid);

    if (!callState) {
      logger.warn('No active call state found', { CallSid });
      return this.handleCallEnd(CallSid, 'no-state');
    }

    const startTime = Date.now();

    try {
      // Log user input
      callState.conversation.push({
        role: 'user',
        content: SpeechResult,
        timestamp: new Date(),
        confidence: parseFloat(Confidence)
      });
      callState.turnCount++;

      // Generate AI response
      const gptResponse = await gptService.generateResponse({
        userMessage: SpeechResult,
        conversationHistory: callState.conversation,
        business,
        callContext: {
          turnCount: callState.turnCount,
          currentIntent: callState.currentIntent,
          reservationData: callState.reservationData
        }
      });

      // Update call state
      callState.currentIntent = gptResponse.intent;
      if (gptResponse.extractedData) {
        callState.reservationData = {
          ...callState.reservationData,
          ...gptResponse.extractedData
        };
      }

      // Log assistant response
      callState.conversation.push({
        role: 'assistant',
        content: gptResponse.text,
        timestamp: new Date(),
        intent: gptResponse.intent,
        tokens: gptResponse.tokensUsed
      });

      // Check if we should create a reservation
      if (this.shouldCreateReservation(callState)) {
        await this.createReservation(callState, business);
      }

      // Check if conversation should end
      if (this.shouldEndCall(gptResponse, callState)) {
        return this.handleCallEnd(CallSid, 'completed', callState, business);
      }

      // Synthesize response
      const audioUrl = await ttsService.generateAudioUrl(gptResponse.text, {
        businessId: business._id,
        gender: business.botPersonality?.gender || 'female'
      });

      // Build TwiML response
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.play(audioUrl);

      // Continue gathering
      const gather = twiml.gather({
        input: 'speech',
        language: 'he-IL',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: true,
        action: `${process.env.API_URL}/webhook/${business.botId}/respond`,
        method: 'POST'
      });

      // Timeout handler
      twiml.redirect(`${process.env.API_URL}/webhook/${business.botId}/timeout`);

      logger.info('Speech response handled', {
        callSid: CallSid,
        responseTime: Date.now() - startTime,
        intent: gptResponse.intent,
        model: gptResponse.model
      });

      // Emit real-time event
      this.emitCallEvent('call:turn', {
        callSid: CallSid,
        businessId: business._id,
        userMessage: SpeechResult,
        botResponse: gptResponse.text,
        intent: gptResponse.intent,
        turnCount: callState.turnCount
      });

      return twiml.toString();

    } catch (error) {
      logger.error('Error handling speech response:', error);

      await ErrorModel.logError({
        category: 'system',
        severity: 'high',
        message: error.message,
        stack: error.stack,
        details: { CallSid, SpeechResult },
        business: business._id,
        call: callState?.callId
      });

      // Try to recover with a generic response
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({
        language: 'he-IL',
        voice: 'Google.he-IL-Wavenet-A'
      }, 'סליחה, לא הבנתי. אפשר לחזור על זה?');

      const gather = twiml.gather({
        input: 'speech',
        language: 'he-IL',
        speechTimeout: 'auto',
        action: `${process.env.API_URL}/webhook/${business.botId}/respond`,
        method: 'POST'
      });

      return twiml.toString();
    }
  }

  /**
   * Handle call timeout (silence)
   */
  async handleTimeout(params, business) {
    const { CallSid } = params;
    const callState = this.activeCalls.get(CallSid);

    if (!callState) {
      return this.handleCallEnd(CallSid, 'timeout');
    }

    // Check if we've had multiple timeouts
    callState.timeoutCount = (callState.timeoutCount || 0) + 1;

    if (callState.timeoutCount >= 2) {
      return this.handleCallEnd(CallSid, 'timeout', callState, business);
    }

    const twiml = new twilio.twiml.VoiceResponse();
    
    const promptMessage = 'האם אתה עדיין שם?';
    const audioUrl = await ttsService.generateAudioUrl(promptMessage, {
      businessId: business._id
    });

    twiml.play(audioUrl);

    const gather = twiml.gather({
      input: 'speech',
      language: 'he-IL',
      speechTimeout: 3,
      action: `${process.env.API_URL}/webhook/${business.botId}/respond`,
      method: 'POST'
    });

    twiml.redirect(`${process.env.API_URL}/webhook/${business.botId}/end`);

    return twiml.toString();
  }

  /**
   * Handle call end
   */
  async handleCallEnd(callSid, reason, callState, business) {
    try {
      const twiml = new twilio.twiml.VoiceResponse();

      // Generate goodbye if we have business context
      if (business) {
        const goodbye = business.botPersonality?.goodbyeMessage || 
                       'תודה שהתקשרת. יום נעים!';
        const audioUrl = await ttsService.generateAudioUrl(goodbye, {
          businessId: business._id
        });
        twiml.play(audioUrl);
      }

      twiml.hangup();

      // Update call record
      if (callState) {
        const call = await Call.findById(callState.callId);
        if (call) {
          const endTime = Date.now();
          const duration = Math.round((endTime - callState.startTime) / 1000);

          // Generate summary
          let summary = '';
          if (callState.conversation.length > 0) {
            summary = await gptService.generateCallSummary(
              callState.conversation,
              business
            );
          }

          // Detect missing info
          let missingInfo = [];
          if (business.aiConfig?.enableAutoFAQ) {
            missingInfo = await gptService.detectMissingInfo(
              callState.conversation,
              business
            );
          }

          // Update call
          call.status = 'completed';
          call.endReason = reason;
          call.endTime = new Date();
          call.duration = duration;
          call.talkTime = duration;
          call.conversation = callState.conversation;
          call.turnCount = callState.turnCount;
          call.summary = summary;
          call.summaryHebrew = summary;
          call.primaryIntent = callState.currentIntent || 'general';
          call.missingInfoDetected = missingInfo.map(info => ({
            ...info,
            timestamp: new Date()
          }));

          // Calculate metrics
          const responseTimes = callState.conversation
            .filter(t => t.role === 'assistant')
            .map(t => t.responseTime || 0);

          call.metrics = {
            avgResponseTime: responseTimes.length > 0 
              ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
              : 0,
            maxResponseTime: Math.max(...responseTimes, 0),
            sttAccuracy: callState.conversation
              .filter(t => t.role === 'user' && t.confidence)
              .reduce((acc, t) => acc + t.confidence, 0) / 
              callState.conversation.filter(t => t.role === 'user').length || 0
          };

          await call.save();

          // Update business stats
          await this.updateBusinessStats(business._id, call);

          // Add missing info to business
          if (missingInfo.length > 0) {
            await Business.findByIdAndUpdate(business._id, {
              $push: {
                missingInfo: {
                  $each: missingInfo.map(info => ({
                    ...info,
                    detectedAt: new Date()
                  }))
                }
              }
            });
          }
        }
      }

      // Cleanup
      this.activeCalls.delete(callSid);

      // Emit event
      this.emitCallEvent('call:ended', {
        callSid,
        businessId: business?._id,
        reason,
        duration: callState ? Math.round((Date.now() - callState.startTime) / 1000) : 0
      });

      return twiml.toString();

    } catch (error) {
      logger.error('Error ending call:', error);
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.hangup();
      return twiml.toString();
    }
  }

  /**
   * Handle Twilio status callback
   */
  async handleStatusCallback(params) {
    const { CallSid, CallStatus, CallDuration } = params;

    try {
      const call = await Call.findOne({ twilioCallSid: CallSid });
      if (call) {
        call.status = CallStatus;
        if (CallDuration) {
          call.duration = parseInt(CallDuration);
        }
        await call.save();
      }

      // Cleanup if call ended
      if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
        this.activeCalls.delete(CallSid);
      }

    } catch (error) {
      logger.error('Error handling status callback:', error);
    }
  }

  /**
   * Generate greeting based on business and time
   */
  generateGreeting(business) {
    const timeGreeting = business.getTimeBasedGreeting();
    const template = business.botPersonality?.greetingMessage || 
                    'שלום! הגעת ל{businessName}. איך אוכל לעזור לך היום?';
    
    return `${timeGreeting}! ${template.replace('{businessName}', business.nameHebrew)}`;
  }

  /**
   * Check if we should create a reservation
   */
  shouldCreateReservation(callState) {
    const data = callState.reservationData;
    return data.date && data.time && data.partySize && 
           (data.customerName || data.customerPhone);
  }

  /**
   * Create reservation from call data
   */
  async createReservation(callState, business) {
    try {
      const data = callState.reservationData;

      // Check availability
      const availability = await Reservation.checkAvailability(
        business._id,
        new Date(data.date),
        data.time,
        data.partySize
      );

      if (!availability.available) {
        logger.info('Reservation slot not available', { data });
        return null;
      }

      // Create reservation
      const reservation = await Reservation.create({
        business: business._id,
        call: callState.callId,
        customerName: data.customerName || 'לקוח',
        customerPhone: data.customerPhone || callState.callerNumber,
        date: new Date(data.date),
        time: data.time,
        partySize: data.partySize,
        specialRequests: data.specialRequests,
        status: 'confirmed',
        source: 'ai-bot'
      });

      // Update call with reservation reference
      await Call.findByIdAndUpdate(callState.callId, {
        reservation: reservation._id
      });

      // Update business stats
      await Business.findByIdAndUpdate(business._id, {
        $inc: { 'stats.totalReservations': 1 }
      });

      logger.info('Reservation created', {
        reservationId: reservation._id,
        businessId: business._id
      });

      // Emit event
      this.emitCallEvent('reservation:created', {
        reservationId: reservation._id,
        businessId: business._id,
        data
      });

      return reservation;

    } catch (error) {
      logger.error('Error creating reservation:', error);
      return null;
    }
  }

  /**
   * Check if call should end
   */
  shouldEndCall(gptResponse, callState) {
    // End if user says goodbye
    if (gptResponse.intent === 'deny' && 
        callState.conversation.some(t => 
          t.role === 'user' && 
          /להתראות|ביי|תודה זהו|סיימתי/.test(t.content)
        )) {
      return true;
    }

    // End if conversation is too long
    if (callState.turnCount > 20) {
      return true;
    }

    // End if reservation is complete
    if (callState.currentIntent === 'reservation' && 
        this.shouldCreateReservation(callState)) {
      return true;
    }

    return false;
  }

  /**
   * Update business statistics
   */
  async updateBusinessStats(businessId, call) {
    try {
      const stats = await Call.getBusinessStats(businessId);
      
      await Business.findByIdAndUpdate(businessId, {
        'stats.totalCalls': stats.totalCalls,
        'stats.totalMinutes': Math.round(stats.totalDuration / 60),
        'stats.totalCost': stats.totalCost,
        'stats.avgCallDuration': stats.avgDuration,
        'stats.successRate': stats.completedCalls / stats.totalCalls * 100,
        'stats.lastCallAt': new Date()
      });

    } catch (error) {
      logger.error('Error updating business stats:', error);
    }
  }

  /**
   * Emit real-time event via Socket.IO
   */
  emitCallEvent(event, data) {
    // This will be called from routes with access to io
    if (this.io) {
      this.io.to('admin-room').emit(event, data);
      if (data.businessId) {
        this.io.to(`business-${data.businessId}`).emit(event, data);
      }
    }
  }

  /**
   * Set Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Get active calls count
   */
  getActiveCallsCount() {
    return this.activeCalls.size;
  }

  /**
   * Get active call details
   */
  getActiveCalls() {
    const calls = [];
    for (const [callSid, state] of this.activeCalls) {
      calls.push({
        callSid,
        businessId: state.businessId,
        turnCount: state.turnCount,
        duration: Math.round((Date.now() - state.startTime) / 1000),
        currentIntent: state.currentIntent
      });
    }
    return calls;
  }
}

module.exports = new CallHandlerService();
