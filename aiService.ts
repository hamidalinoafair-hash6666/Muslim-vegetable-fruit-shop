import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

/**
 * Server-side Gemini AI Integration (Free Tier: gemini-4-hydrogen)
 * Never exposes API keys or confidential credentials to the browser.
 * Never allows AI to auto-approve payments, transfer money, or alter financial records.
 */

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 25000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms = 25000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function extractJsonObject(raw?: string): any {
  const cleaned = (raw || '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('AI_JSON_PARSE');
  }
}

async function generateWithFallback(
  callModel: (model: string, withThinking: boolean) => Promise<any>
): Promise<any> {
  const attempts: Array<{ model: string; withThinking: boolean }> = [
    { model: 'gemini-4-hydrogen', withThinking: true },
    { model: 'gemini-3.1-flash-lite', withThinking: false },
  ];
  let lastErr: any;
  for (let i = 0; i < attempts.length; i++) {
    const { model, withThinking } = attempts[i];
    try {
      return await withTimeout(callModel(model, withThinking), 20000);
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.code;
      const msg = String(err?.message || err || '');
      console.error(`[Gemini AI Error][${model}]`, status || '', msg.slice(0, 180));
      const canFallback =
        status === 503 ||
        status === 404 ||
        status === 400 ||
        /UNAVAILABLE|high demand|overloaded|AI_TIMEOUT/i.test(msg);
      if (!canFallback || i === attempts.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}

function classifyGeminiError(err: any): {
  quotaExhausted: boolean;
  missingKey: boolean;
  diagnostic: string;
  message: string;
} {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.code || 'ERR';
  const diagnostic = `${status}:${msg.slice(0, 80)}`;
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return {
      quotaExhausted: true,
      missingKey: false,
      diagnostic,
      message:
        'Free AI quota temporarily exhausted. AI assistant is paused safely; all store, order, and admin features continue working normally.',
    };
  }
  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return {
      quotaExhausted: false,
      missingKey: false,
      diagnostic,
      message:
        'AI سرور پر اس وقت زیادہ رش ہے۔ چند سیکنڈ بعد دوبارہ کوشش کریں — باقی تمام دکان و آرڈر فیچرز معمول کے مطابق کام کر رہے ہیں۔ (AI server busy; please retry shortly.)',
    };
  }
  if (status === 403 || status === 400 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return {
      quotaExhausted: false,
      missingKey: true,
      diagnostic,
      message: 'Gemini API key is not configured or invalid in Settings > Secrets.',
    };
  }
  return {
    quotaExhausted: false,
    missingKey: false,
    diagnostic,
    message: 'AI اسسٹنٹ فی الحال عارضی طور پر دستیاب نہیں۔ براہِ راست دکان سے خریداری کریں۔ (AI assistant temporarily unavailable.)',
  };
}

export async function runOwnerAdminAI(params: {
  prompt: string;
  products: Array<{ id: string; name: string; urdu_name?: string; price: number; unit: string; stock_quantity: number; is_out_of_stock: boolean }>;
  summary: {
    todaySales: number;
    todayOrdersCount: number;
    pendingOrdersCount: number;
    lowStockCount: number;
    recordedProfit: number | null;
    expensesTotal: number;
  };
}) {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      aiAvailable: false,
      quotaExhausted: false,
      diagnostic: 'NO_API_KEY',
      reply:
        'GEMINI_API_KEY سیٹ نہیں ہے۔ براہ کرم AI Studio کے Secrets پینل میں مفت Gemini API Key شامل کریں۔ باقی تمام ایڈمن فیچرز معمول کے مطابق کام کر رہے ہیں۔',
    };
  }

  const compactCatalog = params.products.map((p) => ({
    id: p.id,
    name: p.name,
    urdu: p.urdu_name,
    price: p.price,
    unit: p.unit,
    stock: p.stock_quantity,
    outOfStock: p.is_out_of_stock,
  }));

  try {
    const response = await generateWithFallback((model, withThinking) =>
      ai.models.generateContent({
        model,
        contents: `Owner command: "${params.prompt}"

Today Business Summary (verified database figures only):
${JSON.stringify(params.summary)}

Current Products Catalog (authoritative IDs & prices):
${JSON.stringify(compactCatalog)}`,
        config: {
          ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          systemInstruction: `You are the bilingual Urdu/English AI Operations Assistant inside the Owner Dashboard of Muslim Vegetable & Fruit Shop (Khanewal).
STRICT RULES:
1. Respond in the same language as the owner (Urdu if asked in Urdu, English if asked in English).
2. Use ONLY the provided verified database numbers. Never invent prices, sales, or profit.
3. If recordedProfit is null, explicitly tell the owner that actual purchase costs have not been entered for today's sold items yet, so profit is not estimated.
4. If the owner asks to change a product's price or stock (e.g. "آج آلو کی قیمت 100 روپے فی کلو کر دو" or "ٹماٹر کی قیمت 120 روپے کر دو"), DO NOT claim it is already saved. Instead populate "proposedChange" so the UI shows a confirmation card with Existing Price, New Price, and Difference, asking the owner to tap Confirm.
5. NEVER approve payments, dispatch orders, or alter financial records.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Helpful bilingual Urdu/English answer grounded strictly in provided data.',
              },
              proposedChange: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  actionType: { type: Type.STRING, description: 'update_price or update_stock' },
                  productId: { type: Type.STRING },
                  productName: { type: Type.STRING },
                  urduName: { type: Type.STRING },
                  currentValue: { type: Type.NUMBER },
                  proposedValue: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                },
              },
            },
            required: ['reply'],
          },
        },
      })
    );

    const parsed = extractJsonObject(response.text);
    return {
      ok: true,
      aiAvailable: true,
      quotaExhausted: false,
      reply: parsed.reply || 'Done.',
      proposedChange: parsed.proposedChange || null,
    };
  } catch (err) {
    const info = classifyGeminiError(err);
    return {
      ok: false,
      aiAvailable: false,
      quotaExhausted: info.quotaExhausted,
      diagnostic: info.diagnostic,
      reply: info.message,
    };
  }
}

export const SAFE_CUSTOMER_UI_ACTIONS = new Set([
  'open_cart',
  'open_checkout',
  'open_track_order',
  'open_rates',
  'open_payment_qr',
  'open_history',
  'filter_category',
  'search_product',
  'switch_language',
  'open_whatsapp',
]);

export async function runCustomerShoppingAI(params: {
  prompt: string;
  lang: 'ur' | 'en';
  products: Array<{
    id: string;
    name: string;
    urdu_name?: string;
    price: number;
    unit: string;
    is_out_of_stock: boolean;
    stock_quantity: number;
  }>;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  cartSummary?: { count: number; subtotal: number };
  trackedOrder?: {
    id: string;
    order_status: string;
    payment_status: string;
    total_amount: number;
    delivery_fee: number;
  } | null;
}) {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      aiAvailable: false,
      quotaExhausted: false,
      diagnostic: 'NO_API_KEY',
      reply:
        params.lang === 'ur'
          ? 'AI اسسٹنٹ فی الحال دستیاب نہیں ہے۔ آپ براہِ راست دکان کی فہرست سے رقم یا وزن لکھ کر خریداری کر سکتے ہیں۔'
          : 'AI Assistant is currently unavailable. You can browse the catalog directly and order by weight or rupee amount.',
    };
  }

  const recentHistory = Array.isArray(params.history)
    ? params.history.slice(-6).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: String(m.text || '').slice(0, 350),
      }))
    : [];

  try {
    const response = await generateWithFallback((model, withThinking) =>
      ai.models.generateContent({
        model,
        contents: `Recent chat context: ${JSON.stringify(recentHistory)}
Current customer message: "${params.prompt}"
Language preference: ${params.lang}
Current customer basket: ${JSON.stringify(params.cartSummary || { count: 0, subtotal: 0 })}
Tracked order context (public status summary only if MVF order ID given): ${JSON.stringify(params.trackedOrder || null)}
Live Store Catalog (ONLY cite items & prices from this list):
${JSON.stringify(params.products)}`,
        config: {
          ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          systemInstruction: `You are the official bilingual Urdu & English Shopping Guide for Muslim Vegetable & Fruit Shop (Camp Chowk, Khanewal, WhatsApp +92 300 7466664).
STRICT CAPABILITIES & SECURITY RULES:
1. Storefront Navigation Access: You can help customers use EVERY customer-facing part of this website by returning an optional "uiAction" using ONLY these exact whitelisted types:
   - "open_cart" (view shopping basket / items)
   - "open_checkout" (proceed to place order — only when basket has items or after proposing items)
   - "open_track_order" (open live order GPS tracker; set value to order ID like "MVF-9055" if mentioned)
   - "open_rates" (open today's live Khanewal Mandi rates modal)
   - "open_payment_qr" (show HAMID Shop JazzCash Merchant QR, Raast ID & Bank Alfalah accounts)
   - "open_history" (open customer's own Order History modal)
   - "filter_category" (set value to one of: "all", "vegetables", "fruits", "herbs", "offers", "seasonal", "top_selling", "recommended")
   - "search_product" (set value to English or Urdu search term like "Tomato", "Apple", "Mango")
   - "switch_language" (set value to "ur" or "en")
   - "open_whatsapp" (link customer to official shop WhatsApp +923007466664)
2. ADMIN & SECURITY ISOLATION (CRITICAL): You have ZERO access to the Admin Panel, Owner login/password, Rider Portal, internal financial profits/expenses, private payment receipt images, audit logs, API keys, or other customers' personal data. If anyone asks to open Admin Panel, change shop prices, view profits/customers/receipts, or override orders, politely refuse and never emit an admin action.
3. Delivery & Pricing Rules: Delivery is ONLY in Khanewal city: Rs 100 up to 3 km, +Rs 30 for every additional km (any fractional additional km is rounded up, e.g. 3.5 km = Rs 130, 5.2 km = Rs 190). Location is optional at checkout.
4. Payment options: Cash on Delivery, JazzCash Merchant (HAMID Shop / 01007466664 / TILL 984994440), JazzCash Personal, Easypaisa, Bank Alfalah (HAMID ALI), Raast ID. Online transfers always stay Pending Verification until verified by the Owner.
5. Use ONLY actual prices and stock from the provided catalog. Never invent prices or availability.
6. Weight & Rupee Calculations:
   - For weight requests (e.g. 2kg, 3kg, 5kg, 250g, 500g): set purchaseType="weight", weightGrams = Math.round(kg * 1000), lineTotal = Math.round((price * weightGrams) / 1000).
   - For rupee requests (e.g. Rs 50, Rs 100): set purchaseType="amount", amountPaid = amount, lineTotal = amount, weightGrams = Math.round((amount / price) * 1000).
7. Whenever customer wants to add items, populate "proposedCartItems" and ask them to tap Confirm & Add to Basket.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              proposedCartItems: {
                type: Type.ARRAY,
                nullable: true,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    productName: { type: Type.STRING },
                    purchaseType: { type: Type.STRING, description: 'weight or amount' },
                    weightGrams: { type: Type.NUMBER },
                    amountPaid: { type: Type.NUMBER },
                    lineTotal: { type: Type.NUMBER },
                  },
                },
              },
              uiAction: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  type: {
                    type: Type.STRING,
                    description:
                      'Whitelisted safe storefront action: open_cart, open_checkout, open_track_order, open_rates, open_payment_qr, open_history, filter_category, search_product, switch_language, open_whatsapp',
                  },
                  value: { type: Type.STRING },
                  label: { type: Type.STRING },
                },
              },
            },
            required: ['reply'],
          },
        },
      })
    );

    const parsed = extractJsonObject(response.text);
    const rawAction = parsed.uiAction;
    const safeAction =
      rawAction &&
      typeof rawAction.type === 'string' &&
      SAFE_CUSTOMER_UI_ACTIONS.has(rawAction.type)
        ? {
            type: rawAction.type,
            value: typeof rawAction.value === 'string' ? rawAction.value : undefined,
            label: typeof rawAction.label === 'string' ? rawAction.label : undefined,
          }
        : null;

    const sanitizedItems = Array.isArray(parsed.proposedCartItems)
      ? parsed.proposedCartItems
          .filter((item: any) => item && typeof item.productId === 'string')
          .map((item: any) => ({
            productId: String(item.productId),
            productName: String(item.productName || ''),
            purchaseType: item.purchaseType === 'amount' ? 'amount' : 'weight',
            weightGrams:
              typeof item.weightGrams === 'number' && Number.isFinite(item.weightGrams)
                ? Math.max(10, Math.round(item.weightGrams))
                : undefined,
            amountPaid:
              typeof item.amountPaid === 'number' && Number.isFinite(item.amountPaid)
                ? Math.max(1, Math.round(item.amountPaid))
                : undefined,
            lineTotal:
              typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
                ? Math.max(1, Math.round(item.lineTotal))
                : undefined,
          }))
      : null;

    return {
      ok: true,
      aiAvailable: true,
      quotaExhausted: false,
      reply: parsed.reply || '',
      proposedCartItems: sanitizedItems && sanitizedItems.length > 0 ? sanitizedItems : null,
      uiAction: safeAction,
    };
  } catch (err) {
    const info = classifyGeminiError(err);
    return {
      ok: false,
      aiAvailable: false,
      quotaExhausted: info.quotaExhausted,
      diagnostic: info.diagnostic,
      reply: info.message,
    };
  }
}

