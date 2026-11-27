import {
  SHOP_COORDINATES,
  DeliveryFeeConfig,
  calculateDeliveryFee,
  calculatePriceFromWeight,
  calculateWeightFromMoney,
  isCoordinatesInKhanewal,
  validateKhanewalAddress,
} from '../src/utils/calculations';
import { DeliveryAreaOption } from '../src/types';
import { KHANEWAL_LOCATIONS } from '../src/data/initialData';

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  sanitizedData?: T;
}

const SQL_INJECTION_PATTERN =
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE|EXEC|DECLARE|CAST)\b)|(--|\/\*|\*\/|;|\bOR\b\s+["'\d\w]+\s*=\s*["'\d\w]+|\bAND\b\s+["'\d\w]+\s*=\s*["'\d\w]+)/i;

export function sanitizeString(val: unknown, maxLength = 255): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLength);
}

export function containsSqlInjection(text: string): boolean {
  if (!text) return false;
  return SQL_INJECTION_PATTERN.test(text);
}

export function validateProductInput(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body must be a valid JSON object.'] };
  }

  const name = sanitizeString(body.name, 120);
  if (!name || name.length < 2) {
    errors.push('Product name must be at least 2 characters.');
  }
  if (containsSqlInjection(name)) {
    errors.push('Suspicious characters detected in product name.');
  }

  const price = Number(body.price);
  if (isNaN(price) || price < 0 || price > 100000) {
    errors.push('Product price must be a valid non-negative number.');
  }

  const stock_quantity =
    body.stock_quantity !== undefined ? Number(body.stock_quantity) : 50;
  if (isNaN(stock_quantity) || stock_quantity < 0 || stock_quantity > 100000) {
    errors.push('Stock quantity must be a non-negative number.');
  }

  const validCategories = ['vegetables', 'fruits', 'herbs', 'organic_staples', 'seasonal_deals'];
  const category = validCategories.includes(body.category) ? body.category : 'vegetables';

  const cost_price =
    body.cost_price !== undefined && body.cost_price !== null && body.cost_price !== ''
      ? Number(body.cost_price)
      : null;

  if (cost_price !== null && (isNaN(cost_price) || cost_price < 0)) {
    errors.push('Cost price must be a non-negative number.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedData: {
      name,
      urdu_name: sanitizeString(body.urdu_name || '', 120),
      name_en: sanitizeString(body.name_en || name, 120),
      price,
      original_price:
        body.original_price !== undefined && Number(body.original_price) > price
          ? Number(body.original_price)
          : undefined,
      cost_price,
      unit: sanitizeString(body.unit || 'Kg', 40),
      stock_quantity,
      category,
      description: sanitizeString(body.description || '', 1000),
      description_ur: sanitizeString(body.description_ur || '', 1000),
      farm_origin: sanitizeString(body.farm_origin || 'Khanewal Mandi', 120),
      image_url: sanitizeString(body.image_url || '', 2000),
      organic: Boolean(body.organic !== false),
      is_seasonal: Boolean(body.is_seasonal),
      season_tag: ['summer', 'winter', 'all_year'].includes(body.season_tag)
        ? body.season_tag
        : 'all_year',
      is_offer: Boolean(body.is_offer),
      is_top_selling: Boolean(body.is_top_selling),
      is_recommended: Boolean(body.is_recommended),
    },
  };
}

