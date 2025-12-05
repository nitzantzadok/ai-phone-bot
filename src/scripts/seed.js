/**
 * Seed Script - Initialize database with admin user and sample data
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, Business } = require('../models');

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-phone-bot-saas');
    console.log('Connected to MongoDB');

    // Check if admin exists
    const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL || 'admin@example.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
    } else {
      // Create admin user
      const admin = await User.create({
        email: process.env.ADMIN_EMAIL || 'admin@example.com',
        password: process.env.ADMIN_PASSWORD || 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        isVerified: true
      });
      console.log('Admin user created:', admin.email);
    }

    // Create sample business if none exist
    const businessCount = await Business.countDocuments();
    
    if (businessCount === 0) {
      const admin = await User.findOne({ role: 'admin' });
      
      const sampleBusiness = await Business.create({
        name: 'Demo Restaurant',
        nameHebrew: 'מסעדת הדגמה',
        type: 'restaurant',
        phone: '+972501234567',
        email: 'demo@restaurant.com',
        address: {
          street: 'רחוב הרצל 1',
          city: 'תל אביב',
          postalCode: '12345',
          country: 'Israel'
        },
        businessHours: [
          { day: 'sunday', isOpen: true, openTime: '09:00', closeTime: '22:00' },
          { day: 'monday', isOpen: true, openTime: '09:00', closeTime: '22:00' },
          { day: 'tuesday', isOpen: true, openTime: '09:00', closeTime: '22:00' },
          { day: 'wednesday', isOpen: true, openTime: '09:00', closeTime: '22:00' },
          { day: 'thursday', isOpen: true, openTime: '09:00', closeTime: '22:00' },
          { day: 'friday', isOpen: true, openTime: '09:00', closeTime: '15:00' },
          { day: 'saturday', isOpen: false, openTime: '20:00', closeTime: '23:00' }
        ],
        menuItems: [
          { name: 'Hummus', nameHebrew: 'חומוס', price: 28, category: 'starters' },
          { name: 'Falafel', nameHebrew: 'פלאפל', price: 32, category: 'mains' },
          { name: 'Shawarma', nameHebrew: 'שווארמה', price: 48, category: 'mains' },
          { name: 'Salad', nameHebrew: 'סלט', price: 24, category: 'sides' }
        ],
        faqs: [
          { 
            question: 'יש חניה?', 
            answer: 'כן, יש חניון ציבורי צמוד למסעדה.',
            keywords: ['חניה', 'חנייה', 'לחנות']
          },
          {
            question: 'מקבלים כרטיס אשראי?',
            answer: 'כן, אנחנו מקבלים את כל כרטיסי האשראי וגם ביט.',
            keywords: ['כרטיס', 'אשראי', 'תשלום', 'ביט']
          },
          {
            question: 'יש אוכל צמחוני?',
            answer: 'בהחלט! יש לנו מבחר גדול של מנות צמחוניות וטבעוניות.',
            keywords: ['צמחוני', 'טבעוני', 'וגן']
          }
        ],
        botPersonality: {
          name: 'שירה',
          gender: 'female',
          tone: 'friendly',
          greetingMessage: 'שלום! הגעת למסעדת הדגמה. איך אוכל לעזור לך היום?',
          goodbyeMessage: 'תודה שהתקשרת! נשמח לראותך.',
          customInstructions: 'המסעדה מתמחה באוכל ישראלי מסורתי. תמיד הצע הזמנת שולחן.'
        },
        reservationSettings: {
          enabled: true,
          maxPartySize: 15,
          advanceBookingDays: 14,
          timeSlotDuration: 30
        },
        owner: admin._id,
        createdBy: admin._id,
        isActive: true
      });

      // Add business to admin
      admin.businesses.push(sampleBusiness._id);
      await admin.save();

      console.log('Sample business created:', sampleBusiness.nameHebrew);
      console.log('Bot ID:', sampleBusiness.botId);
      console.log('Webhook URL:', sampleBusiness.webhookUrl);
    }

    console.log('\n✅ Seed completed successfully!');
    console.log('\n📝 Login credentials:');
    console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@example.com'}`);
    console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
    
    process.exit(0);

  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
