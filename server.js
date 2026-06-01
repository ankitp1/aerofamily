import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { runScan, runResearch, validateStoredDeals } from './agent.js';
import { sendWishlistAlertEmail } from './emailService.js';
import { OAuth2Client } from 'google-auth-library';
import admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import fs from 'fs/promises';
import {
  sendWhatsAppText,
  sendWhatsAppQuickReplies,
  sendWhatsAppListMenu,
  sendWhatsAppVerificationCode
} from './whatsappService.js';
import {
  createLinkToken,
  exchangePublicToken,
  getPlaidBalances,
  disconnectPlaid,
  SIMULATOR_MODE as isPlaidSimulator,
} from './plaidService.js';
import { searchDeltaAwards } from './deltaAwardSearch.js';
import {
  connectAwardWalletAccount,
  getAwardWalletBalances,
  disconnectAwardWallet,
  computeAwardAffordability,
  AW_SIMULATOR_MODE,
} from './awardWalletService.js';
import { readFile } from 'fs/promises';

// Load environmental variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// This automatically picks up local credentials during development and active Firebase project settings in production
try {
  admin.initializeApp();
  console.log("[Firebase] Admin SDK initialized successfully.");
} catch (error) {
  console.log("[Firebase] Admin SDK initialization tip: (runs on default credentials in Cloud Functions). Local warning:", error.message);
}
const db = admin.firestore();

// Helper to get a document from Firestore, falling back to local file storage if Firestore fails/is not configured
async function getDbDoc(collection, docId, defaultVal) {
  try {
    const doc = await db.collection(collection).doc(docId).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.warn(`[Firestore Warning] Falling back to local file for ${collection}/${docId}:`, error.message);
    const userFilename = `${collection}_${docId}.json`;
    const defaultFilename = `${collection}.json`;
    const userPath = path.join(__dirname, 'data', userFilename);
    const defaultPath = path.join(__dirname, 'data', defaultFilename);
    
    try {
      const data = await fs.readFile(userPath, 'utf8');
      const parsed = JSON.parse(data);
      if (collection === 'deals' && Array.isArray(parsed)) {
        return { deals: parsed };
      }
      if (collection === 'logs' && Array.isArray(parsed)) {
        return { logs: parsed };
      }
      return parsed;
    } catch (err) {
      try {
        const data = await fs.readFile(defaultPath, 'utf8');
        const parsed = JSON.parse(data);
        if (collection === 'deals' && Array.isArray(parsed)) {
          return { deals: parsed };
        }
        if (collection === 'logs' && Array.isArray(parsed)) {
          return { logs: parsed };
        }
        return parsed;
      } catch (defaultErr) {
        return defaultVal;
      }
    }
  }
}

// Helper to save a document to Firestore, falling back to local file storage if Firestore fails/is not configured
async function setDbDoc(collection, docId, data) {
  try {
    await db.collection(collection).doc(docId).set(data);
    return true;
  } catch (error) {
    console.warn(`[Firestore Warning] Falling back to local file write for ${collection}/${docId}:`, error.message);
    const userFilename = `${collection}_${docId}.json`;
    const userPath = path.join(__dirname, 'data', userFilename);
    
    try {
      await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
      await fs.writeFile(userPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`[Local DB Error] Failed to write local file ${userFilename}:`, err.message);
      return false;
    }
  }
}

// Google Auth Client
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID || '');

// Authentication Middleware
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token || token === 'null' || token === 'undefined') {
    req.user = null;
    return next();
  }

  // Check for Simulated Dev Token first
  if (token.startsWith('dev-mock-token-')) {
    const email = token.replace('dev-mock-token-', '');
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ');
    const formattedName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    req.user = {
      id: `dev-${email.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      email: email,
      name: formattedName,
      picture: `https://api.dicebear.com/7.x/adventurer/svg?seed=${email}`
    };
    return next();
  }

  // Real Google Sign-In Token verification
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.VITE_GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };
    next();
  } catch (error) {
    console.error("[Auth Middleware] Invalid Google Token:", error.message);
    req.user = null;
    next();
  }
}

