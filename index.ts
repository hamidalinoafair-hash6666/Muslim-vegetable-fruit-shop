export type AppLanguage = 'ur' | 'en';

export type ProductCategory =
  | 'vegetables'
  | 'fruits'
  | 'herbs'
  | 'organic_staples'
  | 'seasonal_deals';

export type SeasonTag = 'summer' | 'winter' | 'all_year';

export interface Product {
  id: string;
  supabase_id?: number;
  name: string;
  urdu_name?: string;
  name_en?: string;
  category: ProductCategory;
  price: number; // Current selling price in PKR per unit (usually Kg)
  previous_price?: number;
  original_price?: number; // Compare-at / pre-offer price
  cost_price?: number | null; // Actual wholesale purchase cost (owner-entered only; null if unrecorded)
  price_source?: 'supabase_live' | 'owner_manual' | 'mandi_verified';
  price_updated_at?: string;
  unit: string; // 'Kg', 'Dozen', 'Fee gutty 1 adad', 'Kg with patty', etc.
  stock_quantity: number;
  min_order_quantity: number;
  max_order_quantity: number;
  image_url: string;
  emoji?: string;
  description: string;
  description_ur?: string;
  organic: boolean;
  is_seasonal?: boolean;
  season_tag?: SeasonTag;
  is_offer?: boolean;
  is_top_selling?: boolean;
  is_recommended?: boolean;
  farm_origin: string;
  is_out_of_stock: boolean;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export type PurchaseType = 'weight' | 'amount';

export interface CartItem {
  cartItemId: string;
  product: Product;
  purchaseType: PurchaseType;
  weightGrams: number; // Grams for weight units, or scaled 1000=1 unit for dozen/bunch
  amountPaid: number; // Entered rupee amount if purchaseType === 'amount'
  quantity: number; // Units (weightGrams / 1000), used for stock deduction
  unitPrice: number; // Snapshot price per unit when added
  lineTotal: number; // Exact line item total in PKR
}

export type PaymentMethod =
  | 'JazzCash Merchant'
  | 'JazzCash Personal'
  | 'Easypaisa'
  | 'Cash on Delivery'
  | 'Bank Alfalah'
  | 'Raast ID'
  | 'JazzCash';

export type PaymentStatus =
  | 'Pending Verification'
  | 'Verified'
  | 'Rejected'
  | 'COD Pending'
  | 'Paid COD';

export type OrderStatus =
  | 'Order Received'
  | 'Order Accepted'
  | 'Order Confirmed'
  | 'Preparing'
  | 'Ready for Delivery'
  | 'Rider Assigned'
  | 'Picked Up'
  | 'On the Way'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export interface PaymentReceipt {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  bank_name: string;
  account_number: string;
  sender_name: string;
  transaction_ref: string;
  amount_paid: number;
  payment_datetime: string;
  has_receipt_image: boolean;
  receipt_image_url?: string; // Served ONLY via authenticated admin endpoint; omitted from public endpoints
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  urdu_name?: string;
  unit_price: number; // Historical snapshot price per unit at order time
  unit: string;
  purchase_type: PurchaseType;
  weight_grams: number;
  amount_paid?: number;
  quantity: number;
  subtotal: number;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  note: string;
  actor?: string;
}

export interface Order {
  id: string;
  idempotency_key?: string;
  user_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_area: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  delivery_distance_km: number;
  distance_source: 'osrm_road' | 'verified_sector_road' | 'owner_manual' | 'unverified';
  delivery_slot: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  manual_delivery_fee_override?: number;
  discount: number;
  coupon_code?: string;
  loyalty_points_used: number;
  loyalty_discount_rs?: number;
  loyalty_eligible_amount?: number;
  loyalty_points_earned: number;
  loyalty_points_awarded?: boolean;
  loyalty_points_refunded?: boolean;
  loyalty_points_reversed?: boolean;
  stock_restored?: boolean;
  coupon_usage_recorded?: boolean;
  coupon_usage_restored?: boolean;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  rejection_reason?: string;
  payment_reference?: string;
  payment_datetime?: string;
  receipt?: Omit<PaymentReceipt, 'receipt_image_url'>;
  assigned_rider_id?: string;
  assigned_rider_name?: string;
  assigned_rider_phone?: string;
  delivery_otp?: string;
  otp_verified?: boolean;
  dispatch_sequence?: number;
  estimated_delivery_time?: string;
  rider_live_location?: {
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number | null;
    updated_at: string;
  };
  status_history: OrderStatusHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface PendingOfflineOrder {
  local_id: string;
  idempotency_key: string;
  payload: any;
  saved_at: string;
  sync_status: 'pending_sync' | 'needs_reconfirmation' | 'sync_error';
  sync_error?: string;
  revalidation_diff?: {
    old_subtotal: number;
    new_subtotal: number;
    old_delivery_fee: number;
    new_delivery_fee: number;
    old_total: number;
    new_total: number;
    changes: string[];
  };
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicle_type: 'Motorcycle (Insulated Box)' | 'Eco Van' | 'Cargo Rickshaw';
  vehicle_reg: string;
  pin_hash?: string; // Server-side only; stripped before sending to client
  current_location: {
    lat: number;
    lng: number;
    area_name: string;
    updated_at?: string;
  };
  is_active: boolean;
  assigned_orders_count: number;
  completed_deliveries: number;
}

export interface DeliveryStop {
  stop_number: number;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_area: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  items_summary: string;
  total_amount: number;
  distance_from_prev_km: number;
  estimated_arrival_minutes: number;
}

export interface OptimizedRoute {
  id: string;
  rider_id: string;
  rider_name: string;
  stops: DeliveryStop[];
  total_distance_km: number;
  estimated_duration_minutes: number;
  total_orders: number;
  created_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  user_name: string;
  user_email?: string;
  rating: number;
  freshness_score: number;
  comment: string;
  verified_purchase: boolean;
  created_at: string;
}

export interface LoyaltyAccount {
  user_phone: string;
  user_name: string;
  points_balance: number;
  lifetime_points: number;
  cumulative_purchases?: number;
  successful_purchases_count?: number;
  tier: 'None' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  history: {
    id: string;
    points: number;
    type: 'earned' | 'redeemed' | 'refunded' | 'reversed';
    order_id?: string;
    description: string;
    created_at: string;
  }[];
}

export interface Coupon {
  code: string;
  discount_type: 'fixed' | 'percent' | 'free_delivery';
  value: number;
  min_order: number;
  active: boolean;
  description: string;
  assigned_phones?: string[];
  expires_at?: string;
  max_uses?: number;
  uses_count?: number;
  per_customer_limit?: number;
  allow_loyalty_stacking?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: 'Wholesale Purchase' | 'Fuel & Delivery' | 'Packaging' | 'Rent & Utilities' | 'Other';
  date: string;
  notes?: string;
  created_at: string;
}

export interface CustomerComplaint {
  id: string;
  order_id?: string;
  customer_name: string;
  customer_phone: string;
  subject: string;
  message: string;
  status: 'open' | 'in_review' | 'resolved';
  owner_reply?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_role: 'owner' | 'rider' | 'customer' | 'system';
  actor_name: string;
  action: string;
  target_id?: string;
  details: string;
  ip_or_device?: string;
  created_at: string;
}

export interface DeliveryAreaOption {
  id: string;
  name: string;
  nameUr: string;
  lat: number;
  lng: number;
  roadDistanceKm: number;
}

export interface ShopSettings {
  shopNameUr: string;
  shopNameEn: string;
  locationUr: string;
  locationEn: string;
  whatsapp: string;
  openHours?: string;
  announcementActive?: boolean;
  announcementUr?: string;
  announcementEn?: string;
  baseDeliveryFee: number; // 100
  baseKm: number; // 3
  extraKmRate: number; // 30
  deliveryAreas?: DeliveryAreaOption[];
  loyaltyEnabled?: boolean;
  loyaltyPointsPer100Rs?: number;
  loyaltyPointValueRs?: number;
  jazzCashStoreName: string;
  jazzCashTitle: string;
  jazzCashAccount: string;
  jazzCashIban: string;
  jazzCashTillId: string;
  jazzCashUssd: string;
  jazzCashQrImage: string;
  jazzCashPersonalAccount?: string;
  jazzCashPersonalTitle?: string;
  easypaisaAccount?: string;
  easypaisaTitle?: string;
  raastId: string;
  bankName: string;
  bankBranch: string;
  bankBranchCode: string;
  bankSwiftCode: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
  bankIban: string;
  bankInstructionsUr: string;
  bankInstructionsEn: string;
  requireDeliveryOtp: boolean;
}

export interface CustomerDirectoryEntry {
  phone: string;
  name: string;
  ordersCount: number;
  deliveredOrdersCount: number;
  totalSpent: number;
  points_balance: number;
  lifetime_points: number;
  cumulative_purchases: number;
  successful_purchases_count: number;
  tier: LoyaltyAccount['tier'];
  lastOrderAt?: string;
  assignedCoupons: string[];
}

export interface IntegrationStatus {
  gemini: { configured: boolean; source: 'env' | 'vault' | 'none'; maskedPreview?: string };
  whatsappCloud: {
    configured: boolean;
    hasToken: boolean;
    hasPhoneNumberId: boolean;
    phoneNumberIdPreview?: string;
  };
  supabase: { url: string; anonKeyConfigured: boolean; serviceRoleConfigured: boolean };
  paymentGateways: {
    mode: 'manual_verification';
    jazzCashMerchantManual: boolean;
    jazzCashPersonalManual: boolean;
    easypaisaManual: boolean;
    bankAlfalahManual: boolean;
    raastManual: boolean;
    automatedApiConfigured: boolean;
  };
  appUrl: string;
}

export interface MarketingCampaign {
  id: string;
  title: string;
  message: string;
  target_audience: 'all_users' | 'gold_members' | 'recent_buyers';
  discount_code?: string;
  sent_at: string;
  sent_count: number;
}

export interface DatabaseBackup {
  id: string;
  timestamp: string;
  file_name: string;
  records_count: {
    products: number;
    orders: number;
    receipts: number;
    reviews: number;
  };
  size_kb: number;
  type: 'automated_daily' | 'manual';
  download_data_json: string;
  download_data_sql: string;
}
