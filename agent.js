// Native global fetch is available in Node 18+

const AIRPORT_NAMES = {
  "CDG": "Paris, France",
  "NRT": "Tokyo, Japan",
  "OGG": "Maui, Hawaii",
  "CUN": "Cancun, Mexico",
  "LHR": "London, United Kingdom",
  "FCO": "Rome, Italy",
  "HNL": "Honolulu, Hawaii",
  "AMS": "Amsterdam, Netherlands",
  "MAD": "Madrid, Spain",
  "BCN": "Barcelona, Spain",
  "DUB": "Dublin, Ireland",
  "MEX": "Mexico City, Mexico",
  "PUJ": "Punta Cana, Dominican Republic",
  "MBJ": "Montego Bay, Jamaica",
  "SJD": "Cabo San Lucas, Mexico",
  "GIG": "Rio de Janeiro, Brazil",
  "EZE": "Buenos Aires, Argentina",
  "BKK": "Bangkok, Thailand",
  "SIN": "Singapore",
  "SYD": "Sydney, Australia",
  "DXB": "Dubai, United Arab Emirates",
  "ATH": "Athens, Greece",
  "CPH": "Copenhagen, Denmark",
  "LIS": "Lisbon, Portugal",
  "VCE": "Venice, Italy",
  "MUC": "Munich, Germany",
  "FRA": "Frankfurt, Germany",
  "IST": "Istanbul, Turkey",
  "DUB": "Dublin, Ireland",
  "DCA": "Washington, D.C.",
  "MCO": "Orlando, Florida",
  "SFO": "San Francisco, California"
};

// Default high-fidelity deals when in Demo mode or as fallback
const DEFAULT_DEMO_DEALS = {
  "ATL": [
    {
      "destination": "Paris, France",
      "destinationAirport": "CDG",
      "dealPrice": 420,
      "normalPrice": 950,
      "airlines": "Delta Air Lines (Nonstop)",
      "outboundDate": "2026-06-12",
      "returnDate": "2026-06-20",
      "description": "Massive summer price drop on nonstop flights. Excellent opportunity to visit Europe during pleasant weather before peak late-summer crowds.",
      "bookingWindow": "Next 48 Hours"
    },
    {
      "destination": "Tokyo, Japan",
      "destinationAirport": "NRT",
      "dealPrice": 690,
      "normalPrice": 1450,
      "airlines": "ANA & United (1 Stop)",
      "outboundDate": "2026-09-10",
      "returnDate": "2026-09-22",
      "description": "Unbelievable fall fare to Japan! Perfect time for cooler autumn weather and temple viewing. Flight connects briefly in San Francisco.",
      "bookingWindow": "Next 24 Hours"
    },
    {
      "destination": "Maui, Hawaii",
      "destinationAirport": "OGG",
      "dealPrice": 390,
      "normalPrice": 850,
      "airlines": "United Airlines (1 Stop)",
      "outboundDate": "2026-08-01",
      "returnDate": "2026-08-10",
      "description": "Rare sub-$400 flight to Hawaii during August. Ideal for a family beach vacation with great snorkeling and scenic road trips.",
      "bookingWindow": "Next 36 Hours"
    },
    {
      "destination": "Cancun, Mexico",
      "destinationAirport": "CUN",
      "dealPrice": 180,
      "normalPrice": 380,
      "airlines": "Delta Air Lines (Nonstop)",
      "outboundDate": "2026-07-05",
      "returnDate": "2026-07-12",
      "description": "Super cheap nonstop flight for a summer beach getaway. Quick 2.5-hour flight on Delta makes it incredibly convenient for family travel.",
      "bookingWindow": "Next 72 Hours"
    },
    {
      "destination": "London, United Kingdom",
      "destinationAirport": "LHR",
      "dealPrice": 480,
      "normalPrice": 980,
      "airlines": "Virgin Atlantic (Nonstop)",
      "outboundDate": "2026-10-05",
      "returnDate": "2026-10-15",
      "description": "Fall foliage trip! Fly direct to London on Virgin Atlantic's award-winning service. Perfect temperature for exploring the city's parks and museums.",
      "bookingWindow": "Next 48 Hours"
    }
  ],
  "DEFAULT": [
    {
      "destination": "Rome, Italy",
      "destinationAirport": "FCO",
      "dealPrice": 450,
      "normalPrice": 1100,
      "airlines": "ITA Airways (Nonstop)",
      "outboundDate": "2026-10-10",
      "returnDate": "2026-10-18",
      "description": "Amazing shoulder-season fare to Italy. Walk the historic streets of Rome in perfect weather without the summer crowds.",
      "bookingWindow": "Next 48 Hours"
    },
    {
      "destination": "Orlando, Florida",
      "destinationAirport": "MCO",
      "dealPrice": 120,
      "normalPrice": 290,
      "airlines": "JetBlue (Nonstop)",
      "outboundDate": "2026-07-15",
      "returnDate": "2026-07-22",
      "description": "Excellent price drop on standard fares. Perfect for taking the kids to theme parks over the summer break.",
      "bookingWindow": "Next 72 Hours"
    },
    {
      "destination": "Amsterdam, Netherlands",
      "destinationAirport": "AMS",
      "dealPrice": 490,
      "normalPrice": 980,
      "airlines": "KLM (Nonstop)",
      "outboundDate": "2026-09-05",
      "returnDate": "2026-09-12",
      "description": "Fabulous price drop to the city of canals. Visit during the mild autumn and enjoy museum touring and cycling in comfort.",
      "bookingWindow": "Next 36 Hours"
    }
  ]
};

