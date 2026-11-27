import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { AppLanguage, PendingOfflineOrder } from '../types';
import {
  getPendingOfflineOrders,
  removeOfflineOrder,
  syncPendingOfflineOrders,
} from '../lib/offlineQueue';
import { api } from '../lib/api';

interface OfflineIndicatorProps {
  lang?: AppLanguage;
  onSyncComplete?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  lang = 'ur',
  onSyncComplete,
}) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOrders, setPendingOrders] = useState<PendingOfflineOrder[]>(() =>
    getPendingOfflineOrders()
  );
  const [reconnectedNote, setReconnectedNote] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState('');

  const attemptSync = async () => {
    const result = await syncPendingOfflineOrders();
    setPendingOrders(getPendingOfflineOrders());
    if (result.syncedOrderIds.length > 0) {
      setReconnectedNote(
        lang === 'ur'
          ? `${result.syncedOrderIds.length} آف لائن آرڈر کامیابی سے تصدیق ہو کر بھیج دیے گئے ✓`
          : `${result.syncedOrderIds.length} offline order(s) synced & placed ✓`
      );
      setTimeout(() => setReconnectedNote(''), 5000);
      onSyncComplete?.();
    }
  };

  useEffect(() => {
    const refreshQueue = () => setPendingOrders(getPendingOfflineOrders());
    const handleOnline = () => {
      setIsOnline(true);
      attemptSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mvfs-offline-queue-updated', refreshQueue);

    if (navigator.onLine && pendingOrders.length > 0) {
      attemptSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mvfs-offline-queue-updated', refreshQueue);
    };
  }, []);

  const handleConfirmChangedOrder = async (item: PendingOfflineOrder) => {
    setConfirmingId(item.local_id);
    setSyncErrorMsg('');
    try {
      await api.createOrder(item.payload);
      removeOfflineOrder(item.local_id);
      setPendingOrders(getPendingOfflineOrders());
      setReconnectedNote(
        lang === 'ur'
          ? `اپڈیٹ شدہ آرڈر #${item.local_id} تصدیق کے بعد محفوظ ہو گیا ✓`
          : `Confirmed updated order ${item.local_id} ✓`
      );
      setTimeout(() => setReconnectedNote(''), 5000);
      onSyncComplete?.();
    } catch (err: any) {
      setSyncErrorMsg(err?.message || 'Unable to place updated order.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDiscardOffline = (localId: string) => {
    removeOfflineOrder(localId);
    setPendingOrders(getPendingOfflineOrders());
  };

  const needsConfirmList = pendingOrders.filter(
    (o) => o.sync_status === 'needs_reconfirmation' || o.sync_status === 'sync_error'
  );

  return (
    <>
      {!isOnline && (
        <div className="fixed bottom-4 start-4 z-40 max-w-xs rounded-2xl bg-amber-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-2xl border border-amber-400 flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 text-amber-100 shrink-0" />
          <div>
            <p className="font-extrabold">
              {lang === 'ur' ? 'آف لائن موڈ فعال ہے' : 'Offline Mode Active'}
            </p>
            <p className="text-[11px] text-amber-100">
              {lang === 'ur'
                ? 'محفوظ ریٹس دستیاب ہیں۔ آرڈر انٹرنیٹ آنے پر سنک ہوں گے۔'
                : 'Showing cached catalog. Queued orders sync when online.'}
            </p>
          </div>
        </div>
      )}

      {isOnline && reconnectedNote && (
        <div className="fixed bottom-4 start-4 z-40 rounded-2xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-2xl flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-200" />
          <span>{reconnectedNote}</span>
        </div>
      )}

      {isOnline && pendingOrders.length > 0 && needsConfirmList.length === 0 && (
        <button
          onClick={attemptSync}
          className="fixed bottom-16 start-4 z-40 rounded-xl bg-sky-800 px-3.5 py-2 text-xs font-bold text-white shadow-xl flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>
            Pending Synchronization ({pendingOrders.length})
          </span>
        </button>
      )}

      {/* Reconfirmation Modal whenever offline order price/stock/delivery changed */}
      {needsConfirmList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-800">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h3 className="text-sm font-extrabold">
                  {lang === 'ur'
                    ? 'آف لائن آرڈر کی تازہ تصدیق درکار ہے'
                    : 'Offline Order Reconfirmation Required'}
                </h3>
                <p className="text-[11px] text-slate-600">
                  {lang === 'ur'
                    ? 'آپ کے آف لائن آرڈر کے بعد دکان کے ریٹس، اسٹاک یا ڈیلیوری میں تبدیلی آئی ہے:'
                    : 'Live shop prices, stock, or delivery fees changed since you saved this order offline:'}
                </p>
              </div>
            </div>

            {needsConfirmList.map((item) => (
              <div key={item.local_id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{item.local_id}</span>
                  {item.revalidation_diff && (
                    <span className="font-mono-num">
                      Rs.{item.revalidation_diff.old_total} → Rs.{item.revalidation_diff.new_total}
                    </span>
                  )}
                </div>
                {item.revalidation_diff?.changes.map((c, idx) => (
                  <p key={idx} className="text-[11px] text-amber-900">• {c}</p>
                ))}
                {item.sync_error && <p className="text-rose-700 font-bold">{item.sync_error}</p>}
                {syncErrorMsg && <p className="text-rose-700 font-bold">{syncErrorMsg}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={confirmingId === item.local_id}
                    onClick={() => handleConfirmChangedOrder(item)}
                    className="flex-1 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === 'ur' ? 'نئے ریٹ کے ساتھ کنفرم کریں' : 'Confirm Updated Bill'}
                  </button>
                  <button
                    onClick={() => handleDiscardOffline(item.local_id)}
                    className="px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'ur' ? 'منسوخ' : 'Discard'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
