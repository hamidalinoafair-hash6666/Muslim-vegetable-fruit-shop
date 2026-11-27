import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  LogOut,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Truck,
  TrendingUp,
  Sparkles,
  Mic,
  MicOff,
  Download,
  Database,
  RefreshCw,
  FileArchive,
  MessageCircle,
  Settings,
  Users,
  BarChart3,
  Package,
  CreditCard,
  ShoppingBag,
  KeyRound,
  Edit3,
  Printer,
  RotateCcw,
  Bell,
  Copy,
  Check,
  ExternalLink,
  Store,
  Award,
  Plug,
} from 'lucide-react';
import {
  AppLanguage,
  AuditLogEntry,
  Coupon,
  CustomerComplaint,
  CustomerDirectoryEntry,
  DatabaseBackup,
  DeliveryAreaOption,
  Expense,
  IntegrationStatus,
  LoyaltyAccount,
  MarketingCampaign,
  OptimizedRoute,
  Order,
  OrderStatus,
  PaymentReceipt,
  Product,
  ProductCategory,
  Rider,
  SeasonTag,
  ShopSettings,
} from '../types';
import { DEFAULT_SHOP_SETTINGS, KHANEWAL_LOCATIONS } from '../data/initialData';
import { api, tokenStore } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { buildOrderWhatsAppUrl, calculateDeliveryFee } from '../utils/calculations';
import { LiveDeliveryMap } from './LiveDeliveryMap';

interface AdminDashboardProps {
  isOpen: boolean;
  lang: AppLanguage;
  onClose: () => void;
  onCatalogUpdated: () => void;
}

type AdminTab =
  | 'overview'
  | 'store'
  | 'catalog'
  | 'orders'
  | 'payments'
  | 'dispatch'
  | 'reports'
  | 'customers'
  | 'security';

const AUTHORIZED_EMAIL = 'hamidalinoafair@gmail.com';

