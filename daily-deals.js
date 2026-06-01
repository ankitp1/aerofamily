/**
 * daily-deals.js
 * Standalone script: scan for flight deals and share the best ones via WhatsApp.
 * Email is handled by the Cowork scheduler (Gmail MCP) after this script runs.
 * Run: node daily-deals.js
 * Scheduled: every day at 8 AM via Cowork scheduler
 */

import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { runScan } from './agent.js';
import { sendWhatsAppText, sendWhatsAppListMenu } from './whatsappService.js';
import { sendWishlistAlertEmail } from './emailService.js';

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────

const PROFILE_PATH = './data/profiles_guest.json';
const DEALS_PATH   = './data/deals.json';

// WhatsApp recipient — set WA_RECIPIENT_PHONE in .env (e.g. +14045550000)
const WA_PHONE = process.env.WA_RECIPIENT_PHONE;

// How many top deals to share
const TOP_N = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[${new Date().toISOString()}] ${msg}`);
}

function loadProfile() {
  try {
    return JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  } catch {
    return {
      airports: [{ code: 'ATL', name: 'Hartsfield-Jackson Atlanta (ATL)', type: 'biggest' }],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ['Beach', 'Kid-Friendly'] },
      activeEngine: 'travelpayouts',
    };
  }
}

function saveScanDeals(deals) {
  try {
    writeFileSync(DEALS_PATH, JSON.stringify({ deals, updatedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    log(`Warning: could not save deals.json — ${err.message}`);
  }
}

/** Pick the top N deals sorted by discount percentage */
function topDeals(deals, n = TOP_N) {
  return [...deals]
    .map(d => ({ ...d, discountPct: Math.round(((d.normalPrice - d.dealPrice) / d.normalPrice) * 100) }))
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, n);
}

/** Format a deal as a compact text blurb */
function dealText(d, idx) {
  return (
    `${idx + 1}. ✈️ ${d.departureAirport || 'ATL'} → ${d.destination}\n` +
    `   💰 $${d.dealPrice} (was $${d.normalPrice}, save ${d.discountPct}%)\n` +
    `   🗓  ${d.outboundDate} – ${d.returnDate}  |  ${d.airlines}\n` +
    `   ⏰ ${d.bookingWindow}`
  );
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

async function shareViaWhatsApp(deals) {
  if (!WA_PHONE) {
    log('WhatsApp: WA_RECIPIENT_PHONE not set — skipping');
    return { sent: false, reason: 'WA_RECIPIENT_PHONE not configured' };
  }

  const best = topDeals(deals);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  await sendWhatsAppText(WA_PHONE,
    `🛫 *AeroFamily Deal Alert — ${today}*\n\n` +
    `Found ${deals.length} deals. Here are the top ${best.length}:\n\n` +
    best.map(dealText).join('\n\n')
  );

  const sections = [{
    title: 'Top Deals Today',
    rows: best.map((d, i) => ({
      id: `RESEARCH_${d.destinationAirport || i}`,
      title: `${d.destination} — $${d.dealPrice}`,
      description: `Save ${d.discountPct}% · ${d.airlines}`,
    })),
  }];

  await sendWhatsAppListMenu(
    WA_PHONE,
    '✈️ AeroFamily Deals',
    'Tap a destination to get a full AI itinerary for your family.',
    'View Deals',
    sections
  );

  log(`WhatsApp: sent ${best.length} deals to ${WA_PHONE}`);
  return { sent: true, count: best.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== AeroFamily Daily Deal Share — Starting ===');

  const profile = loadProfile();
  const engine  = profile.activeEngine || 'travelpayouts';
  const airports = profile.airports || [{ code: 'ATL' }];

  log(`Scanning with engine="${engine}" for airports: ${airports.map(a => a.code).join(', ')}`);

  let deals = [];
  let scanStatus = 'error';
  try {
    const result = await runScan({
      engine,
      airports,
      geminiKey:           process.env.GEMINI_API_KEY,
      travelpayoutsToken:  process.env.TRAVELPAYOUTS_TOKEN,
      kiwiApiKey:          process.env.KIWI_API_KEY,
    });

    scanStatus = result.status;
    if (result.status === 'success' || result.status === 'warning') {
      deals = result.deals || [];
      log(`Scan complete — ${deals.length} deals found (status: ${result.status})`);
    } else {
      log(`Scan returned status "${result.status}" — ${result.message}`);
    }
  } catch (err) {
    log(`Scan error: ${err.message}`);
  }

  // Budget filter
  const budget = profile.familyProfile?.budget || Infinity;
  deals = deals.filter(d => d.dealPrice <= budget);
  log(`After budget filter ($${budget}): ${deals.length} deals`);

  saveScanDeals(deals);

  let whatsappResult = { sent: false, reason: 'no deals' };
  let emailResult = { sent: false, reason: 'no deals' };
  
  if (deals.length > 0) {
    // WhatsApp generic deals
    whatsappResult = await shareViaWhatsApp(deals).catch(err => ({ sent: false, reason: err.message }));

    // Wishlist Email Alerts
    const wishlist = profile.wishlist || [];

    for (const wish of wishlist) {
      const matchingDeals = deals.filter(d => {
        if (!d.destination.toLowerCase().includes(wish.destination.toLowerCase())) return false;
        if (wish.startMonth && wish.endMonth) {
          const dealMonth = new Date(d.outboundDate).getMonth() + 1;
          const start = parseInt(wish.startMonth);
          const end = parseInt(wish.endMonth);
          if (dealMonth < start || dealMonth > end) return false;
        }
        return true;
      });

      if (matchingDeals.length > 0) {
        try {
          await sendWishlistAlertEmail(matchingDeals, wish.destination);
        } catch (e) {
          log(`Email error: ${e.message}`);
        }
      }
    }
  }

  // Emit structured output for the scheduler (Gmail MCP reads this)
  const top = topDeals(deals);
  const output = {
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    scanStatus,
    totalDeals: deals.length,
    whatsapp: whatsappResult,
    topDeals: top,
  };

  // Print JSON output to stdout for the scheduler to capture
  console.log('DEALS_OUTPUT:' + JSON.stringify(output));
  log('=== Done ===');
}

main();
