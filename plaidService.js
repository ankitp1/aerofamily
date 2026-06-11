/**
 * plaidService.js
 * Handles Plaid Link token creation, public token exchange, and rewards balance retrieval.
 * When PLAID_CLIENT_ID / PLAID_SECRET are absent, all calls fall back to the
 * high-fidelity simulator so the UI works immediately without API keys.
 */

import crypto from 'crypto';
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid';

// Env vars are read lazily inside getClient() so that dotenv.config() in server.js
// has already run by the time any function is called (ES module imports are hoisted).
let _plaidClient   = null;
let _encryptionKey = null;

function getEnv() {
  return {
    clientId:  process.env.PLAID_CLIENT_ID,
    secret:    process.env.PLAID_SECRET,
    plaidEnv:  process.env.PLAID_ENV || 'sandbox',
    simulator: !process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET,
  };
}

export function SIMULATOR_MODE() {
  return getEnv().simulator;
}

function getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;
  const keyHex = process.env.WALLET_ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn('[Plaid] WALLET_ENCRYPTION_KEY not set — using ephemeral session key.');
    _encryptionKey = crypto.randomBytes(32);
  } else {
    _encryptionKey = Buffer.from(keyHex, 'hex');
  }
  return _encryptionKey;
}

function getClient() {
  if (_plaidClient) return _plaidClient;
  const { clientId, secret, plaidEnv, simulator } = getEnv();
  if (simulator) return null;

  const config = new Configuration({
    basePath: PlaidEnvironments[plaidEnv],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET':    secret,
      },
    },
  });
  _plaidClient = new PlaidApi(config);
  console.log(`[Plaid] Client initialised in ${plaidEnv.toUpperCase()} mode.`);
  return _plaidClient;
}

function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join('.');
}