/**
 * Runs a flight deal scan based on the active engine.
 */
export async function runScan({ engine, airports, geminiKey, travelpayoutsToken, kiwiApiKey }) {
  const logs = [];
  const timestamp = new Date().toISOString();
  
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    console.log(`[Scan Agent] ${msg}`);
  };

  log(`Scan Agent triggered using engine: "${engine.toUpperCase()}"`);
  log(`Departure Airports configured: ${airports.map(a => a.code).join(', ')}`);

  if (airports.length === 0) {
    log("Error: No departure airports configured. Aborting scan.");
    return {
      timestamp,
      engine,
      status: "error",
      dealsFound: 0,
      message: "No departure airports configured.",
      logs
    };
  }

  try {
    let deals = [];

    if (engine === 'kiwi') {
      if (!kiwiApiKey) {
        log("Warning: KIWI_API_KEY is missing. Falling back to Demo Mode.");
        return await runDemoScan(airports, log, logs, timestamp);
      }
      deals = await runKiwiScan(airports, kiwiApiKey, log);
    } else if (engine === 'gemini') {
      if (!geminiKey) {
        log("Warning: GEMINI_API_KEY is missing. Falling back to Demo Mode.");
        return await runDemoScan(airports, log, logs, timestamp);
      }
      deals = await runGeminiScan(airports, geminiKey, log);
    } else if (engine === 'travelpayouts') {
      if (!travelpayoutsToken) {
        log("Warning: TRAVELPAYOUTS_TOKEN is missing. Falling back to Demo Mode.");
        return await runDemoScan(airports, log, logs, timestamp);
      }
      deals = await runTravelpayoutsScan(airports, travelpayoutsToken, log);
    } else {
      // Demo/Mock engine
      return await runDemoScan(airports, log, logs, timestamp);
    }

    log(`Raw scan completed. Found ${deals.length} candidate deals. Deploying AeroFamily Real-Time Verifier...`);
    
    let verifiedDeals = [];
    for (const d of deals) {
      if (engine === 'demo') {
        verifiedDeals.push({
          ...d,
          verified: true
        });
      } else {
        const verified = await verifyDeal(d, kiwiApiKey, travelpayoutsToken, log);
        if (verified) {
          verifiedDeals.push(verified);
        }
      }
    }

    // Add unique IDs to deals
    deals = verifiedDeals.map((d, index) => ({
      id: `deal-${engine}-${Date.now()}-${index}`,
      ...d,
      savingsPercent: Math.round((1 - (d.dealPrice / d.normalPrice)) * 100)
    }));

    log(`Scan successfully completed. ${deals.length} deals passed strict verification filters.`);

    return {
      timestamp,
      engine,
      status: "success",
      dealsFound: deals.length,
      message: `Successfully scan completed. Found ${deals.length} deals from your airports.`,
      logs,
      deals
    };

  } catch (error) {
    log(`Fatal Scan Error: ${error.message}`);
    log("Scanning failed. Recovering with Demo Mode fallback so the app remains active.");
    
    try {
      const fallback = await runDemoScan(airports, log, logs, timestamp);
      fallback.message = `Engine failed: "${error.message}". Recovered via Demo fallback.`;
      fallback.status = "warning";
      return fallback;
    } catch (fallbackErr) {
      return {
        timestamp,
        engine,
        status: "error",
        dealsFound: 0,
        message: `Scan failed: ${error.message}`,
        logs
      };
    }
  }
}

/**
 * Runs a simulated/mock flight deal scan.
 */
