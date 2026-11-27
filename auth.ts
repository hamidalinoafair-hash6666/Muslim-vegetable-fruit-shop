import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth_vault.json');
const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

export const AUTHORIZED_OWNER_EMAIL = 'hamidalinoafair@gmail.com';
export const AUTHORIZED_OWNER_NAME = 'hamid ali';

export function isAuthorizedOwnerIdentifier(identifier?: string): boolean {
  const clean = (identifier || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return clean === AUTHORIZED_OWNER_EMAIL || clean === AUTHORIZED_OWNER_NAME;
}

const DEFAULT_OWNER_PASSWORD_SALT = '7375318c9ddb9624fa2bb9acb41c6870';
const DEFAULT_OWNER_PASSWORD_HASH =
  '52a5094ed728c83727b0a1b72d644ada493bbee67378ca7acf038f23671d4fba4e610bc3f4cff62efe57d7e4eb5210fadf63e924249be32e278c0a52e7fc7b78';

let activeOwnerSupabaseJwt = '';
export function setServerOwnerSupabaseJwt(jwt: string) {
  activeOwnerSupabaseJwt = jwt || '';
}
export function getServerOwnerSupabaseJwt(): string {
  return activeOwnerSupabaseJwt;
}

export interface AuthSession {
  role: 'owner' | 'rider' | 'customer';
  email?: string;
  riderId?: string;
  phone?: string;
  name: string;
  exp: number;
}

interface OwnerVaultRecord {
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  recoveryCodeHash?: string;
  recoveryExpiresAt?: number;
  updatedAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

export function hashSecret(plain: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, s, 64).toString('hex');
  return { hash: derived, salt: s };
}

export function verifySecret(plain: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function loadOwnerVault(): OwnerVaultRecord {
  ensureDataDir();
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')) as OwnerVaultRecord;
      if (parsed.passwordHash && parsed.passwordSalt) {
        return parsed;
      }
      if (process.env.OWNER_ADMIN_PASSWORD) {
        const { hash, salt } = hashSecret(process.env.OWNER_ADMIN_PASSWORD);
        parsed.passwordHash = hash;
        parsed.passwordSalt = salt;
      } else {
        parsed.passwordHash = DEFAULT_OWNER_PASSWORD_HASH;
        parsed.passwordSalt = DEFAULT_OWNER_PASSWORD_SALT;
      }
      saveOwnerVault(parsed);
      return parsed;
    } catch {}
  }
  const initial: OwnerVaultRecord = {
    email: AUTHORIZED_OWNER_EMAIL,
    twoFactorEnabled: false,
    updatedAt: new Date().toISOString(),
  };
  if (process.env.OWNER_ADMIN_PASSWORD) {
    const { hash, salt } = hashSecret(process.env.OWNER_ADMIN_PASSWORD);
    initial.passwordHash = hash;
    initial.passwordSalt = salt;
  } else {
    initial.passwordHash = DEFAULT_OWNER_PASSWORD_HASH;
    initial.passwordSalt = DEFAULT_OWNER_PASSWORD_SALT;
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(initial, null, 2), { mode: 0o600 });
  return initial;
}

export function saveOwnerVault(record: OwnerVaultRecord) {
  ensureDataDir();
  record.updatedAt = new Date().toISOString();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
}

export function isOwnerPasswordConfigured(): boolean {
  const vault = loadOwnerVault();
  return Boolean(vault.passwordHash && vault.passwordSalt);
}

// --- TOTP 2FA Helpers ---
export function generateTwoFactorSecret(): string {
  return crypto.randomBytes(20).toString('hex');
}

export function computeTotpCode(secretHex: string, stepOffset = 0): string {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', Buffer.from(secretHex, 'hex')).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

export function verifyTotpCode(secretHex: string, code: string): boolean {
  const clean = (code || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  return (
    clean === computeTotpCode(secretHex, 0) ||
    clean === computeTotpCode(secretHex, -1) ||
    clean === computeTotpCode(secretHex, 1)
  );
}

// --- Rate Limiter for Logins ---
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const entry = loginAttempts.get(key);
  const now = Date.now();
  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    entry.count = 0;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lock
  }
  loginAttempts.set(key, entry);
}

export function clearFailedAttempts(key: string) {
  loginAttempts.delete(key);
}

// --- Signed Session Tokens ---
export function issueToken(payload: Omit<AuthSession, 'exp'>, ttlHours = 12): string {
  const session: AuthSession = {
    ...payload,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(session)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token?: string): AuthSession | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as AuthSession;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractSessionFromRequest(req: Request): AuthSession | null {
  const authHeader = req.headers['authorization'];
  const tokenHeader = req.headers['x-auth-token'];
  const raw =
    typeof tokenHeader === 'string'
      ? tokenHeader
      : typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : typeof req.query.token === 'string'
      ? req.query.token
      : undefined;
  return verifyToken(raw);
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  const session = extractSessionFromRequest(req);
  if (!session || session.role !== 'owner' || session.email !== AUTHORIZED_OWNER_EMAIL) {
    return res.status(403).json({
      error: 'Access Denied: Only the authenticated shop owner (Hamid Ali) can access this resource.',
      code: 'OWNER_AUTH_REQUIRED',
    });
  }
  (req as any).session = session;
  next();
}

export function requireRider(req: Request, res: Response, next: NextFunction) {
  const session = extractSessionFromRequest(req);
  if (!session || session.role !== 'rider' || !session.riderId) {
    return res.status(403).json({
      error: 'Access Denied: Valid Rider authentication is required.',
      code: 'RIDER_AUTH_REQUIRED',
    });
  }
  (req as any).session = session;
  next();
}
