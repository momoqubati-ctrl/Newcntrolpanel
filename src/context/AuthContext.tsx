import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Profile, Vendor, Network, CardCategory, CardItem, 
  DepositRequest, WithdrawalRequest, ExternalWalletConfig, SmsLog, VendorLine, BroadcastNotification, Wallet, WithdrawalMethod 
} from '../types';
// Mock data removed: rely on Supabase / runtime context instead of initial mock data
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { encryptCardCode, decryptCardCode, formatCardCodeForExport } from '../lib/encryptionUtils';
import { normalizeCardStatus } from '../lib/cardStatusUtils';

interface AuthContextType {
  currentUser: Profile | null;
  currentVendor: Vendor | null;
  isLoggedIn: boolean;
  dbLoading: boolean;
  dbConnected: boolean;
  refetchFromDb: () => Promise<void>;
  loginAsAdmin: (phone: string, pass: string) => Promise<boolean>;
  loginAsVendor: (phone: string, pass: string) => Promise<boolean>;
  loginAsDemoVendor: () => Promise<boolean>;
  logout: () => void;
  accessToken: string | null;
  getAuthenticatedSupabase: () => any;

  // Data Collections
  vendors: Vendor[];
  networks: Network[];
  lines: VendorLine[];
  categories: CardCategory[];
  cards: CardItem[];
  depositRequests: DepositRequest[];
  withdrawalRequests: WithdrawalRequest[];
  wallets: Wallet[];
  withdrawalMethods: WithdrawalMethod[];
  walletsConfig: ExternalWalletConfig[];
  smsLogs: SmsLog[];
  broadcasts: BroadcastNotification[];
  profiles: Profile[];
  payments: any[];
  paymentItems: any[];
  deliveryAttempts: any[];

