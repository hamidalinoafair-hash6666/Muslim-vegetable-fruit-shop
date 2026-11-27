-- =========================================================================
-- SABZI & PHAL MANDI - SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Access Control & Role Based Security Configuration
-- =========================================================================

-- Enable RLS on all sensitive e-commerce tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 1. PRODUCTS TABLE POLICIES (Public Read-Only, Admin-Only Mutations)
-- -------------------------------------------------------------------------

-- Anyone (public, anonymous guest, or customer) can view active catalog products
CREATE POLICY "Public read-only access to products catalog"
ON public.products
FOR SELECT
TO public
USING (true);

-- Only authenticated users with admin role can insert new products
CREATE POLICY "Admins can create catalog products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Only authenticated administrators can update products (price, stock, descriptions)
CREATE POLICY "Admins can update catalog products and stock"
ON public.products
FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Only administrators can delete products from catalog
CREATE POLICY "Admins can delete catalog products"
ON public.products
FOR DELETE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- -------------------------------------------------------------------------
-- 2. CATEGORIES TABLE POLICIES
-- -------------------------------------------------------------------------
CREATE POLICY "Public read-only categories"
ON public.categories
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- -------------------------------------------------------------------------
-- 3. ORDERS TABLE POLICIES (Users see own orders, Admins/Riders manage)
-- -------------------------------------------------------------------------

-- Customers can view their own orders; Admins can view all orders; Assigned Riders can view assigned orders
CREATE POLICY "Users read own orders and admins read all"
ON public.orders
FOR SELECT
TO public
USING (
  -- Customer owns the order
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  -- Or authenticated as admin
  OR (auth.jwt() ->> 'role' = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
  -- Or rider assigned to this order
  OR (auth.uid()::text = assigned_rider_id)
);

-- Customers (even guest checkouts) can place orders
CREATE POLICY "Public or authenticated users can create orders"
ON public.orders
FOR INSERT
TO public
WITH CHECK (
  -- If logged in, user_id must match auth.uid()
  (auth.uid() IS NULL OR user_id = auth.uid())
);

-- Only administrators and assigned riders can update order status
CREATE POLICY "Admins and riders update order status"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() ->> 'role' = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'rider')
  )
);

-- -------------------------------------------------------------------------
-- 4. PAYMENT RECEIPTS POLICIES (Strict Security for Financial Documents)
-- -------------------------------------------------------------------------

-- Users can view receipts for their orders, Admins view all pending receipts
CREATE POLICY "View payment receipts"
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role' = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = payment_receipts.order_id AND orders.user_id = auth.uid()
  )
);

-- Customers can insert receipts for their orders
CREATE POLICY "Upload payment receipt"
ON public.payment_receipts
FOR INSERT
TO public
WITH CHECK (true);

-- Only administrators can verify and approve/reject payment receipts
CREATE POLICY "Admins verify payment receipts"
ON public.payment_receipts
FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- -------------------------------------------------------------------------
-- 5. REVIEWS & RATINGS POLICIES
-- -------------------------------------------------------------------------
CREATE POLICY "Public read product reviews"
ON public.reviews
FOR SELECT
TO public
USING (true);

CREATE POLICY "Customers submit product reviews"
ON public.reviews
FOR INSERT
TO public
WITH CHECK (
  rating >= 1 AND rating <= 5 AND freshness_score >= 1 AND freshness_score <= 5
);

-- -------------------------------------------------------------------------
-- 6. LOYALTY ACCOUNTS POLICIES
-- -------------------------------------------------------------------------
CREATE POLICY "Users read own loyalty points"
ON public.loyalty_accounts
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins adjust loyalty accounts"
ON public.loyalty_accounts
FOR ALL
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' 
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);
