import './server/env';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { db } from './server/db';
import {
  AUTHORIZED_OWNER_EMAIL,
  checkRateLimit,
  clearFailedAttempts,
  extractSessionFromRequest,
  generateTwoFactorSecret,
  hashSecret,
  isAuthorizedOwnerIdentifier,
  isOwnerPasswordConfigured,
  issueToken,
  loadOwnerVault,
  recordFailedAttempt,
  requireOwner,
  requireRider,
  saveOwnerVault,
  setServerOwnerSupabaseJwt,
  verifySecret,
  verifyTotpCode,
} from './server/auth';
import {
  validateOrderInput,
  validateProductInput,
  validateReceiptInput,
} from './server/validation';
import { optimizeDeliveryRoute } from './server/routeOptimizer';
import { dispatchNotification, getNotificationLogs } from './server/notifications';
import { createDatabaseBackup, getBackupHistory } from './server/backupService';
import { runCustomerShoppingAI, runOwnerAdminAI, transcribeVoiceSearchAudio } from './server/aiService';
import {
  SHOP_COORDINATES,
  calculateDeliveryFee,
  calculatePriceFromWeight,
  calculateWeightFromMoney,
  isCoordinatesInKhanewal,
  validateKhanewalAddress,
} from './src/utils/calculations';
import { KHANEWAL_LOCATIONS, SUPABASE_PROJECT_CONFIG, normalizeSupabaseUrl } from './src/data/initialData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '12mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=*, microphone=*');
  next();
});

// =========================================================================
// 1. AUTHENTICATION (Owner-Only RBAC, Rider PIN Login, Customer Session)
// =========================================================================

app.get('/api/auth/owner/status', (_req: Request, res: Response) => {
  const vault = loadOwnerVault();
  res.json({
    email: AUTHORIZED_OWNER_EMAIL,
    ownerName: 'Hamid Ali',
    configured: isOwnerPasswordConfigured(),
    twoFactorEnabled: Boolean(vault.twoFactorEnabled),
  });
});

// First-time password setup — blocked immediately once configured
app.post('/api/auth/owner/setup', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!isAuthorizedOwnerIdentifier(email)) {
    return res.status(403).json({
      error: `Only the authorized shop owner (Hamid Ali / ${AUTHORIZED_OWNER_EMAIL}) can initialize this vault.`,
    });
  }
  if (isOwnerPasswordConfigured()) {
    return res.status(409).json({
      error: 'Owner password is already configured. Use Sign In or Password Recovery.',
    });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const vault = loadOwnerVault();
  const { hash, salt } = hashSecret(String(password));
  vault.passwordHash = hash;
  vault.passwordSalt = salt;
  saveOwnerVault(vault);

  const token = issueToken({
    role: 'owner',
    email: AUTHORIZED_OWNER_EMAIL,
    name: 'Hamid Ali (Owner)',
  });
  db.addAudit('owner', 'Hamid Ali', 'OWNER_PASSWORD_SETUP', undefined, 'Initialized owner password vault');
  res.status(201).json({ token, email: AUTHORIZED_OWNER_EMAIL, name: 'Hamid Ali (Owner)' });
});