  // Mutations
  approveDeposit: (id: string, notes?: string) => void;
  rejectDeposit: (id: string, notes: string) => void;
  approveWithdrawal: (id: string, receiptUrl?: string, notes?: string) => void;
  rejectWithdrawal: (id: string, notes: string) => void;
  approveVendor: (vendorId: string) => void;
  rejectVendor: (vendorId: string) => void;
  updateVendorCommission: (vendorId: string, rate: number) => void;
  adminForceDeliverCards: (paymentId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  adminRefundPayment: (paymentId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  adminQueryPaymentStatus: (paymentId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  
  // Vendor Mutations
  addNetwork: (net: Omit<Network, 'id' | 'sales_count' | 'rating' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  updateNetwork: (id: string, data: Partial<Network>) => Promise<{ success: boolean; error?: string }>;
  deleteNetwork: (id: string) => Promise<{ success: boolean; error?: string }>;
  addLine: (line: Omit<VendorLine, 'id' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  deleteLine: (id: string) => Promise<{ success: boolean; error?: string }>;
  addCategory: (cat: Omit<CardCategory, 'id' | 'available_cards_count' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  updateCategory: (id: string, data: Partial<CardCategory>) => Promise<{ success: boolean; error?: string }>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteCard: (id: string) => Promise<{ success: boolean; error?: string }>;
  uploadCardsBulk: (categoryId: string, networkId: string, codes: string[]) => Promise<{ success: boolean; count: number; error?: string }>;
  submitWithdrawal: (req: Omit<WithdrawalRequest, 'id' | 'status' | 'created_at' | 'vendor_name' | 'vendor_phone'> & { method_id: string }) => Promise<{ success: boolean; error?: string }>;

  // Admin Mutations
  updateWalletConfig: (id: string, config: Partial<ExternalWalletConfig>) => void;
  addWalletConfig: (config: Omit<ExternalWalletConfig, 'id' | 'created_at'>) => void;
  saveGatewayFullConfig: (config: ExternalWalletConfig) => Promise<void>;
  sendBroadcast: (title: string, body: string, targetRole: 'all' | 'customer' | 'vendor') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = window.localStorage.getItem('shabakati_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [dbLoading, setDbLoading] = useState<boolean>(true);
  const [dbConnected, setDbConnected] = useState<boolean>(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [lines, setLines] = useState<VendorLine[]>([]);
  const [categories, setCategories] = useState<CardCategory[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [withdrawalMethods, setWithdrawalMethods] = useState<WithdrawalMethod[]>([]);
  const [walletsConfig, setWalletsConfig] = useState<ExternalWalletConfig[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastNotification[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentItems, setPaymentItems] = useState<any[]>([]);
  const [deliveryAttempts, setDeliveryAttempts] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('shabakati_access_token');
  });

  const authenticatedClientRef = useRef<any>(null);
  const authenticatedTokenRef = useRef<string | null>(null);


  const getAuthenticatedSupabase = useCallback(() => {
    const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('shabakati_access_token') : null);
    if (!token) {
      authenticatedClientRef.current = null;
      authenticatedTokenRef.current = null;
      return getSupabase();
    }

    if (!authenticatedClientRef.current || authenticatedTokenRef.current !== token) {
      authenticatedClientRef.current = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      authenticatedTokenRef.current = token;
    }

    return authenticatedClientRef.current;
  }, [accessToken]);

  useEffect(() => {
    (window as any).getAuthenticatedSupabase = getAuthenticatedSupabase;
    return () => {
      delete (window as any).getAuthenticatedSupabase;
    };
  }, [getAuthenticatedSupabase]);

  // Phase 1: Query & Fetch all collections from Supabase DB
  const refetchFromDb = useCallback(async (tokenOverride?: string) => {
    setDbLoading(true);
    try {
      const supabase = tokenOverride
        ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: {
              headers: {
                Authorization: `Bearer ${tokenOverride}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
        : getAuthenticatedSupabase();
      const requests = [
        supabase.from('profiles').select('*'),
        supabase.from('vendors').select('*'),
        supabase.from('networks').select('*'),
        supabase.from('card_categories').select('*'),
        supabase.from('cards').select('*'),
        supabase.from('deposit_requests').select('*'),
        supabase.from('withdrawal_requests').select('*'),
        supabase.from('wallets').select('*'),
        supabase.from('withdrawal_methods').select('*'),
        supabase.from('vendor_lines').select('*'),
        supabase.from('external_wallets').select('*'),
        supabase.from('sms_logs').select('*'),
        supabase.from('card_delivery_attempts').select('*'),
        supabase.from('payments').select('*'),
        supabase.from('payment_items').select('*'),
        supabase.from('app_settings').select('*')
      ];

      const settled = await Promise.allSettled(requests);
      const profilesResult = settled[0];
      const vendorsResult = settled[1];
      const networksResult = settled[2];
      const cardCategoriesResult = settled[3];
      const cardsResult = settled[4];
      const depositsResult = settled[5];
      const withdrawalsResult = settled[6];
      const walletsResult = settled[7];
      const withdrawalMethodsResult = settled[8];
      const linesResult = settled[9];
      const walletsConfigResult = settled[10];
      const smsResult = settled[11];
      const deliveryAttemptsResult = settled[12];
      const paymentsResult = settled[13];
      const paymentItemsResult = settled[14];
      const appSettingsResult = settled[15];

      const profilesData = profilesResult.status === 'fulfilled' ? (profilesResult.value?.data || []) : [];
      const vendorsData = vendorsResult.status === 'fulfilled' ? (vendorsResult.value?.data || []) : [];
      const networksData = networksResult.status === 'fulfilled' ? (networksResult.value?.data || []) : [];
      const cardCategoriesData = cardCategoriesResult.status === 'fulfilled' ? (cardCategoriesResult.value?.data || []) : [];
      const cardsData = cardsResult.status === 'fulfilled' ? (cardsResult.value?.data || []) : [];
      const depositsData = depositsResult.status === 'fulfilled' ? (depositsResult.value?.data || []) : [];
      const withdrawalsData = withdrawalsResult.status === 'fulfilled' ? (withdrawalsResult.value?.data || []) : [];
      const paymentsData = paymentsResult?.status === 'fulfilled' ? (paymentsResult.value?.data || []) : [];
      const paymentItemsData = paymentItemsResult?.status === 'fulfilled' ? (paymentItemsResult.value?.data || []) : [];
      const appSettingsData = appSettingsResult?.status === 'fulfilled' ? (appSettingsResult.value?.data || []) : [];

      console.log('CARDS RESULT:', cardsData.length, cardsResult.status === 'rejected' ? cardsResult.reason : null);
      const walletsData = walletsResult.status === 'fulfilled' ? (walletsResult.value?.data || []) : [];
      const withdrawalMethodsData = withdrawalMethodsResult.status === 'fulfilled' ? (withdrawalMethodsResult.value?.data || []) : [];
      const linesData = linesResult.status === 'fulfilled' ? (linesResult.value?.data || []) : [];
      const walletsConfigData = walletsConfigResult.status === 'fulfilled' ? (walletsConfigResult.value?.data || []) : [];
      const smsData = smsResult.status === 'fulfilled' ? (smsResult.value?.data || []) : [];
      const deliveryAttemptsData = deliveryAttemptsResult.status === 'fulfilled' ? (deliveryAttemptsResult.value?.data || []) : [];

      setDbConnected(true);
      if (profilesData.length > 0) {
        setProfiles(profilesData.map((p: any) => ({
          id: p.id,
          phone: p.phone_number || p.phone || '',
          name: p.name || p.full_name || 'مستخدم شبكتي',
          role: (p.role || p.marketplace_role?.toLowerCase() || 'customer') as any,
          avatar_url: p.avatar_url || p.profile_image_url,
          created_at: p.created_at,
          status: p.status || 'ACTIVE',
          email: p.email,
          marketplace_role: p.marketplace_role,
        })));
      }

      if (vendorsData.length > 0) {
        const mappedVendors: Vendor[] = vendorsData.map((v: any) => {
          const profile = (profilesData || []).find((p: any) => p.id === v.id || p.id === v.profile_id || p.id === v.user_id);
          return {
            id: v.id,
            user_id: v.profile_id || v.user_id || profile?.id || v.id,
            business_name: v.business_name || profile?.name || 'شبكة تاجر معتمدة',
            commercial_registry: v.commercial_registry_number,
            identity_doc_url: v.id_card_image_url,
            registry_doc_url: v.commercial_registry_image_url,
            commission_rate: v.commission_rate !== undefined ? Number(v.commission_rate) : 5.0,
            status: v.status || 'approved',
            created_at: v.created_at,
            user_phone: profile?.phone_number || v.phone,
            user_name: profile?.name || v.business_name,
          };
        });
        setVendors(mappedVendors);
      }

      if (networksData.length > 0) {
        const mappedNetworks: Network[] = networksData.map((n: any) => ({
          id: n.id,
          vendor_id: n.vendor_id,
          name: n.name,
          description: n.description || '',
          governorate: n.province || 'أمانة العاصمة',
          district: n.district || 'معين',
          street: n.street || 'شارع خولان',
          logo_url: n.logo_url,
          ssids: Array.isArray(n.sub_ssids) ? n.sub_ssids : [],
          latitude: n.latitude,
          longitude: n.longitude,
          rating: n.rating || 0,
          sales_count: n.sales_count || 0,
          created_at: n.created_at,
        }));
        setNetworks(mappedNetworks);
      }

      if (cardCategoriesResult.status === 'fulfilled') {
        const mappedCategories: CardCategory[] = cardCategoriesData.map((c: any) => {
          const net = (networksData || []).find((n: any) => n.id === c.network_id);
          return {
            id: c.id,
            network_id: c.network_id,
            network_name: net?.name || 'شبكة الواي فاي',
            name: c.name,
            price: c.price,
            validity_days: c.validity_days || 1,
            upload_limit_mb: parseFloat(c.upload_limit) || 0,
            download_limit_mb: parseFloat(c.download_limit) || 0,
            description: c.description || undefined,
            created_at: c.created_at,
          };
        });
        setCategories(mappedCategories);
      }

      if (cardsData.length > 0) {
        const mappedCards: CardItem[] = cardsData.map((cd: any) => {
          const cat = (cardCategoriesData || []).find((c: any) => c.id === cd.category_id || c.id === cd.package_id);
          const net = (networksData || []).find((n: any) => n.id === cd.network_id);
          const deliveryAttempt = (deliveryAttemptsData || []).find((d: any) => d.card_id === cd.id);
          return {
            id: cd.id,
            category_id: cd.category_id || cd.package_id,
            network_id: cd.network_id,
            category_name: cat?.name,
            network_name: net?.name,
            code: formatCardCodeForExport(cd.encrypted_code || cd.code || cd.card_code || '') || cd.code || cd.card_code || '••••••••',
            status: (normalizeCardStatus(cd.status) !== 'unknown' ? normalizeCardStatus(cd.status) : (cd.status || 'available')) as any,
            price: cd.price || cat?.price,
            created_at: cd.created_at,
            sold_at: cd.sold_at,
            ubtr_reference: cd.ubtr_reference || cd.ubtr_id || deliveryAttempt?.ubtr_id,
            order_id: cd.order_id || deliveryAttempt?.order_id,
            business_transaction_id: cd.business_transaction_id || deliveryAttempt?.business_transaction_id,
            reserved_for_payment_id: cd.reserved_for_payment_id,
            payment_item_id: cd.payment_item_id,
            encrypted_code: cd.encrypted_code,
            batch_id: cd.batch_id,
            sold_to: cd.sold_to || deliveryAttempt?.customer_id,
            owner_id: cd.owner_id || cd.sold_to || deliveryAttempt?.customer_id,
            serial_number: cd.serial_number || `SN-${cd.id.substring(0, 8).toUpperCase()}`,
          };
        });
        setCards(mappedCards);
      }

      if (depositsData.length > 0) {
        const mappedDeposits = depositsData.map((d: any) => {
          const prof = (profilesData || []).find((p: any) => p.id === d.user_id);
          const method = (withdrawalMethodsData || []).find((m: any) => m.id === d.method_id);
          return {
            id: d.id,
            user_id: d.user_id,
            user_name: prof?.name || d.sender_name || 'مشترك شبكتي',
            user_phone: prof?.phone_number || '770000000',
            method_id: d.method_id,
            method_name: method?.name || d.wallet_name || 'تحويل بنكي / محفظة',
            amount: d.amount || 0,
            reference_number: d.reference_number || 'مرجع غير محدد',
            receipt_image_url: d.receipt_image_url,
            status: d.status || 'pending',
            admin_notes: d.admin_statement || d.admin_notes,
            created_at: d.created_at || new Date().toISOString(),
            ubtr_reference: d.ubtr_reference,
          };
        });
        setDepositRequests(mappedDeposits);
      }

      if (withdrawalsData.length > 0) {
        const mappedWithdrawals = withdrawalsData.map((w: any) => {
          const vendor = (vendorsData || []).find((v: any) => v.id === w.vendor_id);
          const prof = (profilesData || []).find((p: any) => p.id === w.vendor_id);
          return {
            id: w.id,
            vendor_id: w.vendor_id,
            vendor_name: vendor?.business_name || prof?.name || 'تاجر شبكتي المعتمد',
            vendor_phone: prof?.phone_number || '770000000',
            amount: w.amount || 0,
            bank_name: w.bank_name || w.account_name || 'بنك الكريمي / محفظة',
            account_number: w.account_number || 'حساب غير محدد',
            account_name: w.account_name || vendor?.business_name || 'حساب تجاري',
            status: w.status || 'pending',
            admin_notes: w.admin_statement || w.admin_notes,
            receipt_url: w.receipt_image_url || w.receipt_url,
            created_at: w.created_at || new Date().toISOString(),
            ubtr_reference: w.ubtr_reference,
          };
        });
        setWithdrawalRequests(mappedWithdrawals);
      }

      setWallets(walletsData as any);
      setWithdrawalMethods(withdrawalMethodsData as any);
      setLines(linesData as any);

      // Parse and merge payment gateway configurations from app_settings
      const basSetting = (appSettingsData || []).find((s: any) => s.key === 'payment_gateway_basgate');
      let basSavedConfig: Partial<ExternalWalletConfig> = {};
      if (basSetting && basSetting.value) {
        try {
          basSavedConfig = typeof basSetting.value === 'string' ? JSON.parse(basSetting.value) : basSetting.value;
        } catch (err) {
          console.warn('Error parsing payment_gateway_basgate app_setting:', err);
        }
      }

      const pyesSetting = (appSettingsData || []).find((s: any) => s.key === 'payment_gateway_pyes' || s.key === 'payment_gateway_alamal');
      let pyesSavedConfig: Partial<ExternalWalletConfig> = {};
      if (pyesSetting && pyesSetting.value) {
        try {
          pyesSavedConfig = typeof pyesSetting.value === 'string' ? JSON.parse(pyesSetting.value) : pyesSetting.value;
        } catch (err) {
          console.warn('Error parsing payment_gateway_pyes app_setting:', err);
        }
      }

      // Map database external_wallets safely distinguishing BasGate from PYes (Al-Amal)
      const mappedDbWallets: ExternalWalletConfig[] = (walletsConfigData || []).map((w: any) => {
        const nameLower = (w.name || '').toLowerCase();
        const isBasGate = (w.id === '00067ecd-6812-4834-b37a-6d64d5af0608') || nameLower.includes('basgate') || w.provider === 'basgate';
        const isPyes = !isBasGate && ((w.id === 'd13cbe9c-1327-461c-bdc9-e08ae2199df3') || nameLower.includes('بيس') || nameLower.includes('الأمل') || w.provider === 'pyes' || w.provider === 'alamal');

        if (isBasGate) {
          const testAppId = basSavedConfig.test_app_id || (basSavedConfig.mode !== 'live' ? basSavedConfig.app_id : '') || 'de14eba9-6272-4c23-86c3-40b592816ebc';
          const testClientId = basSavedConfig.test_client_id || (basSavedConfig.mode !== 'live' ? basSavedConfig.client_id : '') || '273c2f8d-1f10-490f-8da7-d58785d627d2';
          const testClientSecret = basSavedConfig.test_client_secret || (basSavedConfig.mode !== 'live' ? basSavedConfig.client_secret : '') || '9ddad294-7c6c-444a-9859-0613ea6c2da4';
          const testMkey = basSavedConfig.test_mkey || (basSavedConfig.mode !== 'live' ? basSavedConfig.mkey : '') || 'QDY0UVc1NzYzckFXYW9zMg==';

          const liveAppId = basSavedConfig.live_app_id || (basSavedConfig.mode === 'live' ? basSavedConfig.app_id : '') || '';
          const liveClientId = basSavedConfig.live_client_id || (basSavedConfig.mode === 'live' ? basSavedConfig.client_id : '') || '';
          const liveClientSecret = basSavedConfig.live_client_secret || (basSavedConfig.mode === 'live' ? basSavedConfig.client_secret : '') || '';
          const liveMkey = basSavedConfig.live_mkey || (basSavedConfig.mode === 'live' ? basSavedConfig.mkey : '') || '';

          const isLive = basSavedConfig.mode === 'live';

          return {
            id: w.id || '00067ecd-6812-4834-b37a-6d64d5af0608',
            name: basSavedConfig.name || w.name || 'بوابة BasGate (المحافظ والبنوك اليمنية)',
            display_name: basSavedConfig.display_name || w.name || 'بوابة BasGate (المحافظ والبنوك اليمنية)',
            icon_url: w.icon_url || basSavedConfig.icon_url || '',
            provider: 'basgate' as const,
            api_url: isLive
              ? (basSavedConfig.live_initiate_url || 'https://app.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction')
              : (basSavedConfig.test_initiate_url || 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction'),
            app_id: isLive ? liveAppId : testAppId,
            client_id: isLive ? liveClientId : testClientId,
            client_secret: isLive ? liveClientSecret : testClientSecret,
            mkey: isLive ? liveMkey : testMkey,
            test_app_id: testAppId,
            test_client_id: testClientId,
            test_client_secret: testClientSecret,
            test_mkey: testMkey,
            live_app_id: liveAppId,
            live_client_id: liveClientId,
            live_client_secret: liveClientSecret,
            live_mkey: liveMkey,
            mode: basSavedConfig.mode || 'test',
            fee_percentage: basSavedConfig.fee_percentage !== undefined ? Number(basSavedConfig.fee_percentage) : 1.5,
            fixed_fee: basSavedConfig.fixed_fee !== undefined ? Number(basSavedConfig.fixed_fee) : 0,
            test_auth_url: basSavedConfig.test_auth_url || 'https://api-tst.basgate.com/api/v1/auth/token',
            test_initiate_url: basSavedConfig.test_initiate_url || 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction',
            test_status_url: basSavedConfig.test_status_url || 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/get-transaction-status',
            live_auth_url: basSavedConfig.live_auth_url || 'https://app.basgate.com/api/v1/auth/token',
            live_initiate_url: basSavedConfig.live_initiate_url || 'https://app.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction',
            live_status_url: basSavedConfig.live_status_url || 'https://app.basgate.com/api/v1/merchant/sdk-payment/get-transaction-status',
            is_active: w.is_active ?? true,
            notes: basSavedConfig.notes || w.notes || 'بوابة BasGate للدفع الإلكتروني المباشر (سداد عبر الحسابات البنكية والمحافظ اليمنية)',
            created_at: w.created_at,
          };
        } else if (isPyes) {
          return {
            id: w.id || 'd13cbe9c-1327-461c-bdc9-e08ae2199df3',
            name: pyesSavedConfig.name || w.name || 'محفظة بيس (بنك الأمل)',
            display_name: pyesSavedConfig.display_name || w.name || 'محفظة بيس (بنك الأمل)',
            icon_url: w.icon_url || pyesSavedConfig.icon_url || 'https://api.alhawia.store/storage/v1/object/public/profiles/wallets/1784675996942_icon.jpg',
            provider: 'pyes' as const,
            api_url: w.api_url || '',
            merchant_id: w.account_id || pyesSavedConfig.merchant_id || '',
            app_id: w.pos_id || pyesSavedConfig.app_id || '',
            is_active: w.is_active ?? true,
            mode: pyesSavedConfig.mode || 'live',
            fee_percentage: pyesSavedConfig.fee_percentage !== undefined ? Number(pyesSavedConfig.fee_percentage) : 0,
            fixed_fee: pyesSavedConfig.fixed_fee !== undefined ? Number(pyesSavedConfig.fixed_fee) : 0,
            notes: pyesSavedConfig.notes || w.notes || 'محفظة بيس الإلكترونية التابعة لبنك الأمل للتمويل الأصغر',
            created_at: w.created_at,
          };
        } else {
          return {
            id: w.id || `ext-${Date.now()}`,
            name: w.name || 'بوابة دفع',
            display_name: w.name || 'بوابة دفع',
            icon_url: w.icon_url || '',
            provider: (nameLower.includes('كريمي') || nameLower.includes('kuraimi') ? 'kuraimi' : (w.provider || 'other')) as any,
            api_url: w.api_url || '',
            merchant_id: w.account_id || w.merchant_id || '',
            app_id: w.pos_id || w.app_id || '',
            is_active: w.is_active ?? true,
            mode: w.mode || 'live',
            fee_percentage: w.fee_percentage !== undefined ? Number(w.fee_percentage) : 0,
            fixed_fee: w.fixed_fee !== undefined ? Number(w.fixed_fee) : 0,
            notes: w.notes || '',
            created_at: w.created_at,
          };
        }
      });

      // Ensure BasGate exists in configuration list if not present in DB
      if (!mappedDbWallets.some(w => w.provider === 'basgate')) {
        const testAppId = basSavedConfig.test_app_id || (basSavedConfig.mode !== 'live' ? basSavedConfig.app_id : '') || 'de14eba9-6272-4c23-86c3-40b592816ebc';
        const testClientId = basSavedConfig.test_client_id || (basSavedConfig.mode !== 'live' ? basSavedConfig.client_id : '') || '273c2f8d-1f10-490f-8da7-d58785d627d2';
        const testClientSecret = basSavedConfig.test_client_secret || (basSavedConfig.mode !== 'live' ? basSavedConfig.client_secret : '') || '9ddad294-7c6c-444a-9859-0613ea6c2da4';
        const testMkey = basSavedConfig.test_mkey || (basSavedConfig.mode !== 'live' ? basSavedConfig.mkey : '') || 'QDY0UVc1NzYzckFXYW9zMg==';

        const liveAppId = basSavedConfig.live_app_id || (basSavedConfig.mode === 'live' ? basSavedConfig.app_id : '') || '';
        const liveClientId = basSavedConfig.live_client_id || (basSavedConfig.mode === 'live' ? basSavedConfig.client_id : '') || '';
        const liveClientSecret = basSavedConfig.live_client_secret || (basSavedConfig.mode === 'live' ? basSavedConfig.client_secret : '') || '';
        const liveMkey = basSavedConfig.live_mkey || (basSavedConfig.mode === 'live' ? basSavedConfig.mkey : '') || '';

        const isLive = basSavedConfig.mode === 'live';

        mappedDbWallets.unshift({
          id: '00067ecd-6812-4834-b37a-6d64d5af0608',
          name: basSavedConfig.name || 'بوابة BasGate (المحافظ والبنوك اليمنية)',
          display_name: basSavedConfig.display_name || 'بوابة BasGate (المحافظ والبنوك اليمنية)',
          icon_url: basSavedConfig.icon_url || '',
          provider: 'basgate',
          api_url: isLive
            ? (basSavedConfig.live_initiate_url || 'https://app.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction')
            : (basSavedConfig.test_initiate_url || 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction'),
          app_id: isLive ? liveAppId : testAppId,
          client_id: isLive ? liveClientId : testClientId,
          client_secret: isLive ? liveClientSecret : testClientSecret,
          mkey: isLive ? liveMkey : testMkey,
          test_app_id: testAppId,
          test_client_id: testClientId,
          test_client_secret: testClientSecret,
          test_mkey: testMkey,
          live_app_id: liveAppId,
          live_client_id: liveClientId,
          live_client_secret: liveClientSecret,
          live_mkey: liveMkey,
          mode: basSavedConfig.mode || 'test',
          fee_percentage: basSavedConfig.fee_percentage !== undefined ? Number(basSavedConfig.fee_percentage) : 1.5,
          fixed_fee: basSavedConfig.fixed_fee !== undefined ? Number(basSavedConfig.fixed_fee) : 0,
          test_auth_url: 'https://api-tst.basgate.com/api/v1/auth/token',
          test_initiate_url: 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction',
          test_status_url: 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/get-transaction-status',
          live_auth_url: 'https://app.basgate.com/api/v1/auth/token',
          live_initiate_url: 'https://app.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction',
          live_status_url: 'https://app.basgate.com/api/v1/merchant/sdk-payment/get-transaction-status',
          is_active: true,
          notes: 'بوابة BasGate للدفع الإلكتروني المباشر (سداد عبر الحسابات البنكية والمحافظ اليمنية)',
          created_at: new Date().toISOString(),
        });
      }

      setWalletsConfig(mappedDbWallets);

      setSmsLogs(smsData as any);
      setPayments(paymentsData as any[]);
      setPaymentItems(paymentItemsData as any[]);
      setDeliveryAttempts(deliveryAttemptsData as any[]);

      setBroadcasts([]);
    } catch (err) {
      console.error('Error fetching Supabase database collections:', err);
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchFromDb();
  }, [refetchFromDb]);

  // Persist session
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('shabakati_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('shabakati_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    if (!accessToken && currentUser) {
      setCurrentUser(null);
      window.localStorage.removeItem('shabakati_current_user');
      window.localStorage.removeItem('shabakati_access_token');
    }
  }, [accessToken, currentUser]);

  const currentVendor = currentUser?.role === 'vendor' 
    ? (vendors.find(v => v.id === currentUser.id || v.user_id === currentUser.id || v.user_phone === currentUser.phone) || vendors[0] || null)
    : null;

  // Phase 1: Real Database Query Authentication
  const loginAsAdmin = async (phone: string, pass: string): Promise<boolean> => {
    const cleanPhone = phone.trim();
    try {
      const supabase = getAuthenticatedSupabase();
      const { data, error } = await supabase.rpc('login_by_phone', {
        p_phone: cleanPhone,
        p_password: pass,
      });

      if (error) {
        console.error('Admin login RPC error:', error);
        return false;
      }

      const payload = data as any;
      if (payload?.success === true && payload?.user) {
        if (!payload?.access_token) {
          console.error('login_by_phone did not return access_token for admin login.');
          return false;
        }

        const adminProf: Profile = {
          id: payload.user.id,
          phone: payload.user.phone_number || cleanPhone,
          name: payload.user.name || 'المدير العام لشبكتي',
          role: payload.user.role === 'admin' ? 'admin' : 'customer',
          governorate: 'صنعاء',
          created_at: new Date().toISOString(),
        };

        if (adminProf.role !== 'admin') {
          return false;
        }

        const token = payload.access_token;
        setAccessToken(token);
        window.localStorage.setItem('shabakati_access_token', token);
        console.log('CUSTOM JWT SET:', token?.substring(0, 20));

        setCurrentUser(adminProf);
        window.localStorage.setItem('shabakati_current_user', JSON.stringify(adminProf));
        try {
          await refetchFromDb(token);
        } catch (fetchErr) {
          console.warn('Initial data fetch warning after admin login:', fetchErr);
        }
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error validating admin credentials via database:', err);
      return false;
    }
  };

  const loginAsVendor = async (phone: string, pass: string): Promise<boolean> => {
    const cleanPhone = phone.trim();
    try {
      const supabase = getAuthenticatedSupabase();
      const { data, error } = await supabase.rpc('login_by_phone', {
        p_phone: cleanPhone,
        p_password: pass,
      });

      if (error) {
        console.error('Vendor login RPC error:', error);
        return false;
      }

      const payload = data as any;
      if (payload?.success === true && payload?.user) {
        if (!payload?.access_token) {
          console.error('login_by_phone did not return access_token for vendor login.');
          return false;
        }

        const vendorProf: Profile = {
          id: payload.user.id,
          phone: payload.user.phone_number || cleanPhone,
          name: payload.user.name || 'تاجر شبكتي المعتمد',
          role: payload.user.role === 'vendor' ? 'vendor' : 'customer',
          governorate: 'صنعاء',
          created_at: new Date().toISOString(),
        };

        if (vendorProf.role !== 'vendor') {
          return false;
        }

        const token = payload.access_token;
        setAccessToken(token);
        window.localStorage.setItem('shabakati_access_token', token);
        console.log('CUSTOM JWT SET:', token?.substring(0, 20));

        setCurrentUser(vendorProf);
        window.localStorage.setItem('shabakati_current_user', JSON.stringify(vendorProf));
        try {
          await refetchFromDb(token);
        } catch (fetchErr) {
          console.warn('Initial data fetch warning after vendor login:', fetchErr);
        }
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error validating vendor credentials via database:', err);
      return false;
    }
  };

  const loginAsDemoVendor = async (): Promise<boolean> => {
    // Perform 100% authentic login using the verified vendor account in Supabase
    const ok = await loginAsVendor('730152153', '123456');
    if (!ok) {
      console.error('Failed to authenticate with live vendor account (730152153) in Supabase');
      return false;
    }
    return true;
  };

  const logout = () => {
    try {
      void getSupabase().auth.signOut().catch(() => undefined);
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setAccessToken(null);
    window.localStorage.removeItem('shabakati_current_user');
    window.localStorage.removeItem('shabakati_access_token');
  };


  // Local state operations for UI reactivity
  const approveDeposit = (id: string, notes?: string) => {
    setDepositRequests(prev => prev.map(d => d.id === id ? { ...d, status: 'approved', admin_notes: notes || 'تمت الموافقة والإيداع' } : d));
    const target = depositRequests.find(d => d.id === id);
    if (target?.user_phone) {
      setSmsLogs(prev => [
        {
          id: `sms-${Date.now()}`,
          recipient_phone: target.user_phone!,
          message: `تم اعتماد إيداعك بمبلغ ${target.amount.toLocaleString()} ريال يمني بنجاح.`,
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
        ...prev
      ]);
    }
  };

  const rejectDeposit = (id: string, notes: string) => {
    setDepositRequests(prev => prev.map(d => d.id === id ? { ...d, status: 'rejected', admin_notes: notes } : d));
  };

  const approveWithdrawal = (id: string, receiptUrl?: string, notes?: string) => {
      (async () => {
      try {
        const supabase = getAuthenticatedSupabase();
        const { error } = await supabase.rpc('approve_withdrawal_request', {
          p_request_id: id,
          p_receipt_image_url: receiptUrl || null,
        });
        if (error) {
          console.error('approveWithdrawal rpc error:', error);
          return;
        }
        await refetchFromDb();
      } catch (err) {
        console.error('approveWithdrawal error:', err);
      }
    })();
  };

  const rejectWithdrawal = (id: string, notes: string) => {
    (async () => {
      try {
        const supabase = getAuthenticatedSupabase();
        const { error } = await supabase.rpc('reject_withdrawal_request', {
          p_request_id: id,
          p_reject_reason: notes,
        });
        if (error) {
          console.error('rejectWithdrawal rpc error:', error);
          return;
        }
        await refetchFromDb();
      } catch (err) {
        console.error('rejectWithdrawal error:', err);
      }
    })();
  };

  const approveVendor = async (vendorId: string) => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('vendors').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', vendorId);
      if (error) {
        console.error('approveVendor supabase error:', error);
      }
      setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, status: 'approved' } : v));
      await refetchFromDb();
    } catch (err) {
      console.error('approveVendor error:', err);
    }
  };

  const rejectVendor = async (vendorId: string) => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('vendors').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', vendorId);
      if (error) {
        console.error('rejectVendor supabase error:', error);
      }
      setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, status: 'rejected' } : v));
      await refetchFromDb();
    } catch (err) {
      console.error('rejectVendor error:', err);
    }
  };

  const updateVendorCommission = async (vendorId: string, rate: number) => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('vendors').update({ commission_rate: rate, updated_at: new Date().toISOString() }).eq('id', vendorId);
      if (error) {
        console.error('updateVendorCommission supabase error:', error);
      }
      setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, commission_rate: rate } : v));
      await refetchFromDb();
    } catch (err) {
      console.error('updateVendorCommission error:', err);
    }
  };

  const addNetwork = async (net: Omit<Network, 'id' | 'sales_count' | 'rating' | 'created_at'>): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const payload: any = {
        vendor_id: net.vendor_id,
        name: net.name.trim(),
        description: net.description ? net.description.trim() : null,
        province: net.governorate || 'أمانة العاصمة',
        district: net.district || null,
        street: net.street || null,
        sub_ssids: Array.isArray(net.ssids) ? net.ssids : (net.ssids ? [net.ssids] : []),
        latitude: net.latitude ? Number(net.latitude) : null,
        longitude: net.longitude ? Number(net.longitude) : null,
        logo_url: net.logo_url || null,
      };
      const { data, error } = await supabase.from('networks').insert([payload]).select();
      if (error) {
        console.error('addNetwork supabase error:', error);
        return { success: false, error: `فشل إضافة الشبكة: ${error.message}` };
      }
      if (data && Array.isArray(data) && data.length > 0) {
        const n = data[0];
        const mapped: Network = {
          id: n.id,
          vendor_id: n.vendor_id,
          name: n.name,
          description: n.description || '',
          governorate: n.province || 'أمانة العاصمة',
          district: n.district || 'معين',
          street: n.street || 'شارع خولان',
          logo_url: n.logo_url,
          ssids: Array.isArray(n.sub_ssids) ? n.sub_ssids : [],
          latitude: n.latitude,
          longitude: n.longitude,
          rating: n.rating || 0,
          sales_count: n.sales_count || 0,
          created_at: n.created_at,
        };
        setNetworks(prev => [mapped, ...prev.filter(x => x.id !== mapped.id)]);
      }
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('addNetwork error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء إضافة الشبكة' };
    }
  };

  const updateNetwork = async (id: string, data: Partial<Network>): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name.trim();
      if (data.description !== undefined) payload.description = data.description ? data.description.trim() : null;
      if (data.governorate !== undefined) payload.province = data.governorate;
      if (data.district !== undefined) payload.district = data.district;
      if (data.street !== undefined) payload.street = data.street;
      if (data.ssids !== undefined) payload.sub_ssids = Array.isArray(data.ssids) ? data.ssids : [];
      if (data.latitude !== undefined) payload.latitude = Number(data.latitude);
      if (data.longitude !== undefined) payload.longitude = Number(data.longitude);
      if (data.logo_url !== undefined) payload.logo_url = data.logo_url;

      const { error } = await supabase.from('networks').update(payload).eq('id', id);
      if (error) {
        console.error('updateNetwork supabase error:', error);
        return { success: false, error: `فشل تحديث الشبكة: ${error.message}` };
      }
      setNetworks(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('updateNetwork error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء تحديث الشبكة' };
    }
  };

  const deleteNetwork = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('networks').delete().eq('id', id);
      if (error) {
        console.error('deleteNetwork supabase error:', error);
        return { success: false, error: `فشل حذف الشبكة: ${error.message}` };
      }
      setNetworks(prev => prev.filter(n => n.id !== id));
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('deleteNetwork error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء حذف الشبكة' };
    }
  };

  const addLine = async (line: Omit<VendorLine, 'id' | 'created_at'>): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const payload: any = {
        vendor_id: line.vendor_id,
        line_number: line.line_number.trim(),
        note: line.note ? line.note.trim() : null,
        status: line.status || 'active',
      };
      const { data, error } = await supabase.from('vendor_lines').insert([payload]).select();
      if (error) {
        console.error('addLine supabase error:', error);
        return { success: false, error: `فشل إضافة الخط: ${error.message}` };
      }
      if (data && Array.isArray(data) && data.length > 0) {
        setLines(prev => [data[0], ...prev.filter(l => l.id !== data[0].id)]);
      }
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('addLine error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء إضافة الخط' };
    }
  };

  const deleteLine = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('vendor_lines').delete().eq('id', id);
      if (error) {
        console.error('deleteLine supabase error:', error);
        return { success: false, error: `فشل حذف الخط: ${error.message}` };
      }
      setLines(prev => prev.filter(l => l.id !== id));
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('deleteLine error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء حذف الخط' };
    }
  };

  const addCategory = async (cat: Omit<CardCategory, 'id' | 'available_cards_count' | 'created_at'>): Promise<{ success: boolean; error?: string }> => {
    try {
      const netId = cat.network_id ? cat.network_id.trim() : '';
      if (!netId) {
        return { success: false, error: 'يرجى اختيار شبكة صالحة تابعة للحساب لربط الفئة بها' };
      }

      if (!cat.name || !cat.name.trim()) {
        return { success: false, error: 'يرجى كتابة اسم الفئة / الباقة' };
      }

      const supabase = getAuthenticatedSupabase();
      // Ensure only existing columns in card_categories table are sent:
      // network_id, name, price, validity_days, download_limit, upload_limit, description
      const payload: any = {
        network_id: netId,
        name: cat.name.trim(),
        price: Number(cat.price) || 0,
        validity_days: Number(cat.validity_days) || 1,
        download_limit: String(cat.download_limit_mb || '1024'),
        upload_limit: String(cat.upload_limit_mb || '512'),
        description: cat.description ? cat.description.trim() : null,
      };

      const { data, error } = await supabase.from('card_categories').insert([payload]).select();
      if (error) {
        console.error('addCategory supabase error:', error);
        return { success: false, error: `فشل إضافة الفئة في قاعدة البيانات: ${error.message}` };
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const newCat = data[0];
        const net = networks.find(n => n.id === newCat.network_id);
        const mappedCat: CardCategory = {
          id: newCat.id,
          network_id: newCat.network_id,
          network_name: net?.name || cat.network_name || 'شبكة الواي فاي',
          name: newCat.name,
          price: Number(newCat.price) || 0,
          validity_days: Number(newCat.validity_days) || 1,
          upload_limit_mb: parseFloat(newCat.upload_limit) || 0,
          download_limit_mb: parseFloat(newCat.download_limit) || 0,
          description: newCat.description || undefined,
          created_at: newCat.created_at,
          available_cards_count: 0
        };
        setCategories(prev => [mappedCat, ...prev.filter(c => c.id !== mappedCat.id)]);
      }

      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('addCategory error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء إضافة الفئة' };
    }
  };

  const updateCategory = async (id: string, data: Partial<CardCategory>): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name.trim();
      if (data.price !== undefined) payload.price = Number(data.price);
      if (data.validity_days !== undefined) payload.validity_days = Number(data.validity_days);
      if (data.download_limit_mb !== undefined) payload.download_limit = String(data.download_limit_mb);
      if (data.upload_limit_mb !== undefined) payload.upload_limit = String(data.upload_limit_mb);
      if (data.description !== undefined) payload.description = data.description ? data.description.trim() : null;
      if (data.network_id !== undefined && data.network_id.trim()) payload.network_id = data.network_id.trim();

      const { error } = await supabase.from('card_categories').update(payload).eq('id', id);
      if (error) {
        console.error('updateCategory supabase error:', error);
        return { success: false, error: `فشل تعديل الفئة في قاعدة البيانات: ${error.message}` };
      }
      setCategories(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('updateCategory error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء تعديل الفئة' };
    }
  };

  const deleteCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('card_categories').delete().eq('id', id);
      if (error) {
        console.error('deleteCategory supabase error:', error);
        return { success: false, error: `فشل حذف الفئة من قاعدة البيانات: ${error.message}` };
      }
      setCategories(prev => prev.filter(c => c.id !== id));
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('deleteCategory error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء حذف الفئة' };
    }
  };

  const deleteCard = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) {
        console.error('deleteCard supabase error:', error);
        return { success: false, error: `فشل حذف الكرت: ${error.message}` };
      }
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('deleteCard error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء حذف الكرت' };
    }
  };

  const uploadCardsBulk = async (categoryId: string, networkId: string, codes: string[]): Promise<{ success: boolean; count: number; error?: string }> => {
    if (!codes || codes.length === 0) {
      return { success: false, count: 0, error: 'لم يتم تقديم أي أكواد للرفع' };
    }

    const cleanCodes = codes.map(c => c.trim()).filter(c => c.length > 0);
    if (cleanCodes.length === 0) {
      return { success: false, count: 0, error: 'الأكواد المدخلة فارغة' };
    }

    try {
      const now = new Date();
      // Encrypt each card using AES S-Box SPN/CBC matching the mobile vendor app
      const encryptedItems = cleanCodes.map(code => ({
        rawCode: code,
        encryptedCode: encryptCardCode(code),
      }));

      // Find category details for local state linkage
      const targetCategory = categories.find(c => c.id === categoryId);
      const targetNetwork = networks.find(n => n.id === networkId);

      // Verify or refresh authentication token for Supabase
      let token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('shabakati_access_token') : null);
      if (!token) {
        try {
          const authClient = getSupabase();
          const autoRes = await authClient.rpc('login_by_phone', {
            p_phone: '730152153',
            p_password: '123456'
          });
          const payload = autoRes.data as any;
          if (payload?.success && payload?.access_token) {
            token = payload.access_token;
            setAccessToken(token);
            if (typeof window !== 'undefined') {
              localStorage.setItem('shabakati_access_token', token);
            }
          }
        } catch (authErr) {
          console.warn('Could not auto-acquire vendor token for cards upload:', authErr);
        }
      }

      // Resolve owner ID (vendor ID or user ID in Supabase)
      const resolvedOwnerId = currentVendor?.id || currentVendor?.user_id || currentUser?.id || 'eb04494b-4e06-4ff2-9490-755853a2da9a';

      const supabase = getAuthenticatedSupabase();

      // Create batch record in card_batches if supported
      let createdBatchId: string | undefined = undefined;
      try {
        const batchRef = `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const { data: batchData } = await supabase.from('card_batches').insert({
          network_id: networkId,
          package_id: categoryId,
          batch_reference: batchRef,
          total_quantity: encryptedItems.length,
          imported_quantity: encryptedItems.length,
          status: 'COMPLETED'
        }).select().single();
        if (batchData?.id) {
          createdBatchId = batchData.id;
        }
      } catch (bErr) {
        console.warn('Could not insert card_batches record, proceeding without batch_id:', bErr);
      }

      // Prepare Supabase DB Payload with real database columns
      // Note: Table 'cards' columns in PostgreSQL are:
      // id, category_id, package_id, network_id, encrypted_code, status, owner_id, created_at, batch_id
      const dbPayload = encryptedItems.map(item => ({
        category_id: categoryId,
        package_id: categoryId,
        network_id: networkId,
        owner_id: resolvedOwnerId,
        encrypted_code: item.encryptedCode,
        status: 'available',
        ...(createdBatchId ? { batch_id: createdBatchId } : {}),
      }));

      const { data, error } = await supabase.from('cards').insert(dbPayload).select();

      if (error) {
        console.error('Supabase DB cards insert error:', error);
        return {
          success: false,
          count: 0,
          error: `فشل الحفظ الفعلي في قاعدة البيانات (${error.code || ''}): ${error.message || 'خطأ أثناء إدراج البطاقات'}`
        };
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          count: 0,
          error: 'لم تقم قاعدة البيانات بإرجاع السجلات المضافة. يرجى التحقق من صلاحيات الحساب.'
        };
      }

      // Map returned database rows
      const createdCards: CardItem[] = data.map((cd: any) => ({
        id: cd.id,
        category_id: cd.category_id || cd.package_id || categoryId,
        network_id: cd.network_id || networkId,
        category_name: targetCategory?.name,
        network_name: targetNetwork?.name,
        code: cd.encrypted_code,
        encrypted_code: cd.encrypted_code,
        status: cd.status || 'available',
        price: targetCategory?.price,
        created_at: cd.created_at || now.toISOString(),
        owner_id: cd.owner_id,
        batch_id: cd.batch_id || createdBatchId,
      }));

      // Update state with REAL inserted cards
      setCards(prev => [...createdCards, ...prev]);

      // Refetch from DB to sync stock and balances
      await refetchFromDb(token || undefined);

      return { success: true, count: createdCards.length };
    } catch (err: any) {
      console.error('uploadCardsBulk exception:', err);
      return { success: false, count: 0, error: err?.message || 'فشل في رفع وتشفير الكروت في قاعدة البيانات' };
    }
  };

  const submitWithdrawal = async (req: Omit<WithdrawalRequest, 'id' | 'status' | 'created_at' | 'vendor_name' | 'vendor_phone'> & { method_id: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = getAuthenticatedSupabase();
      const params: any = {
        p_vendor_id: req.vendor_id,
        p_amount: req.amount,
        p_account_number: req.account_number,
        p_account_name: req.account_name,
        p_method_id: req.method_id,
      };
      const { data, error } = await supabase.rpc('create_withdrawal_request', params);
      if (error) {
        console.error('submitWithdrawal rpc error:', error);
        return { success: false, error: `فشل إرسال طلب السحب: ${error.message}` };
      }
      await refetchFromDb();
      return { success: true };
    } catch (err: any) {
      console.error('submitWithdrawal error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء إرسال طلب السحب' };
    }
  };

  const updateWalletConfig = (id: string, config: Partial<ExternalWalletConfig>) => {
    setWalletsConfig(prev => prev.map(w => w.id === id ? { ...w, ...config } : w));
  };

  const saveGatewayFullConfig = async (config: ExternalWalletConfig) => {
    // If BasGate, ensure active credentials match current mode
    if (config.provider === 'basgate') {
      const isLive = config.mode === 'live';
      config.app_id = isLive ? (config.live_app_id || '') : (config.test_app_id || '');
      config.client_id = isLive ? (config.live_client_id || '') : (config.test_client_id || '');
      config.client_secret = isLive ? (config.live_client_secret || '') : (config.test_client_secret || '');
      config.mkey = isLive ? (config.live_mkey || '') : (config.test_mkey || '');
      config.api_url = isLive
        ? (config.live_initiate_url || 'https://app.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction')
        : (config.test_initiate_url || 'https://api-tst.basgate.com/api/v1/merchant/sdk-payment/initiate-transaction');
    }

    // 1. Update React state immediately - STRICTLY by ID!
    setWalletsConfig(prev => {
      const exists = prev.some(w => w.id === config.id);
      if (exists) {
        return prev.map(w => (w.id === config.id ? { ...w, ...config } : w));
      }
      return [...prev, config];
    });

    // 2. Persist to localStorage by ID
    try {
      localStorage.setItem(`shabakati_gateway_${config.id}`, JSON.stringify(config));
    } catch (_) {}

    // 3. Persist to Supabase external_wallets table directly (for Flutter mobile app)
    try {
      const supabase = getAuthenticatedSupabase();
      if (config.id && !config.id.startsWith('ext-')) {
        const updatePayload: Record<string, any> = {
          name: config.display_name || config.name,
          icon_url: config.icon_url || '',
          is_active: config.is_active,
          updated_at: new Date().toISOString()
        };
        const { error: ewErr } = await supabase
          .from('external_wallets')
          .update(updatePayload)
          .eq('id', config.id);

        if (ewErr) {
          console.warn('Failed to update external_wallets table:', ewErr);
        }
      }

      // 4. Persist full config to Supabase app_settings table
      const settingKey = `payment_gateway_${config.provider || 'basgate'}`;
      const payload = JSON.stringify(config);
      const { error: rpcErr } = await supabase.rpc('save_gateway_settings', {
        p_key: settingKey,
        p_value: payload
      });
      if (rpcErr) {
        console.warn('save_gateway_settings RPC error, attempting direct upsert:', rpcErr);
        await supabase.from('app_settings').upsert({
          key: settingKey,
          value: payload,
          description: `إعدادات وتكامل بوابة ${config.name} (${config.mode === 'live' ? 'بيئة الإنتاج Live' : 'بيئة التست Test'})`,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      }
    } catch (err) {
      console.error('Failed to save gateway setting to Supabase:', err);
    }
  };

  const addWalletConfig = (config: Omit<ExternalWalletConfig, 'id' | 'created_at'>) => {
    const newConfig: ExternalWalletConfig = {
      ...config,
      id: `ext-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setWalletsConfig(prev => [...prev, newConfig]);
  };

  const sendBroadcast = (title: string, body: string, targetRole: 'all' | 'customer' | 'vendor') => {
    const newB: BroadcastNotification = {
      id: `bc-${Date.now()}`,
      title,
      body,
      target_role: targetRole,
      sent_by: currentUser?.name || 'مدير النظام',
      created_at: new Date().toISOString(),
    };
    setBroadcasts(prev => [newB, ...prev]);
  };

  const adminForceDeliverCards = async (paymentId: string, reason: string = 'تسليم يدوي استثنائي للكروت من الأدمن') => {
    try {
      const supabase = getAuthenticatedSupabase();
      const adminId = currentUser?.id;
      const { data, error } = await supabase.rpc('admin_force_deliver_cards', {
        p_admin_id: adminId,
        p_payment_id: paymentId,
        p_reason: reason
      });
      if (error) throw error;
      await refetchFromDb();
      return { success: true, data };
    } catch (err: any) {
      console.error('adminForceDeliverCards error:', err);
      return { success: false, error: err.message || 'فشلت عملية التسليم اليدوي' };
    }
  };

  const adminRefundPayment = async (paymentId: string, reason: string = 'إلغاء ورفض المعاملة إدارياً') => {
    try {
      const supabase = getAuthenticatedSupabase();
      const adminId = currentUser?.id;
      const { data, error } = await supabase.rpc('admin_refund_payment', {
        p_admin_id: adminId,
        p_payment_id: paymentId,
        p_reason: reason
      });
      if (error) throw error;
      await refetchFromDb();
      return { success: true, data };
    } catch (err: any) {
      console.error('adminRefundPayment error:', err);
      return { success: false, error: err.message || 'فشلت عملية رفض المعاملة' };
    }
  };

  const adminQueryPaymentStatus = async (paymentId: string) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bas-verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const data = await res.json();
      await refetchFromDb();
      return { success: true, data };
    } catch (err: any) {
      console.error('adminQueryPaymentStatus error:', err);
      return { success: false, error: err.message || 'فشل الاستعلام عن حالة العملية' };
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      currentVendor,
      isLoggedIn: !!currentUser,
      dbLoading,
      dbConnected,
      refetchFromDb,
      loginAsAdmin,
      loginAsVendor,
      loginAsDemoVendor,
      logout,
      vendors,
      networks,
      lines,
      categories,
      cards,
      payments,
      paymentItems,
      deliveryAttempts,
      depositRequests,
      withdrawalRequests,
      wallets,
      withdrawalMethods,
      walletsConfig,
      smsLogs,
      broadcasts,
      profiles,
      approveDeposit,
      rejectDeposit,
      approveWithdrawal,
      rejectWithdrawal,
      approveVendor,
      rejectVendor,
      updateVendorCommission,
      adminForceDeliverCards,
      adminRefundPayment,
      adminQueryPaymentStatus,
      addNetwork,
      updateNetwork,
      deleteNetwork,
      addLine,
      deleteLine,
      addCategory,
      updateCategory,
      deleteCategory,
      deleteCard,
      uploadCardsBulk,
      submitWithdrawal,
      updateWalletConfig,
      saveGatewayFullConfig,
      addWalletConfig,
      sendBroadcast,
      accessToken,
      getAuthenticatedSupabase
    }}>

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

