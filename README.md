# Muslim Vegetable and Fruit Shop (مسلم ویجیٹیبل اینڈ فروٹ شاپ)

Location: **Chowk Jaswant Nagar Road, Camp Chowk, Khanewal, Punjab, Pakistan**  
Shop WhatsApp: **+92 300 7466664**  
Authorized Owner Account: **hamidalinoafair@gmail.com**

---

## 1. Key Features
- **Bilingual Urdu-First (RTL) & English (LTR)** storefront and management consoles.
- **Live Supabase Catalog (`public.vegetables`)**: Preserves existing database rows and syncs live prices without inventing rates.
- **Flexible Weight (`g`/`Kg`) & Any Rupee Amount (`Rs 10`, `Rs 20`, `Rs 50`, etc.)** purchasing.
- **Khanewal-Only Road-Route Delivery**:
  - `<= 5 km`: **Rs. 150**
  - `> 5 km`: **Rs. 150 + Rs. 30 × Math.ceil(distanceKm - 5)**
  - Uses OSRM driving route distance for GPS coordinates and verified Khanewal neighborhoods. Outside-city addresses are rejected.
- **Payments & Private Verification**:
  - Cash on Delivery, JazzCash (`HAMID Shop` / `01007466664` / TILL `984994440`), Raast ID (`01007466664`), and Bank Alfalah (`HAMID ALI` / `01841010026182` / IBAN `PK56ALFH0184001010026182`).
  - All online payments start as **Pending Verification**; receipt screenshots are stored privately outside `public/` until reviewed by the Owner.
- **6-Stage Customer Tracking & Order History** (`TrackOrderModal` & `OrderHistoryModal`).
- **Owner-Only Admin Dashboard & Rider Portal**:
  - Separate scrypt password vault + optional 6-digit TOTP 2FA + Supabase Auth owner verification.
  - Separate Rider PIN login showing only orders assigned to that rider.
  - Free-tier Gemini AI (`gemini-4-hydrogen`) voice/text assistant with confirmation cards.
- **PWA & Offline Pending Synchronization**:
  - Installable on Android, iPhone, and Desktop with offline catalog caching and automatic online revalidation queue.

---

## 2. Database Setup (Supabase SQL Migration)
Run the contents of `supabase/complete_migration.sql` inside your Supabase SQL Editor (`https://supabase.com/dashboard` → SQL Editor). It safely preserves your existing `public.vegetables` table and rows while adding RLS policies, `orders`, `order_items`, `payment_receipts`, `riders`, `expenses`, `coupons`, `complaints`, `reviews`, `audit_logs`, and private storage bucket `payment-receipts`.

---

## 3. Running Locally or on a Node.js Host (Full-Stack Mode)
```bash
npm install
cp .env.example .env   # Fill GEMINI_API_KEY, optional OWNER_ADMIN_PASSWORD, etc.
npm run build
npm run start          # Runs Express + built Vite PWA on port 3000
```

---

## 4. Deploying the Clean ZIP to GitHub & GitHub Pages
1. Open the **Owner Admin Panel** → **Security & ZIP** tab → click **Download Clean Project ZIP (.zip)**.
   *(Note: `.env`, `server/data/`, `node_modules`, and private screenshots are automatically excluded from this ZIP. All 33 produce images, HAMID Shop QR poster, and `supabase/complete_migration.sql` are preserved inside.)*
2. Unzip on your computer, open Terminal inside the folder (or upload all files directly to your GitHub repository), and push to `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial Muslim Vegetable and Fruit Shop PWA"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/muslim-vegetable-fruit-shop.git
   git push -u origin main
   ```
3. On GitHub repository page:
   - Go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
   - The included `.github/workflows/deploy-pages.yml` (`npm install` + `npm run build`) automatically builds and publishes your Vite PWA storefront to `https://YOUR_USERNAME.github.io/muslim-vegetable-fruit-shop/`.
4. **Honest GitHub Pages vs Full-Stack Node.js Note**:
   - **GitHub Pages (Static Host)**: Supports the complete bilingual Urdu/English storefront, custom multi-Kg (`250g–5Kg+`) & custom rupee (`Rs 10+`) calculator, single Cart drawer, Khanewal delivery fee calculator (`Rs 150` + `Rs 30/km`), direct read/order insert with Supabase (once SQL tables are run), offline PWA caching, and full WhatsApp bill dispatch (`+923007466664`).
   - **Render.com Free Web Service (Recommended Free Full-Stack Launch)**:
     1. Run `supabase/complete_migration.sql` once in your **Supabase SQL Editor**.
     2. Push this Clean ZIP to GitHub.
     3. Sign in to [Render.com](https://render.com) with GitHub → **New +** → **Blueprint** (or **Web Service**) → pick your repository (`render.yaml` is included automatically: `buildCommand: npm install && npm run build`, `startCommand: npx tsx server.ts`).
     4. Add your secrets in Render **Environment Variables**: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and your preferred `OWNER_ADMIN_PASSWORD` (so your Admin login stays persistent across free-tier sleeps).
     5. Click **Deploy** — you get a free live full-stack `https://...onrender.com` URL with Admin Panel, AI Assistant, Live Two-Device Rider GPS Tracking, WhatsApp billing, and Supabase sync. *(Free Render tier sleeps after 15 mins of inactivity; first visit takes ~30–50s to wake.)*

---

## 5. Installing on Android / iPhone (PWA)
- **Android (Chrome)**: Open your published site → Tap **⋮ Menu** → **Install App** (or tap the **Install App** button in the top navigation bar).
- **iPhone (Safari)**: Open your published site → Tap **Share** → **Add to Home Screen** → **Add**.