app.post('/api/auth/owner/login', async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const rateKey = `owner:${clientIp}`;
  const limit = checkRateLimit(rateKey);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${limit.retryAfterSec}s.`,
    });
  }

  const { email, password, totpCode, supabaseAccessToken } = req.body || {};

  // Option A: Verify real Supabase Auth JWT belonging strictly to hamidalinoafair@gmail.com
  if (supabaseAccessToken) {
    try {
      const sbUrl = process.env.VITE_SUPABASE_URL || SUPABASE_PROJECT_CONFIG.project_url;
      const sbKey = process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_PROJECT_CONFIG.publishable_key;
      const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      });
      if (userRes.ok) {
        const userData = (await userRes.json()) as { email?: string; email_confirmed_at?: string };
        if ((userData.email || '').toLowerCase() === AUTHORIZED_OWNER_EMAIL) {
          clearFailedAttempts(rateKey);
          setServerOwnerSupabaseJwt(supabaseAccessToken);
          const token = issueToken({
            role: 'owner',
            email: AUTHORIZED_OWNER_EMAIL,
            name: 'Hamid Ali (Owner)',
          });
          db.addAudit('owner', 'Hamid Ali', 'OWNER_LOGIN_SUPABASE', undefined, `Signed in via Supabase Auth from ${clientIp}`);
          return res.json({
            token,
            email: AUTHORIZED_OWNER_EMAIL,
            name: 'Hamid Ali (Owner)',
            twoFactorEnabled: loadOwnerVault().twoFactorEnabled,
          });
        }
      }
    } catch {}
    recordFailedAttempt(rateKey);
    return res.status(403).json({
      error: `Supabase account does not match authorized owner ${AUTHORIZED_OWNER_EMAIL}.`,
    });
  }

  // Option B: Owner Vault Password + Optional TOTP 2FA
  if (!isAuthorizedOwnerIdentifier(email)) {
    recordFailedAttempt(rateKey);
    return res.status(403).json({
      error: `Access restricted solely to authorized owner (Hamid Ali / ${AUTHORIZED_OWNER_EMAIL}). Public registration is disabled.`,
    });
  }

  const vault = loadOwnerVault();
  if (!vault.passwordHash || !vault.passwordSalt) {
    return res.status(400).json({
      error: 'Owner password is not configured yet. Please complete first-time owner setup.',
      needsSetup: true,
    });
  }

  if (!password || !verifySecret(String(password), vault.passwordHash, vault.passwordSalt)) {
    recordFailedAttempt(rateKey);
    return res.status(401).json({ error: 'Invalid owner password.' });
  }

  if (vault.twoFactorEnabled) {
    if (!totpCode) {
      return res.status(200).json({ requires2FA: true });
    }
    if (!vault.twoFactorSecret || !verifyTotpCode(vault.twoFactorSecret, String(totpCode))) {
      recordFailedAttempt(rateKey);
      return res.status(401).json({ error: 'Invalid 6-digit authenticator code.', requires2FA: true });
    }
  }

  clearFailedAttempts(rateKey);
  const token = issueToken({
    role: 'owner',
    email: AUTHORIZED_OWNER_EMAIL,
    name: 'Hamid Ali (Owner)',
  });
  db.addAudit('owner', 'Hamid Ali', 'OWNER_LOGIN', undefined, `Owner logged in from ${clientIp}`);
  res.json({
    token,
    email: AUTHORIZED_OWNER_EMAIL,
    name: 'Hamid Ali (Owner)',
    twoFactorEnabled: vault.twoFactorEnabled,
  });
});

app.post('/api/auth/owner/recover', async (req: Request, res: Response) => {
  const { action, email, recoveryCode, newPassword } = req.body || {};
  if (!isAuthorizedOwnerIdentifier(email)) {
    return res.status(403).json({ error: `Recovery allowed only for Hamid Ali (${AUTHORIZED_OWNER_EMAIL}).` });
  }

  const vault = loadOwnerVault();

  if (action === 'request') {
    const code = String(crypto.randomInt(100000, 999999));
    vault.recoveryCodeHash = crypto.createHash('sha256').update(code).digest('hex');
    vault.recoveryExpiresAt = Date.now() + 15 * 60 * 1000;
    saveOwnerVault(vault);

    // Send via WhatsApp Cloud API if configured & HTTP 2xx succeeds, otherwise log to server console cleanly (never in HTTP JSON!)
    const cloudToken = process.env.WHATSAPP_CLOUD_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    let deliveredChannel = 'server_console_and_supabase_email';
    if (cloudToken && phoneId) {
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cloudToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '923007466664',
            type: 'text',
            text: { body: `Muslim Vegetable & Fruit Shop Owner Recovery Code: ${code} (Valid 15 mins)` },
          }),
        });
        if (waRes.ok) {
          deliveredChannel = 'whatsapp_cloud';
        }
      } catch {}
    }
    if (deliveredChannel !== 'whatsapp_cloud') {
      console.log(`[OWNER RECOVERY CODE for ${AUTHORIZED_OWNER_EMAIL}]: ${code} (expires in 15 mins)`);
    }

    db.addAudit('owner', 'Hamid Ali', 'OWNER_RECOVERY_REQUESTED', undefined, `Channel: ${deliveredChannel}`);
    return res.json({
      sent: true,
      channel: deliveredChannel,
      message:
        deliveredChannel === 'whatsapp_cloud'
          ? '6-digit recovery code sent to owner WhatsApp (+923007466664).'
          : '6-digit recovery code generated in server console logs. For instant mobile recovery, use the Email OTP button (hamidalinoafair@gmail.com) right above.',
    });
  }

  if (action === 'reset_with_supabase') {
    const { supabaseAccessToken } = req.body || {};
    if (!supabaseAccessToken) {
      return res.status(400).json({ error: 'Verified Supabase session token is required.' });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    try {
      const sbUrl = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || SUPABASE_PROJECT_CONFIG.project_url);
      const sbKey = (
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        SUPABASE_PROJECT_CONFIG.publishable_key
      ).trim();
      const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      });
      if (!userRes.ok) {
        return res.status(401).json({ error: 'Supabase verification expired. Please request a fresh Email OTP.' });
      }
      const userData = (await userRes.json()) as { email?: string };
      if ((userData.email || '').toLowerCase() !== AUTHORIZED_OWNER_EMAIL) {
        return res.status(403).json({ error: `Only ${AUTHORIZED_OWNER_EMAIL} can reset the Owner password.` });
      }

      const { hash, salt } = hashSecret(String(newPassword));
      vault.passwordHash = hash;
      vault.passwordSalt = salt;
      vault.twoFactorEnabled = false;
      vault.twoFactorSecret = undefined;
      vault.recoveryCodeHash = undefined;
      vault.recoveryExpiresAt = undefined;
      saveOwnerVault(vault);
      setServerOwnerSupabaseJwt(supabaseAccessToken);

      const token = issueToken({
        role: 'owner',
        email: AUTHORIZED_OWNER_EMAIL,
        name: 'Hamid Ali (Owner)',
      });
      db.addAudit('owner', 'Hamid Ali', 'OWNER_PASSWORD_RESET_EMAIL', undefined, 'Reset Owner password & cleared 2FA via verified Gmail/Supabase OTP');
      return res.json({
        reset: true,
        token,
        email: AUTHORIZED_OWNER_EMAIL,
        name: 'Hamid Ali (Owner)',
        twoFactorEnabled: false,
        message: 'Owner password updated & 2FA lock cleared successfully!',
      });
    } catch {
      return res.status(500).json({ error: 'Could not verify Supabase email token right now.' });
    }
  }

  if (action === 'verify') {
    if (!vault.recoveryCodeHash || !vault.recoveryExpiresAt || vault.recoveryExpiresAt < Date.now()) {
      return res.status(400).json({ error: 'Recovery code missing or expired. Request a new code.' });
    }
    const inputHash = crypto.createHash('sha256').update(String(recoveryCode || '').trim()).digest('hex');
    if (inputHash !== vault.recoveryCodeHash) {
      return res.status(401).json({ error: 'Invalid recovery code.' });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    const { hash, salt } = hashSecret(String(newPassword));
    vault.passwordHash = hash;
    vault.passwordSalt = salt;
    vault.twoFactorEnabled = false;
    vault.twoFactorSecret = undefined;
    vault.recoveryCodeHash = undefined;
    vault.recoveryExpiresAt = undefined;
    saveOwnerVault(vault);
    db.addAudit('owner', 'Hamid Ali', 'OWNER_PASSWORD_RESET', undefined, 'Password updated & 2FA cleared via recovery code');
    return res.json({ reset: true, twoFactorEnabled: false, message: 'Password updated successfully (2FA reset for easy login).' });
  }

  return res.status(400).json({ error: 'Invalid recovery action.' });
});

app.post('/api/auth/owner/change-password', requireOwner, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  const vault = loadOwnerVault();
  if (
    !vault.passwordHash ||
    !vault.passwordSalt ||
    !currentPassword ||
    !verifySecret(String(currentPassword), vault.passwordHash, vault.passwordSalt)
  ) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }
  const { hash, salt } = hashSecret(String(newPassword));
  vault.passwordHash = hash;
  vault.passwordSalt = salt;
  saveOwnerVault(vault);
  db.addAudit('owner', 'Hamid Ali', 'OWNER_PASSWORD_CHANGED', undefined, 'Owner changed admin vault password');
  res.json({ changed: true, message: 'Owner password changed successfully.' });
});

app.post('/api/auth/owner/2fa/toggle', requireOwner, (req: Request, res: Response) => {
  const { enabled } = req.body || {};
  const vault = loadOwnerVault();
  if (enabled) {
    const secret = generateTwoFactorSecret();
    vault.twoFactorEnabled = true;
    vault.twoFactorSecret = secret;
    saveOwnerVault(vault);
    db.addAudit('owner', 'Hamid Ali', 'ENABLE_2FA', undefined, 'Enabled TOTP 2FA');
    return res.json({
      twoFactorEnabled: true,
      secretHex: secret,
      issuer: 'Muslim Vegetable & Fruit Shop',
      account: AUTHORIZED_OWNER_EMAIL,
    });
  } else {
    vault.twoFactorEnabled = false;
    vault.twoFactorSecret = undefined;
    saveOwnerVault(vault);
    db.addAudit('owner', 'Hamid Ali', 'DISABLE_2FA', undefined, 'Disabled TOTP 2FA');
    return res.json({ twoFactorEnabled: false });
  }
});

app.get('/api/auth/owner/me', requireOwner, (req: Request, res: Response) => {
  const session = (req as any).session;
  res.json({ authenticated: true, session, twoFactorEnabled: loadOwnerVault().twoFactorEnabled });
});

app.post('/api/auth/rider/login', (req: Request, res: Response) => {
  const clientIp = req.ip || 'unknown';
  const rateKey = `rider:${clientIp}`;
  const limit = checkRateLimit(rateKey);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many failed rider login attempts. Retry in ${limit.retryAfterSec}s.`,
    });
  }

  const { identifier, pin } = req.body || {};
  if (!identifier || !pin) {
    return res.status(400).json({ error: 'Rider ID/Phone and PIN are required.' });
  }

  const rider = db.verifyRiderCredentials(String(identifier), String(pin));
  if (!rider) {
    recordFailedAttempt(rateKey);
    return res.status(401).json({ error: 'Invalid Rider ID/Phone or PIN.' });
  }

  clearFailedAttempts(rateKey);
  const token = issueToken({
    role: 'rider',
    riderId: rider.id,
    phone: rider.phone,
    name: rider.name,
  });
  db.addAudit('rider', rider.name, 'RIDER_LOGIN', rider.id, `Rider logged in from ${clientIp}`);
  res.json({ token, rider });
});

