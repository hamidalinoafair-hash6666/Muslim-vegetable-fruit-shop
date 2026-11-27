import fs from 'fs';
import path from 'path';
import {
  INITIAL_PRODUCTS,
  RIDERS_FLEET,
  INITIAL_REVIEWS,
  INITIAL_MARKETING_CAMPAIGNS,
  DEFAULT_SHOP_SETTINGS,
  SUPABASE_PROJECT_CONFIG,
  enrichSupabaseVegetableRow,
  normalizeSupabaseUrl,
} from '../src/data/initialData';
import {
  Product,
  Order,
  OrderStatus,
  PaymentReceipt,
  Review,
  LoyaltyAccount,
  Rider,
  MarketingCampaign,
  ShopSettings,
  Expense,
  Coupon,
  CustomerComplaint,
  CustomerDirectoryEntry,
  AuditLogEntry,
} from '../src/types';
import { createDatabaseBackup } from './backupService';
import { hashSecret, verifySecret, AUTHORIZED_OWNER_EMAIL, getServerOwnerSupabaseJwt } from './auth';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PRIVATE_RECEIPTS_DIR = path.join(DATA_DIR, 'private_receipts');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRIVATE_RECEIPTS_DIR)) fs.mkdirSync(PRIVATE_RECEIPTS_DIR, { recursive: true });
}

function getSupabaseHeaders(forWrite = false): { url: string; headers: Record<string, string> } {
  const url = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const pubKey =
    (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      SUPABASE_PROJECT_CONFIG.publishable_key
    ).trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const ownerJwt = forWrite ? getServerOwnerSupabaseJwt() : '';
  const apiKey = serviceKey || pubKey;
  const bearer = serviceKey || ownerJwt || (pubKey && !pubKey.startsWith('sb_publishable_') ? pubKey : '');
  const headers: Record<string, string> = { apikey: apiKey };
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  return { url, headers };
}

class DatabaseStore {
  public products: Product[] = [];
  public orders: Order[] = [];
  public receipts: PaymentReceipt[] = [];
  public reviews: Review[] = [];
  public loyaltyAccounts: Record<string, LoyaltyAccount> = {};
  public riders: Rider[] = [];
  public campaigns: MarketingCampaign[] = [];
  public settings: ShopSettings = JSON.parse(JSON.stringify(DEFAULT_SHOP_SETTINGS));
  public expenses: Expense[] = [];
  public coupons: Coupon[] = [];
  public complaints: CustomerComplaint[] = [];
  public auditLogs: AuditLogEntry[] = [];
  public lastSupabaseSyncAt: string | null = null;
  public supabaseConnected = false;

  constructor() {
    ensureDirs();
    this.loadOrSeed();
    this.syncFromSupabaseVegetables()
      .then(() => this.hydrateFromSupabaseTables())
      .catch(() => {});
    this.initAutomatedBackupSchedule();
  }

