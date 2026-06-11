/**
 * awardWalletService.js
 * Connects to the AwardWallet API to retrieve airline / hotel loyalty balances.
 * Falls back to a high-fidelity simulator (Delta SkyMiles MVP) when the API
 * key is absent or when running in demo mode.
 *
 * AwardWallet API docs: https://awardwallet.com/api/docs
 * All requests use Bearer token auth: Authorization: Bearer <AWARDWALLET_API_KEY>
 */

import { withStaleness, loadWallet } from './manualWalletService.js';

const AW_BASE_URL = 'https://api.awardwallet.com/v1';

// Lazy — read at call time so dotenv has already loaded.
export function AW_SIMULATOR_MODE() {
  return !process.env.AWARDWALLET_API_KEY;
}

function getAwKey() {
  return process.env.AWARDWALLET_API_KEY;
}

// Generic demo data shown in simulator mode until the user adds real
// balances (manually in Settings, or via a live AwardWallet sync).
const DEMO_LOYALTY_BALANCES = [
  {
    account_id:     'demo_delta_001',
    program_id:     'delta_skymiles',
    program_name:   'Delta SkyMiles',
    airline_code:   'DL',
    member_label:   'Your Account',
    account_number: '••••••••0000',
    balance:        25000,
    balanceLabel:   'miles',
    expiresAt:      null,
    lastSyncedAt:   new Date().toISOString(),
    status:         'active',
    tier:           null,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Saves a user's AwardWallet account reference (encrypted) to Firestore,
 * then triggers an initial balance sync.
 *
 * In simulator mode: skips the API call and stores a mock reference.
 *
 * @param {string} userId - Firestore user ID
 * @param {string} awUserId - AwardWallet user identifier returned by AW Link
 * @param {object} db - Firestore Admin DB instance
 */
export async function connectAwardWalletAccount(userId, awUserId, db, userEmail) {
  if (AW_SIMULATOR_MODE() || awUserId.startsWith('mock_')) {
    console.log(`[AwardWallet Simulator] Connecting mock Delta SkyMiles account for ${userEmail || userId}`);
    await _saveAWRef(db, userId, {
      awUserId:      `mock_aw_${userId}`,
      connectedAt:   new Date().toISOString(),
      simulatorMode: true,
      userEmail:     userEmail || null,
    });
    return { success: true, simulator: true, programs: ['Delta SkyMiles'] };
  }

  // Real AwardWallet: store the user reference ID returned from AW OAuth Link
  await _saveAWRef(db, userId, {
    awUserId,
    connectedAt:   new Date().toISOString(),
    simulatorMode: false,
  });

  // Immediately fetch connected programs so we can confirm the link
  const programs = await _fetchAWPrograms(awUserId);
  return { success: true, simulator: false, programs };
}

/**
 * Returns all loyalty balances for a user: manually-entered entries
 * (wallet.manualBalances — the primary source) merged with any synced
 * AwardWallet accounts. Demo data is shown only when an AwardWallet
 * simulator connection exists and the user has no manual entries yet.
 *
 * @param {string} userId - Firestore user ID
 * @param {object} db - Firestore Admin DB instance
 */
export async function getAwardWalletBalances(userId, db) {
  const wallet = await loadWallet(db, userId);
  const manual = (wallet?.manualBalances || []).map(withStaleness);
  const awRef  = wallet?.awardwallet;

  let synced = [];
  if (awRef && !awRef.simulatorMode && !AW_SIMULATOR_MODE()) {
    try {
      const accounts = await _fetchAWBalances(awRef.awUserId);
      synced = accounts.map(a => ({ ...a, source: 'awardwallet' }));
    } catch (err) {
      // Degrade to manual entries only rather than failing the whole request
      console.error('[AwardWallet] Balance fetch failed:', err.message);
    }
  } else if (awRef && manual.length === 0) {
    console.log(`[AwardWallet Simulator] Returning demo balances for ${userId}`);
    synced = DEMO_LOYALTY_BALANCES.map(a => ({ ...a, source: 'demo' }));
  }

  return [...manual, ...synced];
}

/**
 * Removes the AwardWallet connection for a user.
 */
export async function disconnectAwardWallet(userId, db) {
  await _saveAWRef(db, userId, null);
  return { success: true };
}

/**
 * Computes how many miles a user would need for a given deal
 * and whether their balances cover it.
 *
 * When live award pricing is available (seats.aero / Gemini), the matching
 * program uses the actual per-passenger award cost; all other programs fall
 * back to a cents-per-mile estimate from the cash price.
 *
 * @param {number} cashPrice - total cash price of the deal (all passengers)
 * @param {Array}  loyaltyBalances - array from getAwardWalletBalances()
 * @param {object} loyaltyPrograms - program catalog with valuations
 * @param {object} [options]
 * @param {object} [options.liveAward] - extractAwardPricing() result: { program_id, miles_per_passenger, taxes_usd_per_passenger, date, source }
 * @param {number} [options.passengers=1] - travelers to price the award for
 */
export function computeAwardAffordability(cashPrice, loyaltyBalances, loyaltyPrograms, options = {}) {
  const { liveAward = null, passengers = 1 } = options;

  // Group accounts by program so family balances are evaluated both individually and combined
  const programGroups = {};
  for (const acct of loyaltyBalances) {
    const key = acct.program_id;
    if (!programGroups[key]) programGroups[key] = { accounts: [], program_id: key, program_name: acct.program_name };
    programGroups[key].accounts.push(acct);
  }

  return Object.values(programGroups).map(group => {
    const programData = loyaltyPrograms[group.program_id] || {};
    const valueCents  = programData.valuation_cents_per_mile || 1.2;

    const isLive = !!(liveAward && liveAward.program_id === group.program_id && liveAward.miles_per_passenger);
    const milesNeeded = isLive
      ? Math.ceil(liveAward.miles_per_passenger * passengers)
      : Math.ceil((cashPrice * 100) / valueCents);
    const combinedBalance = group.accounts.reduce((s, a) => s + a.balance, 0);
    const canAffordCombined = combinedBalance >= milesNeeded;

    const memberBreakdown = group.accounts.map(a => ({
      member_label:  a.member_label || 'Account',
      balance:       a.balance,
      can_afford:    a.balance >= milesNeeded,
      shortfall:     Math.max(0, milesNeeded - a.balance),
    }));

    return {
      program_name:      group.program_name,
      combined_balance:  combinedBalance,
      miles_needed:      milesNeeded,
      can_afford:        canAffordCombined,
      surplus_miles:     combinedBalance - milesNeeded,
      value_per_mile:    `${valueCents}¢`,
      total_value_usd:   ((combinedBalance * valueCents) / 100).toFixed(2),
      member_breakdown:  memberBreakdown,
      account_count:     group.accounts.length,
      pricing_source:    isLive ? (liveAward.source || 'live_award') : 'estimate',
      taxes_usd:         isLive ? +((liveAward.taxes_usd_per_passenger || 0) * passengers).toFixed(2) : null,
      award_date:        isLive ? liveAward.date || null : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers — AwardWallet REST calls
// ---------------------------------------------------------------------------

async function _fetchAWPrograms(awUserId) {
  const resp = await fetch(`${AW_BASE_URL}/users/${awUserId}/accounts`, {
    headers: { Authorization: `Bearer ${getAwKey()}` },
  });
  if (!resp.ok) throw new Error(`AwardWallet API ${resp.status}`);
  const data = await resp.json();
  return (data.accounts || []).map(a => a.program_name);
}

async function _fetchAWBalances(awUserId) {
  const resp = await fetch(`${AW_BASE_URL}/users/${awUserId}/accounts/balances`, {
    headers: { Authorization: `Bearer ${getAwKey()}` },
  });
  if (!resp.ok) throw new Error(`AwardWallet API ${resp.status}`);
  const data = await resp.json();

  return (data.accounts || []).map(acc => ({
    account_id:   acc.id,
    program_id:   _slugify(acc.program_name),
    program_name: acc.program_name,
    airline_code: acc.airline_code || null,
    account_number: acc.masked_number || '••••••••',
    balance:      acc.balance || 0,
    balanceLabel: acc.balance_label || 'miles',
    expiresAt:    acc.expires_at || null,
    lastSyncedAt: new Date().toISOString(),
    status:       acc.status || 'active',
    tier:         acc.elite_tier || null,
  }));
}

async function _saveAWRef(db, userId, awData) {
  try {
    await db.collection('profiles').doc(userId).set(
      { wallet: { awardwallet: awData, updatedAt: new Date().toISOString() } },
      { merge: true }
    );
  } catch (_) {
    console.warn('[AwardWallet] Firestore unavailable — reference not persisted.');
  }
}

function _slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
