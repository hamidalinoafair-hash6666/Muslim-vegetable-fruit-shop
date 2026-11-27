import {
  AuditLogEntry,
  Coupon,
  CustomerComplaint,
  CustomerDirectoryEntry,
  DatabaseBackup,
  Expense,
  IntegrationStatus,
  LoyaltyAccount,
  MarketingCampaign,
  OptimizedRoute,
  Order,
  PaymentReceipt,
  Product,
  Review,
  Rider,
  ShopSettings,
} from '../types';
import {
  DEFAULT_SHOP_SETTINGS,
  INITIAL_COUPONS,
  INITIAL_PRODUCTS,
  KHANEWAL_LOCATIONS,
  enrichSupabaseVegetableRow,
} from '../data/initialData';
import { SUPABASE_URL, getSupabaseRestHeaders } from './supabaseClient';
import {
  SHOP_COORDINATES,
  calculateDeliveryFee,
  isCoordinatesInKhanewal,
  validateKhanewalAddress,
} from '../utils/calculations';

const CACHE_KEY_PRODUCTS = 'mvfs_cached_products_v2';
const CACHE_KEY_SETTINGS = 'mvfs_cached_settings_v2';
const getLoyaltyCacheKey = (phone: string) =>
  `mvfs_loyalty_v3_${String(phone || '').replace(/\D/g, '').slice(-10) || 'guest'}`;
const STATIC_ORDERS_KEY = 'mvfs_static_orders_v2';
const OWNER_TOKEN_KEY = 'mvfs_owner_token';
const RIDER_TOKEN_KEY = 'mvfs_rider_token';
const CUSTOMER_TOKEN_KEY = 'mvfs_customer_token';

export const tokenStore = {
  getOwnerToken: () => localStorage.getItem(OWNER_TOKEN_KEY) || '',
  setOwnerToken: (t: string) => (t ? localStorage.setItem(OWNER_TOKEN_KEY, t) : localStorage.removeItem(OWNER_TOKEN_KEY)),
  getRiderToken: () => localStorage.getItem(RIDER_TOKEN_KEY) || '',
  setRiderToken: (t: string) => (t ? localStorage.setItem(RIDER_TOKEN_KEY, t) : localStorage.removeItem(RIDER_TOKEN_KEY)),
  getCustomerToken: () => localStorage.getItem(CUSTOMER_TOKEN_KEY) || '',
  setCustomerToken: (t: string) => (t ? localStorage.setItem(CUSTOMER_TOKEN_KEY, t) : localStorage.removeItem(CUSTOMER_TOKEN_KEY)),
};

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function isStaticHostResponse(res: Response, rawText: string): boolean {
  const ct = res.headers.get('content-type') || '';
  return (
    !ct.includes('application/json') &&
    (res.status === 404 || rawText.trim().startsWith('<!') || rawText.trim().startsWith('<html'))
  );
}

function loadStaticOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STATIC_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStaticOrder(order: Order) {
  try {
    const existing = loadStaticOrders().filter((o) => o.id !== order.id);
    localStorage.setItem(STATIC_ORDERS_KEY, JSON.stringify([order, ...existing].slice(0, 30)));
  } catch {}
}

async function parseJsonOrThrow(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const raw = await res.text().catch(() => '');
    if (raw.trim().startsWith('<!') || raw.trim().startsWith('<html') || res.status === 404) {
      throw new Error(
        'Backend server required for this action (Owner Console / Rider GPS / AI). Static GitHub Pages supports live catalogue browsing & WhatsApp checkout. | اس فیچر کے لیے لائیو Node.js سرور درکار ہے۔'
      );
    }
    throw new Error(`Unexpected response (${res.status})`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.details?.join(', ') || `Request failed (${res.status})`);
  }
  return json;
}

