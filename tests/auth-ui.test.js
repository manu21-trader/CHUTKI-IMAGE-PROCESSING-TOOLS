import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchGoogleOAuthAvailability, hasGoogleOAuth } from '../src/utils/authFeatures.js';

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Google OAuth is enabled only by an explicit true feature flag', async () => {
  assert.equal(hasGoogleOAuth({ features: { googleOAuth: true } }), true);
  assert.equal(hasGoogleOAuth({ features: { googleOAuth: false } }), false);
  assert.equal(hasGoogleOAuth({}), false);

  const enabled = await fetchGoogleOAuthAvailability('/api/auth/status', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: { googleOAuth: true } })
    })
  });
  assert.equal(enabled, true);
});

test('Google OAuth stays hidden when status is false or unavailable', async () => {
  const disabled = await fetchGoogleOAuthAvailability('/api/auth/status', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: { googleOAuth: false } })
    })
  });
  assert.equal(disabled, false);

  const failed = await fetchGoogleOAuthAvailability('/api/auth/status', {
    fetchImpl: async () => {
      throw new Error('network unavailable');
    }
  });
  assert.equal(failed, false);
});

test('Login and Register gate the complete Google section', async () => {
  const [loginSource, registerSource] = await Promise.all([
    readSource('src/components/Login.jsx'),
    readSource('src/components/Register.jsx')
  ]);

  for (const source of [loginSource, registerSource]) {
    assert.match(source, /googleOAuthEnabled\s*&&\s*\(/);
    assert.match(source, /\/api\/auth\/status/);
  }
});

test('local registration persists auth state and logout clears it', async () => {
  const [registerSource, authContextSource] = await Promise.all([
    readSource('src/components/Register.jsx'),
    readSource('src/context/AuthContext.jsx')
  ]);

  assert.match(registerSource, /localStorage\.setItem\('token', data\.token\)/);
  assert.match(registerSource, /localStorage\.setItem\('user', JSON\.stringify\(data\.user\)\)/);
  assert.match(authContextSource, /localStorage\.removeItem\('token'\)/);
  assert.match(authContextSource, /localStorage\.removeItem\('user'\)/);
});

test('Profile does not claim email verification and renders createdAt', async () => {
  const profileSource = await readSource('src/components/Profile.jsx');

  assert.doesNotMatch(profileSource, />\s*(?:Verified|已验证)\s*</);
  assert.match(profileSource, /邮箱账号/);
  assert.match(profileSource, /formatDate\(user\?\.createdAt\)/);
});