app.post('/api/auth/customer/session', async (req: Request, res: Response) => {
  const { phone, name, supabaseAccessToken } = req.body || {};
  if (supabaseAccessToken) {
    try {
      const sbUrl = process.env.VITE_SUPABASE_URL || SUPABASE_PROJECT_CONFIG.project_url;
      const sbKey = process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_PROJECT_CONFIG.publishable_key;
      const uRes = await fetch(`${sbUrl}/auth/v1/user`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${supabaseAccessToken}` },
      });
      if (uRes.ok) {
        const user = (await uRes.json()) as { id: string; email?: string; phone?: string };
        const token = issueToken({
          role: 'customer',
          email: user.email,
          phone: user.phone || phone,
          name: name || user.email || 'Customer',
        });
        return res.json({ token, email: user.email, phone: user.phone || phone, user_id: user.id });
      }
    } catch {}
  }

  const cleanPhone = String(phone || '').replace(/[\s\-]/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Valid Pakistani phone number (e.g. 03007466664) is required.' });
  }
  const token = issueToken({
    role: 'customer',
    phone: cleanPhone,
    name: String(name || 'Valued Customer').trim(),
  });
  res.json({ token, phone: cleanPhone });
});

// =========================================================================
// 2. PUBLIC SETTINGS, PRODUCTS & KHANEWAL DELIVERY DISTANCE
// =========================================================================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'muslim-vegetable-fruit-shop',
    supabaseConnected: db.supabaseConnected,
    productsCount: db.products.length,
  });
});

app.get('/api/settings', (_req: Request, res: Response) => {
  res.json({ data: db.settings });
});

app.get('/api/products', async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === '1';
  const lastSync = db.lastSupabaseSyncAt ? new Date(db.lastSupabaseSyncAt).getTime() : 0;
  if (forceRefresh || Date.now() - lastSync > 60_000) {
    await db.syncFromSupabaseVegetables().catch(() => {});
  }

  const category = req.query.category as string;
  let products = db.getProducts();
  if (category && category !== 'all') {
    products = products.filter((p) => p.category === category);
  }
  res.json({
    data: products,
    count: products.length,
    supabaseConnected: db.supabaseConnected,
    lastSyncedAt: db.lastSupabaseSyncAt,
  });
});

app.get('/api/products/:id', (req: Request, res: Response) => {
  const product = db.getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ data: product });
});

/**
 * Khanewal Road-Route Delivery Fee Calculation
 * Uses live OSRM road driving route from Camp Chowk (30.2985, 71.9325) or verified sector road distance.
 * Rejects outside Khanewal city addresses and refuses to invent fake distances on GPS/OSRM errors.
 */
app.post('/api/delivery/calculate-route', async (req: Request, res: Response) => {
  const { areaId, address, lat, lng } = req.body || {};

  const addrCheck = validateKhanewalAddress(String(address || ''), areaId, lat ? Number(lat) : undefined, lng ? Number(lng) : undefined);
  if (!addrCheck.valid) {
    return res.status(400).json({
      valid: false,
      error: addrCheck.reasonEn,
      errorUr: addrCheck.reasonUr,
    });
  }

  if (areaId && areaId !== 'custom_gps') {
    const areas =
      db.settings.deliveryAreas && db.settings.deliveryAreas.length > 0
        ? db.settings.deliveryAreas
        : KHANEWAL_LOCATIONS;
    const sector = areas.find((loc) => loc.id === areaId);
    if (sector && sector.roadDistanceKm > 0) {
      const fee = calculateDeliveryFee(sector.roadDistanceKm, db.settings);
      return res.json({
        valid: true,
        distanceKm: sector.roadDistanceKm,
        distanceSource: 'verified_sector_road',
        deliveryFee: fee,
        coordinates: { lat: sector.lat, lng: sector.lng },
        areaName: sector.name,
        areaNameUr: sector.nameUr,
      });
    }
  }

  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || !isCoordinatesInKhanewal(numLat, numLng)) {
    return res.status(400).json({
      valid: false,
      error: 'Please select your Khanewal neighborhood or provide valid Khanewal GPS coordinates.',
      errorUr: 'براہ کرم خانیوال کا علاقہ منتخب کریں یا خانیوال کے اندر کی GPS لوکیشن فراہم کریں۔',
    });
  }

  // Real Road Driving Distance via OSRM public API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${SHOP_COORDINATES.lng},${SHOP_COORDINATES.lat};${numLng},${numLat}?overview=false`;
    const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (osrmRes.ok) {
      const osrmJson = (await osrmRes.json()) as { routes?: Array<{ distance: number; duration: number }> };
      const route = osrmJson.routes?.[0];
      if (route && typeof route.distance === 'number') {
        const roadKm = Math.max(0.5, Math.round((route.distance / 1000) * 100) / 100);
        const deliveryFee = calculateDeliveryFee(roadKm, db.settings);
        return res.json({
          valid: true,
          distanceKm: roadKm,
          distanceSource: 'osrm_road',
          deliveryFee,
          durationMinutes: Math.round((route.duration || 0) / 60),
          coordinates: { lat: numLat, lng: numLng },
        });
      }
    }
  } catch {}

  // Never silently fabricate/guess a fake road distance if routing failed
  return res.status(422).json({
    valid: false,
    requiresManualOrSector: true,
    error: 'Road routing service could not calculate exact driving distance right now. Please select the nearest verified Khanewal sector or contact Owner for delivery confirmation.',
    errorUr: 'سڑک کا فاصلہ معلوم نہیں ہو سکا۔ براہ کرم خانیوال کا قریبی علاقہ منتخب کریں یا دکان سے رابطہ کریں۔',
  });
});

app.post('/api/coupons/validate', (req: Request, res: Response) => {
  const { code, subtotal, customer_phone, delivery_fee, loyalty_points_used } = req.body || {};
  const result = db.validateCouponForCustomer(
    String(code || ''),
    Number(subtotal || 0),
    customer_phone,
    Number(delivery_fee || 0),
    Number(loyalty_points_used || 0)
  );
  if (!result.valid) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json({ data: result.coupon, discountAmount: result.discountAmount });
});

// =========================================================================
// 3. ORDERS, OFFLINE REVALIDATION, TRACKING & CUSTOMER ORDER HISTORY
// =========================================================================

/**
 * Revalidates an offline queued order against live server prices, stock, & Khanewal delivery charges
 */
app.post('/api/orders/revalidate', (req: Request, res: Response) => {
  const payload = req.body || {};
  const products = db.getProducts();
  const changes: string[] = [];
  let newSubtotal = 0;

  const validatedItems = (payload.items || []).map((item: any) => {
    const prod = products.find((p) => String(p.id) === String(item.product_id));
    if (!prod || prod.is_out_of_stock || prod.stock_quantity <= 0) {
      changes.push(`${item.product_name} is now out of stock`);
      return item;
    }
    const unitPrice = prod.price;
    let grams = Number(item.weight_grams || item.quantity * 1000);
    if (item.purchase_type === 'amount' && item.amount_paid > 0) {
      grams = calculateWeightFromMoney(unitPrice, Number(item.amount_paid));
      if (Number(item.unit_price) !== unitPrice) {
        changes.push(`${prod.urdu_name || prod.name} rate updated Rs.${item.unit_price} -> Rs.${unitPrice}/${prod.unit} (weight adjusted to ${grams}g)`);
      }
    } else if (Number(item.unit_price) !== unitPrice) {
      changes.push(`${prod.urdu_name || prod.name} rate updated Rs.${item.unit_price} -> Rs.${unitPrice}/${prod.unit}`);
    }
    const lineSub =
      item.purchase_type === 'amount' && item.amount_paid > 0
        ? Math.round(Number(item.amount_paid))
        : calculatePriceFromWeight(unitPrice, grams);
    newSubtotal += lineSub;
    return {
      ...item,
      unit_price: unitPrice,
      weight_grams: grams,
      quantity: Math.round((grams / 1000) * 1000) / 1000,
      subtotal: lineSub,
    };
  });

  const newDeliveryFee = calculateDeliveryFee(Number(payload.delivery_distance_km || 0), db.settings);
  if (newDeliveryFee !== Number(payload.delivery_fee || 0)) {
    changes.push(`Delivery fee updated Rs.${payload.delivery_fee || 0} -> Rs.${newDeliveryFee}`);
  }

  let discount = Number(payload.discount || 0);
  const pointValueRs = Number(db.settings.loyaltyPointValueRs ?? 1) || 1;
  let loyaltyPointsUsed = Math.max(0, Math.floor(Number(payload.loyalty_points_used || 0)));

  if (payload.customer_phone && loyaltyPointsUsed > 0) {
    const acc = db.getLoyaltyAccount(String(payload.customer_phone));
    if (loyaltyPointsUsed > acc.points_balance) {
      loyaltyPointsUsed = Math.max(0, acc.points_balance);
      changes.push(`Loyalty points adjusted to available balance (${loyaltyPointsUsed} pts)`);
    }
  }

  if (payload.coupon_code) {
    const cpnCheck = db.validateCouponForCustomer(
      String(payload.coupon_code),
      newSubtotal,
      payload.customer_phone,
      newDeliveryFee,
      loyaltyPointsUsed
    );
    if (cpnCheck.valid) {
      discount = cpnCheck.discountAmount;
    } else {
      discount = 0;
      changes.push(`Coupon ${payload.coupon_code} no longer applies: ${cpnCheck.error}`);
    }
  }

  const loyaltyDiscountRs = Math.min(
    Math.max(0, newSubtotal - discount),
    Math.round(loyaltyPointsUsed * pointValueRs)
  );
  const newTotal = Math.max(0, newSubtotal + newDeliveryFee - discount - loyaltyDiscountRs);

  res.json({
    changed: changes.length > 0 || newTotal !== Number(payload.total_amount || 0),
    changes,
    old_subtotal: Number(payload.subtotal || 0),
    new_subtotal: newSubtotal,
    old_delivery_fee: Number(payload.delivery_fee || 0),
    new_delivery_fee: newDeliveryFee,
    old_total: Number(payload.total_amount || 0),
    new_total: newTotal,
    updatedPayload: {
      ...payload,
      items: validatedItems,
      subtotal: newSubtotal,
      delivery_fee: newDeliveryFee,
      discount,
      loyalty_points_used: loyaltyPointsUsed,
      loyalty_discount_rs: loyaltyDiscountRs,
      total_amount: newTotal,
    },
  });
});

app.post('/api/orders', async (req: Request, res: Response) => {
  const session = extractSessionFromRequest(req);
  const catalog = db.getProducts();

  // Only allow owner to pass manual_delivery_fee_override
  const bodyToValidate = { ...req.body };
  if (!session || session.role !== 'owner') {
    delete bodyToValidate.manual_delivery_fee_override;
  }

  const validation = validateOrderInput(bodyToValidate, catalog, db.settings);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.errors[0], details: validation.errors });
  }

  // Idempotency return check before stock deduction
  if (validation.sanitizedData.idempotency_key) {
    const existing = db.orders.find((o) => o.idempotency_key === validation.sanitizedData.idempotency_key);
    if (existing) {
      return res.status(200).json({ message: 'Existing idempotent order returned', data: existing, duplicate: true });
    }
  }

  // Verify stock for every item
  for (const item of validation.sanitizedData.items) {
    const prod = db.getProductById(item.product_id);
    if (!prod) {
      return res.status(400).json({ error: `Product ${item.product_name} not found.` });
    }
    if (prod.is_out_of_stock || prod.stock_quantity < item.quantity) {
      return res.status(400).json({
        error: `Insufficient stock for ${prod.urdu_name || prod.name}. Available: ${prod.stock_quantity} ${prod.unit}`,
      });
    }
  }

  // Enforce server-side loyalty balance & enablement check BEFORE order creation
  const pointValueRs = Number(db.settings.loyaltyPointValueRs ?? 1) || 1;
  const requestedLoyaltyPoints = Math.max(
    0,
    Math.floor(Number(validation.sanitizedData.requested_loyalty_points ?? validation.sanitizedData.loyalty_points_used ?? 0))
  );

  if (requestedLoyaltyPoints > 0) {
    if (db.settings.loyaltyEnabled === false) {
      return res.status(400).json({ error: 'Loyalty points program is currently disabled.' });
    }
    const custLoyalty = db.getLoyaltyAccount(validation.sanitizedData.customer_phone);
    if (requestedLoyaltyPoints > custLoyalty.points_balance) {
      return res.status(400).json({
        error: `Insufficient loyalty points. Available: ${custLoyalty.points_balance} pts, Requested: ${requestedLoyaltyPoints} pts.`,
      });
    }
  }

  // Enforce coupon eligibility & stacking rules
  if (validation.sanitizedData.coupon_code) {
    const couponCheck = db.validateCouponForCustomer(
      validation.sanitizedData.coupon_code,
      validation.sanitizedData.subtotal,
      validation.sanitizedData.customer_phone,
      validation.sanitizedData.delivery_fee,
      requestedLoyaltyPoints
    );
    if (!couponCheck.valid) {
      return res.status(couponCheck.status).json({ error: couponCheck.error });
    }
    validation.sanitizedData.coupon_code = couponCheck.coupon.code;
    validation.sanitizedData.discount = couponCheck.discountAmount;
  } else if (!session || session.role !== 'owner') {
    validation.sanitizedData.discount = 0;
  }

  // Prevent redeeming more loyalty points than needed to cover product subtotal after coupon
  const maxOrderRedeemablePoints = Math.floor(
    Math.max(0, validation.sanitizedData.subtotal - validation.sanitizedData.discount) / Math.max(0.01, pointValueRs)
  );
  const actualLoyaltyPoints = Math.min(requestedLoyaltyPoints, maxOrderRedeemablePoints);
  const loyaltyDiscountRs = Math.round(actualLoyaltyPoints * pointValueRs);
  validation.sanitizedData.requested_loyalty_points = requestedLoyaltyPoints;
  validation.sanitizedData.loyalty_points_used = actualLoyaltyPoints;
  validation.sanitizedData.loyalty_discount_rs = loyaltyDiscountRs;
  validation.sanitizedData.total_amount = Math.max(
    0,
    validation.sanitizedData.subtotal +
      validation.sanitizedData.delivery_fee -
      validation.sanitizedData.discount -
      loyaltyDiscountRs
  );

  let created: { order: any; duplicate: boolean };
  try {
    created = db.createOrder(validation.sanitizedData);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to place order.' });
  }
  const { order } = created;

  // Trigger WhatsApp Cloud API if configured, else log prepared link cleanly
  await dispatchNotification('admin', `+${db.settings.whatsapp}`, order);

  res.status(201).json({
    message:
      order.payment_status === 'Pending Verification'
        ? 'Order received! Payment is Pending Verification by the shop owner.'
        : 'Order received successfully!',
    data: order,
  });
});