export async function transcribeVoiceSearchAudio(params: {
  audioBase64: string;
  mimeType: string;
  lang: 'ur' | 'en';
}) {
  const ai = getClient();
  if (!ai) {
    return { ok: false, transcript: '', error: 'AI_UNAVAILABLE' };
  }

  const audioPart = {
    inlineData: {
      mimeType: params.mimeType || 'audio/webm',
      data: params.audioBase64,
    },
  };
  const instruction =
    params.lang === 'ur'
      ? 'Transcribe the spoken Urdu or English words from this customer shopping audio concisely in Urdu or English text only (e.g. ٹماٹر, آلو, سیب, یا 2 kilo tomato). Return ONLY the spoken words, no explanation or punctuation.'
      : 'Transcribe the spoken English or Urdu shopping query concisely. Return ONLY the spoken words, no extra commentary.';

  const modelsToTry = ['gemini-3.5-transcribe', 'gemini-4-hydrogen'];
  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: { parts: [audioPart, { text: instruction }] },
        }),
        18000
      );
      const transcript = (response.text || '').trim().replace(/^["']|["']$/g, '');
      if (transcript) {
        return { ok: true, transcript };
      }
    } catch {
      // try fallback model
    }
  }
  return { ok: false, transcript: '', error: 'TRANSCRIBE_FAILED' };
}

