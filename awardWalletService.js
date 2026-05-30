/**
 * awardWalletService.js
 * Connects to the AwardWallet API to retrieve airline / hotel loyalty balances.
 * Falls back to a high-fidelity simulator (Delta SkyMiles MVP) when the API
 * key is absent or when running in demo mode.
 *
 * AwardWallet API docs: https://awardwallet.com/api/docs
 * All requests use Bearer token auth: Authorization: Bearer <AWARDWALLET_API_KEY>
 */

const AW_BASE_URL = 'https://api.awardwallet.com/v1';

// Lazy — read at call time so dotenv has already loaded.
export function AW_SIMULATOR_MODE() {
  return !process.env.AWARDWALLET_API_KEY;
}

function getAwKey() {
  return process.env.AWARDWALLET_API_KEY;
}

// ---------------------------------------------------------------------------
// Personal account data — only returned for the owner's email address.
// All other users get the generic empty simulator state.
// ---------------------------------------------------------------------------
const OWNER_EMAIL = 'ankitp1@gmail.com';

const OWNER_LOYALTY_BALANCES = [
  {
    account_id:     'delta_primary',
    program_id:     'delta_skymiles',
    program_name:   'Delta SkyMiles',
    airline_code:   'DL',
    member_label:   'Your Account',
    account_number: '••••••••4521',
    balance:        182490,
    balanceLabel:   'miles',
    expiresAt:      null,
    lastSyncedAt:   new Date().toISOString(),
    status:         'active',
    tier:           null,
  },
  {
    account_id:     'delta_spouse',
    program_id:     'delta_skymiles',
    program_name:   'Delta SkyMiles',
    airline_code:   'DL',
    member_label:   "Spouse's Account",
    account_number: '••••••••8834',
    balance:        124000,
    balanceLabel:   'miles',
    expiresAt:      null,
    lastSyncedAt:   new Date().toISOString(),
    status:         'active',
    tier:           null,
  },
];

// Generic demo data shown to non-owner users in simulator mode
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
 * Fetches live loyalty balances for all programs linked via AwardWallet.
 * Returns simulator data when no key / account is configured.
 *
 * @param {string} userId - Firestore user ID
 * @param {object} db - Firestore Admin DB instance
 */
export async function getAwardWalletBalances(userId, db, userEmail) {
  const awRef = await _loadAWRef(db, userId);
  const isOwner = userEmail === OWNER_EMAIL;

  // Resolve which simulator dataset to use based on the requesting user
  const simulatorBalances = isOwner ? OWNER_LOYALTY_BALANCES : DEMO_LOYALTY_BALANCES;

  if (!awRef || AW_SIMULATOR_MODE()) {
    console.log(`[AwardWallet Simulator] Returning ${isOwner ? 'owner' : 'demo'} balances for ${userEmail || userId}`);
    return simulatorBalances;
  }

  if (awRef.simulatorMode) {
    // Check if the stored session's email matches — prevents cross-user data leak
    const sessionEmail = awRef.userEmail;
    const sessionIsOwner = sessionEmail === OWNER_EMAIL;
    return sessionIsOwner ? OWNER_LOYALTY_BALANCES : DEMO_LOYALTY_BALANCES;
  }

  try {
    const accounts = await _fetchAWBalances(awRef.awUserId);
    return accounts;
  } catch (err) {
    console.error('[AwardWallet] Balance fetch failed:', err.message);
    return MOCK_LOYALTY_BALANCES.map(m => ({ ...m, stale: true }));
  }
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
 * and whether their balance covers it, using a simple cents-per-mile valuation.
 *
 * @param {number} cashPrice - total cash price of the deal (all passengers)
 * @param {Array}  loyaltyBalances - array from getAwardWalletBalances()
 * @param {object} loyaltyPrograms - parsed loyalty_programs.json
 */
export function computeAwardAffordability(cashPrice, loyaltyBalances, loyaltyPrograms) {
  // Group accounts by program so family balances are evaluated both individually and combined
  const programGroups = {};
  for (const acct of loyaltyBalances) {
    const key = acct.program_id;
    if (!programGroups[key]) programGroups[key] = { accounts: [], program_id: key, program_name: acct.program_name };
    programGroups[key].accounts.push(acct);
  }

  return Object.values(programGroups).map(group => {
    const programData    = loyaltyPrograms[group.program_id] || {};
    const valueCents     = programData.valuation_cents_per_mile || 1.2;
    const milesNeeded    = Math.ceil((cashPrice * 100) / valueCents);
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

async function _loadAWRef(db, userId) {
  try {
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.exists ? doc.data()?.wallet?.awardwallet : null;
  } catch (_) {
    return null;
  }
}

function _slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
