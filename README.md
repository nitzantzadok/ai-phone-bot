# AI Phone Bot SaaS Platform 🤖📞

מערכת AI לניהול שיחות טלפון לעסקים ישראליים - Multi-tenant SaaS Platform

## 🌟 Features

### For You (Admin Dashboard)
- 📊 **Real-time Analytics** - צפייה בכל השיחות, עלויות ונתונים בזמן אמת
- 💰 **Cost Tracking** - מעקב מדויק אחר עלויות לכל עסק (Twilio, Google, OpenAI)
- 🏢 **Business Management** - הוספה, עריכה והשהיית עסקים
- 🚨 **Error Monitoring** - מעקב אחר שגיאות ובעיות
- 👥 **User Management** - ניהול לקוחות ומשתמשים
- 📈 **Performance Metrics** - מדדי ביצועים מפורטים

### For Clients (Client Dashboard)  
- 📅 **Reservations** - צפייה וניהול הזמנות
- 📱 **Call Summaries** - סיכומי שיחות מ-AI
- ⏱️ **Usage Stats** - דקות שיחה וכמות שיחות
- ⚠️ **Error Alerts** - התראות על בעיות
- 💡 **AI Suggestions** - הצעות למידע חסר שצריך להוסיף

### AI Bot Features
- 🗣️ **Natural Hebrew** - עברית טבעית עם ניקוד נכון
- 🎯 **Smart Intent Detection** - זיהוי כוונת הלקוח
- 📝 **Auto Reservations** - יצירת הזמנות אוטומטית
- 💾 **FAQ Caching** - תשובות מהירות לשאלות נפוצות
- 🧠 **Smart Model Selection** - GPT-3.5 לשאלות פשוטות, GPT-4 למורכבות

## 💰 Cost Breakdown (Per Minute)

| Service | Cost per Minute (ILS) |
|---------|----------------------|
| Twilio (Voice) | ~₪0.074 |
| Google STT | ~₪0.059 |
| Google TTS | ~₪0.012 |
| OpenAI GPT-3.5 | ~₪0.007 |
| **Total (Optimized)** | **~₪0.06-0.08** |

### Cost Optimizations Applied:
1. ✅ FAQ Caching - תשובות נפוצות מהמטמון
2. ✅ Smart Model Selection - GPT-3.5 לרוב השיחות
3. ✅ TTS Caching - קולות מאוחסנים ב-cache
4. ✅ Short Responses - תשובות קצרות וענייניות

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB
- Twilio Account
- Google Cloud Account (with Speech-to-Text & Text-to-Speech APIs)
- OpenAI API Key

### Installation

```bash
# Clone the repository
git clone <your-repo>
cd ai-phone-bot-saas

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run seed script to create admin user
npm run seed

# Start the server
npm run dev
```

### Environment Setup

