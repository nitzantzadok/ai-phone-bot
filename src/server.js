/**
 * AI Phone Bot SaaS - Main Server Entry Point
 * Multi-tenant platform for Israeli businesses
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Import Routes
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const clientRoutes = require('./routes/client.routes');
const webhookRoutes = require('./routes/webhook.routes');
const botRoutes = require('./routes/bot.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time updates
const io = new Server(server, {
  cors: {
    origin: process.env.DASHBOARD_URL || 'http://localhost:3001',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// ===========================================
// Middleware Configuration
// ===========================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for dashboard
}));

// CORS configuration
app.use(cors({
  origin: [
    process.env.DASHBOARD_URL || 'http://localhost:3001',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Rate limiting (skip for webhooks)
app.use('/api', apiLimiter);

// ===========================================
// Routes Configuration
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/analytics', analyticsRoutes);

// Twilio Webhook Routes (no rate limiting)

// DIRECT TEST ROUTE - MUST BE BEFORE app.use('/webhook')
app.post('/webhook/voice/incoming', (req, res) => {
  console.log('🎯 DIRECT ROUTE HIT!');
  const twilio = require('twilio');
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Polly.Mia', language: 'he-IL' }, 'שלום זה בוט טסט');
  res.type('text/xml');
  res.send(twiml.toString());
});

app.use('/webhook', webhookRoutes);

// Static files for dashboard
app.use('/dashboard', express.static('public/admin-dashboard'));
app.use('/client-dashboard', express.static('public/client-dashboard'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Global Error Handler
app.use(errorHandler);

// ===========================================
// Socket.IO Events
// ===========================================

io.on('connection', (socket) => {
  logger.info(`Dashboard client connected: ${socket.id}`);

  socket.on('join-admin', () => {
    socket.join('admin-room');
    logger.info(`Admin joined: ${socket.id}`);
  });

  socket.on('join-client', (businessId) => {
    socket.join(`business-${businessId}`);
    logger.info(`Client joined business room: ${businessId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Dashboard client disconnected: ${socket.id}`);
  });
});

// ===========================================
// Server Startup
// ===========================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('✅ MongoDB connected successfully');

    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Admin Dashboard: ${process.env.API_URL}/dashboard`);
      logger.info(`👤 Client Dashboard: ${process.env.API_URL}/client-dashboard`);
      logger.info(`🔗 Webhook URL: ${process.env.API_URL}/webhook`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, server, io };