export function validateOrderInput(
  body: any,
  catalogProducts: any[],
  deliveryConfig?: DeliveryFeeConfig & { deliveryAreas?: DeliveryAreaOption[] }
): ValidationResult<any> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body must be a valid JSON object.'] };
  }

  const customer_name = sanitizeString(body.customer_name, 100);
  if (!customer_name || customer_name.length < 2) {
    errors.push('Customer full name is required.');
  }
  if (containsSqlInjection(customer_name)) {
    errors.push('Invalid characters in customer name.');
  }

  const customer_phone = sanitizeString(body.customer_phone, 30);
  const phoneClean = customer_phone.replace(/[\s\-\(\)]/g, '');
  if (!phoneClean || phoneClean.length < 10 || !/^(\+92|03|92|\+?\d{10,14})$/.test(phoneClean)) {
    errors.push('Valid Pakistani phone/WhatsApp number is required (e.g. 03007466664).');
  }

  const delivery_address = sanitizeString(body.delivery_address || '', 300);
  const rawArea = sanitizeString(body.delivery_area || '', 100);
  const delivery_area_id = sanitizeString(body.delivery_area_id || '', 50);

  const rawLat = body.coordinates && body.coordinates.lat !== undefined ? Number(body.coordinates.lat) : undefined;
  const rawLng = body.coordinates && body.coordinates.lng !== undefined ? Number(body.coordinates.lng) : undefined;
  const hasCoordinates =
    typeof rawLat === 'number' &&
    typeof rawLng === 'number' &&
    Number.isFinite(rawLat) &&
    Number.isFinite(rawLng) &&
    rawLat !== 0 &&
    rawLng !== 0;

  // Enforce Khanewal-only delivery check whenever location details are provided
  if (delivery_address || rawArea || delivery_area_id || hasCoordinates) {
    const geoCheck = validateKhanewalAddress(
      `${delivery_address} ${rawArea}`,
      delivery_area_id,
      hasCoordinates ? rawLat : undefined,
      hasCoordinates ? rawLng : undefined
    );
    if (!geoCheck.valid) {
      errors.push(geoCheck.reasonEn || 'Delivery is only available within Khanewal city.');
    }
  }

  const delivery_area = rawArea || (hasCoordinates ? 'Khanewal GPS' : '');
  const delivery_slot = sanitizeString(body.delivery_slot || '', 80) || 'Flexible / Optional';

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('Order must contain at least one item.');
  }

  const validPaymentMethods = [
    'JazzCash Merchant',
    'JazzCash Personal',
    'Easypaisa',
    'Cash on Delivery',
    'Bank Alfalah',
    'Raast ID',
    'JazzCash',
  ];
  const requestedPayment = sanitizeString(body.payment_method || '', 40);
  if (requestedPayment && !validPaymentMethods.includes(requestedPayment)) {
    errors.push(`Payment method must be one of: ${validPaymentMethods.join(', ')}`);
  }
  const payment_method = requestedPayment || 'Cash on Delivery';

  const sanitizedItems = (body.items || []).map((item: any) => {
    const productId = sanitizeString(String(item.product_id || ''), 50);
    const prod = catalogProducts.find((p) => String(p.id) === productId);
    const purchaseType = item.purchase_type === 'amount' ? 'amount' : 'weight';

    // Always use authoritative server catalog price when product exists
    const unitPrice = prod ? Number(prod.price) : Number(item.unit_price || item.price);
    let weightGrams = Number(item.weight_grams || 0);
    const amountPaid = Number(item.amount_paid || 0);

    if (!weightGrams && item.quantity) {
      weightGrams = Math.round(Number(item.quantity) * 1000);
    }
    if (purchaseType === 'amount' && amountPaid > 0 && unitPrice > 0) {
      weightGrams = calculateWeightFromMoney(unitPrice, amountPaid);
    }

    if (isNaN(weightGrams) || weightGrams <= 0) {
      errors.push(`Invalid weight or amount for ${item.product_name || productId}`);
    }
    if (isNaN(unitPrice) || unitPrice <= 0) {
      errors.push(`Invalid price for ${item.product_name || productId}`);
    }

    const lineSubtotal =
      purchaseType === 'amount' && amountPaid > 0
        ? Math.round(amountPaid)
        : calculatePriceFromWeight(unitPrice, weightGrams);

    const qtyUnits = Math.round((weightGrams / 1000) * 1000) / 1000;

    return {
      product_id: productId,
      product_name: prod ? prod.name : sanitizeString(item.product_name, 120),
      urdu_name: prod ? prod.urdu_name : sanitizeString(item.urdu_name || '', 120),
      unit_price: unitPrice,
      unit: prod ? prod.unit : sanitizeString(item.unit || 'Kg', 30),
      purchase_type: purchaseType,
      weight_grams: weightGrams,
      amount_paid: purchaseType === 'amount' ? Math.round(amountPaid) : undefined,
      quantity: qtyUnits,
      subtotal: lineSubtotal,
    };
  });

  const subtotal = sanitizedItems.reduce((sum: number, it: any) => sum + it.subtotal, 0);
  const rawDistanceKm = Number(body.delivery_distance_km || 0);
  let deliveryDistanceKm = Number.isFinite(rawDistanceKm) && rawDistanceKm > 0 ? rawDistanceKm : 0;
  let distanceSource: 'verified_sector_road' | 'osrm_road' | 'owner_manual' | 'unverified' =
    deliveryDistanceKm <= 0
      ? 'unverified'
      : ['osrm_road', 'verified_sector_road', 'owner_manual', 'unverified'].includes(body.distance_source)
      ? body.distance_source
      : 'verified_sector_road';

  const activeAreas =
    deliveryConfig?.deliveryAreas && deliveryConfig.deliveryAreas.length > 0
      ? deliveryConfig.deliveryAreas
      : KHANEWAL_LOCATIONS;

  if (deliveryDistanceKm <= 0 && delivery_area_id && delivery_area_id !== 'custom_gps') {
    const sector = activeAreas.find((loc) => loc.id === delivery_area_id);
    if (sector && sector.roadDistanceKm > 0) {
      deliveryDistanceKm = sector.roadDistanceKm;
      distanceSource = 'verified_sector_road';
    }
  } else if (
    deliveryDistanceKm <= 0 &&
    hasCoordinates &&
    isCoordinatesInKhanewal(rawLat!, rawLng!)
  ) {
    const R = 6371;
    const dLat = ((rawLat! - SHOP_COORDINATES.lat) * Math.PI) / 180;
    const dLng = ((rawLng! - SHOP_COORDINATES.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((SHOP_COORDINATES.lat * Math.PI) / 180) *
        Math.cos((rawLat! * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const straightKm = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    deliveryDistanceKm = Math.max(0.5, Math.round(straightKm * 100) / 100);
    distanceSource = 'verified_sector_road';
  }

  // Calculate delivery charges once; never invent a fee if no distance/location was provided
  const delivery_fee =
    body.manual_delivery_fee_override !== undefined
      ? Math.max(0, Number(body.manual_delivery_fee_override))
      : deliveryDistanceKm > 0
      ? calculateDeliveryFee(deliveryDistanceKm, deliveryConfig)
      : 0;

  const discount = Math.min(Math.max(0, Number(body.discount || 0)), subtotal);
  const rawLoyaltyReq = body.loyalty_points_used !== undefined ? Number(body.loyalty_points_used) : 0;
  if (!Number.isFinite(rawLoyaltyReq) || rawLoyaltyReq < 0) {
    errors.push('Redeemed loyalty points must be a non-negative number.');
  }
  const pointValueRs = Number((deliveryConfig as any)?.loyaltyPointValueRs ?? 1) || 1;
  const maxPointsBySubtotal = Math.floor(Math.max(0, subtotal - discount) / pointValueRs);
  const requestedLoyaltyPoints = Math.max(0, Math.floor(Number.isFinite(rawLoyaltyReq) ? rawLoyaltyReq : 0));
  const loyalty_points_used = Math.min(requestedLoyaltyPoints, maxPointsBySubtotal);
  const loyalty_discount_rs = Math.round(loyalty_points_used * pointValueRs);
  const total_amount = Math.max(0, subtotal + delivery_fee - discount - loyalty_discount_rs);

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedData: {
      idempotency_key: sanitizeString(body.idempotency_key || '', 100) || undefined,
      user_id: sanitizeString(body.user_id || '', 80) || undefined,
      customer_name,
      customer_phone,
      customer_email: sanitizeString(body.customer_email || '', 120),
      delivery_address,
      delivery_area,
      coordinates: hasCoordinates ? { lat: rawLat!, lng: rawLng! } : undefined,
      delivery_distance_km: deliveryDistanceKm,
      distance_source: distanceSource,
      delivery_slot,
      notes: sanitizeString(body.notes || '', 300),
      items: sanitizedItems,
      subtotal,
      delivery_fee,
      discount,
      coupon_code: sanitizeString(body.coupon_code || '', 40) || undefined,
      loyalty_points_used,
      loyalty_discount_rs,
      requested_loyalty_points: requestedLoyaltyPoints,
      total_amount,
      payment_method,
      payment_reference: sanitizeString(body.payment_reference || '', 100) || undefined,
      payment_datetime: sanitizeString(body.payment_datetime || '', 60) || undefined,
    },
  };
}

export function validateReceiptInput(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Invalid receipt payload.'] };
  }

  const order_id = sanitizeString(body.order_id, 50);
  if (!order_id) errors.push('Order ID is required.');

  const transaction_ref = sanitizeString(body.transaction_ref, 80);
  if (!transaction_ref || transaction_ref.length < 4) {
    errors.push('Valid Transaction ID / TID is required (min 4 characters).');
  }

  const sender_name = sanitizeString(body.sender_name, 100);
  if (!sender_name) errors.push('Sender account holder name is required.');

  const amount_paid = Number(body.amount_paid);
  if (isNaN(amount_paid) || amount_paid <= 0) {
    errors.push('Transferred amount must be greater than zero.');
  }

  const receipt_image_url = typeof body.receipt_image_url === 'string' ? body.receipt_image_url : '';
  if (
    receipt_image_url &&
    !receipt_image_url.startsWith('data:image/') &&
    !receipt_image_url.startsWith('data:application/pdf')
  ) {
    errors.push('Receipt file must be an image (JPEG, PNG, WEBP) or PDF.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedData: {
      order_id,
      payment_method: sanitizeString(body.payment_method || 'Bank Alfalah', 40),
      bank_name: sanitizeString(body.bank_name || 'Bank Alfalah', 80),
      account_number: sanitizeString(body.account_number || '', 50),
      sender_name,
      transaction_ref,
      amount_paid,
      payment_datetime: sanitizeString(body.payment_datetime || new Date().toISOString(), 60),
      receipt_image_url,
    },
  };
}
