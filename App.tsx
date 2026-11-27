import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Sparkles,
  TrendingUp,
  MessageCircle,
  MapPin,
  Clock,
  ShoppingBag,
  ShieldCheck,
  Filter,
  HelpCircle,
  Send,
  QrCode,
  Copy,
  Check,
  X,
  Mic,
  MicOff,
} from 'lucide-react';
import {
  AppLanguage,
  CartItem,
  Order,
  Product,
  ShopSettings,
} from './types';
import {
  DEFAULT_SHOP_SETTINGS,
  KHANEWAL_BUNDLES,
} from './data/initialData';
import { api } from './lib/api';
import { getPendingOfflineOrders } from './lib/offlineQueue';
import { t } from './utils/translations';
import { buildGeneralWhatsAppUrl } from './utils/calculations';
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { TrackOrderModal } from './components/TrackOrderModal';
import { OrderHistoryModal } from './components/OrderHistoryModal';
import { KhanewalRatesModal } from './components/KhanewalRatesModal';
import { CustomerAIAssistant, CustomerAIUiAction } from './components/CustomerAIAssistant';
import { RiderPortalModal } from './components/RiderPortalModal';
import { AdminDashboard } from './components/AdminDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';

const CART_STORAGE_KEY = 'mvfs_cart_v2';