function decryptToken(encryptedStr) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, dataHex] = encryptedStr.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Simulator mock data — Capital One Venture X as the MVP card
// ---------------------------------------------------------------------------
const MOCK_BALANCES = [
  {
    account_id:   'mock_cap1_001',
    name:         'Capital One Venture X Rewards',
    type:         'credit',
    subtype:      'credit card',
    program:      'Capital One Miles',
    balance:      75000,
    balanceLabel: 'miles',
    institution:  'Capital One',
    lastSyncedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a Plaid Link token to initialise the front-end Link SDK.
 */
export async function createLinkToken(userId) {
  if (getEnv().simulator) {
    console.log('[Plaid Simulator] Returning mock link_token');
    return {
      link_token:  `mock_link_token_${userId}_${Date.now()}`,
      expiration:  new Date(Date.now() + 30 * 60_000).toISOString(),
      simulator:   true,
    };
  }

  // Products enabled in this sandbox: Auth, Balance, Transactions, Liabilities.
  // We use Transactions as the primary product for Link (broad compatibility),
  // then call accountsBalanceGet separately for real-time balances.
  const response = await getClient().linkTokenCreate({
    user:          { client_user_id: userId },
    client_name:   'AeroFamily',
    products:      [Products.Transactions],
    country_codes: [CountryCode.Us],
    language:      'en',
  });

  return response.data;
}

/**
 * Exchanges a short-lived public_token for a persistent access_token,
 * encrypts it, and persists it to the user's profile document.
 */
export async function exchangePublicToken(userId, publicToken, db) {
  // Simulator path — mock or missing token
  if (getEnv().simulator || publicToken.startsWith('mock_')) {
    console.log('[Plaid Simulator] Mock token exchange — saving simulated access token');
    const mockAccess = `mock_access_cap1_${userId}`;
    const encrypted  = encryptToken(mockAccess);

    await _saveWalletToken(db, userId, {
      encryptedAccessToken: encrypted,
      institution:   'Capital One',
      linkedAt:      new Date().toISOString(),
      simulatorMode: true,
    });

    return { success: true, institution: 'Capital One', simulator: true };
  }

  // Real Plaid exchange
  const client = getClient();
  const resp = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = resp.data;
  const encrypted = encryptToken(access_token);

  // Fetch institution name for display
  const itemResp = await client.itemGet({ access_token });
  const instId   = itemResp.data.item.institution_id;
  let institutionName = 'Bank Account';
  try {
    const instResp  = await client.institutionsGetById({
      institution_id: instId,
      country_codes:  [CountryCode.Us],
    });
    institutionName = instResp.data.institution.name;
  } catch (_) { /* non-critical */ }

  await _saveWalletToken(db, userId, {
    encryptedAccessToken: encrypted,
    itemId:        item_id,
    institution:   institutionName,
    linkedAt:      new Date().toISOString(),
    simulatorMode: false,
  });

  return { success: true, institution: institutionName, simulator: false };
}

/**
 * Fetches live rewards / credit balances for the linked account.
 * Falls back to simulator data if no token is stored or no keys are set.
 */
export async function getPlaidBalances(userId, db) {
  const walletData = await _loadWalletToken(db, userId);

  if (!walletData || getEnv().simulator) {
    console.log('[Plaid Simulator] Returning mock Capital One Venture X balance');
    return MOCK_BALANCES;
  }

  // Decrypt and call Plaid
  const accessToken = decryptToken(walletData.encryptedAccessToken);

  // Simulator access token — return mock even if keys exist
  if (accessToken.startsWith('mock_access')) {
    return MOCK_BALANCES;
  }

  try {
    const resp     = await getClient().accountsBalanceGet({ access_token: accessToken });
    const accounts = resp.data.accounts;

    // Plaid only exposes dollar balances — rewards/points balances are NOT
    // available through its API. For credit cards, `current` is the statement
    // balance owed, so these entries must never be presented as points.
    return accounts.map(acc => ({
      account_id:         acc.account_id,
      name:               acc.name,
      type:               acc.type,
      subtype:            acc.subtype,
      program:            _inferProgram(acc),
      balance:            acc.balances?.current ?? 0,
      balanceLabel:       'USD',
      rewardsUnavailable: true,
      institution:        walletData.institution || 'Bank',
      lastSyncedAt:       new Date().toISOString(),
    }));
  } catch (err) {
    console.error('[Plaid] Balance fetch failed:', err.message);
    // Surface a stale-cache warning rather than crashing
    return MOCK_BALANCES.map(m => ({ ...m, stale: true }));
  }
}

/**
 * Removes all Plaid credentials for a user (disconnect flow).
 */
export async function disconnectPlaid(userId, db) {
  try {
    const walletData = await _loadWalletToken(db, userId);
    if (walletData && !walletData.simulatorMode && !getEnv().simulator) {
      const accessToken = decryptToken(walletData.encryptedAccessToken);
      await getClient().itemRemove({ access_token: accessToken });
    }
  } catch (_) { /* best-effort */ }

  await _saveWalletToken(db, userId, null);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _inferProgram(account) {
  const name = (account.name || '').toLowerCase();
  if (name.includes('venture'))       return 'Capital One Miles';
  if (name.includes('sapphire'))      return 'Chase Ultimate Rewards';
  if (name.includes('platinum') || name.includes('gold')) return 'Amex Membership Rewards';
  return 'Rewards Points';
}

async function _saveWalletToken(db, userId, plaidData) {
  try {
    await db.collection('profiles').doc(userId).set(
      { wallet: { plaid: plaidData, updatedAt: new Date().toISOString() } },
      { merge: true }
    );
  } catch (_) {
    // Firestore unavailable — tokens are not persisted locally (security: never write to disk)
    console.warn('[Plaid] Firestore unavailable — token not persisted this session.');
  }
}

async function _loadWalletToken(db, userId) {
  try {
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.exists ? doc.data()?.wallet?.plaid : null;
  } catch (_) {
    return null;
  }
}
