import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { runScan, runResearch } from './agent.js';
import { OAuth2Client } from 'google-auth-library';

// Load environmental variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Database base directory
const DATA_DIR = path.join(__dirname, 'data');

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

// Dynamic database file path resolvers
function getDealsPath(user) {
  if (user && user.id) {
    const safeId = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DATA_DIR, `deals_${safeId}.json`);
  }
  return path.join(DATA_DIR, 'deals.json');
}

function getProfilePath(user) {
  if (user && user.id) {
    const safeId = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DATA_DIR, `profile_${safeId}.json`);
  }
  return path.join(DATA_DIR, 'profile.json');
}

function getLogsPath(user) {
  if (user && user.id) {
    const safeId = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(DATA_DIR, `logs_${safeId}.json`);
  }
  return path.join(DATA_DIR, 'logs.json');
}

// Ensure DB directories and files exist
async function initDatabase() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Check and create deals.json if missing
    try {
      await fs.access(getDealsPath(null));
    } catch {
      await fs.writeFile(getDealsPath(null), JSON.stringify([], null, 2));
    }

    // Check and create profile.json if missing
    try {
      await fs.access(getProfilePath(null));
    } catch {
      const defaultProfile = {
        airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
        creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
        familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
        activeEngine: "demo"
      };
      await fs.writeFile(getProfilePath(null), JSON.stringify(defaultProfile, null, 2));
    }

    // Check and create logs.json if missing
    try {
      await fs.access(getLogsPath(null));
    } catch {
      await fs.writeFile(getLogsPath(null), JSON.stringify([], null, 2));
    }

    console.log("[Database] JSON files initialized and verified.");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
  }
}

// Read helper
async function readJson(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return [];
  }
}

