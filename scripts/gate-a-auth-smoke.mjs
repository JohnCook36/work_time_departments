#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const baseUrl = process.env.AUTH_SMOKE_BASE_URL?.replace(/\/+$/, '');
const phone = process.env.AUTH_SMOKE_PHONE?.trim();

if (!baseUrl) {
  throw new Error('AUTH_SMOKE_BASE_URL is required');
}

const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== 'https:') {
  throw new Error('AUTH_SMOKE_BASE_URL must use HTTPS');
}

if (!phone) {
  throw new Error('AUTH_SMOKE_PHONE is required');
}

async function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    const body = await response.text().catch(() => '');
    const safeBody = body.slice(0, 300).replace(/\+?[0-9][0-9\s()-]{6,}/g, '[redacted-phone]');
    throw new Error(`${label} failed with HTTP ${response.status}: ${safeBody}`);
  }
}

async function readOtpCode() {
  if (process.env.AUTH_SMOKE_CODE?.trim()) {
    return process.env.AUTH_SMOKE_CODE.trim();
  }

  if (!stdin.isTTY) {
    throw new Error('AUTH_SMOKE_CODE is required when stdin is not interactive');
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question('Enter the OTP delivered by the production provider: ')).trim();
  } finally {
    rl.close();
  }
}

const startedAt = new Date();

const requestResponse = await fetch(`${baseUrl}/auth/request-code`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone }),
});
await expectStatus(requestResponse, 201, 'request-code');

const code = await readOtpCode();
if (!/^\d{6}$/.test(code)) {
  throw new Error('OTP must contain exactly 6 digits');
}

const verifyResponse = await fetch(`${baseUrl}/auth/verify-code`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone, code }),
});
await expectStatus(verifyResponse, 201, 'verify-code');

const setCookie = verifyResponse.headers.get('set-cookie');
if (!setCookie) {
  throw new Error('verify-code did not return a session cookie');
}

const cookieAttributes = setCookie
  .split(';')
  .slice(1)
  .map((part) => part.trim().toLowerCase());

for (const requiredAttribute of ['httponly', 'secure', 'samesite=lax']) {
  if (!cookieAttributes.includes(requiredAttribute)) {
    throw new Error(`verify-code session cookie is missing required production attribute: ${requiredAttribute}`);
  }
}

const sessionCookie = setCookie.split(';', 1)[0];

const meResponse = await fetch(`${baseUrl}/auth/me`, {
  headers: { cookie: sessionCookie },
});
await expectStatus(meResponse, 200, 'auth/me');

const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
  method: 'POST',
  headers: { cookie: sessionCookie },
});
await expectStatus(logoutResponse, 201, 'logout');

const reusedSessionResponse = await fetch(`${baseUrl}/auth/me`, {
  headers: { cookie: sessionCookie },
});
await expectStatus(reusedSessionResponse, 401, 'revoked session reuse');

const finishedAt = new Date();
console.log('Gate A auth smoke: PASS');
console.log(`Origin: ${parsedBase.origin}`);
console.log(`Started (UTC): ${startedAt.toISOString()}`);
console.log(`Finished (UTC): ${finishedAt.toISOString()}`);
console.log('Verified: request-code -> provider OTP -> verify -> Secure/HttpOnly/SameSite=Lax session -> /auth/me -> logout -> revoked-session rejection');