export default function App() {
  const [lang, setLang] = useState<AppLanguage>('ur');
  const [lowBandwidth, setLowBandwidth] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [pendingOfflineCount, setPendingOfflineCount] = useState(
    () => getPendingOfflineOrders().length
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceMicBlocked, setVoiceMicBlocked] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'rating'>('default');

  // Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackOpen, setIsTrackOpen] = useState(false);
  const [trackOrderId, setTrackOrderId] = useState<string | undefined>();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRatesOpen, setIsRatesOpen] = useState(false);
  const [isCustomerAIOpen, setIsCustomerAIOpen] = useState(false);
  const [isRiderOpen, setIsRiderOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isPaymentQrOpen, setIsPaymentQrOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  // Quick Support / Complaint Form
  const [supportForm, setSupportForm] = useState({ name: '', phone: '', message: '' });
  const [supportSent, setSupportSent] = useState(false);

  const handleCopyField = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  const tr = t(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const fetchCatalog = async (forceRefresh = false) => {
    setLoadingProducts(true);
    try {
      const [catRes, settRes] = await Promise.all([
        api.getProducts('all', forceRefresh),
        api.getSettings(),
      ]);
      setProducts(catRes.products);
      setSettings(settRes);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    fetchCatalog(false);
    const updatePending = () => setPendingOfflineCount(getPendingOfflineOrders().length);
    window.addEventListener('mvfs-offline-queue-updated', updatePending);
    return () => window.removeEventListener('mvfs-offline-queue-updated', updatePending);
  }, []);

  const VOICE_ALIAS_MAP: Record<string, string[]> = {
    tamatar: ['tomato', 'ٹماٹر'],
    ٹماٹر: ['tomato', 'tamatar'],
    aalo: ['potato', 'آلو'],
    aloo: ['potato', 'آلو'],
    آلو: ['potato', 'aalo'],
    pyaz: ['onion', 'پیاز'],
    پیاز: ['onion', 'pyaz'],
    seb: ['apple', 'سیب'],
    سیب: ['apple', 'seb'],
    kela: ['banana', 'کیلا'],
    کیلا: ['banana', 'kela'],
    aam: ['mango', 'آم'],
    آم: ['mango', 'aam'],
    palak: ['spinach', 'پالک'],
    پالک: ['spinach', 'palak'],
    mirch: ['chilli', 'pepper', 'مرچ'],
    مرچ: ['chilli', 'mirch'],
    lehsun: ['garlic', 'لہسن'],
    لہسن: ['garlic', 'lehsun'],
    adrak: ['ginger', 'ادرک'],
    ادرک: ['ginger', 'adrak'],
    dhaniya: ['coriander', 'دھنیا'],
    دھنیا: ['coriander', 'dhaniya'],
    podina: ['mint', 'پودینہ'],
    پودینہ: ['mint', 'podina'],
  };

  const recordAndTranscribeVoice = async (stream: MediaStream) => {
    try {
      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      setVoiceListening(true);

      const audioBlob = await new Promise<Blob>((resolve) => {
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, 3500);
      });

      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = String(reader.result || '');
          resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : '');
        };
        reader.readAsDataURL(audioBlob);
      });

      if (base64Audio) {
        const trRes = await api.transcribeVoice(base64Audio, recorder.mimeType || 'audio/webm', lang);
        if (trRes.ok && trRes.transcript) {
          setSearchQuery(trRes.transcript);
          setActiveCategory('all');
          return true;
        }
      }
    } catch {} finally {
      setVoiceListening(false);
      stream.getTracks().forEach((t) => t.stop());
    }
    return false;
  };

  const handleVoiceSearch = async () => {
    setVoiceError('');
    setVoiceMicBlocked(false);

    const inIframe = (() => {
      try {
        return typeof window !== 'undefined' && window.self !== window.top;
      } catch {
        return true;
      }
    })();

    // Step 1: Request browser mic permission explicitly so Chrome prompts user when outside blocked iframe
    let micStream: MediaStream | null = null;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setVoiceListening(false);
        setVoiceMicBlocked(true);
        setVoiceError(
          inIframe
            ? lang === 'ur'
              ? 'آپ ابھی AI Studio Preview فریم میں ہیں جو مائیکروفون روکتا ہے۔ نیچے بٹن سے فل اسکرین ٹیب میں کھول کر بولیں، یا نیچے دیے گئے فوری بٹن دبائیں:'
              : 'AI Studio Preview frame blocks the microphone. Open in a full browser tab to speak, or tap a quick search chip below:'
            : lang === 'ur'
            ? 'مائیکروفون کی اجازت بند ہے۔ براؤزر سیٹنگ میں Mic Allow کریں یا نیچے فوری نام منتخب کریں:'
            : 'Microphone permission denied. Allow Microphone in Chrome site settings or tap a quick search item:'
        );
        return;
      }
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // If native SpeechRecognition unavailable, fall back directly to Gemini server audio transcription
    if (!SpeechRec) {
      if (micStream) {
        const ok = await recordAndTranscribeVoice(micStream);
        if (ok) return;
      }
      setVoiceError(
        lang === 'ur'
          ? 'آواز سے تلاش اس براؤزر میں دستیاب نہیں۔ براہ کرم نیچے ٹائپ کر کے تلاش کریں۔'
          : 'Voice search is unavailable in this browser. Please type in the search box.'
      );
      searchInputRef.current?.focus();
      return;
    }

    // Release test stream before starting SpeechRecognition unless fallback recorder is needed
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
    }

    const startSpeechRec = (recLang: string, allowLangFallback: boolean) => {
      try {
        const rec = new SpeechRec();
        rec.lang = recLang;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        setVoiceListening(true);

        rec.onresult = (event: any) => {
          const transcript = (event.results?.[0]?.[0]?.transcript || '').trim();
          setVoiceListening(false);
          if (transcript) {
            setSearchQuery(transcript);
            setActiveCategory('all');
          }
        };

        rec.onerror = async (event: any) => {
          const code = event?.error || '';
          if (code === 'language-not-supported' && allowLangFallback) {
            startSpeechRec('en-PK', false);
            return;
          }
          setVoiceListening(false);
          if (code === 'service-not-allowed' || code === 'audio-capture' || code === 'network') {
            if (navigator.mediaDevices?.getUserMedia) {
              try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                const ok = await recordAndTranscribeVoice(s);
                if (ok) return;
              } catch {}
            }
          }
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setVoiceMicBlocked(true);
            setVoiceError(
              inIframe
                ? lang === 'ur'
                  ? 'AI Studio Preview فریم مائیکروفون روکتا ہے۔ فل اسکرین ٹیب میں کھول کر بولیں، یا نیچے دیے گئے فوری بٹن سے تلاش کریں:'
                  : 'Preview frame blocks mic access. Open in a full browser tab to speak, or tap a quick item below:'
                : lang === 'ur'
                ? 'مائیکروفون کی اجازت مسترد ہوئی۔ براؤزر سیٹنگ میں مائیک آن کریں یا نیچے سے منتخب کریں:'
                : 'Microphone permission denied. Enable mic access in Chrome or tap a quick item below:'
            );
          } else {
            setVoiceError(
              lang === 'ur'
                ? 'آواز واضح سنائی نہیں دی، دوبارہ کوشش کریں یا ٹائپ کریں۔'
                : 'Could not hear clearly — try again or type your search.'
            );
          }
        };

        rec.onend = () => setVoiceListening(false);
        rec.start();
      } catch {
        setVoiceListening(false);
        setVoiceError(
          lang === 'ur'
            ? 'مائیکروفون شروع کرنے میں مسئلہ ہے۔ براہ کرم ٹائپ کر کے تلاش کریں۔'
            : 'Could not start microphone. Please use text search.'
        );
      }
    };

    startSpeechRec(lang === 'ur' ? 'ur-PK' : 'en-US', lang === 'ur');
  };

  const filteredProducts = useMemo(() => {
    const raw = searchQuery.trim();
    const q = raw.toLowerCase();
    const tokens = q ? q.split(/\s+/) : [];
    let list = products.filter((p) => {
      const hay = `${p.name} ${p.name_en || ''} ${p.urdu_name || ''} ${p.category}`.toLowerCase();
      const matchSearch =
        tokens.length === 0 ||
        tokens.some((tok) => {
          if (hay.includes(tok) || (p.urdu_name || '').includes(raw)) return true;
          const aliases = VOICE_ALIAS_MAP[tok] || [];
          return aliases.some((al) => hay.includes(al.toLowerCase()));
        });

      if (!matchSearch) return false;
      if (activeCategory === 'all') return true;
      if (activeCategory === 'offers') return Boolean(p.is_offer);
      if (activeCategory === 'seasonal') return Boolean(p.is_seasonal);
      if (activeCategory === 'top_selling') return Boolean(p.is_top_selling);
      if (activeCategory === 'recommended') return Boolean(p.is_recommended);
      return p.category === activeCategory;
    });

    if (sortBy === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [products, searchQuery, activeCategory, sortBy]);

  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
  };

  const handleUpdateCartItem = (cartItemId: string, updated: CartItem) => {
    setCart((prev) => prev.map((it) => (it.cartItemId === cartItemId ? updated : it)));
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((it) => it.cartItemId !== cartItemId));
  };

  const handleAddBundle = (bundle: typeof KHANEWAL_BUNDLES[0]) => {
    const built: CartItem[] = [];
    for (const bItem of bundle.items) {
      const prod = products.find((p) => String(p.id) === bItem.productId);
      if (!prod || prod.is_out_of_stock) continue;
      const grams = Math.round(bItem.quantity * 1000);
      built.push({
        cartItemId: `${prod.id}-bundle-${Date.now()}-${Math.random()}`,
        product: prod,
        purchaseType: 'weight',
        weightGrams: grams,
        amountPaid: 0,
        quantity: bItem.quantity,
        unitPrice: prod.price,
        lineTotal: Math.round((prod.price * grams) / 1000),
      });
    }
    if (built.length > 0) {
      setCart((prev) => [...prev, ...built]);
      setIsCartOpen(true);
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportForm.name || !supportForm.phone || !supportForm.message) return;
    await api.submitComplaint({
      customer_name: supportForm.name,
      customer_phone: supportForm.phone,
      subject: 'Customer Feedback / Order Help',
      message: supportForm.message,
    });
    setSupportForm({ name: '', phone: '', message: '' });
    setSupportSent(true);
    setTimeout(() => setSupportSent(false), 4000);
  };

  const waDigits = (settings.whatsapp || '+923007466664').replace(/\D/g, '');
  const waDisplay = `+${waDigits}`;
  const baseKm = settings.baseKm ?? 3;
  const baseFee = settings.baseDeliveryFee ?? 100;
  const extraKm = settings.extraKmRate ?? 30;
  const heroWhatsAppUrl = buildGeneralWhatsAppUrl(
    `السلام علیکم ${settings.shopNameUr || 'مسلم ویجیٹیبل اینڈ فروٹ شاپ'} (${settings.locationUr || 'کیمپ چوک خانیوال'})! مجھے تازہ سبزیاں/پھل آرڈر کرنے ہیں۔`,
    settings.whatsapp
  );

  return (
    <div className={`min-h-screen bg-[#fafaf8] text-slate-900 ${lang === 'ur' ? 'font-urdu' : ''}`}>
      <Navbar
        lang={lang}
        settings={settings}
        activeCategory={activeCategory}
        onToggleLang={() => setLang((prev) => (prev === 'ur' ? 'en' : 'ur'))}
        lowBandwidth={lowBandwidth}
        onToggleLowBandwidth={() => setLowBandwidth((prev) => !prev)}
        cartCount={cart.length}
        cartSubtotal={cart.reduce((sum, it) => sum + it.lineTotal, 0)}
        pendingOfflineCount={pendingOfflineCount}
        onNavigateHome={() => {
          setActiveCategory('all');
          setSearchQuery('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
        onFocusSearch={() => {
          document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
          setTimeout(() => searchInputRef.current?.focus(), 220);
        }}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenRates={() => setIsRatesOpen(true)}
        onOpenTrackOrder={() => {
          setTrackOrderId(undefined);
          setIsTrackOpen(true);
        }}
        onOpenOrderHistory={() => setIsHistoryOpen(true)}
        onOpenRiderPortal={() => setIsRiderOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenCustomerAI={() => setIsCustomerAIOpen(true)}
        onOpenPaymentQr={() => setIsPaymentQrOpen(true)}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-bold">
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span>{tr.deliveryBadge}</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-extrabold leading-snug">
              {lang === 'ur'
                ? 'خانیوال میں تازہ منڈی ریٹس پر سبزیاں اور پھل — وزن یا اپنی مرضی کے روپے لکھ کر خریدیں'
                : 'Fresh Khanewal Mandi Vegetables & Fruits — Order by Weight or Exact Rupee Amount'}
            </h2>

            <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
              {lang === 'ur'
                ? `چاہے 10 روپے کا دھنیا ہو، 50 روپے کے آلو یا 5 کلو پھل — اپنی مرضی کا وزن یا رقم لکھیں۔ کیمپ چوک خانیوال سے ${baseKm} کلومیٹر تک ${baseFee} روپے ڈیلیوری، اس کے بعد ہر اضافی کلومیٹر پر +${extraKm} روپے (جزوی کلومیٹر اوپر راؤنڈ ہوگا)۔`
                : `Order Rs 10, Rs 20, Rs 50, or exact grams/kilograms at live daily Khanewal rates. Delivery Rs ${baseFee} up to ${baseKm} km + Rs ${extraKm} per additional km (fractional km rounded up).`}
            </p>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={() => setIsRatesOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow cursor-pointer"
              >
                <TrendingUp className="w-5 h-5" />
                {tr.navRates}
              </button>
              <a
                href={heroWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow"
              >
                <MessageCircle className="w-5 h-5" />
                <span>{lang === 'ur' ? 'واٹس ایپ آرڈر' : 'WhatsApp Order'}</span>
                <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                  {waDisplay}
                </span>
              </a>
              <button
                onClick={() => setIsPaymentQrOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
              >
                <QrCode className="w-5 h-5 text-amber-300" />
                {lang === 'ur' ? 'QR و اکاؤنٹس' : 'Pay & QR'}
              </button>
              <button
                onClick={() => setIsCustomerAIOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-5 h-5 text-amber-300" />
                {lang === 'ur' ? 'AI خریداری مددگار' : 'Ask AI Assistant'}
              </button>
            </div>
          </div>

          {!lowBandwidth && (
            <div className="lg:col-span-5 hidden sm:block">
              <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400/30 shadow-2xl h-56 sm:h-64">
                <img
                  src="./assets/images/hero_produce_stall_1794208170066.jpg"
                  alt={settings.shopNameEn || 'Muslim Vegetable and Fruit Shop Khanewal'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">
                    {lang === 'ur' ? settings.locationUr : settings.locationEn}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-200">
                    <Clock className="w-3.5 h-3.5" /> {settings.openHours || '7 AM – 10 PM'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Catalog Controls & Grid */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Search, Voice Search, Categories & Sorting */}
        <div
          id="catalog-section"
          className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-emerald-700 absolute start-3.5 top-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (voiceError) setVoiceError('');
                  }}
                  placeholder={tr.searchPlaceholder}
                  className="w-full ps-11 pe-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm font-medium focus:bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>
              <button
                type="button"
                onClick={handleVoiceSearch}
                aria-label={lang === 'ur' ? 'آواز سے تلاش' : 'Voice Search'}
                title={lang === 'ur' ? 'بول کر سبزی یا پھل تلاش کریں (اردو و انگریزی)' : 'Speak to search vegetables & fruits (Urdu & English)'}
                className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-1.5 border shrink-0 transition cursor-pointer ${
                  voiceListening
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse shadow'
                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300'
                }`}
              >
                {voiceListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-800" />}
                <span>{voiceListening ? (lang === 'ur' ? 'سن رہا ہوں...' : 'Listening') : (lang === 'ur' ? 'بول کر تلاش' : 'Voice')}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-emerald-700 hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full sm:w-auto px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-800"
              >
                <option value="default">{lang === 'ur' ? 'ترتیب: دکان کی فہرست' : 'Sort: Store Default'}</option>
                <option value="price_asc">{lang === 'ur' ? 'قیمت: کم سے زیادہ' : 'Price: Low to High'}</option>
                <option value="price_desc">{lang === 'ur' ? 'قیمت: زیادہ سے کم' : 'Price: High to Low'}</option>
                <option value="rating">{lang === 'ur' ? 'اعلیٰ معیار / ریٹنگ' : 'Top Rated Freshness'}</option>
              </select>
            </div>
          </div>

          {voiceListening && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
              {lang === 'ur'
                ? 'سن رہا ہوں... کسی بھی سبزی یا پھل کا نام بولیں (مثلاً ٹماٹر، سیب، آلو)'
                : 'Listening... speak a fruit or vegetable name (e.g. Tomato, Apple, Aalo)'}
            </p>
          )}
          {voiceError && (
            <div className="text-xs font-bold text-amber-950 bg-amber-50 p-2.5 rounded-xl border border-amber-300 space-y-2">
              <p>{voiceError}</p>
              {voiceMicBlocked && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {typeof window !== 'undefined' && (() => {
                    try {
                      return window.self !== window.top;
                    } catch {
                      return true;
                    }
                  })() && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-extrabold"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {lang === 'ur' ? 'فل اسکرین براؤزر میں مائیک کھولیں' : 'Open Full Browser Tab for Mic'}
                    </a>
                  )}
                  {[
                    { label: lang === 'ur' ? 'آلو' : 'Potato', q: 'Potato' },
                    { label: lang === 'ur' ? 'ٹماٹر' : 'Tomato', q: 'Tomato' },
                    { label: lang === 'ur' ? 'پیاز' : 'Onion', q: 'Onion' },
                    { label: lang === 'ur' ? 'سیب' : 'Apple', q: 'Apple' },
                    { label: lang === 'ur' ? 'کیلا' : 'Banana', q: 'Banana' },
                    { label: lang === 'ur' ? 'آم' : 'Mango', q: 'Mango' },
                    { label: lang === 'ur' ? 'سبز مرچ' : 'Chilli', q: 'Chilli' },
                  ].map((chip) => (
                    <button
                      key={chip.q}
                      type="button"
                      onClick={() => {
                        setSearchQuery(chip.q);
                        setActiveCategory('all');
                        setVoiceError('');
                        setVoiceMicBlocked(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-emerald-100 text-emerald-950 text-[11px] font-extrabold cursor-pointer"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: tr.allItems },
              { id: 'vegetables', label: tr.vegetables },
              { id: 'fruits', label: tr.fruits },
              { id: 'herbs', label: tr.herbs },
              { id: 'offers', label: tr.offers },
              { id: 'seasonal', label: tr.seasonal },
              { id: 'top_selling', label: tr.topSelling },
              { id: 'recommended', label: tr.recommended },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap border transition cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-400'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loadingProducts && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-80 rounded-2xl bg-slate-200/70 animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-2">
            <p className="font-extrabold text-slate-800">
              {lang === 'ur' ? 'کوئی سبزی یا پھل نہیں ملا' : 'No matching items found'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold cursor-pointer"
            >
              {lang === 'ur' ? 'تمام اشیاء دکھائیں' : 'Show All Produce'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                lang={lang}
                lowBandwidth={lowBandwidth}
                onAddToCart={handleAddToCart}
                onOpenDetail={setSelectedProduct}
              />
            ))}
          </div>
        )}

        {/* Quick Kitchen Bundles (Computed dynamically from live product prices) */}
        <section className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-emerald-950 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-emerald-700" />
                {lang === 'ur' ? 'فیملی ہانڈی و فروٹ پیکجز' : 'Family Kitchen & Fruit Packs'}
              </h3>
              <p className="text-xs text-slate-500">
                {lang === 'ur'
                  ? 'روزانہ کی تازہ سبزیوں اور پھلوں کا مکمل پیکج براہِ راست ٹوکری میں شامل کریں'
                  : 'One-tap bundles priced transparently from live store inventory'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KHANEWAL_BUNDLES.map((bundle) => {
              const liveTotal = bundle.items.reduce((sum, bi) => {
                const p = products.find((x) => String(x.id) === bi.productId);
                return sum + (p ? Math.round(p.price * bi.quantity) : 0);
              }, 0);
              return (
                <div
                  key={bundle.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">
                      {lang === 'ur' ? bundle.titleUr : bundle.titleEn}
                    </h4>
                    <p className="text-xs text-slate-600 mt-1">
                      {lang === 'ur' ? bundle.descriptionUr : bundle.descriptionEn}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="font-mono-num font-extrabold text-emerald-800">
                      {liveTotal > 0 ? `Rs. ${liveTotal}` : '--'}
                    </span>
                    <button
                      onClick={() => handleAddBundle(bundle)}
                      className="px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold cursor-pointer"
                    >
                      {lang === 'ur' ? 'آپ کی ٹوکری میں ڈالیں' : 'Add Pack to Cart'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Customer Help / Complaint Box */}
        <section className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-extrabold text-emerald-950 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-emerald-700" />
              {lang === 'ur' ? 'کسٹمر سپورٹ و شکایت مرکز' : 'Customer Support & Feedback'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {lang === 'ur'
                ? 'وزن، کوالٹی یا ڈیلیوری کے حوالے سے کوئی بھی پیغام یا شکایت براہِ راست مالک (حامد علی) کو بھیجیں۔'
                : 'Send any weight, freshness, or delivery question directly to Shop Owner Hamid Ali.'}
            </p>
            <div className="flex flex-wrap gap-2 text-xs pt-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {lang === 'ur' ? 'تازگی اور پورے وزن کی ضمانت' : 'Accurate Digital Scale & Freshness Guarantee'}
              </span>
            </div>
          </div>

          <form onSubmit={handleSupportSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <input
              type="text"
              required
              placeholder={lang === 'ur' ? 'آپ کا نام' : 'Your Name'}
              value={supportForm.name}
              onChange={(e) => setSupportForm({ ...supportForm, name: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-300"
            />
            <input
              type="tel"
              required
              placeholder={lang === 'ur' ? 'موبائل نمبر' : 'Phone Number'}
              value={supportForm.phone}
              onChange={(e) => setSupportForm({ ...supportForm, phone: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-300 font-mono-num"
            />
            <input
              type="text"
              required
              placeholder={lang === 'ur' ? 'اپنا پیغام یا شکایت لکھیں...' : 'Write your message or feedback...'}
              value={supportForm.message}
              onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300"
            />
            <button
              type="submit"
              className="sm:col-span-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {supportSent
                ? lang === 'ur'
                  ? 'آپ کا پیغام مالک کو موصول ہو گیا ✓'
                  : 'Submitted to Shop Owner ✓'
                : lang === 'ur'
                ? 'پیغام بھیجیں'
                : 'Send Support Message'}
            </button>
          </form>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-emerald-950 text-emerald-100 py-8 px-4 sm:px-6 mt-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
          <div className="space-y-1.5">
            <h4 className="text-sm font-extrabold text-white">
              {lang === 'ur' ? settings.shopNameUr || tr.shopName : settings.shopNameEn || tr.shopName}
            </h4>
            <p className="text-emerald-300">{settings.locationUr}</p>
            <p className="text-emerald-300">{settings.locationEn}</p>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-extrabold text-white">
              {lang === 'ur' ? 'خانیوال ڈیلیوری پالیسی' : 'Khanewal Delivery Policy'}
            </h4>
            <p>{baseKm} km {lang === 'ur' ? `تک: ${baseFee} روپے` : `base zone: Rs. ${baseFee}`}</p>
            <p>
              {lang === 'ur'
                ? `${baseKm} کلومیٹر کے بعد: +${extraKm} روپے فی اضافی کلومیٹر (جزوی کلومیٹر اوپر راؤنڈ)`
                : `Beyond ${baseKm} km: +Rs. ${extraKm} per additional km (fractional km rounded up)`}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-extrabold text-white">
              {lang === 'ur' ? 'آفیشل واٹس ایپ و ادائیگی' : 'WhatsApp & Payments'}
            </h4>
            <p className="flex items-center gap-1.5">
              <span>WhatsApp:</span>
              <a
                href={heroWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="inline-block font-mono-num font-bold text-amber-300 hover:underline [unicode-bidi:isolate]"
              >
                {waDisplay}
              </a>
            </p>
            <p>JazzCash Merchant & Personal • Easypaisa • Bank Alfalah • Raast • COD</p>
            <button
              type="button"
              onClick={() => setIsPaymentQrOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              <QrCode className="w-5 h-5" />
              {lang === 'ur' ? 'QR کوڈ اور بینک تفصیلات دیکھیں' : 'View JazzCash / Raast QR & Bank IDs'}
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={selectedProduct}
        lang={lang}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartDrawer
        isOpen={isCartOpen}
        lang={lang}
        settings={settings}
        items={cart}
        onClose={() => setIsCartOpen(false)}
        onUpdateItem={handleUpdateCartItem}
        onRemoveItem={handleRemoveCartItem}
        onProceedCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        lang={lang}
        items={cart}
        settings={settings}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderSuccess={(_order: Order) => {
          setCart([]);
          fetchCatalog(false);
        }}
        onOfflineQueued={() => {
          setCart([]);
        }}
        onOpenTrackOrder={(id) => {
          setTrackOrderId(id);
          setIsTrackOpen(true);
        }}
      />

      <TrackOrderModal
        isOpen={isTrackOpen}
        initialOrderId={trackOrderId}
        lang={lang}
        settings={settings}
        onClose={() => setIsTrackOpen(false)}
      />

      <OrderHistoryModal
        isOpen={isHistoryOpen}
        lang={lang}
        products={products}
        onClose={() => setIsHistoryOpen(false)}
        onTrackOrder={(id) => {
          setTrackOrderId(id);
          setIsTrackOpen(true);
        }}
        onReorderItems={(newItems) => {
          setCart((prev) => [...prev, ...newItems]);
          setIsCartOpen(true);
        }}
      />

      <KhanewalRatesModal
        isOpen={isRatesOpen}
        lang={lang}
        products={products}
        onClose={() => setIsRatesOpen(false)}
        onRefresh={() => fetchCatalog(true)}
      />

      <CustomerAIAssistant
        isOpen={isCustomerAIOpen}
        lang={lang}
        products={products}
        cartCount={cart.length}
        cartSubtotal={cart.reduce((s, it) => s + it.lineTotal, 0)}
        onClose={() => setIsCustomerAIOpen(false)}
        onAddProposedItems={(items) => {
          setCart((prev) => [...prev, ...items]);
          setIsCartOpen(true);
        }}
        onExecuteUiAction={(action: CustomerAIUiAction) => {
          // Strictly whitelisted safe customer storefront actions ONLY (Admin & Rider portals strictly isolated)
          switch (action.type) {
            case 'open_cart':
              setIsCustomerAIOpen(false);
              setIsCartOpen(true);
              break;
            case 'open_checkout':
              setIsCustomerAIOpen(false);
              if (cart.length > 0) setIsCheckoutOpen(true);
              else setIsCartOpen(true);
              break;
            case 'open_track_order':
              setIsCustomerAIOpen(false);
              if (action.value && /^MVF-/i.test(action.value.trim())) {
                setTrackOrderId(action.value.trim().toUpperCase());
              }
              setIsTrackOpen(true);
              break;
            case 'open_rates':
              setIsCustomerAIOpen(false);
              setIsRatesOpen(true);
              break;
            case 'open_payment_qr':
              setIsCustomerAIOpen(false);
              setIsPaymentQrOpen(true);
              break;
            case 'open_history':
              setIsCustomerAIOpen(false);
              setIsHistoryOpen(true);
              break;
            case 'filter_category':
              if (
                action.value &&
                ['all', 'vegetables', 'fruits', 'herbs', 'offers', 'seasonal', 'top_selling', 'recommended'].includes(
                  action.value
                )
              ) {
                setActiveCategory(action.value);
                setSearchQuery('');
                document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
              }
              break;
            case 'search_product':
              if (action.value) {
                setActiveCategory('all');
                setSearchQuery(action.value);
                document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
              }
              break;
            case 'switch_language':
              setLang(action.value === 'en' ? 'en' : 'ur');
              break;
            case 'open_whatsapp':
              window.location.assign(heroWhatsAppUrl);
              break;
            default:
              break;
          }
        }}
      />

      <RiderPortalModal
        isOpen={isRiderOpen}
        lang={lang}
        onClose={() => setIsRiderOpen(false)}
      />

      <AdminDashboard
        isOpen={isAdminOpen}
        lang={lang}
        onClose={() => setIsAdminOpen(false)}
        onCatalogUpdated={() => fetchCatalog(true)}
      />

      {/* Official HAMID Shop Payment & QR Modal */}
      {isPaymentQrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-5 h-5 text-amber-300" />
                <div>
                  <h2 className="text-base font-extrabold">
                    {lang === 'ur'
                      ? 'آن لائن ادائیگی — JazzCash, Raast QR اور بینک الفلاح'
                      : 'Official Payment Accounts & QR — HAMID Shop'}
                  </h2>
                  <p className="text-[11px] text-emerald-300">
                    {lang === 'ur'
                      ? 'اسکین کریں یا اکاؤنٹ نمبر کاپی کر کے ادائیگی کے بعد رسید واٹس ایپ کریں'
                      : 'Scan official QR or copy ID below, then share screenshot on WhatsApp'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentQrOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              <div className="md:col-span-5 flex flex-col items-center bg-amber-50 border border-amber-300 rounded-2xl p-3">
                <img
                  src={
                    settings.jazzCashQrImage.startsWith('/assets/')
                      ? `.${settings.jazzCashQrImage}`
                      : settings.jazzCashQrImage
                  }
                  alt="HAMID Shop JazzCash & Raast QR"
                  className="w-full max-w-[230px] rounded-xl border border-amber-300 bg-white object-contain"
                />
                <p className="mt-2 text-xs font-extrabold text-amber-950">
                  {settings.jazzCashStoreName || 'HAMID Shop'} • TILL ID: <span className="font-mono-num">{settings.jazzCashTillId}</span>
                </p>
                <p className="text-[11px] text-amber-800">
                  {lang === 'ur' ? `JazzCash ڈائل کریں: ${settings.jazzCashUssd}` : `Dial ${settings.jazzCashUssd}`}
                </p>
              </div>

              <div className="md:col-span-7 space-y-3 text-xs">
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <h3 className="font-extrabold text-sm text-amber-950">
                    JazzCash Business & Raast ({settings.jazzCashStoreName})
                  </h3>
                  {[
                    { key: 'jc-acc', label: 'JazzCash / Raast ID', val: settings.jazzCashAccount },
                    { key: 'jc-till', label: 'JazzCash Merchant TILL ID', val: settings.jazzCashTillId },
                    { key: 'jc-iban', label: 'JazzCash IBAN', val: settings.jazzCashIban },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-amber-200"
                    >
                      <div className="min-w-0">
                        <span className="block text-[10px] text-slate-500">{row.label}</span>
                        <strong className="font-mono-num text-slate-900 break-all">{row.val}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyField(row.val, row.key)}
                        className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey === row.key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === row.key ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-1.5">
                  <h3 className="font-extrabold text-sm text-emerald-950">
                    {lang === 'ur' ? 'ذاتی JazzCash اور Easypaisa اکاؤنٹس' : 'JazzCash Personal & Easypaisa'}
                  </h3>
                  <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-emerald-200">
                    <div>
                      <span className="block text-[10px] text-slate-500">JazzCash Personal ({settings.jazzCashPersonalTitle || 'HAMID ALI'})</span>
                      <strong className="font-mono-num text-slate-900">
                        {settings.jazzCashPersonalAccount || `Confirm via WhatsApp ${waDisplay}`}
                      </strong>
                    </div>
                    {settings.jazzCashPersonalAccount && (
                      <button
                        type="button"
                        onClick={() => handleCopyField(settings.jazzCashPersonalAccount || '', 'jc-p')}
                        className="px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold cursor-pointer"
                      >
                        {copiedKey === 'jc-p' ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-emerald-200">
                    <div>
                      <span className="block text-[10px] text-slate-500">Easypaisa ({settings.easypaisaTitle || 'HAMID ALI'})</span>
                      <strong className="font-mono-num text-slate-900">
                        {settings.easypaisaAccount || `Confirm via WhatsApp ${waDisplay}`}
                      </strong>
                    </div>
                    {settings.easypaisaAccount && (
                      <button
                        type="button"
                        onClick={() => handleCopyField(settings.easypaisaAccount || '', 'ep-p')}
                        className="px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold cursor-pointer"
                      >
                        {copiedKey === 'ep-p' ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
                  <h3 className="font-extrabold text-sm text-sky-950">
                    {settings.bankName} ({settings.bankBranch})
                  </h3>
                  <p className="text-[11px] text-slate-700">
                    Title: <strong>{settings.bankAccountTitle}</strong> • SWIFT:{' '}
                    <strong className="font-mono-num">{settings.bankSwiftCode}</strong>
                  </p>
                  {[
                    { key: 'bank-acc', label: 'Account Number', val: settings.bankAccountNumber },
                    { key: 'bank-iban', label: 'Bank Alfalah IBAN', val: settings.bankIban },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-sky-200"
                    >
                      <div className="min-w-0">
                        <span className="block text-[10px] text-slate-500">{row.label}</span>
                        <strong className="font-mono-num text-slate-900 break-all">{row.val}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyField(row.val, row.key)}
                        className="px-2 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-950 font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey === row.key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === row.key ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))}
                </div>

                <a
                  href={buildGeneralWhatsAppUrl(
                    `السلام علیکم ${settings.shopNameUr || 'مسلم ویجیٹیبل اینڈ فروٹ شاپ'}! میں نے آن لائن ادائیگی کر دی ہے، رسید بھیج رہا ہوں۔`,
                    settings.whatsapp
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>
                    {lang === 'ur' ? 'واٹس ایپ پر ادائیگی کی رسید بھیجیں' : 'Send Payment Proof on WhatsApp'}
                  </span>
                  <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                    {waDisplay}
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Floating Official AI Assistant Launcher */}
      {!isCustomerAIOpen && (
        <button
          type="button"
          onClick={() => setIsCustomerAIOpen(true)}
          title={lang === 'ur' ? 'آفیشل AI خریداری مددگار کھولیں' : 'Open Official AI Shopping Assistant'}
          className="fixed bottom-4 end-4 z-30 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-extrabold text-xs sm:text-sm shadow-xl border border-amber-400/50 cursor-pointer transition hover:scale-[1.02]"
        >
          <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
          <span>{lang === 'ur' ? 'AI مددگار سے پوچھیں' : 'Ask AI Assistant'}</span>
        </button>
      )}

      <OfflineIndicator lang={lang} onSyncComplete={() => fetchCatalog(true)} />
    </div>
  );
}