// Write helper
async function writeJson(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Get deals
app.get('/api/deals', async (req, res) => {
  const dealsPath = getDealsPath(req.user);
  try {
    await fs.access(dealsPath);
    const deals = await readJson(dealsPath);
    res.json(deals);
  } catch {
    res.json([]);
  }
});

// Get profile
app.get('/api/profile', async (req, res) => {
  const profilePath = getProfilePath(req.user);
  try {
    await fs.access(profilePath);
    const profile = await readJson(profilePath);
    res.json(profile);
  } catch {
    const defaultProfile = {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    };
    await writeJson(profilePath, defaultProfile);
    res.json(defaultProfile);
  }
});

// Update profile
app.post('/api/profile', async (req, res) => {
  try {
    const newProfile = req.body;
    const profilePath = getProfilePath(req.user);
    await writeJson(profilePath, newProfile);
    res.json({ success: true, profile: newProfile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs
app.get('/api/logs', async (req, res) => {
  const logsPath = getLogsPath(req.user);
  try {
    await fs.access(logsPath);
    const logs = await readJson(logsPath);
    res.json(logs);
  } catch {
    res.json([]);
  }
});

// Trigger scan manually
app.post('/api/scan', async (req, res) => {
  try {
    const profilePath = getProfilePath(req.user);
    let profile;
    try {
      await fs.access(profilePath);
      profile = await readJson(profilePath);
    } catch {
      profile = {
        airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
        creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
        familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
        activeEngine: "demo"
      };
    }
    const engine = profile.activeEngine || 'demo';
    const airports = profile.airports || [];
    
    const scanResult = await runScan({
      engine,
      airports,
      geminiKey: process.env.GEMINI_API_KEY,
      travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
      kiwiApiKey: process.env.KIWI_API_KEY
    });

    const dealsPath = getDealsPath(req.user);
    const logsPath = getLogsPath(req.user);

    // Save results if scan succeeded or warning-succeeded
    if (scanResult.status === 'success' || scanResult.status === 'warning') {
      if (scanResult.deals && scanResult.deals.length > 0) {
        await writeJson(dealsPath, scanResult.deals);
      }
    }

    // Save to logs (limit log history to top 15 records)
    let logsDb = [];
    try {
      logsDb = await readJson(logsPath);
      if (!Array.isArray(logsDb)) logsDb = [];
    } catch {
      logsDb = [];
    }
    const newLogItem = {
      timestamp: scanResult.timestamp,
      engine: scanResult.engine,
      status: scanResult.status,
      dealsFound: scanResult.dealsFound,
      message: scanResult.message,
      logs: scanResult.logs
    };
    logsDb.unshift(newLogItem);
    await writeJson(logsPath, logsDb.slice(0, 15));

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
    const profilePath = getProfilePath(req.user);
    let profile;
    try {
      await fs.access(profilePath);
      profile = await readJson(profilePath);
    } catch {
      profile = {
        airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
        creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
        familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
        activeEngine: "demo"
      };
    }
    const familyProfile = profile.familyProfile;
    
    // Check if itinerary is already cached locally to save API costs
    const cacheFileName = `itinerary_${departureAirport}_to_${destinationAirport}.json`;
    const cachePath = path.join(DATA_DIR, cacheFileName);
    
    try {
      const cached = await fs.readFile(cachePath, 'utf-8');
      console.log(`[Research Engine] Found cached itinerary for ${destinationAirport}`);
      return res.json({ itinerary: JSON.parse(cached).itinerary });
    } catch {
      // Not cached, generate new one
      console.log(`[Research Engine] Generating new custom itinerary for ${destination}...`);
    }

    const itineraryMarkdown = await runResearch({
      destination,
      destinationAirport,
      departureAirport,
      dealPrice,
      familyProfile,
      geminiKey: process.env.GEMINI_API_KEY
    });

    // Cache the result
    await writeJson(cachePath, {
      timestamp: new Date().toISOString(),
      destination,
      itinerary: itineraryMarkdown
    });

    res.json({ itinerary: itineraryMarkdown });
  } catch (error) {
    console.error("Research route error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// BACKGROUND SCHEDULER
// ----------------------------------------------------

// Execute background scanning task (runs once every 12 hours)
async function executeBackgroundScan() {
  console.log("[Scheduler] Executing scheduled background flight deal scan...");
  try {
    const profile = await readJson(getProfilePath(null));
    const engine = profile.activeEngine || 'demo';
    const airports = profile.airports || [];
    
    if (airports.length === 0) {
      console.log("[Scheduler] No airports configured, skipping background scan.");
      return;
    }

    const scanResult = await runScan({
      engine,
      airports,
      geminiKey: process.env.GEMINI_API_KEY,
      travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
      kiwiApiKey: process.env.KIWI_API_KEY
    });

    if (scanResult.status === 'success' || scanResult.status === 'warning') {
      if (scanResult.deals && scanResult.deals.length > 0) {
        await writeJson(getDealsPath(null), scanResult.deals);
      }
    }

    const logsDb = await readJson(getLogsPath(null));
    const newLogItem = {
      timestamp: scanResult.timestamp,
      engine: scanResult.engine,
      status: scanResult.status,
      dealsFound: scanResult.dealsFound,
      message: "[Background task] " + scanResult.message,
      logs: scanResult.logs
    };
    logsDb.unshift(newLogItem);
    await writeJson(getLogsPath(null), logsDb.slice(0, 15));
    
    console.log(`[Scheduler] Background scan completed. Engine: ${engine}. Deals found: ${scanResult.dealsFound}`);
  } catch (error) {
    console.error("[Scheduler] Background scan failed:", error);
  }
}

// Set scheduler interval: 12 hours (43,200,000 milliseconds)
const SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
setInterval(executeBackgroundScan, SCAN_INTERVAL_MS);
console.log(`[Scheduler] Background scanning daemon armed. Scan interval set to 12 hours.`);

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`[Backend Server] Flight Deal Agent Backend listening on port ${PORT}`);
  });
});
