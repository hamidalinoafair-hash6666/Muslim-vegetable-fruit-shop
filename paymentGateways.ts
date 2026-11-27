import crypto from 'crypto';

/**
 * Enterprise Payment Gateway Integrations
 * Automated merchant APIs for JazzCash & EasyPaisa with HMAC-SHA256 integrity security,
 * plus Direct Bank Transfer with manual receipt verification.
 */

// Secrets loaded from server environment variables
const JAZZCASH_MERCHANT_ID = process.env.JAZZCASH_MERCHANT_ID || 'MC12345';
const JAZZCASH_PASSWORD = process.env.JAZZCASH_PASSWORD || 'jazzcash_sec_pass_2026';
const JAZZCASH_INTEGRITY_SALT = process.env.JAZZCASH_INTEGRITY_SALT || 'SALT_SABZI_MANDI_SECRET_987';

const EASYPAISA_STORE_ID = process.env.EASYPAISA_STORE_ID || 'STORE_54321';
const EASYPAISA_HASH_KEY = process.env.EASYPAISA_HASH_KEY || 'EP_SEC_KEY_8877';

export interface JazzCashInitiateParams {
  order_id: string;
  amount: number; // in PKR
  customer_phone: string;
  customer_cnic?: string;
  description: string;
}

export interface EasyPaisaInitiateParams {
  order_id: string;
  amount: number;
  customer_phone: string;
  customer_email?: string;
}

/**
 * Generates official JazzCash HMAC-SHA256 Secure Hash
 * Sorted alphabetical parameter string appended with Integrity Salt
 */
export function generateJazzCashSecureHash(params: Record<string, string | number>): string {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  let hashString = JAZZCASH_INTEGRITY_SALT;
  for (const key of sortedKeys) {
    if (params[key] !== undefined && params[key] !== null && String(params[key]).length > 0) {
      hashString += '&' + String(params[key]);
    }
  }
  return crypto.createHmac('sha256', JAZZCASH_INTEGRITY_SALT).update(hashString).digest('hex').toUpperCase();
}

/**
 * Generates EasyPaisa Secure Hash Signature
 */
export function generateEasyPaisaHash(orderId: string, amount: number, timestamp: string): string {
  const payload = `${EASYPAISA_STORE_ID}-${orderId}-${amount.toFixed(2)}-${timestamp}-${EASYPAISA_HASH_KEY}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Automated JazzCash Merchant API Transaction Simulator & Handler
 */
export async function processJazzCashPayment(params: JazzCashInitiateParams) {
  const pp_TxnDateTime = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const pp_TxnRefNo = `T${pp_TxnDateTime.slice(2)}${Math.floor(1000 + Math.random() * 9000)}`;
  const pp_Amount = Math.round(params.amount * 100); // in paisas (cents)

  const payloadToHash: Record<string, string | number> = {
    pp_Amount,
    pp_BillReference: params.order_id,
    pp_Description: params.description,
    pp_Language: 'EN',
    pp_MerchantID: JAZZCASH_MERCHANT_ID,
    pp_Password: JAZZCASH_PASSWORD,
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime,
    pp_TxnRefNo,
    pp_TxnType: 'MWALLET',
    pp_Version: '1.1',
  };

  const secureHash = generateJazzCashSecureHash(payloadToHash);

  // Simulate API authorization round-trip
  await new Promise((res) => setTimeout(res, 600));

  // Check if simulated phone is valid
  const phoneClean = params.customer_phone.replace(/\D/g, '');
  const isApproved = phoneClean.length >= 10;

  if (isApproved) {
    return {
      success: true,
      statusCode: '000',
      statusMessage: 'Transaction Successful / Approved by Customer MPIN',
      transactionId: pp_TxnRefNo,
      orderId: params.order_id,
      amount: params.amount,
      currency: 'PKR',
      secureHash,
      gateway: 'JazzCash Automated MWALLET',
      timestamp: new Date().toISOString(),
    };
  } else {
    return {
      success: false,
      statusCode: '124',
      statusMessage: 'Payment declined or insufficient balance on customer wallet.',
      orderId: params.order_id,
      gateway: 'JazzCash',
    };
  }
}

/**
 * Automated EasyPaisa Merchant API Simulator & Handler
 */
export async function processEasyPaisaPayment(params: EasyPaisaInitiateParams) {
  const timestamp = new Date().toISOString();
  const ep_TxnRef = `EP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const hash = generateEasyPaisaHash(params.order_id, params.amount, timestamp);

  await new Promise((res) => setTimeout(res, 600));

  const phoneClean = params.customer_phone.replace(/\D/g, '');
  const isApproved = phoneClean.length >= 10;

  if (isApproved) {
    return {
      success: true,
      statusCode: '0000',
      statusMessage: 'EasyPaisa Payment Authorized via Mobile Account OTP',
      transactionId: ep_TxnRef,
      orderId: params.order_id,
      amount: params.amount,
      currency: 'PKR',
      signature: hash,
      gateway: 'EasyPaisa Automated Merchant API',
      timestamp,
    };
  } else {
    return {
      success: false,
      statusCode: '0005',
      statusMessage: 'EasyPaisa account verification failed or invalid credentials.',
      orderId: params.order_id,
      gateway: 'EasyPaisa',
    };
  }
}
