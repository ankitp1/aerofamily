/**
 * deltaAwardSearch.js
 * Searches Delta SkyMiles award pricing for a specific route.
 *
 * Primary source: seats.aero Partner API (SEATS_AERO_API_KEY in .env)
 *   → https://developers.seats.aero/reference/get-availability
 *   Returns real-time award space, miles needed by cabin, and taxes.
 *
 * Fallback: Gemini web grounding (GEMINI_API_KEY in .env)
 *   → Asks Gemini to find current Delta award pricing for the route.
 *
 * Neither key required for a structured demo response.
 */

const SEATS_AERO_BASE = 'https://partners.seats.aero/availability';
const GEMINI_BASE     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * @param {string} origin          - IATA departure code, e.g. "ATL"
 * @param {string} destination     - IATA arrival code, e.g. "JFK"
 * @param {string} [cabinClass]    - "economy"|"business"|"first" (default all)
 * @param {number} [daysAhead=90]  - how many days forward to search
 * @returns {Promise<AwardSearchResult>}
 */
export async function searchDeltaAwards(origin, destination, cabinClass = null, daysAhead = 90) {
  const seatsKey  = process.env.SEATS_AERO_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (seatsKey) {
    try {
      return await _searchViaSeatsAero(origin, destination, cabinClass, daysAhead, seatsKey);
    } catch (err) {
      console.warn('[Delta Award Search] seats.aero failed, falling back to Gemini:', err.message);
    }
  }

  if (geminiKey) {
    try {
      return await _searchViaGemini(origin, destination, cabinClass, geminiKey);
    } catch (err) {
      console.warn('[Delta Award Search] Gemini fallback failed:', err.message);
    }
  }

  // No keys — return illustrative demo data
  console.log('[Delta Award Search] Demo mode — returning illustrative award pricing');
  return _demoResult(origin, destination);
}

// ---------------------------------------------------------------------------
// seats.aero Partner API
// ---------------------------------------------------------------------------

async function _searchViaSeatsAero(origin, destination, cabinClass, daysAhead, apiKey) {
  const startDate = _isoDate(0);
  const endDate   = _isoDate(daysAhead);

  const params = new URLSearchParams({
    source:            'delta',
    originAirport:     origin,
    destinationAirport: destination,
    startDate,
    endDate,
    ...(cabinClass ? { cabin: _normalizeCabin(cabinClass) } : {}),
  });

  const resp = await fetch(`${SEATS_AERO_BASE}?${params}`, {
    headers: {
      'Partner-Authorization': apiKey,
      'Accept':                'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`seats.aero ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return _normalizeSeatsAeroResponse(data, origin, destination);
}

function _normalizeSeatsAeroResponse(data, origin, destination) {
  const availability = data.data || data.availability || [];

  if (!availability.length) {
    return {
      source:   'seats.aero',
      origin,
      destination,
      found:    false,
      message:  'No Delta award space found for this route in the search window.',
      results:  [],
    };
  }

  // Group by cabin and find the cheapest dates
  const results = availability.map(slot => ({
    date:         slot.Date || slot.date,
    cabin:        slot.cabin || 'economy',
    miles:        slot.MileageCost || slot.mileageCost || slot.miles,
    taxes_usd:    slot.TotalTaxes || slot.taxes || 0,
    seats:        slot.RemainingSeats || slot.seats || null,
    route:        `${origin} → ${destination}`,
    bookable_at:  'delta.com',
  })).filter(r => r.miles);

  results.sort((a, b) => a.miles - b.miles);

  return {
    source:      'seats.aero',
    origin,
    destination,
    found:       true,
    total_dates: results.length,
    cheapest:    results[0] || null,
    results:     results.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Gemini web grounding fallback
// ---------------------------------------------------------------------------

async function _searchViaGemini(origin, destination, cabinClass, geminiKey) {
  const cabinPhrase = cabinClass ? `${cabinClass} class` : 'all cabin classes';
  const prompt = `Search delta.com for current Delta SkyMiles award flight pricing from ${origin} to ${destination} for ${cabinPhrase}.

Find the current award pricing in SkyMiles (miles required) for this route. Return a structured JSON response with this exact format:
{
  "origin": "${origin}",
  "destination": "${destination}",
  "results": [
    {
      "cabin": "economy|business|first",
      "miles_low": <lowest miles seen>,
      "miles_high": <highest miles seen>,
      "typical_taxes_usd": <typical taxes>,
      "notes": "<brief note about availability or pricing trends>"
    }
  ],
  "general_notes": "<overall notes about this route's award availability>",
  "source_url": "https://www.delta.com/..."
}

Only return the JSON, no other text.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { responseMimeType: 'application/json' },
  };

  const resp = await fetch(`${GEMINI_BASE}?key=${geminiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);

  const data    = await resp.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/```json\n?|\n?```/g, ''));
  } catch (_) {
    parsed = { results: [], general_notes: rawText };
  }

  return {
    source:      'gemini',
    origin,
    destination,
    found:       (parsed.results?.length || 0) > 0,
    results:     parsed.results || [],
    general_notes: parsed.general_notes || '',
    source_url:  parsed.source_url || 'https://www.delta.com/us/en/flight-deals/skymiles-award-deals',
  };
}

// ---------------------------------------------------------------------------
// Demo fallback — illustrative pricing based on known Delta ranges
// ---------------------------------------------------------------------------

function _demoResult(origin, destination) {
  return {
    source:      'demo',
    origin,
    destination,
    found:       true,
    note:        'Illustrative pricing — add SEATS_AERO_API_KEY for live data',
    results: [
      { cabin: 'economy',  miles_low: 8000,   miles_high: 25000,  typical_taxes_usd: 5.60,  notes: 'Domestic/Caribbean economy saver range' },
      { cabin: 'business', miles_low: 25000,  miles_high: 70000,  typical_taxes_usd: 5.60,  notes: 'Delta One domestic/Caribbean range' },
      { cabin: 'first',    miles_low: 25000,  miles_high: 80000,  typical_taxes_usd: 5.60,  notes: 'First class domestic range' },
    ],
    general_notes: `Delta uses dynamic pricing — actual miles vary by date and demand. Search delta.com for exact pricing on ${origin} → ${destination}.`,
    source_url: 'https://www.delta.com/us/en/flight-deals/skymiles-award-deals',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function _normalizeCabin(cabin) {
  const map = { economy: 'Y', business: 'J', first: 'F', 'premium economy': 'W' };
  return map[cabin.toLowerCase()] || cabin;
}