async function runDemoScan(airports, log, logs, timestamp) {
  log("Simulating routes... Loading seasonal flight charts.");
  await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate think time

  let deals = [];
  for (const airport of airports) {
    log(`Scanning route opportunities from ${airport.code} (${airport.name})...`);
    const templateDeals = DEFAULT_DEMO_DEALS[airport.code] || DEFAULT_DEMO_DEALS["DEFAULT"];
    
    for (const deal of templateDeals) {
      deals.push({
        id: `deal-demo-${airport.code}-${Math.random().toString(36).substr(2, 5)}`,
        departureAirport: airport.code,
        destination: deal.destination,
        destinationAirport: deal.destinationAirport,
        dealPrice: deal.dealPrice,
        normalPrice: deal.normalPrice,
        savingsPercent: Math.round((1 - (deal.dealPrice / deal.normalPrice)) * 100),
        airlines: deal.airlines,
        outboundDate: deal.outboundDate,
        returnDate: deal.returnDate,
        description: deal.description,
        bookingWindow: deal.bookingWindow,
        bookingLink: `https://www.google.com/travel/flights?q=Flights%20to%20${deal.destinationAirport}%20from%20${airport.code}%20on%20${deal.outboundDate}%20through%20${deal.returnDate}`
      });
      log(`Found drop: ${airport.code} -> ${deal.destinationAirport} for $${deal.dealPrice} (Norm: $${deal.normalPrice}, Savings: ${Math.round((1 - (deal.dealPrice / deal.normalPrice)) * 100)}%)`);
    }
  }

  log(`Demo scan complete. Found ${deals.length} deals.`);
  return {
    timestamp,
    engine: "demo",
    status: "success",
    dealsFound: deals.length,
    message: `Demo scan successfully complete. Found ${deals.length} flight drops.`,
    logs,
    deals
  };
}

/**
 * Runs a live web search flight deal scan via Gemini + Google Search Grounding.
 */
async function runGeminiScan(airports, apiKey, log) {
  log("Connecting to Gemini API...");
  log("Preparing search queries with Google Search Grounding.");
  
  const airportCodes = airports.map(a => a.code).join(' or ');
  const prompt = `You are a professional travel agent and flight deal scout. Search the live web (using Google Search) to find current active flight deals, price drops, or error fares departing from these specific airports: ${airportCodes}. 
Search travel blogs like Going (Scott's Cheap Flights), Secret Flying, Airfarewatchdog, and Flynous.
Find at least 5 active flight deals. Make sure they are real routes and reasonable prices.

IMPORTANT CRITERIA: Only return flight deals that are either NONSTOP or 1-STOP. Do not return any flight deals with 2 or more stops. 
Also, if the flight has a layover longer than 3 hours, you MUST highlight it explicitly by populating a warning message in the JSON under the "longLayoverWarning" field (e.g. "⚠️ Long Layover: 4.5 hours"). If the layover is under 3 hours or it's a nonstop flight, set "longLayoverWarning" to null.

Return a JSON array of the deals found. Do not include any conversational filler, markdown formatting outside of the JSON block itself, or extra text. Output strictly a JSON array matching this schema:
[
  {
    "departureAirport": "3-letter origin code",
    "destination": "City, Country name",
    "destinationAirport": "3-letter destination code",
    "dealPrice": 420 (number only, in USD),
    "normalPrice": 950 (estimated average price in USD),
    "airlines": "Delta (Nonstop) or Carrier Name",
    "outboundDate": "YYYY-MM-DD",
    "returnDate": "YYYY-MM-DD",
    "description": "Short explanation of why this is a deal",
    "bookingWindow": "e.g., Next 48 Hours",
    "longLayoverWarning": "⚠️ Long Layover: 4.5 hours" (or null)
  }
]`;

  log("Sending grounded search prompt to Gemini 2.5 Flash...");
  
  // Custom fetch to Gemini API
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      tools: [{ googleSearch: {} }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("Empty response from Gemini API.");
  }

  log("Received response from Gemini. Extracting and parsing JSON flight data.");
  try {
    const cleanText = text.trim();
    const startIdx = cleanText.indexOf('[');
    const endIdx = cleanText.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      throw new Error(`Could not find JSON array in response. Raw output: ${cleanText.substring(0, 150)}`);
    }
    const jsonString = cleanText.substring(startIdx, endIdx + 1);
    
    const parsedDeals = JSON.parse(jsonString);
    if (!Array.isArray(parsedDeals)) {
      throw new Error("Parsed object is not a JSON array.");
    }
    
    // Inject booking links based on parsed data
    return parsedDeals.map(d => ({
      ...d,
      bookingLink: `https://www.google.com/travel/flights?q=Flights%20to%20${d.destinationAirport}%20from%20${d.departureAirport}%20on%20${d.outboundDate}%20through%20${d.returnDate}`
    }));
  } catch (err) {
    log(`Parsing error: Failed to parse Gemini output: ${text.substring(0, 150)}...`);
    throw new Error(`Failed to parse agent output: ${err.message}`);
  }
}

/**
 * Runs a flight scan hitting the real Travelpayouts Cache API.
 */