  public persist() {
    try {
      ensureDirs();
      const snapshot = {
        products: this.products,
        orders: this.orders,
        receipts: this.receipts.map(({ receipt_image_url: _omit, ...rest }) => rest),
        reviews: this.reviews,
        loyaltyAccounts: this.loyaltyAccounts,
        riders: this.riders,
        campaigns: this.campaigns,
        settings: this.settings,
        expenses: this.expenses,
        coupons: this.coupons,
        complaints: this.complaints,
        auditLogs: this.auditLogs.slice(0, 300),
        lastSupabaseSyncAt: this.lastSupabaseSyncAt,
      };
      const tmpFile = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2));
      fs.renameSync(tmpFile, STORE_FILE);
    } catch (err) {
      console.error('Failed to persist server store:', err);
    }
  }

  private loadOrSeed() {
    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        const rawProducts: Product[] =
          Array.isArray(raw.products) && raw.products.length > 0
            ? raw.products
            : JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
        this.products = rawProducts.map((p) => {
          const isGenericFallback =
            !p.image_url ||
            p.image_url.includes('fresh_vegetables_basket_') ||
            p.image_url.includes('fresh_fruits_display_');
          const refreshed = enrichSupabaseVegetableRow({
            id: p.supabase_id || p.id,
            name: p.name,
            price: p.price,
            unit: p.unit,
            name_ur: p.urdu_name,
            name_en: p.name_en,
            category: p.category,
            stock_quantity: p.stock_quantity,
            is_seasonal: p.is_seasonal,
            is_offer: p.is_offer,
            cost_price: p.cost_price,
            previous_price: p.previous_price,
          });
          return isGenericFallback
            ? {
                ...p,
                image_url: refreshed.image_url,
                urdu_name: refreshed.urdu_name || p.urdu_name,
                name_en: refreshed.name_en || p.name_en,
                emoji: refreshed.emoji || p.emoji,
              }
            : p;
        });
        this.orders = Array.isArray(raw.orders) ? raw.orders : [];
        this.receipts = Array.isArray(raw.receipts) ? raw.receipts : [];
        this.reviews = Array.isArray(raw.reviews) ? raw.reviews : JSON.parse(JSON.stringify(INITIAL_REVIEWS));
        this.loyaltyAccounts = raw.loyaltyAccounts || {};
        this.riders = Array.isArray(raw.riders) && raw.riders.length > 0 ? raw.riders : this.seedRiders();
        this.campaigns = Array.isArray(raw.campaigns) ? raw.campaigns : JSON.parse(JSON.stringify(INITIAL_MARKETING_CAMPAIGNS));
        this.settings = { ...DEFAULT_SHOP_SETTINGS, ...(raw.settings || {}) };
        this.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
        this.coupons = Array.isArray(raw.coupons) ? raw.coupons : [];
        this.complaints = Array.isArray(raw.complaints) ? raw.complaints : [];
        this.auditLogs = Array.isArray(raw.auditLogs) ? raw.auditLogs : [];
        this.lastSupabaseSyncAt = raw.lastSupabaseSyncAt || null;
        this.normalizeLegacyRecords();
        return;
      } catch (err) {
        console.warn('Corrupt store.json detected, reseeding clean store:', err);
      }
    }

    this.seed();
    this.persist();
  }

  private normalizeLegacyRecords() {
    let changed = false;

    // 1. Ensure non-delivered or rejected orders never carry phantom earned points
    for (const ord of this.orders) {
      if (ord.loyalty_discount_rs === undefined) {
        const pv = Number(this.settings.loyaltyPointValueRs ?? 1) || 1;
        ord.loyalty_discount_rs = Math.round((ord.loyalty_points_used || 0) * pv);
      }
      if (ord.order_status !== 'Delivered' || ord.payment_status === 'Rejected') {
        if ((ord.loyalty_points_earned || 0) !== 0 || ord.loyalty_points_awarded) {
          ord.loyalty_points_earned = 0;
          ord.loyalty_points_awarded = false;
          changed = true;
        }
      } else if (ord.order_status === 'Delivered') {
        if (ord.loyalty_points_awarded === undefined) {
          ord.loyalty_points_awarded = true;
          changed = true;
        }
        if (ord.loyalty_eligible_amount === undefined) {
          ord.loyalty_eligible_amount = this.calculateEligiblePurchaseAmount(ord);
          changed = true;
        }
      }
      if (ord.order_status === 'Cancelled') {
        if (ord.stock_restored === undefined) ord.stock_restored = true;
        if (ord.loyalty_points_used > 0 && ord.loyalty_points_refunded === undefined) {
          ord.loyalty_points_refunded = true;
        }
      }
    }

    // 2. Normalize existing loyalty accounts safely without altering valid balances
    for (const [key, acc] of Object.entries(this.loyaltyAccounts)) {
      if (!acc) continue;
      if (acc.points_balance < 0) {
        acc.points_balance = 0;
        changed = true;
      }
      if (acc.lifetime_points < 0) {
        acc.lifetime_points = 0;
        changed = true;
      }
      if (acc.cumulative_purchases === undefined) {
        acc.cumulative_purchases = 0;
        changed = true;
      }
      if (acc.successful_purchases_count === undefined) {
        const d10 = this.normalizePhoneDigits10(acc.user_phone || key);
        const deliveredCount = this.orders.filter(
          (o) => this.normalizePhoneDigits10(o.customer_phone) === d10 && this.isOrderSuccessfulAndCompleted(o)
        ).length;
        acc.successful_purchases_count = acc.tier && acc.tier !== 'None' ? Math.max(1, deliveredCount) : deliveredCount;
        changed = true;
      }
      if (!acc.tier) {
        acc.tier = 'None';
        changed = true;
      }
      if (!Array.isArray(acc.history)) {
        acc.history = [];
        changed = true;
      }
    }

    // 3. Ensure coupon defaults exist
    for (const cpn of this.coupons) {
      if (cpn.uses_count === undefined) {
        cpn.uses_count = this.orders.filter(
          (o) => o.coupon_code === cpn.code && o.order_status !== 'Cancelled'
        ).length;
        changed = true;
      }
      if (cpn.allow_loyalty_stacking === undefined) {
        cpn.allow_loyalty_stacking = false;
        changed = true;
      }
    }

    if (changed) {
      this.persist();
    }
  }

  private seedRiders(): Rider[] {
    return RIDERS_FLEET.map((r, idx) => {
      const defaultPin = idx === 0 ? '1234' : '5678';
      const { hash, salt } = hashSecret(defaultPin);
      return {
        ...JSON.parse(JSON.stringify(r)),
        pin_hash: `${salt}:${hash}`,
      };
    });
  }

  private seed() {
    this.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    this.riders = this.seedRiders();
    this.reviews = JSON.parse(JSON.stringify(INITIAL_REVIEWS));
    this.campaigns = JSON.parse(JSON.stringify(INITIAL_MARKETING_CAMPAIGNS));
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SHOP_SETTINGS));
    this.coupons = [];
    this.loyaltyAccounts = {};

    const now = Date.now();
    this.orders = [
      {
        id: 'MVF-9101',
        customer_name: 'حاجی محمد اقبال',
        customer_phone: '+923007466664',
        customer_email: AUTHORIZED_OWNER_EMAIL,
        delivery_address: 'House 14, Street 2, Peoples Colony, Khanewal',
        delivery_area: 'Peoples Colony & Allama Iqbal Road',
        coordinates: { lat: 30.3055, lng: 71.9425 },
        delivery_distance_km: 3.9,
        distance_source: 'verified_sector_road',
        delivery_slot: 'Morning (8:00 AM – 11:00 AM)',
        notes: 'تازہ ٹماٹر اور دیسی آلو الگ پیک کریں۔',
        items: [
          {
            product_id: '1',
            product_name: 'Fresh Red Tomatoes (Tamatar)',
            urdu_name: 'ٹماٹر فارمی و دیسی',
            unit_price: 160,
            unit: 'Kg',
            purchase_type: 'weight',
            weight_grams: 2000,
            quantity: 2,
            subtotal: 320,
          },
          {
            product_id: '3',
            product_name: 'New Harvest Potatoes (Aalo)',
            urdu_name: 'نیا آلو چھلکے والا',
            unit_price: 160,
            unit: 'Kg',
            purchase_type: 'amount',
            weight_grams: 1000,
            amount_paid: 160,
            quantity: 1,
            subtotal: 160,
          },
        ],
        subtotal: 480,
        delivery_fee: 150,
        discount: 0,
        loyalty_points_used: 0,
        loyalty_points_earned: 0,
        loyalty_points_awarded: false,
        total_amount: 630,
        payment_method: 'JazzCash',
        payment_status: 'Pending Verification',
        order_status: 'Order Received',
        payment_reference: 'JC-TID-98499411',
        payment_datetime: new Date(now - 3600000).toISOString(),
        status_history: [
          {
            status: 'Order Received',
            timestamp: new Date(now - 3600000).toISOString(),
            note: 'Order placed via JazzCash (Pending Verification by Owner)',
            actor: 'customer',
          },
        ],
        created_at: new Date(now - 3600000).toISOString(),
        updated_at: new Date(now - 3600000).toISOString(),
      },
      {
        id: 'MVF-9055',
        customer_name: 'ڈاکٹر رضوان شوکت',
        customer_phone: '+923007466664',
        customer_email: AUTHORIZED_OWNER_EMAIL,
        delivery_address: 'Civil Lines Road, Near DHQ Hospital, Khanewal',
        delivery_area: 'Civil Lines & DHQ Hospital',
        coordinates: { lat: 30.3105, lng: 71.9472 },
        delivery_distance_km: 4.6,
        distance_source: 'verified_sector_road',
        delivery_slot: 'Express Delivery (45–60 mins)',
        items: [
          {
            product_id: '32',
            product_name: 'Swat Red Apples (Seb)',
            urdu_name: 'سیب کالا کلو سوات',
            unit_price: 500,
            unit: 'Kg',
            purchase_type: 'weight',
            weight_grams: 2000,
            quantity: 2,
            subtotal: 1000,
          },
          {
            product_id: '31',
            product_name: 'Sindhri Sweet Bananas (Kela)',
            urdu_name: 'کیلا سندھ درجن',
            unit_price: 150,
            unit: 'Dozen',
            purchase_type: 'weight',
            weight_grams: 1000,
            quantity: 1,
            subtotal: 150,
          },
        ],
        subtotal: 1150,
        delivery_fee: 150,
        discount: 0,
        loyalty_points_used: 0,
        loyalty_points_earned: 0,
        loyalty_points_awarded: false,
        total_amount: 1300,
        payment_method: 'Cash on Delivery',
        payment_status: 'COD Pending',
        order_status: 'Out for Delivery',
        assigned_rider_id: 'RIDER-01',
        assigned_rider_name: 'محمد عثمان خان (Muhammad Usman Khan)',
        assigned_rider_phone: '+92 301 2345678',
        delivery_otp: '4829',
        dispatch_sequence: 1,
        estimated_delivery_time: '20 mins',
        status_history: [
          { status: 'Order Received', timestamp: new Date(now - 5400000).toISOString(), note: 'Order received' },
          { status: 'Order Confirmed', timestamp: new Date(now - 4800000).toISOString(), note: 'Confirmed by Owner' },
          { status: 'Preparing', timestamp: new Date(now - 3600000).toISOString(), note: 'Weighed and packed fresh' },
          { status: 'Rider Assigned', timestamp: new Date(now - 2400000).toISOString(), note: 'Assigned to محمد عثمان خان' },
          { status: 'Out for Delivery', timestamp: new Date(now - 1200000).toISOString(), note: 'Rider departed Camp Chowk' },
        ],
        created_at: new Date(now - 5400000).toISOString(),
        updated_at: new Date(now - 1200000).toISOString(),
      },
      {
        id: 'MVF-8942',
        customer_name: 'میاں نوید اختر',
        customer_phone: '+923007466664',
        customer_email: AUTHORIZED_OWNER_EMAIL,
        delivery_address: 'Street 5, Ayub Colony, Khanewal',
        delivery_area: 'Ayub Colony, Model Town & Grain Market',
        coordinates: { lat: 30.3152, lng: 71.9522 },
        delivery_distance_km: 5.0,
        distance_source: 'verified_sector_road',
        delivery_slot: 'Morning (8:00 AM – 11:00 AM)',
        items: [
          {
            product_id: '2',
            product_name: 'Fresh Dry Onions (Pyaz)',
            urdu_name: 'پیاز (تازہ خشک)',
            unit_price: 200,
            unit: 'Kg',
            purchase_type: 'weight',
            weight_grams: 2000,
            quantity: 2,
            subtotal: 400,
          },
          {
            product_id: '24',
            product_name: 'Fresh Spinach (Palak)',
            urdu_name: 'پالک دیسی گھریلو',
            unit_price: 50,
            unit: 'Kg',
            purchase_type: 'amount',
            weight_grams: 1000,
            amount_paid: 50,
            quantity: 1,
            subtotal: 50,
          },
        ],
        subtotal: 450,
        delivery_fee: 150,
        discount: 0,
        loyalty_points_used: 0,
        loyalty_points_earned: 20,
        loyalty_points_awarded: true,
        total_amount: 600,
        payment_method: 'Bank Alfalah',
        payment_status: 'Verified',
        order_status: 'Delivered',
        payment_reference: 'ALFH-992011',
        assigned_rider_id: 'RIDER-01',
        assigned_rider_name: 'محمد عثمان خان (Muhammad Usman Khan)',
        assigned_rider_phone: '+92 301 2345678',
        status_history: [
          { status: 'Order Received', timestamp: new Date(now - 86400000).toISOString(), note: 'Order placed' },
          { status: 'Order Confirmed', timestamp: new Date(now - 85800000).toISOString(), note: 'Bank Alfalah receipt verified by Hamid Ali' },
          { status: 'Delivered', timestamp: new Date(now - 82000000).toISOString(), note: 'Delivered in Ayub Colony' },
        ],
        created_at: new Date(now - 86400000).toISOString(),
        updated_at: new Date(now - 82000000).toISOString(),
      },
    ];

    this.addAudit('system', 'System', 'INITIALIZE_STORE', undefined, 'Initialized Muslim Vegetable & Fruit Shop Khanewal datastore');
  }

  /**
   * Sync live rows from user's Supabase `public.vegetables` table without discarding local stock/cost/offer fields
   */
  public async syncFromSupabaseVegetables(): Promise<{ synced: boolean; count: number; error?: string }> {
    try {
      const { url, headers } = getSupabaseHeaders(false);
      const res = await fetch(`${url}/rest/v1/vegetables?select=*&order=id.asc`, {
        headers,
      });
      if (!res.ok) {
        this.supabaseConnected = false;
        return { synced: false, count: this.products.length, error: `HTTP ${res.status}` };
      }
      const rows = (await res.json()) as Array<{ id: number; name: string; price: number; unit?: string }>;
      if (!Array.isArray(rows) || rows.length === 0) {
        return { synced: false, count: this.products.length };
      }

      const existingById = new Map(this.products.map((p) => [String(p.id), p]));
      const mergedFromSupabase = rows.map((row) => {
        const enriched = enrichSupabaseVegetableRow(row);
        const prev = existingById.get(String(row.id));
        if (prev) {
          const isGenericFallback =
            !prev.image_url ||
            prev.image_url.includes('fresh_vegetables_basket_') ||
            prev.image_url.includes('fresh_fruits_display_');
          return {
            ...enriched,
            stock_quantity: prev.stock_quantity,
            is_out_of_stock: prev.stock_quantity <= 0 || prev.is_out_of_stock,
            cost_price: prev.cost_price ?? null,
            previous_price: prev.price !== enriched.price ? prev.price : prev.previous_price,
            image_url: isGenericFallback ? enriched.image_url : prev.image_url,
            is_offer: prev.is_offer ?? enriched.is_offer,
            is_seasonal: prev.is_seasonal ?? enriched.is_seasonal,
            season_tag: prev.season_tag || enriched.season_tag,
            is_top_selling: prev.is_top_selling ?? enriched.is_top_selling,
            is_recommended: prev.is_recommended ?? enriched.is_recommended,
            original_price: prev.original_price,
            rating: prev.rating,
            review_count: prev.review_count,
          };
        }
        return enriched;
      });

      const supabaseIds = new Set(rows.map((r) => String(r.id)));
      const customLocalProducts = this.products.filter((p) => !supabaseIds.has(String(p.id)));
      this.products = [...mergedFromSupabase, ...customLocalProducts];
      this.lastSupabaseSyncAt = new Date().toISOString();
      this.supabaseConnected = true;
      this.persist();
      return { synced: true, count: this.products.length };
    } catch (err: any) {
      this.supabaseConnected = false;
      return { synced: false, count: this.products.length, error: err?.message };
    }
  }

  /**
   * Restores shop_settings, riders, coupons, loyalty, and persisted orders from Supabase on cold starts
   */
  public async hydrateFromSupabaseTables(): Promise<void> {
    try {
      const { url, headers } = getSupabaseHeaders(true);

      const settRes = await fetch(`${url}/rest/v1/shop_settings?id=eq.1&limit=1`, { headers });
      if (settRes.ok) {
        const rows = (await settRes.json()) as any[];
        const r = rows?.[0];
        if (r) {
          this.settings = {
            ...this.settings,
            shopNameEn: r.shop_name || this.settings.shopNameEn,
            shopNameUr: r.shop_name_ur || this.settings.shopNameUr,
            whatsapp: r.whatsapp || this.settings.whatsapp,
            openHours: r.open_hours || this.settings.openHours,
            announcementActive: r.announcement_active ?? this.settings.announcementActive,
            announcementUr: r.announcement_ur ?? this.settings.announcementUr,
            announcementEn: r.announcement_en ?? this.settings.announcementEn,
            baseDeliveryFee: Number(r.base_delivery_fee ?? this.settings.baseDeliveryFee),
            baseKm: Number(r.base_km ?? this.settings.baseKm),
            extraKmRate: Number(r.extra_km_rate ?? this.settings.extraKmRate),
            loyaltyEnabled: r.loyalty_enabled ?? this.settings.loyaltyEnabled,
            loyaltyPointsPer100Rs: Number(r.loyalty_points_per_100 ?? this.settings.loyaltyPointsPer100Rs ?? 5),
            loyaltyPointValueRs: Number(r.loyalty_point_value_rs ?? this.settings.loyaltyPointValueRs ?? 1),
            jazzCashPersonalAccount: r.jazzcash_personal_account ?? this.settings.jazzCashPersonalAccount,
            jazzCashPersonalTitle: r.jazzcash_personal_title || this.settings.jazzCashPersonalTitle,
            easypaisaAccount: r.easypaisa_account ?? this.settings.easypaisaAccount,
            easypaisaTitle: r.easypaisa_title || this.settings.easypaisaTitle,
            requireDeliveryOtp: Boolean(r.require_delivery_otp ?? this.settings.requireDeliveryOtp),
          };
        }
      }

      const ordRes = await fetch(`${url}/rest/v1/orders?select=*&order=created_at.desc&limit=200`, { headers });
      if (ordRes.ok) {
        const rows = (await ordRes.json()) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          const existingIds = new Set(this.orders.map((o) => o.id));
          for (const row of rows) {
            if (!row?.id || existingIds.has(row.id)) continue;
            const pv = Number(this.settings.loyaltyPointValueRs ?? 1) || 1;
            const ptsUsed = Number(row.loyalty_points_used || 0);
            const isDeliveredValid = row.order_status === 'Delivered' && row.payment_status !== 'Rejected';
            this.orders.push({
              id: row.id,
              idempotency_key: row.idempotency_key || undefined,
              user_id: row.user_id || undefined,
              customer_name: row.customer_name || 'Customer',
              customer_phone: row.customer_phone || '',
              customer_email: row.customer_email || undefined,
              delivery_address: row.delivery_address || '',
              delivery_area: row.delivery_area || '',
              coordinates:
                row.delivery_lat != null && row.delivery_lng != null
                  ? {
                      lat: Number(row.delivery_lat),
                      lng: Number(row.delivery_lng),
                    }
                  : undefined,
              delivery_distance_km: Number(row.delivery_distance_km ?? 0),
              distance_source: row.distance_source || 'unverified',
              delivery_slot: row.delivery_slot || '',
              notes: row.notes || undefined,
              items: Array.isArray(row.items) ? row.items : [],
              subtotal: Number(row.subtotal || 0),
              delivery_fee: Number(row.delivery_fee ?? 0),
              discount: Number(row.discount || 0),
              coupon_code: row.coupon_code || undefined,
              loyalty_points_used: ptsUsed,
              loyalty_discount_rs:
                row.loyalty_discount_rs !== undefined && row.loyalty_discount_rs !== null
                  ? Number(row.loyalty_discount_rs)
                  : Math.round(ptsUsed * pv),
              loyalty_eligible_amount:
                row.loyalty_eligible_amount !== undefined && row.loyalty_eligible_amount !== null
                  ? Number(row.loyalty_eligible_amount)
                  : undefined,
              loyalty_points_earned: isDeliveredValid ? Number(row.loyalty_points_earned || 0) : 0,
              loyalty_points_awarded: isDeliveredValid ? Boolean(row.loyalty_points_awarded) : false,
              loyalty_points_refunded: Boolean(row.loyalty_points_refunded),
              loyalty_points_reversed: Boolean(row.loyalty_points_reversed),
              stock_restored: Boolean(row.stock_restored),
              coupon_usage_recorded: Boolean(row.coupon_usage_recorded),
              coupon_usage_restored: Boolean(row.coupon_usage_restored),
              total_amount: Number(row.total_amount || 0),
              payment_method: row.payment_method || 'Cash on Delivery',
              payment_status: row.payment_status || 'Pending Verification',
              order_status: row.order_status || 'Order Received',
              rejection_reason: row.rejection_reason || undefined,
              payment_reference: row.payment_reference || undefined,
              assigned_rider_id: row.assigned_rider_id || undefined,
              delivery_otp: row.delivery_otp || undefined,
              otp_verified: Boolean(row.otp_verified),
              status_history: Array.isArray(row.status_history) ? row.status_history : [],
              created_at: row.created_at || new Date().toISOString(),
              updated_at: row.updated_at || row.created_at || new Date().toISOString(),
            });
          }
          this.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      }

      // Hydrate coupons if present in Supabase (merge cleanly without deleting local coupons)
      const cpnRes = await fetch(`${url}/rest/v1/coupons?select=*`, { headers });
      if (cpnRes.ok) {
        const rows = (await cpnRes.json()) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          const localByCode = new Map(this.coupons.map((c) => [c.code.toUpperCase(), c]));
          for (const row of rows) {
            if (!row?.code) continue;
            const code = String(row.code).trim().toUpperCase();
            const prev = localByCode.get(code);
            localByCode.set(code, {
              code,
              discount_type: row.discount_type || prev?.discount_type || 'fixed',
              value: Number(row.value ?? prev?.value ?? 0),
              min_order: Number(row.min_order ?? prev?.min_order ?? 0),
              active: row.active !== undefined ? Boolean(row.active) : prev?.active !== false,
              description: row.description ?? prev?.description ?? '',
              assigned_phones:
                Array.isArray(row.assigned_phones) && row.assigned_phones.length > 0
                  ? row.assigned_phones
                  : prev?.assigned_phones,
              expires_at: row.expires_at ?? prev?.expires_at,
              max_uses: row.max_uses ?? prev?.max_uses,
              uses_count: Math.max(Number(row.uses_count ?? 0), Number(prev?.uses_count ?? 0)),
              per_customer_limit: row.per_customer_limit ?? prev?.per_customer_limit,
              allow_loyalty_stacking:
                row.allow_loyalty_stacking !== undefined
                  ? Boolean(row.allow_loyalty_stacking)
                  : Boolean(prev?.allow_loyalty_stacking),
              created_at: row.created_at || prev?.created_at,
              updated_at: row.updated_at || prev?.updated_at,
            });
          }
          this.coupons = Array.from(localByCode.values());
        }
      }

      // Hydrate loyalty_accounts & loyalty_transactions if those tables exist in Supabase
      const loyAccRes = await fetch(`${url}/rest/v1/loyalty_accounts?select=*`, { headers });
      if (loyAccRes.ok) {
        const accRows = (await loyAccRes.json()) as any[];
        if (Array.isArray(accRows) && accRows.length > 0) {
          let txRows: any[] = [];
          try {
            const txRes = await fetch(
              `${url}/rest/v1/loyalty_transactions?select=*&order=created_at.desc&limit=1000`,
              { headers }
            );
            if (txRes.ok) {
              const parsed = await txRes.json();
              if (Array.isArray(parsed)) txRows = parsed;
            }
          } catch {}

          for (const row of accRows) {
            if (!row?.user_phone) continue;
            const key = this.findLoyaltyKey(row.user_phone);
            const prev = this.loyaltyAccounts[key];
            const rowTx = txRows
              .filter((t) => t.user_phone === row.user_phone)
              .map((t) => ({
                id: String(t.id),
                points: Number(t.points || 0),
                type: t.type as LoyaltyAccount['history'][number]['type'],
                order_id: t.order_id || undefined,
                description: t.description || '',
                created_at: t.created_at || new Date().toISOString(),
              }));
            const mergedHistoryMap = new Map<string, LoyaltyAccount['history'][number]>();
            for (const h of [...(prev?.history || []), ...rowTx]) {
              if (!mergedHistoryMap.has(h.id)) mergedHistoryMap.set(h.id, h);
            }
            const mergedHistory = Array.from(mergedHistoryMap.values()).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            this.loyaltyAccounts[key] = {
              user_phone: prev?.user_phone || row.user_phone,
              user_name: row.user_name || prev?.user_name || 'Customer',
              points_balance: prev ? prev.points_balance : Math.max(0, Number(row.points_balance || 0)),
              lifetime_points: Math.max(prev?.lifetime_points || 0, Number(row.lifetime_points || 0)),
              cumulative_purchases: Math.max(prev?.cumulative_purchases || 0, Number(row.cumulative_purchases || 0)),
              successful_purchases_count: Math.max(
                prev?.successful_purchases_count || 0,
                Number(row.successful_purchases_count || 0)
              ),
              tier: this.computeMembershipTier(
                Math.max(prev?.cumulative_purchases || 0, Number(row.cumulative_purchases || 0)),
                Math.max(prev?.successful_purchases_count || 0, Number(row.successful_purchases_count || 0)),
                prev?.tier || row.tier || 'None'
              ),
              history: mergedHistory,
            };
          }
        }
      }

      this.normalizeLegacyRecords();
      this.persist();
    } catch {}
  }

  private async pushProductUpdateToSupabase(product: Product): Promise<boolean> {
    if (!product.supabase_id) return false;
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const res = await fetch(`${url}/rest/v1/vegetables?id=eq.${product.supabase_id}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          name: product.name,
          price: product.price,
          unit: product.unit,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async syncOrderToSupabase(order: Order): Promise<boolean> {
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const pv = Number(this.settings.loyaltyPointValueRs ?? 1) || 1;
      const basePayload: Record<string, any> = {
        id: order.id,
        idempotency_key: order.idempotency_key || null,
        user_id: order.user_id || null,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_email: order.customer_email || null,
        delivery_address: order.delivery_address || '',
        delivery_area: order.delivery_area || '',
        delivery_lat: order.coordinates?.lat ?? null,
        delivery_lng: order.coordinates?.lng ?? null,
        delivery_distance_km: order.delivery_distance_km || 0,
        distance_source: order.distance_source || 'unverified',
        delivery_slot: order.delivery_slot || null,
        notes: order.notes || null,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        discount: order.discount || 0,
        coupon_code: order.coupon_code || null,
        loyalty_points_used: order.loyalty_points_used || 0,
        loyalty_points_earned: order.loyalty_points_earned || 0,
        loyalty_points_awarded: Boolean(order.loyalty_points_awarded),
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        order_status: order.order_status,
        rejection_reason: order.rejection_reason || null,
        payment_reference: order.payment_reference || null,
        payment_datetime: order.payment_datetime || null,
        assigned_rider_id: order.assigned_rider_id || null,
        delivery_otp: order.delivery_otp || null,
        otp_verified: Boolean(order.otp_verified),
        status_history: order.status_history || [],
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
      const extendedPayload: Record<string, any> = {
        ...basePayload,
        loyalty_discount_rs: order.loyalty_discount_rs ?? Math.round((order.loyalty_points_used || 0) * pv),
        loyalty_eligible_amount: order.loyalty_eligible_amount ?? 0,
        loyalty_points_refunded: Boolean(order.loyalty_points_refunded),
        loyalty_points_reversed: Boolean(order.loyalty_points_reversed),
        stock_restored: Boolean(order.stock_restored),
        coupon_usage_recorded: Boolean(order.coupon_usage_recorded),
        coupon_usage_restored: Boolean(order.coupon_usage_restored),
        items: order.items || [],
      };

      let res = await fetch(`${url}/rest/v1/orders?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(extendedPayload),
      });

      if (!res.ok && res.status === 400) {
        const errText = await res.text().catch(() => '');
        if (errText.includes('PGRST204') || errText.includes('column')) {
          res = await fetch(`${url}/rest/v1/orders?on_conflict=id`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(basePayload),
          });
        }
      }

      // Sync normalized order_items rows idempotently when order has items
      if (res.ok && Array.isArray(order.items) && order.items.length > 0) {
        try {
          const checkItems = await fetch(
            `${url}/rest/v1/order_items?order_id=eq.${encodeURIComponent(order.id)}&select=id&limit=1`,
            { headers }
          );
          if (checkItems.ok) {
            const existingItems = (await checkItems.json()) as any[];
            if (Array.isArray(existingItems) && existingItems.length === 0) {
              await fetch(`${url}/rest/v1/order_items`, {
                method: 'POST',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify(
                  order.items.map((it) => ({
                    order_id: order.id,
                    product_id: String(it.product_id),
                    product_name: it.product_name,
                    urdu_name: it.urdu_name || null,
                    unit_price: it.unit_price,
                    unit: it.unit,
                    purchase_type: it.purchase_type,
                    weight_grams: it.weight_grams,
                    amount_paid: it.amount_paid ?? null,
                    quantity: it.quantity,
                    subtotal: it.subtotal,
                  }))
                ),
              });
            }
          }
        } catch {}
      }

      return res.ok;
    } catch {
      return false;
    }
  }

  public async syncCouponToSupabase(coupon: Coupon): Promise<boolean> {
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const basePayload = {
        code: coupon.code,
        discount_type: coupon.discount_type,
        value: coupon.value,
        min_order: coupon.min_order || 0,
        active: coupon.active !== false,
        description: coupon.description || '',
        assigned_phones: Array.isArray(coupon.assigned_phones) ? coupon.assigned_phones : [],
      };
      const extendedPayload = {
        ...basePayload,
        expires_at: coupon.expires_at || null,
        max_uses: coupon.max_uses ?? null,
        uses_count: coupon.uses_count ?? 0,
        per_customer_limit: coupon.per_customer_limit ?? null,
        allow_loyalty_stacking: Boolean(coupon.allow_loyalty_stacking),
        created_at: coupon.created_at || new Date().toISOString(),
        updated_at: coupon.updated_at || new Date().toISOString(),
      };
      let res = await fetch(`${url}/rest/v1/coupons?on_conflict=code`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(extendedPayload),
      });
      if (!res.ok && res.status === 400) {
        const errText = await res.text().catch(() => '');
        if (errText.includes('PGRST204') || errText.includes('column')) {
          res = await fetch(`${url}/rest/v1/coupons?on_conflict=code`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(basePayload),
          });
        }
      }
      return res.ok;
    } catch {
      return false;
    }
  }

  public async deleteCouponFromSupabase(code: string): Promise<boolean> {
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const res = await fetch(`${url}/rest/v1/coupons?code=eq.${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async syncLoyaltyToSupabase(
    account: LoyaltyAccount,
    txToSync?: LoyaltyAccount['history'][number]
  ): Promise<boolean> {
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const digits10 = this.normalizePhoneDigits10(account.user_phone);
      const res = await fetch(`${url}/rest/v1/loyalty_accounts?on_conflict=user_phone`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          user_phone: account.user_phone,
          phone_digits10: digits10 || null,
          user_name: account.user_name || 'Customer',
          points_balance: Math.max(0, account.points_balance || 0),
          lifetime_points: Math.max(0, account.lifetime_points || 0),
          cumulative_purchases: Math.max(0, account.cumulative_purchases || 0),
          successful_purchases_count: Math.max(0, account.successful_purchases_count || 0),
          tier: account.tier || 'None',
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) return false;

      const txs = txToSync ? [txToSync] : (account.history || []).slice(0, 100);
      if (txs.length > 0) {
        await fetch(`${url}/rest/v1/loyalty_transactions?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(
            txs.map((t) => ({
              id: t.id,
              user_phone: account.user_phone,
              phone_digits10: digits10 || null,
              order_id: t.order_id || null,
              points: t.points,
              type: t.type,
              description: t.description || '',
              created_at: t.created_at || new Date().toISOString(),
            }))
          ),
        }).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  public async syncDeliveryLocationToSupabase(payload: {
    order_id: string;
    rider_id: string;
    rider_name?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number | null;
    is_active: boolean;
    updated_at: string;
  }): Promise<boolean> {
    try {
      const { url, headers } = getSupabaseHeaders(true);
      const res = await fetch(`${url}/rest/v1/delivery_locations?on_conflict=order_id`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private initAutomatedBackupSchedule() {
    createDatabaseBackup(
      { products: this.products, orders: this.orders, receipts: this.receipts, reviews: this.reviews },
      'automated_daily'
    );
    setInterval(() => {
      createDatabaseBackup(
        { products: this.products, orders: this.orders, receipts: this.receipts, reviews: this.reviews },
        'automated_daily'
      );
    }, 1000 * 60 * 60 * 24);
  }

  public addAudit(
    actor_role: AuditLogEntry['actor_role'],
    actor_name: string,
    action: string,
    target_id: string | undefined,
    details: string
  ) {
    this.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor_role,
      actor_name,
      action,
      target_id,
      details,
      created_at: new Date().toISOString(),
    });
    if (this.auditLogs.length > 300) this.auditLogs.pop();
  }

  // --- Products ---
  public getProducts(): Product[] {
    return this.products;
  }

  public getProductById(id: string): Product | undefined {
    return this.products.find((p) => String(p.id) === String(id));
  }

  public async createProduct(data: Partial<Product>, actor = 'Owner'): Promise<Product> {
    const now = new Date().toISOString();
    const numericMax = this.products.reduce((max, p) => Math.max(max, Number(p.supabase_id || p.id) || 0), 41);
    const nextId = numericMax + 1;

    const newProd: Product = {
      id: String(nextId),
      supabase_id: nextId,
      name: data.name || 'Unnamed Produce',
      urdu_name: data.urdu_name || data.name || '',
      name_en: data.name_en || data.name || '',
      category: (data.category as any) || 'vegetables',
      price: Number(data.price) || 0,
      original_price: data.original_price ? Number(data.original_price) : undefined,
      cost_price: data.cost_price !== undefined ? data.cost_price : null,
      price_source: 'owner_manual',
      price_updated_at: now,
      unit: data.unit || 'Kg',
      stock_quantity: Number(data.stock_quantity) || 0,
      min_order_quantity: 0.1,
      max_order_quantity: 50,
      image_url:
        data.image_url ||
        (data.category === 'fruits'
          ? '/assets/images/fresh_fruits_display_1794208171015.jpg'
          : '/assets/images/fresh_vegetables_basket_1794208171062.jpg'),
      description: data.description || '',
      description_ur: data.description_ur || '',
      organic: data.organic !== false,
      is_seasonal: Boolean(data.is_seasonal),
      season_tag: (data.season_tag as any) || 'all_year',
      is_offer: Boolean(data.is_offer),
      is_top_selling: Boolean(data.is_top_selling),
      is_recommended: Boolean(data.is_recommended),
      farm_origin: data.farm_origin || 'Khanewal Mandi',
      is_out_of_stock: (Number(data.stock_quantity) || 0) <= 0,
      rating: 5.0,
      review_count: 0,
      created_at: now,
      updated_at: now,
    };

    // Best-effort insert into Supabase `vegetables`
    try {
      const { url, headers } = getSupabaseHeaders(true);
      await fetch(`${url}/rest/v1/vegetables`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ id: nextId, name: newProd.name, price: newProd.price, unit: newProd.unit }),
      });
    } catch {}

    this.products.unshift(newProd);
    this.addAudit('owner', actor, 'CREATE_PRODUCT', newProd.id, `Added ${newProd.name} at Rs.${newProd.price}/${newProd.unit}`);
    this.persist();
    return newProd;
  }

  public async updateProduct(id: string, updates: Partial<Product>, actor = 'Owner'): Promise<{ product: Product | null; supabaseSynced: boolean }> {
    const prod = this.getProductById(id);
    if (!prod) return { product: null, supabaseSynced: false };
    const now = new Date().toISOString();

    if (updates.price !== undefined && Number(updates.price) !== prod.price) {
      prod.previous_price = prod.price;
      prod.price = Number(updates.price);
      prod.price_source = 'owner_manual';
      prod.price_updated_at = now;
      this.addAudit('owner', actor, 'UPDATE_PRICE', prod.id, `${prod.name}: Rs.${prod.previous_price} -> Rs.${prod.price}`);
    }

    if (updates.stock_quantity !== undefined) {
      prod.stock_quantity = Math.max(0, Number(updates.stock_quantity));
      prod.is_out_of_stock = prod.stock_quantity <= 0;
    }

    Object.assign(prod, {
      ...updates,
      price: prod.price,
      previous_price: prod.previous_price,
      stock_quantity: prod.stock_quantity,
      is_out_of_stock: prod.is_out_of_stock,
      updated_at: now,
    });

    const supabaseSynced = await this.pushProductUpdateToSupabase(prod);
    this.persist();
    return { product: prod, supabaseSynced };
  }

  public updateProductStock(id: string, newStock: number, actor = 'Owner'): Product | null {
    const prod = this.getProductById(id);
    if (!prod) return null;
    prod.stock_quantity = Math.max(0, newStock);
    prod.is_out_of_stock = prod.stock_quantity <= 0;
    prod.updated_at = new Date().toISOString();
    this.addAudit('owner', actor, 'UPDATE_STOCK', prod.id, `${prod.name} stock set to ${prod.stock_quantity}`);
    this.persist();
    return prod;
  }

  public async deleteProduct(id: string, actor = 'Owner'): Promise<boolean> {
    const idx = this.products.findIndex((p) => String(p.id) === String(id));
    if (idx === -1) return false;
    const [removed] = this.products.splice(idx, 1);
    if (removed.supabase_id) {
      try {
        const { url, headers } = getSupabaseHeaders(true);
        await fetch(`${url}/rest/v1/vegetables?id=eq.${removed.supabase_id}`, {
          method: 'DELETE',
          headers,
        });
      } catch {}
    }
    this.addAudit('owner', actor, 'DELETE_PRODUCT', id, `Deleted product ${removed.name}`);
    this.persist();
    return true;
  }

  // --- Loyalty Lookup & Calculation Helpers ---
  public normalizePhoneDigits10(phone: string): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
  }

  public findLoyaltyKey(phone: string): string {
    const trimmed = String(phone || '').trim();
    if (this.loyaltyAccounts[trimmed]) return trimmed;
    const digits10 = this.normalizePhoneDigits10(trimmed);
    if (digits10.length >= 9) {
      const matchedKey = Object.keys(this.loyaltyAccounts).find(
        (k) => this.normalizePhoneDigits10(k) === digits10
      );
      if (matchedKey) return matchedKey;
    }
    return trimmed;
  }

  public calculateEligiblePurchaseAmount(
    ord: Pick<Order, 'subtotal' | 'discount' | 'loyalty_points_used' | 'loyalty_discount_rs'>
  ): number {
    const pointVal = Number(this.settings.loyaltyPointValueRs ?? 1) || 1;
    const redeemedRs =
      ord.loyalty_discount_rs !== undefined && ord.loyalty_discount_rs !== null
        ? Math.round(Number(ord.loyalty_discount_rs))
        : Math.round((ord.loyalty_points_used || 0) * pointVal);
    return Math.max(0, Math.round((ord.subtotal || 0) - (ord.discount || 0) - redeemedRs));
  }

  public calculateLoyaltyPointsEarned(eligibleAmount: number): number {
    if (this.settings.loyaltyEnabled === false) return 0;
    const per100 =
      this.settings.loyaltyPointsPer100Rs !== undefined &&
      Number.isFinite(Number(this.settings.loyaltyPointsPer100Rs)) &&
      Number(this.settings.loyaltyPointsPer100Rs) >= 0
        ? Number(this.settings.loyaltyPointsPer100Rs)
        : 5;
    return Math.floor(Math.max(0, eligibleAmount) / 100) * per100;
  }

  public computeMembershipTier(
    cumulativePurchases: number,
    successfulCount: number,
    existingTier?: LoyaltyAccount['tier'],
    allowRecalcDown = false
  ): LoyaltyAccount['tier'] {
    const rank: Record<LoyaltyAccount['tier'], number> = {
      None: 0,
      Bronze: 0,
      Silver: 1,
      Gold: 2,
      Platinum: 3,
      Diamond: 4,
    };
    let earnedTier: LoyaltyAccount['tier'] = 'None';
    if (cumulativePurchases >= 100000) earnedTier = 'Diamond';
    else if (cumulativePurchases >= 60000) earnedTier = 'Platinum';
    else if (cumulativePurchases >= 30000) earnedTier = 'Gold';
    else if (successfulCount >= 1) earnedTier = 'Silver';

    if (!allowRecalcDown && existingTier && rank[existingTier] > rank[earnedTier]) {
      return existingTier;
    }
    return earnedTier;
  }

  public isOrderSuccessfulAndCompleted(ord: Order): boolean {
    if (ord.order_status !== 'Delivered') return false;
    if (ord.payment_status === 'Rejected') return false;
    if (ord.receipt && ord.payment_status !== 'Verified') return false;
    return true;
  }

  public awardLoyaltyForCompletedOrder(ord: Order): number {
    if (ord.loyalty_points_awarded) return ord.loyalty_points_earned || 0;
    if (!this.isOrderSuccessfulAndCompleted(ord)) return 0;

    const now = new Date().toISOString();
    const phone = ord.customer_phone;
    const loyaltyKey = this.findLoyaltyKey(phone);
    let loyalty = this.loyaltyAccounts[loyaltyKey];
    if (!loyalty) {
      loyalty = {
        user_phone: phone,
        user_name: ord.customer_name || 'Customer',
        points_balance: 0,
        lifetime_points: 0,
        cumulative_purchases: 0,
        successful_purchases_count: 0,
        tier: 'None',
        history: [],
      };
      this.loyaltyAccounts[loyaltyKey] = loyalty;
    }

    // Extra idempotency guard against duplicate 'earned' ledger entries for the same order
    const alreadyInLedger = loyalty.history.some((h) => h.order_id === ord.id && h.type === 'earned');
    if (alreadyInLedger) {
      ord.loyalty_points_awarded = true;
      return ord.loyalty_points_earned || 0;
    }

    const eligibleAmount = this.calculateEligiblePurchaseAmount(ord);
    const pointsEarned = this.calculateLoyaltyPointsEarned(eligibleAmount);

    loyalty.cumulative_purchases = Math.max(0, (loyalty.cumulative_purchases || 0) + eligibleAmount);
    loyalty.successful_purchases_count = Math.max(0, (loyalty.successful_purchases_count || 0) + 1);
    if (ord.customer_name && (loyalty.user_name === 'Customer' || loyalty.user_name === 'Valued Customer')) {
      loyalty.user_name = ord.customer_name;
    }

    let earnTx: LoyaltyAccount['history'][number] | undefined;
    if (pointsEarned > 0) {
      loyalty.points_balance += pointsEarned;
      loyalty.lifetime_points += pointsEarned;
      earnTx = {
        id: `lh-earn-${ord.id}`,
        points: pointsEarned,
        type: 'earned',
        order_id: ord.id,
        description: `Earned ${pointsEarned} pts on delivered Order #${ord.id} (Eligible: Rs.${eligibleAmount})`,
        created_at: now,
      };
      loyalty.history.unshift(earnTx);
    }

    loyalty.tier = this.computeMembershipTier(
      loyalty.cumulative_purchases,
      loyalty.successful_purchases_count,
      loyalty.tier,
      false
    );

    ord.loyalty_eligible_amount = eligibleAmount;
    ord.loyalty_points_earned = pointsEarned;
    ord.loyalty_points_awarded = true;
    ord.loyalty_points_reversed = false;
    this.syncLoyaltyToSupabase(loyalty, earnTx).catch(() => {});
    return pointsEarned;
  }

  public getLoyaltyAccount(phone: string): LoyaltyAccount {
    const key = this.findLoyaltyKey(phone);
    return (
      this.loyaltyAccounts[key] || {
        user_phone: phone,
        user_name: 'Valued Customer',
        points_balance: 0,
        lifetime_points: 0,
        cumulative_purchases: 0,
        successful_purchases_count: 0,
        tier: 'None' as const,
        history: [],
      }
    );
  }

  // --- Orders ---
  public getOrderById(id: string): Order | undefined {
    const clean = id.trim().toLowerCase();
    return this.orders.find((o) => o.id.toLowerCase() === clean);
  }

  public createOrder(sanitizedData: any): { order: Order; duplicate: boolean } {
    // Idempotency check to prevent duplicate orders during offline sync retries
    if (sanitizedData.idempotency_key) {
      const existing = this.orders.find((o) => o.idempotency_key === sanitizedData.idempotency_key);
      if (existing) {
        return { order: existing, duplicate: true };
      }
    }

    const phone = sanitizedData.customer_phone;
    const loyaltyKey = this.findLoyaltyKey(phone);
    const existingLoyalty = this.loyaltyAccounts[loyaltyKey];
    const requestedRedeem = Math.max(
      0,
      Math.floor(Number(sanitizedData.requested_loyalty_points ?? sanitizedData.loyalty_points_used ?? 0))
    );
    const availableBalance = existingLoyalty ? Math.max(0, existingLoyalty.points_balance) : 0;
    if (requestedRedeem > 0 && (this.settings.loyaltyEnabled === false || requestedRedeem > availableBalance)) {
      throw new Error(
        this.settings.loyaltyEnabled === false
          ? 'Loyalty points program is currently disabled.'
          : `Insufficient loyalty points. Available: ${availableBalance} pts, Requested: ${requestedRedeem} pts.`
      );
    }

    const actualRedeemed = Math.max(0, Math.floor(Number(sanitizedData.loyalty_points_used || 0)));
    if (actualRedeemed > availableBalance) {
      throw new Error(
        `Insufficient loyalty points. Available: ${availableBalance} pts, Requested: ${actualRedeemed} pts.`
      );
    }

    const pointVal = Number(this.settings.loyaltyPointValueRs ?? 1) || 1;
    const loyaltyDiscountRs = Math.round(actualRedeemed * pointVal);

    const random4 = Math.floor(1000 + Math.random() * 9000);
    const orderId = `MVF-${new Date().toISOString().slice(2, 4)}${random4}`;
    const now = new Date().toISOString();

    const initialPaymentStatus =
      sanitizedData.payment_method === 'Cash on Delivery' ? 'COD Pending' : 'Pending Verification';

    const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000));

    let appliedCouponRecord: Coupon | undefined;
    if (sanitizedData.coupon_code) {
      appliedCouponRecord = this.coupons.find(
        (c) => c.code === String(sanitizedData.coupon_code).trim().toUpperCase()
      );
    }

    const newOrder: Order = {
      id: orderId,
      idempotency_key: sanitizedData.idempotency_key,
      user_id: sanitizedData.user_id,
      customer_name: sanitizedData.customer_name,
      customer_phone: sanitizedData.customer_phone,
      customer_email: sanitizedData.customer_email,
      delivery_address: sanitizedData.delivery_address,
      delivery_area: sanitizedData.delivery_area,
      coordinates: sanitizedData.coordinates,
      delivery_distance_km: sanitizedData.delivery_distance_km,
      distance_source: sanitizedData.distance_source,
      delivery_slot: sanitizedData.delivery_slot,
      notes: sanitizedData.notes,
      items: sanitizedData.items, // Preserves snapshot unit_price permanently!
      subtotal: sanitizedData.subtotal,
      delivery_fee: sanitizedData.delivery_fee,
      discount: sanitizedData.discount,
      coupon_code: sanitizedData.coupon_code,
      loyalty_points_used: actualRedeemed,
      loyalty_discount_rs: loyaltyDiscountRs,
      loyalty_points_earned: 0, // Awarded ONLY after successful & completed Delivered purchase
      loyalty_points_awarded: false,
      loyalty_points_refunded: false,
      loyalty_points_reversed: false,
      stock_restored: false,
      coupon_usage_recorded: Boolean(appliedCouponRecord),
      coupon_usage_restored: false,
      total_amount: Math.max(
        0,
        sanitizedData.subtotal + sanitizedData.delivery_fee - sanitizedData.discount - loyaltyDiscountRs
      ),
      payment_method: sanitizedData.payment_method,
      payment_status: initialPaymentStatus,
      order_status: 'Order Received',
      payment_reference: sanitizedData.payment_reference,
      payment_datetime: sanitizedData.payment_datetime,
      delivery_otp: deliveryOtp,
      otp_verified: false,
      status_history: [
        {
          status: 'Order Received',
          timestamp: now,
          note:
            initialPaymentStatus === 'Pending Verification'
              ? `${sanitizedData.payment_method} submitted — Pending Owner Verification`
              : 'Cash on Delivery order received',
          actor: 'customer',
        },
      ],
      created_at: now,
      updated_at: now,
    };

    // Decrease product stock
    for (const item of newOrder.items) {
      const prod = this.getProductById(item.product_id);
      if (prod) {
        prod.stock_quantity = Math.max(0, Math.round((prod.stock_quantity - item.quantity) * 100) / 100);
        prod.is_out_of_stock = prod.stock_quantity <= 0;
        prod.updated_at = now;
      }
    }

    // Track coupon usage
    if (appliedCouponRecord) {
      appliedCouponRecord.uses_count = (appliedCouponRecord.uses_count || 0) + 1;
      appliedCouponRecord.updated_at = now;
      this.syncCouponToSupabase(appliedCouponRecord).catch(() => {});
    }

    // Atomically deduct redeemed points from verified available balance
    let redeemTx: LoyaltyAccount['history'][number] | undefined;
    if (actualRedeemed > 0 && existingLoyalty) {
      existingLoyalty.points_balance = Math.max(0, existingLoyalty.points_balance - actualRedeemed);
      redeemTx = {
        id: `lh-red-${newOrder.id}`,
        points: -actualRedeemed,
        type: 'redeemed',
        order_id: newOrder.id,
        description: `Redeemed ${actualRedeemed} pts (Rs.${loyaltyDiscountRs} discount) on Order #${newOrder.id}`,
        created_at: now,
      };
      existingLoyalty.history.unshift(redeemTx);
      this.syncLoyaltyToSupabase(existingLoyalty, redeemTx).catch(() => {});
    }

    this.orders.unshift(newOrder);
    this.addAudit('customer', newOrder.customer_name, 'CREATE_ORDER', newOrder.id, `New order Rs.${newOrder.total_amount} (${newOrder.payment_method})`);
    this.persist();
    this.syncOrderToSupabase(newOrder).catch(() => {});
    return { order: newOrder, duplicate: false };
  }

  private reverseOrRefundLoyaltyOnCancellation(ord: Order, now: string) {
    const lKey = this.findLoyaltyKey(ord.customer_phone);
    const lAcc = this.loyaltyAccounts[lKey];
    if (!lAcc) return;

    const syncedTxs: LoyaltyAccount['history'][number][] = [];

    // 1. Refund any redeemed loyalty points (idempotently, recorded as 'refunded')
    if (
      ord.loyalty_points_used > 0 &&
      !ord.loyalty_points_refunded &&
      !lAcc.history.some((h) => h.order_id === ord.id && h.type === 'refunded')
    ) {
      lAcc.points_balance = Math.max(0, lAcc.points_balance + ord.loyalty_points_used);
      const refTx: LoyaltyAccount['history'][number] = {
        id: `lh-ref-${ord.id}`,
        points: ord.loyalty_points_used,
        type: 'refunded',
        order_id: ord.id,
        description: `Refunded ${ord.loyalty_points_used} redeemed pts (Order #${ord.id} Cancelled)`,
        created_at: now,
      };
      lAcc.history.unshift(refTx);
      syncedTxs.push(refTx);
      ord.loyalty_points_refunded = true;
    }

    // 2. Reverse any loyalty points & tier progress previously awarded for this order (idempotently)
    if (
      ord.loyalty_points_awarded &&
      !ord.loyalty_points_reversed &&
      !lAcc.history.some((h) => h.order_id === ord.id && h.type === 'reversed')
    ) {
      const earnedToReverse = Math.max(0, ord.loyalty_points_earned || 0);
      const eligibleToReverse = Math.max(
        0,
        ord.loyalty_eligible_amount !== undefined
          ? ord.loyalty_eligible_amount
          : this.calculateEligiblePurchaseAmount(ord)
      );

      if (earnedToReverse > 0) {
        lAcc.points_balance = Math.max(0, lAcc.points_balance - earnedToReverse);
        lAcc.lifetime_points = Math.max(0, lAcc.lifetime_points - earnedToReverse);
        const revTx: LoyaltyAccount['history'][number] = {
          id: `lh-rev-${ord.id}`,
          points: -earnedToReverse,
          type: 'reversed',
          order_id: ord.id,
          description: `Reversed ${earnedToReverse} earned pts (Order #${ord.id} Cancelled)`,
          created_at: now,
        };
        lAcc.history.unshift(revTx);
        syncedTxs.push(revTx);
      }

      lAcc.cumulative_purchases = Math.max(0, (lAcc.cumulative_purchases || 0) - eligibleToReverse);
      lAcc.successful_purchases_count = Math.max(0, (lAcc.successful_purchases_count || 0) - 1);
      lAcc.tier = this.computeMembershipTier(
        lAcc.cumulative_purchases,
        lAcc.successful_purchases_count,
        lAcc.tier,
        true
      );

      ord.loyalty_points_reversed = true;
      ord.loyalty_points_awarded = false;
      ord.loyalty_points_earned = 0;
    }

    for (const tx of syncedTxs) {
      this.syncLoyaltyToSupabase(lAcc, tx).catch(() => {});
    }
    if (syncedTxs.length === 0 && ord.loyalty_points_reversed) {
      this.syncLoyaltyToSupabase(lAcc).catch(() => {});
    }
  }

  public updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorRole: AuditLogEntry['actor_role'],
    actorName: string,
    note?: string,
    rejectionReason?: string
  ): Order | null {
    const ord = this.getOrderById(orderId);
    if (!ord) return null;
    const now = new Date().toISOString();
    ord.order_status = newStatus;
    if (rejectionReason) ord.rejection_reason = rejectionReason;
    if (newStatus === 'Delivered' && ord.payment_method === 'Cash on Delivery') {
      ord.payment_status = 'Paid COD';
    }

    // Award loyalty points & membership tier ONLY once when order reaches Delivered
    if (newStatus === 'Delivered') {
      this.awardLoyaltyForCompletedOrder(ord);
    }

    // Restore stock, restore coupon usage, refund redeemed points & reverse earned points IDEMPOTENTLY on Cancelled
    if (newStatus === 'Cancelled') {
      if (!ord.stock_restored) {
        for (const it of ord.items) {
          const prod = this.getProductById(it.product_id);
          if (prod) {
            prod.stock_quantity = Math.round((prod.stock_quantity + it.quantity) * 100) / 100;
            prod.is_out_of_stock = prod.stock_quantity <= 0;
            prod.updated_at = now;
          }
        }
        ord.stock_restored = true;
      }

      if (ord.coupon_code && ord.coupon_usage_recorded && !ord.coupon_usage_restored) {
        const cpn = this.coupons.find(
          (c) => c.code === String(ord.coupon_code).trim().toUpperCase()
        );
        if (cpn) {
          cpn.uses_count = Math.max(0, (cpn.uses_count || 0) - 1);
          cpn.updated_at = now;
          this.syncCouponToSupabase(cpn).catch(() => {});
        }
        ord.coupon_usage_restored = true;
      }

      this.reverseOrRefundLoyaltyOnCancellation(ord, now);
    }

    if (newStatus === 'Delivered' || newStatus === 'Cancelled') {
      ord.rider_live_location = undefined;
      if (ord.assigned_rider_id) {
        this.syncDeliveryLocationToSupabase({
          order_id: ord.id,
          rider_id: ord.assigned_rider_id,
          rider_name: ord.assigned_rider_name,
          lat: ord.coordinates?.lat || 30.2985,
          lng: ord.coordinates?.lng || 71.9325,
          is_active: false,
          updated_at: now,
        }).catch(() => {});
      }
    }
    ord.updated_at = now;
    ord.status_history = ord.status_history || [];
    ord.status_history.push({
      status: newStatus,
      timestamp: now,
      note: note || rejectionReason || `Updated to ${newStatus}`,
      actor: actorName,
    });
    this.addAudit(actorRole, actorName, 'UPDATE_ORDER_STATUS', ord.id, `${newStatus}${rejectionReason ? ` (${rejectionReason})` : ''}`);
    this.persist();
    this.syncOrderToSupabase(ord).catch(() => {});
    return ord;
  }

  public updateRiderLiveCoordinates(
    riderId: string,
    lat: number,
    lng: number,
    meta?: { orderId?: string; accuracy?: number; speed?: number | null }
  ): { updated_at: string; updatedOrderIds: string[] } {
    const now = new Date().toISOString();
    const rider = this.riders.find((r) => r.id === riderId);
    if (rider) {
      rider.current_location = {
        ...rider.current_location,
        lat,
        lng,
        updated_at: now,
      };
    }

    const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = [
      'Order Accepted',
      'Preparing',
      'Ready for Delivery',
      'Rider Assigned',
      'Picked Up',
      'On the Way',
      'Out for Delivery',
    ];

    const targets = this.orders.filter(
      (o) =>
        o.assigned_rider_id === riderId &&
        ACTIVE_DELIVERY_STATUSES.includes(o.order_status) &&
        (!meta?.orderId || o.id.toLowerCase() === meta.orderId.toLowerCase())
    );

    const updatedOrderIds: string[] = [];
    for (const o of targets) {
      o.rider_live_location = {
        lat,
        lng,
        accuracy: meta?.accuracy,
        speed: meta?.speed ?? null,
        updated_at: now,
      };
      o.updated_at = now;
      updatedOrderIds.push(o.id);
      this.syncDeliveryLocationToSupabase({
        order_id: o.id,
        rider_id: riderId,
        rider_name: rider?.name,
        lat,
        lng,
        accuracy: meta?.accuracy,
        speed: meta?.speed ?? null,
        is_active: true,
        updated_at: now,
      }).catch(() => {});
    }
    this.persist();
    return { updated_at: now, updatedOrderIds };
  }

  public stopRiderLiveCoordinates(riderId: string, orderId?: string): string[] {
    const now = new Date().toISOString();
    const rider = this.riders.find((r) => r.id === riderId);
    const stoppedOrderIds: string[] = [];
    this.orders
      .filter(
        (o) =>
          o.assigned_rider_id === riderId &&
          (!orderId || o.id.toLowerCase() === orderId.toLowerCase())
      )
      .forEach((o) => {
        if (o.rider_live_location) {
          o.rider_live_location = undefined;
          o.updated_at = now;
          stoppedOrderIds.push(o.id);
          this.syncDeliveryLocationToSupabase({
            order_id: o.id,
            rider_id: riderId,
            rider_name: rider?.name,
            lat: o.coordinates?.lat || 30.2985,
            lng: o.coordinates?.lng || 71.9325,
            is_active: false,
            updated_at: now,
          }).catch(() => {});
        }
      });
    this.persist();
    return stoppedOrderIds;
  }

  public assignRiderToOrders(orderIds: string[], riderId: string, actor = 'Owner'): { orders: Order[]; errors: string[] } {
    const rider = this.riders.find((r) => r.id === riderId && r.is_active);
    if (!rider) return { orders: [], errors: ['Active rider not found.'] };

    const updated: Order[] = [];
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const oid of orderIds) {
      const ord = this.getOrderById(oid);
      if (!ord) {
        errors.push(`Order ${oid} not found.`);
        continue;
      }
      if (ord.order_status === 'Delivered' || ord.order_status === 'Cancelled') {
        errors.push(`Order ${oid} is already ${ord.order_status} and cannot be assigned.`);
        continue;
      }
      if (ord.assigned_rider_id && ord.assigned_rider_id !== rider.id) {
        const prevRider = this.riders.find((r) => r.id === ord.assigned_rider_id);
        if (prevRider) prevRider.assigned_orders_count = Math.max(0, prevRider.assigned_orders_count - 1);
      }
      if (ord.assigned_rider_id !== rider.id) {
        rider.assigned_orders_count += 1;
      }
      ord.assigned_rider_id = rider.id;
      ord.assigned_rider_name = rider.name;
      ord.assigned_rider_phone = rider.phone;
      ord.order_status = 'Rider Assigned';
      ord.updated_at = now;
      ord.status_history.push({
        status: 'Rider Assigned',
        timestamp: now,
        note: `Assigned to ${rider.name}`,
        actor,
      });
      updated.push(ord);
    }

    this.addAudit('owner', actor, 'ASSIGN_RIDER', rider.id, `Assigned ${updated.length} orders to ${rider.name}`);
    this.persist();
    return { orders: updated, errors };
  }

  // --- Private Payment Receipts ---
  public addReceipt(sanitizedReceipt: any): PaymentReceipt {
    ensureDirs();
    const id = `rcpt-${Date.now()}`;
    const hasImage = Boolean(sanitizedReceipt.receipt_image_url);

    if (hasImage) {
      // Save privately on server disk outside public/
      fs.writeFileSync(path.join(PRIVATE_RECEIPTS_DIR, `${id}.dat`), sanitizedReceipt.receipt_image_url, { mode: 0o600 });
    }

    const rcpt: PaymentReceipt = {
      id,
      order_id: sanitizedReceipt.order_id,
      payment_method: sanitizedReceipt.payment_method,
      bank_name: sanitizedReceipt.bank_name,
      account_number: sanitizedReceipt.account_number,
      sender_name: sanitizedReceipt.sender_name,
      transaction_ref: sanitizedReceipt.transaction_ref,
      amount_paid: sanitizedReceipt.amount_paid,
      payment_datetime: sanitizedReceipt.payment_datetime,
      has_receipt_image: hasImage,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    this.receipts.unshift(rcpt);

    const ord = this.getOrderById(sanitizedReceipt.order_id);
    if (ord) {
      ord.receipt = rcpt;
      ord.payment_reference = sanitizedReceipt.transaction_ref;
      ord.payment_datetime = sanitizedReceipt.payment_datetime;
      // STRICT: Always remain Pending Verification until Owner manually approves!
      ord.payment_status = 'Pending Verification';
      ord.updated_at = new Date().toISOString();
    }

    this.addAudit('customer', sanitizedReceipt.sender_name, 'SUBMIT_PAYMENT_PROOF', sanitizedReceipt.order_id, `Submitted TID ${sanitizedReceipt.transaction_ref} (Pending Verification)`);
    this.persist();
    return rcpt;
  }

  public getPrivateReceiptImage(receiptId: string): string | null {
    const file = path.join(PRIVATE_RECEIPTS_DIR, `${receiptId}.dat`);
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8');
    }
    return null;
  }

  public verifyReceipt(receiptId: string, decision: 'approved' | 'rejected', notes?: string, ownerName = 'Hamid Ali'): PaymentReceipt | null {
    const rcpt = this.receipts.find((r) => r.id === receiptId);
    if (!rcpt) return null;

    const now = new Date().toISOString();
    rcpt.status = decision;
    rcpt.verified_at = now;
    rcpt.verified_by = ownerName;
    rcpt.verification_notes =
      notes || (decision === 'approved' ? 'Verified by shop owner' : 'Rejected by shop owner');

    const ord = this.getOrderById(rcpt.order_id);
    if (ord) {
      ord.receipt = rcpt;
      ord.payment_status = decision === 'approved' ? 'Verified' : 'Rejected';
      if (decision === 'approved' && ord.order_status === 'Order Received') {
        ord.order_status = 'Order Confirmed';
        ord.status_history.push({
          status: 'Order Confirmed',
          timestamp: now,
          note: `Payment Verified (${rcpt.transaction_ref}) by ${ownerName}`,
          actor: ownerName,
        });
      }
      if (decision === 'approved') {
        this.awardLoyaltyForCompletedOrder(ord);
      } else if (decision === 'rejected' && ord.loyalty_points_awarded && !ord.loyalty_points_reversed) {
        this.reverseOrRefundLoyaltyOnCancellation(ord, now);
      }
      ord.updated_at = now;
      this.syncOrderToSupabase(ord).catch(() => {});
    }

    this.addAudit('owner', ownerName, 'VERIFY_PAYMENT', rcpt.order_id, `Payment ${decision.toUpperCase()} for TID ${rcpt.transaction_ref}`);
    this.persist();
    return rcpt;
  }

  // --- Riders Management (up to 10+ riders) ---
  public getPublicRiders(): Omit<Rider, 'pin_hash'>[] {
    return this.riders.map(({ pin_hash: _omit, ...rest }) => rest);
  }

  public verifyRiderCredentials(identifier: string, pin: string): Omit<Rider, 'pin_hash'> | null {
    const clean = identifier.trim().toLowerCase().replace(/\s+/g, '');
    const rider = this.riders.find(
      (r) =>
        r.is_active &&
        (r.id.toLowerCase() === clean ||
          r.phone.replace(/\D/g, '').endsWith(clean.replace(/\D/g, '').slice(-10)))
    );
    if (!rider || !rider.pin_hash) return null;
    const [salt, hash] = rider.pin_hash.split(':');
    if (!salt || !hash || !verifySecret(pin.trim(), hash, salt)) return null;
    const { pin_hash: _omit, ...safe } = rider;
    return safe;
  }

  public addRider(data: { name: string; phone: string; vehicle_type: Rider['vehicle_type']; vehicle_reg: string; pin: string }, actor = 'Owner'): Omit<Rider, 'pin_hash'> {
    const nextNum = this.riders.length + 1;
    const id = `RIDER-${String(nextNum).padStart(2, '0')}`;
    const { hash, salt } = hashSecret(data.pin || '1234');
    const newRider: Rider = {
      id,
      name: data.name,
      phone: data.phone,
      vehicle_type: data.vehicle_type || 'Motorcycle (Insulated Box)',
      vehicle_reg: data.vehicle_reg || 'KWL-NEW',
      pin_hash: `${salt}:${hash}`,
      current_location: {
        lat: 30.2985,
        lng: 71.9325,
        area_name: 'Camp Chowk, Khanewal',
      },
      is_active: true,
      assigned_orders_count: 0,
      completed_deliveries: 0,
    };
    this.riders.push(newRider);
    this.addAudit('owner', actor, 'ADD_RIDER', id, `Added rider ${data.name}`);
    this.persist();
    const { pin_hash: _omit, ...safe } = newRider;
    return safe;
  }

  // --- Expenses, Coupons, Complaints, Settings, Reports ---
  public addExpense(data: Omit<Expense, 'id' | 'created_at'>, actor = 'Owner'): Expense {
    const exp: Expense = {
      ...data,
      id: `exp-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    this.expenses.unshift(exp);
    this.addAudit('owner', actor, 'ADD_EXPENSE', exp.id, `${exp.title}: Rs.${exp.amount}`);
    this.persist();
    return exp;
  }

  public normalizeAssignedPhones(input?: string[] | string): string[] {
    if (!input) return [];
    const rawList = Array.isArray(input) ? input : String(input).split(/[,\n]+/);
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const item of rawList) {
      const trimmed = String(item || '').trim();
      const d10 = this.normalizePhoneDigits10(trimmed);
      if (d10.length >= 9 && !seen.has(d10)) {
        seen.add(d10);
        normalized.push(trimmed);
      }
    }
    return normalized;
  }

  public validateCouponForCustomer(
    code: string,
    subtotal: number,
    customerPhone?: string,
    deliveryFee = 0,
    loyaltyPointsUsed = 0
  ): { valid: true; coupon: Coupon; discountAmount: number } | { valid: false; status: number; error: string } {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean) {
      return { valid: false, status: 400, error: 'Coupon code is required.' };
    }
    const coupon = this.coupons.find((c) => c.code === clean);
    if (!coupon) {
      return { valid: false, status: 404, error: 'Invalid coupon code.' };
    }
    if (!coupon.active) {
      return { valid: false, status: 400, error: `Coupon ${coupon.code} is currently paused or inactive.` };
    }

    // Expiry check (treat YYYY-MM-DD as end of that UTC day)
    if (coupon.expires_at) {
      const rawExp = String(coupon.expires_at).trim();
      const expIso = /^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? `${rawExp}T23:59:59.999Z` : rawExp;
      const expMs = new Date(expIso).getTime();
      if (Number.isFinite(expMs) && Date.now() > expMs) {
        return { valid: false, status: 400, error: `Coupon ${coupon.code} expired on ${rawExp.slice(0, 10)}.` };
      }
    }

    // Global usage limit check
    if (coupon.max_uses && coupon.max_uses > 0 && (coupon.uses_count || 0) >= coupon.max_uses) {
      return {
        valid: false,
        status: 400,
        error: `Coupon ${coupon.code} has reached its maximum usage limit (${coupon.max_uses}).`,
      };
    }

    // Customer phone restriction check
    const custDigits = this.normalizePhoneDigits10(customerPhone || '');
    if (Array.isArray(coupon.assigned_phones) && coupon.assigned_phones.length > 0) {
      if (custDigits.length < 9) {
        return {
          valid: false,
          status: 400,
          error: 'Please enter your mobile number first to verify this customer-assigned coupon.',
        };
      }
      const allowed = coupon.assigned_phones.some((p) => this.normalizePhoneDigits10(p) === custDigits);
      if (!allowed) {
        return {
          valid: false,
          status: 403,
          error: 'This coupon is not assigned to your phone number.',
        };
      }
    }

    // Per-customer usage limit check
    if (coupon.per_customer_limit && coupon.per_customer_limit > 0) {
      if (custDigits.length < 9) {
        return {
          valid: false,
          status: 400,
          error: 'Please enter your mobile number first to verify coupon usage eligibility.',
        };
      }
      const usedByCustomer = this.orders.filter(
        (o) =>
          o.coupon_code === coupon.code &&
          o.order_status !== 'Cancelled' &&
          this.normalizePhoneDigits10(o.customer_phone) === custDigits
      ).length;
      if (usedByCustomer >= coupon.per_customer_limit) {
        return {
          valid: false,
          status: 400,
          error: `You have already reached the usage limit (${coupon.per_customer_limit}x) for ${coupon.code}.`,
        };
      }
    }

    if (Number(subtotal || 0) < (coupon.min_order || 0)) {
      return {
        valid: false,
        status: 400,
        error: `Minimum order of Rs. ${coupon.min_order} required for ${coupon.code}.`,
      };
    }

    // Prevent stacking coupon + loyalty points unless explicitly allowed by Admin
    if (Number(loyaltyPointsUsed || 0) > 0 && !coupon.allow_loyalty_stacking) {
      return {
        valid: false,
        status: 400,
        error: `Coupon ${coupon.code} cannot be combined with loyalty points redemption unless permitted by Admin.`,
      };
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'fixed') {
      discountAmount = Math.min(Math.max(0, Number(coupon.value || 0)), Math.max(0, subtotal));
    } else if (coupon.discount_type === 'percent') {
      discountAmount = Math.min(
        Math.round((Math.max(0, subtotal) * Math.max(0, Number(coupon.value || 0))) / 100),
        Math.max(0, subtotal)
      );
    } else if (coupon.discount_type === 'free_delivery') {
      discountAmount = Math.max(0, Number(deliveryFee || 0));
    }

    return { valid: true, coupon, discountAmount };
  }

  public addCoupon(coupon: Coupon, actor = 'Owner'): Coupon {
    const cleanCode = coupon.code.trim().toUpperCase();
    const existingIdx = this.coupons.findIndex((c) => c.code === cleanCode);
    const prev = existingIdx >= 0 ? this.coupons[existingIdx] : undefined;
    const assigned = this.normalizeAssignedPhones(coupon.assigned_phones);
    const now = new Date().toISOString();
    const record: Coupon = {
      ...coupon,
      code: cleanCode,
      min_order: Math.max(0, Number(coupon.min_order || 0)),
      active: coupon.active !== false,
      expires_at: coupon.expires_at ? String(coupon.expires_at).trim() : undefined,
      max_uses: coupon.max_uses && Number(coupon.max_uses) > 0 ? Math.floor(Number(coupon.max_uses)) : undefined,
      uses_count:
        coupon.uses_count !== undefined
          ? Math.max(0, Math.floor(Number(coupon.uses_count)))
          : prev?.uses_count || 0,
      per_customer_limit:
        coupon.per_customer_limit && Number(coupon.per_customer_limit) > 0
          ? Math.floor(Number(coupon.per_customer_limit))
          : undefined,
      allow_loyalty_stacking: Boolean(coupon.allow_loyalty_stacking),
      created_at: prev?.created_at || coupon.created_at || now,
      updated_at: now,
      ...(assigned.length > 0 ? { assigned_phones: assigned } : {}),
    };
    if (assigned.length === 0) {
      delete record.assigned_phones;
    }
    if (existingIdx >= 0) this.coupons[existingIdx] = record;
    else this.coupons.unshift(record);
    this.addAudit('owner', actor, 'SAVE_COUPON', cleanCode, `${record.discount_type} ${record.value}${assigned.length ? ` (assigned: ${assigned.length})` : ''}`);
    this.persist();
    this.syncCouponToSupabase(record).catch(() => {});
    return record;
  }

  public deleteCoupon(code: string, actor = 'Owner'): boolean {
    const cleanCode = String(code || '').trim().toUpperCase();
    const idx = this.coupons.findIndex((c) => c.code === cleanCode);
    if (idx === -1) return false;
    this.coupons.splice(idx, 1);
    this.addAudit('owner', actor, 'DELETE_COUPON', cleanCode, `Deleted coupon ${cleanCode}`);
    this.persist();
    this.deleteCouponFromSupabase(cleanCode).catch(() => {});
    return true;
  }

  public getCustomersDirectory(): CustomerDirectoryEntry[] {
    const byDigits = new Map<string, CustomerDirectoryEntry>();

    const upsertPhoneKey = (rawPhone: string, fallbackName: string) => {
      const digits = this.normalizePhoneDigits10(rawPhone);
      const key = digits.length >= 9 ? digits : rawPhone.trim();
      let entry = byDigits.get(key);
      if (!entry) {
        entry = {
          phone: rawPhone.trim(),
          name: fallbackName || 'Customer',
          ordersCount: 0,
          deliveredOrdersCount: 0,
          totalSpent: 0,
          points_balance: 0,
          lifetime_points: 0,
          cumulative_purchases: 0,
          successful_purchases_count: 0,
          tier: 'None',
          assignedCoupons: [],
        };
        byDigits.set(key, entry);
      } else if (fallbackName && (entry.name === 'Customer' || entry.name === 'Valued Customer')) {
        entry.name = fallbackName;
      }
      return entry;
    };

    for (const acc of Object.values(this.loyaltyAccounts)) {
      const entry = upsertPhoneKey(acc.user_phone, acc.user_name);
      entry.points_balance = Math.max(0, acc.points_balance || 0);
      entry.lifetime_points = Math.max(0, acc.lifetime_points || 0);
      entry.cumulative_purchases = Math.max(0, acc.cumulative_purchases || 0);
      entry.successful_purchases_count = Math.max(0, acc.successful_purchases_count || 0);
      entry.tier = acc.tier || 'None';
    }

    for (const ord of this.orders) {
      const entry = upsertPhoneKey(ord.customer_phone, ord.customer_name);
      entry.ordersCount += 1;
      if (ord.order_status !== 'Cancelled') {
        entry.totalSpent += Number(ord.total_amount || 0);
      }
      if (this.isOrderSuccessfulAndCompleted(ord)) {
        entry.deliveredOrdersCount += 1;
      }
      if (!entry.lastOrderAt || new Date(ord.created_at) > new Date(entry.lastOrderAt)) {
        entry.lastOrderAt = ord.created_at;
      }
    }

    for (const cpn of this.coupons) {
      if (!Array.isArray(cpn.assigned_phones)) continue;
      for (const phone of cpn.assigned_phones) {
        const d10 = this.normalizePhoneDigits10(phone);
        const entry = byDigits.get(d10) || upsertPhoneKey(phone, 'Customer');
        if (!entry.assignedCoupons.includes(cpn.code)) {
          entry.assignedCoupons.push(cpn.code);
        }
      }
    }

    return Array.from(byDigits.values()).sort((a, b) => b.totalSpent - a.totalSpent || b.points_balance - a.points_balance);
  }

  public adjustCustomerLoyaltyPoints(
    phone: string,
    deltaPoints: number,
    reason: string,
    customerName?: string,
    actor = 'Owner'
  ): LoyaltyAccount {
    const cleanPhone = String(phone || '').trim();
    const loyaltyKey = this.findLoyaltyKey(cleanPhone);
    let loyalty = this.loyaltyAccounts[loyaltyKey];
    if (!loyalty) {
      loyalty = {
        user_phone: cleanPhone,
        user_name: customerName || 'Customer',
        points_balance: 0,
        lifetime_points: 0,
        cumulative_purchases: 0,
        successful_purchases_count: 0,
        tier: 'None',
        history: [],
      };
      this.loyaltyAccounts[loyaltyKey] = loyalty;
    } else if (customerName && (loyalty.user_name === 'Customer' || loyalty.user_name === 'Valued Customer')) {
      loyalty.user_name = customerName;
    }

    const intDelta = Math.trunc(deltaPoints);
    const nextBalance = Math.max(0, loyalty.points_balance + intDelta);
    const actualChange = nextBalance - loyalty.points_balance;
    loyalty.points_balance = nextBalance;
    if (actualChange > 0) {
      loyalty.lifetime_points += actualChange;
    }
    const adjTx: LoyaltyAccount['history'][number] = {
      id: `lh-adj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      points: actualChange,
      type: actualChange >= 0 ? 'earned' : 'reversed',
      description: `Admin adjustment (${actualChange >= 0 ? '+' : ''}${actualChange} pts): ${reason || 'Manual update'}`,
      created_at: new Date().toISOString(),
    };
    loyalty.history.unshift(adjTx);
    this.addAudit('owner', actor, 'ADJUST_LOYALTY_POINTS', cleanPhone, `${actualChange >= 0 ? '+' : ''}${actualChange} pts (${reason || 'Manual'})`);
    this.persist();
    this.syncLoyaltyToSupabase(loyalty, adjTx).catch(() => {});
    return loyalty;
  }

  public addComplaint(data: { order_id?: string; customer_name: string; customer_phone: string; subject: string; message: string }): CustomerComplaint {
    const now = new Date().toISOString();
    const c: CustomerComplaint = {
      id: `cmp-${Date.now()}`,
      ...data,
      status: 'open',
      created_at: now,
      updated_at: now,
    };
    this.complaints.unshift(c);
    this.persist();
    return c;
  }

  public updateComplaint(id: string, status: CustomerComplaint['status'], owner_reply?: string, actor = 'Owner'): CustomerComplaint | null {
    const c = this.complaints.find((item) => item.id === id);
    if (!c) return null;
    c.status = status;
    if (owner_reply !== undefined) c.owner_reply = owner_reply;
    c.updated_at = new Date().toISOString();
    this.addAudit('owner', actor, 'UPDATE_COMPLAINT', id, `Marked ${status}`);
    this.persist();
    return c;
  }

  public updateSettings(updates: Partial<ShopSettings>, actor = 'Owner'): ShopSettings {
    this.settings = { ...this.settings, ...updates };
    this.addAudit('owner', actor, 'UPDATE_SETTINGS', undefined, 'Updated shop settings');
    this.persist();
    return this.settings;
  }

  public computeBusinessReport(range: 'daily' | 'weekly' | 'monthly') {
    const now = Date.now();
    const cutoffMs =
      range === 'daily'
        ? now - 24 * 60 * 60 * 1000
        : range === 'weekly'
        ? now - 7 * 24 * 60 * 60 * 1000
        : now - 30 * 24 * 60 * 60 * 1000;

    const rangeOrders = this.orders.filter((o) => new Date(o.created_at).getTime() >= cutoffMs);
    const activeOrders = rangeOrders.filter((o) => o.order_status !== 'Cancelled');
    const cancelledOrders = rangeOrders.filter((o) => o.order_status === 'Cancelled');
    const pendingOrders = rangeOrders.filter(
      (o) => !['Delivered', 'Cancelled'].includes(o.order_status)
    );

    const totalSales = activeOrders.reduce((s, o) => s + o.total_amount, 0);
    const deliveryChargesCollected = activeOrders.reduce((s, o) => s + (o.delivery_fee || 0), 0);

    // Honest profit calculation ONLY when actual wholesale cost_price is recorded
    let costRecordedItemsRevenue = 0;
    let totalRecordedPurchaseCost = 0;
    let itemsWithoutCostCount = 0;

    const itemSalesMap = new Map<string, { name: string; urdu_name?: string; qty: number; revenue: number }>();

    for (const o of activeOrders) {
      for (const it of o.items) {
        const cur = itemSalesMap.get(it.product_id) || {
          name: it.product_name,
          urdu_name: it.urdu_name,
          qty: 0,
          revenue: 0,
        };
        cur.qty += it.quantity;
        cur.revenue += it.subtotal;
        itemSalesMap.set(it.product_id, cur);

        const prod = this.getProductById(it.product_id);
        if (prod && prod.cost_price !== null && prod.cost_price !== undefined) {
          costRecordedItemsRevenue += it.subtotal;
          totalRecordedPurchaseCost += prod.cost_price * it.quantity;
        } else {
          itemsWithoutCostCount += 1;
        }
      }
    }

    const rangeExpenses = this.expenses.filter((e) => new Date(e.date || e.created_at).getTime() >= cutoffMs);
    const expensesTotal = rangeExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const hasActualCostData = itemsWithoutCostCount === 0 && activeOrders.length > 0;
    const partialGrossProfit = costRecordedItemsRevenue - totalRecordedPurchaseCost;
    const netProfit = hasActualCostData ? Math.round(partialGrossProfit - expensesTotal) : null;

    const bestSelling = Array.from(itemSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const lowStockProducts = this.products.filter((p) => p.stock_quantity <= 5);

    const riderPerformance = this.riders.map((r) => {
      const assigned = rangeOrders.filter((o) => o.assigned_rider_id === r.id);
      const delivered = assigned.filter((o) => o.order_status === 'Delivered');
      return {
        id: r.id,
        name: r.name,
        assignedCount: assigned.length,
        deliveredCount: delivered.length,
        revenueHandled: delivered.reduce((s, o) => s + o.total_amount, 0),
      };
    });

    const paymentBreakdown = {
      cashOnDelivery: activeOrders.filter((o) => o.payment_method === 'Cash on Delivery').reduce((s, o) => s + o.total_amount, 0),
      jazzCash: activeOrders
        .filter((o) =>
          ['JazzCash', 'JazzCash Merchant', 'JazzCash Personal'].includes(o.payment_method)
        )
        .reduce((s, o) => s + o.total_amount, 0),
      easypaisa: activeOrders.filter((o) => o.payment_method === 'Easypaisa').reduce((s, o) => s + o.total_amount, 0),
      bankAlfalah: activeOrders.filter((o) => o.payment_method === 'Bank Alfalah').reduce((s, o) => s + o.total_amount, 0),
      raastId: activeOrders.filter((o) => o.payment_method === 'Raast ID').reduce((s, o) => s + o.total_amount, 0),
      pendingVerificationCount: rangeOrders.filter((o) => o.payment_status === 'Pending Verification').length,
    };

    return {
      range,
      totalSales: Math.round(totalSales),
      ordersCount: rangeOrders.length,
      pendingOrdersCount: pendingOrders.length,
      cancelledOrdersCount: cancelledOrders.length,
      deliveryChargesCollected: Math.round(deliveryChargesCollected),
      expensesTotal: Math.round(expensesTotal),
      hasActualCostData,
      itemsWithoutCostCount,
      netProfit,
      bestSelling,
      lowStockProducts,
      riderPerformance,
      paymentBreakdown,
    };
  }

  public addReview(productId: string, userName: string, rating: number, freshnessScore: number, comment: string): Review {
    const newRev: Review = {
      id: `rev-${Date.now()}`,
      product_id: productId,
      user_name: userName,
      rating: Math.max(1, Math.min(5, rating)),
      freshness_score: Math.max(1, Math.min(5, freshnessScore)),
      comment,
      verified_purchase: true,
      created_at: new Date().toISOString(),
    };
    this.reviews.unshift(newRev);
    const prod = this.getProductById(productId);
    if (prod) {
      const prodReviews = this.reviews.filter((r) => r.product_id === productId);
      const avg = prodReviews.reduce((sum, r) => sum + r.rating, 0) / prodReviews.length;
      prod.rating = Math.round(avg * 10) / 10;
      prod.review_count = prodReviews.length;
    }
    this.persist();
    return newRev;
  }

  public createMarketingCampaign(title: string, message: string, target_audience: any, discount_code?: string): MarketingCampaign {
    const campaign: MarketingCampaign = {
      id: `camp-${Date.now()}`,
      title,
      message,
      target_audience: target_audience || 'all_users',
      discount_code,
      sent_at: new Date().toISOString(),
      sent_count: Object.keys(this.loyaltyAccounts).length + this.orders.length,
    };
    this.campaigns.unshift(campaign);
    this.persist();
    return campaign;
  }

  public restoreFromDump(data: any): boolean {
    if (Array.isArray(data.products) && data.products.length > 0) this.products = data.products;
    if (Array.isArray(data.orders)) this.orders = data.orders;
    if (Array.isArray(data.receipts)) this.receipts = data.receipts;
    if (Array.isArray(data.reviews)) this.reviews = data.reviews;
    this.addAudit('owner', 'Owner', 'RESTORE_BACKUP', undefined, 'Restored database snapshot');
    this.persist();
    return true;
  }

  public async checkSupabaseLaunchStatus(): Promise<{
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
  }> {
    const { url, headers } = getSupabaseHeaders(true);
    const projectRef = url.replace(/^https?:\/\//, '').split('.')[0] || '';
    const tableNames = [
      'vegetables',
      'orders',
      'delivery_locations',
      'riders',
      'payment_receipts',
      'shop_settings',
      'audit_logs',
      'coupons',
      'loyalty_accounts',
      'loyalty_transactions',
    ];
    const tables: Record<string, { exists: boolean; status: number }> = {};

    await Promise.all(
      tableNames.map(async (tbl) => {
        try {
          const r = await fetch(`${url}/rest/v1/${tbl}?select=*&limit=1`, { headers });
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          const isValidJsonResponse = r.ok && !ct.includes('text/html');
          tables[tbl] = { exists: isValidJsonResponse, status: r.status };
        } catch {
          tables[tbl] = { exists: false, status: 0 };
        }
      })
    );

    const allTablesReady = tableNames.every((t) => tables[t]?.exists);
    if (tables.vegetables?.exists) {
      this.supabaseConnected = true;
    }

    return {
      projectUrl: url,
      projectRef,
      tables,
      allTablesReady,
      aiConfigured: Boolean(
        process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY.trim() &&
          process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
      sessionSecretConfigured: Boolean(
        process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
      ),
      paymentAccounts: {
        jazzCashMerchant: Boolean(this.settings.jazzCashAccount && this.settings.jazzCashTillId),
        jazzCashPersonal: Boolean(this.settings.jazzCashPersonalAccount?.trim()),
        easypaisa: Boolean(this.settings.easypaisaAccount?.trim()),
        bankAlfalah: Boolean(this.settings.bankAccountNumber),
      },
    };
  }

  public async syncAllToSupabase(): Promise<{
    ok: boolean;
    syncedOrders: number;
    syncedRiders: number;
    syncedCoupons: number;
    syncedLoyalty: number;
    syncedSettings: boolean;
    missingTables: string[];
  }> {
    const status = await this.checkSupabaseLaunchStatus();
    const missingTables = Object.entries(status.tables)
      .filter(([, info]) => !info.exists)
      .map(([name]) => name);

    let syncedSettings = false;
    if (status.tables.shop_settings?.exists) {
      try {
        const { url, headers } = getSupabaseHeaders(true);
        const r = await fetch(`${url}/rest/v1/shop_settings?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            id: 1,
            shop_name: this.settings.shopNameEn,
            shop_name_ur: this.settings.shopNameUr,
            whatsapp: this.settings.whatsapp,
            open_hours: this.settings.openHours || '7 AM – 10 PM',
            announcement_active: Boolean(this.settings.announcementActive),
            announcement_ur: this.settings.announcementUr || '',
            announcement_en: this.settings.announcementEn || '',
            base_delivery_fee: this.settings.baseDeliveryFee,
            base_km: this.settings.baseKm,
            extra_km_rate: this.settings.extraKmRate,
            loyalty_enabled: this.settings.loyaltyEnabled !== false,
            loyalty_points_per_100: this.settings.loyaltyPointsPer100Rs ?? 5,
            loyalty_point_value_rs: this.settings.loyaltyPointValueRs ?? 1,
            jazzcash_account: this.settings.jazzCashAccount,
            jazzcash_till_id: this.settings.jazzCashTillId,
            jazzcash_iban: this.settings.jazzCashIban,
            jazzcash_personal_account: this.settings.jazzCashPersonalAccount || '',
            jazzcash_personal_title: this.settings.jazzCashPersonalTitle || 'HAMID ALI',
            easypaisa_account: this.settings.easypaisaAccount || '',
            easypaisa_title: this.settings.easypaisaTitle || 'HAMID ALI',
            raast_id: this.settings.raastId,
            bank_name: this.settings.bankName,
            bank_account_title: this.settings.bankAccountTitle,
            bank_account_number: this.settings.bankAccountNumber,
            bank_iban: this.settings.bankIban,
            require_delivery_otp: Boolean(this.settings.requireDeliveryOtp),
            updated_at: new Date().toISOString(),
          }),
        });
        syncedSettings = r.ok;
      } catch {}
    }

    let syncedRiders = 0;
    if (status.tables.riders?.exists) {
      const { url, headers } = getSupabaseHeaders(true);
      for (const rdr of this.riders) {
        try {
          const r = await fetch(`${url}/rest/v1/riders?on_conflict=id`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
              id: rdr.id,
              name: rdr.name,
              phone: rdr.phone,
              vehicle_type: rdr.vehicle_type,
              vehicle_reg: rdr.vehicle_reg,
              is_active: rdr.is_active,
              current_lat: rdr.current_location?.lat ?? null,
              current_lng: rdr.current_location?.lng ?? null,
              location_updated_at: rdr.current_location?.updated_at ?? null,
            }),
          });
          if (r.ok) syncedRiders += 1;
        } catch {}
      }
    }

    let syncedOrders = 0;
    if (status.tables.orders?.exists) {
      for (const ord of this.orders) {
        const ok = await this.syncOrderToSupabase(ord);
        if (ok) syncedOrders += 1;
      }
    }

    let syncedCoupons = 0;
    if (status.tables.coupons?.exists) {
      for (const cpn of this.coupons) {
        const ok = await this.syncCouponToSupabase(cpn);
        if (ok) syncedCoupons += 1;
      }
    }

    let syncedLoyalty = 0;
    if (status.tables.loyalty_accounts?.exists) {
      for (const acc of Object.values(this.loyaltyAccounts)) {
        const ok = await this.syncLoyaltyToSupabase(acc);
        if (ok) syncedLoyalty += 1;
      }
    }

    if (missingTables.length === 0) {
      this.addAudit(
        'owner',
        'Hamid Ali',
        'SUPABASE_FULL_SYNC',
        undefined,
        `Synced ${syncedOrders} orders, ${syncedRiders} riders, ${syncedCoupons} coupons, ${syncedLoyalty} loyalty accounts to Supabase`
      );
    }

    return {
      ok: missingTables.length === 0,
      syncedOrders,
      syncedRiders,
      syncedCoupons,
      syncedLoyalty,
      syncedSettings,
      missingTables,
    };
  }
}

export const db = new DatabaseStore();
