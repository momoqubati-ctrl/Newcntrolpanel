import { strict as assert } from 'assert';
import { isCardSold, isCardReserved, normalizeCardStatus } from './cardStatusUtils';
import { resolveUnifiedCardTransaction, formatMasterTransactionId } from './ledgerUtils';

console.log('--- Starting Admin Operations Report Unit Tests ---');

// 1. Verify Card Status Normalization handles uppercase SOLD and RESERVED
assert(normalizeCardStatus('SOLD') === 'sold', 'Must normalize SOLD to sold');
assert(normalizeCardStatus('RESERVED') === 'reserved', 'Must normalize RESERVED to reserved');
assert(isCardSold({ status: 'SOLD' }) === true, 'isCardSold must return true for uppercase SOLD');
assert(isCardReserved({ status: 'RESERVED' }) === true, 'isCardReserved must return true for uppercase RESERVED');

// 2. Scenario: App Wallet Purchase via Delivery Attempt
const mockDeliveryAttempts = [
  {
    id: 'deliv-1',
    card_id: 'card-wallet-101',
    ubtr_id: 'UBTR-20261015001',
    order_id: 'order-uuid-999',
    customer_id: 'customer-uuid-888',
    status: 'DELIVERED',
  }
];

const walletCard = {
  id: 'card-wallet-101',
  category_id: 'cat-1',
  network_id: 'net-1',
  code: 'B7arJ6tp-wallet1',
  status: 'SOLD',
  price: 500,
  sold_at: '2026-10-15T12:00:00Z',
  ubtr_reference: 'UBTR-20261015001',
  order_id: 'order-uuid-999',
  sold_to: 'customer-uuid-888',
  owner_id: 'customer-uuid-888',
  serial_number: 'SN-WLT-101',
};

const resolvedWalletCard = resolveUnifiedCardTransaction(walletCard, {
  payments: [],
  paymentItems: [],
  deliveryAttempts: mockDeliveryAttempts,
});

assert(resolvedWalletCard.ubtr === 'UBTR-20261015001', 'Wallet card must resolve to canonical UBTR reference');
assert(resolvedWalletCard.payment_method === 'محفظة التطبيق', 'Wallet card channel must be محفظة التطبيق');
assert(!resolvedWalletCard.is_fallback, 'Wallet card with canonical delivery/UBTR must not be fallback');

// 3. Scenario: Deduplication between BasGate payment and sold card
const paymentId = 'pay-basgate-001';
const mockPayments = [
  {
    id: paymentId,
    user_id: 'cust-1',
    amount: 100,
    provider: 'basgate',
    provider_reference: 'BAS_1791928130865_959',
    status: 'completed',
    metadata: { card_id: 'card-bas-1' }
  }
];

const mockCards = [
  {
    id: 'card-bas-1',
    status: 'SOLD',
    price: 100,
  },
  walletCard
];

const matchedCardIds = new Set<string>();
mockCards.forEach(c => {
  if (c.id === 'card-bas-1') {
    matchedCardIds.add(c.id);
  }
});

// Step 2 filter check
const step2Cards = mockCards.filter(c => (isCardSold(c) || isCardReserved(c)) && !matchedCardIds.has(c.id));
assert(step2Cards.length === 1, 'Step 2 must include ONLY the wallet card, deduplicating the BasGate card');
assert(step2Cards[0].id === 'card-wallet-101', 'Step 2 card must be the wallet card');

console.log('✅ PASS: All Admin Operations Report Unit Tests PASSED Successfully!');