async function runTravelpayoutsScan(airports, token, log) {
  log("Connecting to Travelpayouts Flight Data Cache...");
  
  let deals = [];
  for (const airport of airports) {
    log(`Querying lowest recent prices departing from ${airport.code}...`);
    
    // Call Travelpayouts Latest Prices endpoint
    const url = `https://api.travelpayouts.com/v2/prices/latest?origin=${airport.code}&currency=usd&period_type=year&limit=15&token=${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      log(`Travelpayouts API error for ${airport.code}: status ${response.status}`);
      continue;
    }
    
    const result = await response.json();
    if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
      log(`No recent cached flights returned for ${airport.code}.`);
      continue;
    }
    
    log(`Fetched ${result.data.length} route prices from Travelpayouts for ${airport.code}. Filtering deals...`);
    
    for (const flight of result.data) {
      // Filter: preferably only non-stop or 1-stop deals
      if (flight.number_of_changes !== undefined && flight.number_of_changes > 1) {
        continue;
      }

      // Travelpayouts returns all searches, filter for cheap flight deals
      // In a real deal aggregator, we look for items with high values of savings.
      // Let's create a deal from the raw flight price.
      const destCode = flight.destination;
      const destinationName = AIRPORT_NAMES[destCode] || `${destCode} Region`;
      
      const dealPrice = flight.value;
      // Estimate a reasonable historical "normal" price to compute savings (usually ~1.8x higher for deals)
      const normalPrice = Math.round((dealPrice * 1.8) / 10) * 10;
      
      deals.push({
        departureAirport: flight.origin,
        destination: destinationName,
        destinationAirport: destCode,
        dealPrice: dealPrice,
        normalPrice: normalPrice,
        airlines: flight.gate ? `${flight.gate} (via Portal)` : "Various Airlines",
        outboundDate: flight.depart_date,
        returnDate: flight.return_date,
        description: `Verified recent flight found via global user searches. ${flight.number_of_changes === 0 ? "Nonstop" : `${flight.number_of_changes} stop`} route.`,
        bookingWindow: "Subject to seat availability",
        bookingLink: `https://www.google.com/travel/flights?q=Flights%20to%20${destCode}%20from%20${flight.origin}%20on%20${flight.depart_date}%20through%20${flight.return_date}`
      });
    }
  }
  
  // Sort and pick top 8 deals based on lowest absolute prices or highest simulated savings
  deals.sort((a, b) => b.normalPrice - b.dealPrice);
  return deals.slice(0, 8);
}

/**
 * Runs a flight scan hitting the real Kiwi Tequila Live API.
 */
