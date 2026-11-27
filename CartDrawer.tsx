import React from 'react';
import {
  X,
  Trash2,
  ShoppingBasket,
  MessageCircle,
  Plus,
  Minus,
  ArrowRight,
  Truck,
} from 'lucide-react';
import { AppLanguage, CartItem, ShopSettings } from '../types';
import { DEFAULT_SHOP_SETTINGS } from '../data/initialData';
import {
  calculatePriceFromWeight,
  calculateWeightFromMoney,
  formatWeight,
  buildGeneralWhatsAppUrl,
} from '../utils/calculations';

interface CartDrawerProps {
  isOpen: boolean;
  lang: AppLanguage;
  items: CartItem[];
  settings?: ShopSettings;
  onClose: () => void;
  onUpdateItem: (cartItemId: string, updated: CartItem) => void;
  onRemoveItem: (cartItemId: string) => void;
  onProceedCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  lang,
  items,
  settings = DEFAULT_SHOP_SETTINGS,
  onClose,
  onUpdateItem,
  onRemoveItem,
  onProceedCheckout,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const waDigits = (settings.whatsapp || '923007466664').replace(/\D/g, '') || '923007466664';
  const baseKm = settings.baseKm ?? 3;
  const baseFee = settings.baseDeliveryFee ?? 100;
  const extraRate = settings.extraKmRate ?? 30;

  const handleAdjustWeight = (item: CartItem, deltaGrams: number) => {
    const newGrams = Math.max(50, item.weightGrams + deltaGrams);
    const newTotal = calculatePriceFromWeight(item.unitPrice, newGrams);
    onUpdateItem(item.cartItemId, {
      ...item,
      purchaseType: 'weight',
      weightGrams: newGrams,
      amountPaid: 0,
      quantity: Math.round((newGrams / 1000) * 1000) / 1000,
      lineTotal: newTotal,
    });
  };

  const handleAdjustRupees = (item: CartItem, newRupees: number) => {
    const cleanRs = Math.max(5, Math.round(newRupees));
    const newGrams = calculateWeightFromMoney(item.unitPrice, cleanRs);
    onUpdateItem(item.cartItemId, {
      ...item,
      purchaseType: 'amount',
      amountPaid: cleanRs,
      weightGrams: newGrams,
      quantity: Math.round((newGrams / 1000) * 1000) / 1000,
      lineTotal: cleanRs,
    });
  };

  const cartDeliveryFee = 0;
  const cartGrandTotal = subtotal + cartDeliveryFee;

