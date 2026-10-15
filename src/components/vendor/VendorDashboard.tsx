import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Wallet, Eye, EyeOff, PlusCircle, ShoppingBag, 
  Calendar, CreditCard, Package, TrendingUp, ChevronLeft, ArrowUpRight,
  Percent, ShieldCheck, Clock
} from 'lucide-react';
import { isCardSold, isCardAvailable } from '../../lib/cardStatusUtils';
import { calculateCommissionBreakdown } from '../../lib/commissionUtils';

interface VendorDashboardProps {
  onNavigateTab: (tabId: string) => void;
}

export const VendorDashboard: React.FC<VendorDashboardProps> = ({ onNavigateTab }) => {
  const { currentUser, currentVendor, wallets, networks, cards } = useAuth();
  const [obscureBalance, setObscureBalance] = useState(false);

  const vendorId = currentVendor?.id || '';
  const vendorUserId = currentVendor?.user_id || currentUser?.id || '';

  // Safe wallet resolution across user_id, vendor_id, or wallet_id
  const vendorWallet = wallets.find(w => 
    (vendorUserId && w.user_id === vendorUserId) ||
    (vendorId && (w.user_id === vendorId || w.id === vendorId))
  );

  const rawBalance = vendorWallet?.balance || 0;
  const heldBalance = vendorWallet?.held_balance || 0;
  const walletBalance = Math.max(0, rawBalance - heldBalance);

  // Safe network resolution
  const vendorNetworks = networks.filter(n => 
    (vendorId && n.vendor_id === vendorId) || 
    (vendorUserId && n.vendor_id === vendorUserId)
  );

  const vendorCards = vendorNetworks.length 
    ? cards.filter(c => vendorNetworks.some(n => n.id === c.network_id)) 
    : [];

  const soldCards = vendorCards.filter(isCardSold);
  const availableCards = vendorCards.filter(isCardAvailable);

  const commissionRate = currentVendor?.commission_rate !== undefined ? currentVendor.commission_rate : 5.0;

  // Yemen Timezone UTC+3 calculations
  const now = new Date();
  const yemenOffsetMs = 3 * 3600 * 1000;
  const yemenNow = new Date(now.getTime() + yemenOffsetMs);
  const yemenStartOfToday = new Date(Date.UTC(yemenNow.getUTCFullYear(), yemenNow.getUTCMonth(), yemenNow.getUTCDate()) - yemenOffsetMs);

  let todayGrossSales = 0;
  let todayNetEarnings = 0;
  let todayCommissionDeducted = 0;
  let todayOpsCount = 0;

  // 7-Day Net Performance array: [Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday]
  const dailyPerformance = [0, 0, 0, 0, 0, 0, 0];

  soldCards.forEach(card => {
    const cardPrice = card.price || 0;
    const breakdown = calculateCommissionBreakdown(cardPrice, commissionRate);

    if (card.sold_at) {
      const soldDate = new Date(card.sold_at);
      if (!isNaN(soldDate.getTime())) {
        if (soldDate >= yemenStartOfToday) {
          todayGrossSales += cardPrice;
          todayNetEarnings += breakdown.vendorNetAmount;
          todayCommissionDeducted += breakdown.commissionAmount;
          todayOpsCount += 1;
        }

        const diffDays = Math.floor((now.getTime() - soldDate.getTime()) / (1000 * 3600 * 24));
        if (diffDays < 7) {
          const dayIdx = Math.floor(soldDate.getDay()) % 7;
          dailyPerformance[dayIdx] += breakdown.vendorNetAmount;
        }
      }
    }
  });

  const maxDaily = Math.max(1, ...dailyPerformance);
  const weekDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return (
    <div className="space-y-6 dir-rtl">
      {/* Primary Blue Balance Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white shadow-2xl relative overflow-hidden">
        {/* Background Overlay Effect */}
        <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-sm text-blue-100 font-medium">الرصيد المتاح القابل للسحب</span>
              <button
                onClick={() => setObscureBalance(!obscureBalance)}
                className="p-1 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition-colors cursor-pointer"
                title="إخفاء / إظهار الرصيد"
              >
                {obscureBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight flex items-baseline gap-2">
              <span>{obscureBalance ? '••••••••' : walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-sm font-bold text-blue-200">ريال يمني</span>
            </div>

            {/* Unboxed Status Metadata */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-blue-100 pt-1">
              <div className="flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-blue-300" />
                <span>عمولة المنصة المعتمدة:</span>
                <span className="font-bold text-white font-mono">{commissionRate}%</span>
              </div>
              <span aria-hidden="true" className="opacity-40">·</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>معلق بالسحب:</span>
                <span className="font-bold text-amber-200 font-mono tabular-nums">{heldBalance.toLocaleString()} ريال</span>
              </div>
              <span aria-hidden="true" className="opacity-40">·</span>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>محفظة موثقة:</span>
                <span className="font-mono text-white text-[11px]">{vendorWallet?.wallet_number || 'WLT-ACTIVE'}</span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => onNavigateTab('withdrawals')}
              className="w-full md:w-auto px-6 py-3 rounded-2xl bg-white hover:bg-blue-50 text-blue-800 font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
            >
              <Wallet className="w-4 h-4 text-blue-700" />
              <span>طلب سحب أرباح</span>
            </button>

            <button
              onClick={() => onNavigateTab('upload')}
              className="w-full md:w-auto px-5 py-3 rounded-2xl bg-blue-500/30 hover:bg-blue-500/40 text-white font-bold text-sm border border-white/20 flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>رفع كروت جديدة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2x2 Overview Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-300">مؤشرات الأداء المالي الحقيقي (توقيت اليمن UTC+3)</h3>
          <span className="text-xs text-slate-500 font-mono">
            {yemenNow.toLocaleDateString('ar-YE', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Today's Net Earnings */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-medium">صافي أرباح اليوم (بعد العمولة)</div>
              <div className="text-lg font-extrabold text-emerald-400 font-mono tabular-nums">
                {todayNetEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
              </div>
              <div className="text-[11px] text-slate-500">
                إجمالي: <span className="font-mono text-slate-400">{todayGrossSales.toLocaleString()}</span> · العمولة: <span className="font-mono text-amber-400">{todayCommissionDeducted.toLocaleString()}</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-800/60 text-emerald-400">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Operations Count (Today) */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-medium">عدد العمليات (اليومية)</div>
              <div className="text-lg font-extrabold text-slate-100 font-mono tabular-nums">{todayOpsCount} عملية</div>
              <div className="text-[11px] text-slate-500">مبيعات كروت تمت اليوم</div>
            </div>
            <div className="p-3 rounded-2xl bg-purple-950/80 border border-purple-800/60 text-purple-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Sold Cards */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-medium">إجمالي الكروت المباعة</div>
              <div className="text-lg font-extrabold text-cyan-400 font-mono tabular-nums">{soldCards.length} كرت</div>
              <button onClick={() => onNavigateTab('stock')} className="text-[11px] text-cyan-400 hover:underline cursor-pointer block pt-0.5">
                عرض سجل الكروت المباعة
              </button>
            </div>
            <div className="p-3 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Remaining Cards in Stock */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 font-medium">المخزون المتاح للبيع</div>
              <div className="text-lg font-extrabold text-amber-400 font-mono tabular-nums">{availableCards.length} كرت</div>
              <button onClick={() => onNavigateTab('stock')} className="text-[11px] text-amber-400 hover:underline cursor-pointer block pt-0.5">
                إدارة كروت المخزون
              </button>
            </div>
            <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-800/60 text-amber-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Performance Line/Bar Chart (صافي الأرباح اليومية) */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span>صافي أرباح المبيعات اليومية (آخر 7 أيام - صافي بعد العمولة)</span>
          </h3>
          <span className="text-xs text-slate-400">القيم بالريال اليمني</span>
        </div>

        {/* 7-Day Interactive Sales Chart */}
        <div className="h-44 w-full flex flex-col justify-end pt-4">
          <div className="flex-1 flex items-end justify-between px-2 gap-2 border-b border-slate-800 pb-2">
            {weekDays.map((day, idx) => {
              const val = dailyPerformance[idx] || 0;
              const heightPercent = Math.max(12, Math.round((val / maxDaily) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <span className="text-[10px] font-mono tabular-nums text-cyan-400 font-bold opacity-80 group-hover:opacity-100">
                    {val > 0 ? `${Math.round(val).toLocaleString()}` : '0'}
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-3 sm:w-5 rounded-t-full bg-gradient-to-t from-blue-600 to-cyan-400 group-hover:from-blue-500 group-hover:to-cyan-300 transition-all duration-300"
                    title={`${day}: صافي ${val.toLocaleString()} ريال`}
                  />
                  <span className="text-[11px] text-slate-400 font-medium">{day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="flex items-center justify-between pt-2 text-xs font-bold">
        <button
          onClick={() => onNavigateTab('statement')}
          className="text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>كشف الحساب المالي الرسمي التراكمي</span>
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => onNavigateTab('networks')}
          className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>إدارة الشبكات ونقاط التغطية ({vendorNetworks.length} شبكة)</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
