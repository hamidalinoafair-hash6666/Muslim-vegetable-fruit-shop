import {
  Product,
  ProductCategory,
  SeasonTag,
  Rider,
  Review,
  LoyaltyAccount,
  MarketingCampaign,
  ShopSettings,
  Coupon,
} from '../types';

export const BANK_DETAILS = {
  bank_name: 'Bank Alfalah',
  account_title: 'HAMID ALI',
  account_number: '01841010026182',
  iban: 'PK56ALFH0184001010026182',
  swift_code: 'ALFHPKKAXXX',
  branch: 'Khanewal Branch (Code: 0184)',
  branch_code: '0184',
  instructions:
    'Transfer the exact order amount to HAMID ALI (Bank Alfalah, Khanewal Branch) and submit your Transaction ID & optional receipt screenshot. All transfers remain Pending Verification until confirmed by the shop owner.',
  instructions_ur:
    'آرڈر کی رقم Bank Alfalah (حامد علی - خانیوال برانچ) میں منتقل کر کے ٹرانزیکشن ID اور رسید اپلوڈ کریں۔ تمام آن لائن ادائیگیاں مالک کی تصدیق تک Pending Verification رہیں گی۔',
};

export const JAZZCASH_CONFIG = {
  store_name: 'HAMID Shop',
  account_title: 'HAMID ALI',
  merchant_type: 'Vegetable & Fruit Shop',
  professional_account: '01007466664',
  iban: 'PK50JCMA1311921007466664',
  raast_id: '01007466664',
  till_id: '984994440',
  ussd_code: '*786*10#',
  qr_image_url: '/assets/aistudio/HAMID_Shop_20261117_112034_4079c0cb.png',
  support_number: '+923007466664',
  currency: 'PKR',
};

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shopNameUr: 'مسلم ویجیٹیبل اینڈ فروٹ شاپ',
  shopNameEn: 'Muslim Vegetable & Fruit Shop',
  locationUr: 'چوک جسونت نگر روڈ، کیمپ چوک، خانیوال، پنجاب، پاکستان',
  locationEn: 'Chowk Jaswant Nagar Road, Camp Chowk, Khanewal, Punjab, Pakistan',
  whatsapp: '923007466664',
  openHours: '7 AM – 10 PM',
  announcementActive: false,
  announcementUr: '',
  announcementEn: '',
  baseDeliveryFee: 100,
  baseKm: 3,
  extraKmRate: 30,
  loyaltyEnabled: true,
  loyaltyPointsPer100Rs: 5,
  loyaltyPointValueRs: 1,
  jazzCashStoreName: JAZZCASH_CONFIG.store_name,
  jazzCashTitle: JAZZCASH_CONFIG.account_title,
  jazzCashAccount: JAZZCASH_CONFIG.professional_account,
  jazzCashIban: JAZZCASH_CONFIG.iban,
  jazzCashTillId: JAZZCASH_CONFIG.till_id,
  jazzCashUssd: JAZZCASH_CONFIG.ussd_code,
  jazzCashQrImage: JAZZCASH_CONFIG.qr_image_url,
  jazzCashPersonalAccount: '',
  jazzCashPersonalTitle: 'HAMID ALI',
  easypaisaAccount: '',
  easypaisaTitle: 'HAMID ALI',
  raastId: JAZZCASH_CONFIG.raast_id,
  bankName: BANK_DETAILS.bank_name,
  bankBranch: BANK_DETAILS.branch,
  bankBranchCode: BANK_DETAILS.branch_code,
  bankSwiftCode: BANK_DETAILS.swift_code,
  bankAccountTitle: BANK_DETAILS.account_title,
  bankAccountNumber: BANK_DETAILS.account_number,
  bankIban: BANK_DETAILS.iban,
  bankInstructionsUr: BANK_DETAILS.instructions_ur,
  bankInstructionsEn: BANK_DETAILS.instructions,
  requireDeliveryOtp: false,
};

export const SUPABASE_PROJECT_CONFIG = {
  project_name: "hamidalinoafair-hash6666's Project",
  project_url: 'https://gtqvpjwpsxdampdsdvry.supabase.co',
  publishable_key: 'sb_publishable_GfFX8mud_W3b39-f0p6jDg_M-EPAcu-',
  region: 'ap-southeast-1',
};

