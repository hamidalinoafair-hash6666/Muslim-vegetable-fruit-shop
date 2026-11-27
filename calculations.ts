import { AppLanguage, Order, OrderStatus, PaymentStatus } from '../types';

export const SHOP_COORDINATES = {
  lat: 30.2985,
  lng: 71.9325,
  name: 'Chowk Jaswant Nagar, Camp Chowk, Khanewal',
};

export const SHOP_WHATSAPP_NUMBER = '923007466664';

/**
 * Khanewal City Delivery Fee Policy:
 * - Delivery ONLY within Khanewal city
 * - Up to and including 3 km: Rs 100
 * - Beyond 3 km: Add Rs 30 for every additional km (fractional additional km rounded UP)
 *   Verified examples:
 *   2 km => 100
 *   3 km => 100
 *   3.5 km => 130
 *   4 km => 130
 *   5.2 km => 190
 *   6 km => 190
 */
export interface DeliveryFeeConfig {
  baseDeliveryFee?: number;
  baseKm?: number;
  extraKmRate?: number;
}

export function calculateDeliveryFee(distanceKm: number, config?: DeliveryFeeConfig): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const baseKm =
    config?.baseKm !== undefined && Number.isFinite(Number(config.baseKm)) && Number(config.baseKm) > 0
      ? Number(config.baseKm)
      : 3;
  const baseFee =
    config?.baseDeliveryFee !== undefined &&
    Number.isFinite(Number(config.baseDeliveryFee)) &&
    Number(config.baseDeliveryFee) >= 0
      ? Number(config.baseDeliveryFee)
      : 100;
  const extraRatePerKm =
    config?.extraKmRate !== undefined &&
    Number.isFinite(Number(config.extraKmRate)) &&
    Number(config.extraKmRate) >= 0
      ? Number(config.extraKmRate)
      : 30;
  if (distanceKm <= baseKm) {
    return baseFee;
  }
  const extraKm = Math.ceil(Number((distanceKm - baseKm).toFixed(4)));
  return baseFee + extraKm * extraRatePerKm;
}

/**
 * Check if coordinates fall inside Khanewal city service geofence (~12 km radius around Camp Chowk)
 */