// Track Order lookup by Order ID (verifies customer phone4 or owner/customer session, returns route & live GPS)
app.get('/api/orders/track/:id', async (req: Request, res: Response) => {
  const order = db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order ID not found. Please check your order code (e.g. MVF-9055).' });
  }

  const session = extractSessionFromRequest(req);
  const phoneSuffix = String(req.query.phone4 || '').replace(/\D/g, '');
  const orderDigits = order.customer_phone.replace(/\D/g, '');
  const sessionDigits = (session?.phone || '').replace(/\D/g, '').slice(-10);

  const isSessionAuthorized =
    session?.role === 'owner' ||
    (sessionDigits.length >= 9 && orderDigits.endsWith(sessionDigits)) ||
    (session?.role === 'rider' && order.assigned_rider_id === session.riderId);

  if (phoneSuffix && phoneSuffix.length !== 4) {
    return res.status(400).json({ error: 'Please enter the last 4 digits of your phone number.' });
  }

  if (phoneSuffix && phoneSuffix.length === 4 && !orderDigits.endsWith(phoneSuffix)) {
    return res.status(403).json({ error: 'Phone verification mismatch for this Order ID.' });
  }

  const isVerified = isSessionAuthorized || (phoneSuffix.length === 4 && orderDigits.endsWith(phoneSuffix));
  if (!isVerified) {
    return res.status(200).json({
      data: {
        id: order.id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        requiresVerification: true,
      },
    });
  }

  // Honest GPS freshness check (within 5 minutes) & never show live GPS after Delivered/Cancelled
  const isCompletedOrCancelled = ['Delivered', 'Cancelled'].includes(order.order_status);
  let liveLocationIsFresh = false;
  if (!isCompletedOrCancelled && order.rider_live_location?.updated_at) {
    liveLocationIsFresh = Date.now() - new Date(order.rider_live_location.updated_at).getTime() < 300_000;
  }

  const originLat =
    liveLocationIsFresh && order.rider_live_location
      ? order.rider_live_location.lat
      : SHOP_COORDINATES.lat;
  const originLng =
    liveLocationIsFresh && order.rider_live_location
      ? order.rider_live_location.lng
      : SHOP_COORDINATES.lng;

  let routeGeometry: Array<[number, number]> | null = null;
  let etaMinutes: number | null = null;
  let distanceRemainingKm: number | null = null;

  if (!isCompletedOrCancelled && order.coordinates?.lat && order.coordinates?.lng) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${order.coordinates.lng},${order.coordinates.lat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (osrmRes.ok) {
        const osrmJson = (await osrmRes.json()) as {
          routes?: Array<{
            distance: number;
            duration: number;
            geometry?: { coordinates?: Array<[number, number]> };
          }>;
        };
        const route = osrmJson.routes?.[0];
        if (route) {
          if (Array.isArray(route.geometry?.coordinates)) {
            // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
            routeGeometry = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          }
          distanceRemainingKm = Math.round((route.distance / 1000) * 100) / 100;
          if (liveLocationIsFresh && typeof route.duration === 'number') {
            etaMinutes = Math.max(1, Math.round(route.duration / 60));
          }
        }
      }
    } catch {}
  }

  const safeReceipt = order.receipt ? { ...order.receipt, receipt_image_url: undefined } : undefined;
  res.json({
    data: {
      ...order,
      receipt: safeReceipt,
      rider_live_location: liveLocationIsFresh ? order.rider_live_location : undefined,
      gps_status: liveLocationIsFresh ? 'live' : 'unavailable',
      route_geometry: routeGeometry,
      eta_minutes: etaMinutes,
      distance_remaining_km: distanceRemainingKm,
      requiresVerification: false,
    },
  });
});