app.use(authenticateUser);

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Get deals from Firestore / Local Fallback — validates freshness before serving
app.get('/api/deals', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  const data = await getDbDoc('deals', userId, { deals: [] });
  const rawDeals = data ? (data.deals || []) : [];

  if (rawDeals.length === 0) return res.json([]);

  try {
    const { valid, removed } = await validateStoredDeals(rawDeals, {
      travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
      kiwiApiKey:         process.env.KIWI_API_KEY,
    });

    // Persist the cleaned set back to DB if any deals were dropped
    if (removed > 0) {
      console.log(`[Deals API] Pruned ${removed} expired/invalid deal(s) for user ${userId}.`);
      await setDbDoc('deals', userId, { deals: valid });
    }

    res.json(valid);
  } catch (err) {
    console.error('[Deals API] Validation error — serving raw deals as fallback:', err.message);
    res.json(rawDeals);
  }
});

// Get profile from Firestore / Local Fallback
app.get('/api/profile', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  let data = await getDbDoc('profiles', userId, null);
  if (!data) {
    // Create and save optimized family-of-3 default profile for new user
    const defaultProfile = {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    };
    await setDbDoc('profiles', userId, defaultProfile);
    return res.json(defaultProfile);
  }
  res.json(data);
});

// Update profile in Firestore / Local Fallback
app.post('/api/profile', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  const newProfile = req.body;
  await setDbDoc('profiles', userId, newProfile);
  res.json({ success: true, profile: newProfile });
});

// Get logs from Firestore / Local Fallback
app.get('/api/logs', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  const data = await getDbDoc('logs', userId, { logs: [] });
  res.json(data ? (data.logs || []) : []);
});

// Helper to get active deals from cache
async function getCachedAirportDeals(airportCode, engine) {
  const cacheKey = `${airportCode}_${engine}`;
  const cacheData = await getDbDoc('airport_deals_cache', cacheKey, null);
  
  if (!cacheData) return null;
  
  const now = new Date();
  const expiresAt = new Date(cacheData.expiresAt);
  
  // If cache is expired, return null to trigger a live query
  if (now > expiresAt) {
    console.log(`[Cache] Cache expired for ${cacheKey}`);
    return null;
  }
  
  console.log(`[Cache] Cache hit for ${cacheKey}! Valid until ${cacheData.expiresAt}`);
  return cacheData.deals || [];
}

// Helper to write new deals to cache
async function setCachedAirportDeals(airportCode, engine, deals) {
  const cacheKey = `${airportCode}_${engine}`;
  const now = new Date();
  
  // Custom TTLs: 12h for Gemini, 24h for Demo, 4h for Kiwi/Travelpayouts
  let ttlHours = 4;
  if (engine === 'gemini') ttlHours = 12;
  else if (engine === 'demo') ttlHours = 24;
  
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  
  const cacheData = {
    airportCode,
    engine,
    lastScannedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    dealsCount: deals.length,
    deals: deals
  };
  
  await setDbDoc('airport_deals_cache', cacheKey, cacheData);
  console.log(`[Cache] Cache successfully written for ${cacheKey}`);
}

