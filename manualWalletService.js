/**
 * manualWalletService.js
 * CRUD for manually-entered loyalty balances, stored on the user's profile
 * under wallet.manualBalances. This is the primary balance source: points
 * balances change roughly monthly, so a 30-second manual update covers most
 * families without requiring bank/airline aggregator partnerships.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_LOYALTY_PROGRAMS } from './loyaltyPrograms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STALE_AFTER_DAYS = 30;

/**
 * Annotates a balance entry with its age and a staleness flag so the UI can
 * nudge the user to refresh numbers older than STALE_AFTER_DAYS.
 */
export function withStaleness(entry) {
  const ageDays = entry.updatedAt
    ? Math.floor((Date.now() - new Date(entry.updatedAt).getTime()) / 86_400_000)
    : null;
  return { ...entry, ageDays, stale: ageDays !== null && ageDays > STALE_AFTER_DAYS };
}

export async function listManualBalances(userId, db) {
  const wallet = await loadWallet(db, userId);
  return (wallet?.manualBalances || []).map(withStaleness);
}

/**
 * Adds a new entry, or updates an existing one when entry.account_id matches.
 * Accepts a program_id from the catalog, or a free-text program_name for
 * programs we don't know about (slugified into a stable id).
 */
export async function upsertManualBalance(userId, db, entry) {
  const balance = Number(entry.balance);
  if (!Number.isFinite(balance) || balance < 0) {
    throw new Error('balance must be a non-negative number');
  }

  const programId = entry.program_id || _slugify(entry.program_name);
  if (!programId) throw new Error('program_id or program_name required');
  const catalog = DEFAULT_LOYALTY_PROGRAMS[programId];
  const programName = catalog?.program_name || entry.program_name || programId;

  const wallet = (await loadWallet(db, userId)) || {};
  const balances = wallet.manualBalances || [];

  const record = {
    account_id:   entry.account_id || `manual_${crypto.randomUUID()}`,
    source:       'manual',
    program_id:   programId,
    program_name: programName,
    airline_code: catalog?.airline_code || null,
    member_label: String(entry.member_label || 'Your Account').slice(0, 60),
    balance:      Math.round(balance),
    balanceLabel: entry.balanceLabel || (catalog?.type === 'bank' ? 'points' : 'miles'),
    updatedAt:    new Date().toISOString(),
  };

  const idx = balances.findIndex(b => b.account_id === record.account_id);
  if (idx >= 0) balances[idx] = record;
  else balances.push(record);

  await _saveManualBalances(db, userId, balances);
  return withStaleness(record);
}

export async function deleteManualBalance(userId, db, accountId) {
  const wallet = (await loadWallet(db, userId)) || {};
  const balances = (wallet.manualBalances || []).filter(b => b.account_id !== accountId);
  await _saveManualBalances(db, userId, balances);
  return { success: true, remaining: balances.length };
}

/**
 * Loads the user's wallet object, falling back to the local file store
 * (data/profiles_{userId}.json — same convention as server.js getDbDoc)
 * when Firestore is unavailable in local development.
 */
export async function loadWallet(db, userId) {
  try {
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.exists ? doc.data()?.wallet : null;
  } catch {
    const profile = await _loadProfileFile(userId);
    return profile?.wallet || null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _saveManualBalances(db, userId, balances) {
  const walletPatch = { manualBalances: balances, updatedAt: new Date().toISOString() };
  try {
    await db.collection('profiles').doc(userId).set({ wallet: walletPatch }, { merge: true });
  } catch (err) {
    console.warn(`[ManualWallet] Firestore unavailable — saving to local file:`, err.message);
    const profile = (await _loadProfileFile(userId)) || {};
    profile.wallet = { ...(profile.wallet || {}), ...walletPatch };
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    await fs.writeFile(_profileFilePath(userId), JSON.stringify(profile, null, 2), 'utf8');
  }
}

function _profileFilePath(userId) {
  return path.join(__dirname, 'data', `profiles_${userId}.json`);
}

async function _loadProfileFile(userId) {
  try {
    return JSON.parse(await fs.readFile(_profileFilePath(userId), 'utf8'));
  } catch {
    return null;
  }
}

function _slugify(str) {
  return (str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
