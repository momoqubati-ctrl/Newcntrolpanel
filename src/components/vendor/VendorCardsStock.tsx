import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CardItem } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { 
  Ticket, 
  Search, 
  Copy, 
  Eye, 
  Trash2, 
  ShieldAlert, 
  Layers, 
  Boxes, 
  Calendar, 
  User, 
  Wifi, 
  Clock, 
  Download, 
  CheckCircle2, 
  Filter,
  Check
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { normalizeCardStatus, isCardSold, isCardAvailable } from '../../lib/cardStatusUtils';
import { decryptCardCode, formatCardCodeForExport } from '../../lib/encryptionUtils';

export interface BulkUploadBatch {
  id: string;
  batch_id?: string;
  network_id: string;
  network_name: string;
  category_id: string;
  category_name: string;
  price?: number;
  user_name: string;
  user_id?: string;
  created_at: string;
  total_count: number;
  available_count: number;
  sold_count: number;
  reserved_count: number;
  cards: CardItem[];
}

export const VendorCardsStock: React.FC = () => {
  const { currentUser, currentVendor, cards, networks, categories, profiles, deleteCard } = useAuth();
  
  const vendorId = currentVendor?.id || '';
  const vendorUserId = currentVendor?.user_id || currentUser?.id || '';
  const vendorNetworks = networks.filter(n => 
    (vendorId && n.vendor_id === vendorId) || 
    (vendorUserId && n.vendor_id === vendorUserId)
  );

  // Cards owned by the vendor's networks
  const allVendorCards = useMemo(() => {
    return vendorNetworks.length ? cards.filter(c => vendorNetworks.some(n => n.id === c.network_id)) : [];
  }, [vendorNetworks, cards]);

  // Main Network Filter (فلترة رئيسية بحسب الشبكة)
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('all');

  // Active Screen Tab: Detailed Cards or Bulk Batches
  const [activeTab, setActiveTab] = useState<'detailed' | 'bulk'>('detailed');

  // Filtered cards by primary network selection
  const networkFilteredCards = useMemo(() => {
    if (selectedNetworkId === 'all') return allVendorCards;
    return allVendorCards.filter(c => c.network_id === selectedNetworkId);
  }, [allVendorCards, selectedNetworkId]);

  // Compute Bulk Upload Batches from cards
  const bulkBatches = useMemo(() => {
    const batchesMap: BulkUploadBatch[] = [];

    // Sort cards newest first for accurate clustering
    const sorted = [...networkFilteredCards].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    sorted.forEach(card => {
      const cardTime = new Date(card.created_at || Date.now()).getTime();
      const net = networks.find(n => n.id === card.network_id);
      const cat = categories.find(c => c.id === card.category_id);

      // Find uploader name
      const ownerProfile = card.owner_id ? profiles.find(p => p.id === card.owner_id) : null;
      const uploaderName = ownerProfile?.name || 
                           currentVendor?.user_name || 
                           currentVendor?.business_name || 
                           currentUser?.name || 
                           'تاجر شبكتي';

      // Group cards by batch_id if present, or cluster by (network + category + timestamp within 2 minutes)
      let found = batchesMap.find(b => {
        if (card.batch_id && b.batch_id) {
          return b.batch_id === card.batch_id;
        }
        if (b.network_id === card.network_id && b.category_id === card.category_id) {
          const batchTime = new Date(b.created_at).getTime();
          return Math.abs(cardTime - batchTime) <= 120000; // 2 minutes threshold
        }
        return false;
      });

      if (!found) {
        found = {
          id: card.batch_id || `batch_${card.network_id}_${card.category_id}_${cardTime}`,
          batch_id: card.batch_id,
          network_id: card.network_id,
          network_name: card.network_name || net?.name || 'شبكة الواي فاي',
          category_id: card.category_id,
          category_name: card.category_name || cat?.name || 'باقة إنترنت',
          price: card.price || cat?.price || 0,
          user_name: uploaderName,
          user_id: card.owner_id || currentUser?.id,
          created_at: card.created_at || new Date().toISOString(),
          total_count: 0,
          available_count: 0,
          sold_count: 0,
          reserved_count: 0,
          cards: [],
        };
        batchesMap.push(found);
      }

      found.cards.push(card);
      found.total_count += 1;
      const normStatus = normalizeCardStatus(card.status);
      if (normStatus === 'available') {
        found.available_count += 1;
      } else if (normStatus === 'sold') {
        found.sold_count += 1;
      } else {
        found.reserved_count += 1;
      }
    });

    return batchesMap;
  }, [networkFilteredCards, networks, categories, profiles, currentVendor, currentUser]);

  // Tab 1 (Detailed) state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Tab 2 (Bulk) state
  const [bulkSearchTerm, setBulkSearchTerm] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<BulkUploadBatch | null>(null);
  const [batchModalSearch, setBatchModalSearch] = useState<string>('');
  const [batchModalStatus, setBatchModalStatus] = useState<string>('all');

  // Shared Modals state
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);

  // Detailed cards filtered by search & status
  const detailedCardsFiltered = useMemo(() => {
    return networkFilteredCards.filter(c => {
      const cardNorm = normalizeCardStatus(c.status);
      const filterNorm = filterStatus.toLowerCase();
      const matchesStatus = filterStatus === 'all' || cardNorm === filterNorm;
      const matchesSearch = (c.code || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (c.category_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (c.network_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [networkFilteredCards, filterStatus, searchTerm]);

  // Bulk batches filtered by search
  const filteredBulkBatches = useMemo(() => {
    return bulkBatches.filter(b => {
      const term = bulkSearchTerm.toLowerCase();
      return (
        b.category_name.toLowerCase().includes(term) ||
        b.network_name.toLowerCase().includes(term) ||
        b.user_name.toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term)
      );
    });
  }, [bulkBatches, bulkSearchTerm]);

  // Modal batch cards filtered
  const modalBatchCardsFiltered = useMemo(() => {
    if (!selectedBatch) return [];
    return selectedBatch.cards.filter(c => {
      const cardNorm = normalizeCardStatus(c.status);
      const matchesStatus = batchModalStatus === 'all' || cardNorm === batchModalStatus;
      const matchesSearch = (c.code || '').toLowerCase().includes(batchModalSearch.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [selectedBatch, batchModalStatus, batchModalSearch]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmDelete = () => {
    if (deleteCardId) {
      deleteCard(deleteCardId);
      setDeleteCardId(null);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'غير محدد';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('ar-YE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const exportDetailedCardsToCSV = () => {
    if (detailedCardsFiltered.length === 0) return;

    const csvRows = [
      ["رمز البطاقة (PIN Code)", "حالة الكرت", "فئة الكرت", "السعر (YER)", "اسم الشبكة", "تاريخ الإضافة / البيع"].join(",")
    ];

    detailedCardsFiltered.forEach(card => {
      const openCode = formatCardCodeForExport(card.code || card.encrypted_code || '');
      const norm = normalizeCardStatus(card.status);
      const statusArabic = norm === 'available' ? 'متاح' : (norm === 'sold' ? 'تم البيع' : 'محجوز');
      csvRows.push([
        `"${openCode.replace(/"/g, '""')}"`,
        `"${statusArabic}"`,
        `"${(card.category_name || 'باقة إنترنت').replace(/"/g, '""')}"`,
        `"${card.price || 0}"`,
        `"${(card.network_name || 'شبكة الواي فاي').replace(/"/g, '""')}"`,
        `"${formatDateTime(card.sold_at || card.created_at)}"`
      ].join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const netName = selectedNetworkId !== 'all' 
      ? (vendorNetworks.find(n => n.id === selectedNetworkId)?.name || 'شبكتي') 
      : 'كافة_الشبكات';
    link.setAttribute('download', `كروت_${netName}_${detailedCardsFiltered.length}_مفتوحة.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportBatchToCSV = (batch: BulkUploadBatch) => {
    const csvRows = [
      ["رمز البطاقة (PIN Code)", "حالة الكرت", "الفئة", "السعر (YER)", "الشبكة", "تاريخ الإضافة"].join(",")
    ];
    batch.cards.forEach(card => {
      const openCode = decryptCardCode(card.code || card.encrypted_code || '');
      const norm = normalizeCardStatus(card.status);
      const statusArabic = norm === 'available' ? 'متاح' : (norm === 'sold' ? 'تم البيع' : 'محجوز');
      csvRows.push([
        `"${openCode || card.code || ''}"`,
        `"${statusArabic}"`,
        `"${batch.category_name}"`,
        `"${batch.price || 0}"`,
        `"${batch.network_name}"`,
        `"${card.created_at || ''}"`
      ].join(","));
    });
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `دفعة_${batch.category_name}_${batch.total_count}كرت_مفتوحة.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyBatchCodes = (batch: BulkUploadBatch) => {
    const codes = batch.cards.map(c => decryptCardCode(c.code || c.encrypted_code || '')).join('\n');
    navigator.clipboard.writeText(codes);
    setBatchCopied(true);
    setTimeout(() => setBatchCopied(false), 2000);
  };

  // Bulk Summary Stats
  const bulkStats = useMemo(() => {
    const totalBatches = bulkBatches.length;
    const totalCards = bulkBatches.reduce((acc, b) => acc + b.total_count, 0);
    const availableCards = bulkBatches.reduce((acc, b) => acc + b.available_count, 0);
    const soldCards = bulkBatches.reduce((acc, b) => acc + b.sold_count, 0);
    return { totalBatches, totalCards, availableCards, soldCards };
  }, [bulkBatches]);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Header & Main Network Filter */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Ticket className="w-6 h-6 text-cyan-400" />
              <span>مخزون الأكواد والبطاقات (Inventory Details)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">تتبع كشوفات الكروت المتاحة والمباعة لكل فئة وشبكة، مع مراجعة كاملة لدفعات الرفع الجماعي (Bulk)</p>
          </div>

          {/* الفلترة الرئيسية بحسب الشبكة */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 px-3.5 py-2 rounded-xl text-xs w-full lg:w-auto">
              <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-slate-400 shrink-0 font-semibold">فلترة الشبكة:</span>
              <select
                value={selectedNetworkId}
                onChange={e => setSelectedNetworkId(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-hidden cursor-pointer w-full text-xs"
              >
                <option value="all" className="bg-slate-900 text-white">
                  جميع الشبكات ({allVendorCards.length} كرت)
                </option>
                {vendorNetworks.map(net => {
                  const netCardsCount = allVendorCards.filter(c => c.network_id === net.id).length;
                  return (
                    <option key={net.id} value={net.id} className="bg-slate-900 text-white">
                      {net.name} ({netCardsCount} كرت)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (تفصيلي & Bulk) */}
        <div className="flex items-center gap-2 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setActiveTab('detailed')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'detailed'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/50'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>تفصيلي (كافة الكروت)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'detailed' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {networkFilteredCards.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'bulk'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>عمليات الرفع (Bulk)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'bulk' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {bulkBatches.length}
            </span>
          </button>
        </div>
      </div>

      {/* ===================== TAB 1: DETAILED VIEW ===================== */}
      {activeTab === 'detailed' && (
        <div className="space-y-4">
          {/* Detailed Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full sm:w-auto">
              <input
                type="text"
                placeholder="بحث بكود البطاقة، الفئة، أو الشبكة..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-9 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer font-semibold"
              >
                <option value="all">جميع الحالات ({networkFilteredCards.length})</option>
                <option value="available">المتاحة فقط ({networkFilteredCards.filter(isCardAvailable).length})</option>
                <option value="sold">المباعة فقط ({networkFilteredCards.filter(isCardSold).length})</option>
                <option value="reserved">المحجوزة</option>
              </select>

              <button
                onClick={exportDetailedCardsToCSV}
                disabled={detailedCardsFiltered.length === 0}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                title="تصدير الكروت المعروضة كملف CSV مفتوحة مع حالتها"
              >
                <Download className="w-4 h-4" />
                <span>تصدير الكروت ({detailedCardsFiltered.length})</span>
              </button>
            </div>
          </div>

          {/* Stock Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm text-slate-300">
                <thead className="bg-slate-800/80 text-xs font-bold text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="p-4">الفئة التابعة</th>
                    <th className="p-4">رمز البطاقة (Code)</th>
                    <th className="p-4">السعر</th>
                    <th className="p-4">الشبكة</th>
                    <th className="p-4">تاريخ الإضافة / البيع</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {detailedCardsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                        لا توجد كروت مطابقة لمعايير البحث أو الفلترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    detailedCardsFiltered.map(card => (
                      <tr key={card.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-semibold text-white">{card.category_name || 'باقة اليوم'}</td>
                        <td className="p-4 font-mono text-cyan-300 font-bold dir-ltr text-xs">
                          {card.status === 'available' ? '••••••••••••' : (formatCardCodeForExport(card.code || card.encrypted_code || '') || card.code)}
                        </td>
                        <td className="p-4 font-bold text-amber-400 font-mono dir-ltr">{card.price?.toLocaleString()} YER</td>
                        <td className="p-4 text-xs text-slate-400 font-semibold">{card.network_name || 'شبكة الواي فاي'}</td>
                        <td className="p-4 text-xs text-slate-400">
                          {formatDateTime(card.sold_at || card.created_at)}
                        </td>
                        <td className="p-4"><StatusBadge status={card.status} /></td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedCard(card)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة Voucher</span>
                            </button>
                            {card.status === 'available' && (
                              <button
                                onClick={() => setDeleteCardId(card.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:text-rose-400 text-slate-400 border border-slate-700 cursor-pointer transition-colors"
                                title="حذف الكرت"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: BULK UPLOADS VIEW ===================== */}
      {activeTab === 'bulk' && (
        <div className="space-y-5">
          {/* Quick Statistics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-400 block mb-1 font-semibold">إجمالي عمليات الرفع</span>
              <div className="text-xl font-bold text-white font-mono flex items-center justify-between">
                <span>{bulkStats.totalBatches}</span>
                <Boxes className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-400 block mb-1 font-semibold">إجمالي الكروت المرفوعة</span>
              <div className="text-xl font-bold text-cyan-400 font-mono flex items-center justify-between">
                <span>{bulkStats.totalCards}</span>
                <Ticket className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-400 block mb-1 font-semibold">الكروت المتاحة حالياً</span>
              <div className="text-xl font-bold text-emerald-400 font-mono flex items-center justify-between">
                <span>{bulkStats.availableCards}</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-400 block mb-1 font-semibold">الكروت المباعة</span>
              <div className="text-xl font-bold text-amber-400 font-mono flex items-center justify-between">
                <span>{bulkStats.soldCards}</span>
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </div>

          {/* Search bar for Bulk Batches */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full sm:w-auto">
              <input
                type="text"
                placeholder="بحث باسم الشبكة، فئة الكرت، أو اسم المستخدم..."
                value={bulkSearchTerm}
                onChange={e => setBulkSearchTerm(e.target.value)}
                className="w-full pl-3 pr-9 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>

            <div className="text-xs text-slate-400 font-semibold">
              إجمالي الدفعات المطابقة: <span className="text-white font-bold font-mono">{filteredBulkBatches.length}</span>
            </div>
          </div>

          {/* Bulk Operations Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm text-slate-300">
                <thead className="bg-slate-800/80 text-xs font-bold text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="p-4">اسم الشبكة</th>
                    <th className="p-4">فئة الكرت</th>
                    <th className="p-4">العدد الإجمالي</th>
                    <th className="p-4">اسم المستخدم</th>
                    <th className="p-4">التاريخ والوقت</th>
                    <th className="p-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredBulkBatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                        لا توجد عمليات رفع كروت (Bulk) مسجلة.
                      </td>
                    </tr>
                  ) : (
                    filteredBulkBatches.map(batch => (
                      <tr 
                        key={batch.id} 
                        onClick={() => setSelectedBatch(batch)}
                        className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                      >
                        {/* Network Name */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center shrink-0">
                              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                            </div>
                            <span className="font-bold text-white text-xs">{batch.network_name}</span>
                          </div>
                        </td>

                        {/* Category Name & Price */}
                        <td className="p-4">
                          <div>
                            <span className="font-bold text-slate-200 text-xs block">{batch.category_name}</span>
                            <span className="text-[11px] text-amber-400 font-mono font-bold">
                              {batch.price?.toLocaleString()} YER
                            </span>
                          </div>
                        </td>

                        {/* Total Count & Availability Breakdown */}
                        <td className="p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-bold font-mono text-xs">
                              <span className="text-white text-sm">{batch.total_count}</span>
                              <span className="text-slate-400 text-[11px]">كرت</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span className="text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                                متاح: {batch.available_count}
                              </span>
                              <span className="text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                                مباع: {batch.sold_count}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* User / Uploader Name */}
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{batch.user_name}</span>
                          </div>
                        </td>

                        {/* Date and Time */}
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{formatDateTime(batch.created_at)}</span>
                          </div>
                        </td>

                        {/* Action: Open details */}
                        <td className="p-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBatch(batch);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-slate-800 group-hover:bg-emerald-600 text-slate-200 group-hover:text-white border border-slate-700 group-hover:border-emerald-500 text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض تفاصيل الكروت</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: BATCH CARDS DETAILS ===================== */}
      {selectedBatch && (
        <Modal
          isOpen={!!selectedBatch}
          onClose={() => {
            setSelectedBatch(null);
            setBatchModalSearch('');
            setBatchModalStatus('all');
          }}
          title={`تفاصيل كروت الدفعة المرفوعة (${selectedBatch.total_count} كرت)`}
        >
          <div className="space-y-5 dir-rtl">
            {/* Batch Info Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">اسم الشبكة:</span>
                  <span className="text-white font-bold flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    {selectedBatch.network_name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">فئة الكرت:</span>
                  <span className="text-cyan-300 font-bold block">{selectedBatch.category_name}</span>
                  <span className="text-amber-400 font-mono text-[11px]">{selectedBatch.price?.toLocaleString()} YER</span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">اسم المستخدم:</span>
                  <span className="text-white font-semibold flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {selectedBatch.user_name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">تاريخ ووقت الرفع:</span>
                  <span className="text-slate-300 font-mono text-[11px] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {formatDateTime(selectedBatch.created_at)}
                  </span>
                </div>
              </div>

              {/* Counts Badge Bar */}
              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono font-bold">
                    الإجمالي: {selectedBatch.total_count}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-xs font-mono font-bold">
                    المتاح: {selectedBatch.available_count}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/50 text-xs font-mono font-bold">
                    المباع: {selectedBatch.sold_count}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyBatchCodes(selectedBatch)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                  >
                    {batchCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{batchCopied ? 'تم نسخ الأكواد!' : 'نسخ الأكواد'}</span>
                  </button>

                  <button
                    onClick={() => exportBatchToCSV(selectedBatch)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Internal Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="بحث برمز البطاقة داخل الدفعة..."
                  value={batchModalSearch}
                  onChange={e => setBatchModalSearch(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              </div>

              <select
                value={batchModalStatus}
                onChange={e => setBatchModalStatus(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer font-semibold"
              >
                <option value="all">جميع حالات الدفعة ({selectedBatch.cards.length})</option>
                <option value="available">المتاحة فقط ({selectedBatch.available_count})</option>
                <option value="sold">المباعة فقط ({selectedBatch.sold_count})</option>
              </select>
            </div>

            {/* Batch Cards Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">رمز البطاقة (Code)</th>
                    <th className="p-3">السعر</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">تاريخ الإضافة / البيع</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {modalBatchCardsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        لا توجد كروت مطابقة داخل هذه الدفعة.
                      </td>
                    </tr>
                  ) : (
                    modalBatchCardsFiltered.map((card, idx) => (
                      <tr key={card.id} className="hover:bg-slate-900/60 transition-colors">
                        <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono text-cyan-300 font-bold dir-ltr">
                          {card.status === 'available' ? '••••••••••••' : (formatCardCodeForExport(card.code || card.encrypted_code || '') || card.code)}
                        </td>
                        <td className="p-3 font-bold text-amber-400 font-mono dir-ltr">
                          {card.price?.toLocaleString()} YER
                        </td>
                        <td className="p-3"><StatusBadge status={card.status} /></td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {formatDateTime(card.sold_at || card.created_at)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedCard(card)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Voucher</span>
                            </button>
                            {card.status === 'available' && (
                              <button
                                onClick={() => setDeleteCardId(card.id)}
                                className="p-1 rounded bg-slate-800 hover:text-rose-400 text-slate-400 border border-slate-700 cursor-pointer transition-colors"
                                title="حذف الكرت"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* ===================== MODAL: SCRATCH VOUCHER PREVIEW ===================== */}
      {selectedCard && (
        <Modal
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          title="بطاقة شحن كرت شبكتي - Voucher Preview"
        >
          <div className="space-y-5 dir-rtl">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 border-2 border-dashed border-cyan-500/50 shadow-2xl relative overflow-hidden text-center space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-extrabold text-white text-base">شبكتي - Shabakati Wi-Fi</span>
                </div>
                <StatusBadge status={selectedCard.status} />
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1">اسم الفئة والباقة:</span>
                <span className="text-lg font-extrabold text-cyan-300">{selectedCard.category_name}</span>
              </div>

              {/* Code display with copy */}
              {(() => {
                const revealedCode = formatCardCodeForExport(selectedCard.code || selectedCard.encrypted_code || '') || selectedCard.code;
                return (
                  <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 relative">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">رمز البطاقة (WI-FI PIN):</span>
                    <span className="text-2xl font-mono font-extrabold text-emerald-400 tracking-widest dir-ltr block select-all">
                      {revealedCode}
                    </span>

                    <button
                      onClick={() => handleCopy(revealedCode)}
                      className="mt-3 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{copied ? 'تم النسخ!' : 'نسخ رمز البطاقة'}</span>
                    </button>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800 font-mono">
                <span>القيمة: {selectedCard.price?.toLocaleString()} YER</span>
                <span>الشبكة: {selectedCard.network_name || 'شبكة الواي فاي'}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ===================== MODAL: DELETE CARD CONFIRMATION ===================== */}
      <Modal
        isOpen={!!deleteCardId}
        onClose={() => setDeleteCardId(null)}
        title="تأكيد حذف الكرت من المخزون"
      >
        <div className="space-y-4 text-sm text-center dir-rtl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <p className="text-slate-200">
            هل أنت متأكد من حذف هذا الكرت غير المباع من مخزونك؟
          </p>

          <div className="flex justify-center gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={() => setDeleteCardId(null)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer hover:bg-slate-700 transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-rose-950/50 transition-colors"
            >
              تأكيد الحذف
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
