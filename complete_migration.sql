-- ============================================================================
-- Muslim Vegetable and Fruit Shop (Khanewal) — Safe Additive Migration & RLS
-- Preserves existing `public.vegetables` table and rows completely!
-- Authorized Owner Email: hamidalinoafair@gmail.com
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function checking if authenticated JWT belongs strictly to sole owner
CREATE OR REPLACE FUNCTION public.is_shop_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE((auth.jwt() ->> 'email') = 'hamidalinoafair@gmail.com', false);
$$;

-- 1. Safely enhance existing `public.vegetables` table (keeps all existing data intact)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vegetables'
  ) THEN
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS urdu_name text;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS category text DEFAULT 'vegetables';
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS stock_quantity numeric DEFAULT 50;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS is_out_of_stock boolean DEFAULT false;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS cost_price numeric;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS previous_price numeric;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS is_offer boolean DEFAULT false;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS is_seasonal boolean DEFAULT false;
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS season_tag text DEFAULT 'all_year';
    ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  ELSE
    CREATE TABLE public.vegetables (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      price numeric NOT NULL CHECK (price >= 0),
      unit text DEFAULT 'Kg',
      urdu_name text,
      category text DEFAULT 'vegetables',
      stock_quantity numeric DEFAULT 50 CHECK (stock_quantity >= 0),
      is_out_of_stock boolean DEFAULT false,
      cost_price numeric,
      previous_price numeric,
      is_offer boolean DEFAULT false,
      is_seasonal boolean DEFAULT false,
      season_tag text DEFAULT 'all_year',
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.vegetables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read vegetables" ON public.vegetables;
CREATE POLICY "Public read vegetables"
  ON public.vegetables FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owner insert vegetables" ON public.vegetables;
CREATE POLICY "Owner insert vegetables"
  ON public.vegetables FOR INSERT
  TO authenticated
  WITH CHECK (public.is_shop_owner());

DROP POLICY IF EXISTS "Owner update vegetables" ON public.vegetables;
CREATE POLICY "Owner update vegetables"
  ON public.vegetables FOR UPDATE
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

DROP POLICY IF EXISTS "Owner delete vegetables" ON public.vegetables;
CREATE POLICY "Owner delete vegetables"
  ON public.vegetables FOR DELETE
  TO authenticated
  USING (public.is_shop_owner());

-- 2. Riders Table (Khanewal Fleet)
CREATE TABLE IF NOT EXISTS public.riders (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  vehicle_type text NOT NULL,
  vehicle_reg text,
  is_active boolean DEFAULT true,
  current_lat numeric,
  current_lng numeric,
  location_updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manage riders" ON public.riders;
CREATE POLICY "Owner manage riders"
  ON public.riders FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  idempotency_key text UNIQUE,
  user_id uuid REFERENCES auth.users(id),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  delivery_address text NOT NULL DEFAULT '',
  delivery_area text NOT NULL DEFAULT '',
  delivery_lat numeric,
  delivery_lng numeric,
  delivery_distance_km numeric NOT NULL DEFAULT 0,
  distance_source text NOT NULL DEFAULT 'unverified',
  delivery_slot text,
  notes text,
  subtotal numeric NOT NULL,
  delivery_fee numeric NOT NULL DEFAULT 0,
  discount numeric DEFAULT 0,
  coupon_code text,
  loyalty_points_used numeric DEFAULT 0,
  loyalty_points_earned numeric DEFAULT 0,
  loyalty_points_awarded boolean DEFAULT false,
  total_amount numeric NOT NULL,
  payment_method text NOT NULL,
  payment_status text NOT NULL DEFAULT 'Pending Verification',
  order_status text NOT NULL DEFAULT 'Order Received',
  rejection_reason text,
  payment_reference text,
  payment_datetime timestamptz,
  assigned_rider_id text REFERENCES public.riders(id),
  delivery_otp text,
  otp_verified boolean DEFAULT false,
  status_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_discount_rs numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_eligible_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_points_refunded boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_points_reversed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_restored boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_usage_recorded boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_usage_restored boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (order_status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers create orders" ON public.orders;
CREATE POLICY "Customers create orders"
  ON public.orders FOR INSERT
  WITH CHECK (
    public.is_shop_owner() OR (
      order_status <> 'Delivered'
      AND COALESCE(loyalty_points_awarded, false) = false
      AND COALESCE(loyalty_points_earned, 0) = 0
    )
  );

DROP POLICY IF EXISTS "Owner or owning user read orders" ON public.orders;
CREATE POLICY "Owner or owning user read orders"
  ON public.orders FOR SELECT
  USING (public.is_shop_owner() OR (auth.uid() IS NOT NULL AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner update orders" ON public.orders;
CREATE POLICY "Owner update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

DROP POLICY IF EXISTS "Owner manage orders" ON public.orders;
CREATE POLICY "Owner manage orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- 4. Order Items (Freezes historical unit price forever)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text NOT NULL,
  urdu_name text,
  unit_price numeric NOT NULL,
  unit text NOT NULL,
  purchase_type text NOT NULL,
  weight_grams numeric NOT NULL,
  amount_paid numeric,
  quantity numeric NOT NULL,
  subtotal numeric NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner read order items" ON public.order_items;
CREATE POLICY "Owner read order items"
  ON public.order_items FOR SELECT
  USING (
    public.is_shop_owner() OR
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner manage order items" ON public.order_items;
CREATE POLICY "Owner manage order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- 5. Private Payment Receipts (Owner-only visibility for uploaded proofs)
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  bank_name text,
  account_number text,
  sender_name text NOT NULL,
  transaction_ref text NOT NULL,
  amount_paid numeric NOT NULL,
  payment_datetime timestamptz,
  storage_object_path text,
  status text NOT NULL DEFAULT 'pending',
  verified_by text,
  verified_at timestamptz,
  verification_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insert receipt proof" ON public.payment_receipts;
CREATE POLICY "Insert receipt proof"
  ON public.payment_receipts FOR INSERT
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "Owner manage receipts" ON public.payment_receipts;
CREATE POLICY "Owner manage receipts"
  ON public.payment_receipts FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- 6. Expenses, Coupons, Complaints, Reviews & Audit Logs
CREATE TABLE IF NOT EXISTS public.expenses (
  id text PRIMARY KEY,
  title text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  category text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manage expenses" ON public.expenses;
CREATE POLICY "Owner manage expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

CREATE TABLE IF NOT EXISTS public.coupons (
  code text PRIMARY KEY,
  discount_type text NOT NULL,
  value numeric NOT NULL,
  min_order numeric DEFAULT 0,
  active boolean DEFAULT true,
  description text,
  assigned_phones text[] DEFAULT '{}',
  expires_at timestamptz,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  per_customer_limit integer,
  allow_loyalty_stacking boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses integer;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS uses_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS per_customer_limit integer;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS allow_loyalty_stacking boolean NOT NULL DEFAULT false;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons"
  ON public.coupons FOR SELECT
  USING (active = true OR public.is_shop_owner());

DROP POLICY IF EXISTS "Owner manage coupons" ON public.coupons;
CREATE POLICY "Owner manage coupons"
  ON public.coupons FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

CREATE TABLE IF NOT EXISTS public.complaints (
  id text PRIMARY KEY,
  order_id text,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  owner_reply text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public create complaint" ON public.complaints;
CREATE POLICY "Public create complaint"
  ON public.complaints FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS "Owner manage complaints" ON public.complaints;
CREATE POLICY "Owner manage complaints"
  ON public.complaints FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

CREATE TABLE IF NOT EXISTS public.reviews (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  user_name text NOT NULL,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  freshness_score integer CHECK (freshness_score BETWEEN 1 AND 5),
  comment text NOT NULL,
  verified_purchase boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert reviews" ON public.reviews;
CREATE POLICY "Public insert reviews" ON public.reviews FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  actor_role text NOT NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  target_id text,
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner read audit logs" ON public.audit_logs;
CREATE POLICY "Owner read audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_shop_owner());

-- 7. Private Supabase Storage bucket for payment receipt screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone upload receipt screenshot" ON storage.objects;
CREATE POLICY "Anyone upload receipt screenshot"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-receipts');

DROP POLICY IF EXISTS "Owner view receipt screenshots" ON storage.objects;
CREATE POLICY "Owner view receipt screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-receipts' AND public.is_shop_owner());

-- 8. Real-Time Rider GPS Delivery Locations Table
CREATE TABLE IF NOT EXISTS public.delivery_locations (
  order_id text PRIMARY KEY,
  rider_id text NOT NULL,
  rider_name text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy numeric,
  speed numeric,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_locations_rider ON public.delivery_locations (rider_id);
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active delivery locations" ON public.delivery_locations;
CREATE POLICY "Public read active delivery locations"
  ON public.delivery_locations FOR SELECT
  USING (is_active = true OR public.is_shop_owner());

DROP POLICY IF EXISTS "Owner manage delivery locations" ON public.delivery_locations;
CREATE POLICY "Owner manage delivery locations"
  ON public.delivery_locations FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- 9. Shop Settings & Payment Accounts Table
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id integer PRIMARY KEY DEFAULT 1,
  shop_name text NOT NULL DEFAULT 'Muslim Vegetable & Fruit Shop',
  shop_name_ur text DEFAULT 'مسلم ویجیٹیبل اینڈ فروٹ شاپ',
  whatsapp text DEFAULT '923007466664',
  open_hours text DEFAULT '7 AM – 10 PM',
  announcement_active boolean DEFAULT false,
  announcement_ur text DEFAULT '',
  announcement_en text DEFAULT '',
  base_delivery_fee numeric DEFAULT 100,
  base_km numeric DEFAULT 3,
  extra_km_rate numeric DEFAULT 30,
  loyalty_enabled boolean DEFAULT true,
  loyalty_points_per_100 numeric DEFAULT 5,
  loyalty_point_value_rs numeric DEFAULT 1,
  jazzcash_account text,
  jazzcash_till_id text,
  jazzcash_iban text,
  jazzcash_personal_account text,
  jazzcash_personal_title text,
  easypaisa_account text,
  easypaisa_title text,
  raast_id text,
  bank_name text,
  bank_account_title text,
  bank_account_number text,
  bank_iban text,
  require_delivery_otp boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read shop settings" ON public.shop_settings;
CREATE POLICY "Public read shop settings"
  ON public.shop_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owner manage shop settings" ON public.shop_settings;
CREATE POLICY "Owner manage shop settings"
  ON public.shop_settings FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

-- Enable Supabase Realtime on live tracking tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_locations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Loyalty Accounts & Auditable Loyalty Transaction Ledger (Protected by Strict RLS)
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  user_phone text PRIMARY KEY,
  phone_digits10 text,
  user_id uuid REFERENCES auth.users(id),
  user_name text NOT NULL DEFAULT 'Customer',
  points_balance numeric NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points numeric NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  cumulative_purchases numeric NOT NULL DEFAULT 0 CHECK (cumulative_purchases >= 0),
  successful_purchases_count integer NOT NULL DEFAULT 0 CHECK (successful_purchases_count >= 0),
  tier text NOT NULL DEFAULT 'None' CHECK (tier IN ('None', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_digits10 ON public.loyalty_accounts (phone_digits10);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_user_id ON public.loyalty_accounts (user_id);

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage loyalty accounts" ON public.loyalty_accounts;
CREATE POLICY "Owner manage loyalty accounts"
  ON public.loyalty_accounts FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

DROP POLICY IF EXISTS "Users read own loyalty account" ON public.loyalty_accounts;
CREATE POLICY "Users read own loyalty account"
  ON public.loyalty_accounts FOR SELECT
  TO authenticated
  USING (public.is_shop_owner() OR (auth.uid() IS NOT NULL AND user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id text PRIMARY KEY,
  user_phone text NOT NULL REFERENCES public.loyalty_accounts(user_phone) ON DELETE CASCADE,
  phone_digits10 text,
  order_id text,
  points numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('earned', 'redeemed', 'refunded', 'reversed')),
  description text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_phone ON public.loyalty_transactions (user_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_digits10 ON public.loyalty_transactions (phone_digits10, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_order ON public.loyalty_transactions (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_tx_order_type
  ON public.loyalty_transactions (order_id, type)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage loyalty transactions" ON public.loyalty_transactions;
CREATE POLICY "Owner manage loyalty transactions"
  ON public.loyalty_transactions FOR ALL
  TO authenticated
  USING (public.is_shop_owner())
  WITH CHECK (public.is_shop_owner());

DROP POLICY IF EXISTS "Users read own loyalty transactions" ON public.loyalty_transactions;
CREATE POLICY "Users read own loyalty transactions"
  ON public.loyalty_transactions FOR SELECT
  TO authenticated
  USING (
    public.is_shop_owner() OR
    EXISTS (
      SELECT 1 FROM public.loyalty_accounts a
      WHERE a.user_phone = loyalty_transactions.user_phone AND a.user_id = auth.uid()
    )
  );

-- Atomic Server-Side Helper Functions & RPCs for Loyalty
CREATE OR REPLACE FUNCTION public.compute_loyalty_tier(
  p_cumulative numeric,
  p_success_count integer,
  p_existing text DEFAULT 'None',
  p_allow_recalc_down boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_earned text := 'None';
  v_rank_earned integer := 0;
  v_rank_existing integer := 0;
BEGIN
  IF COALESCE(p_cumulative, 0) >= 100000 THEN
    v_earned := 'Diamond';
    v_rank_earned := 4;
  ELSIF COALESCE(p_cumulative, 0) >= 60000 THEN
    v_earned := 'Platinum';
    v_rank_earned := 3;
  ELSIF COALESCE(p_cumulative, 0) >= 30000 THEN
    v_earned := 'Gold';
    v_rank_earned := 2;
  ELSIF COALESCE(p_success_count, 0) >= 1 THEN
    v_earned := 'Silver';
    v_rank_earned := 1;
  END IF;

  IF p_allow_recalc_down THEN
    RETURN v_earned;
  END IF;

  v_rank_existing := CASE COALESCE(p_existing, 'None')
    WHEN 'Diamond' THEN 4
    WHEN 'Platinum' THEN 3
    WHEN 'Gold' THEN 2
    WHEN 'Silver' THEN 1
    ELSE 0
  END;

  IF v_rank_existing > v_rank_earned THEN
    RETURN p_existing;
  END IF;
  RETURN v_earned;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_phone text,
  p_order_id text,
  p_points numeric,
  p_description text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_digits text := RIGHT(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
  v_acc public.loyalty_accounts%ROWTYPE;
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_acc
  FROM public.loyalty_accounts
  WHERE user_phone = p_phone OR (length(v_digits) >= 9 AND phone_digits10 = v_digits)
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_acc.points_balance < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty points balance';
  END IF;

  UPDATE public.loyalty_accounts
  SET points_balance = points_balance - p_points,
      updated_at = now()
  WHERE user_phone = v_acc.user_phone;

  INSERT INTO public.loyalty_transactions (id, user_phone, phone_digits10, order_id, points, type, description)
  VALUES (
    'lh-red-' || COALESCE(p_order_id, extract(epoch from now())::text),
    v_acc.user_phone,
    v_digits,
    p_order_id,
    -p_points,
    'redeemed',
    COALESCE(p_description, 'Redeemed ' || p_points::text || ' pts on Order #' || COALESCE(p_order_id, ''))
  )
  ON CONFLICT DO NOTHING;

  RETURN v_acc.points_balance - p_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_loyalty_for_order(
  p_order_id text,
  p_points_per_100 numeric DEFAULT 5,
  p_point_value_rs numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ord public.orders%ROWTYPE;
  v_digits text;
  v_acc public.loyalty_accounts%ROWTYPE;
  v_eligible numeric;
  v_earned numeric;
  v_new_tier text;
BEGIN
  SELECT * INTO v_ord FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_ord.loyalty_points_awarded = true OR v_ord.order_status <> 'Delivered' OR v_ord.payment_status = 'Rejected' THEN
    RETURN COALESCE(v_ord.loyalty_points_earned, 0);
  END IF;

  v_digits := RIGHT(regexp_replace(COALESCE(v_ord.customer_phone, ''), '\D', '', 'g'), 10);
  v_eligible := GREATEST(
    0,
    ROUND(
      COALESCE(v_ord.subtotal, 0)
      - COALESCE(v_ord.discount, 0)
      - COALESCE(NULLIF(v_ord.loyalty_discount_rs, 0), COALESCE(v_ord.loyalty_points_used, 0) * COALESCE(p_point_value_rs, 1))
    )
  );
  v_earned := FLOOR(v_eligible / 100.0) * COALESCE(p_points_per_100, 5);

  SELECT * INTO v_acc
  FROM public.loyalty_accounts
  WHERE user_phone = v_ord.customer_phone OR (length(v_digits) >= 9 AND phone_digits10 = v_digits)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.loyalty_accounts (user_phone, phone_digits10, user_id, user_name, points_balance, lifetime_points, cumulative_purchases, successful_purchases_count, tier)
    VALUES (v_ord.customer_phone, v_digits, v_ord.user_id, COALESCE(v_ord.customer_name, 'Customer'), 0, 0, 0, 0, 'None')
    RETURNING * INTO v_acc;
  END IF;

  v_new_tier := public.compute_loyalty_tier(
    v_acc.cumulative_purchases + v_eligible,
    v_acc.successful_purchases_count + 1,
    v_acc.tier,
    false
  );

  UPDATE public.loyalty_accounts
  SET points_balance = points_balance + v_earned,
      lifetime_points = lifetime_points + v_earned,
      cumulative_purchases = cumulative_purchases + v_eligible,
      successful_purchases_count = successful_purchases_count + 1,
      tier = v_new_tier,
      updated_at = now()
  WHERE user_phone = v_acc.user_phone;

  IF v_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (id, user_phone, phone_digits10, order_id, points, type, description)
    VALUES (
      'lh-earn-' || p_order_id,
      v_acc.user_phone,
      v_digits,
      p_order_id,
      v_earned,
      'earned',
      'Earned ' || v_earned::text || ' pts on delivered Order #' || p_order_id || ' (Eligible: Rs.' || v_eligible::text || ')'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.orders
  SET loyalty_points_earned = v_earned,
      loyalty_eligible_amount = v_eligible,
      loyalty_points_awarded = true,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_earned;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_or_refund_loyalty_for_order(
  p_order_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ord public.orders%ROWTYPE;
  v_digits text;
  v_acc public.loyalty_accounts%ROWTYPE;
  v_rev_eligible numeric;
  v_new_cum numeric;
  v_new_count integer;
  v_new_tier text;
BEGIN
  SELECT * INTO v_ord FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_ord.order_status <> 'Cancelled' THEN
    RETURN false;
  END IF;

  v_digits := RIGHT(regexp_replace(COALESCE(v_ord.customer_phone, ''), '\D', '', 'g'), 10);
  SELECT * INTO v_acc
  FROM public.loyalty_accounts
  WHERE user_phone = v_ord.customer_phone OR (length(v_digits) >= 9 AND phone_digits10 = v_digits)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_ord.loyalty_points_used, 0) > 0 AND COALESCE(v_ord.loyalty_points_refunded, false) = false THEN
    UPDATE public.loyalty_accounts
    SET points_balance = points_balance + v_ord.loyalty_points_used,
        updated_at = now()
    WHERE user_phone = v_acc.user_phone;

    INSERT INTO public.loyalty_transactions (id, user_phone, phone_digits10, order_id, points, type, description)
    VALUES (
      'lh-ref-' || p_order_id,
      v_acc.user_phone,
      v_digits,
      p_order_id,
      v_ord.loyalty_points_used,
      'refunded',
      'Refunded ' || v_ord.loyalty_points_used::text || ' redeemed pts (Order #' || p_order_id || ' Cancelled)'
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.orders SET loyalty_points_refunded = true WHERE id = p_order_id;
  END IF;

  IF COALESCE(v_ord.loyalty_points_awarded, false) = true AND COALESCE(v_ord.loyalty_points_reversed, false) = false THEN
    SELECT * INTO v_acc FROM public.loyalty_accounts WHERE user_phone = v_acc.user_phone FOR UPDATE;
    v_rev_eligible := COALESCE(v_ord.loyalty_eligible_amount, 0);
    v_new_cum := GREATEST(0, v_acc.cumulative_purchases - v_rev_eligible);
    v_new_count := GREATEST(0, v_acc.successful_purchases_count - 1);
    v_new_tier := public.compute_loyalty_tier(v_new_cum, v_new_count, v_acc.tier, true);

    UPDATE public.loyalty_accounts
    SET points_balance = GREATEST(0, points_balance - COALESCE(v_ord.loyalty_points_earned, 0)),
        lifetime_points = GREATEST(0, lifetime_points - COALESCE(v_ord.loyalty_points_earned, 0)),
        cumulative_purchases = v_new_cum,
        successful_purchases_count = v_new_count,
        tier = v_new_tier,
        updated_at = now()
    WHERE user_phone = v_acc.user_phone;

    IF COALESCE(v_ord.loyalty_points_earned, 0) > 0 THEN
      INSERT INTO public.loyalty_transactions (id, user_phone, phone_digits10, order_id, points, type, description)
      VALUES (
        'lh-rev-' || p_order_id,
        v_acc.user_phone,
        v_digits,
        p_order_id,
        -v_ord.loyalty_points_earned,
        'reversed',
        'Reversed ' || v_ord.loyalty_points_earned::text || ' earned pts (Order #' || p_order_id || ' Cancelled)'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.orders
    SET loyalty_points_reversed = true,
        loyalty_points_awarded = false,
        loyalty_points_earned = 0
    WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$;


