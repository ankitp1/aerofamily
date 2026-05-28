import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { runScan, runResearch } from './agent.js';
import { OAuth2Client } from 'google-auth-library';
import admin from 'firebase-admin';
import functions from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

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

// Get deals from Firestore
app.get('/api/deals', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    const doc = await db.collection('deals').doc(userId).get();
    if (!doc.exists) {
      return res.json([]);
    }
    res.json(doc.data().deals || []);
  } catch (error) {
    console.error("Error reading deals from Firestore:", error);
    res.json([]);
  }
});

// Get profile from Firestore
app.get('/api/profile', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    const doc = await db.collection('profiles').doc(userId).get();
    if (!doc.exists) {
      // Create and save optimized family-of-3 default profile for new user
      const defaultProfile = {
        airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
        creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
        familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
        activeEngine: "demo"
      };
      await db.collection('profiles').doc(userId).set(defaultProfile);
      return res.json(defaultProfile);
    }
    res.json(doc.data());
  } catch (error) {
    console.error("Error reading profile from Firestore:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update profile in Firestore
app.post('/api/profile', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    const newProfile = req.body;
    await db.collection('profiles').doc(userId).set(newProfile);
    res.json({ success: true, profile: newProfile });
  } catch (error) {
    console.error("Error saving profile to Firestore:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get logs from Firestore
app.get('/api/logs', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    const doc = await db.collection('logs').doc(userId).get();
    if (!doc.exists) {
      return res.json([]);
    }
    res.json(doc.data().logs || []);
  } catch (error) {
    console.error("Error reading logs from Firestore:", error);
    res.json([]);
  }
});

// Trigger scan manually (Firestore Integration)
app.post('/api/scan', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 'guest';
    
    // Load profile from Firestore (or fallback to defaults)
    const doc = await db.collection('profiles').doc(userId).get();
    const profile = doc.exists ? doc.data() : {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    };

    const engine = profile.activeEngine || 'demo';
    const airports = profile.airports || [];
    
    const scanResult = await runScan({
      engine,
      airports,
      geminiKey: process.env.GEMINI_API_KEY,
      travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
      kiwiApiKey: process.env.KIWI_API_KEY
    });

    // Save results if scan succeeded or warning-succeeded
    if (scanResult.status === 'success' || scanResult.status === 'warning') {
      if (scanResult.deals && scanResult.deals.length > 0) {
        await db.collection('deals').doc(userId).set({ deals: scanResult.deals });
      }
    }

    // Save to logs (limit log history to top 15 records)
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
    const doc = await db.collection('profiles').doc(userId).get();
    const profile = doc.exists ? doc.data() : {
      airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
      creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
      activeEngine: "demo"
    };
    const familyProfile = profile.familyProfile;
    
    // Check if itinerary is already cached in Firestore to save Gemini API costs
    const cacheDocId = `itin_${departureAirport}_${destinationAirport}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    try {
      const cacheDoc = await db.collection('itinerary_caches').doc(cacheDocId).get();
      if (cacheDoc.exists) {
        console.log(`[Research Engine] Found cached Firestore itinerary for ${destinationAirport}`);
        return res.json({ itinerary: cacheDoc.data().itinerary });
      }
    } catch (e) {
      console.log("[Research Engine] Cache doc lookup failed, continuing with live research.");
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

    // Cache the result in Firestore
    try {
      await db.collection('itinerary_caches').doc(cacheDocId).set({
        timestamp: new Date().toISOString(),
        destination,
        itinerary: itineraryMarkdown
      });
    } catch (cacheErr) {
      console.error("Firestore itinerary caching failed:", cacheErr.message);
    }

    res.json({ itinerary: itineraryMarkdown });
  } catch (error) {
    console.error("Research route error:", error);
    res.status(500).json({ error: error.message });
  }
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

// Export Express app as a Cloud Function
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
          kiwiApiKey: process.env.KIWI_API_KEY
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
