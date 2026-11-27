import React, { useState } from 'react';
import {
  ShoppingBasket,
  ShieldCheck,
  Truck,
  Languages,
  ClipboardList,
  History,
  TrendingUp,
  WifiOff,
  Sparkles,
  Menu,
  X,
  PhoneCall,
  QrCode,
  Home,
  Carrot,
  Apple,
  Search,
} from 'lucide-react';
import { AppLanguage, ShopSettings } from '../types';
import { t } from '../utils/translations';
import { buildGeneralWhatsAppUrl } from '../utils/calculations';
import { DEFAULT_SHOP_SETTINGS } from '../data/initialData';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  lang: AppLanguage;
  settings?: ShopSettings;
  activeCategory: string;
  onToggleLang: () => void;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  cartCount: number;
  cartSubtotal?: number;
  pendingOfflineCount: number;
  onNavigateHome: () => void;
  onSelectCategory: (category: string) => void;
  onFocusSearch: () => void;
  onOpenCart: () => void;
  onOpenRates: () => void;
  onOpenTrackOrder: () => void;
  onOpenOrderHistory: () => void;
  onOpenRiderPortal: () => void;
  onOpenAdmin: () => void;
  onOpenCustomerAI: () => void;
  onOpenPaymentQr: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  lang,
  settings = DEFAULT_SHOP_SETTINGS,
  activeCategory,
  onToggleLang,
  lowBandwidth,
  onToggleLowBandwidth,
  cartCount,
  cartSubtotal = 0,
  pendingOfflineCount,
  onNavigateHome,
  onSelectCategory,
  onFocusSearch,
  onOpenCart,
  onOpenRates,
  onOpenTrackOrder,
  onOpenOrderHistory,
  onOpenRiderPortal,
  onOpenAdmin,
  onOpenCustomerAI,
  onOpenPaymentQr,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const tr = t(lang);
  const cleanWaDigits = (settings.whatsapp || '923007466664').replace(/\D/g, '') || '923007466664';
  const topWhatsAppUrl = buildGeneralWhatsAppUrl(
    `السلام علیکم ${settings.shopNameUr || tr.shopName}! مجھے معلومات یا آرڈر کے لیے رابطہ کرنا ہے۔`,
    cleanWaDigits
  );
  const announcementText =
    settings.announcementActive && (lang === 'ur' ? settings.announcementUr : settings.announcementEn || settings.announcementUr);

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-white/95 backdrop-blur-md shadow-xs">
      {announcementText && (
        <div className="bg-amber-400 text-slate-950 text-xs font-extrabold py-1.5 px-3 text-center">
          {announcementText}
        </div>
      )}
      {/* Top Khanewal Delivery Ribbon */}
      <div className="bg-emerald-900 text-emerald-50 text-[11px] sm:text-xs py-1.5 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            <span>{tr.deliveryBadge}</span>
            <span className="hidden md:inline text-emerald-300">| {settings.openHours || tr.openHours}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={topWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-600/90 hover:bg-green-600 text-white font-bold shadow-xs"
            >
              <PhoneCall className="w-3 h-3 shrink-0" />
              <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                +{cleanWaDigits}
              </span>
            </a>
            <button
              onClick={onOpenPaymentQr}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-400/50 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 text-[11px] font-bold transition cursor-pointer"
            >
              <QrCode className="w-3 h-3" />
              <span>{lang === 'ur' ? 'QR و اکاؤنٹس' : 'JazzCash / Raast'}</span>
            </button>
            <button
              onClick={onToggleLowBandwidth}
              className={`px-2 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer ${
                lowBandwidth
                  ? 'bg-amber-400 text-slate-900 border-amber-300'
                  : 'border-emerald-700 text-emerald-200 hover:bg-emerald-800'
              }`}
              title={lang === 'ur' ? 'کم انٹرنیٹ پر تیز لوڈنگ' : 'Save mobile data by hiding large photos'}
            >
              <WifiOff className="w-3 h-3 inline me-1" />
              {tr.lowBandwidth}
            </button>
          </div>
        </div>
      </div>

      {/* Main Nav Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-600 text-amber-300 flex items-center justify-center font-bold text-lg shadow-sm shrink-0 border border-emerald-500/30">
            م
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-emerald-950 truncate leading-tight">
              {lang === 'ur' ? settings.shopNameUr || tr.shopName : settings.shopNameEn || tr.shopName}
            </h1>
            <p className="text-[11px] text-slate-500 truncate">
              {lang === 'ur' ? settings.locationUr || 'چوک جسونت نگر، کیمپ چوک، خانیوال' : settings.locationEn || 'Camp Chowk, Khanewal'}
            </p>
          </div>
        </button>

        {/* Primary Storefront Nav Links (Clear Large Icons & Labels) */}
        <nav className="hidden lg:flex items-center gap-1">
          <button
            type="button"
            onClick={onNavigateHome}
            title={lang === 'ur' ? 'صفحہ اول پر جائیں' : 'Go to Home page'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Home className="w-5 h-5 text-emerald-700" />
            <span>{lang === 'ur' ? 'ہوم' : 'Home'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectCategory('vegetables')}
            title={lang === 'ur' ? 'تازہ سبزیاں دیکھیں' : 'Browse fresh vegetables'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'vegetables'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-700 hover:bg-emerald-50'
            }`}
          >
            <Carrot className={`w-5 h-5 ${activeCategory === 'vegetables' ? 'text-amber-300' : 'text-emerald-700'}`} />
            <span>{lang === 'ur' ? 'سبزیاں' : 'Vegetables'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectCategory('fruits')}
            title={lang === 'ur' ? 'موسمی تازہ پھل دیکھیں' : 'Browse fresh fruits'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'fruits'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-700 hover:bg-emerald-50'
            }`}
          >
            <Apple className={`w-5 h-5 ${activeCategory === 'fruits' ? 'text-amber-300' : 'text-rose-600'}`} />
            <span>{lang === 'ur' ? 'پھل' : 'Fruits'}</span>
          </button>

          <button
            type="button"
            onClick={onFocusSearch}
            title={lang === 'ur' ? 'نام یا آواز سے سبزی/پھل تلاش کریں' : 'Search produce by text or voice'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition whitespace-nowrap cursor-pointer"
          >
            <Search className="w-5 h-5 text-emerald-700" />
            <span>{lang === 'ur' ? 'تلاش' : 'Search'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTrackOrder}
            title={lang === 'ur' ? 'اپنا آرڈر نقشے پر لائیو دیکھیں' : 'Track your order live on the map'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition whitespace-nowrap cursor-pointer"
          >
            <ClipboardList className="w-5 h-5 text-sky-700" />
            <span>{lang === 'ur' ? 'آرڈر ٹریک کریں' : 'Track My Order'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCustomerAI}
            title={lang === 'ur' ? 'AI خریداری مددگار سے قیمت یا آرڈر پوچھیں' : 'Ask AI Shopping Assistant'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-amber-600" />
            <span>{lang === 'ur' ? 'AI مددگار' : 'AI Assistant'}</span>
          </button>
        </nav>

        {/* Right Controls: Language, Prominent Single Shopping Cart Icon, and Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton lang={lang} />
          </div>

          <button
            type="button"
            onClick={onToggleLang}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
            title={lang === 'ur' ? 'Switch website language to English' : 'ویب سائٹ اردو میں دیکھیں'}
          >
            <Languages className="w-5 h-5 text-emerald-700" />
            <span>{tr.langSwitch}</span>
          </button>

          {/* STRICTLY ONE Main Shopping Cart Icon in Navigation — Enlarged & Clearly Labeled */}
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={lang === 'ur' ? 'آپ کی ٹوکری' : 'Your Shopping Cart'}
            title={lang === 'ur' ? 'یہ آپ کی خریداری کی ٹوکری ہے — بل دیکھنے اور آرڈر مکمل کرنے کے لیے دبائیں' : 'Your Shopping Cart — click to review items & checkout'}
            data-testid="navbar-cart-button"
            className="relative flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-3 sm:px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md border border-emerald-600 transition cursor-pointer"
          >
            <ShoppingBasket className="w-6 h-6 sm:w-7 sm:h-7 text-amber-300 shrink-0" />
            <div className="flex flex-col items-start leading-tight text-start">
              <span className="text-[11px] sm:text-xs font-extrabold">
                {lang === 'ur' ? 'آپ کی ٹوکری' : 'Your Cart'}
              </span>
              {cartSubtotal > 0 && (
                <span className="text-[10px] font-mono-num text-amber-300 font-bold">
                  Rs. {cartSubtotal}
                </span>
              )}
            </div>
            <span
              data-testid="navbar-cart-count"
              className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-amber-400 text-slate-950 text-xs sm:text-sm font-extrabold font-mono-num shadow-xs"
            >
              {cartCount}
            </span>
            {pendingOfflineCount > 0 && (
              <span className="absolute -top-1.5 -end-1.5 px-1.5 py-0.5 rounded-full bg-rose-600 text-[10px] font-bold text-white">
                {pendingOfflineCount}
              </span>
            )}
          </button>

          {/* Menu Button */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            data-testid="navbar-menu-button"
            title={lang === 'ur' ? 'مزید آپشنز، ریٹس، ایڈمن اور رائڈر مینو کھولیں' : 'Open Menu (Rates, History, Rider & Admin)'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 text-xs font-bold cursor-pointer"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 text-emerald-800" />}
            <span className="hidden sm:inline">{lang === 'ur' ? 'مینو' : 'Menu'}</span>
          </button>
        </div>
      </div>

      {/* Responsive Quick Mobile Strip with Large Clear Icons & Labels */}
      <div className="lg:hidden border-t border-slate-100 bg-slate-50/95 px-2 py-1.5 grid grid-cols-5 gap-1 text-[11px] font-bold">
        <button
          type="button"
          onClick={onNavigateHome}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl ${
            activeCategory === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-700'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>{lang === 'ur' ? 'ہوم' : 'Home'}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectCategory('vegetables')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl ${
            activeCategory === 'vegetables' ? 'bg-emerald-800 text-white' : 'text-slate-700'
          }`}
        >
          <Carrot className="w-5 h-5" />
          <span>{lang === 'ur' ? 'سبزیاں' : 'Vegetables'}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectCategory('fruits')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl ${
            activeCategory === 'fruits' ? 'bg-emerald-800 text-white' : 'text-slate-700'
          }`}
        >
          <Apple className="w-5 h-5" />
          <span>{lang === 'ur' ? 'پھل' : 'Fruits'}</span>
        </button>
        <button
          type="button"
          onClick={onFocusSearch}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-slate-700"
        >
          <Search className="w-5 h-5" />
          <span>{lang === 'ur' ? 'تلاش' : 'Search'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenTrackOrder}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl bg-sky-100 text-sky-900"
        >
          <ClipboardList className="w-5 h-5" />
          <span>{lang === 'ur' ? 'آرڈر ٹریک' : 'Track'}</span>
        </button>
      </div>

      {/* Expandable Menu Drawer (Rates, Order History, Pay & QR, AI Sidebar, Rider Portal, Admin Panel, PWA Install) */}
      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-xl">
          <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onOpenRates();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 text-emerald-950 text-xs font-bold border border-emerald-200 cursor-pointer"
            >
              <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{tr.navRates}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenTrackOrder();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50 text-sky-950 text-xs font-bold border border-sky-200 cursor-pointer"
            >
              <ClipboardList className="w-4 h-4 text-sky-700 shrink-0" />
              <span>{lang === 'ur' ? 'لائیو آرڈر ٹریکنگ' : 'Track My Order (Live Map)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenOrderHistory();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 text-slate-900 text-xs font-bold border border-slate-200 cursor-pointer"
            >
              <History className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{tr.navHistory}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenPaymentQr();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-950 text-xs font-bold border border-amber-200 cursor-pointer"
            >
              <QrCode className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{lang === 'ur' ? 'QR و آن لائن ادائیگی' : 'JazzCash / Easypaisa / QR'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenCustomerAI();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-900 text-xs font-bold border border-amber-200 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{lang === 'ur' ? 'AI خریداری سائیڈبار' : 'AI Assistant Sidebar'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenRiderPortal();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50 text-sky-900 text-xs font-bold border border-sky-200 cursor-pointer"
            >
              <Truck className="w-4 h-4 text-sky-700 shrink-0" />
              <span>{tr.navRider}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenAdmin();
                setMenuOpen(false);
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{tr.navAdmin}</span>
            </button>

            <div className="sm:hidden flex items-center">
              <PWAInstallButton lang={lang} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
