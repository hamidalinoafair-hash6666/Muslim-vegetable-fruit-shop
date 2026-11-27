import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Truck,
  MapPin,
  Phone,
  Navigation,
  CheckCircle2,
  LogOut,
  MessageCircle,
  Lock,
  Radio,
  Square,
} from 'lucide-react';
import { AppLanguage, Order, OrderStatus, Rider } from '../types';
import { api, tokenStore } from '../lib/api';
import { buildGeneralWhatsAppUrl, getStatusUrdu } from '../utils/calculations';
import { LiveDeliveryMap } from './LiveDeliveryMap';

interface RiderPortalModalProps {
  isOpen: boolean;
  lang: AppLanguage;
  onClose: () => void;
}

const RIDER_PROGRESS_STAGES: Array<{
  status: Extract<
    OrderStatus,
    'Order Accepted' | 'Preparing' | 'Ready for Delivery' | 'Picked Up' | 'On the Way'
  >;
  en: string;
  ur: string;
}> = [
  { status: 'Order Accepted', en: '1. Order Accepted', ur: '1. آرڈر قبول' },
  { status: 'Preparing', en: '2. Preparing', ur: '2. تیاری' },
  { status: 'Ready for Delivery', en: '3. Ready', ur: '3. تیار ہے' },
  { status: 'Picked Up', en: '4. Picked Up', ur: '4. اٹھا لیا' },
  { status: 'On the Way', en: '5. On the Way', ur: '5. راستے میں' },
];

