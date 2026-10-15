/**
 * Vendor Account Statement Utilities.
 * Enforces canonical double-entry accounting reconciliation for vendor statements.
 * Derives statement records strictly from authentic wallet transactions.
 */

import { formatMasterTransactionId } from './ledgerUtils';

export interface RawTransactionInput {
  id: string;
  wallet_id?: string;
  amount: number | string;
  type: string;
  status?: string;
  description?: string | null;
  reference_id?: string | null;
  ubtr_reference?: string | null;
  created_at?: string;
  payment_method?: string | null;
  external_wallet_name?: string | null;
  transaction_reference?: string | null;
}

export interface RawWithdrawalRequestInput {
  id: string;
  amount: number | string;
  status: string;
  created_at: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  reject_reason?: string;
  ubtr_reference?: string | null;
}

export interface StatementItem {
  id: string;
  ubtr: string;
  date: string;
  ref_no: string;
  description: string;
  type: 'credit' | 'debit';
  debit: number;
  credit: number;
  status: 'completed' | 'pending' | 'failed';
  currency: string;
}

export interface StatementRow extends StatementItem {
  running_balance: number;
}

export interface StatementSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  closingBalance: number;
}

/**
 * Safely parses any amount value into a finite number.
 */
export function normalizeTransactionAmount(amount: unknown): number {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Normalizes transaction lifecycle status.
 */
export function normalizeTransactionStatus(status: unknown): 'completed' | 'pending' | 'failed' {
  if (!status) return 'completed';
  const clean = String(status).trim().toLowerCase();
  if (clean === 'completed' || clean === 'approved' || clean === 'success') return 'completed';
  if (clean === 'pending' || clean === 'processing' || clean === 'review') return 'pending';
  if (clean === 'failed' || clean === 'rejected' || clean === 'cancelled' || clean === 'reversed') return 'failed';
  return 'completed';
}

export interface StatementContext {
  cards?: any[];
  payments?: any[];
  deliveryAttempts?: any[];
  withdrawalRequests?: any[];
}

/**
 * Builds chronological statement items from authentic transactions and deduplicated withdrawal requests.
 */
export function buildStatementItems(
  transactions: RawTransactionInput[] = [],
  withdrawalRequests: RawWithdrawalRequestInput[] = [],
  context?: StatementContext
): StatementItem[] {
  const items: StatementItem[] = [];
  const processedWithdrawalIds = new Set<string>();

  // 1. Process authentic wallet transactions
  for (const tx of transactions) {
    const rawAmount = normalizeTransactionAmount(tx.amount);
    const status = normalizeTransactionStatus(tx.status);
    const isCredit = rawAmount >= 0;
    const absAmount = Math.abs(rawAmount);

    const debit = isCredit ? 0 : absAmount;
    const credit = isCredit ? absAmount : 0;

    // Track withdrawal references to prevent double-counting
    if (tx.reference_id) {
      processedWithdrawalIds.add(String(tx.reference_id).toLowerCase());
    }

    // Resolve canonical sequential UBTR (e.g. UBTR-10000000000103)
    let canonicalUbtr = '';

    // Tier 1: Check explicit fields if they contain canonical UBTR
    if (tx.ubtr_reference && /^UBTR-/i.test(tx.ubtr_reference)) {
      canonicalUbtr = tx.ubtr_reference.trim().toUpperCase();
    } else if (tx.transaction_reference && /^UBTR-/i.test(tx.transaction_reference)) {
      canonicalUbtr = tx.transaction_reference.trim().toUpperCase();
    } else if (tx.reference_id && /^UBTR-/i.test(tx.reference_id)) {
      canonicalUbtr = tx.reference_id.trim().toUpperCase();
    }

    // Tier 2: Extract authentic sequential UBTR embedded in description (e.g. "(UBTR-10000000000103)")
    if (!canonicalUbtr && tx.description) {
      const match = tx.description.match(/\b(UBTR-\d+)\b/i);
      if (match) {
        canonicalUbtr = match[1].toUpperCase();
      }
    }

    // Tier 3: Resolve from linked context records (cards, deliveryAttempts, payments, withdrawals)
    if (!canonicalUbtr && context) {
      const refId = tx.reference_id ? String(tx.reference_id).toLowerCase() : '';
      const txId = tx.id ? String(tx.id).toLowerCase() : '';

      // Check cards
      if (context.cards && context.cards.length > 0) {
        const matchedCard = context.cards.find((c: any) => {
          if (!c) return false;
          const cardId = String(c.id).toLowerCase();
          const orderId = c.order_id ? String(c.order_id).toLowerCase() : '';
          const resId = c.reserved_for_payment_id ? String(c.reserved_for_payment_id).toLowerCase() : '';
          return (refId && (orderId === refId || cardId === refId || resId === refId)) ||
                 (tx.description && tx.description.includes(c.id));
        });

        if (matchedCard) {
          const cardUbtr = matchedCard.ubtr_reference || matchedCard.ubtr || matchedCard.ubtr_id;
          if (cardUbtr && /^UBTR-/i.test(cardUbtr)) {
            canonicalUbtr = cardUbtr.toUpperCase();
          }
        }
      }

      // Check delivery attempts
      if (!canonicalUbtr && context.deliveryAttempts && context.deliveryAttempts.length > 0) {
        const matchedDelivery = context.deliveryAttempts.find((d: any) => {
          if (!d) return false;
          const dOrderId = d.order_id ? String(d.order_id).toLowerCase() : '';
          const dPaymentId = d.payment_id ? String(d.payment_id).toLowerCase() : '';
          return refId && (dOrderId === refId || dPaymentId === refId);
        });

        if (matchedDelivery?.ubtr_id && /^UBTR-/i.test(matchedDelivery.ubtr_id)) {
          canonicalUbtr = matchedDelivery.ubtr_id.toUpperCase();
        }
      }

      // Check payments
      if (!canonicalUbtr && context.payments && context.payments.length > 0) {
        const matchedPayment = context.payments.find((p: any) => {
          if (!p) return false;
          return refId && String(p.id).toLowerCase() === refId;
        });

        if (matchedPayment?.ubtr_reference && /^UBTR-/i.test(matchedPayment.ubtr_reference)) {
          canonicalUbtr = matchedPayment.ubtr_reference.toUpperCase();
        }
      }

      // Check withdrawal requests
      if (!canonicalUbtr && context.withdrawalRequests && context.withdrawalRequests.length > 0) {
        const matchedWr = context.withdrawalRequests.find((w: any) => {
          if (!w) return false;
          const wId = String(w.id).toLowerCase();
          return (refId && wId === refId) || (txId && wId === txId);
        });

        if (matchedWr?.ubtr_reference && /^UBTR-/i.test(matchedWr.ubtr_reference)) {
          canonicalUbtr = matchedWr.ubtr_reference.toUpperCase();
        }
      }
    }

    // Tier 4: Fallback to unified financial reference (TX-XXXXXXXX) if no sequential UBTR exists
    if (!canonicalUbtr) {
      canonicalUbtr = tx.reference_id ? formatMasterTransactionId(tx.reference_id) : formatMasterTransactionId(tx.id);
    }

    // Format reference number
    let refNo = tx.transaction_reference || '';
    if (!refNo && tx.reference_id) {
      refNo = formatMasterTransactionId(tx.reference_id);
    }
    if (!refNo && tx.id) {
      refNo = formatMasterTransactionId(tx.id);
    }

    // Format descriptive text
    let description = (tx.description || '').trim();
    if (!description) {
      if (tx.type === 'commission') {
        description = 'مستحقات مبيعات كروت شبكة';
      } else if (tx.type === 'withdrawal') {
        description = 'سحب أرباح من المحفظة';
      } else if (tx.type === 'recharge') {
        description = 'إيداع رصيد بالمحفظة';
      } else if (tx.type === 'refund') {
        description = 'استرداد مالي';
      } else {
        description = isCredit ? 'حركة دائنة بالمحفظة' : 'حركة مدينة بالمحفظة';
      }
    }

    items.push({
      id: tx.id,
      ubtr: canonicalUbtr,
      date: tx.created_at || new Date().toISOString(),
      ref_no: refNo,
      description,
      type: isCredit ? 'credit' : 'debit',
      debit,
      credit,
      status,
      currency: 'YER',
    });
  }

  // 2. Append non-duplicated pending or rejected withdrawal requests for informational visibility
  for (const wr of withdrawalRequests) {
    const wrId = String(wr.id).toLowerCase();
    const st = String(wr.status).trim().toLowerCase();

    // Skip if already settled in transactions as an approved/completed debit
    if (processedWithdrawalIds.has(wrId) || st === 'approved') {
      continue;
    }

    const amt = Math.abs(normalizeTransactionAmount(wr.amount));
    const isRejected = st === 'rejected';

    let desc = isRejected
      ? `طلب سحب مرفوض: ${wr.bank_name || 'محفظة بنكية'} (${wr.reject_reason || 'غير محدد'})`
      : `طلب سحب قيد المراجعة: ${wr.bank_name || 'محفظة بنكية'} (${wr.account_number || ''})`;

    let wrUbtr = '';
    if (wr.ubtr_reference && /^UBTR-/i.test(wr.ubtr_reference)) {
      wrUbtr = wr.ubtr_reference.trim().toUpperCase();
    } else if (wr.reject_reason) {
      const match = wr.reject_reason.match(/\b(UBTR-\d+)\b/i);
      if (match) wrUbtr = match[1].toUpperCase();
    }
    if (!wrUbtr) {
      wrUbtr = formatMasterTransactionId(wr.id);
    }

    items.push({
      id: `wr-${wr.id}`,
      ubtr: wrUbtr,
      date: wr.created_at || new Date().toISOString(),
      ref_no: formatMasterTransactionId(wr.id),
      description: desc.trim(),
      type: 'debit',
      debit: amt,
      credit: 0,
      status: isRejected ? 'failed' : 'pending',
      currency: 'YER',
    });
  }

  // Sort ascending by chronological timestamp for running balance calculation
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return items;
}

/**
 * Calculates cumulative running balance across chronological statement items.
 * Non-completed (pending/failed) items do NOT alter the ledger running balance.
 */
export function calculateRunningBalances(items: StatementItem[]): StatementRow[] {
  let currentBalance = 0;
  return items.map((item) => {
    if (item.status === 'completed') {
      currentBalance = item.type === 'credit'
        ? currentBalance + item.credit
        : currentBalance - item.debit;
    }
    return {
      ...item,
      running_balance: currentBalance,
    };
  });
}

/**
 * Filters statement entries and calculates canonical accounting summary.
 */
export function filterStatementRows(
  rows: StatementRow[],
  options: {
    searchTerm?: string;
    filterType?: 'all' | 'credit' | 'debit';
    startDate?: string;
    endDate?: string;
  } = {}
): { filtered: StatementRow[]; summary: StatementSummary } {
  const { searchTerm = '', filterType = 'all', startDate = '', endDate = '' } = options;

  const startTimestamp = startDate ? new Date(startDate).getTime() : null;
  const endTimestamp = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : null;
  const term = searchTerm.trim().toLowerCase();

  // 1. Calculate opening balance for items completed strictly prior to startDate
  let openingBalance = 0;
  if (startTimestamp !== null) {
    for (const row of rows) {
      const itemTime = new Date(row.date).getTime();
      if (itemTime < startTimestamp && row.status === 'completed') {
        openingBalance += (row.type === 'credit' ? row.credit : -row.debit);
      }
    }
  }

  // 2. Filter items within requested scope
  const filtered = rows.filter((item) => {
    const itemTime = new Date(item.date).getTime();

    if (startTimestamp !== null && itemTime < startTimestamp) {
      return false;
    }
    if (endTimestamp !== null && itemTime > endTimestamp) {
      return false;
    }

    if (filterType !== 'all' && item.type !== filterType) {
      return false;
    }

    if (term) {
      const matchesUbtr = item.ubtr?.toLowerCase().includes(term);
      const matchesRef = item.ref_no.toLowerCase().includes(term);
      const matchesDesc = item.description.toLowerCase().includes(term);
      if (!matchesUbtr && !matchesRef && !matchesDesc) {
        return false;
      }
    }

    return true;
  });

  // 3. Calculate summary metrics over completed entries in scope
  let totalDebit = 0;
  let totalCredit = 0;

  for (const item of filtered) {
    if (item.status === 'completed') {
      if (item.type === 'credit') {
        totalCredit += item.credit;
      } else {
        totalDebit += item.debit;
      }
    }
  }

  const netMovement = totalCredit - totalDebit;
  const closingBalance = openingBalance + netMovement;

  return {
    filtered,
    summary: {
      openingBalance,
      totalDebit,
      totalCredit,
      netMovement,
      closingBalance,
    },
  };
}