export function isCoordinatesInKhanewal(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Khanewal bounding box check (~30.22..30.38 lat, 71.85..72.02 lng)
  const R = 6371;
  const dLat = ((lat - SHOP_COORDINATES.lat) * Math.PI) / 180;
  const dLng = ((lng - SHOP_COORDINATES.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((SHOP_COORDINATES.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const straightKm = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  return straightKm <= 12;
}

const OUTSIDE_CITY_KEYWORDS = [
  'lahore', 'لاہور',
  'karachi', 'کراچی',
  'islamabad', 'اسلام آباد',
  'rawalpindi', 'راولپنڈی',
  'faisalabad', 'فیصل آباد',
  'multan', 'ملتان',
  'vehari', 'وہاڑی',
  'mian channu', 'میاں چنوں',
  'sahiwal', 'ساہیوال',
  'bahawalpur', 'بہاولپور',
  'quetta', 'کوئٹہ',
  'peshawar', 'پشاور',
  'gujranwala', 'گوجرانوالہ',
  'sialkot', 'سیالکوٹ',
  'hyderabad', 'حیدرآباد',
  'jahanian', 'جہانیاں',
  'abdul hakim', 'عبدالحکیم',
  'tulamba', 'تلمبہ',
];

export function validateKhanewalAddress(
  address: string,
  areaId?: string,
  lat?: number,
  lng?: number
): { valid: boolean; reasonUr?: string; reasonEn?: string } {
  const lower = (address || '').toLowerCase();
  // Allow "Multan Road Bypass" inside Khanewal, reject standalone Multan or other cities
  const cleaned = lower.replace(/multan\s*road(\s*bypass)?/gi, '');
  for (const kw of OUTSIDE_CITY_KEYWORDS) {
    if (cleaned.includes(kw)) {
      return {
        valid: false,
        reasonUr: `معذرت! ہماری ڈیلیوری سروس صرف خانیوال شہر کے اندر دستیاب ہے۔ (${kw} میں ڈیلیوری دستیاب نہیں)`,
        reasonEn: `Delivery is only available within Khanewal city. Outside-city address (${kw}) cannot be served.`,
      };
    }
  }

  if (areaId === 'outside_khanewal') {
    return {
      valid: false,
      reasonUr: 'معذرت! ڈیلیوری صرف خانیوال شہر کے اندر دستیاب ہے۔',
      reasonEn: 'Delivery is only available within Khanewal city limits.',
    };
  }

  if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
    if (!isCoordinatesInKhanewal(lat, lng)) {
      return {
        valid: false,
        reasonUr: 'منتخب کردہ GPS لوکیشن خانیوال شہر کی حدود سے باہر ہے۔ براہ کرم خانیوال کے اندر کا پتہ منتخب کریں۔',
        reasonEn: 'Selected GPS coordinates are outside Khanewal city delivery limits (12 km radius).',
      };
    }
  }

  return { valid: true };
}

/**
 * Check if product unit is sold by piece/dozen rather than kilogram weight
 */
export function isCountUnit(unit: string = 'Kg'): boolean {
  const u = unit.toLowerCase();
  return u.includes('dozen') || u.includes('gutty') || u.includes('adad') || u.includes('bunch') || u.includes('bundle');
}

/**
 * Calculate PKR cost from weight (grams) or scaled count (1000 = 1 unit for dozen/bunch)
 * Example: unitPrice = 100, grams = 100 -> Rs 10
 * Example: unitPrice = 100, grams = 500 -> Rs 50
 */
export function calculatePriceFromWeight(unitPrice: number, grams: number): number {
  if (!unitPrice || unitPrice <= 0 || !grams || grams <= 0) return 0;
  return Math.round((unitPrice * grams) / 1000);
}

/**
 * Calculate weight (grams) when customer enters rupee amount (PKR)
 * Example: unitPrice = 100 Rs/kg, amount = 10 -> 100 grams
 * Example: unitPrice = 100 Rs/kg, amount = 20 -> 200 grams
 * Example: unitPrice = 100 Rs/kg, amount = 50 -> 500 grams
 */
export function calculateWeightFromMoney(unitPrice: number, amountPkr: number): number {
  if (!unitPrice || unitPrice <= 0 || !amountPkr || amountPkr <= 0) return 0;
  return Math.round((amountPkr / unitPrice) * 1000);
}

export function formatWeight(grams: number, unit: string = 'Kg', lang: AppLanguage = 'ur'): string {
  const u = (unit || 'Kg').toLowerCase();
  if (u.includes('dozen')) {
    const dozens = Number((grams / 1000).toFixed(2));
    return lang === 'ur' ? `${dozens} درجن` : `${dozens} Dozen`;
  }
  if (u.includes('gutty') || u.includes('adad') || u.includes('bunch') || u.includes('bundle')) {
    const count = Math.max(0.5, Number((grams / 1000).toFixed(2)));
    return lang === 'ur' ? `${count} عدد/گٹھی` : `${count} Bunch/Piece`;
  }
  if (grams >= 1000) {
    const kg = (grams / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1');
    return lang === 'ur' ? `${kg} کلو (${grams} گرام)` : `${kg} kg (${grams} g)`;
  }
  return lang === 'ur' ? `${grams} گرام` : `${grams} g`;
}

export function formatPKR(amount: number, lang: AppLanguage = 'ur'): string {
  const rounded = Math.round(amount || 0);
  return lang === 'ur'
    ? `${rounded.toLocaleString('en-PK')} روپے`
    : `Rs. ${rounded.toLocaleString('en-PK')}`;
}

export function getStatusUrdu(status: OrderStatus): string {
  switch (status) {
    case 'Order Received':
      return 'آرڈر موصول ہو گیا';
    case 'Order Accepted':
      return 'آرڈر قبول کر لیا گیا';
    case 'Order Confirmed':
      return 'آرڈر کی تصدیق ہو گئی';
    case 'Preparing':
      return 'تیاری اور پیکنگ جاری ہے';
    case 'Ready for Delivery':
      return 'ڈیلیوری کے لیے تیار';
    case 'Rider Assigned':
      return 'رائڈر مقرر کر دیا گیا';
    case 'Picked Up':
      return 'رائڈر نے آرڈر وصول کر لیا';
    case 'On the Way':
    case 'Out for Delivery':
      return 'رائڈر راستے میں ہے';
    case 'Delivered':
      return 'کامیابی سے ڈیلیور ہو گیا';
    case 'Cancelled':
      return 'منسوخ شدہ';
    default:
      return status;
  }
}

export function getPaymentStatusUrdu(status: PaymentStatus): string {
  switch (status) {
    case 'Pending Verification':
      return 'تصدیق کے انتظار میں';
    case 'Verified':
      return 'ادائیگی تصدیق شدہ';
    case 'Rejected':
      return 'ادائیگی مسترد';
    case 'COD Pending':
      return 'کیش آن ڈیلیوری (وصولی باقی)';
    case 'Paid COD':
      return 'کیش وصول ہو گیا';
    default:
      return status;
  }
}

function cleanTextNoSlash(text: string, replacement: string): string {
  return String(text || '').replace(/\s*\/\s*/g, replacement).trim();
}

function formatDateTimeUrdu(isoOrDate?: string): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  const dt = Number.isNaN(d.getTime()) ? new Date() : d;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const h24 = dt.getHours();
  const mins = String(dt.getMinutes()).padStart(2, '0');
  const h12 = h24 % 12 || 12;
  const period =
    h24 < 12 ? 'صبح' : h24 < 16 ? 'دوپہر' : h24 < 19 ? 'شام' : 'رات';
  return `${dd}-${mm}-${yyyy}، ${h12}:${mins} ${period}`;
}

function formatDateTimeEnglish(isoOrDate?: string): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  const dt = Number.isNaN(d.getTime()) ? new Date() : d;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const h24 = dt.getHours();
  const mins = String(dt.getMinutes()).padStart(2, '0');
  const h12 = h24 % 12 || 12;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  return `${dd}-${mm}-${yyyy}, ${h12}:${mins} ${ampm}`;
}

function getUnitLabelUrdu(unit: string = 'Kg'): string {
  const u = (unit || 'Kg').toLowerCase();
  if (u.includes('dozen')) return 'درجن';
  if (u.includes('gutty') || u.includes('bunch') || u.includes('bundle')) return 'گٹھی';
  if (u.includes('adad') || u.includes('piece')) return 'عدد';
  return 'کلو';
}

function getUnitLabelEnglish(unit: string = 'Kg'): string {
  const u = (unit || 'Kg').toLowerCase();
  if (u.includes('dozen')) return 'Dozen';
  if (u.includes('gutty') || u.includes('bunch') || u.includes('bundle')) return 'Bunch';
  if (u.includes('adad') || u.includes('piece')) return 'Piece';
  return 'kg';
}

function formatQtyUrdu(grams: number, unit: string = 'Kg'): string {
  const u = (unit || 'Kg').toLowerCase();
  if (u.includes('dozen')) {
    const dozens = Number((grams / 1000).toFixed(2));
    return `${dozens} درجن`;
  }
  if (u.includes('gutty') || u.includes('bunch') || u.includes('bundle')) {
    const count = Math.max(0.5, Number((grams / 1000).toFixed(2)));
    return `${count} گٹھی`;
  }
  if (u.includes('adad') || u.includes('piece')) {
    const count = Math.max(0.5, Number((grams / 1000).toFixed(2)));
    return `${count} عدد`;
  }
  if (grams >= 1000) {
    const kg = (grams / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1');
    return `${kg} کلو (${grams} گرام)`;
  }
  return `${grams} گرام`;
}

function formatQtyEnglish(grams: number, unit: string = 'Kg'): string {
  const u = (unit || 'Kg').toLowerCase();
  if (u.includes('dozen')) {
    const dozens = Number((grams / 1000).toFixed(2));
    return `${dozens} Dozen`;
  }
  if (u.includes('gutty') || u.includes('bunch') || u.includes('bundle')) {
    const count = Math.max(0.5, Number((grams / 1000).toFixed(2)));
    return `${count} Bunch`;
  }
  if (u.includes('adad') || u.includes('piece')) {
    const count = Math.max(0.5, Number((grams / 1000).toFixed(2)));
    return `${count} Piece`;
  }
  if (grams >= 1000) {
    const kg = (grams / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1');
    return `${kg} kg (${grams} g)`;
  }
  return `${grams} g`;
}

function getPaymentMethodUrdu(method?: string): string {
  switch (method) {
    case 'JazzCash Merchant':
      return 'جاز کیش مرچنٹ';
    case 'JazzCash Personal':
      return 'جاز کیش ذاتی اکاؤنٹ';
    case 'JazzCash':
      return 'جاز کیش';
    case 'Easypaisa':
      return 'ایزی پیسہ';
    case 'Bank Alfalah':
      return 'بینک الفلاح';
    case 'Raast ID':
      return 'راست آئی ڈی';
    case 'Cash on Delivery':
    default:
      return 'کیش آن ڈیلیوری';
  }
}

const AREA_TRANSLATIONS: Array<{ ur: string; en: string }> = [
  { ur: 'کیمپ چوک و چوک جسونت نگر (شاپ کے نزدیک)', en: 'Camp Chowk and Jaswant Nagar (Near Shop)' },
  { ur: 'کچہری روڈ، بلاک 1 تا 5، پرانی آبادی', en: 'Katchery Road, Blocks 1-5 and Old Town' },
  { ur: 'ریلوے کالونی و ریلوے اسٹیشن ایریا', en: 'Railway Colony and Station Area' },
  { ur: 'پیپلز کالونی و علامہ اقبال روڈ', en: 'Peoples Colony and Allama Iqbal Road' },
  { ur: 'سول لائنز و ڈسٹرکٹ ہیڈ کوارٹر ہسپتال', en: 'Civil Lines and DHQ Hospital' },
  { ur: 'ایوب کالونی، ماڈل ٹاؤن، غلہ منڈی', en: 'Ayub Colony, Model Town and Grain Market' },
  { ur: 'اسٹیڈیم روڈ، کالج روڈ و آفیسر کالونی', en: 'Stadium Road, College Road and Officers Colony' },
  { ur: 'ملتان روڈ بائی پاس (خانیوال شہر حدود)', en: 'Multan Road Bypass (Khanewal City Limits)' },
  { ur: 'کبیروالا روڈ، ناصر نگر و شاہ رکن عالم ٹاؤن', en: 'Kabirwala Road, Nasir Nagar and Shah Rukn-e-Alam Town' },
  { ur: 'خانیوال جی پی ایس لوکیشن', en: 'Khanewal GPS Pin' },
];

function getAreaLabelUrdu(area?: string): string {
  if (!area) return '';
  const trimmed = area.trim();
  if (/gps/i.test(trimmed) || trimmed === 'خانیوال GPS لوکیشن') return 'خانیوال جی پی ایس لوکیشن';
  const match = AREA_TRANSLATIONS.find(
    (a) =>
      a.ur === trimmed ||
      a.en === trimmed ||
      a.en.replace(' and ', ' & ') === trimmed
  );
  if (match) return match.ur;
  return cleanTextNoSlash(trimmed.replace(/Khanewal/gi, 'خانیوال').replace(/GPS/gi, 'جی پی ایس'), '، ');
}

function getAreaLabelEnglish(area?: string): string {
  if (!area) return '';
  const trimmed = area.trim();
  if (trimmed === 'خانیوال GPS لوکیشن' || trimmed === 'خانیوال جی پی ایس لوکیشن') {
    return 'Khanewal GPS Pin';
  }
  const match = AREA_TRANSLATIONS.find(
    (a) =>
      a.ur === trimmed ||
      a.en === trimmed ||
      a.en.replace(' and ', ' & ') === trimmed
  );
  if (match) return match.en;
  return cleanTextNoSlash(trimmed, ', ');
}

function getDeliverySlotUrdu(slot?: string): string {
  if (!slot) return '';
  const s = slot.trim();
  if (/flexible|optional/i.test(s)) return 'کسٹمر کی سہولت کے مطابق';
  if (/express/i.test(s)) return 'فوری ڈیلیوری (45 تا 60 منٹ)';
  if (/morning/i.test(s)) return 'صبح کا وقت (8 تا 11 بجے)';
  if (/afternoon/i.test(s)) return 'دوپہر کا وقت (12 تا 3 بجے)';
  if (/evening/i.test(s)) return 'شام کا وقت (4 تا 8 بجے)';
  if (/night/i.test(s)) return 'رات کا وقت (7 تا 10 بجے)';
  return cleanTextNoSlash(s, '، ');
}

function getDeliverySlotEnglish(slot?: string): string {
  if (!slot) return '';
  const s = slot.trim();
  if (/flexible|optional|سہولت|اختیاری/i.test(s)) return 'Flexible or Optional';
  if (/فوری/.test(s)) return 'Express Delivery (45-60 mins)';
  if (/صبح/.test(s)) return 'Morning (8:00 AM - 11:00 AM)';
  if (/دوپہر/.test(s)) return 'Afternoon (12:00 PM - 3:00 PM)';
  if (/شام/.test(s)) return 'Evening (4:00 PM - 8:00 PM)';
  if (/رات/.test(s)) return 'Night (7:00 PM - 10:00 PM)';
  return cleanTextNoSlash(s, ' or ');
}

/**
 * Generates a click-to-chat WhatsApp link with complete prefilled order bill.
 * Sends ONE combined message split cleanly into Section 1 (Pure Urdu) and Section 2 (Pure English).
 * Note: Standard wa.me links open WhatsApp and require the user to tap Send.
 */
export function buildOrderWhatsAppUrl(
  order: Partial<Order> & { id: string; customer_name: string; customer_phone: string },
  whatsappNumber: string = SHOP_WHATSAPP_NUMBER
): string {
  const dateUrdu = formatDateTimeUrdu(order.created_at);
  const dateEnglish = formatDateTimeEnglish(order.created_at);

  const hasGps = Boolean(
    order.coordinates &&
      Number.isFinite(order.coordinates.lat) &&
      Number.isFinite(order.coordinates.lng) &&
      order.coordinates.lat !== 0 &&
      order.coordinates.lng !== 0
  );

  const itemLinesUrdu = (order.items || [])
    .map((item, idx) => {
      const grams = item.weight_grams || item.quantity * 1000;
      const qtyUr = formatQtyUrdu(grams, item.unit);
      const unitUr = getUnitLabelUrdu(item.unit);
      const modeUr =
        item.purchase_type === 'amount'
          ? `مختص رقم ${Math.round(item.amount_paid || item.subtotal)} روپے`
          : `وزن کے مطابق`;
      const nameUr = cleanTextNoSlash(item.urdu_name || item.product_name, ' یا ');
      return `${idx + 1}. *${nameUr}*
   • مقدار: ${qtyUr} (${modeUr})
   • ریٹ: ${Math.round(item.unit_price)} روپے فی ${unitUr}
   • رقم: *${Math.round(item.subtotal)} روپے*`;
    })
    .join('\n\n');

  const itemLinesEnglish = (order.items || [])
    .map((item, idx) => {
      const grams = item.weight_grams || item.quantity * 1000;
      const qtyEn = formatQtyEnglish(grams, item.unit);
      const unitEn = getUnitLabelEnglish(item.unit);
      const modeEn =
        item.purchase_type === 'amount'
          ? `Amount: Rs. ${Math.round(item.amount_paid || item.subtotal)}`
          : `By Weight`;
      const nameEn = cleanTextNoSlash(item.product_name, ' or ');
      return `${idx + 1}. *${nameEn}*
   • Quantity: ${qtyEn} (${modeEn})
   • Rate: Rs. ${Math.round(item.unit_price)} per ${unitEn}
   • Amount: *Rs. ${Math.round(item.subtotal)}*`;
    })
    .join('\n\n');

  const hasDistance = Boolean(order.delivery_distance_km && order.delivery_distance_km > 0);
  const distTextUrdu = hasDistance
    ? `${order.delivery_distance_km} کلومیٹر`
    : 'فراہم نہیں کیا گیا (اختیاری)';
  const distTextEnglish = hasDistance
    ? `${order.delivery_distance_km} km`
    : 'Not provided (Optional)';

  const areaUr = getAreaLabelUrdu(order.delivery_area);
  const areaEn = getAreaLabelEnglish(order.delivery_area);
  const slotUr = getDeliverySlotUrdu(order.delivery_slot);
  const slotEn = getDeliverySlotEnglish(order.delivery_slot);

  const areaLineUrdu = areaUr ? `• علاقہ: *${areaUr}*\n` : '';
  const addressLineUrdu = order.delivery_address
    ? `• مکمل پتہ: *${cleanTextNoSlash(order.delivery_address, '، ')}*\n`
    : '';
  const gpsLineUrdu = hasGps ? `• نقشہ لوکیشن: محفوظ شدہ (لنک نیچے انگریزی حصے میں موجود ہے)\n` : '';
  const slotLineUrdu = slotUr ? `• ڈیلیوری کا وقت: ${slotUr}\n` : '';
  const notesLineUrdu = order.notes
    ? `• خاص ہدایات: ${cleanTextNoSlash(order.notes, '، ')}\n`
    : '';

  const areaLineEnglish = areaEn ? `• Area: *${areaEn}*\n` : '';
  const addressLineEnglish = order.delivery_address
    ? `• Complete Address: *${cleanTextNoSlash(order.delivery_address, ', ')}*\n`
    : '';
  const gpsLineEnglish = hasGps
    ? `• Google Maps Location: https://maps.google.com/?q=${order.coordinates!.lat},${order.coordinates!.lng}\n`
    : '';
  const slotLineEnglish = slotEn ? `• Delivery Time: ${slotEn}\n` : '';
  const notesLineEnglish = order.notes
    ? `• Special Instructions: ${cleanTextNoSlash(order.notes, ', ')}\n`
    : '';

  const discountVal = Math.round(order.discount || 0);
  const loyaltyVal = Math.round(order.loyalty_discount_rs ?? (order.loyalty_points_used || 0));
  const discountLineUrdu = discountVal > 0 ? `• رعایت: ${discountVal} روپے کم\n` : '';
  const loyaltyLineUrdu = loyaltyVal > 0 ? `• لائلٹی پوائنٹس رعایت: ${loyaltyVal} روپے کم\n` : '';
  const discountLineEnglish =
    discountVal > 0
      ? `• Discount (${cleanTextNoSlash(order.coupon_code || 'PROMO', ' ')}): -Rs. ${discountVal}\n`
      : '';
  const loyaltyLineEnglish =
    loyaltyVal > 0 ? `• Loyalty Points Redeemed: -Rs. ${loyaltyVal}\n` : '';

  const statusUrdu = getStatusUrdu(order.order_status || 'Order Received');
  const statusEnglish = cleanTextNoSlash(order.order_status || 'Order Received', ' ');
  const payMethodUrdu = getPaymentMethodUrdu(order.payment_method);
  const payMethodEnglish = cleanTextNoSlash(order.payment_method || 'Cash on Delivery', ' ');
  const payStatusUrdu = getPaymentStatusUrdu(order.payment_status || 'COD Pending');
  const payStatusEnglish = cleanTextNoSlash(order.payment_status || 'COD Pending', ' ');

  const sectionUrdu = `*مسلم ویجیٹیبل اینڈ فروٹ شاپ - خانیوال*
• آرڈر نمبر: #${order.id}
• تاریخ اور وقت: ${dateUrdu}
• آرڈر کی صورتحال: ${statusUrdu}

*کسٹمر کی تفصیلات:*
• نام: *${cleanTextNoSlash(order.customer_name, ' ')}*
• موبائل نمبر: *${order.customer_phone}*
${areaLineUrdu}${addressLineUrdu}${gpsLineUrdu}${slotLineUrdu}${notesLineUrdu}
*آرڈر کی اشیاء:*
${itemLinesUrdu}

*بل کا خلاصہ:*
• اشیاء کی کل رقم: ${Math.round(order.subtotal || 0)} روپے
• ڈیلیوری فاصلہ: ${distTextUrdu}
• ڈیلیوری چارجز: ${Math.round(order.delivery_fee || 0)} روپے
• ڈیلیوری اصول: 3 کلومیٹر تک 100 روپے، اس کے بعد ہر اضافی کلومیٹر پر 30 روپے اضافی (جزوی کلومیٹر اوپر شمار ہوگا)
${discountLineUrdu}${loyaltyLineUrdu}• *کل قابلِ ادائیگی رقم: ${Math.round(order.total_amount || 0)} روپے*

*ادائیگی کی تفصیلات:*
• ادائیگی کا طریقہ: ${payMethodUrdu}
• ادائیگی کی صورتحال: ${payStatusUrdu}
${order.payment_reference ? `• ٹرانزیکشن نمبر: ${order.payment_reference}\n` : ''}
چوک جسونت نگر روڈ، کیمپ چوک، خانیوال
واٹس ایپ رابطہ: +923007466664`;

  const sectionEnglish = `*Muslim Vegetable and Fruit Shop - Khanewal*
• Order Number: #${order.id}
• Date and Time: ${dateEnglish}
• Order Status: ${statusEnglish}

*Customer Details:*
• Name: *${cleanTextNoSlash(order.customer_name, ' ')}*
• Mobile Number: *${order.customer_phone}*
${areaLineEnglish}${addressLineEnglish}${gpsLineEnglish}${slotLineEnglish}${notesLineEnglish}
*Order Items:*
${itemLinesEnglish}

*Bill Summary:*
• Items Total: Rs. ${Math.round(order.subtotal || 0)}
• Delivery Distance: ${distTextEnglish}
• Delivery Charges: Rs. ${Math.round(order.delivery_fee || 0)}
• Delivery Policy: Rs. 100 up to 3 km, plus Rs. 30 per additional km (fractional km rounded up)
${discountLineEnglish}${loyaltyLineEnglish}• *Grand Total: Rs. ${Math.round(order.total_amount || 0)}*

*Payment Details:*
• Payment Method: ${payMethodEnglish}
• Payment Status: ${payStatusEnglish}
${order.payment_reference ? `• Transaction ID: ${order.payment_reference}\n` : ''}
Chowk Jaswant Nagar Road, Camp Chowk, Khanewal
WhatsApp: +923007466664`;

  const message = `${sectionUrdu}

-----------------------------------

${sectionEnglish}`;

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function buildGeneralWhatsAppUrl(
  message: string,
  whatsappNumber: string = SHOP_WHATSAPP_NUMBER
): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function safeOpenExternalUrl(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 150);
}