// Authenticated Customer Order History
app.get('/api/orders/my', (req: Request, res: Response) => {
  const session = extractSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Please sign in with your phone number or account to view Order History.' });
  }

  const cleanSessionPhone = (session.phone || '').replace(/\D/g, '').slice(-10);
  const matchedOrders =
    session.role === 'owner'
      ? db.orders
      : db.orders.filter((o) => {
          const oDigits = o.customer_phone.replace(/\D/g, '').slice(-10);
          return (
            (cleanSessionPhone && oDigits === cleanSessionPhone) ||
            (session.email && o.customer_email?.toLowerCase() === session.email.toLowerCase())
          );
        });

  res.json({ data: matchedOrders, count: matchedOrders.length });
});

// Upload payment receipt privately (never sets Verified automatically)
app.post('/api/payments/receipt', (req: Request, res: Response) => {
  const validation = validateReceiptInput(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.errors[0], details: validation.errors });
  }
  const receipt = db.addReceipt(validation.sanitizedData);
  res.status(201).json({
    message: 'Payment proof uploaded privately. Status is Pending Verification until confirmed by Hamid Ali.',
    data: receipt,
  });
});

app.post('/api/complaints', (req: Request, res: Response) => {
  const { order_id, customer_name, customer_phone, subject, message } = req.body || {};
  if (!customer_name || !customer_phone || !message) {
    return res.status(400).json({ error: 'Name, phone, and feedback message are required.' });
  }
  const complaint = db.addComplaint({ order_id, customer_name, customer_phone, subject: subject || 'Order Support', message });
  res.status(201).json({ data: complaint });
});

app.get('/api/reviews/:productId', (req: Request, res: Response) => {
  res.json({ data: db.reviews.filter((r) => r.product_id === req.params.productId) });
});

app.post('/api/reviews', (req: Request, res: Response) => {
  const { product_id, user_name, rating, freshness_score, comment } = req.body || {};
  if (!product_id || !user_name || !rating || !comment) {
    return res.status(400).json({ error: 'Missing required review fields.' });
  }
  const newRev = db.addReview(product_id, user_name, Number(rating), Number(freshness_score || 5), comment);
  res.status(201).json({ data: newRev });
});

app.get('/api/loyalty/:phone', (req: Request, res: Response) => {
  res.json({ data: db.getLoyaltyAccount(req.params.phone) });
});

app.get('/api/marketing/campaigns', (_req: Request, res: Response) => {
  res.json({ data: db.campaigns });
});

// =========================================================================
// 4. RIDER PORTAL ROUTES (Strictly Scoped to Assigned Rider)
// =========================================================================

app.get('/api/rider/orders', requireRider, (req: Request, res: Response) => {
  const session = (req as any).session;
  const assigned = db.orders.filter((o) => o.assigned_rider_id === session.riderId);
  const riderProfile = db.getPublicRiders().find((r) => r.id === session.riderId);
  res.json({ data: assigned, rider: riderProfile });
});