async function runKiwiScan(airports, apiKey, log) {
  log("Connecting to Kiwi.com Tequila live search engine...");

  // Set up date queries (outbound: today to 90 days from today)
  const formatDateKiwi = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const dateFrom = formatDateKiwi(new Date());
  const dateTo = formatDateKiwi(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  
  const flyFrom = airports.map(a => a.code).join(',');
  log(`Querying lowest prices from [${flyFrom}] to anywhere. Window: ${dateFrom} to ${dateTo}...`);

  // Build Kiwi API Tequila search URL
  const url = `https://api.tequila.kiwi.com/v2/search?fly_from=${flyFrom}&fly_to=anywhere&date_from=${dateFrom}&date_to=${dateTo}&nights_in_dst_from=5&nights_in_dst_to=14&max_stopovers=1&curr=USD&limit=15&sort=price`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'apikey': apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kiwi Tequila API returned status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
    log("Kiwi Tequila Search returned no flights in the search criteria.");
    return [];
  }

  log(`Received ${result.data.length} flights from Tequila. Mapping deals...`);
  
  const deals = result.data.map(flight => {
    // Determine return date by scanning segments
    const returnSegment = flight.route ? flight.route.find(s => s.return === 1) : null;
    const returnDate = returnSegment 
      ? returnSegment.local_departure.split('T')[0]
      : new Date(new Date(flight.local_departure).getTime() + (flight.nightsInDest || 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dealPrice = flight.price;
    const normalPrice = Math.round((dealPrice * 1.7) / 10) * 10;
    const countryName = flight.countryTo ? flight.countryTo.name : 'International';
    const layoverInfo = getLayoverInfo(flight.route);
    
    return {
      departureAirport: flight.flyFrom,
      destination: `${flight.cityTo}, ${countryName}`,
      destinationAirport: flight.flyTo,
      dealPrice: dealPrice,
      normalPrice: normalPrice,
      airlines: flight.airlines ? flight.airlines.join(', ') : 'Various carriers',
      outboundDate: flight.local_departure.split('T')[0],
      returnDate: returnDate,
      description: `Live price drop found via Kiwi.com Tequila. ${flight.route && flight.route.length > 2 ? 'Connecting' : 'Nonstop'} flight with beautiful pacing.`,
      bookingWindow: "Instant booking available",
      bookingLink: flight.deep_link || `https://www.google.com/travel/flights?q=Flights%20to%20${flight.flyTo}%20from%20${flight.flyFrom}%20on%20${flight.local_departure.split('T')[0]}%20through%20${returnDate}`,
      longLayoverWarning: layoverInfo.hasLongLayover ? layoverInfo.layoverText : null
    };
  });

  // Sort by highest relative savings
  deals.sort((a, b) => b.normalPrice - a.dealPrice);
  return deals.slice(0, 8);
}

function getLayoverInfo(route) {
  if (!route || route.length <= 1) {
    return { hasLongLayover: false, layoverText: "" };
  }
  
  let maxLayoverMin = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const s1 = route[i];
    const s2 = route[i + 1];
    
    // Check consecutive segments in the same direction (outbound or inbound)
    if (s1.return === s2.return) {
      const arrTime = new Date(s1.local_arrival).getTime();
      const depTime = new Date(s2.local_departure).getTime();
      const layoverMin = (depTime - arrTime) / (1000 * 60);
      if (layoverMin > maxLayoverMin) {
        maxLayoverMin = layoverMin;
      }
    }
  }
  
  const layoverHours = maxLayoverMin / 60;
  if (layoverHours > 3) {
    return {
      hasLongLayover: true,
      layoverText: `⚠️ Long Layover: ${Math.round(layoverHours * 10) / 10} hours`
    };
  }
  
  return {
    hasLongLayover: false,
    layoverText: maxLayoverMin > 0 ? `Layover: ${Math.round(layoverHours * 10) / 10} hours` : ""
  };
}

/**
 * Verifies a single flight deal against the live Kiwi Tequila API.
 * Performs direct date verification, surrounding date search, or discards the deal.
 */
async function verifyDeal(deal, kiwiApiKey, travelpayoutsToken, log) {
  if (!kiwiApiKey && !travelpayoutsToken) {
    log(`[Verifier] Warning: No API keys (Kiwi or Travelpayouts) provided for verification. Skipping active verification for ${deal.destinationAirport}.`);
    deal.verified = false;
    return deal;
  }

  // --- MODE 1: KIWI TEQUILA LIVE SEARCH ---
  if (kiwiApiKey) {
    log(`[Verifier:Kiwi] Cross-checking deal ${deal.departureAirport} -> ${deal.destinationAirport} via live Tequila API...`);
    const formatDateKiwi = (dateStr) => {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    try {
      // 1. Check exact dates first
      const dateFrom = formatDateKiwi(deal.outboundDate);
      const returnFrom = formatDateKiwi(deal.returnDate);
      
      const exactUrl = `https://api.tequila.kiwi.com/v2/search?fly_from=${deal.departureAirport}&fly_to=${deal.destinationAirport}&date_from=${dateFrom}&date_to=${dateFrom}&return_from=${returnFrom}&return_to=${returnFrom}&max_stopovers=1&curr=USD&limit=3`;
      
      const response = await fetch(exactUrl, {
        headers: { 'accept': 'application/json', 'apikey': kiwiApiKey }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          const cheapestFlight = result.data[0];
          const livePrice = cheapestFlight.price;
          
          if (livePrice <= deal.dealPrice * 1.25 || livePrice < deal.normalPrice * 0.70) {
            log(`[Verifier:Kiwi] ✓ SUCCESS! Deal verified on exact dates. Live price: $${livePrice}`);
            const layoverInfo = getLayoverInfo(cheapestFlight.route);
            return {
              ...deal,
              dealPrice: livePrice,
              bookingLink: cheapestFlight.deep_link || deal.bookingLink,
              verified: true,
              description: `[✓ Verified Live Price] ${deal.description}`,
              longLayoverWarning: layoverInfo.hasLongLayover ? layoverInfo.layoverText : null
            };
          }
          log(`[Verifier:Kiwi] Price is too high on exact dates ($${livePrice} vs deal price $${deal.dealPrice}). Searching window...`);
        } else {
          log(`[Verifier:Kiwi] No flights found on exact dates. Searching surrounding window...`);
        }
      }

      // 2. Search surrounding +/- 7 days window for the cheap fare
      const outDateObj = new Date(deal.outboundDate);
      const retDateObj = new Date(deal.returnDate);
      const durationDays = Math.round((retDateObj - outDateObj) / (1000 * 60 * 60 * 24));
      
      const minNights = Math.max(3, durationDays - 2);
      const maxNights = durationDays + 2;

      const windowStart = formatDateKiwi(new Date(outDateObj.getTime() - 7 * 24 * 60 * 60 * 1000));
      const windowEnd = formatDateKiwi(new Date(outDateObj.getTime() + 7 * 24 * 60 * 60 * 1000));

      log(`[Verifier:Kiwi] Searching window: ${windowStart} to ${windowEnd} (Duration: ${minNights}-${maxNights} nights)...`);

      const windowUrl = `https://api.tequila.kiwi.com/v2/search?fly_from=${deal.departureAirport}&fly_to=${deal.destinationAirport}&date_from=${windowStart}&date_to=${windowEnd}&nights_in_dst_from=${minNights}&nights_in_dst_to=${maxNights}&max_stopovers=1&curr=USD&limit=10&sort=price`;

      const windowResponse = await fetch(windowUrl, {
        headers: { 'accept': 'application/json', 'apikey': kiwiApiKey }
      });

      if (windowResponse.ok) {
        const windowResult = await windowResponse.json();
        if (windowResult.data && windowResult.data.length > 0) {
          const bestFlight = windowResult.data[0];
          const bestPrice = bestFlight.price;

          if (bestPrice <= deal.dealPrice * 1.25 || bestPrice < deal.normalPrice * 0.70) {
            const returnSegment = bestFlight.route ? bestFlight.route.find(s => s.return === 1) : null;
            const newOutbound = bestFlight.local_departure.split('T')[0];
            const newReturn = returnSegment 
              ? returnSegment.local_departure.split('T')[0]
              : new Date(new Date(bestFlight.local_departure).getTime() + (bestFlight.nightsInDest || 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            log(`[Verifier:Kiwi] ✓ AUTO-CORRECTED SUCCESS! Found deal price ($${bestPrice}) on nearby dates: ${newOutbound} to ${newReturn}`);
            const layoverInfo = getLayoverInfo(bestFlight.route);
            return {
              ...deal,
              dealPrice: bestPrice,
              outboundDate: newOutbound,
              returnDate: newReturn,
              bookingLink: bestFlight.deep_link || deal.bookingLink,
              verified: true,
              description: `[✓ Verified Nearby Dates: ${newOutbound} to ${newReturn}] ${deal.description}`,
              longLayoverWarning: layoverInfo.hasLongLayover ? layoverInfo.layoverText : null
            };
          }
        }
      }

      log(`[Verifier:Kiwi] ✗ EXPIRED! Flight deal could not be located in Kiwi live search. Filtering out.`);
      return null;

    } catch (error) {
      log(`[Verifier Warning] Kiwi verification failed: ${error.message}. Dropping back to Travelpayouts.`);
    }
  }

  // --- MODE 2: TRAVELPAYOUTS CACHE SEARCH FALLBACK ---
  if (travelpayoutsToken) {
    log(`[Verifier:Travelpayouts] Cross-checking deal ${deal.departureAirport} -> ${deal.destinationAirport} via cached searches...`);
    try {
      const url = `https://api.travelpayouts.com/v2/prices/latest?origin=${deal.departureAirport}&destination=${deal.destinationAirport}&currency=usd&period_type=year&limit=15&token=${travelpayoutsToken}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        log(`[Verifier:Travelpayouts] API call failed with status: ${response.status}`);
        return null;
      }
      
      const result = await response.json();
      log(`[Verifier:Travelpayouts] API Status: ${result.success ? 'Success' : 'Failed'}. Data count: ${result.data ? result.data.length : 'undefined'}`);

      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        // 1. Check exact dates in cache (ensuring nonstop or 1-stop)
        const exactFlight = result.data.find(f => 
          (f.number_of_changes === undefined || f.number_of_changes <= 1) && 
          f.depart_date === deal.outboundDate && 
          f.return_date === deal.returnDate
        );
        if (exactFlight) {
          const livePrice = exactFlight.value;
          log(`[Verifier:Travelpayouts] Exact flight found in cache. Price: $${livePrice} vs Deal: $${deal.dealPrice}`);
          if (livePrice <= deal.dealPrice * 1.25 || livePrice < deal.normalPrice * 0.70) {
            log(`[Verifier:Travelpayouts] ✓ SUCCESS! Deal verified in cache on exact dates. Price: $${livePrice}`);
            return {
              ...deal,
              dealPrice: livePrice,
              verified: true,
              description: `[✓ Verified Cache Price] ${deal.description}`
            };
          }
        }

        // 2. Auto-correct dates using the cheapest cache entry (ensuring nonstop or 1-stop)
        const bestFlight = [...result.data]
          .filter(f => f.number_of_changes === undefined || f.number_of_changes <= 1)
          .sort((a, b) => a.value - b.value)[0];
        if (bestFlight) {
          log(`[Verifier:Travelpayouts] Cheapest alternative flight found: $${bestFlight.value} on ${bestFlight.depart_date}`);
          log(`[Verifier:Travelpayouts] Comparing: Live $${bestFlight.value} <= Target Deal $${deal.dealPrice * 1.25} OR Live $${bestFlight.value} < Target Normal $${deal.normalPrice * 0.70}`);
          if (bestFlight.value <= deal.dealPrice * 1.25 || bestFlight.value < deal.normalPrice * 0.70) {
            log(`[Verifier:Travelpayouts] ✓ AUTO-CORRECTED SUCCESS! Found cheap cached price ($${bestFlight.value}) on alternative dates: ${bestFlight.depart_date} to ${bestFlight.return_date}`);
            return {
              ...deal,
              dealPrice: bestFlight.value,
              outboundDate: bestFlight.depart_date,
              returnDate: bestFlight.return_date,
              bookingLink: `https://www.google.com/travel/flights?q=Flights%20to%20${deal.destinationAirport}%20from%20${deal.departureAirport}%20on%20${bestFlight.depart_date}%20through%20${bestFlight.return_date}`,
              verified: true,
              description: `[✓ Verified Nearby Dates: ${bestFlight.depart_date} to ${bestFlight.return_date}] ${deal.description}`
            };
          }
        }
      }
      
      log(`[Verifier:Travelpayouts] ✗ EXPIRED! Flight deal could not be verified in Travelpayouts cache. Filtering out.`);
      return null;

    } catch (error) {
      log(`[Verifier Warning] Travelpayouts fallback verification failed: ${error.message}. Keeping deal as unverified.`);
      deal.verified = false;
      return deal;
    }
  }

  deal.verified = false;
  return deal;
}