export const RiderPortalModal: React.FC<RiderPortalModalProps> = ({ isOpen, lang, onClose }) => {
  const [identifier, setIdentifier] = useState('RIDER-01');
  const [pin, setPin] = useState('');
  const [rider, setRider] = useState<Rider | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gpsBanner, setGpsBanner] = useState('');
  const [liveTrackingActive, setLiveTrackingActive] = useState(false);
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number; updatedAt: string } | null>(
    null
  );

  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);

  const stopGpsWatcher = async (notifyServer = true) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLiveTrackingActive(false);
    if (notifyServer && tokenStore.getRiderToken()) {
      try {
        await api.stopRiderLocation();
      } catch {}
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const loadAssignedOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getRiderOrders();
      setOrders(res.orders);
      if (res.rider) {
        setRider(res.rider);
        if (res.rider.current_location) {
          setCurrentGps({
            lat: res.rider.current_location.lat,
            lng: res.rider.current_location.lng,
            updatedAt: res.rider.current_location.updated_at || new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      if (String(err?.message).includes('403') || String(err?.message).includes('Rider')) {
        tokenStore.setRiderToken('');
        setRider(null);
      } else {
        setError(err?.message || 'Failed to load rider orders');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (tokenStore.getRiderToken()) {
      loadAssignedOrders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.loginRider(identifier.trim(), pin.trim());
      setRider(res.rider);
      setPin('');
      await loadAssignedOrders();
    } catch (err: any) {
      setError(err?.message || 'Invalid Rider ID or PIN');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await stopGpsWatcher(true);
    tokenStore.setRiderToken('');
    setRider(null);
    setOrders([]);
    setCurrentGps(null);
  };

  const pushRiderCoords = async (pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined;
    const speed = typeof pos.coords.speed === 'number' ? pos.coords.speed : undefined;
    const res = await api.sendRiderLocation(lat, lng, { accuracy, speed });
    const nowIso = res.updated_at || new Date().toISOString();
    setCurrentGps({ lat, lng, updatedAt: nowIso });
    setGpsBanner(
      lang === 'ur'
        ? `لائیو GPS اپڈیٹ ہو گیا: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
        : `Live GPS updated (${lat.toFixed(5)}, ${lng.toFixed(5)})`
    );
  };

  const handleToggleContinuousGps = () => {
    if (liveTrackingActive) {
      stopGpsWatcher(true);
      setGpsBanner(
        lang === 'ur' ? 'لائیو GPS شیئرنگ روک دی گئی ہے۔' : 'Live GPS sharing stopped.'
      );
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setError('Live GPS requires HTTPS connection in mobile browsers.');
      return;
    }

    if (!navigator.geolocation) {
      setError('GPS not supported on this device.');
      return;
    }

    setError('');
    setLiveTrackingActive(true);
    lastSentAtRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < 3500) return;
        lastSentAtRef.current = now;
        try {
          await pushRiderCoords(pos);
        } catch (err: any) {
          setError(err?.message || 'Failed to sync GPS coordinates');
        }
      },
      (err) => {
        const inIframe = (() => {
          try {
            return typeof window !== 'undefined' && window.self !== window.top;
          } catch {
            return true;
          }
        })();
        setError(
          err?.code === 1
            ? inIframe
              ? 'Preview frame blocks live GPS. Open the standalone website tab below to share rider GPS.'
              : 'GPS location permission denied on device. Please enable Location in browser settings.'
            : 'Unable to acquire live GPS signal.'
        );
        setLiveTrackingActive(false);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  };

  const handleShareGpsOnce = () => {
    if (!navigator.geolocation) {
      setError('GPS not supported on this device.');
      return;
    }
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await pushRiderCoords(pos);
        } catch (err: any) {
          setError(err?.message || 'Failed to update GPS');
        }
      },
      () => {
        const inIframe = (() => {
          try {
            return typeof window !== 'undefined' && window.self !== window.top;
          } catch {
            return true;
          }
        })();
        setError(
          inIframe
            ? 'Preview frame blocks live GPS. Open standalone browser tab to share live GPS.'
            : 'Location permission denied on device. Enable Location in browser settings.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleStatusChange = async (
    orderId: string,
    status:
      | 'Order Accepted'
      | 'Preparing'
      | 'Ready for Delivery'
      | 'Picked Up'
      | 'On the Way'
      | 'Out for Delivery'
      | 'Delivered'
  ) => {
    setError('');
    try {
      const updated = await api.updateRiderOrderStatus(orderId, status, otpInputs[orderId]);
      const nextList = orders.map((o) => (o.id === orderId ? updated : o));
      setOrders(nextList);

      if (status === 'Delivered') {
        const stillActive = nextList.some(
          (o) => o.order_status !== 'Delivered' && o.order_status !== 'Cancelled'
        );
        if (!stillActive) {
          await stopGpsWatcher(true);
          setGpsBanner(
            lang === 'ur'
              ? 'تمام تفویض کردہ آرڈرز مکمل! لائیو GPS خودکار بند کر دیا گیا۔'
              : 'All assigned deliveries complete — Live GPS tracking stopped automatically.'
          );
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update status');
    }
  };

  const activeOrders = orders.filter(
    (o) => o.order_status !== 'Delivered' && o.order_status !== 'Cancelled'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 bg-sky-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold">
                {lang === 'ur' ? 'رائڈر ڈیلیوری پورٹل (خانیوال)' : 'Khanewal Rider Dispatch Portal'}
              </h2>
              <p className="text-[11px] text-sky-200">
                {rider
                  ? `${rider.name} (${rider.id}) • ${rider.vehicle_reg}`
                  : lang === 'ur'
                  ? 'صرف اپنے تفویض کردہ آرڈرز دیکھنے کے لیے لاگ ان کریں'
                  : 'Sign in with your Rider ID / Phone & PIN'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rider && (
              <button
                onClick={handleLogout}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {lang === 'ur' ? 'لاگ آؤٹ' : 'Logout'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {!rider ? (
            <form onSubmit={handleLogin} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sky-950 font-extrabold text-sm">
                <Lock className="w-4 h-4 text-sky-700" />
                <span>{lang === 'ur' ? 'رائڈر لاگ ان' : 'Rider Sign In'}</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rider ID or Phone</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="RIDER-01 or 03012345678"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">4-Digit Rider PIN</label>
                <input
                  type="password"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                />
              </div>
              {error && <p className="text-xs text-rose-700 font-bold">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-sky-800 hover:bg-sky-900 text-white font-extrabold text-sm cursor-pointer"
              >
                {loading ? 'Signing in...' : lang === 'ur' ? 'پورٹل کھولیں' : 'Sign In as Rider'}
              </button>
              <p className="text-[11px] text-slate-500">
                {lang === 'ur'
                  ? 'اپنا رائڈر ID اور 4 ہندسوں کا خفیہ PIN دکان کے مالک (حامد علی) سے حاصل کریں۔'
                  : 'Enter the Rider ID and 4-digit PIN assigned by the Shop Owner (Hamid Ali).'}
              </p>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Live GPS Control Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 border border-sky-200 p-3.5 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-sky-950 block">
                    {lang === 'ur' ? 'تفویض کردہ آرڈرز:' : 'Assigned Deliveries:'}{' '}
                    <strong className="font-mono-num">{orders.length}</strong> ({activeOrders.length} active)
                  </span>
                  {liveTrackingActive && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                      {lang === 'ur' ? 'لائیو GPS نشریات جاری ہیں' : 'Streaming Live GPS to Customer & Owner Map'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleToggleContinuousGps}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      liveTrackingActive
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    {liveTrackingActive ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        <span>{lang === 'ur' ? 'لائیو GPS بند کریں' : 'Stop Live GPS'}</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-3.5 h-3.5" />
                        <span>{lang === 'ur' ? 'مسلسل لائیو GPS شروع کریں' : 'Start Continuous Live GPS'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleShareGpsOnce}
                    className="px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    {lang === 'ur' ? 'ابھی GPS بھیجیں' : 'Send GPS Once'}
                  </button>
                </div>
              </div>

              {gpsBanner && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
                  {gpsBanner}
                </div>
              )}
              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold space-y-1.5">
                  <p>{error}</p>
                  {typeof window !== 'undefined' && error.toLowerCase().includes('preview') && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-800 text-white text-[11px] font-extrabold"
                    >
                      Open Full Tab for Rider GPS
                    </a>
                  )}
                </div>
              )}

              {/* Live Rider & Active Stops Map */}
              {(currentGps || activeOrders.length > 0) && (
                <LiveDeliveryMap
                  riderLocation={
                    currentGps
                      ? {
                          lat: currentGps.lat,
                          lng: currentGps.lng,
                          label: `${rider.name} (You)`,
                          updatedAt: currentGps.updatedAt,
                        }
                      : null
                  }
                  extraStops={activeOrders
                    .filter((o) => Boolean(o.coordinates?.lat && o.coordinates?.lng))
                    .map((o) => ({
                      id: o.id,
                      label: `${o.customer_name} (${o.delivery_area || 'Khanewal'})`,
                      lat: o.coordinates!.lat,
                      lng: o.coordinates!.lng,
                      status: o.order_status,
                    }))}
                  heightClass="h-52"
                />
              )}

              {orders.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  {lang === 'ur'
                    ? 'فی الحال آپ کو کوئی نیا آرڈر تفویض نہیں کیا گیا۔'
                    : 'No assigned deliveries right now.'}
                </div>
              ) : (
                orders.map((ord) => {
                  const collectCash =
                    ord.payment_method === 'Cash on Delivery' && ord.payment_status !== 'Paid COD';
                  const mapsUrl =
                    ord.coordinates?.lat && ord.coordinates?.lng
                      ? `https://www.google.com/maps/dir/?api=1&destination=${ord.coordinates.lat},${ord.coordinates.lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${ord.delivery_address || ord.delivery_area || 'Khanewal'} Khanewal`
                        )}`;
                  const waCustUrl = buildGeneralWhatsAppUrl(
                    `السلام علیکم ${ord.customer_name}! میں مسلم ویجیٹیبل اینڈ فروٹ شاپ خانیوال کا رائڈر (${rider.name}) ہوں، آپ کا آرڈر #${ord.id} لے کر آ رہا ہوں۔`,
                    ord.customer_phone.replace(/\D/g, '').replace(/^0/, '92')
                  );

                  return (
                    <div key={ord.id} className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-white shadow-xs">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-mono-num font-extrabold text-sm text-sky-950">#{ord.id}</span>
                          {ord.dispatch_sequence && (
                            <span className="ms-2 px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-bold">
                              Stop #{ord.dispatch_sequence}
                            </span>
                          )}
                          <h4 className="font-bold text-slate-900 text-sm">{ord.customer_name}</h4>
                          <p className="text-xs text-slate-600">
                            {ord.delivery_area} — {ord.delivery_address}
                          </p>
                        </div>
                        <div className="text-end">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                            {lang === 'ur' ? getStatusUrdu(ord.order_status) : ord.order_status}
                          </span>
                          <p className="mt-1 text-xs font-extrabold font-mono-num text-slate-900">
                            {collectCash
                              ? `Collect COD: Rs.${ord.total_amount}`
                              : `${ord.payment_method} (${ord.payment_status})`}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <a
                          href={`tel:${ord.customer_phone}`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {ord.customer_phone}
                        </a>
                        <a
                          href={waCustUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp Customer
                        </a>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-sky-100 text-sky-900 font-bold flex items-center gap-1"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <MapPin className="w-3.5 h-3.5" />
                          Google Maps
                        </a>
                      </div>

                      {ord.order_status !== 'Delivered' && ord.order_status !== 'Cancelled' && (
                        <div className="pt-2 border-t border-slate-100 space-y-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {RIDER_PROGRESS_STAGES.map((stage) => {
                              const isCurrent = ord.order_status === stage.status;
                              return (
                                <button
                                  key={stage.status}
                                  type="button"
                                  onClick={() => handleStatusChange(ord.id, stage.status)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                    isCurrent
                                      ? 'bg-sky-800 text-white border-sky-800 shadow-xs'
                                      : 'bg-slate-50 hover:bg-sky-50 text-slate-800 border-slate-200'
                                  }`}
                                >
                                  {lang === 'ur' ? stage.ur : stage.en}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="OTP (if required)"
                              value={otpInputs[ord.id] || ''}
                              onChange={(e) =>
                                setOtpInputs((prev) => ({ ...prev, [ord.id]: e.target.value }))
                              }
                              className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                            />
                            <button
                              type="button"
                              onClick={() => handleStatusChange(ord.id, 'Delivered')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {lang === 'ur' ? '6. ڈیلیور ہو گیا (Delivered)' : '6. Mark Delivered'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
