import React, { useEffect, useState } from 'react';
import {
  X,
  Star,
  ShoppingBasket,
  MessageCircle,
  MapPin,
  Scale,
  Banknote,
  Leaf,
} from 'lucide-react';
import { AppLanguage, CartItem, Product, PurchaseType, Review } from '../types';
import { api } from '../lib/api';
import {
  buildGeneralWhatsAppUrl,
  calculatePriceFromWeight,
  calculateWeightFromMoney,
  formatWeight,
} from '../utils/calculations';

interface ProductDetailModalProps {
  product: Product | null;
  lang: AppLanguage;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  lang,
  onClose,
  onAddToCart,
}) => {
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('weight');
  const [weightGrams, setWeightGrams] = useState<number>(1000);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('kg');
  const [weightInputStr, setWeightInputStr] = useState<string>('1');
  const [amountInput, setAmountInput] = useState<number>(50);
  const [amountInputStr, setAmountInputStr] = useState<string>('50');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewerName, setReviewerName] = useState('');
  const [rating, setRating] = useState(5);
  const [freshness, setFreshness] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!product) return;
    setWeightGrams(1000);
    setWeightUnit('kg');
    setWeightInputStr('1');
    const defAmt = Math.min(100, Math.max(20, Math.round(product.price / 2)));
    setAmountInput(defAmt);
    setAmountInputStr(String(defAmt));
    api.getReviews(product.id).then(setReviews).catch(() => setReviews([]));
  }, [product]);

  if (!product) return null;

  const selectPresetWeight = (grams: number) => {
    setWeightGrams(grams);
    if (grams >= 1000) {
      setWeightUnit('kg');
      setWeightInputStr(String(Math.round((grams / 1000) * 100) / 100));
    } else {
      setWeightUnit('g');
      setWeightInputStr(String(grams));
    }
  };

  const handleCustomWeight = (val: string) => {
    setWeightInputStr(val);
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) return;
    setWeightGrams(Math.max(50, Math.min(100000, weightUnit === 'kg' ? Math.round(num * 1000) : Math.round(num))));
  };

  const handleCustomAmount = (val: string) => {
    setAmountInputStr(val);
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) return;
    setAmountInput(Math.max(5, Math.min(500000, Math.round(num))));
  };

  const isOutOfStock = product.is_out_of_stock || product.stock_quantity <= 0;
  const computedGrams =
    purchaseType === 'weight'
      ? Math.max(50, weightGrams)
      : calculateWeightFromMoney(product.price, Math.max(5, amountInput));
  const computedTotal =
    purchaseType === 'weight'
      ? calculatePriceFromWeight(product.price, computedGrams)
      : Math.max(5, Math.round(amountInput));

  const handleAdd = () => {
    if (isOutOfStock) return;
    onAddToCart({
      cartItemId: `${product.id}-${purchaseType}-${computedGrams}-${Date.now()}`,
      product,
      purchaseType,
      weightGrams: computedGrams,
      amountPaid: purchaseType === 'amount' ? computedTotal : 0,
      quantity: Math.round((computedGrams / 1000) * 1000) / 1000,
      unitPrice: product.price,
      lineTotal: computedTotal,
    });
    onClose();
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim() || !comment.trim()) return;
    setSubmitting(true);
    try {
      const saved = await api.addReview({
        product_id: product.id,
        user_name: reviewerName.trim(),
        rating,
        freshness_score: freshness,
        comment: comment.trim(),
      });
      setReviews((prev) => [saved, ...prev]);
      setReviewerName('');
      setComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const waUrl = buildGeneralWhatsAppUrl(
    `السلام علیکم! میں مسلم ویجیٹیبل اینڈ فروٹ شاپ خانیوال سے ${product.urdu_name || product.name} (${formatWeight(
      computedGrams,
      product.unit,
      'ur'
    )} - Rs.${computedTotal}) آرڈر کرنا چاہتا ہوں۔`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-emerald-950 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl">{product.emoji || '🥬'}</span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold truncate">
                {lang === 'ur' ? product.urdu_name || product.name : product.name_en || product.name}
              </h2>
              <p className="text-xs text-emerald-300 truncate">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <img
                src={
                  product.image_url?.startsWith('/assets/')
                    ? `.${product.image_url}`
                    : product.image_url || './assets/images/fresh_vegetables_basket_1794208171062.jpg'
                }
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    './assets/images/fresh_vegetables_basket_1794208171062.jpg';
                }}
                alt={product.name}
                className="w-full h-56 object-cover rounded-2xl border border-slate-200"
              />
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">
                  <MapPin className="w-3.5 h-3.5" />
                  {product.farm_origin}
                </span>
                {product.organic && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lime-50 text-lime-800 font-semibold">
                    <Leaf className="w-3.5 h-3.5" />
                    {lang === 'ur' ? 'تازہ منڈی مال' : 'Farm Fresh'}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
                {lang === 'ur' ? product.description_ur || product.description : product.description}
              </p>
            </div>

            <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-extrabold text-emerald-800 font-mono-num">
                    Rs. {product.price}
                  </span>
                  <span className="text-sm text-slate-500"> / {product.unit}</span>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                  {isOutOfStock
                    ? lang === 'ur'
                      ? 'اسٹاک ختم'
                      : 'Out of Stock'
                    : `${product.stock_quantity} ${product.unit}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPurchaseType('weight')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition cursor-pointer ${
                    purchaseType === 'weight' ? 'bg-white text-emerald-900 shadow' : 'text-slate-600'
                  }`}
                >
                  <Scale className="w-4 h-4 text-emerald-700" />
                  {lang === 'ur' ? 'وزن لکھیں (کلو / گرام)' : 'Enter Weight (Kg / g)'}
                </button>
                <button
                  type="button"
                  onClick={() => setPurchaseType('amount')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition cursor-pointer ${
                    purchaseType === 'amount' ? 'bg-white text-emerald-900 shadow' : 'text-slate-600'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-amber-600" />
                  {lang === 'ur' ? 'رقم لکھیں (روپے)' : 'Enter Rupees'}
                </button>
              </div>

              {purchaseType === 'weight' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    {lang === 'ur' ? 'اپنی مرضی کا وزن لکھیں (مثلاً 2، 3، 5 کلو یا 500 گرام):' : 'Enter custom weight (e.g. 2, 3, 5 Kg or 500g):'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={weightUnit === 'kg' ? 0.05 : 50}
                      step={weightUnit === 'kg' ? 0.25 : 50}
                      value={weightInputStr}
                      onChange={(e) => handleCustomWeight(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold font-mono-num text-sm"
                    />
                    <div className="inline-flex rounded-xl border border-slate-300 overflow-hidden text-xs font-extrabold">
                      <button
                        type="button"
                        onClick={() => {
                          setWeightUnit('kg');
                          setWeightInputStr(String(Math.round((weightGrams / 1000) * 1000) / 1000));
                        }}
                        className={`px-3 py-2 cursor-pointer ${weightUnit === 'kg' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700'}`}
                      >
                        {lang === 'ur' ? 'کلو (Kg)' : 'Kg'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWeightUnit('g');
                          setWeightInputStr(String(Math.round(weightGrams)));
                        }}
                        className={`px-3 py-2 cursor-pointer ${weightUnit === 'g' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700'}`}
                      >
                        {lang === 'ur' ? 'گرام (g)' : 'g'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {[250, 500, 1000, 2000, 3000, 4000, 5000].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => selectPresetWeight(g)}
                        className={`py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                          weightGrams === g
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'border-slate-300 bg-white hover:border-emerald-600'
                        }`}
                      >
                        {g >= 1000 ? `${g / 1000}Kg` : `${g}g`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    {lang === 'ur' ? 'جتنے روپے کا چاہیے رقم درج کریں:' : 'Enter exact Rupee amount:'}
                  </label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={amountInputStr}
                    onChange={(e) => handleCustomAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold font-mono-num text-sm"
                  />
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[10, 20, 50, 100, 200, 500].map((rs) => (
                      <button
                        key={rs}
                        type="button"
                        onClick={() => {
                          setAmountInput(rs);
                          setAmountInputStr(String(rs));
                        }}
                        className={`py-1.5 text-xs font-bold font-mono-num rounded-lg border cursor-pointer ${
                          amountInput === rs
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'border-slate-300 bg-white hover:border-amber-500'
                        }`}
                      >
                        Rs.{rs}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-900 text-white flex items-center justify-between text-xs sm:text-sm font-bold">
                <span>{formatWeight(computedGrams, product.unit, lang)}</span>
                <span className="text-amber-300 text-base font-mono-num">Rs. {computedTotal}</span>
              </div>

              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleAdd}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBasket className="w-5 h-5 text-amber-300" />
                {lang === 'ur' ? 'آپ کی ٹوکری میں شامل کریں' : 'Add Calculated Amount to Cart'}
              </button>

              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                {lang === 'ur' ? 'واٹس ایپ پر فوری آرڈر یا سوال (+923007466664)' : 'Order / Ask on WhatsApp (+923007466664)'}
              </a>
            </div>
          </div>

          {/* Reviews Section */}
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              {lang === 'ur' ? 'صارفین کی آراء و تازگی اسکور' : 'Customer Reviews & Freshness Rating'} ({reviews.length})
            </h3>

            <form onSubmit={handleReviewSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="text"
                placeholder={lang === 'ur' ? 'آپ کا نام' : 'Your Name'}
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                required
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    ★ {n}/5 {lang === 'ur' ? 'معیار' : 'Rating'}
                  </option>
                ))}
              </select>
              <select
                value={freshness}
                onChange={(e) => setFreshness(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    🌿 {n}/5 {lang === 'ur' ? 'تازگی' : 'Freshness'}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                {lang === 'ur' ? 'رائے جمع کریں' : 'Post Review'}
              </button>
              <input
                type="text"
                placeholder={lang === 'ur' ? 'سبزی یا پھل کی تازگی کے بارے میں لکھیں...' : 'Write about quality and freshness...'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
                className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </form>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {reviews.map((rev) => (
                <div key={rev.id} className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{rev.user_name}</span>
                    <span className="flex items-center gap-1 text-amber-600 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400" /> {rev.rating}/5 • 🌿 {rev.freshness_score}/5
                    </span>
                  </div>
                  <p className="text-slate-600">{rev.comment}</p>
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="text-xs text-slate-500">
                  {lang === 'ur' ? 'ابھی کوئی تبصرہ نہیں۔ پہلا تبصرہ درج کریں!' : 'No reviews yet for this item.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
