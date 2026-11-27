import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  MessageCircle,
  ClipboardList,
  RefreshCw,
  LogOut,
  PhoneCall,
  Award,
} from 'lucide-react';
import { AppLanguage, LoyaltyAccount, Order, Product, CartItem } from '../types';
import { api, tokenStore } from '../lib/api';
import {
  buildOrderWhatsAppUrl,
  formatWeight,
  getPaymentStatusUrdu,
  getStatusUrdu,
} from '../utils/calculations';

interface OrderHistoryModalProps {
  isOpen: boolean;
  lang: AppLanguage;
  products: Product[];
  onClose: () => void;
  onTrackOrder: (orderId: string) => void;
  onReorderItems: (items: CartItem[]) => void;
}

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  lang,
  products,
  onClose,
  onTrackOrder,
  onReorderItems,
}) => {
  const [phoneInput, setPhoneInput] = useState('03007466664');
  const [customerName, setCustomerName] = useState('');
  const [hasSession, setHasSession] = useState(Boolean(tokenStore.getCustomerToken() || tokenStore.getOwnerToken()));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = async (explicitPhone?: string) => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getMyOrderHistory();
      setOrders(list);
      setHasSession(true);
      const targetPhone = explicitPhone || list[0]?.customer_phone || phoneInput.trim();
      if (targetPhone) {
        api
          .getLoyalty(targetPhone)
          .then((acc) => setLoyaltyAccount(acc))
          .catch(() => {});
      }
    } catch (err: any) {
      if (String(err?.message).includes('401') || String(err?.message).includes('sign in')) {
        setHasSession(false);
      } else {
        setError(err?.message || 'Failed to load orders');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (tokenStore.getCustomerToken() || tokenStore.getOwnerToken()) {
      loadOrders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.createCustomerSession({ phone: phoneInput.trim(), name: customerName.trim() });
      await loadOrders(phoneInput.trim());
    } catch (err: any) {
      setError(err?.message || 'Invalid phone number');
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    tokenStore.setCustomerToken('');
    setHasSession(false);
    setOrders([]);
    setLoyaltyAccount(null);
    setShowLedger(false);
  };

  const handleReorder = (ord: Order) => {
    const newItems: CartItem[] = [];
    for (const it of ord.items) {
      const liveProd = products.find((p) => String(p.id) === String(it.product_id));
      if (!liveProd || liveProd.is_out_of_stock) continue;
      const grams = it.weight_grams || Math.round(it.quantity * 1000);
      newItems.push({
        cartItemId: `${liveProd.id}-reorder-${Date.now()}-${Math.random()}`,
        product: liveProd,
        purchaseType: it.purchase_type || 'weight',
        weightGrams: grams,
        amountPaid: it.amount_paid || 0,
        quantity: Math.round((grams / 1000) * 1000) / 1000,
        unitPrice: liveProd.price,
        lineTotal: Math.round((liveProd.price * grams) / 1000),
      });
    }
    if (newItems.length > 0) {
      onReorderItems(newItems);
      onClose();
    }
  };

  const cumulativeSpend = loyaltyAccount?.cumulative_purchases || 0;
  const nextTierInfo =
    !loyaltyAccount || loyaltyAccount.tier === 'None'
      ? { next: 'Silver', remainingText: lang === 'ur' ? 'پہلے مکمل شدہ آرڈر پر Silver' : 'Complete 1st Delivered order for Silver' }
      : loyaltyAccount.tier === 'Silver'
      ? { next: 'Gold', remainingText: `Rs. ${Math.max(0, 30000 - cumulativeSpend).toLocaleString()} left for Gold` }
      : loyaltyAccount.tier === 'Gold'
      ? { next: 'Platinum', remainingText: `Rs. ${Math.max(0, 60000 - cumulativeSpend).toLocaleString()} left for Platinum` }
      : loyaltyAccount.tier === 'Platinum'
      ? { next: 'Diamond', remainingText: `Rs. ${Math.max(0, 100000 - cumulativeSpend).toLocaleString()} left for Diamond` }
      : { next: 'Diamond', remainingText: lang === 'ur' ? 'اعلیٰ ترین Diamond درجہ مکمل!' : 'Highest Diamond tier achieved!' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold">
                {lang === 'ur' ? 'میرے پچھلے آرڈرز و لائلٹی ریکارڈ' : 'Order History & Loyalty Rewards'}
              </h2>
              <p className="text-[11px] text-emerald-300">
                {lang === 'ur'
                  ? 'آپ کے موبائل نمبر سے کیے گئے آرڈرز، لائلٹی پوائنٹس اور ممبرشپ اسٹیٹس'
                  : 'View past & active orders, membership tier, and points ledger'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasSession && (
              <button
                onClick={handleSignOut}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {lang === 'ur' ? 'تبدیل کریں' : 'Switch'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {!hasSession ? (
            <form onSubmit={handleSignIn} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                <PhoneCall className="w-4 h-4 text-emerald-700" />
                <span>
                  {lang === 'ur'
                    ? 'اپنے آرڈرز دیکھنے کے لیے اپنا موبائل نمبر درج کریں'
                    : 'Sign in with your phone number to view your past orders'}
                </span>
              </div>
              <input
                type="tel"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="03007466664"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-mono-num text-sm font-bold"
              />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={lang === 'ur' ? 'آپ کا نام (اختیاری)' : 'Your Name (optional)'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              />
              {error && <p className="text-xs text-rose-700 font-bold">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm cursor-pointer"
              >
                {loading
                  ? '...'
                  : lang === 'ur'
                  ? 'آرڈرز کی فہرست دیکھیں'
                  : 'View My Order History'}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {loyaltyAccount && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-700" />
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-amber-950">
                            {lang === 'ur' ? 'ممبرشپ ٹائر:' : 'Membership Tier:'} {loyaltyAccount.tier}
                          </strong>
                          <span className="px-2 py-0.5 rounded bg-white border border-amber-300 font-mono-num font-bold text-amber-900">
                            {loyaltyAccount.points_balance} pts (= Rs. {loyaltyAccount.points_balance})
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900/90 mt-0.5">
                          Eligible Spend: Rs. {cumulativeSpend.toLocaleString()} • {nextTierInfo.remainingText}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLedger((prev) => !prev)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-bold hover:bg-amber-100 cursor-pointer"
                    >
                      {showLedger
                        ? lang === 'ur' ? 'لیجر بند کریں' : 'Hide Ledger'
                        : lang === 'ur'
                        ? `پوائنٹس ہسٹری (${loyaltyAccount.history.length})`
                        : `Points Ledger (${loyaltyAccount.history.length})`}
                    </button>
                  </div>

                  {showLedger && (
                    <div className="border-t border-amber-200 pt-2 max-h-44 overflow-y-auto space-y-1.5">
                      {loyaltyAccount.history.length === 0 ? (
                        <p className="text-[11px] text-slate-600">
                          {lang === 'ur' ? 'ابھی کوئی پوائنٹس ٹرانزیکشن موجود نہیں۔' : 'No loyalty transactions yet.'}
                        </p>
                      ) : (
                        loyaltyAccount.history.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between gap-2 bg-white/90 rounded-lg px-2.5 py-1.5 border border-amber-200/70"
                          >
                            <div>
                              <span className="uppercase text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 me-1.5">
                                {tx.type}
                              </span>
                              <span className="text-[11px] text-slate-800">{tx.description}</span>
                              <p className="text-[10px] text-slate-400 font-mono-num">
                                {new Date(tx.created_at).toLocaleString('en-PK')}
                                {tx.order_id ? ` • #${tx.order_id}` : ''}
                              </p>
                            </div>
                            <strong
                              className={`font-mono-num shrink-0 ${
                                tx.points >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {tx.points >= 0 ? `+${tx.points}` : tx.points} pts
                            </strong>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {loading && <p className="text-xs text-slate-500">Loading order history...</p>}
              {!loading && orders.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">
                  {lang === 'ur'
                    ? 'اس نمبر پر ابھی کوئی آرڈر ریکارڈ موجود نہیں۔'
                    : 'No orders found for this account yet.'}
                </div>
              )}
              {orders.map((ord) => (
                <div key={ord.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono-num font-extrabold text-sm text-emerald-950">#{ord.id}</span>
                      <p className="text-[11px] text-slate-500">
                        {new Date(ord.created_at).toLocaleString('en-PK')} • {ord.delivery_area}
                      </p>
                    </div>
                    <div className="text-end">
                      <span className="block font-mono-num font-extrabold text-base text-emerald-800">
                        Rs. {ord.total_amount}
                      </span>
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {lang === 'ur' ? getStatusUrdu(ord.order_status) : ord.order_status}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600">
                    {ord.items
                      .map((it) => `${it.urdu_name || it.product_name} (${formatWeight(it.weight_grams, it.unit, lang)})`)
                      .join('، ')}
                  </p>

                  {(ord.discount > 0 || ord.loyalty_points_used > 0 || ord.loyalty_points_earned > 0) && (
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      {ord.discount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          Coupon ({ord.coupon_code}): -Rs. {ord.discount}
                        </span>
                      )}
                      {ord.loyalty_points_used > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Redeemed: {ord.loyalty_points_used} pts (-Rs. {ord.loyalty_discount_rs ?? ord.loyalty_points_used})
                        </span>
                      )}
                      {ord.loyalty_points_awarded && ord.loyalty_points_earned > 0 && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Earned: +{ord.loyalty_points_earned} pts
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="font-bold text-amber-800">
                      {ord.payment_method} ({lang === 'ur' ? getPaymentStatusUrdu(ord.payment_status) : ord.payment_status})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          onClose();
                          onTrackOrder(ord.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-800 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        {lang === 'ur' ? 'ٹریک' : 'Track'}
                      </button>
                      <button
                        onClick={() => handleReorder(ord)}
                        className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {lang === 'ur' ? 'دوبارہ آرڈر' : 'Reorder'}
                      </button>
                      <a
                        href={buildOrderWhatsAppUrl(ord)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
