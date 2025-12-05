/**
 * User Model - Authentication and Authorization
 * Supports admin users and business clients
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },

  role: {
    type: String,
    enum: ['admin', 'client', 'viewer'],
    default: 'client'
  },

  // Profile
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  phone: String,
  avatar: String,

  // For clients - associated businesses
  businesses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  }],

  // Security
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationExpires: Date,
  
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,

  // Preferences
  preferences: {
    language: { type: String, default: 'he' },
    timezone: { type: String, default: 'Asia/Jerusalem' },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },

  // Refresh tokens for session management
  refreshTokens: [{
    token: String,
    device: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
UserSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate refresh token
UserSchema.methods.generateRefreshToken = function(device = 'unknown') {
  const token = jwt.sign(
    { id: this._id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  this.refreshTokens.push({
    token,
    device,
    expiresAt
  });
  
  // Keep only last 5 refresh tokens
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }
  
  return token;
};

// Check if account is locked
UserSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Increment login attempts
UserSchema.methods.incrementLoginAttempts = async function() {
  // Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
    return;
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  await this.updateOne(updates);
};

// Reset login attempts on successful login
UserSchema.methods.resetLoginAttempts = async function() {
  await this.updateOne({
    $set: { loginAttempts: 0, lastLogin: new Date() },
    $unset: { lockUntil: 1 }
  });
};

// Static method to find by credentials
UserSchema.statics.findByCredentials = async function(email, password) {
  const user = await this.findOne({ email }).select('+password');
  
  if (!user) {
    throw new Error('Invalid email or password');
  }
  
  if (!user.isActive) {
    throw new Error('Account is deactivated');
  }
  
  if (user.isLocked()) {
    throw new Error('Account is temporarily locked. Try again later.');
  }
  
  const isMatch = await user.comparePassword(password);
  
  if (!isMatch) {
    await user.incrementLoginAttempts();
    throw new Error('Invalid email or password');
  }
  
  await user.resetLoginAttempts();
  return user;
};

module.exports = mongoose.model('User', UserSchema);
