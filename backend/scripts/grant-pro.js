#!/usr/bin/env node

import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') });

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const parseArguments = (argumentsList) => {
  const options = {};

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith('--')) continue;

    const name = argument.slice(2);
    if (name === 'yes') {
      options.yes = true;
      continue;
    }

    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    options[name] = value;
    index += 1;
  }

  return options;
};

const buildUserQuery = ({ email, userId }) => {
  if (Boolean(email) === Boolean(userId)) {
    throw new Error('Provide exactly one of --email or --userId');
  }

  if (email) {
    return { email: email.trim().toLowerCase() };
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new Error('Invalid --userId value');
  }

  return { _id: new mongoose.Types.ObjectId(userId) };
};

export const grantProMembership = async ({
  email,
  userId,
  days = 30,
  now = new Date(),
  confirmGrant = async () => true
}) => {
  const parsedDays = Number(days);
  if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > 3650) {
    throw new Error('--days must be an integer between 1 and 3650');
  }

  const query = buildUserQuery({ email, userId });
  const user = await User.findOne(query).select('name email provider subscription');

  if (!user) {
    throw new Error('User not found; no account was created or modified');
  }

  const currentExpiry = user.subscription?.endDate
    ? new Date(user.subscription.endDate)
    : null;
  const hasUnexpiredPro = user.subscription?.plan === 'pro' &&
    user.subscription?.status === 'active' &&
    currentExpiry &&
    currentExpiry > now;
  const extensionBase = hasUnexpiredPro ? currentExpiry : now;
  const nextExpiry = new Date(extensionBase.getTime() + parsedDays * DAY_IN_MS);

  // Print the resolved target before changing it so an operator can verify the
  // account in terminal logs. This script intentionally exposes no HTTP route.
  console.log('[GRANT-PRO] Target user:');
  console.log(JSON.stringify({
    userId: user._id.toString(),
    name: user.name,
    email: user.email || null,
    provider: user.provider,
    currentPlan: user.subscription?.plan || 'free',
    currentStatus: user.subscription?.status || null,
    currentExpiresAt: currentExpiry?.toISOString() || null,
    grantDays: parsedDays,
    nextExpiresAt: nextExpiry.toISOString()
  }, null, 2));

  if (!await confirmGrant()) {
    throw new Error('Grant cancelled; no account was modified');
  }

  const membershipUpdate = {
    'subscription.plan': 'pro',
    'subscription.status': 'active',
    'subscription.endDate': nextExpiry
  };
  if (!hasUnexpiredPro) membershipUpdate['subscription.startDate'] = now;

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { $set: membershipUpdate },
    { new: true, runValidators: true }
  ).select('name email provider subscription');

  console.log('[GRANT-PRO] Pro membership granted successfully.');
  console.log(JSON.stringify({
    userId: updatedUser._id.toString(),
    email: updatedUser.email || null,
    plan: updatedUser.subscription.plan,
    membershipStatus: updatedUser.subscription.status,
    membershipExpiresAt: updatedUser.subscription.endDate.toISOString()
  }, null, 2));

  return updatedUser;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS: 30_000
  });

  try {
    const confirmGrant = options.yes
      ? async () => true
      : async () => {
          const prompt = createInterface({ input: stdin, output: stdout });
          try {
            const answer = await prompt.question('[GRANT-PRO] Type YES to confirm this grant: ');
            return answer.trim() === 'YES';
          } finally {
            prompt.close();
          }
        };

    await grantProMembership({
      email: options.email,
      userId: options.userId,
      days: options.days || 30,
      confirmGrant
    });
  } finally {
    await mongoose.disconnect();
  }
};

const isDirectExecution = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  main().catch(async error => {
    console.error(`[GRANT-PRO] ${error.message}`);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
  });
}
