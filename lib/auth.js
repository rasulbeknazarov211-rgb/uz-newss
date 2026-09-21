'use strict';
// Admin access: one secret "code" (stored only as a scrypt hash) + cookie sessions.
const crypto = require('node:crypto');
const db = require('./db');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // 12 hours
const COOKIE_NAME = 'uznews_admin';
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 64;

// ---------- code hashing ----------
function hashCode(code) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(code, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyCode(code, stored) {
  if (typeof code !== 'string' || !stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(code, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function generateCode() {
  // no 0/O/1/I/L — easy to read and type
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function validateNewCode(code) {
  if (typeof code !== 'string') return "Kod matn bo'lishi kerak";
  if (code.length < MIN_CODE_LENGTH) return `Kod kamida ${MIN_CODE_LENGTH} ta belgidan iborat bo'lishi kerak`;
  if (code.length > MAX_CODE_LENGTH) return `Kod ${MAX_CODE_LENGTH} ta belgidan oshmasligi kerak`;
  return null;
}

// Sets the code and logs everybody out
async function setAdminCode(code) {
  await db.setSetting('admin_code_hash', hashCode(code));
  await db.deleteAllSessions();
}

async function checkAdminCode(code) {
  return verifyCode(code, await db.getSetting('admin_code_hash'));
}

// Called once on server start. Returns the freshly generated code (or null if a code already exists).
async function ensureAdminCode() {
  if (await db.getSetting('admin_code_hash')) return null;
  const fromEnv = process.env.ADMIN_CODE;
  if (fromEnv && !validateNewCode(fromEnv)) {
    await setAdminCode(fromEnv);
    return null;
  }
  const code = generateCode();
  await setAdminCode(code);
  return code;
}

// ---------- sessions ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.cleanupSessions(now);
  await db.insertSession(sha256(token), now, now + SESSION_TTL_MS);
  return token;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function tokenFromRequest(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

async function isAuthenticated(req) {
  const token = tokenFromRequest(req);
  if (!token) return false;
  const row = await db.getSession(sha256(token));
  return !!row && row.expires_at > Date.now();
}

async function destroySession(req) {
  const token = tokenFromRequest(req);
  if (token) await db.deleteSession(sha256(token));
}

function sessionCookie(token, secure) {
  const maxAge = token ? Math.floor(SESSION_TTL_MS / 1000) : 0;
  return `${COOKIE_NAME}=${token || ''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

// ---------- brute-force protection (per IP, in memory) ----------
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const attempts = new Map();   // ip -> { fails, lockedUntil }

function lockRemaining(ip) {
  const a = attempts.get(ip);
  if (!a || !a.lockedUntil) return 0;
  const left = a.lockedUntil - Date.now();
  if (left <= 0) { attempts.delete(ip); return 0; }
  return left;
}

function recordFail(ip) {
  const a = attempts.get(ip) || { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.lockedUntil = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}

function recordSuccess(ip) {
  attempts.delete(ip);
}

module.exports = {
  ensureAdminCode, setAdminCode, checkAdminCode, validateNewCode, generateCode,
  createSession, isAuthenticated, destroySession, sessionCookie,
  lockRemaining, recordFail, recordSuccess
};
