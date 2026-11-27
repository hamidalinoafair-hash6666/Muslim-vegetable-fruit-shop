import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Send,
  ShoppingBasket,
  CheckCircle2,
  AlertCircle,
  Mic,
  MicOff,
  Compass,
  ShieldCheck,
} from 'lucide-react';
import { AppLanguage, CartItem, Product } from '../types';
import { api } from '../lib/api';

export interface CustomerAIUiAction {
  type:
    | 'open_cart'
    | 'open_checkout'
    | 'open_track_order'
    | 'open_rates'
    | 'open_payment_qr'
    | 'open_history'
    | 'filter_category'
    | 'search_product'
    | 'switch_language'
    | 'open_whatsapp';
  value?: string;
  label?: string;
}

interface CustomerAIAssistantProps {
  isOpen: boolean;
  lang: AppLanguage;
  products: Product[];
  cartCount: number;
  cartSubtotal: number;
  onClose: () => void;
  onAddProposedItems: (items: CartItem[]) => void;
  onExecuteUiAction: (action: CustomerAIUiAction) => void;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
  proposedCartItems?: Array<{
    productId: string;
    productName: string;
    purchaseType: 'weight' | 'amount';
    weightGrams: number;
    amountPaid: number;
    lineTotal: number;
  }> | null;
  uiAction?: CustomerAIUiAction | null;
}

