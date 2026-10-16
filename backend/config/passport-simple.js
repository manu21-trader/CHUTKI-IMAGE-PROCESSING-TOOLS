// Simplified Passport Configuration for Google OAuth
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

console.log('[PASSPORT-SIMPLE] Initializing Google OAuth...');
console.log('[PASSPORT-SIMPLE] User model available:', !!User);
console.log('[PASSPORT-SIMPLE] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('[PASSPORT-SIMPLE] GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');

// Configure Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    callbackURL: process.env.NODE_ENV === 'production' 
      ? 'https://chutki-backend-bfcn.onrender.com/api/auth/google/callback' 
      : 'http://localhost:5001/api/auth/google/callback',
    passReqToCallback: false
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('[PASSPORT-SIMPLE] OAuth callback triggered');
      console.log('[PASSPORT-SIMPLE] Profile ID:', profile.id);
      console.log('[PASSPORT-SIMPLE] Profile email:', profile.emails?.[0]?.value);

      // Validate profile has email
      if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
        console.error('[PASSPORT-SIMPLE] No email in profile');
        return done(new Error('No email provided by Google'), null);
      }

      // Find or create user
      let user = await User.findOne({
        $or: [
          { googleId: profile.id },
          { provider: 'google', providerUserId: profile.id }
        ]
      });

      if (user) {
        console.log('[PASSPORT-SIMPLE] Existing user found:', user.email);
        // Update last login
        user.providerUserId = profile.id;
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      // Check if user exists with this email
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        console.log('[PASSPORT-SIMPLE] Linking Google to existing user:', user.email);
        // Link Google account
        user.googleId = profile.id;
        user.providerUserId = profile.id;
        user.provider = 'google';
        user.isVerified = true;
        user.lastLogin = new Date();
        if (profile.photos && profile.photos[0]) {
          user.avatar = profile.photos[0].value;
        }
        await user.save();
        return done(null, user);
      }

      // Create new user
      console.log('[PASSPORT-SIMPLE] Creating new user');
      user = new User({
        googleId: profile.id,
        providerUserId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        avatar: profile.photos?.[0]?.value,
        provider: 'google',
        isVerified: true,
        lastLogin: new Date()
      });

      await user.save();
      console.log('[PASSPORT-SIMPLE] New user created:', user.email);
      return done(null, user);

    } catch (error) {
      console.error('[PASSPORT-SIMPLE] Error:', error.message);
      console.error('[PASSPORT-SIMPLE] Stack:', error.stack);
      return done(error, null);
    }
  }));

  console.log('[PASSPORT-SIMPLE] Google OAuth strategy configured successfully');
} else {
  console.log('[PASSPORT-SIMPLE] Google OAuth not configured - missing credentials');
}

// Serialize/deserialize for session support
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
