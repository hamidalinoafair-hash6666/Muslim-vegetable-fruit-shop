import React, { useEffect, useState } from 'react';
import {
  X,
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Upload,
  MessageCircle,
  Copy,
  Check,
  Clock,
  ShieldAlert,
  Tag,
  WifiOff,
  ClipboardList,
  Award,
} from 'lucide-react';
import {
  AppLanguage,
  CartItem,
  Coupon,
  LoyaltyAccount,
  Order,
  PaymentMethod,
  PendingOfflineOrder,
  ShopSettings,
} from '../types';
import {
  DEFAULT_SHOP_SETTINGS,
  KHANEWAL_LOCATIONS,
} from '../data/initialData';
import { api } from '../lib/api';
import { enqueueOfflineOrder } from '../lib/offlineQueue';
import {
  buildOrderWhatsAppUrl,
  calculateDeliveryFee,
  formatWeight,
  getPaymentStatusUrdu,
  validateKhanewalAddress,
} from '../utils/calculations';
import { LiveDeliveryMap } from './LiveDeliveryMap';

interface CheckoutModalProps {
  isOpen: boolean;
  lang: AppLanguage;
  items: CartItem[];
  settings: ShopSettings;
  onClose: () => void;
  onOrderSuccess: (order: Order) => void;
  onOfflineQueued: (queued: PendingOfflineOrder) => void;
  onOpenTrackOrder: (orderId: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  lang,
  items,
  settings,
  onClose,
  onOrderSuccess,
  onOfflineQueued,
  onOpenTrackOrder,
}) => {
  const AUTOFILL_STORAGE_KEY = 'mvfs_customer_autofill_v1';
  const s = settings || DEFAULT_SHOP_SETTINGS;
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [hasSavedAutofill, setHasSavedAutofill] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [address, setAddress] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');
  const [notes, setNotes] = useState('');

  // Khanewal Route Distance State (Optional — never invented if customer provides no location)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [distanceSource, setDistanceSource] = useState<
    'verified_sector_road' | 'osrm_road' | 'unverified'
  >('unverified');
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [routeError, setRouteError] = useState<string>('');
  const [calculatingGps, setCalculatingGps] = useState(false);

  // Coupon & Loyalty
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [customRedeemPoints, setCustomRedeemPoints] = useState<string>('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash on Delivery');
  const [senderName, setSenderName] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentDatetime, setPaymentDatetime] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [receiptFileData, setReceiptFileData] = useState('');
  const [copiedField, setCopiedField] = useState('');

  // Submission & Result
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [confirmedNote, setConfirmedNote] = useState('');
  const [offlineSavedOrder, setOfflineSavedOrder] = useState<PendingOfflineOrder | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError('');
    setConfirmedOrder(null);
    setConfirmedNote('');
    setOfflineSavedOrder(null);
    // Device-local secure autofill for current browser only
    try {
      const savedRaw = localStorage.getItem(AUTOFILL_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.name === 'string' && parsed.name.trim()) {
            setCustomerName((prev) => prev || parsed.name);
            setHasSavedAutofill(true);
          }
          if (typeof parsed.phone === 'string' && parsed.phone.trim()) {
            setCustomerPhone((prev) => prev || parsed.phone);
            setHasSavedAutofill(true);
          }
        }
      }
    } catch {}
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setLoyaltyAccount(null);
      setRedeemLoyalty(false);
      return;
    }
    let active = true;
    api
      .getLoyalty(customerPhone.trim())
      .then((acc) => {
        if (active) setLoyaltyAccount(acc);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, customerPhone]);

  const appliedCouponCode = appliedCoupon?.code;
  const waDigits = (s.whatsapp || '+923007466664').replace(/\D/g, '');
  const waDisplay = `+${waDigits}`;
  const deliveryCfg = {
    baseDeliveryFee: s.baseDeliveryFee ?? 100,
    baseKm: s.baseKm ?? 3,
    extraKmRate: s.extraKmRate ?? 30,
  };
  const sectorsList =
    s.deliveryAreas && s.deliveryAreas.length > 0 ? s.deliveryAreas : KHANEWAL_LOCATIONS;

  const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
  const selectedSector = sectorsList.find((l) => l.id === areaId);
  const hasVerifiedLocation = Boolean(
    (coords || areaId) && distanceKm > 0 && distanceSource !== 'unverified'
  );
  const deliveryFee = hasVerifiedLocation ? calculateDeliveryFee(distanceKm, deliveryCfg) : 0;

  let discountAmount = 0;
  if (appliedCoupon && subtotal >= (appliedCoupon.min_order || 0)) {
    if (appliedCoupon.discount_type === 'fixed') discountAmount = Math.min(appliedCoupon.value, subtotal);
    else if (appliedCoupon.discount_type === 'percent')
      discountAmount = Math.min(Math.round((subtotal * appliedCoupon.value) / 100), subtotal);
    else if (appliedCoupon.discount_type === 'free_delivery') discountAmount = deliveryFee;
  }

  const loyaltyEnabled = s.loyaltyEnabled !== false;
  const pointValueRs = Number(s.loyaltyPointValueRs ?? 1) || 1;
  const pointsPer100Rs = Number(s.loyaltyPointsPer100Rs ?? 5) || 5;
  const couponBlocksLoyalty = Boolean(appliedCoupon && !appliedCoupon.allow_loyalty_stacking);
  const maxRedeemable =
    loyaltyEnabled && loyaltyAccount && !couponBlocksLoyalty
      ? Math.min(
          Math.max(0, loyaltyAccount.points_balance),
          Math.floor(Math.max(0, subtotal - discountAmount) / Math.max(0.01, pointValueRs))
        )
      : 0;
  const parsedCustomPts =
    customRedeemPoints.trim() !== '' && !isNaN(Number(customRedeemPoints))
      ? Math.max(0, Math.floor(Number(customRedeemPoints)))
      : maxRedeemable;
  const loyaltyPointsUsed =
    redeemLoyalty && !couponBlocksLoyalty ? Math.min(maxRedeemable, parsedCustomPts) : 0;
  const loyaltyDiscount = Math.round(loyaltyPointsUsed * pointValueRs);
  const eligibleForEarning = Math.max(0, subtotal - discountAmount - loyaltyDiscount);
  const estimatedPointsEarnedOnDelivery = loyaltyEnabled
    ? Math.floor(eligibleForEarning / 100) * pointsPer100Rs
    : 0;
  const totalPayable = Math.max(0, subtotal + deliveryFee - discountAmount - loyaltyDiscount);

  useEffect(() => {
    if (couponBlocksLoyalty && redeemLoyalty) {
      setRedeemLoyalty(false);
    }
  }, [couponBlocksLoyalty, redeemLoyalty]);

  useEffect(() => {
    if (!isOpen || !appliedCouponCode) return;
    api
      .validateCoupon(appliedCouponCode, subtotal, customerPhone.trim(), deliveryFee, 0)
      .then((c) => {
        setAppliedCoupon(c);
        let d = 0;
        if (c.discount_type === 'fixed') d = Math.min(c.value, subtotal);
        else if (c.discount_type === 'percent') d = Math.min(Math.round((subtotal * c.value) / 100), subtotal);
        else if (c.discount_type === 'free_delivery') d = deliveryFee;
        setCouponMsg(
          c.discount_type === 'free_delivery'
            ? lang === 'ur'
              ? `کوپن ${c.code} لاگو ہو گیا (فری ڈیلیوری${d > 0 ? `: -Rs.${d}` : ''})`
              : `Applied ${c.code}: Free Delivery${d > 0 ? ` (-Rs.${d})` : ''}`
            : lang === 'ur'
            ? `کوپن ${c.code} لاگو ہو گیا (-Rs.${d})`
            : `Applied ${c.code}: -Rs.${d}`
        );
      })
      .catch((err: any) => {
        setAppliedCoupon(null);
        setCouponMsg(err?.message || '');
      });
  }, [isOpen, appliedCouponCode, customerPhone, subtotal, deliveryFee, lang]);

  if (!isOpen) return null;

  const handleClearLocation = () => {
    setAreaId('');
    setCoords(null);
    setDistanceKm(0);
    setDistanceSource('unverified');
    setGpsStatus('');
    setRouteError('');
  };

  const handleClearSavedCustomer = () => {
    try {
      localStorage.removeItem(AUTOFILL_STORAGE_KEY);
    } catch {}
    setCustomerName('');
    setCustomerPhone('');
    setHasSavedAutofill(false);
  };

  const handleSectorChange = (newId: string) => {
    setRouteError('');
    setGpsStatus('');
    if (!newId) {
      handleClearLocation();
      return;
    }
    setAreaId(newId);
    const loc = sectorsList.find((l) => l.id === newId);
    if (!loc) return;
    setCoords({ lat: loc.lat, lng: loc.lng });
    if (loc.roadDistanceKm > 0) {
      setDistanceKm(loc.roadDistanceKm);
      setDistanceSource('verified_sector_road');
    } else {
      setDistanceKm(0);
      setDistanceSource('unverified');
    }
  };

  const isEmbeddedIframe =
    typeof window !== 'undefined' && (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const applyCoordinatesRoute = async (lat: number, lng: number, sourceLabel?: string) => {
    setCalculatingGps(true);
    setRouteError('');
    setGpsStatus(lang === 'ur' ? 'سڑک کا فاصلہ معلوم کیا جا رہا ہے...' : 'Calculating Khanewal road route...');
    try {
      const result = await api.calculateDeliveryRoute({ lat, lng, address });
      setAreaId('custom_gps');
      setCoords({ lat, lng });
      setDistanceKm(result.distanceKm);
      setDistanceSource(result.distanceSource);
      setGpsStatus(
        lang === 'ur'
          ? `${sourceLabel || 'GPS پن'}: سڑک کا فاصلہ ${result.distanceKm} کلومیٹر — ڈیلیوری فیس Rs.${result.deliveryFee}`
          : `${sourceLabel || 'Map Pin'}: ${result.distanceKm} km road distance — Delivery Fee Rs.${result.deliveryFee}`
      );
    } catch (err: any) {
      setRouteError(err?.message || 'Pin location is outside Khanewal city limits.');
      setGpsStatus('');
    } finally {
      setCalculatingGps(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setRouteError(
        lang === 'ur'
          ? 'GPS کے لیے HTTPS کنکشن ضروری ہے۔ نیچے نقشے پر اپنی گلی پر کلک کر کے پن لگائیں یا خانیوال کا علاقہ منتخب کریں۔'
          : 'GPS requires HTTPS. Tap anywhere on the Khanewal map below or choose your neighborhood.'
      );
      return;
    }
    if (!navigator.geolocation) {
      setRouteError(
        lang === 'ur'
          ? 'آپ کے براؤزر میں آٹو GPS دستیاب نہیں۔ نیچے نقشے پر کلک کر کے یا فہرست سے خانیوال کا علاقہ منتخب کریں۔'
          : 'Auto GPS not supported here. Tap the map below or pick your Khanewal neighborhood.'
      );
      return;
    }
    setCalculatingGps(true);
    setRouteError('');
    setGpsStatus(lang === 'ur' ? 'GPS اور سڑک کا فاصلہ معلوم کیا جا رہا ہے...' : 'Calculating Khanewal road route...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyCoordinatesRoute(pos.coords.latitude, pos.coords.longitude, lang === 'ur' ? 'لائیو GPS' : 'Live GPS');
      },
      (err) => {
        setCalculatingGps(false);
        setGpsStatus('');
        if (err?.code === 1 && isEmbeddedIframe) {
          setRouteError(
            lang === 'ur'
              ? 'آپ ابھی AI Studio Preview فریم میں ہیں جہاں براؤزر GPS بند ہوتا ہے۔ آپ نیچے نقشے پر اپنی گلی پر ٹچ کر کے پن لگا سکتے ہیں، یا نیچے بٹن سے فل اسکرین ٹیب میں کھول کر لائیو GPS لیں۔'
              : 'Preview frame blocks auto-GPS. Tap/drag your exact street on the map below, OR open in a full browser tab for auto-GPS.'
          );
        } else {
          setRouteError(
            lang === 'ur'
              ? 'GPS اجازت بند ہے۔ نیچے نقشے پر اپنی جگہ ٹچ کر کے پن لگائیں یا فہرست سے علاقہ منتخب کریں (یا براؤزر میں Location Allow کریں)۔'
              : 'Location permission blocked. Tap anywhere on the map below to set your pin, pick your area, or allow Location in Chrome settings.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 15000 }
    );
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    try {
      const coupon = await api.validateCoupon(
        couponInput.trim(),
        subtotal,
        customerPhone.trim(),
        deliveryFee,
        loyaltyPointsUsed
      );
      let disc = 0;
      if (coupon.discount_type === 'fixed') disc = Math.min(coupon.value, subtotal);
      else if (coupon.discount_type === 'percent') disc = Math.min(Math.round((subtotal * coupon.value) / 100), subtotal);
      else if (coupon.discount_type === 'free_delivery') disc = deliveryFee;
      setAppliedCoupon(coupon);
      setCouponMsg(
        coupon.discount_type === 'free_delivery'
          ? lang === 'ur'
            ? `کوپن ${coupon.code} لاگو ہو گیا (فری ڈیلیوری${disc > 0 ? `: -Rs.${disc}` : ''})`
            : `Applied ${coupon.code}: Free Delivery${disc > 0 ? ` (-Rs.${disc})` : ''}`
          : lang === 'ur'
          ? `کوپن ${coupon.code} لاگو ہو گیا (-Rs.${disc})`
          : `Applied ${coupon.code}: -Rs.${disc}`
      );
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponMsg(err?.message || 'Invalid coupon');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg('');
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError(lang === 'ur' ? 'فائل کا سائز 5MB سے کم ہونا چاہیے' : 'Receipt image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setReceiptFileData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const copyText = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1500);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (customerName.trim().length < 2) {
      setSubmitError(
        lang === 'ur'
          ? 'براہ کرم اپنا مکمل نام درج کریں (کم از کم 2 حروف)۔'
          : 'Please enter customer name (at least 2 characters).'
      );
      return;
    }

    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      setSubmitError(
        lang === 'ur'
          ? 'براہ کرم درست موبائل / واٹس ایپ نمبر درج کریں۔'
          : 'Please enter a valid mobile phone number.'
      );
      return;
    }

    const hasLocationProvided = Boolean(address.trim() || areaId || coords);
    if (hasLocationProvided) {
      const addrCheck = validateKhanewalAddress(
        `${address} ${selectedSector?.name || ''}`,
        areaId || undefined,
        coords?.lat,
        coords?.lng
      );
      if (!addrCheck.valid) {
        setSubmitError(lang === 'ur' ? addrCheck.reasonUr || '' : addrCheck.reasonEn || '');
        return;
      }
    }

    const idempotencyKey = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      idempotency_key: idempotencyKey,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      delivery_address: address.trim(),
      delivery_area: areaId
        ? lang === 'ur'
          ? selectedSector?.nameUr || (areaId === 'custom_gps' ? 'خانیوال GPS لوکیشن' : '')
          : selectedSector?.name || (areaId === 'custom_gps' ? 'Khanewal GPS Pin' : '')
        : coords
        ? lang === 'ur'
          ? 'خانیوال GPS لوکیشن'
          : 'Khanewal GPS Pin'
        : '',
      delivery_area_id: areaId || undefined,
      coordinates: coords || undefined,
      delivery_distance_km: hasVerifiedLocation ? distanceKm : 0,
      distance_source: hasVerifiedLocation ? distanceSource : 'unverified',
      delivery_slot: deliverySlot || undefined,
      notes: notes.trim(),
      items: items.map((it) => ({
        product_id: it.product.id,
        product_name: it.product.name,
        urdu_name: it.product.urdu_name,
        unit_price: it.unitPrice,
        unit: it.product.unit,
        purchase_type: it.purchaseType,
        weight_grams: it.weightGrams,
        amount_paid: it.purchaseType === 'amount' ? it.amountPaid : undefined,
        quantity: it.quantity,
      })),
      subtotal,
      delivery_fee: deliveryFee,
      discount: discountAmount,
      coupon_code: appliedCouponCode,
      loyalty_points_used: loyaltyPointsUsed,
      payment_method: paymentMethod,
      payment_reference: transactionRef.trim() || undefined,
      payment_datetime: paymentMethod !== 'Cash on Delivery' ? paymentDatetime : undefined,
    };

    // Save current customer name & mobile locally on this browser only
    try {
      localStorage.setItem(
        AUTOFILL_STORAGE_KEY,
        JSON.stringify({
          name: customerName.trim(),
          phone: customerPhone.trim(),
        })
      );
      setHasSavedAutofill(true);
    } catch {}

    // Offline Guard: Queue cleanly as Pending Synchronization without claiming online confirmation
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = enqueueOfflineOrder(payload);
      setOfflineSavedOrder(queued);
      onOfflineQueued(queued);
      return;
    }

    setSubmitting(true);
    try {
      const { order, message } = await api.createOrder(payload);

      if (
        paymentMethod !== 'Cash on Delivery' &&
        (transactionRef.trim().length >= 4 || receiptFileData)
      ) {
        const accountUsed =
          paymentMethod === 'Bank Alfalah'
            ? s.bankAccountNumber
            : paymentMethod === 'JazzCash Merchant' || paymentMethod === 'JazzCash'
            ? s.jazzCashAccount
            : paymentMethod === 'JazzCash Personal'
            ? s.jazzCashPersonalAccount || 'Pending owner confirmation'
            : paymentMethod === 'Easypaisa'
            ? s.easypaisaAccount || 'Pending owner confirmation'
            : s.raastId;

        await api.uploadReceipt({
          order_id: order.id,
          payment_method: paymentMethod,
          sender_name: senderName.trim() || customerName.trim(),
          transaction_ref: transactionRef.trim() || 'PENDING',
          amount_paid: totalPayable,
          payment_datetime: paymentDatetime,
          receipt_image_url: receiptFileData || undefined,
          bank_name: paymentMethod === 'Bank Alfalah' ? s.bankName : paymentMethod,
          account_number: accountUsed,
        });
      }

      try {
        sessionStorage.setItem(
          'mvfs_last_tracked_order',
          JSON.stringify({
            id: order.id,
            phone4: customerPhone.replace(/\D/g, '').slice(-4),
          })
        );
      } catch {}

      setConfirmedNote(message || '');
      setConfirmedOrder(order);
      onOrderSuccess(order);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to place order. Please check details.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Confirmation Screen ---
  if (confirmedOrder) {
    const waUrl = buildOrderWhatsAppUrl(confirmedOrder, s.whatsapp);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs overflow-y-auto">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 my-auto">
          <div className="flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-lg font-extrabold">
                {lang === 'ur' ? 'آرڈر ویب سائٹ پر محفوظ ہو گیا!' : 'Order Saved on Website!'}
              </h3>
              <p className="text-xs text-slate-600 font-mono-num">
                Order ID: <strong>#{confirmedOrder.id}</strong> •{' '}
                {new Date(confirmedOrder.created_at).toLocaleString('en-PK')}
              </p>
            </div>
          </div>

          {confirmedNote && (
            <p className="text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {confirmedNote}
            </p>
          )}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between font-bold">
              <span>{lang === 'ur' ? 'آرڈر تاریخ و وقت:' : 'Order Date & Time:'}</span>
              <span className="font-mono-num text-slate-800">
                {new Date(confirmedOrder.created_at).toLocaleString('en-PK')}
              </span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{lang === 'ur' ? 'آرڈر اسٹیٹس:' : 'Order Status:'}</span>
              <span className="text-emerald-800">{confirmedOrder.order_status}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{lang === 'ur' ? 'ادائیگی کا طریقہ:' : 'Payment Method:'}</span>
              <span className="text-slate-900">{confirmedOrder.payment_method}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{lang === 'ur' ? 'ادائیگی کا اسٹیٹس:' : 'Payment Status:'}</span>
              <span
                className={
                  confirmedOrder.payment_status === 'Pending Verification'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }
              >
                {lang === 'ur'
                  ? getPaymentStatusUrdu(confirmedOrder.payment_status)
                  : confirmedOrder.payment_status}
              </span>
            </div>
            {confirmedOrder.payment_status === 'Pending Verification' && (
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-1">
                {lang === 'ur'
                  ? 'آپ کی آن لائن ادائیگی دکان کے مالک (حامد علی) کی تصدیق تک Pending Verification رہے گی۔'
                  : 'Your online payment details remain Pending Verification until approved by the Shop Owner.'}
              </p>
            )}
            <div className="pt-2 border-t border-slate-200 space-y-1">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>{lang === 'ur' ? 'اشیاء کا کل بل (Items Total):' : 'Items Total / اشیاء کا کل بل:'}</span>
                <span className="font-mono-num">Rs. {confirmedOrder.subtotal}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-700">
                <span>
                  {lang === 'ur' ? 'ڈیلیوری چارجز (Delivery Charges)' : 'Delivery Charges / ڈیلیوری چارجز'}
                  {confirmedOrder.delivery_distance_km > 0 ? ` (${confirmedOrder.delivery_distance_km} km)` : ''}:
                </span>
                <span className="font-mono-num">Rs. {confirmedOrder.delivery_fee}</span>
              </div>
              {confirmedOrder.discount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>{lang === 'ur' ? 'کوپن رعایت:' : 'Discount:'}</span>
                  <span className="font-mono-num">- Rs. {confirmedOrder.discount}</span>
                </div>
              )}
              {(confirmedOrder.loyalty_points_used > 0 || (confirmedOrder.loyalty_discount_rs ?? 0) > 0) && (
                <div className="flex justify-between text-amber-700 font-bold">
                  <span>
                    {lang === 'ur'
                      ? `لائلٹی پوائنٹس رعایت (${confirmedOrder.loyalty_points_used} pts):`
                      : `Loyalty Used (${confirmedOrder.loyalty_points_used} pts):`}
                  </span>
                  <span className="font-mono-num">
                    - Rs. {confirmedOrder.loyalty_discount_rs ?? confirmedOrder.loyalty_points_used}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-slate-200 font-extrabold text-sm">
                <span>{lang === 'ur' ? 'کل قابلِ ادائیگی رقم (Grand Total):' : 'Grand Total / کل قابلِ ادائیگی رقم:'}</span>
                <span className="font-mono-num text-emerald-900">Rs. {confirmedOrder.total_amount}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="flex items-center gap-1.5 flex-wrap justify-center">
                <span>
                  {lang === 'ur'
                    ? 'اب واٹس ایپ پر مکمل بل دکان کو بھیجیں'
                    : 'Send Complete Bill on WhatsApp'}
                </span>
                <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                  {waDisplay}
                </span>
              </span>
            </a>
            <p className="text-[11px] text-center text-slate-600 font-medium">
              {lang === 'ur'
                ? 'آپ کا آرڈر آن لائن ویب سائٹ پر بھی آ گیا ہے اور اوپر والا بٹن دبا کر دکان کے واٹس ایپ پر بھی فوراً بل بھیج دیں۔'
                : 'Your order is saved online and tapping above opens WhatsApp with your complete itemized bill ready to send.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                const id = confirmedOrder.id;
                onClose();
                onOpenTrackOrder(id);
              }}
              className="py-2.5 rounded-xl bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ClipboardList className="w-5 h-5" />
              {lang === 'ur' ? 'آرڈر ٹریک کریں' : 'Track Order'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
            >
              {lang === 'ur' ? 'بند کریں' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Offline Saved Confirmation ---
  if (offlineSavedOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-amber-800">
            <WifiOff className="w-9 h-9 text-amber-600 shrink-0" />
            <div>
              <h3 className="text-base font-extrabold">
                {lang === 'ur' ? 'آف لائن آرڈر محفوظ (Pending Synchronization)' : 'Saved Offline — Pending Synchronization'}
              </h3>
              <p className="text-xs text-slate-600 font-mono-num">Ref: {offlineSavedOrder.local_id}</p>
            </div>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-200">
            {lang === 'ur'
              ? 'انٹرنیٹ نہ ہونے کی وجہ سے یہ آرڈر ابھی کنفرم نہیں ہوا بلکہ آپ کے موبائل میں محفوظ کر لیا گیا ہے۔ انٹرنیٹ آتے ہی قیمت، اسٹاک اور ڈیلیوری فیس کی دوبارہ تصدیق کے بعد بھیجا جائے گا۔'
              : 'You are currently offline. This order is saved locally as Pending Synchronization (not confirmed yet). Once back online, prices, stock, and delivery fee will be verified before final confirmation.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-emerald-800 text-white text-sm font-bold cursor-pointer"
          >
            {lang === 'ur' ? 'ٹھیک ہے' : 'Okay'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-emerald-950 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold">
              {lang === 'ur' ? 'آرڈر چیک آؤٹ (صرف خانیوال شہر)' : 'Khanewal Order Checkout'}
            </h2>
            <p className="text-[11px] text-emerald-300">
              {lang === 'ur'
                ? `${deliveryCfg.baseKm} کلومیٹر تک ڈیلیوری ${deliveryCfg.baseDeliveryFee} روپے، اس کے بعد +${deliveryCfg.extraKmRate} روپے فی اضافی کلومیٹر (جزوی کلومیٹر اوپر راؤنڈ ہوگا)`
                : `Rs ${deliveryCfg.baseDeliveryFee} up to ${deliveryCfg.baseKm} km, then +Rs ${deliveryCfg.extraKmRate} per additional km (fractional km rounded up)`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePlaceOrder} className="p-4 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Form Fields */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5 text-xs font-bold text-amber-950 space-y-1">
              <p>
                {lang === 'ur'
                  ? 'اہم نوٹ: صرف کسٹمر کا نام اور موبائل نمبر لازمی ہیں۔ باقی تمام خانے اختیاری ہیں۔ آپ صرف نام اور موبائل نمبر کے ساتھ اپنا آرڈر کنفرم کر سکتے ہیں۔'
                  : 'Important: Customer name and mobile number are required. All other fields are optional. You can confirm your order using only your name and mobile number.'}
              </p>
              {lang === 'ur' && (
                <p className="text-[11px] font-semibold text-amber-900" dir="ltr">
                  Important: Customer name and mobile number are required. All other fields are optional. You can confirm your order using only your name and mobile number.
                </p>
              )}
            </div>

            {/* Customer Info (Only Mandatory Fields) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-emerald-950">
                  {lang === 'ur' ? 'کسٹمر کی لازمی معلومات' : 'Required Customer Details'}
                </span>
                {hasSavedAutofill && (
                  <button
                    type="button"
                    onClick={handleClearSavedCustomer}
                    className="text-[11px] font-bold text-slate-500 hover:text-rose-700 underline cursor-pointer"
                  >
                    {lang === 'ur' ? 'محفوظ معلومات صاف کریں' : 'Clear Saved Info'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ur' ? 'مکمل نام *' : 'Customer Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={lang === 'ur' ? 'مثلاً: محمد احمد' : 'e.g. Muhammad Ahmad'}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ur' ? 'موبائل / واٹس ایپ نمبر *' : 'Mobile Phone Number *'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>
            </div>

            {/* Optional Khanewal Area, Live GPS & Manual Address */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <MapPin className="w-5 h-5 text-emerald-700" />
                  {lang === 'ur' ? 'لوکیشن و پتہ (اختیاری — خانیوال)' : 'Location & Address (Optional — Khanewal)'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(areaId || coords) && (
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:text-rose-700 text-[11px] font-bold cursor-pointer"
                    >
                      {lang === 'ur' ? 'لوکیشن ہٹائیں' : 'Clear Location'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={calculatingGps}
                    onClick={handleUseCurrentGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold cursor-pointer"
                  >
                    <Navigation className="w-4 h-4" />
                    {calculatingGps
                      ? lang === 'ur'
                        ? 'معلوم ہو رہا ہے...'
                        : 'Locating...'
                      : lang === 'ur'
                      ? 'میری GPS لوکیشن لیں (اختیاری)'
                      : 'Share Live GPS (Optional)'}
                  </button>
                </div>
              </div>

              <select
                value={areaId}
                onChange={(e) => handleSectorChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold"
              >
                <option value="">
                  {lang === 'ur'
                    ? 'لوکیشن منتخب نہیں کی گئی (اختیاری — بغیر لوکیشن آرڈر کریں)'
                    : 'No location selected (Optional — proceed without location)'}
                </option>
                {sectorsList.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {lang === 'ur' ? loc.nameUr : loc.name}
                    {loc.roadDistanceKm > 0
                      ? ` (${loc.roadDistanceKm} km — Rs. ${calculateDeliveryFee(loc.roadDistanceKm, deliveryCfg)})`
                      : ''}
                  </option>
                ))}
              </select>

              {gpsStatus && <p className="text-xs font-bold text-emerald-800">{gpsStatus}</p>}
              {routeError && (
                <div className="text-xs font-bold text-amber-950 bg-amber-50 p-2.5 rounded-xl border border-amber-300 space-y-2">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>{routeError}</span>
                  </div>
                  {isEmbeddedIframe && typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-extrabold"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      {lang === 'ur'
                        ? 'فل اسکرین براؤزر ٹیب میں لائیو GPS آن کریں'
                        : 'Open Full Browser Tab for Auto GPS'}
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-emerald-900 font-mono-num">
                  <span>
                    {coords
                      ? `GPS Pin: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                      : lang === 'ur'
                      ? 'GPS پن: شامل نہیں (اختیاری)'
                      : 'GPS Pin: Not selected (Optional)'}
                  </span>
                  <span>
                    {distanceKm > 0
                      ? `${distanceKm} km — ${lang === 'ur' ? 'نقشے پر ٹچ کر کے پن تبدیل کریں' : 'Tap map to adjust pin'}`
                      : lang === 'ur'
                      ? 'اگر چاہیں تو علاقہ چنیں یا نقشے پر ٹچ کریں'
                      : 'Optional: pick area or tap map'}
                  </span>
                </div>
                <LiveDeliveryMap
                  customerLocation={
                    coords
                      ? {
                          lat: coords.lat,
                          lng: coords.lng,
                          label: selectedSector?.name || 'Customer GPS',
                        }
                      : null
                  }
                  onCustomerPinChange={(lat, lng) =>
                    applyCoordinatesRoute(lat, lng, lang === 'ur' ? 'نقشے کا پن' : 'Map Pin')
                  }
                  heightClass="h-44"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'ur'
                    ? 'مکمل گھر / دکان کا پتہ (اختیاری)'
                    : 'House Number & Complete Address (Optional)'}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={lang === 'ur' ? 'گلی نمبر، مکان نمبر، نزد مشہور جگہ (اختیاری)' : 'House #, Street #, Near Landmark, Khanewal (Optional)'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ur' ? 'ڈیلیوری کا وقت (اختیاری)' : 'Preferred Delivery Time (Optional)'}
                  </label>
                  <select
                    value={deliverySlot}
                    onChange={(e) => setDeliverySlot(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="">
                      {lang === 'ur' ? 'اختیاری — کسی بھی وقت' : 'Optional — Flexible Time'}
                    </option>
                    <option value="Express Delivery (45–60 mins)">
                      {lang === 'ur' ? 'فوری ڈیلیوری (45 تا 60 منٹ)' : 'Express Delivery (45–60 mins)'}
                    </option>
                    <option value="Morning (8:00 AM – 11:00 AM)">
                      {lang === 'ur' ? 'صبح (8 تا 11 بجے)' : 'Morning (8:00 AM – 11:00 AM)'}
                    </option>
                    <option value="Evening (4:00 PM – 8:00 PM)">
                      {lang === 'ur' ? 'شام (4 تا 8 بجے)' : 'Evening (4:00 PM – 8:00 PM)'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ur' ? 'خاص ہدایات (اختیاری)' : 'Special Instructions (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'ur' ? 'مثلاً: سبزیاں کچی نہ ہوں (اختیاری)' : 'e.g. Pack tomatoes separately (Optional)'}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Tabs (Optional — defaults safely to Cash on Delivery) */}
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                {lang === 'ur'
                  ? 'ادائیگی کا طریقہ (اختیاری — ڈیفالٹ کیش آن ڈیلیوری)'
                  : 'Payment Method (Optional — defaults to Cash on Delivery)'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  'JazzCash Merchant',
                  'JazzCash Personal',
                  'Easypaisa',
                  'Cash on Delivery',
                  'Bank Alfalah',
                  'Raast ID',
                ] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                      paymentMethod === m
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {(paymentMethod === 'JazzCash Merchant' || paymentMethod === 'JazzCash') && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <img
                      src={s.jazzCashQrImage.startsWith('/assets/') ? `.${s.jazzCashQrImage}` : s.jazzCashQrImage}
                      alt="HAMID Shop JazzCash Merchant & Raast QR"
                      className="w-36 h-48 object-contain rounded-xl border border-amber-300 bg-white p-1 shrink-0"
                    />
                    <div className="space-y-1.5 w-full">
                      <p className="font-extrabold text-sm text-amber-950">
                        JazzCash Merchant — {s.jazzCashStoreName} ({s.jazzCashTitle})
                      </p>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-amber-200">
                        <span>Account: <strong className="font-mono-num">{s.jazzCashAccount}</strong></span>
                        <button type="button" onClick={() => copyText(s.jazzCashAccount, 'jc')} className="text-emerald-700 font-bold flex items-center gap-1 cursor-pointer">
                          {copiedField === 'jc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-amber-200">
                        <span>TILL ID: <strong className="font-mono-num">{s.jazzCashTillId}</strong> (Dial {s.jazzCashUssd})</span>
                        <button type="button" onClick={() => copyText(s.jazzCashTillId, 'till')} className="text-emerald-700 font-bold flex items-center gap-1 cursor-pointer">
                          {copiedField === 'till' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-amber-200">
                        <span className="truncate">IBAN: <strong className="font-mono-num">{s.jazzCashIban}</strong></span>
                        <button type="button" onClick={() => copyText(s.jazzCashIban, 'jciban')} className="text-emerald-700 font-bold flex items-center gap-1 cursor-pointer">
                          {copiedField === 'jciban' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'JazzCash Personal' && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-2 text-xs">
                  <p className="font-extrabold text-sm text-amber-950">
                    {lang === 'ur' ? 'JazzCash ذاتی اکاؤنٹ (Personal Account)' : 'JazzCash Personal Account Transfer'}
                  </p>
                  {s.jazzCashPersonalAccount ? (
                    <>
                      <p>
                        {lang === 'ur' ? 'اکاؤنٹ ٹائٹل:' : 'Account Title:'}{' '}
                        <strong>{s.jazzCashPersonalTitle || 'HAMID ALI'}</strong>
                      </p>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-amber-200">
                        <span>Mobile Account: <strong className="font-mono-num">{s.jazzCashPersonalAccount}</strong></span>
                        <button type="button" onClick={() => copyText(s.jazzCashPersonalAccount || '', 'jcpers')} className="text-emerald-700 font-bold cursor-pointer">
                          {copiedField === 'jcpers' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-white border border-amber-200 text-amber-900 space-y-1">
                      <p className="font-bold">
                        {lang === 'ur'
                          ? `ذاتی JazzCash نمبر ابھی مالک کی طرف سے ایڈمن سیٹنگز میں شامل کیا جانا باقی ہے۔ تصدیق کے لیے واٹس ایپ ${waDisplay} پر رابطہ کریں یا JazzCash Merchant (${s.jazzCashAccount}) استعمال کریں۔`
                          : `Separate JazzCash Personal number has not been entered by the Shop Owner yet. Confirm on WhatsApp ${waDisplay} before sending, or select JazzCash Merchant (${s.jazzCashAccount}).`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'Easypaisa' && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 space-y-2 text-xs">
                  <p className="font-extrabold text-sm text-emerald-950">
                    {lang === 'ur' ? 'ایزی پیسہ اکاؤنٹ (Easypaisa)' : 'Easypaisa Account Transfer'}
                  </p>
                  {s.easypaisaAccount ? (
                    <>
                      <p>
                        {lang === 'ur' ? 'اکاؤنٹ ٹائٹل:' : 'Account Title:'}{' '}
                        <strong>{s.easypaisaTitle || 'HAMID ALI'}</strong>
                      </p>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <span>Easypaisa Number: <strong className="font-mono-num">{s.easypaisaAccount}</strong></span>
                        <button type="button" onClick={() => copyText(s.easypaisaAccount || '', 'ep')} className="text-emerald-700 font-bold cursor-pointer">
                          {copiedField === 'ep' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-950 space-y-1">
                      <p className="font-bold">
                        {lang === 'ur'
                          ? `ایزی پیسہ نمبر ابھی ایڈمن پینل میں سیٹ نہیں کیا گیا۔ براہ کرم ادائیگی سے پہلے واٹس ایپ ${waDisplay} پر نمبر کنفرم کر لیں اور نیچے TID درج کریں۔`
                          : `Easypaisa account number is not yet configured in Owner Settings. Please confirm the number via WhatsApp ${waDisplay} before transferring, then enter your TID below.`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'Bank Alfalah' && (
                <div className="rounded-2xl border border-sky-300 bg-sky-50/70 p-4 space-y-2 text-xs">
                  <p className="font-extrabold text-sm text-sky-950">
                    {s.bankName} — {s.bankBranch}
                  </p>
                  <p>{lang === 'ur' ? 'اکاؤنٹ ٹائٹل:' : 'Account Title:'} <strong>{s.bankAccountTitle}</strong></p>
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-sky-200">
                    <span>Account #: <strong className="font-mono-num">{s.bankAccountNumber}</strong></span>
                    <button type="button" onClick={() => copyText(s.bankAccountNumber, 'bank')} className="text-sky-700 font-bold cursor-pointer">
                      {copiedField === 'bank' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-sky-200">
                    <span className="truncate">IBAN: <strong className="font-mono-num">{s.bankIban}</strong></span>
                    <button type="button" onClick={() => copyText(s.bankIban, 'biban')} className="text-sky-700 font-bold cursor-pointer">
                      {copiedField === 'biban' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-600">SWIFT: <span className="font-mono-num font-bold">{s.bankSwiftCode}</span></p>
                </div>
              )}

              {paymentMethod === 'Raast ID' && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 space-y-2 text-xs">
                  <p className="font-extrabold text-sm text-emerald-950">Raast Instant Payment — {s.jazzCashStoreName}</p>
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-emerald-200">
                    <span>Raast ID: <strong className="font-mono-num">{s.raastId}</strong></span>
                    <button type="button" onClick={() => copyText(s.raastId, 'raast')} className="text-emerald-700 font-bold cursor-pointer">
                      {copiedField === 'raast' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {paymentMethod !== 'Cash on Delivery' && (
                <div className="rounded-2xl border border-amber-300 bg-white p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 p-2 rounded-lg">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      {lang === 'ur'
                        ? 'تمام آن لائن ادائیگیاں مالک (حامد علی) کی تصدیق تک Pending Verification رہیں گی۔'
                        : 'All online payments remain Pending Verification until reviewed & approved by the Shop Owner.'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {lang === 'ur' ? 'بھیجنے والے کا نام' : 'Sender Account Name'}
                      </label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder={customerName || 'Account Holder'}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {lang === 'ur' ? 'ٹرانزیکشن ID / TID (اختیاری)' : 'Transaction ID / TID (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder="e.g. 9849123456 (Optional)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {lang === 'ur' ? 'ادائیگی کی تاریخ و وقت' : 'Transfer Date & Time'}
                      </label>
                      <input
                        type="datetime-local"
                        value={paymentDatetime}
                        onChange={(e) => setPaymentDatetime(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {lang === 'ur' ? 'رسید اسکرین شاٹ (اختیاری)' : 'Receipt Screenshot (Optional)'}
                      </label>
                      <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 bg-emerald-50 text-xs font-bold text-emerald-800 cursor-pointer hover:bg-emerald-100">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{receiptFileData ? (lang === 'ur' ? 'اسکرین شاٹ منسلک ✓' : 'Attached ✓') : lang === 'ur' ? 'تصویر منتخب کریں' : 'Upload Proof'}</span>
                        <input type="file" accept="image/*" onChange={handleReceiptUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Order Summary */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                {lang === 'ur' ? 'آرڈر بل کا خلاصہ' : 'Order Bill Summary'}
              </h3>

              <div className="max-h-48 overflow-y-auto space-y-2 divide-y divide-slate-200 text-xs">
                {items.map((it) => (
                  <div key={it.cartItemId} className="pt-2 first:pt-0 flex justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {lang === 'ur' ? it.product.urdu_name || it.product.name : it.product.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatWeight(it.weightGrams, it.product.unit, lang)} × Rs.{it.unitPrice}
                      </p>
                    </div>
                    <span className="font-bold font-mono-num text-slate-900">Rs. {it.lineTotal}</span>
                  </div>
                ))}
              </div>

              {/* Coupon */}
              <div className="flex gap-1.5 pt-2 border-t border-slate-200">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-2.5" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder={lang === 'ur' ? 'ایڈمن کا کوپن کوڈ درج کریں' : 'Enter Coupon Code'}
                    className="w-full ps-8 pe-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-num uppercase"
                  />
                </div>
                {appliedCouponCode ? (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold cursor-pointer"
                  >
                    {lang === 'ur' ? 'ہٹائیں' : 'Remove'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    {lang === 'ur' ? 'لاگو کریں' : 'Apply'}
                  </button>
                )}
              </div>
              {couponMsg && (
                <p className={`text-[11px] font-bold ${appliedCouponCode ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {couponMsg}
                </p>
              )}

              {loyaltyEnabled && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-[11px]">
                  {customerPhone.replace(/\D/g, '').length < 10 ? (
                    <div className="flex items-center gap-2 text-amber-900 font-semibold">
                      <Award className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        {lang === 'ur'
                          ? 'اپنے ممبرشپ ٹائر اور لائلٹی پوائنٹس (100 پوائنٹس = 100 روپے) دیکھنے کے لیے موبائل نمبر درج کریں۔'
                          : 'Enter your mobile number to view your Membership Tier & Loyalty Wallet (100 pts = Rs. 100).'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 font-bold text-amber-950">
                        <span className="flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-amber-700" />
                          {lang === 'ur' ? 'لائلٹی والیٹ' : 'Loyalty Wallet'}
                          <span className="px-1.5 py-0.5 rounded bg-white border border-amber-300 text-[10px] font-extrabold text-amber-900">
                            {loyaltyAccount?.tier || 'None'}
                          </span>
                        </span>
                        <span className="font-mono-num text-emerald-900">
                          {loyaltyAccount?.points_balance ?? 0} pts (= Rs. {Math.round((loyaltyAccount?.points_balance ?? 0) * pointValueRs)})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-amber-900/90">
                        <span>100 pts = Rs. {Math.round(100 * pointValueRs)}</span>
                        <span>
                          {lang === 'ur'
                            ? `ڈیلیور ہونے پر متوقع پوائنٹس: +${estimatedPointsEarnedOnDelivery} pts`
                            : `Earn on delivery: +${estimatedPointsEarnedOnDelivery} pts (${pointsPer100Rs} pts/Rs.100)`}
                        </span>
                      </div>

                      {couponBlocksLoyalty ? (
                        <p className="text-[10px] font-bold text-amber-800 bg-white/80 rounded-lg px-2 py-1 border border-amber-200">
                          {lang === 'ur'
                            ? `کوپن ${appliedCoupon?.code} کے ساتھ پوائنٹس استعمال نہیں کیے جا سکتے۔ پوائنٹس استعمال کرنے کے لیے کوپن ہٹائیں۔`
                            : `Coupon ${appliedCoupon?.code} cannot be combined with loyalty redemption. Remove coupon to use points.`}
                        </p>
                      ) : (loyaltyAccount?.points_balance ?? 0) <= 0 ? (
                        <p className="text-[10px] font-semibold text-slate-600">
                          {lang === 'ur'
                            ? 'فی الحال آپ کے اکاؤنٹ میں 0 پوائنٹس ہیں۔ آرڈر ڈیلیور ہونے پر پوائنٹس شامل ہوں گے۔'
                            : 'You currently have 0 available points. Redemption is available once delivered orders earn points.'}
                        </p>
                      ) : maxRedeemable <= 0 ? (
                        <p className="text-[10px] font-semibold text-slate-600">
                          {lang === 'ur'
                            ? 'پوائنٹس استعمال کرنے کے لیے قابلِ ادائیگی اشیاء کی رقم کافی نہیں ہے۔'
                            : 'No remaining product subtotal eligible for points redemption.'}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer text-amber-950 font-bold">
                            <input
                              type="checkbox"
                              checked={redeemLoyalty}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setRedeemLoyalty(checked);
                                if (checked && customRedeemPoints === '') {
                                  setCustomRedeemPoints(String(maxRedeemable));
                                }
                              }}
                              className="rounded border-amber-400"
                            />
                            <span>
                              {lang === 'ur'
                                ? `پوائنٹس استعمال کریں: ${loyaltyPointsUsed || maxRedeemable} pts (Rs. ${Math.round((loyaltyPointsUsed || maxRedeemable) * pointValueRs)} رعایت)`
                                : `Redeem ${loyaltyPointsUsed || maxRedeemable} pts (Rs. ${Math.round((loyaltyPointsUsed || maxRedeemable) * pointValueRs)} discount)`}
                            </span>
                          </label>
                          {redeemLoyalty && (
                            <div className="flex items-center gap-2 ps-5">
                              <span className="text-[10px] text-amber-900 font-semibold">
                                {lang === 'ur' ? 'تعداد:' : 'Points:'}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={maxRedeemable}
                                value={customRedeemPoints === '' ? maxRedeemable : customRedeemPoints}
                                onChange={(e) => setCustomRedeemPoints(e.target.value)}
                                className="w-24 px-2 py-1 rounded-lg border border-amber-300 bg-white font-mono-num text-[11px] font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => setCustomRedeemPoints(String(maxRedeemable))}
                                className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-950 text-[10px] font-bold cursor-pointer"
                              >
                                Max ({maxRedeemable})
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {lang === 'ur' ? 'اشیاء کا کل بل (Items Total):' : 'Items Total / اشیاء کا کل بل:'}
                  </span>
                  <span className="font-bold font-mono-num">Rs. {subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {lang === 'ur'
                      ? `ڈیلیوری چارجز (${distanceKm > 0 ? `${distanceKm} km` : 'لوکیشن نہیں'}):`
                      : `Delivery Charges / ڈیلیوری چارجز (${distanceKm > 0 ? `${distanceKm} km` : 'Optional'}):`}
                  </span>
                  <span className="font-bold font-mono-num text-emerald-800">
                    Rs. {deliveryFee}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>{lang === 'ur' ? 'کوپن رعایت:' : 'Coupon Discount:'}</span>
                    <span className="font-mono-num">- Rs. {discountAmount}</span>
                  </div>
                )}
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>{lang === 'ur' ? 'لائلٹی پوائنٹس رعایت:' : 'Loyalty Points Redeemed:'}</span>
                    <span className="font-mono-num">- Rs. {loyaltyDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-300 text-base font-extrabold text-emerald-950">
                  <span>{lang === 'ur' ? 'کل قابلِ ادائیگی رقم (Grand Total):' : 'Grand Total / کل قابلِ ادائیگی رقم:'}</span>
                  <span className="font-mono-num">Rs. {totalPayable}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-400 text-white font-extrabold text-sm shadow-md transition cursor-pointer"
              >
                {submitting
                  ? lang === 'ur'
                    ? 'آرڈر محفوظ کیا جا رہا ہے...'
                    : 'Placing Order...'
                  : lang === 'ur'
                  ? `آرڈر کنفرم کریں (Rs. ${totalPayable})`
                  : `Place Order (Rs. ${totalPayable})`}
              </button>

              <p className="text-[11px] text-slate-500 flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>
                    {lang === 'ur'
                      ? 'سروس صرف خانیوال شہر کے لیے ہے۔'
                      : 'Khanewal city service only.'}
                  </span>
                </span>
                <a
                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent(
                    lang === 'ur'
                      ? 'السلام علیکم! مجھے آرڈر چیک آؤٹ میں مدد درکار ہے۔'
                      : 'Assalam-o-Alaikum, I need help with my Khanewal order checkout.'
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-green-700 font-bold hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                    {waDisplay}
                  </span>
                </a>
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
