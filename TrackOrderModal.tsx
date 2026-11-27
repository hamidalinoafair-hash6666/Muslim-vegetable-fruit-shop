import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  PackageCheck,
  MapPin,
  MessageCircle,
  AlertOctagon,
  Phone,
  ShieldCheck,
  Radio,
  Navigation,
} from 'lucide-react';
import { AppLanguage, Order, OrderStatus, ShopSettings } from '../types';
import { api } from '../lib/api';
import { DEFAULT_SHOP_SETTINGS } from '../data/initialData';
import { supabase } from '../lib/supabaseClient';
import {
  SHOP_COORDINATES,
  buildOrderWhatsAppUrl,
  formatWeight,
  getPaymentStatusUrdu,
  getStatusUrdu,
} from '../utils/calculations';
import { LiveDeliveryMap } from './LiveDeliveryMap';

interface TrackOrderModalProps {
  isOpen: boolean;
  initialOrderId?: string;
  lang: AppLanguage;
  settings?: ShopSettings;
  onClose: () => void;
}

const TRACKING_STAGES: OrderStatus[] = [
  'Order Accepted',
  'Preparing',
  'Ready for Delivery',
  'Picked Up',
  'On the Way',
  'Delivered',
];

function getStageIndex(status: OrderStatus): number {
  switch (status) {
    case 'Order Received':
    case 'Order Accepted':
    case 'Order Confirmed':
      return 0;
    case 'Preparing':
      return 1;
    case 'Ready for Delivery':
    case 'Rider Assigned':
      return 2;
    case 'Picked Up':
      return 3;
    case 'On the Way':
    case 'Out for Delivery':
      return 4;
    case 'Delivered':
      return 5;
    default:
      return -1;
  }
}