app.patch('/api/rider/orders/:id/status', requireRider, (req: Request, res: Response) => {
  const session = (req as any).session;
  const ord = db.getOrderById(req.params.id);
  if (!ord) return res.status(404).json({ error: 'Order not found.' });
  if (ord.assigned_rider_id !== session.riderId) {
    return res.status(403).json({ error: 'Access Denied: This order is not assigned to you.' });
  }

  const allowedRiderStatuses = [
    'Order Accepted',
    'Preparing',
    'Ready for Delivery',
    'Picked Up',
    'On the Way',
    'Out for Delivery',
    'Delivered',
  ];

  const { status, otp } = req.body || {};
  if (!allowedRiderStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid rider status. Allowed: ${allowedRiderStatuses.join(', ')}` });
  }

  if (status === 'Delivered' && db.settings.requireDeliveryOtp) {
    if (!otp || String(otp).trim() !== ord.delivery_otp) {
      return res.status(400).json({ error: 'Invalid 4-digit customer Delivery OTP.' });
    }
    ord.otp_verified = true;
  }

  const updated = db.updateOrderStatus(ord.id, status, 'rider', session.name);
  if (status === 'Delivered') {
    const rider = db.riders.find((r) => r.id === session.riderId);
    if (rider) {
      rider.completed_deliveries += 1;
      rider.assigned_orders_count = Math.max(0, rider.assigned_orders_count - 1);
    }
  }
  res.json({ data: updated });
});

app.post('/api/rider/location', requireRider, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { lat, lng, orderId, accuracy, speed } = req.body || {};
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    return res.status(400).json({ error: 'Valid lat and lng coordinates required.' });
  }
  const result = db.updateRiderLiveCoordinates(session.riderId, numLat, numLng, {
    orderId: orderId ? String(orderId) : undefined,
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined,
    speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
  });
  res.json({ updated: true, ...result });
});

app.post('/api/rider/location/stop', requireRider, (req: Request, res: Response) => {
  const session = (req as any).session;
  const { orderId } = req.body || {};
  const stoppedOrderIds = db.stopRiderLiveCoordinates(
    session.riderId,
    orderId ? String(orderId) : undefined
  );
  res.json({ stopped: true, stoppedOrderIds });
});

// =========================================================================
// 5. OWNER-ONLY ADMIN ROUTES (Hamid Ali - Strict Authentication Required)
// =========================================================================

app.get('/api/admin/live-fleet', requireOwner, (_req: Request, res: Response) => {
  const activeOrders = db.orders
    .filter((o) => !['Delivered', 'Cancelled'].includes(o.order_status))
    .map((o) => ({
      id: o.id,
      customer_name: o.customer_name,
      delivery_area: o.delivery_area,
      coordinates: o.coordinates,
      order_status: o.order_status,
      assigned_rider_id: o.assigned_rider_id,
      assigned_rider_name: o.assigned_rider_name,
      rider_live_location: o.rider_live_location,
      total_amount: o.total_amount,
    }));
  const riders = db.getPublicRiders();
  res.json({ data: { activeOrders, riders } });
});

app.get('/api/admin/overview', requireOwner, (_req: Request, res: Response) => {
  const daily = db.computeBusinessReport('daily');
  const weekly = db.computeBusinessReport('weekly');
  res.json({
    data: {
      daily,
      weekly,
      totalProducts: db.products.length,
      outOfStockCount: db.products.filter((p) => p.is_out_of_stock || p.stock_quantity <= 0).length,
      pendingVerificationsCount: db.receipts.filter((r) => r.status === 'pending').length,
      openComplaintsCount: db.complaints.filter((c) => c.status !== 'resolved').length,
      activeRidersCount: db.riders.filter((r) => r.is_active).length,
      supabaseConnected: db.supabaseConnected,
      lastSupabaseSyncAt: db.lastSupabaseSyncAt,
    },
  });
});

app.post('/api/products', requireOwner, async (req: Request, res: Response) => {
  const validation = validateProductInput(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.errors[0], details: validation.errors });
  }
  const newProduct = await db.createProduct(validation.sanitizedData, 'Hamid Ali');
  res.status(201).json({ data: newProduct });
});

app.put('/api/products/:id', requireOwner, async (req: Request, res: Response) => {
  const existing = db.getProductById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const mergedInput = { ...existing, ...(req.body || {}) };
  const validation = validateProductInput(mergedInput);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.errors[0], details: validation.errors });
  }
  const { product, supabaseSynced } = await db.updateProduct(req.params.id, validation.sanitizedData, 'Hamid Ali');
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ data: product, supabaseSynced });
});

app.post('/api/products/:id/stock', requireOwner, (req: Request, res: Response) => {
  const stock = Number(req.body.stock_quantity);
  if (isNaN(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock quantity.' });
  const updated = db.updateProductStock(req.params.id, stock, 'Hamid Ali');
  if (!updated) return res.status(404).json({ error: 'Product not found.' });
  res.json({ data: updated });
});

app.delete('/api/products/:id', requireOwner, async (req: Request, res: Response) => {
  const deleted = await db.deleteProduct(req.params.id, 'Hamid Ali');
  if (!deleted) return res.status(404).json({ error: 'Product not found.' });
  res.json({ deleted: true });
});

app.get('/api/admin/orders', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.orders });
});

app.patch('/api/admin/orders/:id', requireOwner, (req: Request, res: Response) => {
  const ord = db.getOrderById(req.params.id);
  if (!ord) return res.status(404).json({ error: 'Order not found.' });

  const { order_status, note, rejection_reason, manual_delivery_fee_override, assigned_rider_id } = req.body || {};

  if (manual_delivery_fee_override !== undefined && !isNaN(Number(manual_delivery_fee_override))) {
    const newFee = Math.max(0, Number(manual_delivery_fee_override));
    const pv = Number(db.settings.loyaltyPointValueRs ?? 1) || 1;
    const loyDisc = ord.loyalty_discount_rs ?? Math.round((ord.loyalty_points_used || 0) * pv);
    ord.manual_delivery_fee_override = newFee;
    ord.delivery_fee = newFee;
    ord.distance_source = 'owner_manual';
    ord.total_amount = Math.max(0, ord.subtotal + newFee - ord.discount - loyDisc);
    ord.updated_at = new Date().toISOString();
    db.addAudit('owner', 'Hamid Ali', 'OVERRIDE_DELIVERY_FEE', ord.id, `Delivery fee set manually to Rs.${newFee}`);
    if (!order_status) {
      db.persist();
      db.syncOrderToSupabase(ord).catch(() => {});
    }
  }

  if (assigned_rider_id) {
    db.assignRiderToOrders([ord.id], String(assigned_rider_id), 'Hamid Ali');
  }

  if (order_status) {
    db.updateOrderStatus(ord.id, order_status, 'owner', 'Hamid Ali', note, rejection_reason);
  }

  res.json({ data: ord });
});

app.get('/api/admin/receipts', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.receipts });
});

// Authenticated owner-only receipt screenshot image fetch
app.get('/api/admin/receipts/:id/image', requireOwner, (req: Request, res: Response) => {
  const dataUrl = db.getPrivateReceiptImage(req.params.id);
  if (!dataUrl) return res.status(404).json({ error: 'Receipt image not found.' });
  res.json({ imageDataUrl: dataUrl });
});

app.post('/api/admin/receipts/:id/verify', requireOwner, (req: Request, res: Response) => {
  const { status, notes } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected.' });
  }
  const verified = db.verifyReceipt(req.params.id, status, notes, 'Hamid Ali');
  if (!verified) return res.status(404).json({ error: 'Receipt not found.' });
  res.json({ data: verified });
});

app.get('/api/admin/riders', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.getPublicRiders() });
});

app.post('/api/admin/riders', requireOwner, (req: Request, res: Response) => {
  const { name, phone, vehicle_type, vehicle_reg, pin } = req.body || {};
  if (!name || !phone || !pin) {
    return res.status(400).json({ error: 'Rider name, phone, and PIN are required.' });
  }
  const rider = db.addRider({ name, phone, vehicle_type, vehicle_reg, pin }, 'Hamid Ali');
  res.status(201).json({ data: rider });
});

app.patch('/api/admin/riders/:id', requireOwner, (req: Request, res: Response) => {
  const rider = db.riders.find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: 'Rider not found.' });
  if (typeof req.body.is_active === 'boolean') rider.is_active = req.body.is_active;
  if (req.body.pin) {
    const { hash, salt } = hashSecret(String(req.body.pin));
    rider.pin_hash = `${salt}:${hash}`;
  }
  if (req.body.name) rider.name = req.body.name;
  if (req.body.phone) rider.phone = req.body.phone;
  res.json({ data: db.getPublicRiders().find((r) => r.id === rider.id) });
});

app.post('/api/dispatch/optimize-route', requireOwner, (req: Request, res: Response) => {
  const { order_ids, rider_id } = req.body || {};
  let targets = db.orders.filter((o) =>
    ['Order Received', 'Order Confirmed', 'Preparing', 'Rider Assigned'].includes(o.order_status)
  );
  if (Array.isArray(order_ids) && order_ids.length > 0) {
    targets = db.orders.filter((o) => order_ids.includes(o.id));
  }
  const rider = db.riders.find((r) => r.id === rider_id) || db.riders[0];
  res.json({ data: optimizeDeliveryRoute(targets, rider?.id, rider?.name) });
});

app.post('/api/dispatch/assign-rider', requireOwner, async (req: Request, res: Response) => {
  const { order_ids, rider_id } = req.body || {};
  if (!Array.isArray(order_ids) || order_ids.length === 0 || !rider_id) {
    return res.status(400).json({ error: 'order_ids array and rider_id are required.' });
  }
  const result = db.assignRiderToOrders(order_ids, rider_id, 'Hamid Ali');
  if (result.orders.length === 0) {
    return res.status(400).json({ error: result.errors[0] || 'No orders assigned.' });
  }
  const rider = db.riders.find((r) => r.id === rider_id)!;
  const route = optimizeDeliveryRoute(result.orders, rider.id, rider.name);
  route.stops.forEach((s) => {
    const ord = db.getOrderById(s.order_id);
    if (ord) {
      ord.dispatch_sequence = s.stop_number;
      ord.estimated_delivery_time = `${s.estimated_arrival_minutes} mins`;
    }
  });
  for (const s of route.stops) {
    const ord = db.getOrderById(s.order_id);
    if (ord) await dispatchNotification('rider', rider.phone, ord, s.stop_number);
  }
  res.json({ data: route, warnings: result.errors });
});

app.get('/api/admin/reports', requireOwner, (req: Request, res: Response) => {
  const range = (req.query.range as 'daily' | 'weekly' | 'monthly') || 'daily';
  res.json({ data: db.computeBusinessReport(range) });
});

app.get('/api/admin/expenses', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.expenses });
});

app.post('/api/admin/expenses', requireOwner, (req: Request, res: Response) => {
  const { title, amount, category, date, notes } = req.body || {};
  if (!title || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid expense title and positive amount required.' });
  }
  const exp = db.addExpense({
    title,
    amount: Number(amount),
    category: category || 'Wholesale Purchase',
    date: date || new Date().toISOString().slice(0, 10),
    notes,
  });
  res.status(201).json({ data: exp });
});

app.get('/api/admin/coupons', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.coupons });
});

app.post('/api/admin/coupons', requireOwner, (req: Request, res: Response) => {
  const {
    code,
    discount_type,
    value,
    min_order,
    active,
    description,
    assigned_phones,
    expires_at,
    max_uses,
    uses_count,
    per_customer_limit,
    allow_loyalty_stacking,
  } = req.body || {};
  const type = discount_type || 'fixed';
  const numVal = type === 'free_delivery' ? Number(value || 0) : Number(value);
  if (!code || (type !== 'free_delivery' && (!Number.isFinite(numVal) || numVal <= 0))) {
    return res.status(400).json({ error: 'Coupon code and valid discount value required.' });
  }
  if (type === 'percent' && numVal > 100) {
    return res.status(400).json({ error: 'Percentage coupon discount cannot exceed 100%.' });
  }
  const normalizedPhones = db.normalizeAssignedPhones(assigned_phones);
  const c = db.addCoupon({
    code,
    discount_type: type,
    value: numVal,
    min_order: Math.max(0, Number(min_order || 0)),
    active: active !== false,
    description: description || '',
    expires_at: expires_at ? String(expires_at).trim() : undefined,
    max_uses: max_uses !== undefined && max_uses !== null && max_uses !== '' ? Number(max_uses) : undefined,
    uses_count: uses_count !== undefined && uses_count !== null && uses_count !== '' ? Number(uses_count) : undefined,
    per_customer_limit:
      per_customer_limit !== undefined && per_customer_limit !== null && per_customer_limit !== ''
        ? Number(per_customer_limit)
        : undefined,
    allow_loyalty_stacking: Boolean(allow_loyalty_stacking),
    ...(normalizedPhones.length > 0 ? { assigned_phones: normalizedPhones } : {}),
  });
  res.status(201).json({ data: c });
});

app.delete('/api/admin/coupons/:code', requireOwner, (req: Request, res: Response) => {
  const deleted = db.deleteCoupon(req.params.code, 'Hamid Ali');
  if (!deleted) return res.status(404).json({ error: 'Coupon not found.' });
  res.json({ deleted: true });
});

app.get('/api/admin/customers', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.getCustomersDirectory() });
});

app.get('/api/admin/loyalty/:phone', requireOwner, (req: Request, res: Response) => {
  res.json({ data: db.getLoyaltyAccount(req.params.phone) });
});

app.post('/api/admin/loyalty/adjust', requireOwner, (req: Request, res: Response) => {
  const { phone, deltaPoints, reason, customerName } = req.body || {};
  const digits = String(phone || '').replace(/\D/g, '');
  const delta = Number(deltaPoints);
  if (digits.length < 9 || !Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Valid phone number and non-zero point adjustment required.' });
  }
  const updated = db.adjustCustomerLoyaltyPoints(
    String(phone),
    delta,
    String(reason || 'Manual Admin adjustment'),
    customerName ? String(customerName) : undefined,
    'Hamid Ali'
  );
  res.json({ data: updated });
});

app.get('/api/admin/integrations-status', requireOwner, (_req: Request, res: Response) => {
  const gemKey = (process.env.GEMINI_API_KEY || '').trim();
  const hasGemini = Boolean(gemKey && gemKey !== 'MY_GEMINI_API_KEY');
  const waToken = (process.env.WHATSAPP_CLOUD_TOKEN || '').trim();
  const waPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const sbUrl = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const sbAnon = Boolean(
    (process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
  );
  const sbService = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());

  res.json({
    data: {
      gemini: {
        configured: hasGemini,
        source: hasGemini ? 'env' : 'none',
        maskedPreview: hasGemini ? `${gemKey.slice(0, 4)}••••${gemKey.slice(-3)}` : undefined,
      },
      whatsappCloud: {
        configured: Boolean(waToken && waPhoneId),
        hasToken: Boolean(waToken),
        hasPhoneNumberId: Boolean(waPhoneId),
        phoneNumberIdPreview: waPhoneId ? `•••${waPhoneId.slice(-4)}` : undefined,
      },
      supabase: {
        url: sbUrl,
        anonKeyConfigured: sbAnon,
        serviceRoleConfigured: sbService,
      },
      paymentGateways: {
        mode: 'manual_verification',
        jazzCashMerchantManual: Boolean(db.settings.jazzCashAccount && db.settings.jazzCashTillId),
        jazzCashPersonalManual: Boolean(db.settings.jazzCashPersonalAccount?.trim()),
        easypaisaManual: Boolean(db.settings.easypaisaAccount?.trim()),
        bankAlfalahManual: Boolean(db.settings.bankAccountNumber),
        raastManual: Boolean(db.settings.raastId),
        automatedApiConfigured: false,
      },
      appUrl: (process.env.APP_URL || '').trim() || 'http://localhost:3000',
    },
  });
});

app.get('/api/admin/complaints', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.complaints });
});

app.patch('/api/admin/complaints/:id', requireOwner, (req: Request, res: Response) => {
  const updated = db.updateComplaint(req.params.id, req.body.status, req.body.owner_reply, 'Hamid Ali');
  if (!updated) return res.status(404).json({ error: 'Complaint not found.' });
  res.json({ data: updated });
});

app.put('/api/admin/settings', requireOwner, (req: Request, res: Response) => {
  const updated = db.updateSettings(req.body || {}, 'Hamid Ali');
  res.json({ data: updated });
});

app.get('/api/admin/launch-status', requireOwner, async (_req: Request, res: Response) => {
  const status = await db.checkSupabaseLaunchStatus();
  res.json({ data: status });
});

app.get('/api/admin/migration-sql', requireOwner, (_req: Request, res: Response) => {
  const sqlPath = path.join(process.cwd(), 'supabase', 'complete_migration.sql');
  if (!fs.existsSync(sqlPath)) {
    return res.status(404).json({ error: 'Migration SQL file not found.' });
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const projectUrl = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || SUPABASE_PROJECT_CONFIG.project_url);
  const ref = projectUrl.replace(/^https?:\/\//, '').split('.')[0] || '';
  res.json({
    data: {
      sql,
      sqlEditorUrl: ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard',
    },
  });
});

app.post('/api/admin/supabase-sync', requireOwner, async (_req: Request, res: Response) => {
  const result = await db.syncAllToSupabase();
  const status = await db.checkSupabaseLaunchStatus();
  res.json({ data: { ...result, status } });
});

app.get('/api/admin/audit-logs', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: db.auditLogs });
});

app.get('/api/notifications/logs', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: getNotificationLogs() });
});

app.post('/api/marketing/broadcast', requireOwner, (req: Request, res: Response) => {
  const { title, message, target_audience, discount_code } = req.body || {};
  if (!title || !message) return res.status(400).json({ error: 'Campaign title and message required.' });
  const c = db.createMarketingCampaign(title, message, target_audience, discount_code);
  res.status(201).json({ data: c });
});

app.get('/api/backup/history', requireOwner, (_req: Request, res: Response) => {
  res.json({ data: getBackupHistory() });
});

app.post('/api/backup/create', requireOwner, (_req: Request, res: Response) => {
  const backup = createDatabaseBackup(
    { products: db.products, orders: db.orders, receipts: db.receipts, reviews: db.reviews },
    'manual'
  );
  res.json({ data: backup });
});

app.post('/api/backup/restore', requireOwner, (req: Request, res: Response) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid backup payload.' });
  res.json({ success: db.restoreFromDump(data) });
});

/**
 * Clean Project ZIP Export (Owner-Only)
 * Strictly excludes .env, secrets, server/data vaults & private receipts, node_modules, dist,
 * and private CNIC / API-key screenshots in public/assets/aistudio/*.jpg.
 */
app.get('/api/admin/export-zip', requireOwner, async (_req: Request, res: Response) => {
  try {
    const zip = new JSZip();
    const rootDir = process.cwd();
    const excludedDirs = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.aistudio', '.vite', 'server/data', 'tmp']);

    const addFolderToZip = (dirPath: string, relBase: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

        if (excludedDirs.has(relPath) || excludedDirs.has(entry.name)) continue;
        if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
        if (entry.name.endsWith('.zip')) continue;

        // Exclude personal screenshots & uploaded archive from public/assets/aistudio except HAMID_Shop QR poster
        if (
          relPath.startsWith('public/assets/aistudio/') &&
          entry.name !== 'HAMID_Shop_20261117_112034_4079c0cb.png'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          addFolderToZip(fullPath, relPath);
        } else if (entry.isFile()) {
          zip.file(relPath, fs.readFileSync(fullPath));
        }
      }
    };

    addFolderToZip(rootDir, '');
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    db.addAudit('owner', 'Hamid Ali', 'EXPORT_CLEAN_ZIP', undefined, 'Downloaded clean GitHub-ready project ZIP');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="muslim-vegetable-fruit-shop-clean.zip"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to generate ZIP: ${err?.message || 'unknown'}` });
  }
});

