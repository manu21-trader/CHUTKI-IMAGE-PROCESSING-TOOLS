import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Basic user information
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: function () {
      return this.provider === 'local';
    },
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    select: false,
    required: function () {
      return this.provider === 'local';
    }
  },

  // Passwordless identity fields. Phone numbers must be normalized by the
  // future SMS login flow before storage (for example, +8613800138000).
  phone: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    required: function () {
      return this.provider === 'phone';
    }
  },
  providerUserId: {
    type: String,
    trim: true,
    required: function () {
      return this.provider === 'wechat' || this.provider === 'qq';
    }
  },

  // Google OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  avatar: {
    type: String, // URL to profile picture
    default: null
  },

  // Account status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Authentication provider
  provider: {
    type: String,
    enum: ['local', 'google', 'phone', 'wechat', 'qq'],
    default: 'local'
  },

  // User preferences (full definition below)

  // Password reset fields
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },

  // Enhanced Usage tracking
  toolsUsed: [{
    toolName: String,
    toolCategory: String,
    usedAt: {
      type: Date,
      default: Date.now
    },
    processingTime: Number, // in milliseconds
    fileSize: Number, // in bytes
    success: {
      type: Boolean,
      default: true
    }
  }],

  // Usage Statistics
  statistics: {
    totalToolsUsed: {
      type: Number,
      default: 0
    },
    totalImagesProcessed: {
      type: Number,
      default: 0
    },
    totalDataProcessed: {
      type: Number,
      default: 0 // in bytes
    },
    favoriteTools: [{
      toolName: String,
      count: Number
    }],
    lastToolUsed: String,
    averageProcessingTime: Number
  },

  // User Profile Details
  profile: {
    bio: {
      type: String,
      maxlength: 500,
      default: ''
    },
    phone: {
      type: String,
      default: ''
    },
    location: {
      country: String,
      city: String
    },
    website: String,
    company: String,
    jobTitle: String,
    socialLinks: {
      twitter: String,
      linkedin: String,
      github: String,
      instagram: String
    }
  },

  // Enhanced Preferences
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en'
    },
    defaultImageQuality: {
      type: Number,
      min: 1,
      max: 100,
      default: 90
    },
    autoSaveSettings: {
      type: Boolean,
      default: true
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    marketingEmails: {
      type: Boolean,
      default: false
    },
    defaultOutputFormat: {
      type: String,
      enum: ['jpeg', 'png', 'webp', 'original'],
      default: 'original'
    },
    compressionLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },

  // Subscription & Plan (for future premium features)
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active'
    }
  },

  // Activity Log
  activityLog: [{
    action: String,
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],

  // Saved Presets
  savedPresets: [{
    name: String,
    toolName: String,
    settings: mongoose.Schema.Types.Mixed,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Timestamps
  lastLogin: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// A provider-scoped ID allows WeChat and QQ to use the same external ID value
// without colliding. Existing Google users continue to work through googleId.
userSchema.index(
  { provider: 1, providerUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerUserId: { $type: 'string' } }
  }
);

// Hash password before saving (only for local users)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false; // Google users don't have passwords
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Get user's display name
userSchema.methods.getDisplayName = function () {
  return this.name || this.email?.split('@')[0] || this.phone || 'User';
};

// Update last login
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

// Enhanced tool usage tracking
userSchema.methods.addToolUsage = function (toolName, toolCategory, metadata = {}) {
  // Add to usage history
  this.toolsUsed.push({
    toolName,
    toolCategory,
    usedAt: new Date(),
    processingTime: metadata.processingTime || 0,
    fileSize: metadata.fileSize || 0,
    success: metadata.success !== false
  });

  // Keep only last 200 tool usages
  if (this.toolsUsed.length > 200) {
    this.toolsUsed = this.toolsUsed.slice(-200);
  }

  // Update statistics
  this.statistics.totalToolsUsed += 1;
  this.statistics.totalImagesProcessed += 1;
  this.statistics.totalDataProcessed += metadata.fileSize || 0;
  this.statistics.lastToolUsed = toolName;

  // Update favorite tools
  const existingFav = this.statistics.favoriteTools.find(f => f.toolName === toolName);
  if (existingFav) {
    existingFav.count += 1;
  } else {
    this.statistics.favoriteTools.push({ toolName, count: 1 });
  }

  // Sort and keep top 10 favorite tools
  this.statistics.favoriteTools.sort((a, b) => b.count - a.count);
  if (this.statistics.favoriteTools.length > 10) {
    this.statistics.favoriteTools = this.statistics.favoriteTools.slice(0, 10);
  }

  // Calculate average processing time
  const successfulTools = this.toolsUsed.filter(t => t.success && t.processingTime);
  if (successfulTools.length > 0) {
    const totalTime = successfulTools.reduce((sum, t) => sum + t.processingTime, 0);
    this.statistics.averageProcessingTime = Math.round(totalTime / successfulTools.length);
  }

  this.lastActive = new Date();
  return this.save();
};

// Add activity log entry
userSchema.methods.addActivity = function (action, description, metadata = {}) {
  this.activityLog.push({
    action,
    description,
    timestamp: new Date(),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent
  });

  // Keep only last 100 activities
  if (this.activityLog.length > 100) {
    this.activityLog = this.activityLog.slice(-100);
  }

  return this.save();
};

// Save preset
userSchema.methods.savePreset = function (name, toolName, settings) {
  // Check if preset with same name exists
  const existingIndex = this.savedPresets.findIndex(p => p.name === name && p.toolName === toolName);
  
  if (existingIndex !== -1) {
    // Update existing preset
    this.savedPresets[existingIndex].settings = settings;
    this.savedPresets[existingIndex].createdAt = new Date();
  } else {
    // Add new preset
    this.savedPresets.push({
      name,
      toolName,
      settings,
      createdAt: new Date()
    });
  }

  // Keep only last 50 presets
  if (this.savedPresets.length > 50) {
    this.savedPresets = this.savedPresets.slice(-50);
  }

  return this.save();
};

// Delete preset
userSchema.methods.deletePreset = function (presetId) {
  this.savedPresets = this.savedPresets.filter(p => p._id.toString() !== presetId);
  return this.save();
};

// Get usage statistics
userSchema.methods.getUsageStats = function (days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentUsage = this.toolsUsed.filter(t => t.usedAt >= cutoffDate);

  // Group by date
  const usageByDate = {};
  recentUsage.forEach(usage => {
    const date = usage.usedAt.toISOString().split('T')[0];
    usageByDate[date] = (usageByDate[date] || 0) + 1;
  });

  // Group by category
  const usageByCategory = {};
  recentUsage.forEach(usage => {
    const category = usage.toolCategory || 'Other';
    usageByCategory[category] = (usageByCategory[category] || 0) + 1;
  });

  return {
    totalUsage: recentUsage.length,
    usageByDate,
    usageByCategory,
    averagePerDay: Math.round(recentUsage.length / days),
    mostUsedTool: this.statistics.favoriteTools[0]?.toolName || 'None',
    totalDataProcessed: this.statistics.totalDataProcessed
  };
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  this.resetPasswordToken = resetToken;
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Clear password reset token
userSchema.methods.clearPasswordResetToken = function () {
  this.resetPasswordToken = null;
  this.resetPasswordExpires = null;
  return this.save();
};

// Static method to find or create Google user
userSchema.statics.findOrCreateGoogleUser = async function (profile) {
  try {
    // Try to find existing user by Google ID
    let user = await this.findOne({
      $or: [
        { googleId: profile.id },
        { provider: 'google', providerUserId: profile.id }
      ]
    });

    if (user) {
      // Update user info and last login
      user.providerUserId = profile.id;
      user.name = profile.displayName || user.name;
      user.avatar = profile.photos?.[0]?.value || user.avatar;
      user.lastLogin = new Date();
      await user.save();
      return user;
    }

    // Try to find existing user by email
    user = await this.findOne({ email: profile.emails?.[0]?.value });

    if (user) {
      // Link Google account to existing user
      user.googleId = profile.id;
      user.providerUserId = profile.id;
      user.provider = 'google';
      user.avatar = profile.photos?.[0]?.value || user.avatar;
      user.isVerified = true;
      user.lastLogin = new Date();
      await user.save();
      return user;
    }

    // Create new Google user
    user = new this({
      googleId: profile.id,
      providerUserId: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value,
      avatar: profile.photos?.[0]?.value,
      provider: 'google',
      isVerified: true,
      lastLogin: new Date()
    });

    await user.save();
    return user;

  } catch (error) {
    throw new Error(`Failed to find or create Google user: ${error.message}`);
  }
};

// Transform output (remove sensitive data)
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

const User = mongoose.model('User', userSchema);

export default User;
