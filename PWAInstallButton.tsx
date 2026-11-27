import React, { useState } from 'react';
import { Download, CheckCircle, Smartphone, X, Wifi } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppLanguage } from '../types';

interface PWAInstallButtonProps {
  lang?: AppLanguage;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang = 'ur' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return (
      <div className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-100 rounded-lg border border-emerald-300">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
        <span>{lang === 'ur' ? 'انسٹال شدہ ایپ' : 'Installed App'}</span>
      </div>
    );
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'ur' ? 'ایپ انسٹال کریں' : 'Install App'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 transition cursor-pointer"
        title={lang === 'ur' ? 'فون پر ایپ انسٹال کریں' : 'Install App on Android / iPhone'}
      >
        <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
        <span className="hidden sm:inline">{lang === 'ur' ? 'موبائل ایپ' : isIOS ? 'iPhone App' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl relative text-start">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute top-4 end-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lang === 'ur' ? 'مسلم شاپ موبائل ایپ انسٹال کریں' : 'Install Muslim Vegetable & Fruit Shop App'}
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  {lang === 'ur' ? 'آف لائن ریٹ لسٹ اور تیز آرڈرنگ' : 'Offline catalog & fast home-screen launch'}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {isIOS ? (
                <>
                  <p className="font-bold text-slate-900">{lang === 'ur' ? 'آئی فون (Safari):' : 'iPhone / iPad (Safari):'}</p>
                  <p>1. {lang === 'ur' ? 'نیچے Share آئیکن پر ٹیپ کریں۔' : 'Tap the Share icon in Safari.'}</p>
                  <p>2. {lang === 'ur' ? '"Add to Home Screen" منتخب کریں۔' : 'Tap "Add to Home Screen".'}</p>
                  <p>3. {lang === 'ur' ? '"Add" پر کلک کر کے محفوظ کریں۔' : 'Tap "Add" to install as an app.'}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-900">{lang === 'ur' ? 'اینڈرائیڈ (Chrome) یا ڈیسک ٹاپ:' : 'Android (Chrome) or Desktop:'}</p>
                  <p>1. {lang === 'ur' ? 'براؤزر کے مینو (⋮) پر ٹیپ کریں۔' : 'Open browser menu (⋮ in Chrome top-right).'}</p>
                  <p>2. {lang === 'ur' ? '"Install App" یا "Add to Home Screen" پر کلک کریں۔' : 'Tap "Install App" or "Add to Home Screen".'}</p>
                  <p>3. {lang === 'ur' ? 'مالک پینل، رائڈر پورٹل اور کسٹمر اسٹور الگ ایپ کے طور پر کھل جائے گا۔' : 'Works full-screen with cached offline rates.'}</p>
                </>
              )}
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition cursor-pointer"
            >
              {lang === 'ur' ? 'سمجھ آ گیا' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