// =========================================================================
// 6. FREE-TIER GEMINI AI ASSISTANTS (Owner Admin + Customer Shopping)
// =========================================================================

app.post('/api/ai/admin', requireOwner, async (req: Request, res: Response) => {
  const { prompt } = req.body || {};
  if (!prompt || String(prompt).trim().length < 2) {
    return res.status(400).json({ error: 'Please provide a command or question in Urdu or English.' });
  }
  const daily = db.computeBusinessReport('daily');
  const result = await runOwnerAdminAI({
    prompt: String(prompt),
    products: db.getProducts(),
    summary: {
      todaySales: daily.totalSales,
      todayOrdersCount: daily.ordersCount,
      pendingOrdersCount: daily.pendingOrdersCount,
      lowStockCount: daily.lowStockProducts.length,
      recordedProfit: daily.netProfit,
      expensesTotal: daily.expensesTotal,
    },
  });
  res.json(result);
});

app.post('/api/ai/customer', async (req: Request, res: Response) => {
  const { prompt, lang = 'ur', orderId, history, cartSummary } = req.body || {};
  if (!prompt || String(prompt).trim().length < 2) {
    return res.status(400).json({ error: 'Please write or ask a question.' });
  }
  const trackedOrder = orderId ? db.getOrderById(String(orderId)) : null;
  const result = await runCustomerShoppingAI({
    prompt: String(prompt),
    lang: lang === 'en' ? 'en' : 'ur',
    history: Array.isArray(history) ? history : [],
    cartSummary:
      cartSummary && typeof cartSummary === 'object'
        ? { count: Number(cartSummary.count || 0), subtotal: Number(cartSummary.subtotal || 0) }
        : undefined,
    products: db.getProducts().map((p) => ({
      id: p.id,
      name: p.name,
      urdu_name: p.urdu_name,
      price: p.price,
      unit: p.unit,
      is_out_of_stock: p.is_out_of_stock,
      stock_quantity: p.stock_quantity,
    })),
    trackedOrder: trackedOrder
      ? {
          id: trackedOrder.id,
          order_status: trackedOrder.order_status,
          payment_status: trackedOrder.payment_status,
          total_amount: trackedOrder.total_amount,
          delivery_fee: trackedOrder.delivery_fee,
        }
      : null,
  });
  res.json(result);
});

app.post('/api/ai/transcribe-voice', async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm', lang = 'ur' } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length > 4_500_000) {
    return res.status(400).json({ ok: false, error: 'Invalid or oversized audio payload.' });
  }
  const result = await transcribeVoiceSearchAudio({
    audioBase64,
    mimeType: String(mimeType),
    lang: lang === 'en' ? 'en' : 'ur',
  });
  res.json(result);
});

// =========================================================================
// VITE INTEGRATION & SERVER START
// =========================================================================

async function startServer() {
  const httpServer = http.createServer(app);
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        ws: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (isHmrDisabled) {
      app.get('/@vite/client', async (_req: Request, res: Response, next) => {
        try {
          const transformed = await vite.transformRequest('/@vite/client');
          if (!transformed) return next();
          const safeClientCode = transformed.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled by DISABLE_HMR=true */'
          );
          res.setHeader('Content-Type', 'application/javascript');
          res.send(safeClientCode);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Muslim Vegetable & Fruit Shop server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