  const quickWhatsAppText = `*${settings.shopNameUr || 'مسلم ویجیٹیبل اینڈ فروٹ شاپ'} - خانیوال*
میری ٹوکری کا آرڈر:
${items
  .map(
    (it, i) =>
      `${i + 1}. ${it.product.urdu_name || it.product.name} — ${formatWeight(
        it.weightGrams,
        it.product.unit,
        'ur'
      )} (Rs.${it.lineTotal})`
  )
  .join('\n')}

• اشیاء کی کل رقم: ${subtotal} روپے
• ڈیلیوری چارجز: ${cartDeliveryFee} روپے (اگر لوکیشن دیں: ${baseKm} کلومیٹر تک ${baseFee} روپے، پھر +${extraRate} روپے فی کلومیٹر)
• کل قابلِ ادائیگی رقم: ${cartGrandTotal} روپے`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingBasket className="w-7 h-7 text-amber-300 shrink-0" />
            <div>
              <h2 className="font-extrabold text-base sm:text-lg">
                {lang === 'ur' ? 'یہ آپ کی خریداری کی ٹوکری ہے' : 'This Is Your Shopping Cart'}
              </h2>
              <p className="text-xs text-emerald-300">
                {items.length} {lang === 'ur' ? 'اشیاء شامل ہیں — کل: Rs. ' + subtotal : `items in cart — Subtotal: Rs. ${subtotal}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer" aria-label="Close cart">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <ShoppingBasket className="w-12 h-12 text-slate-300 mb-3" />
              <p className="font-bold text-slate-700">
                {lang === 'ur' ? 'آپ کی ٹوکری خالی ہے' : 'Your basket is empty'}
              </p>
              <p className="text-xs mt-1">
                {lang === 'ur'
                  ? 'تازہ سبزیاں اور پھل وزن یا اپنی مرضی کے روپے لکھ کر شامل کریں۔'
                  : 'Add fresh vegetables or fruits by exact weight or any rupee amount.'}
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.cartItemId}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">
                      {lang === 'ur'
                        ? item.product.urdu_name || item.product.name
                        : item.product.name_en || item.product.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-mono-num">
                      Rs. {item.unitPrice} / {item.product.unit} •{' '}
                      {formatWeight(item.weightGrams, item.product.unit, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-emerald-800 font-mono-num text-sm">
                      Rs. {item.lineTotal}
                    </span>
                    <button
                      onClick={() => onRemoveItem(item.cartItemId)}
                      title={lang === 'ur' ? 'ٹوکری سے نکالیں' : 'Remove item'}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Inline editor for Weight OR Rupee amount */}
                {item.purchaseType === 'amount' ? (
                  <div className="flex items-center justify-between gap-2 text-xs bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span className="font-bold text-amber-900">
                      {lang === 'ur' ? 'رقم (Rs):' : 'Rupees:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustRupees(item, item.lineTotal - 10)}
                        className="p-1.5 rounded bg-white border border-amber-300 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={item.lineTotal}
                        onChange={(e) => handleAdjustRupees(item, Number(e.target.value) || 5)}
                        className="w-16 text-center font-bold font-mono-num bg-white border border-amber-300 rounded px-1 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleAdjustRupees(item, item.lineTotal + 10)}
                        className="p-1.5 rounded bg-white border border-amber-300 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-700">
                      {lang === 'ur' ? 'وزن بدلیں:' : 'Weight:'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(item, -1000)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer hover:border-emerald-500"
                      >
                        -1Kg
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(item, -250)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer hover:border-emerald-500"
                      >
                        -250g
                      </button>
                      <span className="font-mono-num font-extrabold text-emerald-900 px-1.5">
                        {formatWeight(item.weightGrams, item.product.unit, lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(item, 250)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer hover:border-emerald-500"
                      >
                        +250g
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(item, 1000)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer hover:border-emerald-500"
                      >
                        +1Kg
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Totals & Actions */}
        {items.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-white space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1.5">
              <div className="flex items-center justify-between font-bold">
                <span>{lang === 'ur' ? 'اشیاء کا کل بل (Items Total):' : 'Items Total / اشیاء کا کل بل:'}</span>
                <span className="font-mono-num text-emerald-800">Rs. {subtotal}</span>
              </div>
              <div className="flex items-center justify-between font-bold">
                <span>{lang === 'ur' ? 'ڈیلیوری چارجز (لوکیشن پر لاگو):' : 'Delivery Charges / ڈیلیوری چارجز:'}</span>
                <span className="font-mono-num text-emerald-800">Rs. {cartDeliveryFee}</span>
              </div>
              <div className="flex items-center justify-between font-extrabold text-sm pt-1.5 border-t border-emerald-200 text-emerald-950">
                <span>{lang === 'ur' ? 'کل قابلِ ادائیگی رقم (Grand Total):' : 'Grand Total / کل قابلِ ادائیگی رقم:'}</span>
                <span className="font-mono-num">Rs. {cartGrandTotal}</span>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 pt-0.5">
                <Truck className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'ur'
                    ? `خانیوال ڈیلیوری (لوکیشن دینے پر): ${baseKm} کلومیٹر تک ${baseFee} روپے، اس کے بعد ہر اضافی کلومیٹر پر +${extraRate} روپے (جزوی کلومیٹر اوپر راؤنڈ ہوگا)`
                    : `Delivery (if location provided): Rs. ${baseFee} up to ${baseKm} km, +Rs. ${extraRate}/km beyond ${baseKm} km (fractional km rounded up)`}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={onProceedCheckout}
              className="w-full py-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow cursor-pointer"
            >
              <span>{lang === 'ur' ? 'چیک آؤٹ اور آرڈر مکمل کریں' : 'Proceed to Checkout'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <a
              href={buildGeneralWhatsAppUrl(quickWhatsAppText, waDigits)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              <span>{lang === 'ur' ? `سیدھا واٹس ایپ (+${waDigits}) پر بھیجیں` : `Send Basket via WhatsApp (+${waDigits})`}</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