export const TrackOrderModal: React.FC<TrackOrderModalProps> = ({
  isOpen,
  initialOrderId,
  lang,
  settings = DEFAULT_SHOP_SETTINGS,
  onClose,
}) => {
  const waDigits = (settings.whatsapp || '923007466664').replace(/\D/g, '') || '923007466664';
  const getSavedSessionOrder = () => {
    try {
      const raw = sessionStorage.getItem('mvfs_last_tracked_order');
      return raw ? (JSON.parse(raw) as { id?: string; phone4?: string }) : {};
    } catch {
      return {};
    }
  };

  const saved = getSavedSessionOrder();
  const [orderIdInput, setOrderIdInput] = useState(initialOrderId || saved.id || 'MVF-9055');
  const [phone4Input, setPhone4Input] = useState(saved.phone4 || '6664');
  const [order, setOrder] = useState<
    | (Order & {
        gps_status?: string;
        requiresVerification?: boolean;
        route_geometry?: Array<[number, number]> | null;
        eta_minutes?: number | null;
        distance_remaining_km?: number | null;
      })
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [realtimeActive, setRealtimeActive] = useState(false);

  const handleLookup = async (idToFetch: string, p4: string, silent = false) => {
    if (!idToFetch.trim()) return;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await api.trackOrder(idToFetch.trim(), p4.trim());
      setOrder(data);
    } catch (err: any) {
      if (!silent) {
        setOrder(null);
        setError(err?.message || 'Order ID not found');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const latestSaved = getSavedSessionOrder();
    const id = initialOrderId || latestSaved.id || orderIdInput;
    const p4 = latestSaved.phone4 || phone4Input;
    if (initialOrderId) setOrderIdInput(initialOrderId);
    if (latestSaved.phone4 && initialOrderId === latestSaved.id) setPhone4Input(latestSaved.phone4);
    handleLookup(id, p4);
  }, [isOpen, initialOrderId]);

  // Live auto-refresh: 4s API polling + Supabase Realtime subscription on `delivery_locations` & `orders`
  useEffect(() => {
    if (!isOpen || !order || order.requiresVerification) return;
    if (['Delivered', 'Cancelled'].includes(order.order_status)) return;

    const currentOrderId = order.id;
    const currentPhone4 = phone4Input;

    const pollTimer = setInterval(() => {
      handleLookup(currentOrderId, currentPhone4, true);
    }, 4000);

    let channel: any = null;
    try {
      channel = supabase
        .channel(`track-order-${currentOrderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'delivery_locations',
            filter: `order_id=eq.${currentOrderId}`,
          },
          (payload: any) => {
            const row = payload.new;
            if (!row) return;
            setRealtimeActive(true);
            setOrder((prev) =>
              prev
                ? {
                    ...prev,
                    gps_status: row.is_active ? 'live' : 'unavailable',
                    rider_live_location: row.is_active
                      ? {
                          lat: Number(row.lat),
                          lng: Number(row.lng),
                          accuracy: row.accuracy ? Number(row.accuracy) : undefined,
                          speed: row.speed ? Number(row.speed) : null,
                          updated_at: row.updated_at || new Date().toISOString(),
                        }
                      : undefined,
                  }
                : prev
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${currentOrderId}`,
          },
          () => {
            handleLookup(currentOrderId, currentPhone4, true);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') setRealtimeActive(true);
        });
    } catch {}

    return () => {
      clearInterval(pollTimer);
      setRealtimeActive(false);
      if (channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [isOpen, order?.id, order?.order_status, order?.requiresVerification, phone4Input]);

  if (!isOpen) return null;

  const activeIndex = order ? getStageIndex(order.order_status) : -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-5 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2">
              <span>{lang === 'ur' ? 'لائیو آرڈر و GPS ٹریکنگ' : 'Track My Order (Live GPS Map)'}</span>
              {order && !order.requiresVerification && order.gps_status === 'live' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-bold">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE
                </span>
              )}
            </h2>
            <p className="text-[11px] text-emerald-300">
              {lang === 'ur'
                ? 'آرڈر نمبر اور اپنے موبائل نمبر کے آخری 4 ہندسے درج کر کے نقشے پر رائڈر کی لائیو لوکیشن دیکھیں'
                : 'Enter Order ID and last 4 digits of your phone number to view live rider GPS & route'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
          {/* Verification Lookup Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup(orderIdInput, phone4Input);
            }}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2"
          >
            <div className="relative sm:col-span-6">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
              <input
                type="text"
                required
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                placeholder="Order ID (e.g. MVF-9055)"
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 font-mono-num font-bold text-sm focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div className="relative sm:col-span-4">
              <ShieldCheck className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
              <input
                type="text"
                maxLength={4}
                value={phone4Input}
                onChange={(e) => setPhone4Input(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={lang === 'ur' ? 'فون کے آخری 4 ہندسے' : 'Last 4 phone digits'}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 font-mono-num font-bold text-sm focus:outline-none focus:border-emerald-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-extrabold cursor-pointer"
            >
              {loading ? '...' : lang === 'ur' ? 'ٹریک کریں' : 'Track'}
            </button>
          </form>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          {order && order.requiresVerification && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
              <p className="font-extrabold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                {lang === 'ur'
                  ? `آرڈر #${order.id} موجود ہے (اسٹیٹس: ${getStatusUrdu(order.order_status)})`
                  : `Order #${order.id} found (Status: ${order.order_status})`}
              </p>
              <p>
                {lang === 'ur'
                  ? 'رازداری کے تحفظ کے لیے مکمل لائیو نقشہ اور بل دیکھنے کے لیے اوپر خانے میں اپنے موبائل نمبر کے آخری 4 ہندسے درج کر کے "ٹریک کریں" دبائیں۔'
                  : 'For your privacy, please enter the last 4 digits of the phone number used on this order to unlock the live GPS map and full bill.'}
              </p>
            </div>
          )}

          {order && !order.requiresVerification && (
            <div className="space-y-5">
              {/* Top Meta Summary */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500">Order ID</span>
                  <h3 className="text-lg font-extrabold font-mono-num text-emerald-950">#{order.id}</h3>
                  <p className="text-xs text-slate-600">
                    {order.customer_name} • {order.delivery_area}
                  </p>
                </div>
                <div className="text-end">
                  <span className="inline-block px-3 py-1 rounded-lg bg-emerald-800 text-white text-xs font-bold">
                    {lang === 'ur' ? getStatusUrdu(order.order_status) : order.order_status}
                  </span>
                  <p className="mt-1 text-xs font-bold text-amber-800">
                    {lang === 'ur'
                      ? getPaymentStatusUrdu(order.payment_status)
                      : order.payment_status}
                  </p>
                </div>
              </div>

              {/* LIVE INTERACTIVE DELIVERY MAP */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-sky-700" />
                    {lang === 'ur' ? 'لائیو ڈیلیوری نقشہ (خانیوال)' : 'Live Delivery Map (Khanewal)'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.gps_status === 'live' && order.eta_minutes ? (
                      <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-900 font-bold font-mono-num">
                        ETA: ~{order.eta_minutes} mins ({order.distance_remaining_km ?? order.delivery_distance_km} km)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">
                        {lang === 'ur' ? 'متوقع وقت: رائڈر GPS پر دستیاب ہوگا' : 'ETA: Unavailable until live rider GPS'}
                      </span>
                    )}
                    {realtimeActive && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Realtime Sync ON
                      </span>
                    )}
                  </div>
                </div>

                <LiveDeliveryMap
                  shopLocation={{ ...SHOP_COORDINATES, label: 'Camp Chowk, Khanewal' }}
                  customerLocation={
                    order.coordinates?.lat && order.coordinates?.lng
                      ? {
                          lat: order.coordinates.lat,
                          lng: order.coordinates.lng,
                          label: order.delivery_address || order.delivery_area,
                        }
                      : null
                  }
                  riderLocation={
                    order.gps_status === 'live' && order.rider_live_location
                      ? {
                          lat: order.rider_live_location.lat,
                          lng: order.rider_live_location.lng,
                          label: order.assigned_rider_name?.split('(')[0]?.trim() || 'Rider',
                          updatedAt: order.rider_live_location.updated_at,
                        }
                      : null
                  }
                  routeGeometry={order.route_geometry}
                  heightClass="h-64 sm:h-72"
                />

                <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                  {order.gps_status === 'live' && order.rider_live_location ? (
                    <span className="font-bold text-emerald-800">
                      Live Rider Coordinates:{' '}
                      <span className="font-mono-num">
                        {order.rider_live_location.lat.toFixed(5)}, {order.rider_live_location.lng.toFixed(5)}
                      </span>{' '}
                      • Last updated:{' '}
                      <span className="font-mono-num">
                        {new Date(order.rider_live_location.updated_at).toLocaleTimeString('en-PK')}
                      </span>
                    </span>
                  ) : order.order_status === 'Delivered' ? (
                    <span className="text-emerald-800 font-bold">
                      {lang === 'ur'
                        ? 'آرڈر مکمل طور پر ڈیلیور ہو چکا ہے — لائیو لوکیشن ٹریکنگ بند کر دی گئی ہے۔'
                        : 'Order delivered — live GPS tracking stopped automatically.'}
                    </span>
                  ) : (
                    <span>
                      {lang === 'ur'
                        ? 'رائڈر کی لائیو GPS لوکیشن فی الحال دستیاب نہیں (رائڈر کے ڈیلیوری شروع کرنے اور GPS آن کرنے پر خودکار اپڈیٹ ہوگی)۔'
                        : 'Rider live GPS is not active right now (appears automatically as soon as your rider starts sharing live GPS).'}
                    </span>
                  )}
                </p>
              </div>

              {/* Cancelled Banner OR 6-Stage Progress Stepper */}
              {order.order_status === 'Cancelled' ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <AlertOctagon className="w-4 h-4" />
                    {lang === 'ur' ? 'یہ آرڈر منسوخ کر دیا گیا ہے' : 'Order Cancelled'}
                  </p>
                  {order.rejection_reason && <p>Reason: {order.rejection_reason}</p>}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {TRACKING_STAGES.map((stage, idx) => {
                    const completed = activeIndex >= idx;
                    const current = activeIndex === idx;
                    return (
                      <div
                        key={stage}
                        className={`p-3 rounded-xl border text-xs transition ${
                          current
                            ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-200'
                            : completed
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-slate-200 bg-white opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono-num font-bold text-[11px] text-slate-500">0{idx + 1}</span>
                          {completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          ) : (
                            <Clock className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <p className="font-extrabold text-slate-900">
                          {lang === 'ur' ? getStatusUrdu(stage) : stage}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Assigned Rider Meta */}
              {order.assigned_rider_name && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-extrabold text-sky-950">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-sky-700" />
                      {lang === 'ur' ? 'مقرر کردہ رائڈر:' : 'Assigned Rider:'} {order.assigned_rider_name}
                    </span>
                    {order.assigned_rider_phone && (
                      <a
                        href={`tel:${order.assigned_rider_phone}`}
                        dir="ltr"
                        className="inline-flex items-center gap-1 text-sky-800 underline font-mono-num [unicode-bidi:isolate]"
                      >
                        <Phone className="w-3 h-3" /> {order.assigned_rider_phone}
                      </a>
                    )}
                  </div>
                  {order.delivery_otp && order.order_status !== 'Delivered' && (
                    <p className="text-[11px] text-sky-900">
                      Delivery Verification OTP: <strong className="font-mono-num">{order.delivery_otp}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Status History Timeline */}
              {Array.isArray(order.status_history) && order.status_history.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2 text-xs">
                  <h4 className="font-extrabold text-slate-800">
                    {lang === 'ur' ? 'آرڈر کی مکمل ٹائم لائن' : 'Status Activity Timeline'}
                  </h4>
                  <div className="space-y-1.5">
                    {order.status_history.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center justify-between gap-2 py-1 border-b last:border-b-0 border-slate-200/70"
                      >
                        <div>
                          <span className="font-bold text-emerald-900">
                            {lang === 'ur' ? getStatusUrdu(entry.status) : entry.status}
                          </span>
                          {entry.note && <span className="text-slate-600"> — {entry.note}</span>}
                          {entry.actor && (
                            <span className="text-[10px] text-slate-400 ms-1">({entry.actor})</span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono-num text-slate-500">
                          {new Date(entry.timestamp).toLocaleString('en-PK')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Complete Frozen Bill */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-700" />
                  {lang === 'ur' ? 'آرڈر کا محفوظ بل' : 'Verified Order Bill'}
                </h4>
                <div className="divide-y divide-slate-100">
                  {order.items.map((it, i) => (
                    <div key={i} className="py-1.5 flex justify-between">
                      <span>
                        {lang === 'ur' ? it.urdu_name || it.product_name : it.product_name} —{' '}
                        {formatWeight(it.weight_grams || it.quantity * 1000, it.unit, lang)} (Rs.{it.unit_price})
                      </span>
                      <strong className="font-mono-num">Rs. {it.subtotal}</strong>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between">
                    <span>{lang === 'ur' ? 'آرڈر تاریخ و وقت:' : 'Order Date & Time:'}</span>
                    <strong className="font-mono-num text-slate-900">
                      {new Date(order.created_at).toLocaleString('en-PK')}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{lang === 'ur' ? 'ادائیگی کا طریقہ:' : 'Payment Method:'}</span>
                    <strong className="text-slate-900">{order.payment_method}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{lang === 'ur' ? 'اشیاء کا کل بل (Items Total):' : 'Items Total / اشیاء کا کل بل:'}</span>
                    <span className="font-mono-num font-bold">Rs. {order.subtotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {lang === 'ur' ? 'ڈیلیوری چارجز (Delivery Charges)' : 'Delivery Charges / ڈیلیوری چارجز'}
                      {order.delivery_distance_km > 0 ? ` (${order.delivery_distance_km} km)` : ''}:
                    </span>
                    <span className="font-mono-num font-bold">Rs. {order.delivery_fee}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>{lang === 'ur' ? 'رعایت (Discount):' : 'Discount:'}</span>
                      <span className="font-mono-num">- Rs. {order.discount}</span>
                    </div>
                  )}
                  {(order.loyalty_points_used > 0 || (order.loyalty_discount_rs ?? 0) > 0) && (
                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>
                        {lang === 'ur'
                          ? `لائلٹی پوائنٹس (${order.loyalty_points_used} pts):`
                          : `Loyalty Points Used (${order.loyalty_points_used} pts):`}
                      </span>
                      <span className="font-mono-num">
                        - Rs. {order.loyalty_discount_rs ?? order.loyalty_points_used}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-emerald-900 pt-1.5 border-t border-slate-200">
                    <span>{lang === 'ur' ? 'کل قابلِ ادائیگی رقم (Grand Total):' : 'Grand Total / کل قابلِ ادائیگی رقم:'}</span>
                    <span className="font-mono-num">Rs. {order.total_amount}</span>
                  </div>
                </div>
              </div>

              <a
                href={buildOrderWhatsAppUrl(order, waDigits)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {lang === 'ur' ? 'واٹس ایپ پر دکان سے اس آرڈر کے بارے میں بات کریں' : 'Contact Shop on WhatsApp About This Order'}
                </span>
                <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                  +{waDigits}
                </span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