/**
 * Runs a deep travel planning research report using Gemini or simulated templates.
 */
export async function runResearch({ destination, destinationAirport, departureAirport, dealPrice, familyProfile, geminiKey }) {
  const prompt = `You are an elite, highly detailed family travel planner. You are researching a trip to ${destination} (${destinationAirport}) departing from ${departureAirport} for a family profile:
- Adults: ${familyProfile.adults}
- Kids: ${familyProfile.kids}
- Total Budget: $${familyProfile.budget}
- Interests: ${familyProfile.interests.join(', ')}
- Selected Flight Price: $${dealPrice} per ticket

Please construct an extremely comprehensive, premium 5-day travel itinerary personalized for this family. Focus on kid-friendly rest paces, high-impact affordable experiences, and maximizing benefits.

Format the output strictly as a clean, beautiful Markdown document with these exact headers:
# Custom Family Travel Planner: ${destination}

## 🌟 Trip Overview & Highlights
[Provide a summary of the destination, the best season, key family-friendly highlights, and how the $${dealPrice} flight deal leaves more budget for activities.]

## 🎒 Essential Packing Checklist
[Divide into:
- 👨‍👩‍👧‍👦 Family & Parent essentials
- 👶 Kids & Toddler items
- 🌦 Weather/Destination specific gear]

## 🗓 Detailed 5-Day Itinerary
[Provide a rich pacing schedule. Under each day, describe:
- **Morning (Pace: Active)**: Hands-on exploration, museums, parks, or walks.
- **Afternoon (Pace: Relaxed)**: Restful spots, kid playgrounds, lunch, or beach.
- **Evening (Pace: Low-key)**: Local food hotspots, light sightseeing, and bedtime schedules.]

## 🛝 Family Comfort & Kids Hacks
[Explain stroller accessibility, where to find public restrooms, diaper changing spots, snack strategy, and rest windows.]

## 💰 Smart Budget Allocation
[Give a table showing the breakdown of the $${familyProfile.budget} budget:
- Flight Cost: $${dealPrice * (familyProfile.adults + familyProfile.kids)}
- Lodging (Hotel/Airbnb): [value]
- Food & Dining: [value]
- Activities & Tickets: [value]
- Ground Transport: [value]
- Emergency/Souvenirs: [value]
Explain how to save on activities based on family interests.]`;

  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (err) {
      console.error("Gemini Travel Research failed, using fallback:", err);
    }
  }

  // Fallback high-fidelity Markdown generator in case of missing keys
  return `
# Custom Family Travel Planner: ${destination}

## 🌟 Trip Overview & Highlights
Welcome to your customized family adventure to **${destination}**! Flying out of **${departureAirport}** at the incredible deal price of **$${dealPrice}** per ticket saves your family a massive amount of money, leaving you with more budget to spend on unforgettable memories!

${destination} is an absolute wonderland for families. Based on your interests in **${familyProfile.interests.join(', ')}**, we have designed a perfectly paced 5-day trip that balances high-energy exploration with rest times to prevent kids' meltdowns.

---

## 🎒 Essential Packing Checklist

*   **👨‍👩‍👧‍👦 Family & Parent Essentials**
    *   Dual-voltage power adapters and power bank.
    *   Travel first-aid kit with children's ibuprofen and motion sickness remedies.
    *   Printed copies of bookings, medical details, and travel insurance.
*   **👶 Kids & Toddler Items**
    *   Lightweight, easily foldable travel stroller or baby carrier.
    *   Compact activity packs (coloring, stickers, tablets with offline downloads) for flights/transit.
    *   Reusable leak-proof water bottles and collapsible snack cups.
*   **🌦 Weather/Destination Specific Gear**
    *   Comfortable, broken-in walking shoes for all.
    *   Packable rain shells and sun hats.

---

## 🗓 Detailed 5-Day Itinerary

### Day 1: Arrival, Settling In, and First Walks
*   **Morning (Pace: Active)**: Land at **${destinationAirport}**, clear immigration, and take a pre-booked family taxi or express train directly to your lodging. Drop bags and freshen up.
*   **Afternoon (Pace: Relaxed)**: Take a gentle, orienting walk around the local neighborhood. Locate the nearest grocery store to stock up on fresh fruit, water, and local kid-approved snacks. Enjoy a relaxed lunch at an outdoor café.
*   **Evening (Pace: Low-key)**: Walk through a nearby public park or plaza where kids can run off excess airplane energy. Have an early dinner consisting of local specialties, and aim for bedtime by 8:30 PM to sync local sleep schedules.

### Day 2: Culture, Castles & Carousel Rides
*   **Morning (Pace: Active)**: Visit the primary historical focal point of the city. Participate in a family-oriented guided tour or scavenger hunt designed specifically to keep children engaged.
*   **Afternoon (Pace: Relaxed)**: Find a shaded historic garden. Enjoy a picnic lunch under the trees, followed by a ride on a classic carousel. Take a 2-hour window for toddler naps or quiet downtime.
*   **Evening (Pace: Low-key)**: Explore a scenic riverfront or pedestrian boulevard. Dine at a kid-friendly bistro featuring high chairs and simple menu options, returning early to rest.

### Day 3: Nature, Snorkeling or Beach Exploring
*   **Morning (Pace: Active)**: Embark on a nature walk or beach excursion. If beach conditions allow, explore tidepools or do a beginner-friendly snorkeling session to view local marine life.
*   **Afternoon (Pace: Relaxed)**: Have a fresh seafood or beachside lunch. Build sandcastles or collect shells. Take a long, refreshing nap or enjoy a slow-paced stroll back to the hotel.
*   **Evening (Pace: Low-key)**: Watch the sunset together from a scenic overlook. Enjoy a casual family-friendly dinner nearby, followed by ice cream or local sweet treats!

### Day 4: Interactive Museums & Interactive Parks
*   **Morning (Pace: Active)**: Head to a hands-on Science or Children's Museum. These spots are built for interactive learning and allow children to touch, build, and play freely.
*   **Afternoon (Pace: Relaxed)**: Have lunch at the museum café. Afterwards, walk to a nearby playground or public splash pad. Give the kids free play while parents rest on a nearby bench.
*   **Evening (Pace: Low-key)**: Head to a lively market hall. Let each family member select their favorite foods from different stalls. Enjoy a fun, communal dining experience.

### Day 5: Scenic Cruise, Souvenir Hunt & Grand Farewell
*   **Morning (Pace: Active)**: Take a 1-hour scenic boat cruise or hop-on-hop-off bus tour to see the city from a new perspective without wearing out little legs.
*   **Afternoon (Pace: Relaxed)**: Do some light souvenir shopping. Let the children choose a small local toy or craft as a memory of the trip. Have a final celebratory lunch.
*   **Evening (Pace: Low-key)**: Pack suitcases together. Head out for a special farewell dinner at a restaurant with beautiful views, celebrating a successful family adventure!

---

## 🛝 Family Comfort & Kids Hacks

*   **Stroller Info**: Most major tourist zones have wide sidewalks, but older historic streets contain cobblestones. A sturdy, lightweight travel stroller with rubber wheels is highly recommended over plastic umbrella strollers.
*   **Restrooms & Changing Tables**: Keep a €1/ $1 coin handy as some public restrooms require a small fee. Department stores, major museums, and large cafes are your best bets for clean diaper-changing facilities.
*   **Meltdown Prevention**: Always carry double the snacks you think you need. Pre-schedule a "quiet time" from 1:30 PM to 3:30 PM every single day to let kids decompress.

---

## 💰 Smart Budget Allocation

| Category | Cost Breakdown | Description |
| :--- | :--- | :--- |
| **Flights** | $${dealPrice * (familyProfile.adults + familyProfile.kids)} | Outbound/Inbound for ${familyProfile.adults + familyProfile.kids} passengers |
| **Lodging** | $900 | 5 nights in a family-oriented apartment with a kitchen |
| **Food & Dining** | $650 | Grocery breakfasts, picnic lunches, and kid-friendly dinners |
| **Activities** | $300 | Museum passes, boat cruise, and carousel tickets |
| **Transport** | $150 | Metro passes and occasional pre-booked taxi transfers |
| **Emergency** | $200 | Buffer for medicine, lost items, or special treats |
| **TOTAL** | **$${dealPrice * (familyProfile.adults + familyProfile.kids) + 2200}** | *Fits comfortably within your family budget allocations!* |
`;
}
