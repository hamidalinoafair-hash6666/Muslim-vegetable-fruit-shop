import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Minus, MessageCircle, Search, RefreshCw } from 'lucide-react';
import { AppLanguage, Product } from '../types';
import { buildGeneralWhatsAppUrl } from '../utils/calculations';

interface KhanewalRatesModalProps {
  isOpen: boolean;
  lang: AppLanguage;
  products: Product[];
  onClose: () => void;
  onRefresh: () => void;
}

export const KhanewalRatesModal: React.FC<KhanewalRatesModalProps> = ({
  isOpen,
  lang,
  products,
  onClose,
  onRefresh,
}) => {
  const [filter, setFilter] = useState('');
  if (!isOpen) return null;

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      (p.urdu_name || '').includes(filter)
  );

  const shareText = `*مسلم ویجیٹیبل اینڈ فروٹ شاپ - خانیوال منڈی ریٹ لسٹ (${new Date().toLocaleDateString('en-PK')})*\n` +
    filtered
      .slice(0, 25)
      .map((p) => `• ${p.urdu_name || p.name}: Rs.${p.price}/${p.unit}`)
      .join('\n') +
    `\n\nکیمپ چوک خانیوال | WhatsApp: +923007466664`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 bg-emerald-950 text-white flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold">
              {lang === 'ur' ? 'خانیوال منڈی و شاپ ریٹ لسٹ' : 'Khanewal Market & Shop Rate List'}
            </h2>
            <p className="text-[11px] text-emerald-300">
              {lang === 'ur'
                ? 'لائیو ڈیٹابیس ریٹس — موجودہ قیمت، گزشتہ قیمت اور آخری اپڈیٹ کا وقت'
                : 'Live verified catalog prices with previous price comparison & source timestamp'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {lang === 'ur' ? 'ریفریش' : 'Refresh'}
            </button>
            <a
              href={buildGeneralWhatsAppUrl(shareText)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-bold flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {lang === 'ur' ? 'واٹس ایپ شیئر' : 'Share'}
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={lang === 'ur' ? 'ریٹ لسٹ میں تلاش کریں...' : 'Filter rate list by Urdu or English name...'}
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-xs sm:text-sm text-start">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
              <tr>
                <th className="p-3 text-start">{lang === 'ur' ? 'سبزی / پھل' : 'Produce Item'}</th>
                <th className="p-3 text-start">{lang === 'ur' ? 'موجودہ ریٹ' : 'Current Rate'}</th>
                <th className="p-3 text-start">{lang === 'ur' ? 'پچھلا ریٹ' : 'Previous'}</th>
                <th className="p-3 text-start">{lang === 'ur' ? 'تبدیلی' : 'Change'}</th>
                <th className="p-3 text-start hidden sm:table-cell">{lang === 'ur' ? 'ذریعہ / وقت' : 'Source & Updated'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const prev = p.previous_price;
                const diff = prev ? p.price - prev : 0;
                return (
                  <tr key={p.id} className="hover:bg-emerald-50/40">
                    <td className="p-3">
                      <span className="font-extrabold text-slate-900 block">
                        {p.emoji} {p.urdu_name || p.name}
                      </span>
                      <span className="text-[11px] text-slate-500">{p.name}</span>
                    </td>
                    <td className="p-3 font-mono-num font-extrabold text-emerald-800">
                      Rs. {p.price} <span className="font-normal text-slate-500">/ {p.unit}</span>
                    </td>
                    <td className="p-3 font-mono-num text-slate-500">
                      {prev ? `Rs. ${prev}` : '—'}
                    </td>
                    <td className="p-3">
                      {diff > 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-bold font-mono-num">
                          <TrendingUp className="w-3.5 h-3.5" /> +Rs.{diff}
                        </span>
                      ) : diff < 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold font-mono-num">
                          <TrendingDown className="w-3.5 h-3.5" /> -Rs.{Math.abs(diff)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Minus className="w-3.5 h-3.5" /> {lang === 'ur' ? 'مستحکم' : 'Stable'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 hidden sm:table-cell text-[11px] text-slate-500">
                      <span className="block font-semibold text-slate-700">
                        {p.price_source === 'owner_manual' ? 'Manual Owner Rate' : 'Live Supabase'}
                      </span>
                      <span>
                        {new Date(p.price_updated_at || p.updated_at).toLocaleString('en-PK')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