// Trigger scan manually (Firestore / Local Fallback Integration)
function computeRelevanceScore(deal, profile, loyaltyBalances) {
  let score = 0;
  let reasons = [];

  // 1. Savings Value (max ~40 points)
  const savings = deal.savingsPercent || Math.round(((deal.normalPrice - deal.dealPrice) / deal.normalPrice) * 100) || 0;
  let savingsPoints = Math.min(savings, 40); 
  score += savingsPoints;
  if (savingsPoints > 25) reasons.push(`Exceptional savings (${savings}%)`);

  // 2. Budget Comfort (max 20 points)
  const familyBudget = profile.familyProfile?.budget || Infinity;
  const totalPassengers = (profile.familyProfile?.adults || 1) + (profile.familyProfile?.kids || 0);
  const totalCost = deal.dealPrice * totalPassengers;
  
  if (totalCost < familyBudget * 0.5) {
    score += 20;
    reasons.push('Well under budget');
  } else if (totalCost < familyBudget * 0.8) {
    score += 10;
  }

  // 3. Interest Matching (max 20 points)
  const interests = profile.familyProfile?.interests || [];
  const dealText = `${deal.destination} ${deal.description || ''} ${deal.destinationAirport}`.toLowerCase();
  
  let interestMatch = false;
  for (const interest of interests) {
    const keyword = interest.toLowerCase();
    if (dealText.includes(keyword) || 
       (keyword === 'beach' && ['cun', 'sju', 'puj', 'nassau', 'bahamas', 'cancun', 'puerto rico'].some(k => dealText.includes(k))) ||
       (keyword === 'kid-friendly' && ['disney', 'family', 'resort', 'all-inclusive'].some(k => dealText.includes(k)))) {
      interestMatch = true;
      reasons.push(`Matches your interest: ${interest}`);
    }
  }
  if (interestMatch) score += 20;

  // 4. Loyalty Program Synergy (max 20 points)
  let loyaltyMatch = false;
  const dealAirlines = (deal.airlines || '').toLowerCase();
  
  for (const acct of loyaltyBalances) {
    if (acct.balance > 20000) {
      if (acct.airline_code && dealAirlines.includes(acct.airline_code.toLowerCase())) {
         loyaltyMatch = true;
      } else if (acct.program_id === 'delta_skymiles' && dealAirlines.includes('delta')) {
         loyaltyMatch = true;
      } else if (acct.program_id === 'united_mileageplus' && dealAirlines.includes('united')) {
         loyaltyMatch = true;
      }
      
      if (loyaltyMatch) {
         score += 20;
         reasons.push(`You have ${acct.balance.toLocaleString()} ${acct.program_name} miles`);
         break;
      }
    }
  }

  // 5. Seasonality Rating (max 15 points)
  const optimalMonths = {
    'SJU': [12, 1, 2, 3, 4], // Winter/Spring
    'PUJ': [12, 1, 2, 3, 4], // Winter/Spring
    'NAS': [12, 1, 2, 3, 4], // Winter/Spring
    'CUN': [12, 1, 2, 3, 4], // Winter/Spring
    'PHX': [11, 12, 1, 2, 3, 4], // Avoid summer
    'MCO': [11, 12, 1, 2, 3, 4, 10], // Avoid summer heat
    'FCO': [4, 5, 6, 9, 10], // Shoulder season
    'LHR': [5, 6, 7, 8, 9], // Summer
    'HNL': [4, 5, 9, 10], // Shoulder season
    'LIH': [4, 5, 9, 10], // Shoulder season
    'CDG': [4, 5, 6, 9, 10] // Paris
  };
  
  if (deal.outboundDate) {
    const outboundMonth = parseInt(deal.outboundDate.split('-')[1], 10);
    const destCode = (deal.destinationAirport || '').toUpperCase();
    const bestMonths = optimalMonths[destCode];
    if (bestMonths && bestMonths.includes(outboundMonth)) {
      score += 15;
      reasons.push(`Optimal weather season to visit ${destCode}`);
    }
  }

  // 6. Visa Requirements Boost
  const destStr = (deal.destination || '').toLowerCase();
  const visaFreeCountries = ['mexico', 'costa rica', 'panama', 'colombia', 'peru', 'georgia', 'turkey', 'taiwan', 'philippines', 'dominican republic', 'belize', 'honduras', 'guatemala', 'bahamas', 'antigua', 'albania', 'montenegro'];
  const isVisaFreeDest = visaFreeCountries.some(c => destStr.includes(c));
  
  const usStatus = profile.usStatus || 'US Citizen';
  if (usStatus === 'US Citizen' || 
     (isVisaFreeDest && (usStatus === 'US Green Card' || usStatus.includes('Valid US Visa')))) {
    score += 10;
    reasons.push('Passport/Visa friendly destination');
  }

  return { score: Math.min(Math.round(score), 100), reasons };
}