export const CustomerAIAssistant: React.FC<CustomerAIAssistantProps> = ({
  isOpen,
  lang,
  products,
  cartCount,
  cartSubtotal,
  onClose,
  onAddProposedItems,
  onExecuteUiAction,
}) => {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text:
        lang === 'ur'
          ? 'السلام علیکم! میں مسلم ویجیٹیبل اینڈ فروٹ شاپ خانیوال کا آفیشل AI مددگار ہوں۔ آپ مجھ سے سبزیوں و پھلوں کے ریٹس پوچھ سکتے ہیں، 2 کلو / 5 کلو یا 50 روپے کی خریداری کر کے ٹوکری میں ڈال سکتے ہیں، یا پوری ویب سائٹ میں کوئی بھی حصہ (ٹوکری، چیک آؤٹ، آرڈر ٹریکنگ، منڈی ریٹس، QR اکاؤنٹس) کھلوا سکتے ہیں۔'
          : 'Assalam-o-Alaikum! I am your official Muslim Vegetable & Fruit Shop AI Guide. Ask live Khanewal prices, calculate & add 2Kg–5Kg or Rs.10+ items to your cart, search categories, check JazzCash/Bank QR, track orders, or open checkout — all safely separated from Owner Admin controls.',
    },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const sendPrompt = async (promptText: string) => {
    const prompt = promptText.trim();
    if (!prompt || loading) return;

    const historyForApi = messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setInput('');
    setMicNote('');
    setMessages((prev) => [...prev, { role: 'user', text: prompt }]);
    setLoading(true);

    try {
      const ordMatch = prompt.match(/MVF-\d+/i);
      const res = await api.runCustomerAI(prompt, lang, ordMatch ? ordMatch[0] : undefined, {
        history: historyForApi,
        cartSummary: { count: cartCount, subtotal: cartSubtotal },
      });

      const uiAction: CustomerAIUiAction | null = res.uiAction || null;

      // Auto-apply gentle catalog filtering/searching in the background so customer sees it right away
      if (uiAction && (uiAction.type === 'filter_category' || uiAction.type === 'search_product')) {
        onExecuteUiAction(uiAction);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.reply,
          isError: !res.ok,
          proposedCartItems: res.proposedCartItems,
          uiAction,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          isError: true,
          text:
            err?.message ||
            (lang === 'ur'
              ? 'اس وقت AI سروس دستیاب نہیں۔ آپ براہِ راست دکان سے خریداری یا واٹس ایپ (+923007466664) پر آرڈر کر سکتے ہیں۔'
              : 'AI service unavailable. You can shop directly or send your order on WhatsApp (+923007466664).'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input);
  };

  const handleVoiceInput = async () => {
    setMicNote('');
    const inIframe = (() => {
      try {
        return typeof window !== 'undefined' && window.self !== window.top;
      } catch {
        return true;
      }
    })();

    let stream: MediaStream | null = null;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setListening(false);
        setMicNote(
          inIframe
            ? lang === 'ur'
              ? 'Preview فریم مائیک روکتا ہے۔ نیچے ٹائپ کریں یا فل اسکرین ٹیب کھولیں:'
              : 'Preview frame blocks mic — type below or open full tab:'
            : lang === 'ur'
            ? 'مائیکروفون کی اجازت بند ہے۔ براؤزر سیٹنگ میں مائیک آن کریں یا ٹائپ کریں۔'
            : 'Mic permission blocked — enable mic in Chrome or type below.'
        );
        return;
      }
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const runAudioFallback = async (recStream: MediaStream) => {
      try {
        if (typeof MediaRecorder === 'undefined') return false;
        const chunks: BlobPart[] = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        const recorder = mimeType ? new MediaRecorder(recStream, { mimeType }) : new MediaRecorder(recStream);
        setListening(true);
        const blob = await new Promise<Blob>((resolve) => {
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.onstop = () => {
            recStream.getTracks().forEach((t) => t.stop());
            resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          };
          recorder.start();
          setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, 3500);
        });
        const b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => {
            const d = String(r.result || '');
            resolve(d.includes(',') ? d.split(',')[1] : '');
          };
          r.readAsDataURL(blob);
        });
        if (b64) {
          const res = await api.transcribeVoice(b64, recorder.mimeType || 'audio/webm', lang);
          if (res.ok && res.transcript) {
            setInput(res.transcript);
            return true;
          }
        }
      } catch {} finally {
        setListening(false);
        recStream.getTracks().forEach((t) => t.stop());
      }
      return false;
    };

    if (!SpeechRec) {
      if (stream && (await runAudioFallback(stream))) return;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setMicNote(
        lang === 'ur'
          ? 'اس براؤزر میں مائیک دستیاب نہیں، براہ کرم نیچے ٹائپ کریں۔'
          : 'Voice input unavailable in this browser — please type below.'
      );
      return;
    }

    if (stream) stream.getTracks().forEach((t) => t.stop());

    try {
      const rec = new SpeechRec();
      rec.lang = lang === 'ur' ? 'ur-PK' : 'en-US';
      rec.interimResults = false;
      setListening(true);
      rec.onresult = (ev: any) => {
        const spoken = (ev.results?.[0]?.[0]?.transcript || '').trim();
        setListening(false);
        if (spoken) {
          setInput(spoken);
        }
      };
      rec.onerror = async (ev: any) => {
        setListening(false);
        const code = ev?.error || '';
        if ((code === 'service-not-allowed' || code === 'network' || code === 'language-not-supported') && navigator.mediaDevices?.getUserMedia) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (await runAudioFallback(s)) return;
          } catch {}
        }
        setMicNote(
          inIframe
            ? lang === 'ur'
              ? 'Preview فریم مائیک روکتا ہے۔ نیچے ٹائپ کریں یا فل اسکرین ٹیب کھولیں:'
              : 'Preview frame blocks mic — type below or open full tab:'
            : lang === 'ur'
            ? 'مائیکروفون اجازت یا آواز واضح نہیں ملی، براہ کرم ٹائپ کریں۔'
            : 'Microphone blocked or unclear — please type your question.'
        );
      };
      rec.onend = () => setListening(false);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const handleConfirmProposal = (proposed: NonNullable<ChatMsg['proposedCartItems']>) => {
    const built: CartItem[] = [];
    for (const pItem of proposed) {
      const prod = products.find((p) => String(p.id) === String(pItem.productId));
      if (!prod || prod.is_out_of_stock) continue;
      const grams = Math.max(50, Math.round(pItem.weightGrams || 1000));
      const lineTotal = Math.round(pItem.lineTotal || (prod.price * grams) / 1000);
      built.push({
        cartItemId: `${prod.id}-ai-${Date.now()}-${Math.random()}`,
        product: prod,
        purchaseType: pItem.purchaseType === 'amount' ? 'amount' : 'weight',
        weightGrams: grams,
        amountPaid: pItem.purchaseType === 'amount' ? lineTotal : 0,
        quantity: Math.round((grams / 1000) * 1000) / 1000,
        unitPrice: prod.price,
        lineTotal,
      });
    }
    if (built.length > 0) {
      onAddProposedItems(built);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text:
            lang === 'ur'
              ? 'تصدیق شدہ اشیاء آپ کی ٹوکری میں شامل کر دی گئیں ✓'
              : 'Confirmed items added to your basket ✓',
        },
      ]);
    }
  };

  const defaultActionLabel = (act: CustomerAIUiAction) => {
    if (act.label) return act.label;
    const map: Record<string, { ur: string; en: string }> = {
      open_cart: { ur: 'آپ کی ٹوکری کھولیں', en: 'Open Your Cart' },
      open_checkout: { ur: 'چیک آؤٹ / آرڈر مکمل کریں', en: 'Proceed to Checkout' },
      open_track_order: { ur: 'لائیو آرڈر ٹریکنگ کھولیں', en: 'Open Live Order Tracker' },
      open_rates: { ur: 'آج کے منڈی ریٹس دیکھیں', en: 'View Daily Mandi Rates' },
      open_payment_qr: { ur: 'JazzCash / Raast QR اور بینک دیکھیں', en: 'View Payment QR & Accounts' },
      open_history: { ur: 'آرڈر ہسٹری دیکھیں', en: 'Open Order History' },
      filter_category: { ur: 'متعلقہ زمرہ دیکھیں', en: 'Show Category Items' },
      search_product: { ur: 'تلاش کے نتائج دیکھیں', en: 'View Search Results' },
      switch_language: { ur: 'زبان تبدیل کریں', en: 'Switch Language' },
      open_whatsapp: { ur: 'واٹس ایپ +923007466664 کھولیں', en: 'Open WhatsApp +923007466664' },
    };
    return map[act.type]?.[lang] || (lang === 'ur' ? 'صفحہ کھولیں' : 'Open Section');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs"
      role="dialog"
      aria-label="AI Assistant Sidebar"
      data-testid="ai-assistant-sidebar"
    >
      <aside className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-left border-s border-emerald-900/15">
        <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">
                {lang === 'ur' ? 'آفیشل AI خریداری اسسٹنٹ' : 'Official Storefront AI Guide'}
              </h3>
              <p className="text-[11px] text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>
                  {lang === 'ur'
                    ? 'پوری کسٹمر ویب سائٹ تک رسائی (ایڈمن پینل مکمل محفوظ)'
                    : 'Full Customer Access • Admin Strictly Protected'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Sidebar"
            className="p-2 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Quick Prompt Chips across Storefront */}
        <div className="px-4 py-2.5 bg-emerald-50/70 border-b border-emerald-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          {[
            lang === 'ur' ? 'آج آلو اور ٹماٹر کا ریٹ کیا ہے؟' : 'Today potato & tomato prices?',
            lang === 'ur' ? '2 کلو سیب اور 1 کلو کیلا ٹوکری میں ڈالیں' : 'Add 2 kg apples and 1 dozen bananas',
            lang === 'ur' ? '100 روپے کا پیاز کتنا ملے گا؟' : 'How much onion for Rs. 100?',
            lang === 'ur' ? 'میری ٹوکری دکھائیں' : 'Show my cart',
            lang === 'ur' ? 'موسمی پھل اور آج کی آفرز دکھائیں' : 'Show offers & fruits',
            lang === 'ur' ? 'JazzCash اور بینک تفصیلات دکھائیں' : 'Show JazzCash QR & Bank IDs',
          ].map((quick, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => sendPrompt(quick)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap cursor-pointer"
            >
              {quick}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-[92%] rounded-2xl p-3.5 text-xs sm:text-sm space-y-2.5 ${
                msg.role === 'user'
                  ? 'ms-auto bg-emerald-800 text-white'
                  : msg.isError
                  ? 'me-auto bg-amber-50 border border-amber-300 text-amber-950'
                  : 'me-auto bg-white border border-slate-200 text-slate-800 shadow-xs'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

              {msg.proposedCartItems && msg.proposedCartItems.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-[11px] font-bold text-amber-950 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {lang === 'ur' ? 'ٹوکری میں شامل کرنے کی تصدیق:' : 'Confirm items to add to basket:'}
                  </p>
                  {msg.proposedCartItems.map((pi, k) => (
                    <div key={k} className="flex justify-between text-[11px] font-bold text-slate-800">
                      <span>
                        {pi.productName} ({pi.weightGrams >= 1000 ? `${(pi.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')} Kg` : `${pi.weightGrams}g`})
                      </span>
                      <span className="font-mono-num">Rs. {pi.lineTotal}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleConfirmProposal(msg.proposedCartItems!)}
                    className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <ShoppingBasket className="w-4 h-4" />
                    {lang === 'ur' ? 'تصدیق کریں اور آپ کی ٹوکری میں ڈالیں' : 'Confirm & Add to Your Cart'}
                  </button>
                </div>
              )}

              {msg.uiAction && (
                <button
                  type="button"
                  onClick={() => onExecuteUiAction(msg.uiAction!)}
                  className="w-full py-2 px-3 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Compass className="w-4 h-4 shrink-0" />
                  <span>{defaultActionLabel(msg.uiAction)}</span>
                </button>
              )}
            </div>
          ))}
          {loading && (
            <p className="text-xs font-semibold text-emerald-800 animate-pulse">
              {lang === 'ur' ? 'دکان کے لائیو ریٹس چیک ہو رہے ہیں...' : 'Checking live store catalog...'}
            </p>
          )}
        </div>

        {/* Input Form with Voice Support */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-1.5 shrink-0">
          {micNote && (
            <div className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 font-semibold flex flex-wrap items-center gap-2">
              <span>{micNote}</span>
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
                  className="px-2 py-0.5 rounded bg-emerald-800 text-white text-[10px] font-extrabold"
                >
                  {lang === 'ur' ? 'فل اسکرین ٹیب کھولیں' : 'Open Full Tab'}
                </a>
              )}
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <button
              type="button"
              onClick={handleVoiceInput}
              aria-label={lang === 'ur' ? 'AI سے بول کر بات کریں' : 'Speak to AI Assistant'}
              title={lang === 'ur' ? 'بول کر سوال پوچھیں' : 'Speak question (Urdu or English)'}
              className={`p-2.5 rounded-xl border transition shrink-0 cursor-pointer ${
                listening
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
              }`}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={lang === 'ur' ? 'سوال لکھیں یا مائیک سے بولیں...' : 'Ask or speak in Urdu / English...'}
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:border-emerald-700"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Send message"
              className="px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-400 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
};
