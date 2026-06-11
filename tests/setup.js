import { vi } from 'vitest';

// 1. Mock firebase-admin to return virtualized in-memory documents
vi.mock('firebase-admin', () => {
  // Simple in-memory document store
  const docStore = {
    'profiles/guest': {
      airports: [{ code: 'ATL', name: 'Atlanta' }],
      activeEngine: 'demo',
      familyProfile: { adults: 2, kids: 1, budget: 3000, interests: ['Beach'] }
    },
    'profiles/user123': {
      airports: [{ code: 'ATL', name: 'Atlanta' }],
      activeEngine: 'demo',
      familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ['Beach'] }
    }
  };

  const getDoc = vi.fn().mockImplementation(function(path) {
    const data = docStore[path];
    return Promise.resolve({
      exists: !!data,
      data: () => data || null
    });
  });

  const setDoc = vi.fn().mockImplementation(function(path, data, options) {
    // Mirror Firestore merge semantics one level deep (enough for wallet.* writes)
    if (options?.merge && docStore[path]) {
      const merged = { ...docStore[path] };
      for (const [key, val] of Object.entries(data)) {
        merged[key] = (val && typeof val === 'object' && !Array.isArray(val) && typeof merged[key] === 'object')
          ? { ...merged[key], ...val }
          : val;
      }
      docStore[path] = merged;
    } else {
      docStore[path] = data;
    }
    return Promise.resolve();
  });

  // Setup Firestore document reference chaining mock
  const docMock = (path) => ({
    get: () => getDoc(path),
    set: (data, options) => setDoc(path, data, options)
  });

  const collectionMock = (colName) => ({
    doc: vi.fn().mockImplementation((docId) => docMock(`${colName}/${docId}`))
  });

  return {
    default: {
      initializeApp: vi.fn(),
      firestore: () => ({
        collection: vi.fn().mockImplementation((colName) => collectionMock(colName))
      })
    }
  };
});

// 2. Mock external scan networks to bypass outbound aviation calls
vi.mock('../agent.js', () => {
  return {
    runScan: vi.fn().mockResolvedValue({
      timestamp: new Date().toISOString(),
      engine: 'demo',
      status: 'success',
      dealsFound: 2,
      logs: ['[Mock] Scan successful'],
      deals: [
        {
          id: 'deal-mock-1',
          departureAirport: 'ATL',
          destination: 'San Juan, Puerto Rico',
          destinationAirport: 'SJU',
          dealPrice: 222,
          normalPrice: 500,
          airlines: 'Spirit',
          savingsPercent: 56
        },
        {
          id: 'deal-mock-2',
          departureAirport: 'ATL',
          destination: 'Paris, France',
          destinationAirport: 'CDG',
          dealPrice: 450,
          normalPrice: 900,
          airlines: 'Air France',
          savingsPercent: 50
        }
      ]
    }),
    runResearch: vi.fn().mockResolvedValue(`## Mock Custom Itinerary
- Day 1: Land in Puerto Rico, beach check-in.
- Day 2: El Yunque rainforest hike.`)
  };
});

// 3. Mock outbound WhatsApp Meta Business API messaging requests
vi.mock('../whatsappService.js', () => {
  return {
    sendWhatsAppText: vi.fn().mockResolvedValue({ success: true, status: 'simulated' }),
    sendWhatsAppQuickReplies: vi.fn().mockResolvedValue({ success: true, status: 'simulated' }),
    sendWhatsAppListMenu: vi.fn().mockResolvedValue({ success: true, status: 'simulated' }),
    sendWhatsAppVerificationCode: vi.fn().mockResolvedValue({ success: true, status: 'simulated' })
  };
});
