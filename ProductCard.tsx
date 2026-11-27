import React, { useEffect, useState } from 'react';
import {
  ShoppingBasket,
  Star,
  AlertTriangle,
  Sparkles,
  Scale,
  Banknote,
  Eye,
} from 'lucide-react';
import { AppLanguage, CartItem, Product, PurchaseType } from '../types';
import {
  calculatePriceFromWeight,
  calculateWeightFromMoney,
  formatWeight,
  isCountUnit,
} from '../utils/calculations';

interface ProductCardProps {
  product: Product;
  lang: AppLanguage;
  lowBandwidth: boolean;
  onAddToCart: (item: CartItem) => void;
  onOpenDetail: (product: Product) => void;
}

const FALLBACK_IMAGE = './assets/images/fresh_vegetables_basket_1794208171062.jpg';

function normalizeAssetPath(url?: string): string {
  if (!url) return FALLBACK_IMAGE;
  if (url.startsWith('/assets/')) return `.${url}`;
  return url;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  lang,
  lowBandwidth,
  onAddToCart,
  onOpenDetail,
}) => {
  const isOutOfStock = product.is_out_of_stock || product.stock_quantity <= 0;
  const isLowStock = !isOutOfStock && product.stock_quantity <= 5;
  const countMode = isCountUnit(product.unit);

  const [purchaseType, setPurchaseType] = useState<PurchaseType>('weight');
  const [weightGrams, setWeightGrams] = useState<number>(1000);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('kg');
  const [weightInputStr, setWeightInputStr] = useState<string>('1');
  const [amountInput, setAmountInput] = useState<number>(Math.max(20, Math.min(product.price, 100)));
  const [amountInputStr, setAmountInputStr] = useState<string>(String(Math.max(20, Math.min(product.price, 100))));
  const [imgSrc, setImgSrc] = useState<string>(normalizeAssetPath(product.image_url));
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    setImgSrc(normalizeAssetPath(product.image_url));
  }, [product.image_url]);

  const selectPresetWeight = (grams: number) => {
    setWeightGrams(grams);
    if (countMode || grams >= 1000) {
      setWeightUnit('kg');
      setWeightInputStr(String(Math.round((grams / 1000) * 100) / 100));
    } else {
      setWeightUnit('g');
      setWeightInputStr(String(grams));
    }
  };

  const handleToggleWeightUnit = (nextUnit: 'kg' | 'g') => {
    if (nextUnit === weightUnit) return;
    setWeightUnit(nextUnit);
    if (nextUnit === 'kg') {
      setWeightInputStr(String(Math.round((weightGrams / 1000) * 1000) / 1000));
    } else {
      setWeightInputStr(String(Math.round(weightGrams)));
    }
  };

  const handleCustomWeightChange = (val: string) => {
    setWeightInputStr(val);
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) return;
    const grams = weightUnit === 'kg' ? Math.round(num * 1000) : Math.round(num);
    setWeightGrams(Math.max(50, Math.min(100000, grams)));
  };

  const handleCustomAmountChange = (val: string) => {
    setAmountInputStr(val);
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) return;
    setAmountInput(Math.max(5, Math.min(500000, Math.round(num))));
  };

  const computedGrams =
    purchaseType === 'weight'
      ? Math.max(50, weightGrams)
      : calculateWeightFromMoney(product.price, Math.max(5, amountInput));

  const computedLineTotal =
    purchaseType === 'weight'
      ? calculatePriceFromWeight(product.price, computedGrams)
      : Math.max(5, Math.round(amountInput));

  const computedUnits = Math.round((computedGrams / 1000) * 1000) / 1000;
  const stockExceeded = !isOutOfStock && computedUnits > product.stock_quantity;

  const handleAdd = () => {
    if (isOutOfStock || stockExceeded || computedLineTotal <= 0 || computedGrams <= 0) return;
    onAddToCart({
      cartItemId: `${product.id}-${purchaseType}-${computedGrams}-${Date.now()}`,
      product,
      purchaseType,
      weightGrams: computedGrams,
      amountPaid: purchaseType === 'amount' ? computedLineTotal : 0,
      quantity: computedUnits,
      unitPrice: product.price,
      lineTotal: computedLineTotal,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const quickWeights = countMode
    ? [
        { labelUr: '½', labelEn: '0.5', grams: 500 },
        { labelUr: '1', labelEn: '1', grams: 1000 },
        { labelUr: '2', labelEn: '2', grams: 2000 },
        { labelUr: '3', labelEn: '3', grams: 3000 },
        { labelUr: '4', labelEn: '4', grams: 4000 },
        { labelUr: '5', labelEn: '5', grams: 5000 },
      ]
    : [
        { labelUr: '250g', labelEn: '250g', grams: 250 },
        { labelUr: '500g', labelEn: '500g', grams: 500 },
        { labelUr: '1 Kg', labelEn: '1 Kg', grams: 1000 },
        { labelUr: '2 Kg', labelEn: '2 Kg', grams: 2000 },
        { labelUr: '3 Kg', labelEn: '3 Kg', grams: 3000 },
        { labelUr: '4 Kg', labelEn: '4 Kg', grams: 4000 },
        { labelUr: '5 Kg', labelEn: '5 Kg', grams: 5000 },
      ];

  const quickAmounts = [10, 20, 50, 100, 200, 500];

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs hover:shadow-lg hover:border-emerald-300 transition duration-200">
      {/* Top Visual Area */}
      <div>
        <div
          onClick={() => onOpenDetail(product)}
          className="relative h-40 sm:h-44 w-full bg-gradient-to-br from-emerald-50 to-amber-50 overflow-hidden cursor-pointer"
        >
          {lowBandwidth ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
              <span className="text-4xl mb-1">{product.emoji || '🥬'}</span>
              <span className="text-[11px] font-semibold text-emerald-800">
                {lang === 'ur' ? 'لو انٹرنیٹ ویو' : 'Low-Data View'}
              </span>
            </div>
          ) : (
            <img
              src={imgSrc}
              alt={product.name}
              loading="lazy"
              onError={() => setImgSrc(FALLBACK_IMAGE)}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          )}

          {/* Top Left Badges */}
          <div className="absolute top-2.5 start-2.5 flex flex-wrap gap-1.5">
            {product.is_offer && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow-xs">
                <Sparkles className="w-3 h-3" />
                {lang === 'ur' ? 'آج کی رعایت' : 'Offer'}
              </span>
            )}
            {product.is_seasonal && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-bold shadow-xs">
                {product.season_tag === 'summer'
                  ? lang === 'ur'
                    ? 'گرمیوں کا خاص'
                    : 'Summer'
                  : product.season_tag === 'winter'
                  ? lang === 'ur'
                    ? 'سردیوں کا خاص'
                    : 'Winter'
                  : lang === 'ur'
                  ? 'موسمی'
                  : 'Seasonal'}
              </span>
            )}
          </div>

          {/* Emoji badge + Quick view */}
          <div className="absolute bottom-2 end-2 flex items-center gap-1.5">
            <span className="w-9 h-9 rounded-full bg-white/95 shadow flex items-center justify-center text-xl">
              {product.emoji || '🥗'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(product);
              }}
              className="px-2.5 py-1.5 rounded-full bg-white/95 text-slate-800 hover:text-emerald-900 shadow inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer"
              title={lang === 'ur' ? 'تفصیل دیکھیں' : 'View Details'}
            >
              <Eye className="w-4 h-4 text-emerald-700" />
              <span>{lang === 'ur' ? 'تفصیل' : 'View'}</span>
            </button>
          </div>

          {isOutOfStock && (
            <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center backdrop-blur-[1px]">
              <span className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold shadow">
                {lang === 'ur' ? 'اسٹاک ختم ہو چکا' : 'Out of Stock'}
              </span>
            </div>
          )}
        </div>

        {/* Title & Live Price */}
        <div className="p-3.5 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div onClick={() => onOpenDetail(product)} className="cursor-pointer min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug line-clamp-1">
                {lang === 'ur' ? product.urdu_name || product.name_en || product.name : product.name_en || product.name}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {lang === 'ur' ? product.name_en || product.name : product.urdu_name || product.farm_origin}
              </p>
            </div>
            <div className="flex items-center gap-0.5 text-xs font-bold text-amber-600 shrink-0">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-mono-num">{product.rating.toFixed(1)}</span>
            </div>
          </div>

          {/* Price Row */}
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold text-emerald-800 font-mono-num">
                Rs. {product.price}
              </span>
              <span className="text-xs font-medium text-slate-500">/ {product.unit}</span>
              {product.previous_price && product.previous_price !== product.price && (
                <span className="text-xs text-slate-400 line-through font-mono-num">
                  Rs. {product.previous_price}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                isOutOfStock
                  ? 'bg-rose-100 text-rose-700'
                  : isLowStock
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {isOutOfStock
                ? lang === 'ur'
                  ? 'ختم'
                  : 'Sold Out'
                : isLowStock
                ? `${product.stock_quantity} ${product.unit} ${lang === 'ur' ? 'باقی' : 'left'}`
                : `${product.stock_quantity} ${product.unit}`}
            </span>
          </div>
        </div>
      </div>

      {/* Flexible Weight OR Rupee Purchase Control */}
      <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
        {/* Toggle Tabs */}
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200/70 rounded-lg text-[11px] font-bold">
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => setPurchaseType('weight')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition cursor-pointer ${
              purchaseType === 'weight'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-4 h-4 text-emerald-700" />
            <span>{lang === 'ur' ? 'اپنا وزن لکھیں' : 'By Weight'}</span>
          </button>
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => setPurchaseType('amount')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition cursor-pointer ${
              purchaseType === 'amount'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Banknote className="w-4 h-4 text-amber-600" />
            <span>{lang === 'ur' ? 'اپنی رقم لکھیں' : 'By Rupees'}</span>
          </button>
        </div>

        {purchaseType === 'weight' ? (
          <div className="space-y-2">
            {/* Presets: 250g, 500g, 1Kg, 2Kg, 3Kg, 4Kg, 5Kg */}
            <div className="grid grid-cols-4 gap-1">
              {quickWeights.map((w) => (
                <button
                  key={w.grams}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => selectPresetWeight(w.grams)}
                  className={`py-1 px-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                    weightGrams === w.grams
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                  }`}
                >
                  {lang === 'ur' ? w.labelUr : w.labelEn}
                </button>
              ))}
            </div>

            {/* Custom Weight Input (Kg / g toggle) + Instant Price Preview */}
            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
              <input
                type="number"
                min={weightUnit === 'kg' ? 0.05 : 50}
                step={weightUnit === 'kg' ? 0.25 : 50}
                disabled={isOutOfStock}
                value={weightInputStr}
                onChange={(e) => handleCustomWeightChange(e.target.value)}
                placeholder={weightUnit === 'kg' ? '2, 3, 5' : '500'}
                className="w-16 px-2 py-1 text-xs font-extrabold font-mono-num rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                aria-label="Custom weight input"
              />
              {!countMode ? (
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-extrabold shrink-0">
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleToggleWeightUnit('kg')}
                    className={`px-1.5 py-1 cursor-pointer ${
                      weightUnit === 'kg' ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    {lang === 'ur' ? 'کلو' : 'Kg'}
                  </button>
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleToggleWeightUnit('g')}
                    className={`px-1.5 py-1 cursor-pointer ${
                      weightUnit === 'g' ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    {lang === 'ur' ? 'گرام' : 'g'}
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-bold text-slate-600 px-1">{product.unit}</span>
              )}
              <span className="ms-auto text-xs font-extrabold text-emerald-800 font-mono-num">
                = Rs. {computedLineTotal}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1">
              {quickAmounts.map((rs) => (
                <button
                  key={rs}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => {
                    setAmountInput(rs);
                    setAmountInputStr(String(rs));
                  }}
                  className={`py-1 px-1 rounded-md text-[11px] font-bold font-mono-num border transition cursor-pointer ${
                    amountInput === rs
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400'
                  }`}
                >
                  Rs.{rs}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 ps-1">Rs.</span>
              <input
                type="number"
                min={5}
                step={5}
                disabled={isOutOfStock}
                value={amountInputStr}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="w-20 px-2 py-1 text-xs font-extrabold font-mono-num rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-600"
                aria-label="Amount in PKR"
              />
              <span className="ms-auto text-[11px] font-extrabold text-emerald-800">
                ≈ {formatWeight(computedGrams, product.unit, lang)}
              </span>
            </div>
          </div>
        )}

        {stockExceeded && (
          <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lang === 'ur'
              ? `زیادہ سے زیادہ ${product.stock_quantity} ${product.unit} دستیاب ہے`
              : `Only ${product.stock_quantity} ${product.unit} available`}
          </p>
        )}

        <button
          type="button"
          disabled={isOutOfStock || stockExceeded}
          onClick={handleAdd}
          title={lang === 'ur' ? 'اس چیز کو اپنی خریداری کی ٹوکری میں ڈالیں' : 'Add this item to your basket'}
          className={`w-full py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
            isOutOfStock || stockExceeded
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : justAdded
              ? 'bg-amber-400 text-slate-950'
              : 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm active:scale-[0.99]'
          }`}
        >
          <ShoppingBasket className="w-5 h-5 shrink-0 text-amber-300" />
          <span>
            {justAdded
              ? lang === 'ur'
                ? 'آپ کی ٹوکری میں شامل ہو گیا ✓'
                : 'Added to Your Cart ✓'
              : lang === 'ur'
              ? `ٹوکری میں ڈالیں (Rs. ${computedLineTotal})`
              : `Add to Cart (Rs. ${computedLineTotal})`}
          </span>
        </button>
      </div>
    </article>
  );
};