export function normalizeSupabaseUrl(raw?: string | null): string {
  const fallback = SUPABASE_PROJECT_CONFIG.project_url;
  if (!raw || typeof raw !== 'string') return fallback;
  let candidate = raw.trim().replace(/^["']|["']$/g, '');
  if (!candidate) return fallback;
  try {
    if (candidate.includes('google.com/url')) {
      const parsed = new URL(candidate);
      const unwrapped = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (unwrapped) candidate = unwrapped.trim();
    }
    const u = new URL(candidate);
    if (u.protocol === 'https:' && u.hostname.endsWith('.supabase.co')) {
      return u.origin;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

/**
 * Verified Khanewal City Delivery Areas with realistic road-route distances from Camp Chowk
 */
export const KHANEWAL_LOCATIONS = [
  {
    id: 'camp_chowk',
    nameUr: 'کیمپ چوک و چوک جسونت نگر (شاپ کے نزدیک)',
    name: 'Camp Chowk & Jaswant Nagar (Near Shop)',
    lat: 30.2985,
    lng: 71.9325,
    roadDistanceKm: 1.0,
  },
  {
    id: 'katchery_road',
    nameUr: 'کچہری روڈ، بلاک 1 تا 5، پرانی آبادی',
    name: 'Katchery Road, Blocks 1-5 & Old Town',
    lat: 30.3015,
    lng: 71.9368,
    roadDistanceKm: 2.4,
  },
  {
    id: 'railway_colony',
    nameUr: 'ریلوے کالونی و ریلوے اسٹیشن ایریا',
    name: 'Railway Colony & Station Area',
    lat: 30.2922,
    lng: 71.9292,
    roadDistanceKm: 3.1,
  },
  {
    id: 'peoples_colony',
    nameUr: 'پیپلز کالونی و علامہ اقبال روڈ',
    name: 'Peoples Colony & Allama Iqbal Road',
    lat: 30.3055,
    lng: 71.9425,
    roadDistanceKm: 3.9,
  },
  {
    id: 'civil_lines',
    nameUr: 'سول لائنز و ڈسٹرکٹ ہیڈ کوارٹر ہسپتال',
    name: 'Civil Lines & DHQ Hospital',
    lat: 30.3105,
    lng: 71.9472,
    roadDistanceKm: 4.6,
  },
  {
    id: 'ayub_colony',
    nameUr: 'ایوب کالونی، ماڈل ٹاؤن، غلہ منڈی',
    name: 'Ayub Colony, Model Town & Grain Market',
    lat: 30.3152,
    lng: 71.9522,
    roadDistanceKm: 5.0,
  },
  {
    id: 'stadium_road',
    nameUr: 'اسٹیڈیم روڈ، کالج روڈ و آفیسر کالونی',
    name: 'Stadium Road, College Road & Officers Colony',
    lat: 30.3195,
    lng: 71.9585,
    roadDistanceKm: 6.0,
  },
  {
    id: 'multan_bypass',
    nameUr: 'ملتان روڈ بائی پاس (خانیوال شہر حدود)',
    name: 'Multan Road Bypass (Khanewal City Limits)',
    lat: 30.2805,
    lng: 71.9155,
    roadDistanceKm: 6.8,
  },
  {
    id: 'kabirwala_road',
    nameUr: 'کبیروالا روڈ، ناصر نگر و شاہ رکن عالم ٹاؤن',
    name: 'Kabirwala Road, Nasir Nagar & Shah Rukn-e-Alam Town',
    lat: 30.3255,
    lng: 71.9652,
    roadDistanceKm: 7.4,
  },
  {
    id: 'custom_gps',
    nameUr: 'حسبِ منشاء مقام (GPS لوکیشن یا فاصلہ درج کریں)',
    name: 'Custom Khanewal Address (Calculate Road Route via GPS)',
    lat: 30.2985,
    lng: 71.9325,
    roadDistanceKm: 0, // Must be resolved via OSRM road route or owner manual fee
  },
];

export const DELIVERY_SLOTS = [
  { id: 'express_45', labelUr: 'فوری ڈیلیوری (45 تا 60 منٹ)', labelEn: 'Express Delivery (45–60 mins)' },
  { id: 'morning', labelUr: 'صبح کا وقت (8:00 AM – 11:00 AM)', labelEn: 'Morning (8:00 AM – 11:00 AM)' },
  { id: 'afternoon', labelUr: 'دوپہر کا وقت (12:00 PM – 3:00 PM)', labelEn: 'Afternoon (12:00 PM – 3:00 PM)' },
  { id: 'evening', labelUr: 'شام کا وقت (4:00 PM – 7:00 PM)', labelEn: 'Evening (4:00 PM – 7:00 PM)' },
  { id: 'night', labelUr: 'رات کا وقت (7:00 PM – 10:00 PM)', labelEn: 'Night (7:00 PM – 10:00 PM)' },
];

export const PRODUCT_ENRICHMENT_MAP: Record<
  string,
  {
    urdu_name: string;
    name_en: string;
    category: ProductCategory;
    emoji: string;
    image_url: string;
    is_seasonal?: boolean;
    season_tag?: SeasonTag;
    is_offer?: boolean;
    is_top_selling?: boolean;
    is_recommended?: boolean;
    description_ur: string;
    description_en: string;
    farm_origin: string;
  }
> = {
  tamatar: {
    urdu_name: 'ٹماٹر (تازہ دیسی/فارمی)',
    name_en: 'Fresh Red Tomatoes (Tamatar)',
    category: 'vegetables',
    emoji: '🍅',
    image_url: '/assets/images/produce/tamatar.jpg',
    is_offer: true,
    is_top_selling: true,
    is_recommended: true,
    season_tag: 'all_year',
    description_ur: 'تازہ لال اور پکے ہوئے رس بھرے ٹماٹر، سالن اور سلاد کے لیے بہترین۔',
    description_en: 'Firm, vine-ripened red tomatoes ideal for daily salan, karahi, and fresh salads.',
    farm_origin: 'Khanewal Local Farms',
  },
  pyaz: {
    urdu_name: 'پیاز (خشک و تازہ)',
    name_en: 'Fresh Red Onions (Pyaz)',
    category: 'vegetables',
    emoji: '🧅',
    image_url: '/assets/images/produce/pyaz.jpg',
    is_top_selling: true,
    season_tag: 'all_year',
    description_ur: 'بہترین گریڈ پیاز، سائز میں مناسب اور ہر روز کی ہانڈی کے لیے تیار۔',
    description_en: 'Crisp, cured medium onions selected daily for everyday Pakistani cooking.',
    farm_origin: 'Punjab Mandi Select',
  },
  'new aalo chilky wala': {
    urdu_name: 'نیا آلو (چھلکے والا)',
    name_en: 'New Harvest Potatoes (Aalo)',
    category: 'vegetables',
    emoji: '🥔',
    image_url: '/assets/images/produce/aalo.jpg',
    is_seasonal: true,
    is_top_selling: true,
    is_recommended: true,
    season_tag: 'winter',
    description_ur: 'نئی فصل کا پتلے چھلکے والا میٹھا نہ ہونے والا لاجواب آلو۔',
    description_en: 'Thin-skinned new harvest potatoes from Okara & Khanewal fields.',
    farm_origin: 'Okara & Khanewal Belt',
  },
  bhindi: {
    urdu_name: 'بھنڈی توری (نرم و تازہ)',
    name_en: 'Tender Okra (Bhindi)',
    category: 'vegetables',
    emoji: '🫛',
    image_url: '/assets/images/produce/bhindi.jpg',
    is_seasonal: true,
    season_tag: 'summer',
    description_ur: 'نرم، تروتازہ اور چھوٹی بھنڈی، پکانے میں لذیذ۔',
    description_en: 'Slender, bright green tender ladyfingers picked early morning.',
    farm_origin: 'Khanewal Green Belt',
  },
  tori: {
    urdu_name: 'دیسی توری',
    name_en: 'Ridge Gourd (Tori)',
    category: 'vegetables',
    emoji: '🥒',
    image_url: '/assets/images/produce/tori.jpg',
    is_seasonal: true,
    season_tag: 'summer',
    description_ur: 'ہاضمہ دار اور ہلکی غذا، فارم سے تازہ چنی ہوئی۔',
    description_en: 'Freshly harvested light green ridge gourd for wholesome home curries.',
    farm_origin: 'Multan-Khanewal Farms',
  },
  'ghiya (kdu)': {
    urdu_name: 'گھیا کدو',
    name_en: 'Bottle Gourd (Ghiya Kaddu)',
    category: 'vegetables',
    emoji: '🥬',
    image_url: '/assets/images/produce/ghiya.jpg',
    season_tag: 'summer',
    description_ur: 'ٹھنڈی اور صحت بخش تازہ دیسی گھیا کدو۔',
    description_en: 'Tender farm bottle gourd, cooling and ideal for light summer meals.',
    farm_origin: 'Khanewal Agro Farms',
  },
  karela: {
    urdu_name: 'کریلا دیسی',
    name_en: 'Bitter Gourd (Karela)',
    category: 'vegetables',
    emoji: '🥒',
    image_url: '/assets/images/produce/karela.jpg',
    season_tag: 'summer',
    description_ur: 'غذائیت سے بھرپور تازہ دیسی کریلا۔',
    description_en: 'Small dark-green desi bitter gourds rich in nutrients.',
    farm_origin: 'Punjab Riverbed Farms',
  },
  baingan: {
    urdu_name: 'بینگن (تازہ جامنی)',
    name_en: 'Fresh Eggplant (Baingan)',
    category: 'vegetables',
    emoji: '🍆',
    image_url: '/assets/images/produce/baingan.jpg',
    season_tag: 'all_year',
    description_ur: 'چمکدار جامنی بینگن، بھرتہ اور آلو بینگن کے لیے بہترین۔',
    description_en: 'Glossy purple brinjals ideal for baingan bharta and aloo baingan.',
    farm_origin: 'Khanewal Local Farms',
  },
  'hari mirch': {
    urdu_name: 'سبز ہری مرچ',
    name_en: 'Fresh Green Chillies (Hari Mirch)',
    category: 'herbs',
    emoji: '🌶️',
    image_url: '/assets/images/produce/hari_mirch.jpg',
    is_top_selling: true,
    season_tag: 'all_year',
    description_ur: 'کھانوں میں ذائقہ اور تیکھا پن بڑھانے کے لیے تازہ ہری مرچ۔',
    description_en: 'Aromatic fresh green chillies sorted daily for authentic flavor.',
    farm_origin: 'Kunri & Punjab Farms',
  },
  adrak: {
    urdu_name: 'ادرک (تازہ چائنا/تھائی)',
    name_en: 'Fresh Ginger Root (Adrak)',
    category: 'herbs',
    emoji: '🫚',
    image_url: '/assets/images/produce/adrak.jpg',
    season_tag: 'all_year',
    description_ur: 'صاف ستھری بغیر مٹی والی معیاری ادرک۔',
    description_en: 'Clean, fibrous-free aromatic ginger root for daily cooking & kahwa.',
    farm_origin: 'Wholesale Mandi Select',
  },
  'khira (cucumber)': {
    urdu_name: 'کھیرا (تازہ سلاد)',
    name_en: 'Crisp Cucumbers (Khira)',
    category: 'vegetables',
    emoji: '🥒',
    image_url: '/assets/images/produce/khira.jpg',
    is_recommended: true,
    season_tag: 'all_year',
    description_ur: 'کرسپی اور پانی سے بھرپور کھیرا، روزمرہ سلاد کی جان۔',
    description_en: 'Crunchy hydrating cucumbers ideal for daily salads and raita.',
    farm_origin: 'Khanewal Tunnel Farms',
  },
  'lemon (china)': {
    urdu_name: 'لیموں چائنا (رس دار)',
    name_en: 'Juicy China Lemons (Nimbu)',
    category: 'fruits',
    emoji: '🍋',
    image_url: '/assets/images/produce/lemon.jpg',
    season_tag: 'all_year',
    description_ur: 'پتلے چھلکے والے اور زیادہ رس دار لیموں۔',
    description_en: 'Thin-skinned, extra-juicy lemons packed with vitamin C.',
    farm_origin: 'Sargodha & Multan Groves',
  },
  'sabz dhania': {
    urdu_name: 'سبز دھنیا (تازہ گٹھی)',
    name_en: 'Fresh Green Coriander (Sabz Dhania)',
    category: 'herbs',
    emoji: '🌿',
    image_url: '/assets/images/produce/dhania.jpg',
    is_top_selling: true,
    season_tag: 'all_year',
    description_ur: 'خوشبودار، ہرے پتوں والا تازہ سبز دھنیا۔',
    description_en: 'Fragrant leafy green coriander freshly cut every dawn.',
    farm_origin: 'Camp Chowk Nearby Farms',
  },
  poodina: {
    urdu_name: 'پودینہ دیسی (1 گٹھی)',
    name_en: 'Fresh Desi Mint (Poodina)',
    category: 'herbs',
    emoji: '🍃',
    image_url: '/assets/images/produce/poodina.jpg',
    season_tag: 'all_year',
    description_ur: 'ہاضمے کی چٹنی اور رائتے کے لیے تازہ اور ٹھنڈا پودینہ۔',
    description_en: 'Cooling desi mint bundles for chutney, raita, and refreshing drinks.',
    farm_origin: 'Khanewal Herb Nurseries',
  },
  gobhi: {
    urdu_name: 'پھول گوبھی',
    name_en: 'Cauliflower (Phool Gobhi)',
    category: 'vegetables',
    emoji: '🥦',
    image_url: '/assets/images/produce/gobhi.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'سفید اور ٹھوس پھول، بغیر داغ دھبے کے۔',
    description_en: 'Tightly packed snow-white cauliflower heads.',
    farm_origin: 'Punjab Plains',
  },
  'band gobhi': {
    urdu_name: 'بند گوبھی',
    name_en: 'Fresh Cabbage (Band Gobhi)',
    category: 'vegetables',
    emoji: '🥬',
    image_url: '/assets/images/produce/band_gobhi.jpg',
    season_tag: 'winter',
    description_ur: 'سلاد اور کھانوں کے لیے سخت اور تروتازہ بند گوبھی۔',
    description_en: 'Crisp, tightly layered green cabbage heads.',
    farm_origin: 'Punjab Plains',
  },
  matar: {
    urdu_name: 'مٹر دیسی (میٹھے دانے)',
    name_en: 'Sweet Green Peas (Matar)',
    category: 'vegetables',
    emoji: '🫛',
    image_url: '/assets/images/produce/matar.jpg',
    is_seasonal: true,
    is_offer: true,
    season_tag: 'winter',
    description_ur: 'دانے دار اور میٹھے دیسی مٹر، چھلکے سے بھرپور۔',
    description_en: 'Plump, sweet winter green peas packed in crisp pods.',
    farm_origin: 'Sahiwal & Khanewal Belt',
  },
  gajjar: {
    urdu_name: 'گاجر لال (دیسی و میٹھی)',
    name_en: 'Red Desi Carrots (Gajjar)',
    category: 'vegetables',
    emoji: '🥕',
    image_url: '/assets/images/produce/gajjar.jpg',
    is_seasonal: true,
    is_recommended: true,
    season_tag: 'winter',
    description_ur: 'حلوے، جوس اور سلاد کے لیے میٹھی لال دیسی گاجر۔',
    description_en: 'Sweet ruby-red winter carrots for halwa, juice, and salads.',
    farm_origin: 'Punjab Organic Farms',
  },
  mooli: {
    urdu_name: 'مولی (پتوں سمیت)',
    name_en: 'White Radish with Leaves (Mooli)',
    category: 'vegetables',
    emoji: '🥗',
    image_url: '/assets/images/produce/mooli.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'کرنچی اور رس بھری سفید مولی تازہ پتوں کے ساتھ۔',
    description_en: 'Crisp white winter radish with tender fresh leaves.',
    farm_origin: 'Khanewal Local Farms',
  },
  shaljam: {
    urdu_name: 'شلجم دیسی',
    name_en: 'Fresh Turnips (Shaljam)',
    category: 'vegetables',
    emoji: '🟣',
    image_url: '/assets/images/produce/shaljam.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'نرم اور جلد گلنے والے تازہ شلجم۔',
    description_en: 'Tender purple-top desi turnips.',
    farm_origin: 'Khanewal Local Farms',
  },
  palak: {
    urdu_name: 'پالک دیسی (تازہ پتے)',
    name_en: 'Fresh Spinach (Palak)',
    category: 'vegetables',
    emoji: '🥬',
    image_url: '/assets/images/produce/palak.jpg',
    is_top_selling: true,
    season_tag: 'winter',
    description_ur: 'آئرن اور وٹامنز سے بھرپور سبز پتوں والی تازہ پالک۔',
    description_en: 'Clean, iron-rich broad-leaf desi spinach.',
    farm_origin: 'Khanewal Green Belt',
  },
  methi: {
    urdu_name: 'میتھی دیسی (خوشبودار)',
    name_en: 'Fresh Fenugreek Greens (Methi)',
    category: 'herbs',
    emoji: '🌱',
    image_url: '/assets/images/produce/methi.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'بے مثال مہک اور ذائقے والی تازہ میتھی۔',
    description_en: 'Fragrant fresh winter fenugreek greens.',
    farm_origin: 'Kasur & Punjab Farms',
  },
  'sarson ka saag': {
    urdu_name: 'سرسوں کا ساگ (گندلوں والا)',
    name_en: 'Mustard Greens (Sarson Ka Saag)',
    category: 'vegetables',
    emoji: '🥬',
    image_url: '/assets/images/produce/sarson_saag.jpg',
    is_seasonal: true,
    is_recommended: true,
    season_tag: 'winter',
    description_ur: 'مکھن اور مکئی کی روٹی کے ساتھ کھانے کے لیے اصلی سرسوں کا ساگ۔',
    description_en: 'Tender winter mustard greens ready for authentic Punjabi saag.',
    farm_origin: 'Khanewal Rural Farms',
  },
  shakarkandi: {
    urdu_name: 'شکر قندی (میٹھی)',
    name_en: 'Sweet Potatoes (Shakarkandi)',
    category: 'vegetables',
    emoji: '🍠',
    image_url: '/assets/images/produce/shakarkandi.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'بھوننے اور چاٹ کے لیے بہترین میٹھی شکر قندی۔',
    description_en: 'Naturally sweet winter sweet potatoes.',
    farm_origin: 'Punjab Belt',
  },
  'shimla mirch': {
    urdu_name: 'شملہ مرچ',
    name_en: 'Green Bell Pepper (Shimla Mirch)',
    category: 'vegetables',
    emoji: '🫑',
    image_url: '/assets/images/produce/shimla_mirch.jpg',
    season_tag: 'all_year',
    description_ur: 'خوشبودار اور کرسپی شملہ مرچ۔',
    description_en: 'Crisp sweet green capsicum peppers.',
    farm_origin: 'Punjab Tunnel Farms',
  },
  chukandar: {
    urdu_name: 'چقندر لال',
    name_en: 'Fresh Beetroot (Chukandar)',
    category: 'vegetables',
    emoji: '🟣',
    image_url: '/assets/images/produce/chukandar.jpg',
    season_tag: 'winter',
    description_ur: 'خون پیدا کرنے والا اور صحت بخش لال چقندر۔',
    description_en: 'Deep-red mineral-rich fresh beetroot.',
    farm_origin: 'Punjab Farms',
  },
  'kela (banana)': {
    urdu_name: 'کیلا سندھی (1 درجن)',
    name_en: 'Fresh Bananas (Kela)',
    category: 'fruits',
    emoji: '🍌',
    image_url: '/assets/images/produce/kela.jpg',
    is_offer: true,
    is_top_selling: true,
    season_tag: 'all_year',
    description_ur: 'بڑے سائز کا میٹھا سندھی کیلا، بچوں اور بڑوں کی پسند۔',
    description_en: 'Large golden Cavendish bananas from Sindh plantations.',
    farm_origin: 'Hyderabad / Thatta Sindh',
  },
  'seb (apple)': {
    urdu_name: 'سیب سرخ (سواتی و کوئٹہ)',
    name_en: 'Red Swat Apples (Seb)',
    category: 'fruits',
    emoji: '🍎',
    image_url: '/assets/images/produce/seb.jpg',
    is_offer: true,
    is_top_selling: true,
    is_recommended: true,
    season_tag: 'winter',
    description_ur: 'میٹھا، رسیلا اور خستہ سرخ سیب۔',
    description_en: 'Crisp mountain apples sourced from Swat & Quetta orchards.',
    farm_origin: 'Swat Valley Orchards',
  },
  'angoor (grapes)': {
    urdu_name: 'انگور میٹھے',
    name_en: 'Sweet Grapes (Angoor)',
    category: 'fruits',
    emoji: '🍇',
    image_url: '/assets/images/produce/angoor.jpg',
    season_tag: 'summer',
    description_ur: 'میٹھے اور صاف ستھرے انگور۔',
    description_en: 'Sweet, crisp orchard grapes carefully packed.',
    farm_origin: 'Quetta & Balochistan',
  },
  anar: {
    urdu_name: 'انار قندھاری',
    name_en: 'Qandhari Pomegranate (Anar)',
    category: 'fruits',
    emoji: '❤️',
    image_url: '/assets/images/produce/anar.jpg',
    is_recommended: true,
    season_tag: 'winter',
    description_ur: 'سرخ یاقوت جیسے میٹھے دانوں سے بھرا اصلی انار۔',
    description_en: 'Ruby-red juicy Qandhari pomegranates.',
    farm_origin: 'Quetta / Qandhar Orchards',
  },
  'amrood (guava)': {
    urdu_name: 'امرود سفید (میٹھا)',
    name_en: 'Sweet White Guava (Amrood)',
    category: 'fruits',
    emoji: '🍈',
    image_url: '/assets/images/produce/amrood.jpg',
    is_seasonal: true,
    season_tag: 'winter',
    description_ur: 'نرم اور ہاضمہ دار سفید امرود۔',
    description_en: 'Fragrant soft white-flesh winter guavas.',
    farm_origin: 'Larkana & Sheikhupura',
  },
  kharbooja: {
    urdu_name: 'خربوزہ (میٹھا و رس دار)',
    name_en: 'Sweet Golden Melon (Kharbooja)',
    category: 'fruits',
    emoji: '🍈',
    image_url: '/assets/images/produce/kharbooja.jpg',
    is_seasonal: true,
    season_tag: 'summer',
    description_ur: 'ٹھنڈا اور مٹھاس سے لبریز خربوزہ۔',
    description_en: 'Sun-ripened sweet summer melon.',
    farm_origin: 'Multan & Khanewal Belt',
  },
  'kinno / malta': {
    urdu_name: 'کنو / مالٹا سرگودھا (1 درجن)',
    name_en: 'Sargodha Kinnow / Oranges',
    category: 'fruits',
    emoji: '🍊',
    image_url: '/assets/images/produce/kinno.jpg',
    is_seasonal: true,
    is_offer: true,
    is_top_selling: true,
    season_tag: 'winter',
    description_ur: 'وٹامن سی سے بھرپور تر و تازہ مالٹا و کنو، رس سے بھرا ہوا۔',
    description_en: 'Juicy export-grade Sargodha Kinnow & Malta oranges.',
    farm_origin: 'Sargodha Citrus Groves',
  },
};

export function enrichSupabaseVegetableRow(raw: {
  id: number | string;
  name: string;
  price: number;
  unit?: string;
  name_ur?: string;
  name_en?: string;
  category?: string;
  image_url?: string;
  stock_quantity?: number;
  is_seasonal?: boolean;
  is_offer?: boolean;
  discount_price?: number;
  cost_price?: number | null;
  previous_price?: number;
}): Product {
  const key = (raw.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  let meta = PRODUCT_ENRICHMENT_MAP[key];
  if (!meta) {
    const fuzzy = Object.keys(PRODUCT_ENRICHMENT_MAP).find(
      (k) => key.includes(k) || k.includes(key)
    );
    if (fuzzy) meta = PRODUCT_ENRICHMENT_MAP[fuzzy];
  }

  const isFruit =
    meta?.category === 'fruits' ||
    raw.category === 'fruit' ||
    raw.category === 'fruits' ||
    /apple|banana|mango|orange|grape|melon|guava|anar|kinno|kela|seb|lemon|kharbooja/i.test(raw.name);

  let resolvedCat: ProductCategory = meta?.category || (isFruit ? 'fruits' : 'vegetables');
  if (raw.category === 'herbs') resolvedCat = 'herbs';
  if (raw.category === 'organic_staples') resolvedCat = 'organic_staples';

  const price = Number(raw.price) || 0;
  const stock = raw.stock_quantity !== undefined ? Number(raw.stock_quantity) : 50;
  const fallbackImage =
    resolvedCat === 'fruits'
      ? '/assets/images/fresh_fruits_display_1794208171015.jpg'
      : '/assets/images/fresh_vegetables_basket_1794208171062.jpg';

  const now = new Date().toISOString();

  return {
    id: String(raw.id),
    supabase_id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || undefined,
    name: meta?.name_en || raw.name_en || raw.name.trim(),
    urdu_name: raw.name_ur || meta?.urdu_name || raw.name.trim(),
    name_en: meta?.name_en || raw.name_en || raw.name.trim(),
    category: resolvedCat,
    price,
    previous_price: raw.previous_price,
    original_price: raw.discount_price && raw.discount_price > price ? raw.discount_price : undefined,
    cost_price: raw.cost_price !== undefined ? raw.cost_price : null,
    price_source: 'supabase_live',
    price_updated_at: now,
    unit: raw.unit || 'Kg',
    stock_quantity: stock,
    min_order_quantity: 0.1,
    max_order_quantity: 50,
    image_url: raw.image_url || meta?.image_url || fallbackImage,
    emoji: meta?.emoji || (resolvedCat === 'fruits' ? '🍎' : '🥬'),
    description: meta?.description_en || 'Fresh morning mandi harvest from Khanewal.',
    description_ur:
      meta?.description_ur || 'خانیوال کی منڈی سے صبح سویرے تازہ خریدی گئی اعلیٰ معیار کی پیداوار۔',
    organic: true,
    is_seasonal: raw.is_seasonal ?? meta?.is_seasonal ?? false,
    season_tag: meta?.season_tag || 'all_year',
    is_offer: raw.is_offer ?? meta?.is_offer ?? false,
    is_top_selling: meta?.is_top_selling ?? false,
    is_recommended: meta?.is_recommended ?? false,
    farm_origin: meta?.farm_origin || 'Khanewal Mandi Partner',
    is_out_of_stock: stock <= 0,
    rating: 4.8,
    review_count: 24,
    created_at: now,
    updated_at: now,
  };
}

// Baseline mirror of user's live Supabase `vegetables` table (used ONLY as offline cache fallback if Supabase cannot be reached)
export const SUPABASE_BASELINE_ROWS: Array<{ id: number; name: string; price: number; unit: string }> = [
  { id: 1, name: 'Tamatar', price: 160, unit: 'Kg' },
  { id: 2, name: 'Pyaz', price: 200, unit: 'Kg' },
  { id: 3, name: 'New aalo chilky wala ', price: 160, unit: 'Kg' },
  { id: 4, name: 'Bhindi', price: 200, unit: 'Kg' },
  { id: 5, name: 'Tori', price: 200, unit: 'Kg' },
  { id: 6, name: 'Ghiya (Kdu)', price: 120, unit: 'Kg' },
  { id: 7, name: 'Karela', price: 200, unit: 'Kg' },
  { id: 8, name: 'Baingan', price: 120, unit: 'Kg' },
  { id: 9, name: 'Hari Mirch', price: 120, unit: 'Kg' },
  { id: 10, name: 'Adrak', price: 480, unit: 'Kg' },
  { id: 11, name: 'Khira (Cucumber)', price: 80, unit: 'Kg' },
  { id: 15, name: 'Lemon (china)', price: 150, unit: 'Kg' },
  { id: 16, name: 'Sabz Dhania', price: 200, unit: 'Kg' },
  { id: 17, name: 'Poodina', price: 10, unit: 'Fee gutty 1 adad' },
  { id: 18, name: 'Gobhi', price: 140, unit: 'Kg' },
  { id: 19, name: 'Band Gobhi', price: 120, unit: 'Kg' },
  { id: 20, name: 'Matar', price: 400, unit: 'Kg' },
  { id: 21, name: 'Gajjar', price: 120, unit: 'Kg' },
  { id: 22, name: 'Mooli', price: 60, unit: 'Kg with patty' },
  { id: 23, name: 'Shaljam', price: 150, unit: 'Kg' },
  { id: 24, name: 'Palak', price: 50, unit: 'Kg' },
  { id: 25, name: 'Methi', price: 150, unit: 'Kg' },
  { id: 26, name: 'Sarson ka Saag', price: 80, unit: 'Kg' },
  { id: 27, name: 'Shakarkandi', price: 150, unit: 'Kg' },
  { id: 28, name: 'Shimla Mirch', price: 180, unit: 'Kg' },
  { id: 29, name: 'Chukandar', price: 250, unit: 'Kg' },
  { id: 31, name: 'Kela (Banana)', price: 150, unit: 'Dozen' },
  { id: 32, name: 'Seb (Apple)', price: 500, unit: 'Kg' },
  { id: 35, name: 'Angoor (Grapes)', price: 100, unit: 'Kg' },
  { id: 36, name: 'Anar', price: 1000, unit: 'Kg' },
  { id: 37, name: 'Amrood (Guava)', price: 200, unit: 'Kg' },
  { id: 40, name: 'Kharbooja', price: 250, unit: 'Kg' },
  { id: 41, name: 'Kinno / Malta', price: 300, unit: 'Dozen' },
];

export const INITIAL_PRODUCTS: Product[] = SUPABASE_BASELINE_ROWS.map((row) =>
  enrichSupabaseVegetableRow(row)
);

export const GROCERY_BUNDLES = [
  {
    id: 'bundle_handi_routine',
    titleUr: 'روزانہ ہانڈی روٹین بچت بنڈل',
    titleEn: 'Daily Handi Kitchen Essentials',
    descriptionUr: 'ہر گھر کی روزانہ ضرورت: نیا آلو، پیاز، ٹماٹر، ہری مرچ، ادرک، دھنیا اور پودینہ ایک ساتھ۔',
    descriptionEn: 'Everyday Pakistani cooking pack: Potatoes, Onions, Tomatoes, Chillies, Ginger & Coriander.',
    emoji: '🍲',
    badge: 'زیادہ مقبول',
    discountPrice: 550,
    originalPrice: 620,
    image_url: '/assets/images/fresh_vegetables_basket_1794208171062.jpg',
    items: [
      { productId: '3', grams: 1000 },
      { productId: '2', grams: 1000 },
      { productId: '1', grams: 1000 },
      { productId: '9', grams: 250 },
      { productId: '16', grams: 250 },
    ],
  },
  {
    id: 'bundle_fresh_fruits',
    titleUr: 'فیملی فریش فروٹ باسکٹ',
    titleEn: 'Family Fresh Fruit Basket',
    descriptionUr: 'سواتی سیب، سندھی کیلے، قندھاری انار، امرود اور سرگودھا مالٹا — وٹامنز سے بھرپور۔',
    descriptionEn: 'Fresh Apples, Bananas, Guavas, and Sargodha Oranges curated for families.',
    emoji: '🍎',
    badge: 'تازہ باغیچہ',
    discountPrice: 1150,
    originalPrice: 1320,
    image_url: '/assets/images/fresh_fruits_display_1794208171015.jpg',
    items: [
      { productId: '32', grams: 1000 },
      { productId: '31', grams: 1000 },
      { productId: '37', grams: 1000 },
      { productId: '41', grams: 1000 },
    ],
  },
];

export const INITIAL_COUPONS: Coupon[] = [];

export const RIDERS_FLEET: Rider[] = [
  {
    id: 'RIDER-01',
    name: 'محمد عثمان خان (Muhammad Usman Khan)',
    phone: '+92 301 2345678',
    vehicle_type: 'Motorcycle (Insulated Box)',
    vehicle_reg: 'KWL-7821',
    current_location: {
      lat: 30.2985,
      lng: 71.9325,
      area_name: 'Camp Chowk Main Shop, Khanewal',
    },
    is_active: true,
    assigned_orders_count: 1,
    completed_deliveries: 42,
  },
  {
    id: 'RIDER-02',
    name: 'علی رضا بھٹی (Ali Raza Bhatti)',
    phone: '+92 304 9876543',
    vehicle_type: 'Eco Van',
    vehicle_reg: 'KWL-3310',
    current_location: {
      lat: 30.3152,
      lng: 71.9522,
      area_name: 'Model Town & Civil Lines, Khanewal',
    },
    is_active: true,
    assigned_orders_count: 0,
    completed_deliveries: 28,
  },
];

export const INITIAL_LOYALTY_ACCOUNT: LoyaltyAccount = {
  user_phone: '+923007466664',
  user_name: 'Hamid Ali',
  points_balance: 0,
  lifetime_points: 0,
  cumulative_purchases: 0,
  successful_purchases_count: 0,
  tier: 'None',
  history: [],
};

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    product_id: '1',
    user_name: 'حاجی محمد اقبال (پیپلز کالونی خانیوال)',
    rating: 5,
    freshness_score: 5,
    comment: 'ماشاءاللہ بہت صاف ستھری سبزیاں تھیں اور وزن بھی بالکل پورا تھا۔',
    verified_purchase: true,
    created_at: '2026-11-14T10:15:00Z',
  },
  {
    id: 'rev-2',
    product_id: '3',
    user_name: 'ڈاکٹر رضوان شوکت (سول لائنز خانیوال)',
    rating: 5,
    freshness_score: 5,
    comment: 'رقم کے حساب سے خریداری کا فیچر کمال کا ہے! خانیوال میں بہترین سروس۔',
    verified_purchase: true,
    created_at: '2026-11-15T14:22:00Z',
  },
  {
    id: 'rev-3',
    product_id: '32',
    user_name: 'بیگم چوہدری طاہر (ایوب کالونی خانیوال)',
    rating: 5,
    freshness_score: 5,
    comment: 'سواتی سیب بہت اعلیٰ اور میٹھے نکلے، رائڈر نے وقت پر ڈیلیور کیا۔',
    verified_purchase: true,
    created_at: '2026-11-16T16:05:00Z',
  },
];

export const INITIAL_MARKETING_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: 'camp-1',
    title: 'سردیوں کی تازہ سبزیاں و سرسوں کا ساگ!',
    message: 'خانیوال بھر میں تازہ ساگ، گاجر، مٹر اور سرگودھا کے میٹھے کنو روزانہ منڈی ریٹس پر دستیاب ہیں۔',
    target_audience: 'all_users',
    sent_at: '2026-11-16T08:00:00Z',
    sent_count: 420,
  },
];

export const KHANEWAL_BUNDLES = [
  {
    id: 'bundle-handi',
    titleUr: 'روزانہ ہانڈی اساس پیکج',
    titleEn: 'Daily Handi Essentials Pack',
    descriptionUr: 'ٹماٹر (1 کلو)، پیاز (1 کلو)، نیا آلو (1 کلو) اور لہسن/ادرک',
    descriptionEn: 'Tomatoes (1 Kg), Onions (1 Kg), New Potatoes (1 Kg), Fresh Ginger & Garlic',
    items: [
      { productId: '1', quantity: 1 },
      { productId: '2', quantity: 1 },
      { productId: '3', quantity: 1 },
    ],
  },
  {
    id: 'bundle-saag',
    titleUr: 'موسمِ سرما تازہ سبزی پیکج',
    titleEn: 'Winter Fresh Greens & Salad Pack',
    descriptionUr: 'پالک (1 کلو)، گاجر لال (1 کلو)، مولی (1 کلو) اور مٹر (آدھا کلو)',
    descriptionEn: 'Fresh Spinach (1 Kg), Red Carrots (1 Kg), White Radish (1 Kg) & Sweet Green Peas (500g)',
    items: [
      { productId: '24', quantity: 1 },
      { productId: '21', quantity: 1 },
      { productId: '22', quantity: 1 },
      { productId: '20', quantity: 0.5 },
    ],
  },
  {
    id: 'bundle-fruit',
    titleUr: 'فیملی فریش فروٹ باسکٹ',
    titleEn: 'Family Fresh Fruit Basket',
    descriptionUr: 'سواتی سیب (1 کلو)، کیلا (1 درجن) اور سرگودھا کنو/مالٹا (1 درجن)',
    descriptionEn: 'Swat Red Apples (1 Kg), Sindhri Bananas (1 Dozen) & Sargodha Kinnow (1 Dozen)',
    items: [
      { productId: '32', quantity: 1 },
      { productId: '31', quantity: 1 },
      { productId: '41', quantity: 1 },
    ],
  },
];