const ORDER_STATUSES: OrderStatus[] = [
  'Order Received',
  'Order Accepted',
  'Order Confirmed',
  'Preparing',
  'Ready for Delivery',
  'Rider Assigned',
  'Picked Up',
  'On the Way',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isOpen,
  lang,
  onClose,
  onCatalogUpdated,
}) => {
  // Auth state
  const [authStatus, setAuthStatus] = useState<{
    configured: boolean;
    twoFactorEnabled: boolean;
    email: string;
  } | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'password' | 'supabase' | 'recover'>('password');
  const [emailInput, setEmailInput] = useState('hamid ali');
  const [passwordInput, setPasswordInput] = useState('');
  const [totpInput, setTotpInput] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailResetNewPwd, setEmailResetNewPwd] = useState('');
  const [confirm2FAEnable, setConfirm2FAEnable] = useState(false);

  // Change Password state inside Security tab
  const [currentPwdInput, setCurrentPwdInput] = useState('');
  const [changeNewPwdInput, setChangeNewPwdInput] = useState('');
  const [confirmNewPwdInput, setConfirmNewPwdInput] = useState('');
  const [pwdChangeLoading, setPwdChangeLoading] = useState(false);
  const [pwdChangeMsg, setPwdChangeMsg] = useState('');
  const [pwdChangeErr, setPwdChangeErr] = useState('');

  // Dashboard tabs & data
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportData, setReportData] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [complaints, setComplaints] = useState<CustomerComplaint[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [customersDirectory, setCustomersDirectory] = useState<CustomerDirectoryEntry[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [adjustLoyaltyForm, setAdjustLoyaltyForm] = useState<{
    phone: string;
    name: string;
    delta: string;
    reason: string;
  } | null>(null);
  const [viewingCustomerLedger, setViewingCustomerLedger] = useState<LoyaltyAccount | null>(null);
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationStatus | null>(null);
  const [newSectorForm, setNewSectorForm] = useState({
    name: '',
    nameUr: '',
    roadDistanceKm: '2.5',
    lat: '30.3017',
    lng: '71.9321',
  });
  const [riderPinEdit, setRiderPinEdit] = useState<{ id: string; pin: string } | null>(null);
  const [liveFleet, setLiveFleet] = useState<{
    riders: Rider[];
    activeOrders: Partial<Order>[];
  } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<Awaited<ReturnType<typeof api.getAdminLaunchStatus>> | null>(null);
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Private receipt image modal, Edit product modal, Print bill modal, Cancel reason modal
  const [viewingReceiptImg, setViewingReceiptImg] = useState<{
    id: string;
    dataUrl: string;
  } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<{ id: string; reason: string } | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  // Add Product form
  const [newProd, setNewProd] = useState({
    name: '',
    urdu_name: '',
    price: '',
    cost_price: '',
    unit: 'Kg',
    stock_quantity: '40',
    category: 'vegetables' as ProductCategory,
    season_tag: 'all_year' as SeasonTag,
    is_offer: false,
    is_seasonal: false,
  });

  // Dispatch & Route
  const [selectedDispatchOrders, setSelectedDispatchOrders] = useState<string[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState('RIDER-01');
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [newRider, setNewRider] = useState({
    name: '',
    phone: '',
    vehicle_type: 'Motorcycle (Insulated Box)' as Rider['vehicle_type'],
    vehicle_reg: '',
    pin: '',
  });

  // Expense & Coupon & Marketing forms
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'Wholesale Purchase' as Expense['category'],
  });
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'fixed' as Coupon['discount_type'],
    value: '50',
    min_order: '500',
    description: '',
    assigned_phones: '',
    expires_at: '',
    max_uses: '',
    per_customer_limit: '',
    allow_loyalty_stacking: false,
  });
  const [editingCouponCode, setEditingCouponCode] = useState<string | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    title: '',
    message: '',
    discount_code: '',
  });

  // 2FA setup reveal
  const [twoFaSecretHex, setTwoFaSecretHex] = useState('');

  // Owner AI Assistant (Voice + Text with Confirmation Card)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState('');
  const [aiProposal, setAiProposal] = useState<{
    actionType: 'update_price' | 'update_stock';
    productId: string;
    productName: string;
    urduName?: string;
    currentValue: number;
    proposedValue: number;
    unit: string;
  } | null>(null);
  const [listeningVoice, setListeningVoice] = useState(false);

  const flashMsg = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const loadAllAdminData = async () => {
    try {
      const [
        ov,
        prodsRes,
        ords,
        rcpts,
        rdrs,
        rep,
        exps,
        cpns,
        cmps,
        bks,
        auds,
        notifLogs,
        st,
        camps,
        lStatus,
        custDir,
        intStatus,
      ] = await Promise.all([
        api.getAdminOverview(),
        api.getProducts('all', true),
        api.getAdminOrders(),
        api.getAdminReceipts(),
        api.getAdminRiders(),
        api.getBusinessReport(reportRange),
        api.getExpenses(),
        api.getCoupons(),
        api.getComplaints(),
        api.getBackupHistory(),
        api.getAuditLogs(),
        api.getNotificationLogs().catch(() => []),
        api.getSettings(),
        api.getMarketingCampaigns(),
        api.getAdminLaunchStatus().catch(() => null),
        api.getCustomersDirectory().catch(() => []),
        api.getIntegrationsStatus().catch(() => null),
      ]);
      setOverview(ov);
      setProducts(prodsRes.products);
      setOrders(ords);
      setReceipts(rcpts);
      setRiders(rdrs);
      setReportData(rep);
      setExpenses(exps);
      setCoupons(cpns);
      setComplaints(cmps);
      setBackups(bks);
      setAuditLogs(auds);
      setNotificationLogs(notifLogs);
      setSettings({
        ...DEFAULT_SHOP_SETTINGS,
        ...st,
        deliveryAreas:
          st.deliveryAreas && st.deliveryAreas.length > 0 ? st.deliveryAreas : KHANEWAL_LOCATIONS,
      });
      setCampaigns(camps);
      setLaunchStatus(lStatus);
      setCustomersDirectory(custDir);
      setIntegrationsStatus(intStatus);
    } catch (err: any) {
      if (String(err?.message).includes('403') || String(err?.message).includes('owner')) {
        tokenStore.setOwnerToken('');
        setAuthenticated(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    api
      .getOwnerAuthStatus()
      .then((st) => setAuthStatus(st))
      .catch(() => {});

    api.verifyOwnerSession().then(async (res) => {
      if (res.authenticated) {
        setAuthenticated(true);
        loadAllAdminData();
      } else {
        // Check if owner returned from a Gmail Magic Link / active Supabase session
        try {
          const { data } = await supabase.auth.getSession();
          const sbEmail = data?.session?.user?.email?.toLowerCase();
          if (sbEmail === AUTHORIZED_EMAIL && data.session?.access_token) {
            await api.loginOwner({ supabaseAccessToken: data.session.access_token });
            setAuthenticated(true);
            loadAllAdminData();
            return;
          }
        } catch {}
        setAuthenticated(false);
      }
    });
  }, [isOpen]);

  useEffect(() => {
    if (authenticated && isOpen) {
      api.getBusinessReport(reportRange).then(setReportData).catch(() => {});
    }
  }, [reportRange]);

  useEffect(() => {
    if (!authenticated || !isOpen || activeTab !== 'dispatch') return;
    let active = true;
    const refreshFleet = () => {
      api
        .getAdminLiveFleet()
        .then((res) => {
          if (active) setLiveFleet(res);
        })
        .catch(() => {});
    };
    refreshFleet();
    const timer = setInterval(refreshFleet, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authenticated, isOpen, activeTab]);

  if (!isOpen) return null;

  // --- Auth Handlers ---
  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await api.setupOwnerPassword(emailInput.trim(), passwordInput);
      setAuthenticated(true);
      setPasswordInput('');
      await loadAllAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'Setup failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await api.loginOwner({
        email: emailInput.trim(),
        password: passwordInput,
        totpCode: totpInput || undefined,
      });
      if (res.requires2FA) {
        setRequires2FA(true);
        setAuthInfo('Enter 6-digit authenticator TOTP code.');
        setAuthLoading(false);
        return;
      }
      setAuthenticated(true);
      setPasswordInput('');
      setTotpInput('');
      setRequires2FA(false);
      await loadAllAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'Sign in failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSupabaseOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const normalized = emailInput.trim().toLowerCase();
    const resolvedEmail = normalized === 'hamid ali' ? AUTHORIZED_EMAIL : normalized;
    if (resolvedEmail !== AUTHORIZED_EMAIL) {
      setAuthError(`Only Hamid Ali (${AUTHORIZED_EMAIL}) is authorized.`);
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password: passwordInput,
      });
      if (error || !data.session) throw new Error(error?.message || 'Supabase sign-in failed');
      await api.loginOwner({ supabaseAccessToken: data.session.access_token });
      setAuthenticated(true);
      setPasswordInput('');
      await loadAllAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'Supabase login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRecoverRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);
    try {
      if (recoveryStep === 'request') {
        const res = await api.recoverOwnerPassword({ action: 'request', email: emailInput.trim() });
        setAuthInfo(res.message);
        setRecoveryStep('verify');
      } else {
        await api.recoverOwnerPassword({
          action: 'verify',
          email: emailInput.trim(),
          recoveryCode: recoveryCodeInput,
          newPassword: newPasswordInput,
        });
        setAuthInfo(
          lang === 'ur'
            ? 'پاسورڈ کامیابی سے تبدیل ہو گیا! اب نئے پاسورڈ سے لاگ ان کریں۔'
            : 'Password reset successfully! Please sign in now.'
        );
        setAuthMode('password');
        setRecoveryStep('request');
        setRecoveryCodeInput('');
        setNewPasswordInput('');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Recovery failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendSupabaseResetEmail = async () => {
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(AUTHORIZED_EMAIL, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (error) throw new Error(error.message);
      setAuthInfo(
        lang === 'ur'
          ? `پاسورڈ ری سیٹ لنک ${AUTHORIZED_EMAIL} پر بھیج دیا گیا ہے۔ ای میل چیک کریں۔`
          : `Password reset email sent to ${AUTHORIZED_EMAIL}. Please check your inbox.`
      );
    } catch (err: any) {
      setAuthError(err?.message || 'Could not send Supabase reset email.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: AUTHORIZED_EMAIL,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) throw new Error(error.message);
      setEmailOtpSent(true);
      setAuthInfo(
        lang === 'ur'
          ? `آپ کے جی میل (${AUTHORIZED_EMAIL}) پر 6 ہندسوں کا کوڈ اور میجک لنک بھیج دیا گیا ہے! ای میل چیک کریں۔`
          : `Sent a 6-digit OTP code & one-click Magic Link to ${AUTHORIZED_EMAIL}. Check your Gmail inbox.`
      );
    } catch (err: any) {
      setAuthError(err?.message || 'Could not send Email OTP. Make sure your Supabase Auth account exists.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyEmailOtpAndRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    const codeClean = emailOtpCode.trim();
    if (!codeClean) {
      setAuthError(lang === 'ur' ? 'جی میل پر آیا ہوا OTP کوڈ درج کریں۔' : 'Enter the OTP code from your email.');
      return;
    }
    if (emailResetNewPwd.trim() && emailResetNewPwd.trim().length < 6) {
      setAuthError(lang === 'ur' ? 'نیا پاسورڈ کم از کم 6 حروف کا رکھیں۔' : 'New password must be at least 6 characters.');
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: AUTHORIZED_EMAIL,
        token: codeClean,
        type: 'email',
      });
      if (error || !data.session?.access_token) {
        throw new Error(error?.message || 'Invalid or expired Email OTP code.');
      }
      if (emailResetNewPwd.trim().length >= 6) {
        await api.recoverOwnerPassword({
          action: 'reset_with_supabase',
          email: AUTHORIZED_EMAIL,
          supabaseAccessToken: data.session.access_token,
          newPassword: emailResetNewPwd.trim(),
        });
      } else {
        await api.loginOwner({ supabaseAccessToken: data.session.access_token });
      }
      setAuthenticated(true);
      setEmailOtpCode('');
      setEmailResetNewPwd('');
      setEmailOtpSent(false);
      setPasswordInput('');
      setRequires2FA(false);
      flashMsg(
        lang === 'ur'
          ? 'ایڈمن پینل کامیابی سے کھل گیا اور نیا پاسورڈ محفوظ ہو گیا ✓'
          : 'Signed in & password updated cleanly ✓'
      );
      await loadAllAdminData();
    } catch (err: any) {
      setAuthError(err?.message || 'Email OTP verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangeOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdChangeErr('');
    setPwdChangeMsg('');
    if (changeNewPwdInput.length < 6) {
      setPwdChangeErr(
        lang === 'ur'
          ? 'نیا پاسورڈ کم از کم 6 حروف یا ہندسوں کا ہونا چاہیے۔'
          : 'New password must be at least 6 characters.'
      );
      return;
    }
    if (changeNewPwdInput !== confirmNewPwdInput) {
      setPwdChangeErr(
        lang === 'ur'
          ? 'نیا پاسورڈ اور تصدیقی پاسورڈ آپس میں نہیں ملتے۔'
          : 'New password and confirmation do not match.'
      );
      return;
    }
    setPwdChangeLoading(true);
    try {
      const res = await api.changeOwnerPassword(currentPwdInput, changeNewPwdInput);
      setPwdChangeMsg(
        res.message ||
          (lang === 'ur'
            ? 'مالک کا پاسورڈ کامیابی سے تبدیل کر دیا گیا ✓'
            : 'Owner password changed successfully ✓')
      );
      setCurrentPwdInput('');
      setChangeNewPwdInput('');
      setConfirmNewPwdInput('');
    } catch (err: any) {
      setPwdChangeErr(err?.message || 'Failed to change password');
    } finally {
      setPwdChangeLoading(false);
    }
  };

  const handleOwnerLogout = () => {
    tokenStore.setOwnerToken('');
    supabase.auth.signOut().catch(() => {});
    setAuthenticated(false);
    setOverview(null);
  };

  // --- AI Assistant Voice & Text ---
  const handleRunOwnerAI = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const p = (customPrompt ?? aiPrompt).trim();
    if (!p) return;
    setAiLoading(true);
    setAiProposal(null);
    try {
      const res = await api.runOwnerAI(p);
      setAiReply(res.reply);
      if (res.proposedChange) setAiProposal(res.proposedChange);
    } catch (err: any) {
      setAiReply(err?.message || 'AI Assistant unavailable right now.');
    } finally {
      setAiLoading(false);
    }
  };

  const startVoiceCommand = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setAiReply('Voice recognition requires Chrome/Android browser. Please type your command below.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = lang === 'ur' ? 'ur-PK' : 'en-US';
    rec.interimResults = false;
    setListeningVoice(true);
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setAiPrompt(transcript);
      setListeningVoice(false);
      if (transcript) handleRunOwnerAI(undefined, transcript);
    };
    rec.onerror = () => setListeningVoice(false);
    rec.onend = () => setListeningVoice(false);
    rec.start();
  };

  const handleConfirmAiProposal = async () => {
    if (!aiProposal) return;
    try {
      if (aiProposal.actionType === 'update_stock') {
        await api.updateProductStock(aiProposal.productId, aiProposal.proposedValue);
      } else {
        await api.updateProduct(aiProposal.productId, {
          price: aiProposal.proposedValue,
        });
      }
      flashMsg(
        `Saved ${aiProposal.productName}: ${aiProposal.currentValue} -> ${aiProposal.proposedValue}`
      );
      setAiProposal(null);
      await loadAllAdminData();
      onCatalogUpdated();
    } catch (err: any) {
      flashMsg(err?.message || 'Failed to apply AI change');
    }
  };

  // --- Product CRUD ---
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProduct({
        name: newProd.name,
        urdu_name: newProd.urdu_name || newProd.name,
        price: Number(newProd.price),
        cost_price: newProd.cost_price ? Number(newProd.cost_price) : null,
        unit: newProd.unit,
        stock_quantity: Number(newProd.stock_quantity),
        category: newProd.category,
        season_tag: newProd.season_tag,
        is_offer: newProd.is_offer,
        is_seasonal: newProd.is_seasonal,
      });
      setNewProd({
        name: '',
        urdu_name: '',
        price: '',
        cost_price: '',
        unit: 'Kg',
        stock_quantity: '40',
        category: 'vegetables',
        season_tag: 'all_year',
        is_offer: false,
        is_seasonal: false,
      });
      flashMsg('New product added to store & Supabase ✓');
      await loadAllAdminData();
      onCatalogUpdated();
    } catch (err: any) {
      flashMsg(err?.message || 'Failed to add product');
    }
  };

  const handleQuickUpdateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      await api.updateProduct(id, updates);
      flashMsg('Product updated ✓');
      await loadAllAdminData();
      onCatalogUpdated();
    } catch (err: any) {
      flashMsg(err?.message || 'Update failed');
    }
  };

  const handleDownloadCleanZip = async () => {
    try {
      const blob = await api.downloadCleanProjectZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'muslim-vegetable-fruit-shop-clean.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flashMsg('Clean GitHub-ready project ZIP downloaded ✓');
    } catch (err: any) {
      flashMsg(err?.message || 'ZIP export failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-1.5 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-6xl h-[94vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* Top Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-emerald-950 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-6 h-6 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-extrabold text-sm sm:text-base truncate">
                {lang === 'ur'
                  ? 'مالک کنٹرول پینل — مسلم ویجیٹیبل اینڈ فروٹ شاپ'
                  : 'Owner Admin Console — Hamid Ali'}
              </h2>
              <p className="text-[11px] text-emerald-300 truncate font-mono-num">
                {AUTHORIZED_EMAIL} • RBAC Protected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {authenticated && (
              <button
                onClick={handleOwnerLogout}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === 'ur' ? 'لاگ آؤٹ' : 'Sign Out'}</span>
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Auth Gate */}
        {!authenticated ? (
          <div className="flex-1 overflow-y-auto p-5 flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-950">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">
                    {authStatus && !authStatus.configured
                      ? 'First-Time Owner Password Setup'
                      : 'Owner-Only Authentication'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Authorized Owner: <strong>{AUTHORIZED_EMAIL}</strong>
                  </p>
                </div>
              </div>

              {authStatus && !authStatus.configured ? (
                <form onSubmit={handleSetupPassword} className="space-y-3">
                  <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    No owner password is set yet. Enter <strong>hamid ali</strong> or{' '}
                    <strong>{AUTHORIZED_EMAIL}</strong> and create your password (min 6 chars).
                  </p>
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="hamid ali or hamidalinoafair@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm font-mono-num"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Create strong owner password (6+ chars)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                  {authError && <p className="text-xs font-bold text-rose-700">{authError}</p>}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm cursor-pointer"
                  >
                    {authLoading ? 'Initializing Vault...' : 'Set Owner Password & Open Dashboard'}
                  </button>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('password');
                        setAuthError('');
                      }}
                      className={`py-1.5 rounded-lg cursor-pointer ${
                        authMode === 'password' ? 'bg-white shadow text-emerald-900' : 'text-slate-600'
                      }`}
                    >
                      {lang === 'ur' ? 'پاسورڈ' : 'Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('supabase');
                        setAuthError('');
                      }}
                      className={`py-1.5 rounded-lg cursor-pointer ${
                        authMode === 'supabase' ? 'bg-white shadow text-emerald-900' : 'text-slate-600'
                      }`}
                    >
                      Supabase Auth
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('recover');
                        setAuthError('');
                      }}
                      className={`py-1.5 rounded-lg cursor-pointer ${
                        authMode === 'recover' ? 'bg-white shadow text-emerald-900' : 'text-slate-600'
                      }`}
                    >
                      {lang === 'ur' ? 'پاسورڈ بحال' : 'Forgot?'}
                    </button>
                  </div>

                  {authMode === 'password' && (
                    <form onSubmit={handlePasswordLogin} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {lang === 'ur'
                            ? 'ایڈمن نام یا ای میل (hamid ali)'
                            : 'Admin Name or Email (hamid ali)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="hamid ali or hamidalinoafair@gmail.com"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {lang === 'ur' ? 'مالک کا پاسورڈ' : 'Owner Password'}
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder={lang === 'ur' ? 'اپنا پاسورڈ درج کریں' : 'Enter Owner Password'}
                            className="w-full px-3.5 py-2.5 pe-10 rounded-xl border border-slate-300 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute inset-y-0 end-2 flex items-center px-1.5 text-slate-500 hover:text-emerald-800 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {requires2FA && (
                        <input
                          type="text"
                          required
                          value={totpInput}
                          onChange={(e) => setTotpInput(e.target.value)}
                          placeholder="6-digit 2FA Code"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-amber-400 bg-amber-50 text-sm font-mono-num font-bold"
                        />
                      )}
                      {authError && <p className="text-xs font-bold text-rose-700">{authError}</p>}
                      {authInfo && <p className="text-xs font-bold text-emerald-700">{authInfo}</p>}
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm cursor-pointer"
                      >
                        {authLoading
                          ? lang === 'ur'
                            ? 'تصدیق ہو رہی ہے...'
                            : 'Verifying...'
                          : lang === 'ur'
                          ? 'ایڈمن پینل کھولیں'
                          : 'Sign In as Owner'}
                      </button>
                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('recover');
                            setAuthError('');
                            setAuthInfo('');
                          }}
                          className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                        >
                          {lang === 'ur'
                            ? 'پاسورڈ بھول گئے؟ (Forgot Password)'
                            : 'Forgot Password? Reset Here'}
                        </button>
                        <span className="text-slate-400">Hamid Ali</span>
                      </div>
                    </form>
                  )}

                  {authMode === 'supabase' && (
                    <div className="space-y-3">
                      <form onSubmit={handleSupabaseOwnerLogin} className="space-y-3">
                        <p className="text-[11px] text-slate-600">
                          {lang === 'ur'
                            ? `اپنے تصدیق شدہ ای میل (${AUTHORIZED_EMAIL}) سے لاگ ان کریں — 2FA کوڈ کی ضرورت نہیں:`
                            : `Sign in using your verified Supabase Auth account (${AUTHORIZED_EMAIL}):`}
                        </p>
                        <input
                          type="email"
                          required
                          value={emailInput.toLowerCase() === 'hamid ali' ? AUTHORIZED_EMAIL : emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                        />
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="Supabase Account Password"
                            className="w-full px-3.5 py-2.5 pe-10 rounded-xl border border-slate-300 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 end-2 flex items-center px-1.5 text-slate-500 hover:text-emerald-800 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {authError && <p className="text-xs font-bold text-rose-700">{authError}</p>}
                        {authInfo && <p className="text-xs font-bold text-emerald-700">{authInfo}</p>}
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm cursor-pointer"
                        >
                          {authLoading ? 'Signing in...' : 'Sign In with Supabase Auth'}
                        </button>
                      </form>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={handleSendEmailOtp}
                        className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-xs cursor-pointer"
                      >
                        {lang === 'ur'
                          ? 'پاسورڈ کے بغیر Gmail پر لاگ ان لنک / OTP بھیجیں'
                          : 'Email Me a One-Click Magic Link / OTP Code'}
                      </button>
                    </div>
                  )}

                  {authMode === 'recover' && (
                    <div className="space-y-4">
                      {/* Easiest 1-Click Gmail Recovery & Password Reset */}
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 space-y-2.5">
                        <p className="text-xs font-extrabold text-emerald-950">
                          {lang === 'ur'
                            ? '1) آسان ترین طریقہ — Gmail پر OTP سے فوری پاسورڈ بدلیں:'
                            : '1) Easiest Method — Reset Password & Unlock via Gmail OTP:'}
                        </p>
                        <p className="text-[11px] text-emerald-900 leading-relaxed">
                          {lang === 'ur'
                            ? `بٹن دبائیں، آپ کے ای میل (${AUTHORIZED_EMAIL}) پر کوڈ یا لنک آئے گا۔ کوڈ اور نیا پاسورڈ لکھیں، فوراً ایڈمن پینل کھل جائے گا۔`
                            : `Click below to get an instant code & link at ${AUTHORIZED_EMAIL}. Enter the code + choose your new password.`}
                        </p>
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={handleSendEmailOtp}
                          className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs cursor-pointer"
                        >
                          {authLoading
                            ? lang === 'ur'
                              ? 'بھیجا جا رہا ہے...'
                              : 'Sending...'
                            : lang === 'ur'
                            ? `Gmail (${AUTHORIZED_EMAIL}) پر OTP کوڈ بھیجیں`
                            : `Send OTP Code to ${AUTHORIZED_EMAIL}`}
                        </button>

                        {emailOtpSent && (
                          <form onSubmit={handleVerifyEmailOtpAndRecover} className="space-y-2 pt-1">
                            <input
                              type="text"
                              required
                              value={emailOtpCode}
                              onChange={(e) => setEmailOtpCode(e.target.value)}
                              placeholder={lang === 'ur' ? 'Gmail میں آیا OTP کوڈ درج کریں' : 'Enter Email OTP Code'}
                              className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-sm font-mono-num font-bold"
                            />
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                minLength={6}
                                value={emailResetNewPwd}
                                onChange={(e) => setEmailResetNewPwd(e.target.value)}
                                placeholder={
                                  lang === 'ur'
                                    ? 'اپنا نیا ایڈمن پاسورڈ لکھیں (کم از کم 6 حروف)'
                                    : 'New Owner Password (6+ chars, optional)'
                                }
                                className="w-full px-3 py-2 pe-10 rounded-xl border border-emerald-400 bg-white text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute inset-y-0 end-2 flex items-center px-1.5 text-slate-500 cursor-pointer"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <button
                              type="submit"
                              disabled={authLoading}
                              className="w-full py-2.5 rounded-xl bg-emerald-900 text-white font-extrabold text-xs cursor-pointer"
                            >
                              {lang === 'ur'
                                ? 'تصدیق کر کے ایڈمن پینل کھولیں'
                                : 'Verify OTP, Save Password & Sign In'}
                            </button>
                          </form>
                        )}
                      </div>

                      {authError && <p className="text-xs font-bold text-rose-700">{authError}</p>}
                      {authInfo && <p className="text-xs font-bold text-emerald-700">{authInfo}</p>}

                      {/* Fallback: Server / WhatsApp Recovery Code */}
                      <form onSubmit={handleRecoverRequest} className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                        <p className="text-xs font-bold text-amber-950">
                          {lang === 'ur'
                            ? '2) متبادل طریقہ — واٹس ایپ / سرور ریکوری کوڈ (پاسورڈ + 2FA ری سیٹ):'
                            : '2) Alternate — WhatsApp / Server Recovery Code (Resets Password + 2FA):'}
                        </p>
                        <input
                          type="text"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="hamid ali or hamidalinoafair@gmail.com"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                        />
                        {recoveryStep === 'verify' && (
                          <>
                            <input
                              type="text"
                              required
                              value={recoveryCodeInput}
                              onChange={(e) => setRecoveryCodeInput(e.target.value)}
                              placeholder="6-digit Recovery Code"
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                            />
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={newPasswordInput}
                                onChange={(e) => setNewPasswordInput(e.target.value)}
                                placeholder="New Password (6+ chars)"
                                className="w-full px-3.5 py-2 pe-10 rounded-xl border border-slate-300 bg-white text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute inset-y-0 end-2 flex items-center px-1.5 text-slate-500 cursor-pointer"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </>
                        )}
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs cursor-pointer"
                        >
                          {recoveryStep === 'request'
                            ? lang === 'ur'
                              ? '6 ہندسوں کا ریکوری کوڈ حاصل کریں'
                              : 'Send 6-Digit Recovery Code'
                            : lang === 'ur'
                            ? 'کوڈ کی تصدیق کر کے نیا پاسورڈ لگائیں'
                            : 'Verify Code & Reset Password'}
                        </button>
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={handleSendSupabaseResetEmail}
                          className="w-full py-2 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 font-bold text-[11px] cursor-pointer"
                        >
                          {lang === 'ur'
                            ? `ای میل (${AUTHORIZED_EMAIL}) پر پاسورڈ ری سیٹ لنک بھیجیں`
                            : `Send Supabase Password Reset Email`}
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Authenticated Owner Console */
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {/* Scrollable Mobile-Friendly Tab Bar */}
            <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2 flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'overview', label: lang === 'ur' ? 'جائزہ و AI' : 'Overview & AI', icon: BarChart3 },
                { id: 'store', label: lang === 'ur' ? 'دکان، ڈیلیوری و ادائیگی' : 'Store & Payments', icon: Store },
                { id: 'catalog', label: lang === 'ur' ? 'اشیاء و ریٹس' : 'Catalog & Stock', icon: Package },
                { id: 'orders', label: lang === 'ur' ? 'آرڈرز و بل' : 'Orders & Bills', icon: ShoppingBag },
                { id: 'payments', label: lang === 'ur' ? 'ادائیگی تصدیق' : 'Payments', icon: CreditCard },
                { id: 'dispatch', label: lang === 'ur' ? 'رائڈرز و روٹ' : 'Riders & Routes', icon: Truck },
                { id: 'reports', label: lang === 'ur' ? 'رپورٹس و منافع' : 'Profit & Expenses', icon: TrendingUp },
                { id: 'customers', label: lang === 'ur' ? 'کسٹمرز، لائلٹی و کوپن' : 'Customers & Coupons', icon: Users },
                { id: 'security', label: lang === 'ur' ? 'انٹیگریشن، سیکیورٹی و ZIP' : 'Integrations & Security', icon: Settings },
              ].map((tb) => {
                const Icon = tb.icon;
                return (
                  <button
                    key={tb.id}
                    onClick={() => setActiveTab(tb.id as AdminTab)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      activeTab === tb.id
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tb.label}</span>
                  </button>
                );
              })}
            </div>

            {actionMsg && (
              <div className="mx-4 mt-3 px-4 py-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold">
                {actionMsg}
              </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* TAB 1: OVERVIEW + VOICE/CHAT AI */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
                      <p className="text-[11px] font-bold text-slate-500">
                        {lang === 'ur' ? 'آج کی فروخت' : "Today's Sales"}
                      </p>
                      <p className="text-xl font-extrabold text-emerald-800 font-mono-num mt-1">
                        Rs. {overview?.daily?.totalSales || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
                      <p className="text-[11px] font-bold text-slate-500">
                        {lang === 'ur' ? 'زیرِ التواء تصدیق ادائیگیاں' : 'Pending Payment Proofs'}
                      </p>
                      <p className="text-xl font-extrabold text-amber-700 font-mono-num mt-1">
                        {overview?.pendingVerificationsCount || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
                      <p className="text-[11px] font-bold text-slate-500">
                        {lang === 'ur' ? 'اسٹاک ختم اشیاء' : 'Out of Stock Items'}
                      </p>
                      <p className="text-xl font-extrabold text-rose-700 font-mono-num mt-1">
                        {overview?.outOfStockCount || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
                      <p className="text-[11px] font-bold text-slate-500">
                        {lang === 'ur' ? 'لائیو Supabase سنک' : 'Supabase Live Status'}
                      </p>
                      <p className="text-sm font-extrabold text-emerald-700 mt-1">
                        {launchStatus?.allTablesReady
                          ? 'All Tables Live ✓'
                          : overview?.supabaseConnected
                          ? 'Catalog Connected (Setup Pending)'
                          : 'Local Store Active'}
                      </p>
                    </div>
                  </div>

                  {/* Official Launch Readiness Checklist Strip */}
                  {launchStatus && (
                    <div className="rounded-2xl border border-emerald-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                      <div className="space-y-1">
                        <h3 className="font-extrabold text-emerald-950">
                          {lang === 'ur' ? 'ویب سائٹ آفیشل لانچ اسٹیٹس (Live Check)' : 'Official Launch Readiness Check'}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-2 py-0.5 rounded font-bold ${launchStatus.allTablesReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                            Supabase Tables: {Object.values(launchStatus.tables).filter((t) => t.exists).length}/{Object.keys(launchStatus.tables).length} Ready
                          </span>
                          <span className={`px-2 py-0.5 rounded font-bold ${launchStatus.aiConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                            Gemini AI: {launchStatus.aiConfigured ? 'Active ✓' : 'Needs GEMINI_API_KEY in Secrets'}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-bold ${launchStatus.paymentAccounts.easypaisa && launchStatus.paymentAccounts.jazzCashPersonal ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-900'}`}>
                            Payment Accounts: Merchant ✓ {launchStatus.paymentAccounts.easypaisa ? '• Easypaisa ✓' : '• Easypaisa Optional'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('security')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold cursor-pointer"
                      >
                        {lang === 'ur' ? 'سیٹنگز و Supabase مکمل کریں ←' : 'Open Launch & Payment Setup →'}
                      </button>
                    </div>
                  )}

                  {/* Owner AI Voice + Chat Assistant */}
                  <div className="rounded-2xl border border-amber-300 bg-white p-4 sm:p-5 space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-600" />
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900">
                            {lang === 'ur'
                              ? 'مالک کا AI اسسٹنٹ (اردو / English وائس و چیٹ)'
                              : 'Owner AI Operations Assistant (Voice + Text)'}
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            {lang === 'ur'
                              ? 'مثلاً بولیں یا لکھیں: "آج آلو کی قیمت 120 روپے کر دو" یا "آج کی فروخت بتاؤ"'
                              : 'Ask today’s stats or say "آج آلو کی قیمت 120 روپے کر دو" — always asks confirmation before saving.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={startVoiceCommand}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                          listeningVoice
                            ? 'bg-rose-600 text-white animate-pulse'
                            : 'bg-amber-100 text-amber-950 border border-amber-300'
                        }`}
                      >
                        {listeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {listeningVoice
                          ? lang === 'ur'
                            ? 'سن رہا ہوں...'
                            : 'Listening...'
                          : lang === 'ur'
                          ? 'اردو وائس کمانڈ'
                          : 'Voice Command'}
                      </button>
                    </div>

                    <form onSubmit={(e) => handleRunOwnerAI(e)} className="flex gap-2">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={
                          lang === 'ur'
                            ? 'ٹماٹر کی قیمت 150 کر دو / آج کتنی سیل ہوئی؟'
                            : 'Type Urdu or English owner instruction...'
                        }
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm"
                      />
                      <button
                        type="submit"
                        disabled={aiLoading}
                        className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                      >
                        {aiLoading ? '...' : lang === 'ur' ? 'چلائیں' : 'Ask AI'}
                      </button>
                    </form>

                    {aiReply && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap">
                        {aiReply}
                      </div>
                    )}

                    {aiProposal && (
                      <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 space-y-2 text-xs">
                        <p className="font-extrabold text-amber-950">
                          {lang === 'ur'
                            ? 'تبدیلی محفوظ کرنے سے پہلے تصدیق کریں:'
                            : 'Confirm Proposed Database Change:'}
                        </p>
                        <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-amber-200 font-mono-num">
                          <div>
                            <span className="block text-[10px] text-slate-500">Existing</span>
                            <strong>{aiProposal.currentValue}</strong>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500">New Value</span>
                            <strong className="text-emerald-800">{aiProposal.proposedValue}</strong>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500">Difference</span>
                            <strong className="text-amber-700">
                              {aiProposal.proposedValue - aiProposal.currentValue >= 0 ? '+' : ''}
                              {aiProposal.proposedValue - aiProposal.currentValue}
                            </strong>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmAiProposal}
                            className="px-4 py-2 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer"
                          >
                            {lang === 'ur' ? 'تصدیق کریں اور محفوظ کریں' : 'Confirm & Save Change'}
                          </button>
                          <button
                            onClick={() => setAiProposal(null)}
                            className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 font-bold cursor-pointer"
                          >
                            {lang === 'ur' ? 'منسوخ' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: STORE IDENTITY, DELIVERY ZONES, PAYMENT ACCOUNTS & LOYALTY RULES */}
              {activeTab === 'store' && settings && (
                <div className="space-y-5 text-xs">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSavingSettings(true);
                      try {
                        const updated = await api.updateSettings(settings);
                        setSettings({
                          ...DEFAULT_SHOP_SETTINGS,
                          ...updated,
                          deliveryAreas:
                            updated.deliveryAreas && updated.deliveryAreas.length > 0
                              ? updated.deliveryAreas
                              : KHANEWAL_LOCATIONS,
                        });
                        flashMsg('All Store, Delivery, Payment & Loyalty settings saved ✓');
                        onCatalogUpdated();
                      } catch (err: any) {
                        flashMsg(err?.message || 'Failed to save store settings');
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    className="space-y-5"
                  >
                    {/* 1. Shop Identity & Top Announcement */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                          <Store className="w-4 h-4 text-emerald-700" />
                          {lang === 'ur'
                            ? 'دکان کی شناخت، اوقاتِ کار اور اوپر والا اعلان (Banner)'
                            : 'Store Identity, Business Hours & Top Banner'}
                        </h3>
                        <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.announcementActive !== false}
                            onChange={(e) =>
                              setSettings({ ...settings, announcementActive: e.target.checked })
                            }
                          />
                          <span>{lang === 'ur' ? 'اوپر پٹی دکھائیں' : 'Show Announcement Bar'}</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Name (Urdu)</label>
                          <input
                            type="text"
                            value={settings.shopNameUr || ''}
                            onChange={(e) => setSettings({ ...settings, shopNameUr: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Name (English)</label>
                          <input
                            type="text"
                            value={settings.shopNameEn || ''}
                            onChange={(e) => setSettings({ ...settings, shopNameEn: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Official WhatsApp Number</label>
                          <input
                            type="text"
                            value={settings.whatsapp || ''}
                            onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                            placeholder="+923007466664"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Address (Urdu)</label>
                          <input
                            type="text"
                            value={settings.locationUr || ''}
                            onChange={(e) => setSettings({ ...settings, locationUr: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Address (English)</label>
                          <input
                            type="text"
                            value={settings.locationEn || ''}
                            onChange={(e) => setSettings({ ...settings, locationEn: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Open Hours</label>
                          <input
                            type="text"
                            value={settings.openHours || ''}
                            onChange={(e) => setSettings({ ...settings, openHours: e.target.value })}
                            placeholder="7 AM – 10 PM"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Top Banner Text (Urdu)</label>
                            <input
                              type="text"
                              value={settings.announcementUr || ''}
                              onChange={(e) => setSettings({ ...settings, announcementUr: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Top Banner Text (English)</label>
                            <input
                              type="text"
                              value={settings.announcementEn || ''}
                              onChange={(e) => setSettings({ ...settings, announcementEn: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Delivery Fee Policy & Khanewal Sectors */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                          <Truck className="w-4 h-4 text-emerald-700" />
                          {lang === 'ur'
                            ? 'ڈیلیوری چارجز فارمولا اور خانیوال کے علاقے'
                            : 'Delivery Fee Rules & Khanewal Areas'}
                        </h3>
                        <span className="text-[11px] font-mono-num text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          Preview: 2km=Rs.{calculateDeliveryFee(2, settings)} • 3.5km=Rs.{calculateDeliveryFee(3.5, settings)} • 5.2km=Rs.{calculateDeliveryFee(5.2, settings)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Base Zone Distance (km)</label>
                          <input
                            type="number"
                            min={1}
                            step="0.5"
                            value={settings.baseKm ?? 3}
                            onChange={(e) => setSettings({ ...settings, baseKm: Math.max(0.5, Number(e.target.value) || 1) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Base Delivery Fee (Rs.)</label>
                          <input
                            type="number"
                            min={0}
                            value={settings.baseDeliveryFee ?? 100}
                            onChange={(e) => setSettings({ ...settings, baseDeliveryFee: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Extra Per Km Rate (Rs.)</label>
                          <input
                            type="number"
                            min={0}
                            value={settings.extraKmRate ?? 30}
                            onChange={(e) => setSettings({ ...settings, extraKmRate: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold"
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold cursor-pointer">
                            <span>Delivery OTP</span>
                            <input
                              type="checkbox"
                              checked={Boolean(settings.requireDeliveryOtp)}
                              onChange={(e) => setSettings({ ...settings, requireDeliveryOtp: e.target.checked })}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Khanewal Areas List */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <p className="font-bold text-slate-700">Khanewal Areas / Sectors ({(settings.deliveryAreas || []).length})</p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                          {(settings.deliveryAreas || []).map((area, idx) => (
                            <div key={area.id} className="p-2 grid grid-cols-12 gap-1.5 items-center">
                              <input
                                type="text"
                                value={area.name}
                                onChange={(e) => {
                                  const next = [...(settings.deliveryAreas || [])];
                                  next[idx] = { ...area, name: e.target.value };
                                  setSettings({ ...settings, deliveryAreas: next });
                                }}
                                className="col-span-4 px-2 py-1 rounded border border-slate-300 text-[11px]"
                                placeholder="English Name"
                              />
                              <input
                                type="text"
                                value={area.nameUr}
                                onChange={(e) => {
                                  const next = [...(settings.deliveryAreas || [])];
                                  next[idx] = { ...area, nameUr: e.target.value };
                                  setSettings({ ...settings, deliveryAreas: next });
                                }}
                                className="col-span-4 px-2 py-1 rounded border border-slate-300 text-[11px]"
                                placeholder="Urdu Name"
                              />
                              <div className="col-span-2 flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  value={area.roadDistanceKm}
                                  onChange={(e) => {
                                    const next = [...(settings.deliveryAreas || [])];
                                    next[idx] = { ...area, roadDistanceKm: Math.max(0, Number(e.target.value) || 0) };
                                    setSettings({ ...settings, deliveryAreas: next });
                                  }}
                                  className="w-full px-1.5 py-1 rounded border border-slate-300 font-mono-num text-[11px]"
                                />
                                <span className="text-[10px] text-slate-500">km</span>
                              </div>
                              <span className="col-span-1 text-[10px] font-mono-num font-bold text-emerald-800 text-end">
                                Rs.{calculateDeliveryFee(area.roadDistanceKm, settings)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (settings.deliveryAreas || []).filter((x) => x.id !== area.id);
                                  setSettings({ ...settings, deliveryAreas: next });
                                }}
                                className="col-span-1 p-1 text-rose-600 hover:bg-rose-50 rounded flex justify-center cursor-pointer"
                                title="Remove area"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                          <input
                            type="text"
                            placeholder="New Area (English)"
                            value={newSectorForm.name}
                            onChange={(e) => setNewSectorForm({ ...newSectorForm, name: e.target.value })}
                            className="col-span-4 px-2 py-1.5 rounded border border-slate-300 bg-white text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="علاقہ نام (اردو)"
                            value={newSectorForm.nameUr}
                            onChange={(e) => setNewSectorForm({ ...newSectorForm, nameUr: e.target.value })}
                            className="col-span-4 px-2 py-1.5 rounded border border-slate-300 bg-white text-[11px]"
                          />
                          <input
                            type="number"
                            step="0.1"
                            min={0.5}
                            placeholder="km"
                            value={newSectorForm.roadDistanceKm}
                            onChange={(e) => setNewSectorForm({ ...newSectorForm, roadDistanceKm: e.target.value })}
                            className="col-span-2 px-2 py-1.5 rounded border border-slate-300 bg-white font-mono-num text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newSectorForm.name.trim()) return;
                              const entry: DeliveryAreaOption = {
                                id: newSectorForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString().slice(-4),
                                name: newSectorForm.name.trim(),
                                nameUr: newSectorForm.nameUr.trim() || newSectorForm.name.trim(),
                                lat: Number(newSectorForm.lat) || 30.3017,
                                lng: Number(newSectorForm.lng) || 71.9321,
                                roadDistanceKm: Math.max(0.5, Number(newSectorForm.roadDistanceKm) || 2),
                              };
                              setSettings({
                                ...settings,
                                deliveryAreas: [...(settings.deliveryAreas || []), entry],
                              });
                              setNewSectorForm({ name: '', nameUr: '', roadDistanceKm: '2.5', lat: '30.3017', lng: '71.9321' });
                            }}
                            className="col-span-2 py-1.5 px-2 rounded bg-emerald-800 text-white font-bold text-[11px] cursor-pointer"
                          >
                            + Add Area
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 3. Complete Payment Accounts Control */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-700" />
                        {lang === 'ur'
                          ? 'مکمل ادائیگی اکاؤنٹس (JazzCash، Easypaisa، Raast، Bank Alfalah)'
                          : 'Complete Payment Accounts (JazzCash, Easypaisa, Raast, Bank Alfalah)'}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash Merchant Store Name</label>
                          <input
                            type="text"
                            value={settings.jazzCashStoreName || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashStoreName: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash Merchant Account</label>
                          <input
                            type="text"
                            value={settings.jazzCashAccount || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashAccount: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash TILL ID</label>
                          <input
                            type="text"
                            value={settings.jazzCashTillId || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashTillId: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash USSD Code</label>
                          <input
                            type="text"
                            value={settings.jazzCashUssd || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashUssd: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash IBAN</label>
                          <input
                            type="text"
                            value={settings.jazzCashIban || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashIban: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Raast ID</label>
                          <input
                            type="text"
                            value={settings.raastId || ''}
                            onChange={(e) => setSettings({ ...settings, raastId: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash Personal Account</label>
                          <input
                            type="text"
                            placeholder="0300xxxxxxx"
                            value={settings.jazzCashPersonalAccount || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashPersonalAccount: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">JazzCash Personal Title</label>
                          <input
                            type="text"
                            value={settings.jazzCashPersonalTitle || ''}
                            onChange={(e) => setSettings({ ...settings, jazzCashPersonalTitle: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Easypaisa Account Number</label>
                          <input
                            type="text"
                            placeholder="03xxxxxxxxx"
                            value={settings.easypaisaAccount || ''}
                            onChange={(e) => setSettings({ ...settings, easypaisaAccount: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Easypaisa Title</label>
                          <input
                            type="text"
                            value={settings.easypaisaTitle || ''}
                            onChange={(e) => setSettings({ ...settings, easypaisaTitle: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank Name & Branch</label>
                          <input
                            type="text"
                            value={settings.bankName || ''}
                            onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank Account Title</label>
                          <input
                            type="text"
                            value={settings.bankAccountTitle || ''}
                            onChange={(e) => setSettings({ ...settings, bankAccountTitle: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank Account Number</label>
                          <input
                            type="text"
                            value={settings.bankAccountNumber || ''}
                            onChange={(e) => setSettings({ ...settings, bankAccountNumber: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank IBAN</label>
                          <input
                            type="text"
                            value={settings.bankIban || ''}
                            onChange={(e) => setSettings({ ...settings, bankIban: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank SWIFT Code</label>
                          <input
                            type="text"
                            value={settings.bankSwiftCode || ''}
                            onChange={(e) => setSettings({ ...settings, bankSwiftCode: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 4. Loyalty Points Rules */}
                    <div className="rounded-2xl bg-white border border-amber-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          {lang === 'ur' ? 'لائلٹی پوائنٹس پالیسی و ممبرشپ لیولز' : 'Loyalty Points Rules & Membership Tiers'}
                        </h3>
                        <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.loyaltyEnabled !== false}
                            onChange={(e) => setSettings({ ...settings, loyaltyEnabled: e.target.checked })}
                          />
                          <span>{lang === 'ur' ? 'لائلٹی سسٹم فعال ہے' : 'Loyalty Program Enabled'}</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Points Earned per Rs. 100 Completed Purchase</label>
                          <input
                            type="number"
                            min={0}
                            value={settings.loyaltyPointsPer100Rs ?? 5}
                            onChange={(e) => setSettings({ ...settings, loyaltyPointsPer100Rs: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Rupee Discount Value per Point (1 = 100 pts → Rs. 100)</label>
                          <input
                            type="number"
                            min={0.5}
                            step="0.5"
                            value={settings.loyaltyPointValueRs ?? 1}
                            onChange={(e) => setSettings({ ...settings, loyaltyPointValueRs: Math.max(0.1, Number(e.target.value) || 1) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono-num font-bold"
                          />
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 space-y-0.5">
                          <p className="font-extrabold">Membership Tiers (Automatic):</p>
                          <p>Silver: 1st Order • Gold: Rs 30k • Platinum: Rs 60k • Diamond: Rs 100k</p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="w-full py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-sm shadow cursor-pointer"
                    >
                      {savingSettings
                        ? lang === 'ur'
                          ? 'تمام سیٹنگز محفوظ ہو رہی ہیں...'
                          : 'Saving All Store Settings...'
                        : lang === 'ur'
                        ? 'دکان، ڈیلیوری، ادائیگی اور لائلٹی سیٹنگز محفوظ کریں ✓'
                        : 'Save All Store, Delivery, Payment & Loyalty Settings ✓'}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 2: CATALOG, RATES & STOCK */}
              {activeTab === 'catalog' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleCreateProduct}
                    className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3"
                  >
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-700" />
                      {lang === 'ur' ? 'نئی سبزی یا پھل شامل کریں' : 'Add New Produce Item'}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <input
                        type="text"
                        required
                        placeholder="English Name"
                        value={newProd.name}
                        onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300"
                      />
                      <input
                        type="text"
                        placeholder="اردو نام"
                        value={newProd.urdu_name}
                        onChange={(e) => setNewProd({ ...newProd, urdu_name: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300"
                      />
                      <input
                        type="number"
                        required
                        placeholder="Selling Price (Rs)"
                        value={newProd.price}
                        onChange={(e) => setNewProd({ ...newProd, price: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <input
                        type="number"
                        placeholder="Wholesale Cost (optional)"
                        value={newProd.cost_price}
                        onChange={(e) => setNewProd({ ...newProd, cost_price: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <input
                        type="text"
                        placeholder="Unit (Kg/Dozen)"
                        value={newProd.unit}
                        onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300"
                      />
                      <input
                        type="number"
                        placeholder="Stock Qty"
                        value={newProd.stock_quantity}
                        onChange={(e) => setNewProd({ ...newProd, stock_quantity: e.target.value })}
                        className="px-3 py-2 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <select
                        value={newProd.category}
                        onChange={(e) =>
                          setNewProd({ ...newProd, category: e.target.value as ProductCategory })
                        }
                        className="px-3 py-2 rounded-lg border border-slate-300"
                      >
                        <option value="vegetables">Vegetables</option>
                        <option value="fruits">Fruits</option>
                        <option value="herbs">Herbs</option>
                        <option value="seasonal_deals">Seasonal</option>
                      </select>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer"
                      >
                        + Add Item
                      </button>
                    </div>
                  </form>

                  <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
                    <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-extrabold text-xs sm:text-sm">
                        Live Inventory ({products.length} items)
                      </span>
                      <button
                        onClick={loadAllAdminData}
                        className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Sync Supabase
                      </button>
                    </div>
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-50 font-bold text-slate-700">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5">Price (Rs)</th>
                          <th className="p-2.5">Cost (Rs)</th>
                          <th className="p-2.5">Stock</th>
                          <th className="p-2.5">Offer</th>
                          <th className="p-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {products.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2.5">
                              <strong className="block">{p.urdu_name || p.name}</strong>
                              <span className="text-[10px] text-slate-500">
                                {p.name} ({p.unit})
                              </span>
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                defaultValue={p.price}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (v !== p.price && v >= 0) handleQuickUpdateProduct(p.id, { price: v });
                                }}
                                className="w-20 px-2 py-1 rounded border border-slate-300 font-mono-num font-bold"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                placeholder="—"
                                defaultValue={p.cost_price ?? ''}
                                onBlur={(e) => {
                                  const raw = e.target.value;
                                  const v = raw === '' ? null : Number(raw);
                                  if (v !== p.cost_price) handleQuickUpdateProduct(p.id, { cost_price: v });
                                }}
                                className="w-20 px-2 py-1 rounded border border-slate-300 font-mono-num"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                defaultValue={p.stock_quantity}
                                onBlur={async (e) => {
                                  const v = Math.max(0, Number(e.target.value));
                                  if (v !== p.stock_quantity) {
                                    await api.updateProductStock(p.id, v);
                                    loadAllAdminData();
                                    onCatalogUpdated();
                                  }
                                }}
                                className="w-16 px-2 py-1 rounded border border-slate-300 font-mono-num"
                              />
                            </td>
                            <td className="p-2.5">
                              <button
                                onClick={() => handleQuickUpdateProduct(p.id, { is_offer: !p.is_offer })}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                  p.is_offer ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {p.is_offer ? 'Offer ON' : 'Normal'}
                              </button>
                            </td>
                            <td className="p-2.5 flex items-center gap-1">
                              <button
                                onClick={() => setEditingProduct({ ...p })}
                                title="Edit full details"
                                className="px-2 py-1 rounded bg-sky-100 text-sky-900 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={async () => {
                                  await api.updateProductStock(p.id, p.is_out_of_stock ? 25 : 0);
                                  loadAllAdminData();
                                  onCatalogUpdated();
                                }}
                                className="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold cursor-pointer"
                              >
                                {p.is_out_of_stock ? 'Restock' : 'Out'}
                              </button>
                              <button
                                onClick={async () => {
                                  await api.deleteProduct(p.id);
                                  loadAllAdminData();
                                  onCatalogUpdated();
                                }}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: ORDERS & BILLS */}
              {activeTab === 'orders' && (
                <div className="space-y-3">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono-num font-extrabold text-sm text-emerald-950">
                            #{ord.id}
                          </span>{' '}
                          — <strong>{ord.customer_name}</strong> (
                          <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                            {ord.customer_phone}
                          </span>
                          )
                          <p className="text-[11px] text-slate-500">
                            {ord.delivery_area} — {ord.delivery_address} ({ord.delivery_distance_km} km)
                          </p>
                        </div>
                        <div className="text-end font-mono-num">
                          <span className="text-base font-extrabold text-emerald-800">
                            Rs. {ord.total_amount}
                          </span>
                          <p className="text-[11px] text-slate-500">
                            {ord.payment_method} • <strong>{ord.payment_status}</strong>
                          </p>
                        </div>
                      </div>

                      {ord.rejection_reason && (
                        <p className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                          Cancellation Reason: {ord.rejection_reason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                        <select
                          value={ord.order_status}
                          onChange={async (e) => {
                            const status = e.target.value as OrderStatus;
                            if (status === 'Cancelled') {
                              setCancellingOrder({ id: ord.id, reason: '' });
                              return;
                            }
                            await api.adminUpdateOrder(ord.id, { order_status: status });
                            flashMsg(`Order #${ord.id} -> ${status}`);
                            loadAllAdminData();
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                        >
                          {ORDER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>

                        <select
                          value={ord.assigned_rider_id || ''}
                          disabled={['Delivered', 'Cancelled'].includes(ord.order_status)}
                          onChange={async (e) => {
                            const riderId = e.target.value;
                            if (!riderId) return;
                            await api.adminUpdateOrder(ord.id, { assigned_rider_id: riderId });
                            flashMsg(`Assigned rider ${riderId} to #${ord.id} ✓`);
                            loadAllAdminData();
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold bg-white"
                        >
                          <option value="">Assign Rider...</option>
                          {riders.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.id})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <span>Fee Rs:</span>
                          <input
                            type="number"
                            defaultValue={ord.delivery_fee}
                            onBlur={async (e) => {
                              const v = Number(e.target.value);
                              if (v !== ord.delivery_fee && v >= 0) {
                                await api.adminUpdateOrder(ord.id, { manual_delivery_fee_override: v });
                                flashMsg(`Delivery fee updated for #${ord.id}`);
                                loadAllAdminData();
                              }
                            }}
                            className="w-16 px-2 py-1 rounded border border-slate-300 font-mono-num"
                          />
                        </div>

                        <div className="ms-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(ord)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" /> Print Bill
                          </button>
                          <a
                            href={buildOrderWhatsAppUrl(
                              ord,
                              ord.customer_phone.replace(/\D/g, '').replace(/^0/, '92')
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: PAYMENT VERIFICATION QUEUE */}
              {activeTab === 'payments' && (
                <div className="space-y-3">
                  {receipts.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-8">
                      No payment receipts uploaded yet.
                    </p>
                  )}
                  {receipts.map((rcpt) => (
                    <div
                      key={rcpt.id}
                      className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-mono-num font-extrabold text-sm">Order #{rcpt.order_id}</span>
                        <p className="font-bold text-slate-700">
                          {rcpt.payment_method} • TID: <span className="font-mono-num">{rcpt.transaction_ref}</span> • Rs.{' '}
                          {rcpt.amount_paid}
                        </p>
                        <p className="text-slate-500">Sender: {rcpt.sender_name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {rcpt.has_receipt_image && (
                          <button
                            onClick={async () => {
                              const url = await api.getPrivateReceiptImage(rcpt.id);
                              setViewingReceiptImg({ id: rcpt.id, dataUrl: url });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-900 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Receipt
                          </button>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold uppercase ${
                            rcpt.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rcpt.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {rcpt.status}
                        </span>
                        {rcpt.status === 'pending' && (
                          <>
                            <button
                              onClick={async () => {
                                await api.verifyReceipt(rcpt.id, 'approved', 'Verified by Hamid Ali');
                                flashMsg(`Payment approved for #${rcpt.order_id} ✓`);
                                loadAllAdminData();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={async () => {
                                await api.verifyReceipt(rcpt.id, 'rejected', 'Invalid or unmatched TID');
                                flashMsg(`Payment rejected for #${rcpt.order_id}`);
                                loadAllAdminData();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 5: RIDERS & 2-OPT ROUTE OPTIMIZATION */}
              {activeTab === 'dispatch' && (
                <div className="space-y-5">
                  {/* Live Fleet Tracking Map */}
                  <div className="rounded-2xl bg-white border border-sky-200 p-4 space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-sm text-sky-950">
                          {lang === 'ur'
                            ? 'لائیو فلیٹ اور رائڈر GPS نقشہ (خانیوال)'
                            : 'Live Delivery Fleet GPS Map (Khanewal)'}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {(liveFleet?.riders || riders).filter((r) => Boolean(r.current_location)).length} live rider(s) •{' '}
                          {(liveFleet?.activeOrders || orders.filter((o) => !['Delivered', 'Cancelled'].includes(o.order_status))).length} active order(s)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => api.getAdminLiveFleet().then(setLiveFleet).catch(() => {})}
                        className="px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {lang === 'ur' ? 'نقشہ ریفریش کریں' : 'Refresh Live Map'}
                      </button>
                    </div>
                    <LiveDeliveryMap
                      extraRiders={(liveFleet?.riders || riders).map((r) => ({
                        id: r.id,
                        name: r.name,
                        lat: r.current_location?.lat ?? 30.3017,
                        lng: r.current_location?.lng ?? 71.9321,
                        updatedAt: r.current_location?.updated_at,
                        isLive: Boolean(r.current_location),
                      }))}
                      extraStops={(
                        liveFleet?.activeOrders ||
                        orders.filter((o) => !['Delivered', 'Cancelled'].includes(o.order_status))
                      )
                        .filter((o) => Boolean(o.coordinates && o.id))
                        .map((o) => ({
                          id: String(o.id),
                          label: `${o.customer_name || 'Customer'} (${o.delivery_area || 'Khanewal'})`,
                          lat: o.coordinates!.lat,
                          lng: o.coordinates!.lng,
                          status: o.order_status,
                        }))}
                      heightClass="h-64"
                    />
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <h3 className="font-extrabold text-sm">Khanewal 2-Opt Route Optimization & Rider Dispatch</h3>
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <select
                        value={selectedRiderId}
                        onChange={(e) => setSelectedRiderId(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 font-bold"
                      >
                        {riders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.id})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          const route = await api.optimizeRoute(
                            selectedDispatchOrders.length > 0 ? selectedDispatchOrders : undefined,
                            selectedRiderId
                          );
                          setOptimizedRoute(route);
                        }}
                        className="px-4 py-2 rounded-xl bg-sky-700 text-white font-bold cursor-pointer"
                      >
                        Calculate 2-Opt Route
                      </button>
                      <button
                        disabled={selectedDispatchOrders.length === 0}
                        onClick={async () => {
                          const route = await api.assignRider(selectedDispatchOrders, selectedRiderId);
                          setOptimizedRoute(route);
                          setSelectedDispatchOrders([]);
                          flashMsg(`Dispatched to ${selectedRiderId} ✓`);
                          loadAllAdminData();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-800 disabled:bg-slate-300 text-white font-bold cursor-pointer"
                      >
                        Assign Selected ({selectedDispatchOrders.length})
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {orders
                        .filter((o) => !['Delivered', 'Cancelled'].includes(o.order_status))
                        .map((o) => (
                          <label
                            key={o.id}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDispatchOrders.includes(o.id)}
                              onChange={(e) =>
                                setSelectedDispatchOrders((prev) =>
                                  e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                                )
                              }
                            />
                            <span>
                              <strong>#{o.id}</strong> — {o.delivery_area} ({o.order_status})
                            </span>
                          </label>
                        ))}
                    </div>

                    {optimizedRoute && optimizedRoute.stops.length > 0 && (
                      <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-1">
                        <p className="font-extrabold text-sky-950">
                          Optimized Route for {optimizedRoute.rider_name} — Total:{' '}
                          {optimizedRoute.total_distance_km} km (~{optimizedRoute.estimated_duration_minutes} mins)
                        </p>
                        {optimizedRoute.stops.map((st) => (
                          <p key={st.order_id}>
                            Stop #{st.stop_number}: <strong>#{st.order_id}</strong> ({st.delivery_area}) — ETA{' '}
                            {st.estimated_arrival_minutes}m
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Rider */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await api.addRider(newRider);
                      setNewRider({
                        name: '',
                        phone: '',
                        vehicle_type: 'Motorcycle (Insulated Box)',
                        vehicle_reg: '',
                        pin: '',
                      });
                      flashMsg('New rider added ✓');
                      loadAllAdminData();
                    }}
                    className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Rider Name"
                      value={newRider.name}
                      onChange={(e) => setNewRider({ ...newRider, name: e.target.value })}
                      className="px-2.5 py-2 rounded-lg border border-slate-300"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="Phone"
                      value={newRider.phone}
                      onChange={(e) => setNewRider({ ...newRider, phone: e.target.value })}
                      className="px-2.5 py-2 rounded-lg border border-slate-300 font-mono-num"
                    />
                    <input
                      type="text"
                      placeholder="Bike Plate (e.g. KWL-990)"
                      value={newRider.vehicle_reg}
                      onChange={(e) => setNewRider({ ...newRider, vehicle_reg: e.target.value })}
                      className="px-2.5 py-2 rounded-lg border border-slate-300"
                    />
                    <input
                      type="password"
                      required
                      placeholder="4-digit PIN"
                      value={newRider.pin}
                      onChange={(e) => setNewRider({ ...newRider, pin: e.target.value })}
                      className="px-2.5 py-2 rounded-lg border border-slate-300 font-mono-num"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer"
                    >
                      + Add Rider
                    </button>
                  </form>
                  {/* Fleet List: Activate/Deactivate & PIN Reset */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5 text-xs">
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {lang === 'ur' ? `رجسٹرڈ رائڈرز (${riders.length})` : `Delivery Fleet Management (${riders.length})`}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {riders.map((r) => (
                        <div
                          key={r.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-extrabold text-slate-900">
                              {r.name} <span className="font-mono-num text-slate-500">({r.id})</span>
                            </p>
                            <p className="text-[11px] text-slate-600 font-mono-num">
                              {r.phone} • {r.vehicle_reg}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {riderPinEdit?.id === r.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={riderPinEdit.pin}
                                  onChange={(e) => setRiderPinEdit({ id: r.id, pin: e.target.value })}
                                  placeholder="New PIN"
                                  className="w-20 px-2 py-1 rounded border border-slate-300 font-mono-num text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (riderPinEdit.pin.trim().length < 4) return;
                                    await api.updateRider(r.id, { pin: riderPinEdit.pin.trim() });
                                    setRiderPinEdit(null);
                                    flashMsg(`PIN updated for ${r.name} ✓`);
                                    loadAllAdminData();
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-800 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRiderPinEdit({ id: r.id, pin: '' })}
                                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                              >
                                Reset PIN
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await api.updateRider(r.id, { is_active: !r.is_active });
                                flashMsg(`${r.name} ${!r.is_active ? 'activated' : 'deactivated'} ✓`);
                                loadAllAdminData();
                              }}
                              className={`px-2.5 py-1 rounded font-bold text-[11px] cursor-pointer ${
                                r.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {r.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: REPORTS & EXPENSES */}
              {activeTab === 'reports' && reportData && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setReportRange(r)}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold capitalize cursor-pointer ${
                          reportRange === r ? 'bg-emerald-800 text-white' : 'bg-white border border-slate-200'
                        }`}
                      >
                        {r} Report
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl bg-white p-4 border border-slate-200">
                      <span className="text-slate-500 font-bold">Total Sales</span>
                      <p className="text-lg font-extrabold font-mono-num text-emerald-800">
                        Rs. {reportData.totalSales}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 border border-slate-200">
                      <span className="text-slate-500 font-bold">Delivery Fees</span>
                      <p className="text-lg font-extrabold font-mono-num">
                        Rs. {reportData.deliveryChargesCollected}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 border border-slate-200">
                      <span className="text-slate-500 font-bold">Expenses</span>
                      <p className="text-lg font-extrabold font-mono-num text-rose-700">
                        Rs. {reportData.expensesTotal}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 border border-slate-200">
                      <span className="text-slate-500 font-bold">Verified Net Profit</span>
                      {reportData.netProfit !== null ? (
                        <p className="text-lg font-extrabold font-mono-num text-emerald-800">
                          Rs. {reportData.netProfit}
                        </p>
                      ) : (
                        <p className="text-[11px] font-bold text-amber-700 mt-1">
                          Enter wholesale cost prices for {reportData.itemsWithoutCostCount} sold line(s) to compute true profit.
                        </p>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await api.addExpense({
                        title: newExpense.title,
                        amount: Number(newExpense.amount),
                        category: newExpense.category,
                        date: new Date().toISOString().slice(0, 10),
                      });
                      setNewExpense({ title: '', amount: '', category: 'Wholesale Purchase' });
                      flashMsg('Expense recorded ✓');
                      loadAllAdminData();
                    }}
                    className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Expense Title (e.g. Sabzi Mandi Purchase)"
                      value={newExpense.title}
                      onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-300"
                    />
                    <input
                      type="number"
                      required
                      placeholder="Amount (Rs)"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-300 font-mono-num"
                    />
                    <select
                      value={newExpense.category}
                      onChange={(e) =>
                        setNewExpense({ ...newExpense, category: e.target.value as Expense['category'] })
                      }
                      className="px-3 py-2 rounded-lg border border-slate-300"
                    >
                      <option value="Wholesale Purchase">Wholesale Purchase</option>
                      <option value="Fuel & Delivery">Fuel & Delivery</option>
                      <option value="Packaging">Packaging</option>
                      <option value="Rent & Utilities">Rent & Utilities</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer"
                    >
                      + Record Expense
                    </button>
                  </form>

                  {/* Detailed Breakdown Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Payment Method Breakdown */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                      <h4 className="font-extrabold text-sm text-slate-900">Payment Method Breakdown</h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span>Cash on Delivery:</span>
                          <strong className="font-mono-num">Rs. {reportData.paymentBreakdown?.cashOnDelivery || 0}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>JazzCash (Merchant & Personal):</span>
                          <strong className="font-mono-num">Rs. {reportData.paymentBreakdown?.jazzCash || 0}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Easypaisa:</span>
                          <strong className="font-mono-num">Rs. {reportData.paymentBreakdown?.easypaisa || 0}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Bank Alfalah:</span>
                          <strong className="font-mono-num">Rs. {reportData.paymentBreakdown?.bankAlfalah || 0}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Raast ID:</span>
                          <strong className="font-mono-num">Rs. {reportData.paymentBreakdown?.raastId || 0}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Best Selling Items */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                      <h4 className="font-extrabold text-sm text-slate-900">Top Selling Produce</h4>
                      {(!reportData.bestSelling || reportData.bestSelling.length === 0) ? (
                        <p className="text-slate-500">No active sales recorded in this range.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {reportData.bestSelling.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between">
                              <span className="truncate">{item.urdu_name || item.name} ({Math.round(item.qty * 10) / 10} qty)</span>
                              <strong className="font-mono-num text-emerald-800">Rs. {Math.round(item.revenue)}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Rider Performance */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                      <h4 className="font-extrabold text-sm text-slate-900">Rider Delivery Performance</h4>
                      <div className="space-y-1.5">
                        {(reportData.riderPerformance || []).map((rp: any) => (
                          <div key={rp.id} className="flex justify-between">
                            <span>{rp.name} ({rp.deliveredCount}/{rp.assignedCount})</span>
                            <strong className="font-mono-num">Rs. {rp.revenueHandled}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recorded Expenses List */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2 text-xs">
                    <h4 className="font-extrabold text-sm text-slate-900">Recorded Shop Expenses ({expenses.length})</h4>
                    {expenses.length === 0 ? (
                      <p className="text-slate-500">No expenses logged yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {expenses.map((exp) => (
                          <div key={exp.id} className="py-1.5 flex justify-between items-center">
                            <div>
                              <strong className="text-slate-900">{exp.title}</strong>{' '}
                              <span className="text-[11px] text-slate-500">({exp.category} • {exp.date})</span>
                            </div>
                            <strong className="font-mono-num text-rose-700">Rs. {exp.amount}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: CUSTOMERS, LOYALTY DIRECTORY, COUPONS & SUPPORT */}
              {activeTab === 'customers' && (
                <div className="space-y-4 text-xs">
                  {/* Customer Directory & Loyalty Management */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          {lang === 'ur'
                            ? `کسٹمر ڈائریکٹری و لائلٹی پوائنٹس (${customersDirectory.length})`
                            : `Customer Directory, Tiers & Loyalty Points (${customersDirectory.length})`}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          New customers start at 0 points & 0 coupons. Earn 5 pts per Rs. 100 completed purchase (100 pts = Rs. 100).
                        </p>
                      </div>
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder={lang === 'ur' ? 'نام یا فون تلاش کریں...' : 'Search name or phone...'}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs w-full sm:w-56"
                      />
                    </div>

                    {adjustLoyaltyForm && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const delta = Number(adjustLoyaltyForm.delta);
                          if (!Number.isFinite(delta) || delta === 0) return;
                          await api.adjustCustomerLoyalty({
                            phone: adjustLoyaltyForm.phone,
                            deltaPoints: delta,
                            reason: adjustLoyaltyForm.reason,
                            customerName: adjustLoyaltyForm.name,
                          });
                          flashMsg(`Updated loyalty points for ${adjustLoyaltyForm.name} ✓`);
                          setAdjustLoyaltyForm(null);
                          loadAllAdminData();
                        }}
                        className="p-3 rounded-xl bg-amber-50 border border-amber-300 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
                      >
                        <div>
                          <span className="block text-[10px] font-bold text-amber-950">Customer</span>
                          <strong className="font-mono-num">{adjustLoyaltyForm.name} ({adjustLoyaltyForm.phone})</strong>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Add/Subtract Points (e.g. +50 or -20)</label>
                          <input
                            type="number"
                            required
                            value={adjustLoyaltyForm.delta}
                            onChange={(e) => setAdjustLoyaltyForm({ ...adjustLoyaltyForm, delta: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Reason</label>
                          <input
                            type="text"
                            required
                            value={adjustLoyaltyForm.reason}
                            onChange={(e) => setAdjustLoyaltyForm({ ...adjustLoyaltyForm, reason: e.target.value })}
                            placeholder="Owner adjustment / Bonus"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button type="submit" className="flex-1 py-1.5 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer">
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustLoyaltyForm(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-200 font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-start">
                        <thead className="bg-slate-100 text-[11px] font-extrabold text-slate-700 sticky top-0">
                          <tr>
                            <th className="p-2">Customer</th>
                            <th className="p-2">Orders</th>
                            <th className="p-2">Eligible Spent</th>
                            <th className="p-2">Points / Tier</th>
                            <th className="p-2">Assigned Coupons</th>
                            <th className="p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {customersDirectory
                            .filter((c) => {
                              const q = customerSearch.trim().toLowerCase();
                              if (!q) return true;
                              return c.name.toLowerCase().includes(q) || c.phone.includes(q);
                            })
                            .map((cust) => (
                              <tr key={cust.phone}>
                                <td className="p-2">
                                  <strong className="block text-slate-900">{cust.name}</strong>
                                  <span className="font-mono-num text-[11px] text-slate-500">{cust.phone}</span>
                                </td>
                                <td className="p-2 font-mono-num">
                                  {cust.deliveredOrdersCount}/{cust.ordersCount}
                                </td>
                                <td className="p-2 font-mono-num font-bold">
                                  Rs. {cust.totalSpent}
                                </td>
                                <td className="p-2 font-mono-num">
                                  <strong className="text-emerald-800">{cust.points_balance} pts</strong>{' '}
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                    {cust.tier}
                                  </span>
                                </td>
                                <td className="p-2 font-mono-num text-[11px]">
                                  {cust.assignedCoupons.length > 0 ? cust.assignedCoupons.join(', ') : '0'}
                                </td>
                                <td className="p-2 flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const acc = await api.getAdminCustomerLoyalty(cust.phone);
                                        setViewingCustomerLedger(acc);
                                      } catch (err: any) {
                                        flashMsg(err?.message || 'Could not load loyalty ledger');
                                      }
                                    }}
                                    className="px-2 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-950 font-bold text-[10px] cursor-pointer"
                                  >
                                    Ledger
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAdjustLoyaltyForm({
                                        phone: cust.phone,
                                        name: cust.name,
                                        delta: '50',
                                        reason: 'Admin reward adjustment',
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[10px] cursor-pointer"
                                  >
                                    ± Points
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNewCoupon((prev) => ({
                                        ...prev,
                                        assigned_phones: prev.assigned_phones
                                          ? `${prev.assigned_phones}, ${cust.phone}`
                                          : cust.phone,
                                      }))
                                    }
                                    className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-[10px] cursor-pointer"
                                  >
                                    + Coupon
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {viewingCustomerLedger && (
                      <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <strong className="text-sky-950">
                              Loyalty Ledger: {viewingCustomerLedger.user_name} ({viewingCustomerLedger.user_phone})
                            </strong>
                            <p className="text-[11px] text-slate-600 font-mono-num">
                              Tier: <strong>{viewingCustomerLedger.tier}</strong> • Balance:{' '}
                              <strong>{viewingCustomerLedger.points_balance} pts</strong> • Eligible Spend: Rs.{' '}
                              {(viewingCustomerLedger.cumulative_purchases || 0).toLocaleString()} • Delivered Orders:{' '}
                              {viewingCustomerLedger.successful_purchases_count || 0}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setViewingCustomerLedger(null)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                        <div className="max-h-44 overflow-y-auto space-y-1">
                          {viewingCustomerLedger.history.length === 0 ? (
                            <p className="text-[11px] text-slate-500">No loyalty transactions recorded yet.</p>
                          ) : (
                            viewingCustomerLedger.history.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-sky-100 text-[11px]"
                              >
                                <div>
                                  <span className="uppercase text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 me-1.5">
                                    {tx.type}
                                  </span>
                                  <span>{tx.description}</span>
                                  <span className="text-[10px] text-slate-400 ms-1.5 font-mono-num">
                                    ({new Date(tx.created_at).toLocaleString('en-PK')})
                                  </span>
                                </div>
                                <strong
                                  className={`font-mono-num shrink-0 ${
                                    tx.points >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {tx.points >= 0 ? `+${tx.points}` : tx.points} pts
                                </strong>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-sm">
                        {editingCouponCode ? `Edit Coupon: ${editingCouponCode}` : 'Coupons & Discounts (Admin Only)'}
                      </h3>
                      {editingCouponCode && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCouponCode(null);
                            setNewCoupon({
                              code: '',
                              discount_type: 'fixed',
                              value: '50',
                              min_order: '500',
                              description: '',
                              assigned_phones: '',
                              expires_at: '',
                              max_uses: '',
                              per_customer_limit: '',
                              allow_loyalty_stacking: false,
                            });
                          }}
                          className="text-[11px] font-bold text-slate-500 underline cursor-pointer"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const phones = newCoupon.assigned_phones
                          .split(/[,\n]+/)
                          .map((p) => p.trim())
                          .filter(Boolean);
                        await api.saveCoupon({
                          code: newCoupon.code.toUpperCase(),
                          discount_type: newCoupon.discount_type,
                          value: Number(newCoupon.value || 0),
                          min_order: Number(newCoupon.min_order || 0),
                          active: true,
                          description: newCoupon.description || 'Admin issued coupon',
                          expires_at: newCoupon.expires_at.trim() || undefined,
                          max_uses: newCoupon.max_uses.trim() ? Number(newCoupon.max_uses) : undefined,
                          per_customer_limit: newCoupon.per_customer_limit.trim()
                            ? Number(newCoupon.per_customer_limit)
                            : undefined,
                          allow_loyalty_stacking: newCoupon.allow_loyalty_stacking,
                          ...(phones.length > 0 ? { assigned_phones: phones } : {}),
                        });
                        setEditingCouponCode(null);
                        setNewCoupon({
                          code: '',
                          discount_type: 'fixed',
                          value: '50',
                          min_order: '500',
                          description: '',
                          assigned_phones: '',
                          expires_at: '',
                          max_uses: '',
                          per_customer_limit: '',
                          allow_loyalty_stacking: false,
                        });
                        flashMsg('Coupon saved ✓');
                        loadAllAdminData();
                      }}
                      className="grid grid-cols-2 gap-2"
                    >
                      <input
                        type="text"
                        required
                        readOnly={Boolean(editingCouponCode)}
                        placeholder="CODE (e.g. VIP100)"
                        value={newCoupon.code}
                        onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
                        className={`px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num uppercase ${editingCouponCode ? 'bg-slate-100' : ''}`}
                      />
                      <select
                        value={newCoupon.discount_type}
                        onChange={(e) =>
                          setNewCoupon({ ...newCoupon, discount_type: e.target.value as Coupon['discount_type'] })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="fixed">Fixed (Rs.)</option>
                        <option value="percent">Percent (%)</option>
                        <option value="free_delivery">Free Delivery</option>
                      </select>
                      <input
                        type="number"
                        required={newCoupon.discount_type !== 'free_delivery'}
                        placeholder={newCoupon.discount_type === 'percent' ? 'Discount %' : 'Amount Rs'}
                        value={newCoupon.value}
                        onChange={(e) => setNewCoupon({ ...newCoupon, value: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Min Order (Rs.)"
                        value={newCoupon.min_order}
                        onChange={(e) => setNewCoupon({ ...newCoupon, min_order: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Expiry Date (optional)</label>
                        <input
                          type="date"
                          value={newCoupon.expires_at ? newCoupon.expires_at.slice(0, 10) : ''}
                          onChange={(e) => setNewCoupon({ ...newCoupon, expires_at: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Max Uses</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="∞"
                            value={newCoupon.max_uses}
                            onChange={(e) => setNewCoupon({ ...newCoupon, max_uses: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Per Customer</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="∞"
                            value={newCoupon.per_customer_limit}
                            onChange={(e) => setNewCoupon({ ...newCoupon, per_customer_limit: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Selected Customer Phones (comma-separated, e.g. 03001234567)"
                        value={newCoupon.assigned_phones}
                        onChange={(e) => setNewCoupon({ ...newCoupon, assigned_phones: e.target.value })}
                        className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                      />
                      <input
                        type="text"
                        placeholder="Note / Description (optional)"
                        value={newCoupon.description}
                        onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                        className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                      <label className="col-span-2 flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newCoupon.allow_loyalty_stacking}
                          onChange={(e) =>
                            setNewCoupon({ ...newCoupon, allow_loyalty_stacking: e.target.checked })
                          }
                        />
                        <span>Allow combining this coupon with Loyalty Points redemption</span>
                      </label>
                      <button type="submit" className="col-span-2 py-2 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer">
                        {editingCouponCode ? `Update Coupon (${editingCouponCode})` : 'Save Coupon'}
                      </button>
                    </form>
                    {coupons.length === 0 ? (
                      <p className="text-slate-500 text-[11px]">No coupons created yet. Only Admin-created coupons exist.</p>
                    ) : (
                      coupons.map((c) => (
                        <div key={c.code} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="font-mono-num">{c.code}</strong>
                              <span className="text-slate-600">
                                {c.discount_type === 'free_delivery'
                                  ? 'Free Delivery'
                                  : c.discount_type === 'percent'
                                  ? `${c.value}% OFF`
                                  : `Rs. ${c.value} OFF`}
                                {c.min_order > 0 ? ` • Min Rs. ${c.min_order}` : ''}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono-num">
                                Uses: {c.uses_count || 0}{c.max_uses ? `/${c.max_uses}` : ''}
                              </span>
                              {c.expires_at && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-mono-num">
                                  Exp: {String(c.expires_at).slice(0, 10)}
                                </span>
                              )}
                              {c.allow_loyalty_stacking && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px]">
                                  Stackable
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {c.assigned_phones && c.assigned_phones.length > 0
                                ? `Assigned to: ${c.assigned_phones.join(', ')}`
                                : 'Manual code (any customer with code)'}
                              {c.per_customer_limit ? ` • Limit ${c.per_customer_limit}x/customer` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCouponCode(c.code);
                                setNewCoupon({
                                  code: c.code,
                                  discount_type: c.discount_type,
                                  value: String(c.value ?? 0),
                                  min_order: String(c.min_order ?? 0),
                                  description: c.description || '',
                                  assigned_phones: (c.assigned_phones || []).join(', '),
                                  expires_at: c.expires_at ? String(c.expires_at).slice(0, 10) : '',
                                  max_uses: c.max_uses ? String(c.max_uses) : '',
                                  per_customer_limit: c.per_customer_limit ? String(c.per_customer_limit) : '',
                                  allow_loyalty_stacking: Boolean(c.allow_loyalty_stacking),
                                });
                              }}
                              title="Edit coupon"
                              className="p-1 text-slate-600 hover:bg-slate-200 rounded cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.saveCoupon({ ...c, active: !c.active });
                                flashMsg(`Coupon ${c.code} ${!c.active ? 'activated' : 'paused'} ✓`);
                                loadAllAdminData();
                              }}
                              className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                                c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {c.active ? 'Active' : 'Paused'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.deleteCoupon(c.code);
                                flashMsg(`Coupon ${c.code} deleted`);
                                loadAllAdminData();
                              }}
                              title="Delete coupon"
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <h3 className="font-extrabold text-sm">Push Marketing & Complaints ({complaints.length})</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await api.broadcastMarketing({
                          title: newCampaign.title,
                          message: newCampaign.message,
                          target_audience: 'all_users',
                          discount_code: newCampaign.discount_code || undefined,
                        });
                        setNewCampaign({ title: '', message: '', discount_code: '' });
                        flashMsg('Broadcast campaign published ✓');
                        loadAllAdminData();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        required
                        placeholder="Campaign Title"
                        value={newCampaign.title}
                        onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Announcement message in Urdu or English"
                        value={newCampaign.message}
                        onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                      <button type="submit" className="w-full py-2 rounded-lg bg-amber-600 text-white font-bold cursor-pointer">
                        Publish Store Banner / Alert ({campaigns.length})
                      </button>
                    </form>
                    {complaints.map((cmp) => (
                      <div key={cmp.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>{cmp.customer_name} ({cmp.customer_phone})</span>
                          <span>{cmp.status}</span>
                        </div>
                        <p className="text-slate-600">{cmp.message}</p>
                        {cmp.status !== 'resolved' && (
                          <button
                            onClick={async () => {
                              await api.updateComplaint(cmp.id, 'resolved', 'Resolved by Shop Owner');
                              loadAllAdminData();
                            }}
                            className="px-2 py-1 rounded bg-emerald-700 text-white font-bold cursor-pointer"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              )}

              {/* TAB 8: INTEGRATIONS, SUPABASE, 2FA, BACKUPS & CLEAN ZIP EXPORT */}
              {activeTab === 'security' && (
                <div className="space-y-4 text-xs">
                  {/* Live Integrations Control Status */}
                  {integrationsStatus && (
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                          <Plug className="w-4 h-4 text-emerald-700" />
                          {lang === 'ur' ? 'انٹیگریشنز اور API اسٹیٹس (Live Check)' : 'Connected Integrations & APIs Control Center'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('store')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold cursor-pointer"
                        >
                          {lang === 'ur' ? 'دکان و ادائیگی اکاؤنٹس سیٹنگز کھولیں →' : 'Edit Store & Payment Accounts →'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong>Gemini AI</strong>
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${integrationsStatus.gemini.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                              {integrationsStatus.gemini.configured ? 'Connected ✓' : 'Env Key Needed'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {integrationsStatus.gemini.configured
                              ? `Server GEMINI_API_KEY active (${integrationsStatus.gemini.maskedPreview || 'masked'})`
                              : 'Set GEMINI_API_KEY in server environment secrets (never in frontend/files).'}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong>WhatsApp API</strong>
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${integrationsStatus.whatsappCloud.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-900'}`}>
                              {integrationsStatus.whatsappCloud.configured ? 'Cloud API ✓' : 'wa.me Active'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {integrationsStatus.whatsappCloud.configured
                              ? `Cloud API active (${integrationsStatus.whatsappCloud.phoneNumberIdPreview || 'ID set'})`
                              : 'Direct wa.me order links active; add WHATSAPP_CLOUD_TOKEN & PHONE_NUMBER_ID in server env for auto-push.'}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong>Supabase DB</strong>
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${launchStatus?.allTablesReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                              {launchStatus?.allTablesReady
                                ? '7/7 Live ✓'
                                : `${launchStatus ? Object.values(launchStatus.tables).filter((t) => t.exists).length : 0}/${launchStatus ? Object.keys(launchStatus.tables).length : 7} Ready`}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {integrationsStatus.supabase.serviceRoleConfigured ? 'Server service role connected.' : 'Set Supabase keys in server env.'} Run SQL migration below for all tables.
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong>Payments</strong>
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">
                              Manual + QR ✓
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {integrationsStatus.paymentGateways.mode === 'manual_verification'
                              ? 'Manual QR/IBAN verification via Owner Payments Queue (JazzCash, Easypaisa, Bank Alfalah, Raast, COD).'
                              : 'Automated gateway'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Clean Project ZIP Export */}
                    <div className="rounded-2xl bg-white border border-emerald-300 p-4 space-y-3">
                      <h3 className="font-extrabold text-sm text-emerald-950 flex items-center gap-2">
                        <FileArchive className="w-4 h-4 text-emerald-700" />
                        Download Clean GitHub-Ready Project ZIP
                      </h3>
                      <p className="text-slate-600 leading-relaxed">
                        Exports your complete source code, PWA assets, SQL migration (`supabase/complete_migration.sql`), and GitHub Pages workflow —{' '}
                        <strong>automatically excluding</strong> `.env`, secret keys, private server receipts, and personal CNIC screenshots.
                      </p>
                      <button
                        onClick={handleDownloadCleanZip}
                        className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Download Clean Project ZIP (.zip)
                      </button>
                    </div>

                    {/* 2FA & Delivery OTP Security */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <h3 className="font-extrabold text-sm flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        Owner 2FA & Delivery OTP Controls
                      </h3>
                      <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl">
                        <span>Owner TOTP 2FA (Optional):</span>
                        {authStatus?.twoFactorEnabled ? (
                          <button
                            onClick={async () => {
                              const res = await api.toggleOwner2FA(false);
                              setAuthStatus((prev) =>
                                prev ? { ...prev, twoFactorEnabled: res.twoFactorEnabled } : prev
                              );
                              setTwoFaSecretHex('');
                              setConfirm2FAEnable(false);
                            }}
                            className="px-3 py-1 rounded-lg font-bold bg-emerald-700 text-white cursor-pointer"
                          >
                            2FA Enabled (Disable)
                          </button>
                        ) : !confirm2FAEnable ? (
                          <button
                            onClick={() => setConfirm2FAEnable(true)}
                            className="px-3 py-1 rounded-lg font-bold bg-slate-200 text-slate-800 cursor-pointer"
                          >
                            Enable 2FA
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={async () => {
                                const res = await api.toggleOwner2FA(true);
                                setAuthStatus((prev) =>
                                  prev ? { ...prev, twoFactorEnabled: res.twoFactorEnabled } : prev
                                );
                                if (res.secretHex) setTwoFaSecretHex(res.secretHex);
                                setConfirm2FAEnable(false);
                              }}
                              className="px-2.5 py-1 rounded-lg font-bold bg-amber-600 text-white text-[11px] cursor-pointer"
                            >
                              Confirm On
                            </button>
                            <button
                              onClick={() => setConfirm2FAEnable(false)}
                              className="px-2.5 py-1 rounded-lg font-bold bg-slate-200 text-slate-700 text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      {confirm2FAEnable && (
                        <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-950">
                          {lang === 'ur'
                            ? 'نوٹ: 2FA آن کرنے کے لیے Google Authenticator ایپ ضروری ہوگی۔ اگر آپ کو صرف آسان پاسورڈ لاگ ان چاہیے تو اسے OFF ہی رہنے دیں۔'
                            : 'Note: Enabling 2FA requires an Authenticator app on every password login. Leave it OFF for simple password-only access.'}
                        </p>
                      )}
                      {twoFaSecretHex && (
                        <p className="p-2 rounded bg-amber-50 border border-amber-300 font-mono-num text-[11px] break-all">
                          Save 2FA Secret Hex in Authenticator: <strong>{twoFaSecretHex}</strong>
                        </p>
                      )}
                      {settings && (
                        <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl">
                          <span>Require 4-digit OTP on Delivery:</span>
                          <button
                            onClick={async () => {
                              const updated = await api.updateSettings({
                                requireDeliveryOtp: !settings.requireDeliveryOtp,
                              });
                              setSettings(updated);
                            }}
                            className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                              settings.requireDeliveryOtp
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {settings.requireDeliveryOtp ? 'Required' : 'Optional'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supabase Cloud Tables & 1-Click Sync Center */}
                  {launchStatus && (
                    <div className="rounded-2xl bg-white border border-sky-300 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-extrabold text-sm text-sky-950 flex items-center gap-2">
                            <Database className="w-4 h-4 text-sky-700" />
                            {lang === 'ur'
                              ? 'Supabase کلاؤڈ ڈیٹابیس اور لائیو ٹریکنگ سیٹ اپ'
                              : 'Supabase Cloud Database & Live Realtime Setup'}
                          </h3>
                          <p className="text-[11px] text-slate-600">
                            {launchStatus.allTablesReady
                              ? lang === 'ur'
                                ? `تمام ${Object.keys(launchStatus.tables).length} Supabase ٹیبلز اور لائیو سنک مکمل طور پر فعال ہیں ✓`
                                : `All ${Object.keys(launchStatus.tables).length} Supabase tables are active and synced ✓`
                              : lang === 'ur'
                              ? 'نیچے "SQL کاپی کریں" دبائیں، Supabase SQL Editor کھول کر Run کریں، پھر "Sync Now" دبائیں۔'
                              : 'Step 1: Click Copy SQL → Step 2: Paste & Run in Supabase SQL Editor → Step 3: Click Verify & Sync Now.'}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg font-bold ${launchStatus.aiConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                          {launchStatus.aiConfigured ? 'Gemini AI: Connected ✓' : 'AI Key: Add GEMINI_API_KEY in AI Studio Secrets'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(launchStatus.tables).map(([tbl, info]) => (
                          <span
                            key={tbl}
                            className={`px-2.5 py-1 rounded-lg font-mono-num font-bold ${
                              info.exists
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border border-amber-300'
                            }`}
                          >
                            {tbl}: {info.exists ? 'LIVE ✓' : 'Missing (SQL Needed)'}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { sql } = await api.getAdminMigrationSql();
                              await navigator.clipboard?.writeText(sql);
                              setCopiedSql(true);
                              flashMsg('Complete SQL migration copied! Paste & Run inside Supabase SQL Editor.');
                              setTimeout(() => setCopiedSql(false), 3000);
                            } catch (err: any) {
                              flashMsg(err?.message || 'Could not load migration SQL');
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-sky-800 hover:bg-sky-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedSql ? 'SQL Copied ✓' : '1. Copy Complete SQL Migration'}</span>
                        </button>

                        <a
                          href={`https://supabase.com/dashboard/project/${launchStatus.projectRef || 'gtqvpjwpsxdampdsdvry'}/sql/new`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>2. Open Supabase SQL Editor</span>
                        </a>

                        <button
                          type="button"
                          disabled={syncingSupabase}
                          onClick={async () => {
                            setSyncingSupabase(true);
                            try {
                              const res = await api.syncAllToSupabase();
                              if (res.status) setLaunchStatus(res.status);
                              if (res.ok) {
                                flashMsg(`Synced ${res.syncedOrders} orders & ${res.syncedRiders} riders to Supabase ✓`);
                                loadAllAdminData();
                              } else {
                                flashMsg(`Still missing tables in Supabase: ${res.missingTables.join(', ')}`);
                              }
                            } catch (err: any) {
                              flashMsg(err?.message || 'Supabase sync failed');
                            } finally {
                              setSyncingSupabase(false);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingSupabase ? 'animate-spin' : ''}`} />
                          <span>{syncingSupabase ? 'Checking & Syncing...' : '3. Verify & Sync All Data to Supabase'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Change Owner Password Card */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <h3 className="font-extrabold text-sm flex items-center gap-2 text-emerald-950">
                      <Lock className="w-4 h-4 text-emerald-700" />
                      {lang === 'ur'
                        ? 'ایڈمن پاسورڈ تبدیل کریں (Change Owner Password)'
                        : 'Change Owner Admin Password'}
                    </h3>
                    <form onSubmit={handleChangeOwnerPassword} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {lang === 'ur' ? 'موجودہ پاسورڈ' : 'Current Password'}
                        </label>
                        <input
                          type="password"
                          required
                          value={currentPwdInput}
                          onChange={(e) => setCurrentPwdInput(e.target.value)}
                          placeholder="••••••"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {lang === 'ur' ? 'نیا پاسورڈ (کم از کم 6 حروف)' : 'New Password (6+ chars)'}
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={changeNewPwdInput}
                          onChange={(e) => setChangeNewPwdInput(e.target.value)}
                          placeholder="New password"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {lang === 'ur' ? 'نئے پاسورڈ کی تصدیق' : 'Confirm New Password'}
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={confirmNewPwdInput}
                          onChange={(e) => setConfirmNewPwdInput(e.target.value)}
                          placeholder="Repeat new password"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={pwdChangeLoading}
                        className="py-2 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs cursor-pointer"
                      >
                        {pwdChangeLoading
                          ? '...'
                          : lang === 'ur'
                          ? 'پاسورڈ تبدیل کریں'
                          : 'Update Password'}
                      </button>
                    </form>
                    {pwdChangeErr && <p className="text-xs font-bold text-rose-700">{pwdChangeErr}</p>}
                    {pwdChangeMsg && <p className="text-xs font-bold text-emerald-700">{pwdChangeMsg}</p>}
                  </div>

                  {/* Backups & Restore */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-sm flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-700" />
                        Database Backups ({backups.length})
                      </h3>
                      <button
                        onClick={async () => {
                          await api.createBackup();
                          flashMsg('Manual backup snapshot created ✓');
                          loadAllAdminData();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white font-bold cursor-pointer"
                      >
                        + Create Backup Now
                      </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {backups.map((bk) => (
                        <div
                          key={bk.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <strong className="font-mono-num">{bk.file_name}</strong>
                            <p className="text-slate-500">
                              {new Date(bk.timestamp).toLocaleString('en-PK')} • {bk.size_kb} KB ({bk.records_count.products} products, {bk.records_count.orders} orders)
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const blob = new Blob([bk.download_data_json], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${bk.file_name}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer"
                            >
                              JSON
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const blob = new Blob([bk.download_data_sql], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${bk.file_name}.sql`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="px-2 py-1 rounded bg-white border border-slate-300 font-bold cursor-pointer"
                            >
                              SQL
                            </button>
                            {confirmRestoreId === bk.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await api.restoreBackup(JSON.parse(bk.download_data_json));
                                  setConfirmRestoreId(null);
                                  flashMsg('Database restored from snapshot ✓');
                                  loadAllAdminData();
                                  onCatalogUpdated();
                                }}
                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold cursor-pointer"
                              >
                                Confirm Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreId(bk.id)}
                                className="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" /> Restore
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Audit Logs & Notification Logs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                      <h3 className="font-extrabold text-sm">Security Audit Logs ({auditLogs.length})</h3>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                        {auditLogs.slice(0, 15).map((log) => (
                          <div key={log.id} className="py-1.5 flex justify-between gap-2 text-[11px]">
                            <span>
                              <strong className="text-emerald-900">{log.action}</strong> — {log.details}
                            </span>
                            <span className="text-slate-400 shrink-0">
                              {new Date(log.created_at).toLocaleTimeString('en-PK')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                      <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-emerald-700" />
                        WhatsApp / SMS Notification Logs ({notificationLogs.length})
                      </h3>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                        {notificationLogs.length === 0 ? (
                          <p className="text-slate-500 py-4 text-center">No dispatch notifications sent yet.</p>
                        ) : (
                          notificationLogs.slice(0, 15).map((nl: any, i: number) => (
                            <div key={nl.id || i} className="py-1.5 flex justify-between gap-2">
                              <span>
                                <strong className="uppercase text-emerald-900">{nl.recipient_role || nl.channel}</strong> ({nl.status}) — {nl.message_preview || nl.order_id}
                              </span>
                              <span className="text-slate-400 shrink-0">
                                {nl.timestamp ? new Date(nl.timestamp).toLocaleTimeString('en-PK') : ''}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Private Receipt Image Viewer Modal (Owner-only) */}
      {viewingReceiptImg && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-2xl p-4 max-w-md w-full space-y-3">
            <div className="flex justify-between items-center">
              <strong className="text-sm">Private Payment Proof</strong>
              <button
                onClick={() => setViewingReceiptImg(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={viewingReceiptImg.dataUrl}
              alt="Payment Receipt"
              className="w-full max-h-[70vh] object-contain rounded-xl border border-slate-200"
            />
          </div>
        </div>
      )}

      {/* Full Edit Product Details Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleQuickUpdateProduct(editingProduct.id, editingProduct);
              setEditingProduct(null);
            }}
            className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-3 text-xs my-auto"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-emerald-950">Edit Produce Item: {editingProduct.name}</h3>
              <button type="button" onClick={() => setEditingProduct(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold block mb-1">English Name</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Urdu Name (اردو)</label>
                <input
                  type="text"
                  value={editingProduct.urdu_name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, urdu_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Category</label>
                <select
                  value={editingProduct.category}
                  onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value as ProductCategory })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                >
                  <option value="vegetables">Vegetables</option>
                  <option value="fruits">Fruits</option>
                  <option value="herbs">Herbs</option>
                  <option value="seasonal_deals">Seasonal</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Season Tag</label>
                <select
                  value={editingProduct.season_tag || 'all_year'}
                  onChange={(e) => setEditingProduct({ ...editingProduct, season_tag: e.target.value as SeasonTag })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                >
                  <option value="all_year">All Year</option>
                  <option value="summer">Summer</option>
                  <option value="winter">Winter</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Price (Rs)</label>
                <input
                  type="number"
                  required
                  value={editingProduct.price}
                  onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Unit</label>
                <input
                  type="text"
                  value={editingProduct.unit}
                  onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2">
                <label className="font-bold block mb-1">Image URL</label>
                <input
                  type="text"
                  value={editingProduct.image_url}
                  onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono-num"
                />
              </div>
              <div className="col-span-2">
                <label className="font-bold block mb-1">Urdu Description</label>
                <textarea
                  rows={2}
                  value={editingProduct.description_ur || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description_ur: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2">
                <label className="font-bold block mb-1">English Description</label>
                <textarea
                  rows={2}
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2 flex flex-wrap gap-3 pt-1">
                <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.is_seasonal)}
                    onChange={(e) => setEditingProduct({ ...editingProduct, is_seasonal: e.target.checked })}
                  />
                  Seasonal
                </label>
                <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.is_top_selling)}
                    onChange={(e) => setEditingProduct({ ...editingProduct, is_top_selling: e.target.checked })}
                  />
                  Top Selling
                </label>
                <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.is_recommended)}
                    onChange={(e) => setEditingProduct({ ...editingProduct, is_recommended: e.target.checked })}
                  />
                  Recommended
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-800 text-white font-bold cursor-pointer">
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Order Cancellation Reason Modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await api.adminUpdateOrder(cancellingOrder.id, {
                order_status: 'Cancelled',
                rejection_reason: cancellingOrder.reason.trim() || 'Cancelled by Shop Owner',
              });
              flashMsg(`Order #${cancellingOrder.id} cancelled & stock restored`);
              setCancellingOrder(null);
              loadAllAdminData();
              onCatalogUpdated();
            }}
            className="bg-white rounded-2xl p-5 max-w-md w-full space-y-3 text-xs"
          >
            <h3 className="text-sm font-extrabold text-rose-800">Cancel Order #{cancellingOrder.id}</h3>
            <p className="text-slate-600">Enter cancellation reason (stock will be automatically restored):</p>
            <input
              type="text"
              required
              value={cancellingOrder.reason}
              onChange={(e) => setCancellingOrder({ ...cancellingOrder, reason: e.target.value })}
              placeholder="e.g. Customer requested cancel / Out of delivery area"
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold cursor-pointer">
                Confirm Cancel
              </button>
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 font-bold cursor-pointer"
              >
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Order Invoice / Bill Modal */}
      {printingOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 overflow-y-auto print-invoice-area">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-3 text-xs my-auto shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-emerald-950">
                  {settings?.shopNameEn || 'Muslim Vegetable & Fruit Shop'}
                </h3>
                <p className="text-[11px] text-slate-600">
                  {settings?.locationEn || 'Camp Chowk, Khanewal'} • WhatsApp:{' '}
                  <span dir="ltr" className="inline-block font-mono-num [unicode-bidi:isolate]">
                    {settings?.whatsapp || '+923007466664'}
                  </span>
                </p>
              </div>
              <button type="button" onClick={() => setPrintingOrder(null)} className="p-1 cursor-pointer no-print">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1 font-mono-num">
              <p><strong>Invoice #:</strong> {printingOrder.id}</p>
              <p><strong>Date &amp; Time:</strong> {new Date(printingOrder.created_at).toLocaleString('en-PK')}</p>
              <p><strong>Customer:</strong> {printingOrder.customer_name} ({printingOrder.customer_phone})</p>
              <p>
                <strong>Address:</strong>{' '}
                {[printingOrder.delivery_area, printingOrder.delivery_address].filter(Boolean).join(', ') || 'Not provided (Optional)'}
              </p>
              <p><strong>Payment:</strong> {printingOrder.payment_method} ({printingOrder.payment_status})</p>
            </div>
            <table className="w-full border-t border-b border-slate-200 py-2">
              <thead>
                <tr className="text-start border-b border-slate-200">
                  <th className="py-1">Item</th>
                  <th className="py-1">Qty/Wt</th>
                  <th className="py-1 text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {printingOrder.items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-1">{it.urdu_name || it.product_name}</td>
                    <td className="py-1 font-mono-num">{it.weight_grams}g</td>
                    <td className="py-1 text-end font-mono-num">Rs. {it.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-end font-mono-num">
              <p>Items Total / اشیاء کا کل بل: Rs. {printingOrder.subtotal}</p>
              <p>
                Delivery Charges / ڈیلیوری چارجز
                {printingOrder.delivery_distance_km > 0 ? ` (${printingOrder.delivery_distance_km} km)` : ''}: Rs. {printingOrder.delivery_fee}
              </p>
              {printingOrder.discount > 0 && <p>Discount: -Rs. {printingOrder.discount}</p>}
              {(printingOrder.loyalty_points_used > 0 || (printingOrder.loyalty_discount_rs ?? 0) > 0) && (
                <p>
                  Loyalty Used ({printingOrder.loyalty_points_used} pts): -Rs.{' '}
                  {printingOrder.loyalty_discount_rs ?? printingOrder.loyalty_points_used}
                </p>
              )}
              <p className="text-sm font-extrabold text-emerald-950 pt-1 border-t border-slate-200">
                Grand Total / کل قابلِ ادائیگی رقم: Rs. {printingOrder.total_amount}
              </p>
            </div>
            <div className="flex gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-emerald-800 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Print Invoice
              </button>
              <button
                type="button"
                onClick={() => setPrintingOrder(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