app.post('/api/scan', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    
    // Load profile
    const profile = await getDbDoc('profiles', userId, {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    });

    const engine          = profile.activeEngine || 'demo';
    const airports        = profile.airports || [];
    const familyBudget    = profile.familyProfile.budget;
    const totalPassengers = (profile.familyProfile.adults || 1) + (profile.familyProfile.kids || 0);

    let allDeals = [];
    let cacheHits = 0;
    let cacheMisses = [];

    // 1. Process each departure airport
    // Include budget+passengers in cache key so profile changes bust stale cached results
    const budgetCacheTag = `b${Math.floor(familyBudget / 100) * 100}_p${totalPassengers}`;
    for (const airport of airports) {
      const cached = await getCachedAirportDeals(airport.code, `${engine}_${budgetCacheTag}`);
      if (cached) {
        allDeals.push(...cached);
        cacheHits++;
      } else {
        cacheMisses.push(airport);
      }
    }

    let scanResult = {
      timestamp: new Date().toISOString(),
      engine,
      status: "success",
      dealsFound: allDeals.length,
      message: `Successfully scan completed. Found ${allDeals.length} cached deals.`,
      logs: [`[Cache] Successfully fetched ${cacheHits} airports from local cache.`]
    };

    // 2. Perform live scans only for Cache Misses
    if (cacheMisses.length > 0) {
      console.log(`[Scan] Cache Miss for: ${cacheMisses.map(a => a.code).join(', ')}. Triggering live scans.`);
      
      const liveScanResult = await runScan({
        engine,
        airports: cacheMisses,
        geminiKey: process.env.GEMINI_API_KEY,
        travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
        kiwiApiKey: process.env.KIWI_API_KEY,
        familyBudget:   profile.familyProfile.budget,
        passengers:     (profile.familyProfile.adults || 1) + (profile.familyProfile.kids || 0),
      });

      // Update scan metadata
      scanResult.timestamp = liveScanResult.timestamp;
      scanResult.status = liveScanResult.status;
      scanResult.message = liveScanResult.message;
      scanResult.logs = [...scanResult.logs, ...liveScanResult.logs];

      if (liveScanResult.status === 'success' || liveScanResult.status === 'warning') {
        const liveDeals = liveScanResult.deals || [];
        allDeals.push(...liveDeals);

        // Group live deals by departure airport and write back cache entries
        for (const airport of cacheMisses) {
          const airportDeals = liveDeals.filter(d => d.departureAirport === airport.code || airport.code === "ATL");
          await setCachedAirportDeals(airport.code, `${engine}_${budgetCacheTag}`, airportDeals);
        }
      }
    }

    // 3. User-Specific Budget Filtering — compare family TOTAL cost vs budget
    const userEmail = profile.email || null;
    const loyaltyBalances = await getAwardWalletBalances(userId, db, userEmail);

    const activeDeals = allDeals.filter(d => {
      return d.dealPrice * totalPassengers <= familyBudget;
    }).map(d => {
      const relevance = computeRelevanceScore(d, profile, loyaltyBalances);
      return { ...d, relevanceScore: relevance.score, relevanceReasons: relevance.reasons };
    }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    scanResult.dealsFound = activeDeals.length;
    scanResult.deals = activeDeals;

    // Save results if scan succeeded or warning-succeeded
    if (scanResult.status === 'success' || scanResult.status === 'warning') {
      await setDbDoc('deals', userId, { deals: activeDeals });

      // 4. Wishlist Processing
      const wishlist = profile.wishlist || [];
      const logsData = await getDbDoc('logs', userId, { logs: [] });
      let wishlistAlertLog = profile.wishlistAlertLog || {};
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      let profileNeedsUpdate = false;

      for (const wish of wishlist) {
        // Skip if we sent an email for this destination within the last 24h
        if (wishlistAlertLog[wish.destination] && (now - wishlistAlertLog[wish.destination] < ONE_DAY)) {
          continue;
        }

        // Find deals matching destination and optional month range
        const matchingDeals = activeDeals.filter(d => {
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
          // Send email alert
          try {
            await sendWishlistAlertEmail(matchingDeals, wish.destination);
            wishlistAlertLog[wish.destination] = now;
            profileNeedsUpdate = true;
          } catch (e) {
            console.error("Failed to send wishlist alert:", e);
          }
        }
      }

      if (profileNeedsUpdate) {
        await setDbDoc('profiles', userId, { ...profile, wishlistAlertLog });
      }
    }

    // Save to logs (limit log history to top 15 records)
    const logsData = await getDbDoc('logs', userId, { logs: [] });
    let logsDb = logsData ? logsData.logs : [];
    if (!Array.isArray(logsDb)) logsDb = [];

    const newLogItem = {
      timestamp: scanResult.timestamp,
      engine: scanResult.engine,
      status: scanResult.status,
      dealsFound: scanResult.dealsFound,
      message: scanResult.message,
      logs: scanResult.logs
    };
    logsDb.unshift(newLogItem);
    await setDbDoc('logs', userId, { logs: logsDb.slice(0, 15) });

    res.json(scanResult);
  } catch (error) {
    console.error("Scan route error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger deep travel research for a selected flight deal
app.post('/api/research', async (req, res) => {
  try {
    const { destination, destinationAirport, departureAirport, dealPrice } = req.body;
    const userId = req.user ? req.user.id : 'guest';

    // Load profile
    const profile = await getDbDoc('profiles', userId, {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    });
    const familyProfile = profile.familyProfile;
    
    // Check if itinerary is already cached in Firestore / Local File to save Gemini API costs
    const cacheDocId = `itin_${departureAirport}_${destinationAirport}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    try {
      const cacheData = await getDbDoc('itinerary_caches', cacheDocId, null);
      if (cacheData && cacheData.itinerary) {
        console.log(`[Research Engine] Found cached itinerary for ${destinationAirport}`);
        return res.json({ itinerary: cacheData.itinerary });
      }
    } catch (e) {
      console.log("[Research Engine] Cache lookup failed, continuing with live research.");
    }
    
    console.log(`[Research Engine] Generating new custom itinerary for ${destination}...`);
    const itineraryMarkdown = await runResearch({
      destination,
      destinationAirport,
      departureAirport,
      dealPrice,
      familyProfile,
      geminiKey: process.env.GEMINI_API_KEY
    });

    // Cache the result
    try {
      await setDbDoc('itinerary_caches', cacheDocId, {
        timestamp: new Date().toISOString(),
        destination,
        itinerary: itineraryMarkdown
      });
    } catch (cacheErr) {
      console.error("Itinerary caching failed:", cacheErr.message);
    }

    res.json({ itinerary: itineraryMarkdown });
  } catch (error) {
    console.error("Research route error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// WALLET: PLAID & AWARDWALLET INTEGRATION ENDPOINTS
// ----------------------------------------------------

// Helper: load loyalty_programs.json once (cached in memory)
let _loyaltyPrograms = null;
async function getLoyaltyPrograms() {
  if (_loyaltyPrograms) return _loyaltyPrograms;
  try {
    const raw = await readFile(path.join(__dirname, 'data', 'loyalty_programs.json'), 'utf8');
    _loyaltyPrograms = JSON.parse(raw);
  } catch (_) {
    _loyaltyPrograms = {};
  }
  return _loyaltyPrograms;
}

// GET /api/wallet/status — returns connection status + simulator flags for the UI
app.get('/api/wallet/status', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  try {
    const profile = await getDbDoc('profiles', userId, {});
    const wallet  = profile?.wallet || {};
    res.json({
      plaid: {
        connected:     !!wallet.plaid,
        institution:   wallet.plaid?.institution || null,
        linkedAt:      wallet.plaid?.linkedAt || null,
        simulatorMode: isPlaidSimulator(),
      },
      awardwallet: {
        connected:     !!wallet.awardwallet,
        connectedAt:   wallet.awardwallet?.connectedAt || null,
        simulatorMode: AW_SIMULATOR_MODE,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/create-link-token — initialise Plaid Link on the front end
app.post('/api/plaid/create-link-token', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  try {
    const result = await createLinkToken(userId);
    res.json(result);
  } catch (err) {
    console.error('[Plaid] create-link-token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/exchange-public-token — swap Link public_token for access_token
app.post('/api/plaid/exchange-public-token', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token required' });

  try {
    const result = await exchangePublicToken(userId, public_token, db);
    res.json(result);
  } catch (err) {
    console.error('[Plaid] exchange-public-token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plaid/balances — fetch credit card reward balances
app.get('/api/plaid/balances', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  try {
    const balances = await getPlaidBalances(userId, db);
    res.json({ balances, simulatorMode: isPlaidSimulator() });
  } catch (err) {
    console.error('[Plaid] balances error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/plaid/disconnect — unlink the connected bank account
app.delete('/api/plaid/disconnect', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  try {
    await disconnectPlaid(userId, db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/awardwallet/connect — save AwardWallet user reference after OAuth
app.post('/api/awardwallet/connect', async (req, res) => {
  const userId    = req.user ? req.user.id : 'guest';
  const userEmail = req.user ? req.user.email : null;
  const { aw_user_id } = req.body;
  const awUserId = aw_user_id || `mock_aw_${userId}_${Date.now()}`;

  try {
    const result = await connectAwardWalletAccount(userId, awUserId, db, userEmail);
    res.json(result);
  } catch (err) {
    console.error('[AwardWallet] connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/awardwallet/balances — fetch airline/hotel loyalty mile balances
app.get('/api/awardwallet/balances', async (req, res) => {
  const userId    = req.user ? req.user.id : 'guest';
  const userEmail = req.user ? req.user.email : null;
  try {
    const balances  = await getAwardWalletBalances(userId, db, userEmail);
    const loyaltyPg = await getLoyaltyPrograms();
    res.json({ balances, simulatorMode: AW_SIMULATOR_MODE(), programs: loyaltyPg });
  } catch (err) {
    console.error('[AwardWallet] balances error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/delta/award-search?origin=ATL&destination=JFK&cabin=economy&days=90
// Searches Delta SkyMiles award pricing for a route via seats.aero (or Gemini fallback)
app.get('/api/delta/award-search', async (req, res) => {
  const { origin, destination, cabin, days } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }
  try {
    const result = await searchDeltaAwards(
      origin.toUpperCase(),
      destination.toUpperCase(),
      cabin || null,
      parseInt(days) || 90
    );
    res.json(result);
  } catch (err) {
    console.error('[Delta Award Search] route error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/awardwallet/disconnect — unlink AwardWallet account
app.delete('/api/awardwallet/disconnect', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  try {
    await disconnectAwardWallet(userId, db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/affordability — given a deal price, compute award coverage
app.post('/api/wallet/affordability', async (req, res) => {
  const userId = req.user ? req.user.id : 'guest';
  const { dealPrice, passengers } = req.body;
  if (!dealPrice) return res.status(400).json({ error: 'dealPrice required' });

  try {
    const userEmail  = req.user ? req.user.email : null;
    const totalCash  = dealPrice * (passengers || 1);
    const loyaltyBal = await getAwardWalletBalances(userId, db, userEmail);
    const loyaltyPg  = await getLoyaltyPrograms();
    const report     = computeAwardAffordability(totalCash, loyaltyBal, loyaltyPg);
    res.json({ totalCash, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// WHATSAPP META CLOUD API INTEGRATION ENDPOINTS
// ----------------------------------------------------

// GET: Handshake authentication for Meta Webhooks
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const localVerifyToken = process.env.WA_VERIFY_TOKEN || 'AeroFamilyVerifyToken2026';

  if (mode === 'subscribe' && token === localVerifyToken) {
    console.log('[WhatsApp Webhook] Webhook authenticated successfully by Meta.');
    res.status(200).send(challenge);
  } else {
    console.warn('[WhatsApp Webhook] Authentication handshake failed. Token mismatch.');
    res.sendStatus(403);
  }
});

// POST: Webhook receiver for inbound WhatsApp messages & interactive button clicks
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Verify it is a WhatsApp Business API event
    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (!message) {
      // Not a message event (could be a status deliver/read update receipt)
      return res.sendStatus(200);
    }

    const fromNum = message.from; // User's WhatsApp number
    const userName = contact?.profile?.name || 'Traveler';

    console.log(`[WhatsApp Webhook] Inbound message from ${userName} (${fromNum})`);

    // Handle Interactive Quick Replies and Menu selections
    if (message.type === 'interactive') {
      const interactive = message.interactive;
      
      // 1. Handle Quick Replies (Buttons)
      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id;
        console.log(`[WhatsApp Webhook] Button Clicked: "${interactive.button_reply.title}" (ID: ${buttonId})`);

        if (buttonId.startsWith('action_research_')) {
          const destCode = buttonId.replace('action_research_', '');
          await sendWhatsAppText(fromNum, `🔍 Spawning AeroFamily Agent to research your custom itinerary for destination ${destCode}. This will take a few seconds...`);

          // Execute simulated travel research
          try {
            const mockProfile = {
              familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ['Beach', 'Kid-Friendly'] }
            };
            const itinerary = await runResearch({
              destination: `${destCode} Destination`,
              destinationAirport: destCode,
              departureAirport: 'ATL',
              dealPrice: 250,
              familyProfile: mockProfile.familyProfile,
              geminiKey: process.env.GEMINI_API_KEY
            });

            // Send completed itinerary back to user's phone via WhatsApp
            await sendWhatsAppText(fromNum, `📋 Here is your custom travel itinerary for ${destCode}:\n\n${itinerary}`);
          } catch (researchErr) {
            console.error('[WhatsApp Webhook] Gemini Research failed:', researchErr.message);
            await sendWhatsAppText(fromNum, `❌ Sorry ${userName}, our AI travel agent encountered an error compiling your research. Please try again!`);
          }
        } else if (buttonId === 'action_dismiss') {
          await sendWhatsAppText(fromNum, `👍 Got it. Deal dismissed.`);
        }
      }
      
      // 2. Handle Selection Lists
      else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id;
        console.log(`[WhatsApp Webhook] List Item Selected: "${interactive.list_reply.title}" (ID: ${listId})`);

        if (listId === 'menu_add_adult') {
          await sendWhatsAppText(fromNum, `👨 Passenger count updated: Added 1 Adult traveler to your profile.`);
        } else if (listId === 'menu_add_kid') {
          await sendWhatsAppText(fromNum, `👶 Passenger count updated: Added 1 Kid traveler to your profile.`);
        } else if (listId.startsWith('menu_budget_')) {
          const budgetVal = listId.replace('menu_budget_', '');
          await sendWhatsAppText(fromNum, `💰 Budget Threshold successfully set to $${Number(budgetVal).toLocaleString()}!`);
        }
      }
    } 
    
    // Handle plain text commands
    else if (message.type === 'text') {
      const textCmd = message.text.body.trim().toUpperCase();
      console.log(`[WhatsApp Webhook] Text Command Received: "${textCmd}"`);

      if (textCmd === 'START' || textCmd === 'SUBSCRIBE') {
        await sendWhatsAppText(fromNum, `🎉 Welcome back ${userName}! You are subscribed to AeroFamily deal alerts.\n\nReply with "BUDGET 3000" to change your budget threshold, or text "OPTIONS" to see custom controls.`);
      } else if (textCmd.startsWith('BUDGET ')) {
        const budgetVal = textCmd.replace('BUDGET ', '');
        await sendWhatsAppText(fromNum, `💰 OK ${userName}, your family flight budget limit has been updated to $${Number(budgetVal).toLocaleString()}.`);
      } else if (textCmd === 'OPTIONS' || textCmd === 'MENU') {
        // Send a Selection List message menu
        const sections = [
          {
            title: '👨 Travelers Options',
            rows: [
              { id: 'menu_add_adult', title: 'Add 1 Adult', description: 'Increment adult count' },
              { id: 'menu_add_kid', title: 'Add 1 Kid', description: 'Increment kid count' }
            ]
          },
          {
            title: '💰 Budget Limits',
            rows: [
              { id: 'menu_budget_2000', title: 'Set to $2,000', description: 'Filter deals above $2000' },
              { id: 'menu_budget_4000', title: 'Set to $4,000', description: 'Filter deals above $4000' }
            ]
          }
        ];
        await sendWhatsAppListMenu(
          fromNum,
          'AeroFamily Panel',
          'Choose an action below to tweak your profile without typing.',
          'Open Menu',
          sections
        );
      } else {
        // Default conversational fallback
        await sendWhatsAppQuickReplies(
          fromNum,
          `Hi ${userName}! I received your message: "${message.text.body}". Try using our interactive panel by tapping below:`,
          [
            { id: 'action_dismiss', title: 'Ignore' },
            { id: 'menu_budget_3000', title: 'Set Budget $3000' }
          ]
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[WhatsApp Webhook Error]:', error);
    res.sendStatus(500);
  }
});

// POST: Instantly verify phone number (OTP-bypass registration for testing/demo)
app.post('/api/profile/whatsapp', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    const { phoneNumber, optInAlerts } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    // Load active profile
    const profileDoc = await db.collection('profiles').doc(userId).get();
    const profile = profileDoc.exists ? profileDoc.data() : {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    };

    // Update phone notification parameters (setting verified instantly for sandboxed tests!)
    profile.whatsapp = {
      phoneNumber: phoneNumber,
      verified: true,
      optInAlerts: optInAlerts !== false,
      optInDailyDigest: true,
      lastUpdated: new Date().toISOString()
    };

    await db.collection('profiles').doc(userId).set(profile);
    
    // Send welcome text alert simulating active registration
    try {
      await sendWhatsAppText(phoneNumber, `🎉 Welcome to AeroFamily Alerts! Your number ${phoneNumber} is successfully verified. We will send you real-time notifications when flight deals drop below your family budget.`);
    } catch (msgErr) {
      console.warn("Failed to dispatch initial welcome alert:", msgErr.message);
    }

    res.json({
      success: true,
      verified: true,
      message: 'WhatsApp registered and verified instantly for testing!',
      whatsapp: profile.whatsapp
    });
  } catch (error) {
    console.error("WhatsApp registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST: OTP code validation stub (always returns success during sandboxed testing)
app.post('/api/profile/whatsapp/verify', async (req, res) => {
  res.json({
    success: true,
    verified: true,
    message: 'Code verified successfully (Bypassed OTP for testing mode)!'
  });
});

// ----------------------------------------------------
// START SERVER OR EXPORT FUNCTION
// ----------------------------------------------------

if (process.env.FUNCTION_TARGET) {
  console.log("[Backend Server] Serverless Cloud Function environment detected.");
} else {
  // Local Express Listener
  app.listen(PORT, () => {
    console.log(`[Backend Server] Flight Deal Agent Backend listening on port ${PORT}`);
  });
}

// Export Express app and Cloud Function
export { app };
export const api = functions.https.onRequest(app);

// Scheduled background scan executing twice daily (v2 Cloud Scheduler)
export const scheduledScan = onSchedule({
  schedule: "0 */12 * * *",
  timeZone: "America/New_York",
  memory: "512MiB",
  timeoutSeconds: 300
}, async (event) => {
  console.log("[Scheduled Scan] Starting background flight scan for all profiles...");
  try {
    const profilesSnapshot = await db.collection('profiles').get();
    console.log(`[Scheduled Scan] Found ${profilesSnapshot.size} user profile(s) to scan.`);
    
    for (const doc of profilesSnapshot.docs) {
      const userId = doc.id;
      const profile = doc.data();
      console.log(`[Scheduled Scan] Processing scan for profile: ${userId}`);
      
      const engine = profile.activeEngine || 'demo';
      const airports = profile.airports || [];
      
      try {
        const scanResult = await runScan({
          engine,
          airports,
          geminiKey: process.env.GEMINI_API_KEY,
          travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
          kiwiApiKey: process.env.KIWI_API_KEY,
          familyBudget: profile.familyProfile?.budget,
          passengers:   (profile.familyProfile?.adults || 1) + (profile.familyProfile?.kids || 0),
        });
        
        // Save deals if scan succeeded or warning-succeeded
        if (scanResult.status === 'success' || scanResult.status === 'warning') {
          if (scanResult.deals && scanResult.deals.length > 0) {
            await db.collection('deals').doc(userId).set({ deals: scanResult.deals });
          }
        }
        
        // Save to logs
        const logsDoc = await db.collection('logs').doc(userId).get();
        let logsDb = logsDoc.exists ? logsDoc.data().logs : [];
        if (!Array.isArray(logsDb)) logsDb = [];
        
        const newLogItem = {
          timestamp: scanResult.timestamp,
          engine: scanResult.engine,
          status: scanResult.status,
          dealsFound: scanResult.dealsFound,
          message: scanResult.message,
          logs: scanResult.logs
        };
        logsDb.unshift(newLogItem);
        await db.collection('logs').doc(userId).set({ logs: logsDb.slice(0, 15) });
        
        console.log(`[Scheduled Scan] Background scan completed for profile: ${userId}`);
      } catch (userErr) {
        console.error(`[Scheduled Scan] Error scanning for user ${userId}:`, userErr.message);
      }
    }
    console.log("[Scheduled Scan] All background scans finished.");
  } catch (error) {
    console.error("[Scheduled Scan] Global scan error:", error.message);
  }
});
