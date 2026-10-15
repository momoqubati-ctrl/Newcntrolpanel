import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Store, Lock, Smartphone, ArrowRight, Eye, EyeOff, Loader2, Sparkles, CheckCircle2, X } from 'lucide-react';

interface VendorLoginPageProps {
  onSuccess: () => void;
  onSwitchToAdminLogin?: () => void;
}

export const VendorLoginPage: React.FC<VendorLoginPageProps> = ({ onSuccess }) => {
  const { loginAsVendor, loginAsDemoVendor } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) {
      setErrorMsg('يرجى كتابة رقم هاتف التاجر وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const success = await loginAsVendor(phone, password);
      if (success) {
        onSuccess();
      } else {
        setErrorMsg('بيانات الدخول غير صحيحة أو الحساب ليس برتبة تاجر');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء الاتصال بقاعدة البيانات');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const ok = await loginAsDemoVendor();
      if (ok) {
        onSuccess();
      } else {
        setErrorMsg('فشل الدخول لحساب التاجر التجريبي');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء الدخول التجريبي');
    } finally {
      setIsLoading(false);
    }
  };

  const fillVendorCredentials = () => {
    setPhone('730152153');
    setPassword('123456');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 dir-rtl">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-600/20 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-amber-950/80 border border-amber-800/80 text-amber-400 shadow-md mb-2">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">تسجيل دخول التاجر (Vendor)</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            بوابة إدارة شبكات الواي فاي، الفئات، ومتابعة الأرباح لمشروعات شبكتي
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold text-center animate-fadeIn">
            {errorMsg}
          </div>
        )}

        {/* Quick Live Vendor Login Button */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-amber-950/60 border border-emerald-500/30 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>دخول سريع لحساب تاجر معتمد (شبكة القباطي)</span>
            </span>
            <span className="text-[11px] text-emerald-400 font-mono">سوبابيس مباشر</span>
          </div>
          <p className="text-xs text-slate-400 leading-normal">
            تسجيل دخول مباشر بحساب التاجر المعتمد الفعلي في سوبابيس (730152153) مع جلب الشبكات والكروت والمخزون الحقيقي.
          </p>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>دخول سريع مباشر بقاعدة البيانات (شبكة القباطي)</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-xs text-slate-500 font-medium">أو الدخول المباشر من قاعدة البيانات</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">رقم هاتف التاجر المسجل:</label>
              <button
                type="button"
                onClick={fillVendorCredentials}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
              >
                تعبئة بيانات تاجر معتمد (730152153)
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="730152153"
                className="w-full pl-3 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-amber-300 dir-ltr placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
              />
              <Smartphone className="w-5 h-5 text-slate-500 absolute right-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1 block">كلمة المرور:</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
              />
              <Lock className="w-5 h-5 text-slate-500 absolute right-3 top-3.5" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                title={showPassword ? 'إخفاء' : 'إظهار'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-950/60 cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>جاري الاستعلام من قاعدة البيانات...</span>
              </>
            ) : (
              <>
                <span>دخول لوحة تحكم التاجر</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-400">
            ليس لديك حساب تاجر حتى الآن؟{' '}
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="text-amber-400 font-bold hover:underline cursor-pointer"
            >
              تقديم طلب انضمام تاجر
            </button>
          </p>
        </div>
      </div>

      {/* Clean in-UI Modal for joining */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowJoinModal(false)}
              className="absolute left-5 top-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 text-amber-400">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">انضمام تاجر جديد لمنصة شبكتي</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              للانضمام كتاجر معتمد وشريك لشبكات الواي فاي، يمكنك تقديم الطلب الرسمي وإرفاق السجل التجاري والوثائق عبر تطبيق شبكتي الرئيسي أو التواصل مع الإدارة المركزية، وستتم مراجعة الطلب واعتماده خلال 24 ساعة.
            </p>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowJoinModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