export const api = {
  // =========================================================================
  // AUTHENTICATION (Owner, Rider, Customer)
  // =========================================================================
  async getOwnerAuthStatus(): Promise<{ email: string; configured: boolean; twoFactorEnabled: boolean }> {
    const res = await fetch('/api/auth/owner/status');
    return parseJsonOrThrow(res);
  },

  async setupOwnerPassword(email: string, password: string): Promise<{ token: string; email: string; name: string }> {
    const res = await fetch('/api/auth/owner/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJsonOrThrow(res);
    if (data.token) tokenStore.setOwnerToken(data.token);
    return data;
  },

  async loginOwner(params: {
    email?: string;
    password?: string;
    totpCode?: string;
    supabaseAccessToken?: string;
  }): Promise<{ token?: string; requires2FA?: boolean; twoFactorEnabled?: boolean; email?: string; name?: string }> {
    const res = await fetch('/api/auth/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await parseJsonOrThrow(res);
    if (data.token) tokenStore.setOwnerToken(data.token);
    return data;
  },

  async verifyOwnerSession(): Promise<{ authenticated: boolean; twoFactorEnabled: boolean }> {
    const token = tokenStore.getOwnerToken();
    if (!token) return { authenticated: false, twoFactorEnabled: false };
    const res = await fetch('/api/auth/owner/me', {
      headers: authHeaders(token),
    });
    if (!res.ok) {
      tokenStore.setOwnerToken('');
      return { authenticated: false, twoFactorEnabled: false };
    }
    return res.json();
  },

  async recoverOwnerPassword(payload: {
    action: 'request' | 'verify' | 'reset_with_supabase';
    email: string;
    recoveryCode?: string;
    newPassword?: string;
    supabaseAccessToken?: string;
  }) {
    const res = await fetch('/api/auth/owner/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonOrThrow(res);
    if (data.token) tokenStore.setOwnerToken(data.token);
    return data;
  },

  async changeOwnerPassword(currentPassword: string, newPassword: string): Promise<{ changed: boolean; message: string }> {
    const res = await fetch('/api/auth/owner/change-password', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return parseJsonOrThrow(res);
  },

  async toggleOwner2FA(enabled: boolean) {
    const res = await fetch('/api/auth/owner/2fa/toggle', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ enabled }),
    });
    return parseJsonOrThrow(res);
  },

  async loginRider(identifier: string, pin: string): Promise<{ token: string; rider: Rider }> {
    const res = await fetch('/api/auth/rider/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, pin }),
    });
    const data = await parseJsonOrThrow(res);
    if (data.token) tokenStore.setRiderToken(data.token);
    return data;
  },

  async createCustomerSession(params: { phone?: string; name?: string; supabaseAccessToken?: string }) {
    const res = await fetch('/api/auth/customer/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await parseJsonOrThrow(res);
    if (data.token) tokenStore.setCustomerToken(data.token);
    return data;
  },

  // =========================================================================
  // SETTINGS & CATALOG (With Live Supabase + Offline PWA Cache Fallback)
  // =========================================================================
  async getSettings(): Promise<ShopSettings> {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          localStorage.setItem(CACHE_KEY_SETTINGS, JSON.stringify(json.data));
          return json.data;
        }
      }
    } catch {}
    const cached = localStorage.getItem(CACHE_KEY_SETTINGS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return DEFAULT_SHOP_SETTINGS;
  },

  async getProducts(category?: string, forceRefresh = false): Promise<{ products: Product[]; liveSynced: boolean }> {
    try {
      const url = `/api/products${forceRefresh ? '?refresh=1' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const products: Product[] = json.data || [];
        localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(products));
        const filtered =
          category && category !== 'all' ? products.filter((p) => p.category === category) : products;
        return { products: filtered, liveSynced: true };
      }
    } catch {}

    // Direct Supabase public read fallback (for static GitHub Pages deploy when Express server isn't running)
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/vegetables?select=*&order=id.asc`, {
          headers: getSupabaseRestHeaders(),
        });
        if (sbRes.ok) {
          const rows = await sbRes.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const products = rows.map(enrichSupabaseVegetableRow);
            localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(products));
            const filtered =
              category && category !== 'all' ? products.filter((p) => p.category === category) : products;
            return { products: filtered, liveSynced: true };
          }
        }
      } catch {}
    }

    // Offline cache fallback
    const cached = localStorage.getItem(CACHE_KEY_PRODUCTS);
    if (cached) {
      try {
        const parsed: Product[] = JSON.parse(cached);
        return {
          products: category && category !== 'all' ? parsed.filter((p) => p.category === category) : parsed,
          liveSynced: false,
        };
      } catch {}
    }
    return {
      products:
        category && category !== 'all'
          ? INITIAL_PRODUCTS.filter((p) => p.category === category)
          : INITIAL_PRODUCTS,
      liveSynced: false,
    };
  },

  // =========================================================================
  // KHANEWAL DELIVERY ROUTE & COUPONS
  // =========================================================================
  async calculateDeliveryRoute(params: { areaId?: string; address?: string; lat?: number; lng?: number }) {
    try {
      const res = await fetch('/api/delivery/calculate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        if (!res.ok) {
          throw Object.assign(new Error(json.errorUr || json.error || 'Delivery route check failed'), { details: json });
        }
        return json as {
          valid: boolean;
          distanceKm: number;
          distanceSource: 'osrm_road' | 'verified_sector_road';
          deliveryFee: number;
          durationMinutes?: number;
          coordinates: { lat: number; lng: number };
        };
      }
    } catch (err: any) {
      if (err?.details) throw err;
    }

    // Static GitHub Pages fallback (without Node backend): verify Khanewal boundary + verified sector OR OSRM road lookup
    const addrCheck = validateKhanewalAddress(
      String(params.address || ''),
      params.areaId,
      params.lat,
      params.lng
    );
    if (!addrCheck.valid) {
      throw new Error(addrCheck.reasonUr || addrCheck.reasonEn || 'Outside Khanewal service area');
    }

    if (params.areaId && params.areaId !== 'custom_gps') {
      const sector = KHANEWAL_LOCATIONS.find((l) => l.id === params.areaId);
      if (sector && sector.roadDistanceKm > 0) {
        return {
          valid: true,
          distanceKm: sector.roadDistanceKm,
          distanceSource: 'verified_sector_road' as const,
          deliveryFee: calculateDeliveryFee(sector.roadDistanceKm),
          coordinates: { lat: sector.lat, lng: sector.lng },
        };
      }
    }

    const numLat = Number(params.lat);
    const numLng = Number(params.lng);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || !isCoordinatesInKhanewal(numLat, numLng)) {
      throw new Error('Please choose a Khanewal neighborhood or valid Khanewal GPS pin.');
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${SHOP_COORDINATES.lng},${SHOP_COORDINATES.lat};${numLng},${numLat}?overview=false`;
    const osrmRes = await fetch(osrmUrl);
    if (osrmRes.ok) {
      const osrmJson = await osrmRes.json();
      const route = osrmJson?.routes?.[0];
      if (route && typeof route.distance === 'number') {
        const roadKm = Math.max(0.5, Math.round((route.distance / 1000) * 100) / 100);
        return {
          valid: true,
          distanceKm: roadKm,
          distanceSource: 'osrm_road' as const,
          deliveryFee: calculateDeliveryFee(roadKm),
          durationMinutes: Math.round((route.duration || 0) / 60),
          coordinates: { lat: numLat, lng: numLng },
        };
      }
    }
    throw new Error('Road routing unavailable. Please pick your Khanewal neighborhood from the list.');
  },

  async validateCoupon(
    code: string,
    subtotal: number,
    customerPhone?: string,
    deliveryFee = 0,
    loyaltyPointsUsed = 0
  ): Promise<Coupon> {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        subtotal,
        customer_phone: customerPhone,
        delivery_fee: deliveryFee,
        loyalty_points_used: loyaltyPointsUsed,
      }),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invalid or expired coupon code.');
      return json.data;
    }

    // Static GitHub Pages fallback
    const clean = String(code || '').trim().toUpperCase();
    const coupon = INITIAL_COUPONS.find((c) => c.code === clean && c.active);
    if (!coupon) throw new Error('Invalid or expired coupon code.');
    if (coupon.expires_at) {
      const rawExp = String(coupon.expires_at).trim();
      const expIso = /^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? `${rawExp}T23:59:59.999Z` : rawExp;
      if (Date.now() > new Date(expIso).getTime()) {
        throw new Error(`Coupon ${coupon.code} has expired.`);
      }
    }
    if (coupon.max_uses && coupon.max_uses > 0 && (coupon.uses_count || 0) >= coupon.max_uses) {
      throw new Error(`Coupon ${coupon.code} has reached its usage limit.`);
    }
    if (Array.isArray(coupon.assigned_phones) && coupon.assigned_phones.length > 0) {
      const custDigits = String(customerPhone || '').replace(/\D/g, '').slice(-10);
      const allowed = custDigits.length >= 9 && coupon.assigned_phones.some((p) => p.replace(/\D/g, '').slice(-10) === custDigits);
      if (!allowed) throw new Error('This coupon is not assigned to your phone number.');
    }
    if (subtotal < coupon.min_order) {
      throw new Error(`Minimum order of Rs. ${coupon.min_order} required for ${coupon.code}.`);
    }
    if (loyaltyPointsUsed > 0 && !coupon.allow_loyalty_stacking) {
      throw new Error(`Coupon ${coupon.code} cannot be combined with loyalty points redemption.`);
    }
    return coupon;
  },

  // =========================================================================
  // CUSTOMER ORDERS, REVALIDATION, TRACKING & ORDER HISTORY
  // =========================================================================
  async revalidateOfflineOrder(payload: any) {
    const res = await fetch('/api/orders/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow(res);
  },

  async createOrder(orderPayload: any): Promise<{ order: Order; message: string }> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken() || tokenStore.getCustomerToken()),
      body: JSON.stringify(orderPayload),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.details?.join(', ') || `Request failed (${res.status})`);
      }
      return { order: json.data, message: json.message };
    }

    const raw = await res.text().catch(() => '');
    if (!isStaticHostResponse(res, raw)) {
      throw new Error(`Unexpected response (${res.status})`);
    }

    // Static GitHub Pages Mode: compute complete itemized bill, attempt public Supabase insert if configured,
    // save locally for customer history, and allow instant WhatsApp (+923007466664) submission.
    const nowIso = new Date().toISOString();
    const orderId = `MVF-${Math.floor(1000 + Math.random() * 9000)}`;
    const subtotal = Math.round(Number(orderPayload.subtotal || 0));
    const distKm = Number(orderPayload.delivery_distance_km || 0);
    const deliveryFee = distKm > 0 ? calculateDeliveryFee(distKm) : 0;
    const discount = Math.round(Number(orderPayload.discount || 0));
    const loyaltyUsed = Math.round(Number(orderPayload.loyalty_points_used || 0));
    const totalAmount = Math.max(0, subtotal + deliveryFee - discount - loyaltyUsed);
    const paymentMethod = orderPayload.payment_method || 'Cash on Delivery';
    const isCod = paymentMethod === 'Cash on Delivery';

    const staticOrder: Order = {
      id: orderId,
      idempotency_key: orderPayload.idempotency_key,
      customer_name: orderPayload.customer_name,
      customer_phone: orderPayload.customer_phone,
      delivery_address: orderPayload.delivery_address || '',
      delivery_area: orderPayload.delivery_area || '',
      coordinates: orderPayload.coordinates,
      delivery_distance_km: distKm > 0 ? distKm : 0,
      distance_source: distKm > 0 ? (orderPayload.distance_source || 'verified_sector_road') : 'unverified',
      items: (orderPayload.items || []).map((it: any) => ({
        product_id: String(it.product_id),
        product_name: it.product_name,
        urdu_name: it.urdu_name,
        unit_price: Number(it.unit_price || 0),
        unit: it.unit || 'kg',
        purchase_type: it.purchase_type || 'weight',
        weight_grams: Number(it.weight_grams || Math.round(Number(it.quantity || 1) * 1000)),
        amount_paid: it.amount_paid,
        quantity: Number(it.quantity || 1),
        subtotal: Math.round(
          it.purchase_type === 'amount' && it.amount_paid
            ? Number(it.amount_paid)
            : (Number(it.unit_price || 0) * Number(it.weight_grams || 1000)) / 1000
        ),
      })),
      subtotal,
      delivery_fee: deliveryFee,
      discount,
      coupon_code: orderPayload.coupon_code,
      loyalty_points_used: loyaltyUsed,
      loyalty_discount_rs: loyaltyUsed,
      loyalty_points_earned: 0,
      loyalty_points_awarded: false,
      loyalty_points_refunded: false,
      loyalty_points_reversed: false,
      total_amount: totalAmount,
      payment_method: orderPayload.payment_method,
      payment_status: isCod ? 'COD Pending' : 'Pending Verification',
      payment_reference: orderPayload.payment_reference,
      payment_datetime: orderPayload.payment_datetime,
      order_status: 'Order Received',
      delivery_slot: orderPayload.delivery_slot || 'Express Delivery (45–60 mins)',
      notes: orderPayload.notes,
      status_history: [
        {
          status: 'Order Received',
          timestamp: nowIso,
          actor: 'customer',
          note: 'Bill generated on storefront; ready for WhatsApp confirmation (+923007466664)',
        },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    };

    let savedToSupabase = false;
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: {
          ...getSupabaseRestHeaders(),
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: staticOrder.id,
          customer_name: staticOrder.customer_name,
          customer_phone: staticOrder.customer_phone,
          delivery_address: staticOrder.delivery_address,
          delivery_area: staticOrder.delivery_area,
          delivery_distance_km: staticOrder.delivery_distance_km,
          subtotal: staticOrder.subtotal,
          delivery_fee: staticOrder.delivery_fee,
          discount: staticOrder.discount,
          total_amount: staticOrder.total_amount,
          payment_method: staticOrder.payment_method,
          payment_status: staticOrder.payment_status,
          order_status: staticOrder.order_status,
          notes: staticOrder.notes || null,
        }),
      });
      if (sbRes.ok) savedToSupabase = true;
    } catch {}

    saveStaticOrder(staticOrder);
    return {
      order: staticOrder,
      message: savedToSupabase
        ? 'Order saved to Supabase! Please also click Send Complete Bill on WhatsApp (+923007466664).'
        : 'Bill generated! Static hosting has no Node server — please tap Send Complete Bill on WhatsApp (+923007466664) to dispatch your order.',
    };
  },

  async trackOrder(
    orderId: string,
    phone4?: string
  ): Promise<
    Order & {
      gps_status?: string;
      requiresVerification?: boolean;
      route_geometry?: Array<[number, number]> | null;
      eta_minutes?: number | null;
      distance_remaining_km?: number | null;
    }
  > {
    const q = phone4 ? `?phone4=${encodeURIComponent(phone4)}` : '';
    const token = tokenStore.getOwnerToken() || tokenStore.getCustomerToken() || tokenStore.getRiderToken();
    const res = await fetch(`/api/orders/track/${encodeURIComponent(orderId.trim())}${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      return json.data;
    }
    const localMatch = loadStaticOrders().find((o) => o.id.toLowerCase() === orderId.trim().toLowerCase());
    if (localMatch) return { ...localMatch, gps_status: 'unavailable', requiresVerification: false };
    return parseJsonOrThrow(res);
  },

  async getMyOrderHistory(): Promise<Order[]> {
    const token = tokenStore.getCustomerToken() || tokenStore.getOwnerToken();
    const res = await fetch('/api/orders/my', {
      headers: authHeaders(token),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      return json.data || [];
    }
    return loadStaticOrders();
  },

  async uploadReceipt(receiptData: {
    order_id: string;
    payment_method: string;
    sender_name: string;
    transaction_ref: string;
    amount_paid: number;
    payment_datetime?: string;
    receipt_image_url?: string;
    bank_name?: string;
    account_number?: string;
  }): Promise<PaymentReceipt> {
    const res = await fetch('/api/payments/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptData),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      return json.data;
    }
    return {
      id: `rcpt-${Date.now()}`,
      order_id: receiptData.order_id,
      payment_method: receiptData.payment_method as PaymentReceipt['payment_method'],
      sender_name: receiptData.sender_name,
      transaction_ref: receiptData.transaction_ref,
      amount_paid: receiptData.amount_paid,
      payment_datetime: receiptData.payment_datetime || new Date().toISOString(),
      has_receipt_image: Boolean(receiptData.receipt_image_url),
      status: 'pending',
      bank_name: receiptData.bank_name || receiptData.payment_method,
      account_number: receiptData.account_number || 'Pending confirmation',
      created_at: new Date().toISOString(),
    };
  },

  async submitComplaint(payload: {
    order_id?: string;
    customer_name: string;
    customer_phone: string;
    subject: string;
    message: string;
  }) {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await parseJsonOrThrow(res);
    return json.data as CustomerComplaint;
  },

  async getReviews(productId: string): Promise<Review[]> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(productId)}`);
    const json = await res.json();
    return json.data || [];
  },

  async addReview(reviewData: {
    product_id: string;
    user_name: string;
    rating: number;
    freshness_score: number;
    comment: string;
  }): Promise<Review> {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getLoyalty(phone: string): Promise<LoyaltyAccount> {
    const cacheKey = getLoyaltyCacheKey(phone);
    try {
      const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`);
      const json = await res.json();
      if (json.data) {
        localStorage.setItem(cacheKey, JSON.stringify(json.data));
        return json.data;
      }
    } catch {}
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return {
      user_phone: phone,
      user_name: 'Customer',
      points_balance: 0,
      lifetime_points: 0,
      cumulative_purchases: 0,
      successful_purchases_count: 0,
      tier: 'None',
      history: [],
    };
  },

  // =========================================================================
  // RIDER PORTAL APIs
  // =========================================================================
  async getRiderOrders(): Promise<{ orders: Order[]; rider?: Rider }> {
    const res = await fetch('/api/rider/orders', {
      headers: authHeaders(tokenStore.getRiderToken()),
    });
    const json = await parseJsonOrThrow(res);
    return { orders: json.data || [], rider: json.rider };
  },

  async updateRiderOrderStatus(
    orderId: string,
    status:
      | 'Order Accepted'
      | 'Preparing'
      | 'Ready for Delivery'
      | 'Picked Up'
      | 'On the Way'
      | 'Out for Delivery'
      | 'Delivered',
    otp?: string
  ): Promise<Order> {
    const res = await fetch(`/api/rider/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: authHeaders(tokenStore.getRiderToken()),
      body: JSON.stringify({ status, otp }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async sendRiderLocation(
    lat: number,
    lng: number,
    meta?: { orderId?: string; accuracy?: number; speed?: number | null }
  ) {
    const res = await fetch('/api/rider/location', {
      method: 'POST',
      headers: authHeaders(tokenStore.getRiderToken()),
      body: JSON.stringify({ lat, lng, ...meta }),
    });
    return parseJsonOrThrow(res);
  },

  async stopRiderLocation(orderId?: string) {
    const res = await fetch('/api/rider/location/stop', {
      method: 'POST',
      headers: authHeaders(tokenStore.getRiderToken()),
      body: JSON.stringify({ orderId }),
    });
    return parseJsonOrThrow(res);
  },

  // =========================================================================
  // OWNER-ONLY ADMIN APIs
  // =========================================================================
  async getAdminOverview() {
    const res = await fetch('/api/admin/overview', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getAdminLiveFleet(): Promise<{ activeOrders: Partial<Order>[]; riders: Rider[] }> {
    const res = await fetch('/api/admin/live-fleet', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async createProduct(productData: Partial<Product>): Promise<Product> {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(productData),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(updates),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async updateProductStock(id: string, stock_quantity: number): Promise<Product> {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}/stock`, {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ stock_quantity }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async deleteProduct(id: string): Promise<void> {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    await parseJsonOrThrow(res);
  },

  async getAdminOrders(): Promise<Order[]> {
    const res = await fetch('/api/admin/orders', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async adminUpdateOrder(
    orderId: string,
    updates: {
      order_status?: Order['order_status'];
      note?: string;
      rejection_reason?: string;
      manual_delivery_fee_override?: number;
      assigned_rider_id?: string;
    }
  ): Promise<Order> {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(updates),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getAdminReceipts(): Promise<PaymentReceipt[]> {
    const res = await fetch('/api/admin/receipts', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async getPrivateReceiptImage(receiptId: string): Promise<string> {
    const res = await fetch(`/api/admin/receipts/${encodeURIComponent(receiptId)}/image`, {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.imageDataUrl;
  },

  async verifyReceipt(receiptId: string, status: 'approved' | 'rejected', notes?: string): Promise<PaymentReceipt> {
    const res = await fetch(`/api/admin/receipts/${encodeURIComponent(receiptId)}/verify`, {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ status, notes }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getAdminRiders(): Promise<Rider[]> {
    const res = await fetch('/api/admin/riders', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async addRider(payload: {
    name: string;
    phone: string;
    vehicle_type: Rider['vehicle_type'];
    vehicle_reg: string;
    pin: string;
  }): Promise<Rider> {
    const res = await fetch('/api/admin/riders', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(payload),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async updateRider(
    id: string,
    updates: { is_active?: boolean; name?: string; phone?: string; pin?: string }
  ): Promise<Rider> {
    const res = await fetch(`/api/admin/riders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(updates),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async optimizeRoute(orderIds?: string[], riderId?: string): Promise<OptimizedRoute> {
    const res = await fetch('/api/dispatch/optimize-route', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ order_ids: orderIds, rider_id: riderId }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async assignRider(orderIds: string[], riderId: string): Promise<OptimizedRoute> {
    const res = await fetch('/api/dispatch/assign-rider', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ order_ids: orderIds, rider_id: riderId }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getBusinessReport(range: 'daily' | 'weekly' | 'monthly') {
    const res = await fetch(`/api/admin/reports?range=${range}`, {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getExpenses(): Promise<Expense[]> {
    const res = await fetch('/api/admin/expenses', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async addExpense(payload: Omit<Expense, 'id' | 'created_at'>): Promise<Expense> {
    const res = await fetch('/api/admin/expenses', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(payload),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getCoupons(): Promise<Coupon[]> {
    const res = await fetch('/api/admin/coupons', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async saveCoupon(coupon: Coupon): Promise<Coupon> {
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(coupon),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async deleteCoupon(code: string): Promise<boolean> {
    const res = await fetch(`/api/admin/coupons/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return Boolean(json.deleted);
  },

  async getCustomersDirectory(): Promise<CustomerDirectoryEntry[]> {
    const res = await fetch('/api/admin/customers', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async getAdminCustomerLoyalty(phone: string): Promise<LoyaltyAccount> {
    const res = await fetch(`/api/admin/loyalty/${encodeURIComponent(phone)}`, {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async adjustCustomerLoyalty(payload: {
    phone: string;
    deltaPoints: number;
    reason: string;
    customerName?: string;
  }): Promise<LoyaltyAccount> {
    const res = await fetch('/api/admin/loyalty/adjust', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(payload),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getIntegrationsStatus(): Promise<IntegrationStatus> {
    const res = await fetch('/api/admin/integrations-status', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getComplaints(): Promise<CustomerComplaint[]> {
    const res = await fetch('/api/admin/complaints', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async updateComplaint(id: string, status: CustomerComplaint['status'], owner_reply?: string) {
    const res = await fetch(`/api/admin/complaints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ status, owner_reply }),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async updateSettings(updates: Partial<ShopSettings>): Promise<ShopSettings> {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(updates),
    });
    const json = await parseJsonOrThrow(res);
    if (json.data) localStorage.setItem(CACHE_KEY_SETTINGS, JSON.stringify(json.data));
    return json.data;
  },

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    const res = await fetch('/api/admin/audit-logs', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async getNotificationLogs(): Promise<any[]> {
    const res = await fetch('/api/notifications/logs', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async getMarketingCampaigns(): Promise<MarketingCampaign[]> {
    const res = await fetch('/api/marketing/campaigns');
    const json = await res.json();
    return json.data || [];
  },

  async broadcastMarketing(campaign: {
    title: string;
    message: string;
    target_audience: string;
    discount_code?: string;
  }): Promise<MarketingCampaign> {
    const res = await fetch('/api/marketing/broadcast', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify(campaign),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async getBackupHistory(): Promise<DatabaseBackup[]> {
    const res = await fetch('/api/backup/history', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data || [];
  },

  async createBackup(): Promise<DatabaseBackup> {
    const res = await fetch('/api/backup/create', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async restoreBackup(backupData: any): Promise<boolean> {
    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ data: backupData }),
    });
    const json = await parseJsonOrThrow(res);
    return json.success;
  },

  async downloadCleanProjectZip(): Promise<Blob> {
    const res = await fetch('/api/admin/export-zip', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || 'Failed to download clean project ZIP');
    }
    return res.blob();
  },

  // =========================================================================
  // AI ASSISTANTS (Owner Voice/Chat + Customer Bilingual Helper)
  // =========================================================================
  async runOwnerAI(prompt: string) {
    const res = await fetch('/api/ai/admin', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
      body: JSON.stringify({ prompt }),
    });
    return parseJsonOrThrow(res);
  },

  async runCustomerAI(
    prompt: string,
    lang: 'ur' | 'en',
    orderId?: string,
    options?: {
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      cartSummary?: { count: number; subtotal: number };
    }
  ) {
    const res = await fetch('/api/ai/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        lang,
        orderId,
        history: options?.history,
        cartSummary: options?.cartSummary,
      }),
    });
    return parseJsonOrThrow(res);
  },

  async transcribeVoice(audioBase64: string, mimeType: string, lang: 'ur' | 'en') {
    const res = await fetch('/api/ai/transcribe-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType, lang }),
    });
    return parseJsonOrThrow(res) as Promise<{ ok: boolean; transcript: string; error?: string }>;
  },

  async getAdminLaunchStatus() {
    const res = await fetch('/api/admin/launch-status', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data as {
      projectUrl: string;
      projectRef: string;
      tables: Record<string, { exists: boolean; status: number }>;
      allTablesReady: boolean;
      aiConfigured: boolean;
      sessionSecretConfigured: boolean;
      paymentAccounts: {
        jazzCashMerchant: boolean;
        jazzCashPersonal: boolean;
        easypaisa: boolean;
        bankAlfalah: boolean;
      };
    };
  },

  async getAdminMigrationSql(): Promise<{ sql: string; sqlEditorUrl: string }> {
    const res = await fetch('/api/admin/migration-sql', {
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },

  async syncAllToSupabase() {
    const res = await fetch('/api/admin/supabase-sync', {
      method: 'POST',
      headers: authHeaders(tokenStore.getOwnerToken()),
    });
    const json = await parseJsonOrThrow(res);
    return json.data;
  },
};