Edit `.env` with your actual credentials:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/ai-phone-bot-saas

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+972XXXXXXXXX

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=./config/google-credentials.json
GOOGLE_PROJECT_ID=your-project-id

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# Admin
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=YourSecurePassword123!
```

### Google Cloud Setup

1. Create a project in Google Cloud Console
2. Enable APIs:
   - Cloud Speech-to-Text API
   - Cloud Text-to-Speech API
3. Create a Service Account and download JSON key
4. Save as `config/google-credentials.json`

### Twilio Setup

1. Buy a phone number with Voice capability (Israeli number recommended)
2. Configure the webhook URL:
   ```
   Voice URL: https://your-domain.com/webhook/{botId}
   Method: POST
   ```
3. For development, use ngrok:
   ```bash
   ngrok http 3000
   ```

## 📁 Project Structure

```
ai-phone-bot-saas/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── adminOnly.js
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validation.js
│   ├── models/
│   │   ├── Business.model.js
│   │   ├── Call.model.js
│   │   ├── Error.model.js
│   │   ├── Reservation.model.js
│   │   └── User.model.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── analytics.routes.js
│   │   ├── auth.routes.js
│   │   ├── bot.routes.js
│   │   ├── client.routes.js
│   │   └── webhook.routes.js
│   ├── services/
│   │   ├── callHandler.service.js
│   │   ├── gpt.service.js
│   │   ├── stt.service.js
│   │   └── tts.service.js
│   ├── scripts/
│   │   └── seed.js
│   ├── utils/
│   │   └── logger.js
│   └── server.js
├── public/
│   ├── admin-dashboard/
│   │   └── index.html
│   └── client-dashboard/
│       └── index.html
├── config/
│   └── google-credentials.json (gitignored)
├── package.json
├── .env.example
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/businesses` - List all businesses
- `POST /api/admin/businesses` - Create business
- `PUT /api/admin/businesses/:id` - Update business
- `GET /api/admin/calls` - List all calls
- `GET /api/admin/errors` - List errors

### Client
- `GET /api/client/dashboard` - Client dashboard
- `GET /api/client/businesses/:id` - Business details
- `GET /api/client/businesses/:id/calls` - Business calls
- `GET /api/client/businesses/:id/reservations` - Reservations

### Webhooks (Twilio)
- `POST /webhook/:botId` - Incoming call
- `POST /webhook/:botId/respond` - Handle speech
- `POST /webhook/:botId/status` - Call status updates

## 🎛️ Bot Configuration

Each business can customize:

```javascript
{
  botPersonality: {
    name: 'שירה',           // Bot name
    gender: 'female',        // Voice gender
    tone: 'friendly',        // professional/friendly/casual
    greetingMessage: '...',  // Custom greeting
    goodbyeMessage: '...',   // Custom goodbye
    customInstructions: '...' // Additional AI instructions
  },
  voiceConfig: {
    language: 'he-IL',
    voiceName: 'he-IL-Wavenet-A',
    speakingRate: 1.0,
    pitch: 0
  },
  aiConfig: {
    useGPT4ForComplex: false,
    maxResponseTokens: 150,
    temperature: 0.7
  }
}
```

## 📊 Analytics Features

- Daily/Weekly/Monthly call statistics
- Cost breakdown by service (Twilio, Google, OpenAI)
- Intent distribution analysis
- Sentiment analysis
- Resolution rate tracking
- Error rate monitoring
- Per-business comparison

## 🔒 Security

- JWT-based authentication with refresh tokens
- Rate limiting on all API endpoints
- Twilio webhook signature validation
- Role-based access control (Admin/Client)
- Password hashing with bcrypt
- Input validation and sanitization

## 🚀 Deployment

### Production Checklist:
1. ✅ Set `NODE_ENV=production`
2. ✅ Use secure `JWT_SECRET` and `JWT_REFRESH_SECRET`
3. ✅ Configure Redis for caching (optional but recommended)
4. ✅ Set up MongoDB replica set
5. ✅ Configure SSL/TLS
6. ✅ Set up monitoring (e.g., PM2, New Relic)
7. ✅ Configure backup strategy

### Recommended Hosting:
- **Server**: AWS EC2, Google Cloud, or DigitalOcean
- **Database**: MongoDB Atlas
- **CDN**: CloudFlare (for dashboard assets)

## 💼 Pricing Model Suggestion

Based on costs (~₪0.06-0.08 per minute):

| Plan | Monthly Fee | Minutes | Extra Minute | Margin |
|------|-------------|---------|--------------|--------|
| Starter | ₪1,200 | 500 | ₪0.50 | ~₪1,150 |
| Professional | ₪1,800 | 1,000 | ₪0.40 | ~₪1,700 |
| Enterprise | ₪2,500 | 2,000 | ₪0.30 | ~₪2,340 |

## 📞 Support

For issues or questions:
- Check the error logs in the admin dashboard
- Review MongoDB logs for database issues
- Check Twilio console for call issues

## 📄 License

MIT License - Feel free to use and modify!

---

Built with ❤️ for Israeli businesses
