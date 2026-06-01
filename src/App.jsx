import { useState, useEffect, useRef } from 'react';

// Pre-defined credit card details database
const PREMIUM_CARDS = {
  "Amex Platinum": {
    name: "Amex Platinum",
    multiplier: 5,
    valuation: 0.010, // 1.0c conservative
    returnRate: 0.05, // 5.0%
    idealFor: "Flights booked direct / Amex Travel"
  },
  "Chase Sapphire Reserve": {
    name: "Chase Sapphire Reserve",
    multiplier: 3,
    valuation: 0.015, // 1.5c conservative
    returnRate: 0.045, // 4.5%
    idealFor: "Any travel purchase"
  },
  "Amex Gold": {
    name: "Amex Gold",
    multiplier: 3,
    valuation: 0.010, // 1.0c conservative
    returnRate: 0.03, // 3.0%
    idealFor: "Flights booked direct"
  },
  "Capital One Venture X": {
    name: "Capital One Venture X",
    multiplier: 2, 
    valuation: 0.010, // 1.0c conservative
    returnRate: 0.02, // 2.0%
    idealFor: "General travel & flat-rate"
  },
  "Chase Sapphire Preferred": {
    name: "Chase Sapphire Preferred",
    multiplier: 2,
    valuation: 0.0125, // 1.25c conservative
    returnRate: 0.025, // 2.5%
    idealFor: "Travel purchases, low annual fee"
  }
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDateRange(outbound, returnD) {
  if (!outbound || !returnD) return '';
  
  const parseDate = (dStr) => {
    const parts = dStr.split('-');
    if (parts.length !== 3) return null;
    const month = months[parseInt(parts[1], 10) - 1];
    const day = parseInt(parts[2], 10);
    return { month, day };
  };
  
  const outPart = parseDate(outbound);
  const retPart = parseDate(returnD);
  
  if (!outPart || !retPart) return '';
  return `${outPart.month} ${outPart.day} – ${retPart.month} ${retPart.day}`;
}

const BACKEND_URL = 'http://localhost:3001';

// Custom lightweight Markdown renderer to keep React zero-dependency
function MarkdownRenderer({ markdown }) {
  if (!markdown) return <p className="text-slate-400">No itinerary generated yet.</p>;

  const lines = markdown.split('\n');
  const elements = [];
  let currentList = [];
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  const flushList = (key) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-6 mb-4 text-slate-300 space-y-1">
          {currentList.map((item, idx) => <li key={idx} dangerouslySetInnerHTML={{ __html: item }} />)}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = (key) => {
    if (inTable && tableHeaders.length > 0) {
      elements.push(
        <div key={`table-wrapper-${key}`} className="overflow-x-auto my-6 border border-slate-700/50 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/80">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="p-3 font-semibold text-sm text-slate-200 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                  {row.map((cell, ci) => (
                    <td key={ci} className="p-3 text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: cell }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    }
  };

  const parseInlineMarkdown = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-slate-950/80 px-1 py-0.5 rounded text-indigo-400 text-xs font-mono">$1</code>');
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check table
    if (trimmed.startsWith('|')) {
      flushList(index);
      inTable = true;
      const cells = trimmed.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
      
      if (trimmed.includes('---')) {
        // Separator, ignore
      } else if (tableHeaders.length === 0) {
        tableHeaders = cells;
      } else {
        tableRows.push(cells.map(c => parseInlineMarkdown(c)));
      }
      return;
    } else {
      flushTable(index);
    }

    // Headers
    if (trimmed.startsWith('# ')) {
      flushList(index);
      elements.push(<h1 key={index} className="text-3xl font-bold text-white mb-6 mt-4 font-heading border-b border-indigo-500/20 pb-2">{trimmed.replace('# ', '')}</h1>);
    } else if (trimmed.startsWith('## ')) {
      flushList(index);
      elements.push(<h2 key={index} className="text-2xl font-bold text-indigo-300 mb-4 mt-6 font-heading flex items-center gap-2">{trimmed.replace('## ', '')}</h2>);
    } else if (trimmed.startsWith('### ')) {
      flushList(index);
      elements.push(<h3 key={index} className="text-lg font-semibold text-emerald-400 mb-2 mt-4 font-heading">{trimmed.replace('### ', '')}</h3>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const parsed = parseInlineMarkdown(trimmed.replace(/^[-*]\s+/, ''));
      currentList.push(parsed);
    } else if (trimmed === '---') {
      flushList(index);
      elements.push(<hr key={index} className="my-6 border-slate-800" />);
    } else if (trimmed !== '') {
      flushList(index);
      const parsed = parseInlineMarkdown(trimmed);
      elements.push(<p key={index} className="text-slate-300 mb-4 text-sm leading-relaxed pretty-paragraph" dangerouslySetInnerHTML={{ __html: parsed }} />);
    } else {
      flushList(index);
    }
  });

  // Final flush in case document ends with list or table
  flushList('final');
  flushTable('final');

  return <div className="markdown-body p-2">{elements}</div>;
}

// ---------------------------------------------------------------------------
// Delta Award Search Panel — shown inside the deal detail modal
// ---------------------------------------------------------------------------
function DeltaAwardSearchPanel({ deal, awBalances, backendUrl, authHeaders }) {
  const [awardData, setAwardData]   = useState(null);
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');

  const combinedMiles = awBalances.reduce((s, b) => s + b.balance, 0);

  async function search(cabin) {
    setSearching(true);
    setSearchError('');
    setAwardData(null);
    try {
      const params = new URLSearchParams({
        origin:      deal.departureAirport,
        destination: deal.destinationAirport,
        ...(cabin ? { cabin } : {}),
        days: '90',
      });
      const resp = await fetch(`${backendUrl}/api/delta/award-search?${params}`, { headers: authHeaders });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setAwardData(data);
    } catch (e) {
      setSearchError(e.message || 'Award search failed.');
    } finally {
      setSearching(false);
    }
  }

  const cabinColors = { economy: 'text-emerald-400', business: 'text-indigo-300', first: 'text-amber-300' };

  return (
    <div className="border-t border-slate-900 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-red-400 font-extrabold uppercase tracking-widest">
          ✈️ DELTA SKYMILES AWARD PRICING
        </div>
        <span className="text-[9px] text-slate-500">
          {combinedMiles.toLocaleString()} miles available
        </span>
      </div>

      {/* Search buttons */}
      {!awardData && !searching && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400">
            Search Delta award availability for <span className="text-white font-bold">{deal.departureAirport} → {deal.destinationAirport}</span>:
          </p>
          <div className="flex flex-wrap gap-2">
            {['economy', 'business', 'first'].map(cabin => (
              <button
                key={cabin}
                onClick={() => search(cabin)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 capitalize transition-all"
              >
                {cabin === 'economy' ? '🪑' : cabin === 'business' ? '🛋️' : '👑'} {cabin}
              </button>
            ))}
            <button
              onClick={() => search(null)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 text-red-300 transition-all"
            >
              🔍 All Cabins
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {searching && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <span className="animate-spin">⟳</span>
          Searching Delta award space for {deal.departureAirport} → {deal.destinationAirport}…
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-800/30 rounded px-3 py-2">
          {searchError}
        </div>
      )}

      {/* Results */}
      {awardData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-500">
              via {awardData.source === 'seats.aero' ? 'seats.aero live data' : awardData.source === 'gemini' ? 'Gemini web search' : 'illustrative data'}
              {awardData.note && ` · ${awardData.note}`}
            </span>
            <button onClick={() => { setAwardData(null); setSearchError(''); }} className="text-[9px] text-indigo-400 hover:text-indigo-300">
              ← New Search
            </button>
          </div>

          {!awardData.found ? (
            <p className="text-xs text-slate-400 italic">{awardData.message || 'No award space found.'}</p>
          ) : (
            <div className="space-y-2">
              {/* seats.aero results — date-by-date */}
              {awardData.source === 'seats.aero' && awardData.results?.slice(0, 5).map((r, i) => {
                const canAfford = combinedMiles >= r.miles;
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                    canAfford ? 'border-emerald-800/40 bg-emerald-950/10' : 'border-slate-800/60 bg-slate-900/30'
                  }`}>
                    <div>
                      <div className="text-xs font-bold text-white">{r.date} · <span className="capitalize text-slate-300">{r.cabin}</span></div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{r.route} · +${r.taxes_usd} taxes</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-extrabold font-heading ${cabinColors[r.cabin] || 'text-white'}`}>
                        {r.miles?.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-slate-500">miles</div>
                      {canAfford
                        ? <div className="text-[9px] text-emerald-400 mt-0.5">✓ You can book</div>
                        : <div className="text-[9px] text-rose-400 mt-0.5">Need {(r.miles - combinedMiles).toLocaleString()} more</div>
                      }
                    </div>
                  </div>
                );
              })}

              {/* Gemini / demo results — cabin range view */}
              {(awardData.source === 'gemini' || awardData.source === 'demo') && awardData.results?.map((r, i) => {
                const milesNeeded = r.miles_low || r.miles_needed;
                const canAfford   = combinedMiles >= milesNeeded;
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                    canAfford ? 'border-emerald-800/40 bg-emerald-950/10' : 'border-slate-800/60 bg-slate-900/30'
                  }`}>
                    <div>
                      <div className={`text-xs font-bold capitalize ${cabinColors[r.cabin] || 'text-white'}`}>
                        {r.cabin === 'economy' ? '🪑' : r.cabin === 'business' ? '🛋️' : '👑'} {r.cabin}
                      </div>
                      {r.notes && <div className="text-[9px] text-slate-500 mt-0.5 max-w-[180px]">{r.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-extrabold font-heading ${cabinColors[r.cabin] || 'text-white'}`}>
                        {r.miles_low?.toLocaleString()}
                        {r.miles_high && r.miles_high !== r.miles_low && <span className="text-xs font-normal text-slate-400">–{r.miles_high?.toLocaleString()}</span>}
                      </div>
                      <div className="text-[9px] text-slate-500">miles {r.typical_taxes_usd ? `+$${r.typical_taxes_usd} taxes` : ''}</div>
                      {canAfford
                        ? <div className="text-[9px] text-emerald-400 mt-0.5">✓ You can book</div>
                        : <div className="text-[9px] text-rose-400 mt-0.5">Need {(milesNeeded - combinedMiles).toLocaleString()} more</div>
                      }
                    </div>
                  </div>
                );
              })}

              {awardData.general_notes && (
                <p className="text-[9px] text-slate-500 italic">{awardData.general_notes}</p>
              )}

              {awardData.source_url && (
                <a href={awardData.source_url} target="_blank" rel="noreferrer"
                  className="text-[9px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                  Book on delta.com →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function checkVisaStatus(destinationString, profile) {
  if (!destinationString || !profile) return null;
  const dest = destinationString.toLowerCase();
  
  // List of countries allowing visa-free entry for valid US Visas / GC
  const visaFreeCountries = ['mexico', 'costa rica', 'panama', 'colombia', 'peru', 'georgia', 'turkey', 'taiwan', 'philippines', 'dominican republic', 'belize', 'honduras', 'guatemala', 'bahamas', 'antigua', 'albania', 'montenegro'];
  
  const isVisaFreeDest = visaFreeCountries.some(c => dest.includes(c));
  const usStatus = profile.usStatus || 'US Citizen';

  if (usStatus === 'US Citizen') {
    return { status: 'free', text: '🛂 US Passport - Visa Free' };
  }
  
  if (isVisaFreeDest) {
    if (usStatus === 'US Green Card') {
      return { status: 'free', text: '🛂 Visa-Free with US Green Card' };
    }
    if (usStatus.includes('Valid US Visa')) {
      return { status: 'free', text: '🛂 Visa-Free with Valid US Visa' };
    }
  }

  if (usStatus.includes('Expired') || usStatus === 'No Visa' || usStatus.includes('Advance Parole')) {
    if (isVisaFreeDest) return { status: 'required', text: '⚠️ Valid US Visa Required (AP Not Accepted)' };
    return { status: 'required', text: '⚠️ Visa Required' };
  }

  // Fallback for general countries not explicitly covered
  return { status: 'unknown', text: 'ℹ️ Check Visa Requirements' };
}

export default function App() {
  // App Auth States
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('aerofamily_token') !== null;
  });
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('aerofamily_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => {
    return localStorage.getItem('aerofamily_token') || null;
  });

  const [onboardingStep, setOnboardingStep] = useState(() => {
    const completed = localStorage.getItem('aerofamily_onboarded');
    return completed ? null : 1;
  });

  const [activeTab, setActiveTab] = useState('deals');
  const [newWishDest, setNewWishDest] = useState('');
  const [newWishStart, setNewWishStart] = useState('');
  const [newWishEnd, setNewWishEnd] = useState('');
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aerofamily_theme') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('aerofamily_theme', theme);
  }, [theme]);
  const [deals, setDeals] = useState([]);
  const [profile, setProfile] = useState({
    airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
    creditCards: ["Capital One Venture X"],
    passportCountry: "India",
    usStatus: "Valid US Visa (B1/B2/H1/H4)",
    familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
    activeEngine: "demo"
  });
  const [logs, setLogs] = useState([]);
  const [activeItinerary, setActiveItinerary] = useState(null);
  const [researchingDest, setResearchingDest] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanConsoleLogs, setScanConsoleLogs] = useState([]);
  // Tracks whether a scan has ever completed this session, and how many raw deals it found
  const [lastScanDealsFound, setLastScanDealsFound] = useState(null); // null = never scanned
  const [newAirportCode, setNewAirportCode] = useState('');
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [hoveredAirport, setHoveredAirport] = useState(null);
  const [isGridView, setIsGridView] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // Custom mock email input state for Simulated Dev Login
  const [devEmail, setDevEmail] = useState('');

  // WhatsApp Alerts Settings State
  const [waPhoneNumber, setWaPhoneNumber] = useState('');
  const [waOptInAlerts, setWaOptInAlerts] = useState(true);
  const [waRegistering, setWaRegistering] = useState(false);
  const [waSuccessMsg, setWaSuccessMsg] = useState('');

  useEffect(() => {
    if (profile && profile.whatsapp) {
      setWaPhoneNumber(profile.whatsapp.phoneNumber || '');
      setWaOptInAlerts(profile.whatsapp.optInAlerts !== false);
    }
  }, [profile]);

  // ── Wallet: Plaid + AwardWallet state ───────────────────────────────────
  const [walletStatus, setWalletStatus]         = useState({ plaid: {}, awardwallet: {} });
  const [plaidBalances, setPlaidBalances]        = useState([]);
  const [awBalances, setAwBalances]              = useState([]);
  const [syncingPlaid, setSyncingPlaid]          = useState(false);
  const [syncingAW, setSyncingAW]                = useState(false);
  const [showPlaidModal, setShowPlaidModal]      = useState(false);
  const [showAwModal, setShowAwModal]            = useState(false);
  const [walletError, setWalletError]            = useState('');

  // Load wallet status + cached balances on mount (after profile loads)
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchWalletStatus();
  }, [isLoggedIn]);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  async function fetchWalletStatus() {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/wallet/status`, { headers: authHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setWalletStatus(data);
        // Auto-fetch balances if already connected
        if (data.plaid?.connected)      fetchPlaidBalances();
        if (data.awardwallet?.connected) fetchAwBalances();
      }
    } catch (_) {}
  }

  async function fetchPlaidBalances() {
    setSyncingPlaid(true);
    setWalletError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/api/plaid/balances`, { headers: authHeaders() });
      const data = await resp.json();
      if (data.balances) setPlaidBalances(data.balances);
    } catch (e) {
      setWalletError('Failed to fetch card balances. Try again.');
    } finally {
      setSyncingPlaid(false);
    }
  }

  async function fetchAwBalances() {
    setSyncingAW(true);
    setWalletError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/api/awardwallet/balances`, { headers: authHeaders() });
      const data = await resp.json();
      if (data.balances) setAwBalances(data.balances);
    } catch (e) {
      setWalletError('Failed to fetch loyalty balances. Try again.');
    } finally {
      setSyncingAW(false);
    }
  }

  // Simulate Plaid Link: request link token → show modal → on "connect" exchange token
  async function openPlaidLink() {
    setWalletError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/api/plaid/create-link-token`, {
        method: 'POST', headers: authHeaders(),
      });
      const data = await resp.json();
      if (data.link_token) {
        // If real Plaid SDK were loaded, we'd call Plaid Link here.
        // In simulator mode (or without plaid-link SDK), we show our modal.
        setShowPlaidModal(true);
      }
    } catch (e) {
      setWalletError('Could not initiate bank connection. Check server.');
    }
  }

  async function confirmPlaidConnect() {
    setShowPlaidModal(false);
    setSyncingPlaid(true);
    try {
      // Exchange with a mock token (simulator) or real public_token from Plaid Link callback
      const exchResp = await fetch(`${BACKEND_URL}/api/plaid/exchange-public-token`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ public_token: 'mock_public_token_simulator' }),
      });
      const exchData = await exchResp.json();
      if (exchData.success) {
        await fetchWalletStatus();
        await fetchPlaidBalances();
      }
    } catch (e) {
      setWalletError('Connection failed. Please try again.');
    } finally {
      setSyncingPlaid(false);
    }
  }

  async function disconnectPlaidAccount() {
    if (!confirm('Disconnect your Capital One account? Synced balances will be removed.')) return;
    setSyncingPlaid(true);
    try {
      await fetch(`${BACKEND_URL}/api/plaid/disconnect`, { method: 'DELETE', headers: authHeaders() });
      setPlaidBalances([]);
      await fetchWalletStatus();
    } finally {
      setSyncingPlaid(false);
    }
  }

  async function confirmAwConnect() {
    setShowAwModal(false);
    setSyncingAW(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/awardwallet/connect`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ aw_user_id: null }), // null → server generates mock ref
      });
      const data = await resp.json();
      if (data.success) {
        await fetchWalletStatus();
        await fetchAwBalances();
      }
    } catch (e) {
      setWalletError('Loyalty connection failed. Please try again.');
    } finally {
      setSyncingAW(false);
    }
  }

  async function disconnectAwAccount() {
    if (!confirm('Disconnect your Delta SkyMiles account? Synced balances will be removed.')) return;
    setSyncingAW(true);
    try {
      await fetch(`${BACKEND_URL}/api/awardwallet/disconnect`, { method: 'DELETE', headers: authHeaders() });
      setAwBalances([]);
      await fetchWalletStatus();
    } finally {
      setSyncingAW(false);
    }
  }

  function formatSyncedAgo(isoStr) {
    if (!isoStr) return 'never';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
  // ── End Wallet state ─────────────────────────────────────────────────────
  
  const terminalEndRef = useRef(null);

  const getDynamicScanSummary = (activeDealsSet) => {
    // 1. Calculate time since last scan
    let timeAgoText = "recently";
    if (logs && logs.length > 0 && logs[0].timestamp) {
      const scanTime = new Date(logs[0].timestamp);
      const now = new Date();
      const diffMs = now - scanTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffMins < 1) {
        timeAgoText = "just now";
      } else if (diffMins < 60) {
        timeAgoText = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        timeAgoText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        timeAgoText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      }
    }

    // 2. Count live deals
    const liveDealsCount = activeDealsSet.length;

    // 3. Count expiring deals
    const expiringSoonCount = activeDealsSet.filter(deal => {
      const window = (deal.bookingWindow || '').toLowerCase();
      return window.includes('48 hour') || window.includes('24 hour') || window.includes('today') || window.includes('minute') || window.includes('limited');
    }).length;

    const expiringText = expiringSoonCount > 0 
      ? `one expires soon` 
      : "none expire immediately";

    const departureAirport = profile.airports && profile.airports[0] ? profile.airports[0].code : 'ATL';

    // 4. Calculate next scan schedule time (12:00 PM or 12:00 AM)
    const now = new Date();
    let nextScanText = "12:00 AM";
    const currentHour = now.getHours();
    if (currentHour < 12) {
      nextScanText = "12:00 PM";
    } else {
      nextScanText = "12:00 AM";
    }

    // 5. New deals found in latest scan
    const newDealsCount = logs && logs.length > 0 ? (logs[0].dealsFound ?? liveDealsCount) : liveDealsCount;

    return {
      timeAgoText,
      liveDealsCount,
      expiringText,
      departureAirport,
      nextScanText,
      newDealsCount
    };
  };

  const handleOnboardingNext = () => {
    setOnboardingStep(prev => {
      const next = prev + 1;
      if (next === 4) setActiveTab('deals');
      if (next === 7) setActiveTab('settings');
      if (next > 7) {
        localStorage.setItem('aerofamily_onboarded', 'true');
        return null;
      }
      return next;
    });
  };

  const handleOnboardingPrev = () => {
    setOnboardingStep(prev => {
      const back = Math.max(1, prev - 1);
      if (back === 4 || back === 5 || back === 6) setActiveTab('deals');
      if (back === 7) setActiveTab('settings');
      return back;
    });
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('aerofamily_onboarded', 'true');
    setOnboardingStep(null);
    setActiveTab('deals');
  };

  // Fetch index items when token or login status changes
  useEffect(() => {
    fetchDeals();
    fetchProfile();
    fetchLogs();
  }, [token, isLoggedIn]);

  // Scroll to bottom of terminal during scanning log output
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scanConsoleLogs]);

  // Initialize Google Sign-In SDK
  useEffect(() => {
    /* global google */
    if (!isLoggedIn && typeof google !== 'undefined') {
      try {
        google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleLoginSuccess
        });
        
        const btnParent = document.getElementById("google-signin-btn");
        if (btnParent) {
          btnParent.innerHTML = ''; // Clear previous button rendering
          google.accounts.id.renderButton(btnParent, {
            theme: theme === 'light' ? 'outline' : 'filled_dark',
            size: "large",
            shape: "pill"
          });
        }
      } catch (e) {
        console.error("Failed to initialize Google Sign-In:", e);
      }
    }
  }, [isLoggedIn, theme]);

  // Auto-start onboarding tour when user is on the login page
  useEffect(() => {
    if (!isLoggedIn) {
      setOnboardingStep(1);
    }
  }, [isLoggedIn]);

  const handleGoogleLoginSuccess = (response) => {
    const idToken = response.credential;
    try {
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      const payload = JSON.parse(jsonPayload);
      const loggedInUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };
      
      setUser(loggedInUser);
      setToken(idToken);
      setIsLoggedIn(true);
      
      localStorage.setItem('aerofamily_user', JSON.stringify(loggedInUser));
      localStorage.setItem('aerofamily_token', idToken);
      setOnboardingStep(prev => (prev && prev <= 3) ? 4 : prev);
    } catch (e) {
      console.error("Failed to parse Google ID token:", e);
    }
  };

  const handleSimulatedLogin = (e) => {
    e.preventDefault();
    const email = devEmail.trim() || 'ankit@gmail.com';
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ');
    const formattedName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    const loggedInUser = {
      id: `dev-${email.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      email: email,
      name: formattedName,
      picture: `https://api.dicebear.com/7.x/adventurer/svg?seed=${email}`
    };
    
    const mockToken = `dev-mock-token-${email}`;
    
    setUser(loggedInUser);
    setToken(mockToken);
    setIsLoggedIn(true);
    
    localStorage.setItem('aerofamily_user', JSON.stringify(loggedInUser));
    localStorage.setItem('aerofamily_token', mockToken);
    setOnboardingStep(prev => (prev && prev <= 3) ? 4 : prev);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setIsLoggedIn(false);
    localStorage.removeItem('aerofamily_user');
    localStorage.removeItem('aerofamily_token');
    setActiveTab('deals');
    setDeals([]);
    setLogs([]);
  };

  const fetchDeals = async () => {
    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch(`${BACKEND_URL}/api/deals`, { headers });
      const data = await res.json();
      setDeals(data);
    } catch (err) {
      console.error("Error fetching deals:", err);
    }
  };

  const fetchProfile = async () => {
    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/profile`, { headers });
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/logs`, { headers });
      const data = await res.json();
      setLogs(data);
      // Seed lastScanDealsFound from most recent log entry so refresh shows correct empty state
      if (Array.isArray(data) && data.length > 0 && data[0].dealsFound !== undefined) {
        setLastScanDealsFound(data[0].dealsFound);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const saveProfile = async (updatedProfile) => {
    try {
      const res = await handleApiPost('/api/profile', updatedProfile);
      if (res.success) {
        setProfile(updatedProfile);
      }
    } catch (err) {
      console.error("Error saving profile:", err);
    }
  };

  const handleAddWishlist = () => {
    if (!newWishDest.trim()) return;
    const item = { destination: newWishDest.trim() };
    if (newWishStart) item.startMonth = newWishStart;
    if (newWishEnd) item.endMonth = newWishEnd;
    
    const currentList = profile.wishlist || [];
    saveProfile({ ...profile, wishlist: [...currentList, item] });
    
    setNewWishDest('');
    setNewWishStart('');
    setNewWishEnd('');
  };

  const handleRemoveWishlist = (index) => {
    const currentList = profile.wishlist || [];
    const newList = [...currentList];
    newList.splice(index, 1);
    saveProfile({ ...profile, wishlist: newList });
  };

  const registerWhatsApp = async () => {
    if (!waPhoneNumber) return;
    setWaRegistering(true);
    setWaSuccessMsg('');
    try {
      const res = await handleApiPost('/api/profile/whatsapp', {
        phoneNumber: waPhoneNumber,
        optInAlerts: waOptInAlerts
      });
      if (res.success) {
        setProfile({
          ...profile,
          whatsapp: res.whatsapp
        });
        setWaSuccessMsg('🎉 Successfully verified instantly!');
        setTimeout(() => setWaSuccessMsg(''), 5000);
      }
    } catch (err) {
      console.error("Error registering WhatsApp:", err);
    } finally {
      setWaRegistering(false);
    }
  };

  const handleApiPost = async (endpoint, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return await res.json();
  };

  // Run deal scanning agent manually
  const triggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanConsoleLogs(["[System] Spawning Agent Process...", "[System] Loading configuration parameters..."]);
    
    // Simulate real-time streaming in console for beautiful UI feedback
    const processLogs = [
      `[Agent] Selected Scan Engine: "${profile.activeEngine.toUpperCase()}"`,
      `[Agent] Scan Departure Airports: ${profile.airports.map(a => a.code).join(', ')}`,
      "[Agent] Initializing background HTTP channels...",
      profile.activeEngine === 'kiwi'
        ? "[Agent:Kiwi] Querying Kiwi Tequila live API for anywhere search..."
        : profile.activeEngine === 'demo' 
        ? "[Agent:Demo] Accessing offline flight inventory matrix..." 
        : profile.activeEngine === 'gemini' 
        ? "[Agent:Gemini] Querying Gemini 2.5 Flash API with search grounding. Searching flight blogs..."
        : "[Agent:Travelpayouts] Connecting to live Travelpayouts flight price cache database...",
      "[Agent] Scanning route drop opportunities..."
    ];

    let delay = 300;
    processLogs.forEach((logLine, i) => {
      setTimeout(() => {
        setScanConsoleLogs(prev => [...prev, logLine]);
      }, delay * (i + 1));
    });

    try {
      // Trigger backend scan
      const result = await handleApiPost('/api/scan', {});
      
      setTimeout(() => {
        // Push actual agent logs to console log visualizer
        setScanConsoleLogs(prev => [...prev, ...result.logs, `[System] Process completed with status: ${result.status.toUpperCase()}`]);
        setLastScanDealsFound(result.dealsFound ?? 0);
        setScanning(false);
        fetchDeals();
        fetchLogs();
      }, delay * processLogs.length + 1000);
      
    } catch (err) {
      setTimeout(() => {
        setScanConsoleLogs(prev => [...prev, `[System Error] Scan execution failed: ${err.message}`, "[System] Reverted to safe standby."]);
        setScanning(false);
      }, delay * processLogs.length + 1000);
    }
  };

  // Trigger Gemini Deep Travel Research for selected deal
  const researchTrip = async (deal) => {
    if (researchingDest) return;
    setResearchingDest(deal.destination);
    setActiveItinerary(null);
    setActiveTab('itinerary');

    try {
      const res = await handleApiPost('/api/research', {
        destination: deal.destination,
        destinationAirport: deal.destinationAirport,
        departureAirport: deal.departureAirport,
        dealPrice: deal.dealPrice
      });

      setActiveItinerary({
        destination: deal.destination,
        content: res.itinerary
      });
    } catch (err) {
      console.error("Research failed:", err);
      setActiveItinerary({
        destination: deal.destination,
        content: `### ❌ Research Failed\n\nFailed to connect to the itinerary agent: ${err.message}. Please verify the backend is running.`
      });
    } finally {
      setResearchingDest(null);
    }
  };

  // Credit Card reward calculations
  const calculateCardBenefits = (dealPrice) => {
    const passengerCount = profile.familyProfile.adults + profile.familyProfile.kids;
    const totalFlightCost = dealPrice * passengerCount;
    
    const recommendations = profile.creditCards.map(cardName => {
      const card = PREMIUM_CARDS[cardName];
      if (!card) return null;

      const pointsEarned = Math.round(totalFlightCost * card.multiplier);
      const pointsValueCash = Math.round(pointsEarned * card.valuation);
      const netReturnRate = (pointsValueCash / totalFlightCost) * 100;

      return {
        cardName: card.name,
        points: pointsEarned,
        savings: pointsValueCash,
        netEffectiveCost: totalFlightCost - pointsValueCash,
        returnRate: netReturnRate,
        idealFor: card.idealFor
      };
    }).filter(Boolean);

    // Sort by highest monetary value savings
    recommendations.sort((a, b) => b.savings - a.savings);
    return recommendations;
  };

  // Add airport to profile
  const addAirport = () => {
    const code = newAirportCode.trim().toUpperCase();
    if (!code || code.length !== 3) return alert("Please enter a valid 3-letter IATA code.");
    if (profile.airports.some(a => a.code === code)) return alert("Airport already configured.");

    const newAirport = {
      code,
      name: `${code} International Airport`,
      type: "secondary"
    };

    const updatedProfile = {
      ...profile,
      airports: [...profile.airports, newAirport]
    };
    saveProfile(updatedProfile);
    setNewAirportCode('');
  };

  // Remove airport
  const removeAirport = (code) => {
    if (profile.airports.length === 1) return alert("You must keep at least one departure airport.");
    const updatedProfile = {
      ...profile,
      airports: profile.airports.filter(a => a.code !== code)
    };
    saveProfile(updatedProfile);
  };

  // Toggle credit cards owned
  const toggleCreditCard = (cardName) => {
    const updatedCards = profile.creditCards.includes(cardName)
      ? profile.creditCards.filter(c => c !== cardName)
      : [...profile.creditCards, cardName];
      
    saveProfile({
      ...profile,
      creditCards: updatedCards
    });
  };

  // Update family inputs
  const updateFamilyDetails = (field, value) => {
    const updatedProfile = {
      ...profile,
      familyProfile: {
        ...profile.familyProfile,
        [field]: value
      }
    };
    saveProfile(updatedProfile);
  };

  const handleInterestToggle = (interest) => {
    const interests = profile.familyProfile.interests || [];
    const updatedInterests = interests.includes(interest)
      ? interests.filter(i => i !== interest)
      : [...interests, interest];
      
    updateFamilyDetails('interests', updatedInterests);
  };

  const renderOnboardingOverlay = () => {
    if (!onboardingStep) return null;
    
    return (
      <div className="fixed bottom-24 right-6 z-[200] max-w-sm w-[90%] md:w-full animate-in slide-in-from-bottom-8 duration-300 text-left">
        <div className="bg-[#0b0d13]/95 backdrop-blur-xl border border-indigo-500/30 shadow-2xl rounded-2xl p-5 space-y-4">
          
          {/* Step Header */}
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest font-mono">
              🧭 AeroFamily Tour Guide • Step {onboardingStep} of 7
            </span>
            <button 
              onClick={handleOnboardingSkip}
              className="text-slate-500 hover:text-slate-300 text-xs font-semibold bg-transparent border-none cursor-pointer"
            >
              Skip Tour
            </button>
          </div>

          {/* Step Contents */}
          {onboardingStep === 1 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                ✈️ AeroFamily: Autonomous Deal Finder
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Welcome to AeroFamily! An autonomous family-focused flight intelligence suite that works for your whole family in the background.
              </p>
              <ul className="text-xs text-slate-400 space-y-1 pl-4 list-disc">
                <li><strong>Dynamic Multi-Passenger Math</strong>: Scales fare drops for kids + adults instantly.</li>
                <li><strong>No More Guesswork</strong>: Filters flight prices based on your customized family budget.</li>
              </ul>
            </div>
          )}

          {onboardingStep === 2 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                🧠 Smart Rewards & AI Itineraries
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                AeroFamily goes beyond basic searches to extract deep value:
              </p>
              <ul className="text-xs text-slate-400 space-y-1 pl-4 list-disc">
                <li><strong>Credit Card Points Optimizer</strong>: Valuates and suggests the absolute best card to pay for your flights.</li>
                <li><strong>Gemini Deep Research Agent</strong>: Drafts rich, 5-day customized itineraries highlighting safety, activities, and transport!</li>
              </ul>
            </div>
          )}

          {onboardingStep === 3 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                🔐 Isolated Sandbox Databases
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                To guard your cards, search logs, and preferences, all details are isolated securely:
              </p>
              {isLoggedIn ? (
                <div className="bg-[#10b981]/10 border border-[#10b981]/20 rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#10b981] font-bold">
                  <span>✓</span>
                  <span>Successfully Authenticated! Click 'Next Step' to enter your dashboard.</span>
                </div>
              ) : (
                <p className="text-xs text-indigo-300 font-medium leading-relaxed">
                  Please sign in using <strong>Google Auth</strong> or type any sandbox email in the <strong>Dev Sandbox Form</strong> below to enter the dashboard and continue! ➔
                </p>
              )}
            </div>
          )}

          {onboardingStep === 4 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                ✈️ Welcome to the Dashboard!
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                You've successfully authorized your sandbox profile. This is your Flight Deal Intelligence command center. Let's see how to control it!
              </p>
            </div>
          )}

          {onboardingStep === 5 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                💰 Family Budget Calculator
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Adjust your active family passengers (adults & kids) and set your total flight budget. 
              </p>
              <p className="text-xs text-indigo-300 leading-relaxed">
                AeroFamily automatically multiplies fare drops to calculate family totals and filters out expensive flights instantly!
              </p>
            </div>
          )}

          {onboardingStep === 6 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                📡 Flight Coordinate Radar
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Our interactive SVG flight map connects your origins to major drop points. 
              </p>
              <ul className="text-xs text-slate-400 space-y-1 pl-4 list-disc">
                <li>Hover over nodes to see bezier flight paths.</li>
                <li>Flights exceeding your family budget automatically fade out and label themselves <strong>Over Budget</strong>!</li>
              </ul>
            </div>
          )}

          {onboardingStep === 7 && (
            <div className="space-y-2">
              <h3 className="text-white text-base font-extrabold font-heading flex items-center gap-1.5">
                ⚙️ Consolidated Settings & Wallet
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Under the <strong>Settings & Wallet</strong> tab in the bottom nav, you can:
              </p>
              <ul className="text-xs text-slate-400 space-y-1 pl-4 list-disc">
                <li>Whitelist origin departure airports (ATL, JFK, etc.).</li>
                <li>Select active search engines (Demo, Kiwi, Gemini, Travelpayouts).</li>
                <li>Toggle credit cards to calculate point multipliers.</li>
                <li>Review agent console logs (neatly hidden inside the collapsible details accordion!).</li>
              </ul>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-2.5 pt-2 border-t border-slate-900">
            {onboardingStep > 1 && (
              <button 
                onClick={handleOnboardingPrev}
                className="btn btn-secondary flex-1 text-xs py-1.5 cursor-pointer leading-none min-h-[36px]"
              >
                Back
              </button>
            )}
            <button 
              disabled={onboardingStep === 3 && !isLoggedIn}
              onClick={handleOnboardingNext}
              className="btn btn-primary flex-1 text-xs py-1.5 cursor-pointer leading-none min-h-[36px] shadow-indigo-600/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {onboardingStep === 3 && !isLoggedIn 
                ? 'Sign In Below 🔑' 
                : onboardingStep === 7 
                  ? 'Complete Tour 🏁' 
                  : 'Next Step'}
            </button>
          </div>

        </div>
      </div>
    );
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
        {/* Navigation Bar */}
        <nav className="fixed top-0 w-full z-50 glass-panel border-b border-indigo-500/10 px-6 py-4 flex items-center justify-between transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/40">✈️</div>
            <div>
              <h1 className="text-xl font-extrabold font-heading tracking-tight text-white">AeroFamily</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden md:block text-sm font-bold text-slate-300 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
            >
              Log In
            </button>
            <button 
              onClick={() => {
                document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn btn-primary text-sm px-5 py-2 shadow-lg shadow-indigo-500/20"
            >
              Get Started
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
          <div className="absolute inset-0 top-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#080a0f] to-[#080a0f] -z-10 pointer-events-none"></div>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
            Meet Your Autonomous Travel Agent
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black font-heading text-white tracking-tight leading-[1.1] mb-6 max-w-4xl animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Never Overpay For <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">Family Vacations</span> Again.
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            AeroFamily works while you sleep. We autonomously scan the web for error fares, verify your visa requirements, and calculate the exact credit card points you need—tailored for your whole family.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            <button 
              onClick={() => document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' })}
              className="btn btn-primary text-base px-8 py-4 shadow-xl shadow-indigo-600/20 hover:scale-105 transition-transform"
            >
              Start Hunting Deals
            </button>
            <button 
              onClick={() => document.getElementById('features-section').scrollIntoView({ behavior: 'smooth' })}
              className="btn bg-slate-800/50 text-white hover:bg-slate-700/50 border border-slate-700 text-base px-8 py-4 hover:scale-105 transition-transform"
            >
              See How It Works ↓
            </button>
          </div>
        </section>

        {/* Features Grid Section */}
        <section id="features-section" className="py-24 px-6 bg-slate-900/20 border-y border-slate-800/50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-black font-heading text-white mb-4">An Entire Travel Agency In Your Pocket</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">Everything you need to plan, book, and save on your next family adventure, consolidated into one powerful AI dashboard.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Feature 1 */}
              <div className="glass-card p-8 rounded-3xl border border-slate-800 hover:border-indigo-500/50 transition-colors group">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">🤖</div>
                <h3 className="text-2xl font-bold text-white mb-3 font-heading">Autonomous Deal Scanning</h3>
                <p className="text-slate-400 leading-relaxed">
                  Tell us your home airport and family size. Our AI constantly scours the web, catching error fares and massive price drops before they disappear. We do the math for the whole family instantly.
                </p>
              </div>
              
              {/* Feature 2 */}
              <div className="glass-card p-8 rounded-3xl border border-slate-800 hover:border-blue-500/50 transition-colors group">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">🛂</div>
                <h3 className="text-2xl font-bold text-white mb-3 font-heading">Passport & Visa Guard</h3>
                <p className="text-slate-400 leading-relaxed">
                  Never get stuck at the border again. Input your citizenship and current US visa status. We'll automatically warn you if a cheap flight requires a transit visa you don't have.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="glass-card p-8 rounded-3xl border border-slate-800 hover:border-emerald-500/50 transition-colors group">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">💳</div>
                <h3 className="text-2xl font-bold text-white mb-3 font-heading">Credit Card Points Optimizer</h3>
                <p className="text-slate-400 leading-relaxed">
                  Don't pay cash if you don't have to. Link your travel credit cards (Chase, Amex, Capital One) and see the exact points cost for every flight deal on your radar.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="glass-card p-8 rounded-3xl border border-slate-800 hover:border-amber-500/50 transition-colors group">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">⭐</div>
                <h3 className="text-2xl font-bold text-white mb-3 font-heading">Destination Wishlist Alerts</h3>
                <p className="text-slate-400 leading-relaxed">
                  Have a bucket-list trip to Japan? Add it to your wishlist with an optional month range. Go about your life, and we'll immediately email you the second a deal drops for your dates.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication Section */}
        <section id="auth-section" className="py-32 px-6 flex flex-col items-center justify-center relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#080a0f] to-[#080a0f] -z-10 pointer-events-none"></div>
          
          <div className="max-w-md w-full mx-auto">
            <div className="glass-card p-10 space-y-8 text-center shadow-2xl border-indigo-500/30 rounded-[2rem] relative overflow-hidden">
              {/* Decorative background glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 blur-3xl rounded-full pointer-events-none"></div>

              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl mx-auto shadow-lg shadow-indigo-600/30">
                🔒
              </div>
              
              <div className="space-y-3 relative z-10">
                <h2 className="text-3xl font-black font-heading text-white">Join AeroFamily</h2>
                <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
                  Securely authenticate to access your personalized flight scanners, digital wallet, and AI itineraries.
                </p>
              </div>

              {/* Google Sign In Button Container */}
              <div className="flex flex-col items-center justify-center py-4 relative z-10 bg-white/5 rounded-2xl p-6 border border-white/10">
                <div id="google-signin-btn" className="transform scale-110 origin-center"></div>
                <div className="text-[10px] text-slate-500 mt-4 font-mono">Secured by Google Identity Services</div>
              </div>

              <div className="flex items-center gap-3 my-6 relative z-10">
                <hr className="flex-1 border-slate-800" />
                <span className="text-xs font-bold text-slate-500 bg-[#080a0f] px-2">OR</span>
                <hr className="flex-1 border-slate-800" />
              </div>

              {/* Simulated Dev Login (Fallback) */}
              <form onSubmit={handleSimulatedLogin} className="space-y-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 text-left relative z-10 backdrop-blur-sm">
                <div className="text-xs font-black tracking-wider text-indigo-400 flex items-center gap-2">
                  <span>💡 Dev Sandbox Login</span>
                  <span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-2 py-0.5 rounded-md border border-indigo-500/30">Simulated</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  No Client ID? Type any email below to simulate a Google Profile and enter the dashboard.
                </p>
                <div className="flex flex-col gap-3">
                  <input 
                    type="email" 
                    required
                    placeholder="e.g. ankit@gmail.com"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                  />
                  <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-sm">
                    Enter Sandbox
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/50 bg-[#06080c] py-8 text-center text-xs text-slate-500 font-mono">
          <p>AeroFamily Web App v2.2 • Local Secure Storage Activated</p>
          <p className="mt-2 text-slate-600">Built for the autonomous future of travel.</p>
        </footer>
      </div>
    );
  }

  const passengers = profile.familyProfile.adults + profile.familyProfile.kids;
  const filteredDeals = deals.filter(deal => {
    const totalCost = deal.dealPrice * passengers;
    if (totalCost > profile.familyProfile.budget) return false;
    
    if (filterStartDate && deal.outboundDate < filterStartDate) return false;
    if (filterEndDate && deal.returnDate > filterEndDate) return false;
    
    return true;
  });

  const { timeAgoText, liveDealsCount, expiringText, departureAirport, nextScanText, newDealsCount } = getDynamicScanSummary(filteredDeals);

  return (
    <div className="min-h-screen pb-28 bg-[#080a0f]">
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between bg-[#080a0f] border-b border-[#121620]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#5f5af6] flex items-center justify-center text-white shadow shadow-[#5f5af6]/30">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-5.5l8 2.5z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-extrabold font-heading tracking-tight text-white leading-tight">AeroFamily</h1>
          </div>
        </div>

        {/* User profile & Log Out */}
        <div className="flex items-center gap-6 text-xs text-[#94a3b8]">
          <div className="hidden sm:flex items-center gap-2 font-semibold">
            <span>Family of {profile.familyProfile.adults + profile.familyProfile.kids}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></span>
            <span className="text-[#94a3b8] font-semibold tracking-wide">Daemon armed</span>
          </div>

          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-[#131824] hover:bg-[#1a2030] text-indigo-300 border border-indigo-950/60 transition-all cursor-pointer bg-transparent text-sm"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button 
            onClick={() => setOnboardingStep(isLoggedIn ? 4 : 1)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#131824] hover:bg-[#1a2030] text-indigo-300 border border-indigo-950/60 transition-colors font-bold cursor-pointer bg-transparent text-xs"
          >
            <span>🧭</span>
            <span>Tour Guide</span>
          </button>

          {isLoggedIn && user && (
            <div className="flex items-center gap-2 bg-[#0e111a] border border-slate-800 rounded-full pl-1.5 pr-3 py-1 text-xs">
              <img 
                src={user.picture} 
                alt={user.name} 
                className="w-6 h-6 rounded-full border border-indigo-500/20 object-cover"
              />
              <span className="font-semibold text-slate-200 hidden md:inline">{user.name.split(' ')[0]}</span>
              <button 
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-400 transition-colors font-extrabold ml-1 px-1 text-xs cursor-pointer bg-transparent border-none outline-none"
                title="Log Out"
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-6 mt-8">

        {/* TAB 1: FLIGHT DEALS */}
        {activeTab === 'deals' && (
          <section className="space-y-8 animate-in fade-in duration-300">
            
            {/* Redesigned Upper Dashboard Row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Left Panel: SINCE YOUR LAST VISIT */}
              <div className="lg:col-span-2 bg-[#0c0f16]/90 border border-[#121620]/60 rounded-2xl p-6 flex flex-col justify-between shadow-xl backdrop-blur-md">
                <div>
                  <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">
                    SINCE YOUR LAST VISIT
                  </div>
                  
                  {/* Large Stat — always reflects what's actually showing */}
                  <div className="flex items-baseline gap-3 mt-4">
                    <span className={`text-8xl font-black font-heading leading-none ${filteredDeals.length > 0 ? 'text-white' : 'text-slate-600'}`}>
                      {filteredDeals.length}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-emerald-400 font-extrabold text-sm uppercase tracking-wider leading-none">live</span>
                      <span className="text-emerald-400 font-extrabold text-sm uppercase tracking-wider leading-none mt-1">deals</span>
                    </div>
                  </div>

                  {/* Dynamic description paragraph */}
                  <p className="text-slate-400 text-xs mt-4 leading-relaxed pretty-paragraph">
                    {lastScanDealsFound === null
                      ? `No scan run yet from ${departureAirport}. Hit the button below to search for fare drops.`
                      : lastScanDealsFound === 0
                      ? `Last scan from ${departureAirport} ${timeAgoText} found no deals. Try switching engines or scanning again.`
                      : <span>The agent found <strong className="text-slate-200">{lastScanDealsFound} deal{lastScanDealsFound !== 1 ? 's' : ''}</strong> from {departureAirport} {timeAgoText}. {liveDealsCount} within your ${profile.familyProfile.budget.toLocaleString()} budget.</span>
                    }
                  </p>

                  {/* Family & Budget Interactive Controls */}
                  <div className="family-calculator-card mt-5 space-y-3.5 bg-slate-950/45 p-4 rounded-xl border border-slate-900/80">
                    <div className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">
                      ✈️ Family Flight Calculator
                    </div>
                    
                    {/* Passengers Tweak */}
                    <div className="grid grid-cols-2 gap-3 mt-1 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">👨 Adults</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => updateFamilyDetails('adults', Math.max(1, profile.familyProfile.adults - 1))}
                            className="family-calculator-btn w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >-</button>
                          <span className="text-white font-bold">{profile.familyProfile.adults}</span>
                          <button 
                            onClick={() => updateFamilyDetails('adults', profile.familyProfile.adults + 1)}
                            className="family-calculator-btn w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >+</button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">👶 Kids</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => updateFamilyDetails('kids', Math.max(0, profile.familyProfile.kids - 1))}
                            className="family-calculator-btn w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >-</button>
                          <span className="text-white font-bold">{profile.familyProfile.kids}</span>
                          <button 
                            onClick={() => updateFamilyDetails('kids', profile.familyProfile.kids + 1)}
                            className="family-calculator-btn w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >+</button>
                        </div>
                      </div>
                    </div>

                    {/* Flight Budget Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">💰 Flight Budget (Total Family)</span>
                        <span className="text-emerald-400 font-mono font-bold">${profile.familyProfile.budget.toLocaleString()}</span>
                      </div>
                      <input 
                        type="range" 
                        min="500" 
                        max="8000" 
                        step="100"
                        value={profile.familyProfile.budget} 
                        onChange={(e) => updateFamilyDetails('budget', parseInt(e.target.value) || 500)}
                        className="w-full accent-[#5f5af6] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <hr className="border-slate-900 my-6" />
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">ACTIVE</div>
                      <div className="text-white text-2xl font-black font-heading mt-1">{liveDealsCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">BEST SAVE</div>
                      <div className="text-emerald-400 text-2xl font-black font-heading mt-1">
                        {deals.length > 0 ? `${Math.max(...deals.map(d => d.savingsPercent))}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">NEXT SCAN</div>
                      <div className="text-white text-2xl font-black font-heading mt-1">{nextScanText}</div>
                    </div>
                  </div>

                  <button 
                    onClick={triggerScan}
                    disabled={scanning}
                    className="btn btn-primary w-full mt-6 text-xs py-2 shadow-lg shadow-indigo-600/20"
                  >
                    {scanning ? '🔄 SCANNING DAEMON...' : '🔎 SCAN FOR FARE DROPS'}
                  </button>
                </div>
              </div>

              {/* Right Panel: FLIGHT ROUTE VISUALIZATION MAP */}
              <div className="lg:col-span-3 bg-[#0c0f16]/90 border border-[#121620]/60 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between min-h-[340px] relative overflow-hidden">
                <div className="flex justify-between items-center z-10">
                  <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping inline-block"></span>
                    {deals.length > 0 ? `${deals.length} LIVE ROUTE${deals.length !== 1 ? 'S' : ''} FROM` : 'NO ROUTES YET FROM'} {profile.airports[0]?.code || 'ATL'}
                  </div>
                  <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-900/30">
                    interactive radar
                  </span>
                </div>

                {/* SVG Flight Map Container */}
                <div className="flex-1 w-full min-h-[260px] mt-4 relative">
                  <svg 
                    viewBox="0 0 720 300" 
                    className="w-full h-full select-none"
                    style={{ background: 'transparent' }}
                  >
                    <defs>
                      <pattern id="flight-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                        <circle cx="2" cy="2" r="1" fill="rgba(255, 255, 255, 0.04)" />
                      </pattern>
                      <radialGradient id="halo-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="yellow-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Grid Background */}
                    <rect width="100%" height="100%" fill="url(#flight-grid)" />

                    {/* Central Glow under origin */}
                    <circle cx="360" cy="150" r="70" fill="url(#halo-glow)" />

                    {/* Dynamically position deals in an elliptical arc around the origin */}
                    {(() => {
                      if (filteredDeals.length === 0) return null;
                      const originX = 360, originY = 150;
                      const xRadius = 220, yRadius = 95;
                      // Spread angles from -150° to 150° (full arc, clockwise)
                      const toRad = d => d * Math.PI / 180;
                      const startAngle = toRad(-150);
                      const endAngle   = toRad(150);
                      const step = filteredDeals.length > 1 ? (endAngle - startAngle) / (filteredDeals.length - 1) : 0;
                      const bestSavings = Math.max(...filteredDeals.map(d => d.savingsPercent));

                      const mapNodes = filteredDeals.map((deal, i) => {
                        const angle = startAngle + i * step;
                        const x = Math.round(originX + xRadius * Math.cos(angle));
                        const y = Math.round(originY + yRadius * Math.sin(angle));
                        const ctrlX = Math.round(originX + xRadius * 0.5 * Math.cos(angle));
                        const ctrlY = Math.round(originY + yRadius * 0.5 * Math.sin(angle));
                        return {
                          code: deal.destinationAirport,
                          x, y, cx: ctrlX, cy: ctrlY,
                          price: `$${deal.dealPrice}`,
                          deal,
                          isBest: deal.savingsPercent === bestSavings,
                          inBudget: deal.dealPrice * passengers <= profile.familyProfile.budget,
                        };
                      });

                      return (
                        <>
                          {/* Bezier curve paths */}
                          {mapNodes.map(node => {
                            const isActive = node.inBudget && (hoveredAirport === node.code || (!hoveredAirport && node.isBest));
                            return (
                              <g key={`path-${node.deal.id}`} opacity={node.inBudget ? 1 : 0.15}>
                                {isActive && (
                                  <path d={`M ${originX} ${originY} Q ${node.cx} ${node.cy} ${node.x} ${node.y}`}
                                    fill="none" stroke={node.isBest ? '#fbbf24' : '#6366f1'}
                                    strokeWidth="4" opacity="0.15" className="transition-all duration-300" />
                                )}
                                <path d={`M ${originX} ${originY} Q ${node.cx} ${node.cy} ${node.x} ${node.y}`}
                                  fill="none"
                                  stroke={isActive ? (node.isBest ? '#fbbf24' : '#818cf8') : 'rgba(99,102,241,0.15)'}
                                  strokeWidth={isActive ? '2' : '1.2'}
                                  strokeDasharray={isActive ? 'none' : '3 4'}
                                  className="transition-all duration-300" />
                              </g>
                            );
                          })}

                          {/* Central Origin Node */}
                          <g>
                            <circle cx={originX} cy={originY} r="16" fill="rgba(255,255,255,0.05)" />
                            <circle cx={originX} cy={originY} r="6" fill="#080a0f" stroke="white" strokeWidth="2" />
                            <text x={originX} y={originY - 18} fill="white" fontSize="10" fontWeight="800" textAnchor="middle" fontFamily="Outfit">
                              {profile.airports[0]?.code || 'ATL'}
                            </text>
                          </g>

                          {/* Destination Nodes */}
                          {mapNodes.map(node => {
                            const isActive = node.inBudget && (hoveredAirport === node.code || (!hoveredAirport && node.isBest));
                            const displayColor = node.isBest ? '#fbbf24' : '#6366f1';
                            return (
                              <g key={`node-${node.deal.id}`}
                                onMouseEnter={() => node.inBudget && setHoveredAirport(node.code)}
                                onMouseLeave={() => node.inBudget && setHoveredAirport(null)}
                                onClick={() => { if (node.inBudget) setSelectedDeal(node.deal); }}
                                className={node.inBudget ? 'cursor-pointer' : 'cursor-not-allowed'}
                                opacity={node.inBudget ? 1 : 0.25}
                              >
                                {isActive && <circle cx={node.x} cy={node.y} r="16" fill={node.isBest ? 'url(#yellow-glow)' : 'rgba(99,102,241,0.15)'} />}
                                {isActive && <circle cx={node.x} cy={node.y} r="12" fill="none" stroke={displayColor} strokeWidth="1.5" opacity="0.6" className="animate-ping" />}
                                <circle cx={node.x} cy={node.y}
                                  r={isActive ? '5' : '4'}
                                  fill={isActive ? displayColor : '#161b26'}
                                  stroke={isActive ? 'white' : 'rgba(148,163,184,0.4)'}
                                  strokeWidth="1.5" className="transition-all duration-300" />
                                <text x={node.x} y={node.y - 12} fill="#64748b" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Inter">{node.code}</text>
                                <text x={node.x} y={node.y + 18} fill={isActive ? displayColor : '#94a3b8'} fontSize="10" fontWeight="800" textAnchor="middle" fontFamily="Outfit">{node.price}</text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}

                    {/* Empty map state */}
                    {filteredDeals.length === 0 && (
                      <text x="360" y="158" fill="rgba(148,163,184,0.25)" fontSize="13"
                        fontWeight="600" textAnchor="middle" fontFamily="Inter">
                        {scanning ? 'Scanning routes…' : 'No routes — run a scan to populate the map'}
                      </text>
                    )}
                  </svg>
                </div>
              </div>

            </div>

            {/* Redesigned Bottom Row: LIVE DEALS HORIZONTAL LIST */}
            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4.5 h-4.5 text-[#5f5af6] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-white text-base font-extrabold font-heading tracking-tight">
                    Live deals
                  </span>
                  
                  {/* Date Pickers */}
                  <div className="hidden sm:flex items-center gap-2 ml-4">
                    <input 
                      type="date" 
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="bg-[#121620] border border-[#1b1f2e] text-xs text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500/50 w-28"
                      title="Earliest Departure"
                    />
                    <span className="text-slate-500 text-xs">to</span>
                    <input 
                      type="date" 
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="bg-[#121620] border border-[#1b1f2e] text-xs text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500/50 w-28"
                      title="Latest Return"
                    />
                    {(filterStartDate || filterEndDate) && (
                      <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[10px] text-slate-400 hover:text-white ml-1">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setIsGridView(!isGridView)}
                  className="text-xs font-semibold text-[#5f5af6] hover:text-[#7f7bf8] transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none"
                >
                  {isGridView ? 'View as carousel' : 'Browse all'} <span className="text-sm">➔</span>
                </button>
              </div>

              {filteredDeals.length === 0 ? (
                <div className="glass-card p-12 text-center space-y-4 w-full">
                  {scanning ? (
                    <>
                      <div className="text-4xl animate-pulse">🔄</div>
                      <h3 className="text-xl font-bold font-heading text-white">Scanning for Deals…</h3>
                      <p className="text-slate-400 max-w-sm mx-auto">The agent is searching for fare drops from {profile.airports.map(a => a.code).join(', ')}. This takes a few seconds.</p>
                    </>
                  ) : lastScanDealsFound === null ? (
                    <>
                      <div className="text-4xl">🛫</div>
                      <h3 className="text-xl font-bold font-heading text-white">No Scan Run Yet</h3>
                      <p className="text-slate-400 max-w-sm mx-auto">Hit the scan button to search for live fare drops from your departure airports.</p>
                      <button onClick={triggerScan} className="btn btn-primary px-6 py-2 text-sm mx-auto">
                        🔎 Scan Now
                      </button>
                    </>
                  ) : lastScanDealsFound === 0 ? (
                    <>
                      <div className="text-4xl">📭</div>
                      <h3 className="text-xl font-bold font-heading text-white">No Deals Found</h3>
                      <p className="text-slate-400 max-w-sm mx-auto">
                        The last scan returned no deals from {profile.airports.map(a => a.code).join(', ')}. Try switching scan engines in Settings, adding more departure airports, or scanning again later.
                      </p>
                      <div className="flex gap-3 justify-center pt-2">
                        <button onClick={triggerScan} className="btn btn-primary px-5 py-2 text-xs">
                          🔄 Scan Again
                        </button>
                        <button onClick={() => setActiveTab('settings')} className="btn btn-secondary px-5 py-2 text-xs">
                          ⚙️ Change Engine
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl">💰</div>
                      <h3 className="text-xl font-bold font-heading text-white">All Deals Above Budget</h3>
                      <p className="text-slate-400 max-w-sm mx-auto">
                        {lastScanDealsFound} deal{lastScanDealsFound !== 1 ? 's' : ''} found but all are above your ${profile.familyProfile.budget.toLocaleString()} family budget. Raise your budget in Settings to see them.
                      </p>
                      <button onClick={() => setActiveTab('settings')} className="btn btn-secondary px-5 py-2 text-xs mx-auto">
                        ⚙️ Adjust Budget
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className={`pt-1 pb-4 ${isGridView ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4' : 'flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory'}`}>
                  {filteredDeals.map(deal => {
                    const isSJU = deal.destinationAirport === 'SJU';
                    const isMDE = deal.destinationAirport === 'MDE';
                    const isNAS = deal.destinationAirport === 'NAS';
                    const isNew = isSJU || isMDE || isNAS;
                    
                    return (
                      <div
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal)}
                        onMouseEnter={() => setHoveredAirport(deal.destinationAirport)}
                        onMouseLeave={() => setHoveredAirport(null)}
                        className={`bg-[#0e111a] border border-[#1b1f2e] rounded-2xl p-5 w-[205px] shrink-0 snap-start cursor-pointer transition-all flex flex-col justify-between h-48 relative ${
                          hoveredAirport === deal.destinationAirport || (!hoveredAirport && deal.destinationAirport === 'SJU')
                            ? 'border-indigo-500/40 shadow-[0_8px_32px_rgba(99,102,241,0.08)] scale-[1.02]' 
                            : ''
                        }`}
                      >
                        {/* Top Row: Code and Badge */}
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider">
                            {deal.destinationAirport}
                          </span>
                          {deal.relevanceScore > 75 ? (
                            <div className="group relative z-30">
                              <span className="text-[8px] uppercase font-bold tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help shadow-sm">
                                ✨ {deal.relevanceScore}% MATCH
                              </span>
                              {deal.relevanceReasons && deal.relevanceReasons.length > 0 && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-[#141824] border border-[#2d3348] text-slate-300 text-[11px] p-3 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none text-left">
                                  <div className="font-bold text-white mb-2 text-[12px] border-b border-[#2d3348] pb-1.5 flex items-center gap-1.5">
                                    <span>🎯</span> Why this deal is perfect:
                                  </div>
                                  <div className="flex flex-col gap-1.5 pt-1">
                                    {deal.relevanceReasons.map((r, idx) => (
                                      <div key={idx} className="flex items-start gap-1.5">
                                        <span className="text-amber-400/80 text-[10px] mt-0.5">✦</span>
                                        <span className="leading-snug">{r}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : isNew ? (
                            <span className="text-[8px] uppercase font-bold tracking-wider text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded">
                              NEW
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">
                              {deal.savingsPercent}%
                            </span>
                          )}
                        </div>

                        {/* Middle Row: Destination */}
                        <div className="mt-3">
                          <h4 className="text-white text-sm font-extrabold font-heading line-clamp-1">
                            {deal.destination.split(',')[0]}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium leading-none mt-1">
                            {deal.destination.split(',')[1]?.trim() || ''}
                          </p>
                        </div>

                        {/* Bottom Row: Price and Dates/Expires */}
                        <div className="mt-auto pt-4">
                          <div className="text-2xl font-black font-heading text-white">${deal.dealPrice}</div>
                          {isSJU ? (
                            <div className="text-[9px] text-amber-500 font-bold mt-1">Expires in 48h</div>
                          ) : (
                            <div className="text-[9px] text-slate-500 mt-1">
                              {formatDateRange(deal.outboundDate, deal.returnDate)}
                            </div>
                          )}
                          {/* Verification badge */}
                          {deal.verified === true ? (
                            <div className="text-[8px] text-emerald-500 font-bold mt-1.5 flex items-center gap-0.5">
                              ✓ Live Verified
                            </div>
                          ) : deal.engine === 'demo' ? (
                            <div className="text-[8px] text-slate-600 font-semibold mt-1.5">
                              Demo price
                            </div>
                          ) : (
                            <div className="text-[8px] text-amber-500 font-semibold mt-1.5">
                              ⚠ Unverified
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
          </section>
        )}

        {/* TAB: WISHLIST */}
        {activeTab === 'wishlist' && (
          <section className="animate-in fade-in duration-300 max-w-3xl mx-auto space-y-6">
            <div className="glass-card p-6 border-indigo-500/10">
              <h2 className="text-xl font-extrabold font-heading text-white flex items-center gap-2 mb-4">
                ⭐ Destination Wishlist
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Add bucket-list destinations here. We'll send you an immediate email alert if a deal drops for these locations. You can optionally restrict alerts to a specific month range.
              </p>

              <div className="flex flex-col md:flex-row gap-3 mb-8 bg-slate-800/20 p-4 rounded-xl border border-slate-700/50">
                <input
                  type="text"
                  placeholder="Destination (e.g. Tokyo, France, HND)"
                  value={newWishDest}
                  onChange={e => setNewWishDest(e.target.value)}
                  className="form-control flex-1"
                />
                <select
                  value={newWishStart}
                  onChange={e => setNewWishStart(e.target.value)}
                  className="form-control w-full md:w-32"
                >
                  <option value="">Start Mth</option>
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>)}
                </select>
                <select
                  value={newWishEnd}
                  onChange={e => setNewWishEnd(e.target.value)}
                  className="form-control w-full md:w-32"
                >
                  <option value="">End Mth</option>
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>)}
                </select>
                <button 
                  onClick={handleAddWishlist}
                  disabled={!newWishDest.trim()}
                  className="btn btn-primary whitespace-nowrap"
                >
                  Add Alert
                </button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Active Alerts ({(profile.wishlist || []).length})</h3>
                {!(profile.wishlist?.length) ? (
                  <div className="text-center py-8 text-slate-500 text-sm italic">
                    No wishlist alerts configured yet.
                  </div>
                ) : (
                  (profile.wishlist || []).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-700/30">
                      <div>
                        <div className="font-bold text-slate-200">{item.destination}</div>
                        {(item.startMonth || item.endMonth) && (
                          <div className="text-xs text-indigo-400 mt-1">
                            📅 {item.startMonth ? new Date(0, item.startMonth - 1).toLocaleString('default', { month: 'long' }) : 'Any'} 
                            {' '}to{' '} 
                            {item.endMonth ? new Date(0, item.endMonth - 1).toLocaleString('default', { month: 'long' }) : 'Any'}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleRemoveWishlist(idx)} className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-400/10 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB: SETTINGS & WALLET */}
        {activeTab === 'settings' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
            {/* Left Column: Credit Card Wallet (2 cols wide) */}
            <div className="lg:col-span-2 space-y-6">

              {/* ── SYNCED REWARDS & LOYALTIES PANEL ─────────────────────── */}
              <div className="glass-card p-5 space-y-4 border-indigo-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold font-heading text-white flex items-center gap-2">
                      🪙 My Synced Rewards &amp; Loyalties
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Connect your accounts to auto-pull live point balances for deal calculations.
                    </p>
                  </div>
                  {(walletStatus.plaid?.simulatorMode || walletStatus.awardwallet?.simulatorMode) && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-950/40 border border-amber-700/40 text-amber-400">
                      Simulator Active
                    </span>
                  )}
                </div>

                {walletError && (
                  <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-800/30 rounded px-3 py-2">
                    {walletError}
                  </div>
                )}

                {/* Capital One Venture X — Plaid */}
                <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all ${
                  walletStatus.plaid?.connected
                    ? 'border-emerald-700/40 bg-emerald-950/10'
                    : 'border-slate-700/40 bg-slate-900/30'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${
                      walletStatus.plaid?.connected ? 'bg-emerald-900/40' : 'bg-slate-800/60'
                    }`}>
                      💳
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white font-heading truncate">Capital One Venture X</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {walletStatus.plaid?.connected
                          ? `Linked via ${walletStatus.plaid.institution || 'Capital One'}`
                          : 'Capital One Miles · Plaid Sync'}
                      </div>
                      {plaidBalances.length > 0 && (
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-lg font-extrabold text-emerald-400 font-heading">
                            {plaidBalances[0].balance.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">{plaidBalances[0].balanceLabel}</span>
                          <span className="text-[9px] text-slate-500 ml-1">
                            ≈ ${Math.round(plaidBalances[0].balance * 0.018).toLocaleString()} value
                          </span>
                        </div>
                      )}
                      {plaidBalances[0]?.lastSyncedAt && (
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          Synced {formatSyncedAgo(plaidBalances[0].lastSyncedAt)}
                          {plaidBalances[0].stale && <span className="text-amber-500 ml-1">(stale)</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {walletStatus.plaid?.connected ? (
                      <>
                        <button
                          onClick={fetchPlaidBalances}
                          disabled={syncingPlaid}
                          className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-50"
                        >
                          {syncingPlaid ? '⟳' : '🔄 Sync'}
                        </button>
                        <button
                          onClick={disconnectPlaidAccount}
                          disabled={syncingPlaid}
                          className="px-2.5 py-1 rounded text-[10px] font-bold text-rose-400 hover:text-rose-300 border border-rose-900/40 hover:border-rose-800 transition-all disabled:opacity-50"
                        >
                          Unlink
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={openPlaidLink}
                        disabled={syncingPlaid}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-50 shadow-sm"
                      >
                        {syncingPlaid ? 'Connecting…' : '＋ Connect'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Delta SkyMiles — AwardWallet (family accounts) */}
                <div className={`rounded-xl border transition-all ${
                  walletStatus.awardwallet?.connected
                    ? 'border-emerald-700/40 bg-emerald-950/10'
                    : 'border-slate-700/40 bg-slate-900/30'
                }`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${
                        walletStatus.awardwallet?.connected ? 'bg-emerald-900/40' : 'bg-slate-800/60'
                      }`}>
                        ✈️
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white font-heading">Delta SkyMiles</div>
                        <div className="text-[10px] text-slate-400">
                          {walletStatus.awardwallet?.connected
                            ? `${awBalances.length} account${awBalances.length !== 1 ? 's' : ''} synced via AwardWallet`
                            : 'Delta Air Lines · AwardWallet Sync'}
                        </div>
                        {awBalances.length > 0 && (
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-lg font-extrabold text-emerald-400 font-heading">
                              {awBalances.reduce((s, b) => s + b.balance, 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400">miles combined</span>
                            <span className="text-[9px] text-slate-500 ml-1">
                              ≈ ${Math.round(awBalances.reduce((s, b) => s + b.balance, 0) * 0.012).toLocaleString()} value
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {walletStatus.awardwallet?.connected ? (
                        <>
                          <button
                            onClick={fetchAwBalances}
                            disabled={syncingAW}
                            className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-50"
                          >
                            {syncingAW ? '⟳' : '🔄 Sync'}
                          </button>
                          <button
                            onClick={disconnectAwAccount}
                            disabled={syncingAW}
                            className="px-2.5 py-1 rounded text-[10px] font-bold text-rose-400 hover:text-rose-300 border border-rose-900/40 hover:border-rose-800 transition-all disabled:opacity-50"
                          >
                            Unlink
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setShowAwModal(true)}
                          disabled={syncingAW}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-50 shadow-sm"
                        >
                          {syncingAW ? 'Connecting…' : '＋ Connect'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-member account breakdown */}
                  {awBalances.length > 0 && (
                    <div className="border-t border-slate-800/60 px-4 pb-3 pt-2 grid grid-cols-2 gap-2">
                      {awBalances.map((acct) => (
                        <div key={acct.account_id} className="bg-slate-900/60 rounded-lg px-3 py-2">
                          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">
                            {acct.member_label || acct.program_name}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-extrabold text-white font-heading">
                              {acct.balance.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400">miles</span>
                          </div>
                          <div className="text-[9px] text-emerald-500 mt-0.5">
                            ≈ ${Math.round(acct.balance * 0.012).toLocaleString()} value
                          </div>
                          {acct.tier && (
                            <div className="text-[9px] text-indigo-400 mt-0.5">{acct.tier}</div>
                          )}
                          <div className="text-[9px] text-slate-600 mt-0.5">{acct.account_number}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Combined value summary bar */}
                {(plaidBalances.length > 0 || awBalances.length > 0) && (
                  <div className="flex gap-3 pt-1">
                    <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-lg px-3 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Total Card Miles</div>
                      <div className="text-sm font-extrabold text-white font-heading mt-0.5">
                        {plaidBalances.reduce((s, b) => s + b.balance, 0).toLocaleString()}
                      </div>
                      <div className="text-[9px] text-slate-500">Capital One Miles</div>
                    </div>
                    <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-lg px-3 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Family Delta Miles</div>
                      <div className="text-sm font-extrabold text-white font-heading mt-0.5">
                        {awBalances.reduce((s, b) => s + b.balance, 0).toLocaleString()}
                      </div>
                      <div className="text-[9px] text-slate-500">{awBalances.length} account{awBalances.length !== 1 ? 's' : ''} combined</div>
                    </div>
                    <div className="flex-1 bg-indigo-950/30 border border-indigo-800/30 rounded-lg px-3 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-indigo-400 font-bold">Est. Total Value</div>
                      <div className="text-sm font-extrabold text-indigo-300 font-heading mt-0.5">
                        ${(
                          plaidBalances.reduce((s, b) => s + b.balance * 0.018, 0) +
                          awBalances.reduce((s, b) => s + b.balance * 0.012, 0)
                        ).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[9px] text-indigo-500">at standard valuations</div>
                    </div>
                  </div>
                )}
              </div>
              {/* ── END SYNCED REWARDS PANEL ──────────────────────────────── */}

              {/* Plaid Link Modal — simulator overlay */}
              {showPlaidModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                    <div className="bg-indigo-600 px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">🔒 Connect with Plaid</span>
                      </div>
                      <button onClick={() => setShowPlaidModal(false)} className="text-indigo-200 hover:text-white text-lg">×</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-center">
                        <div className="text-2xl mb-2">🏦</div>
                        <p className="text-sm font-bold text-white">Capital One</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Securely link your Capital One Venture X to sync your miles balance.
                          Your credentials are never shared with AeroFamily.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Username"
                          className="form-control text-xs w-full"
                          autoComplete="off"
                          readOnly
                          value="••••••••••"
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          className="form-control text-xs w-full"
                          autoComplete="off"
                          readOnly
                          value="••••••••"
                        />
                      </div>
                      <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg px-3 py-2 text-[10px] text-amber-400">
                        ⚡ Simulator Mode — click Connect to activate mock sync with 75,000 Capital One Miles.
                      </div>
                      <button
                        onClick={confirmPlaidConnect}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-all"
                      >
                        Connect Capital One
                      </button>
                      <p className="text-[9px] text-slate-500 text-center">
                        Bank-level 256-bit AES encryption · Zero credential storage
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* AwardWallet Modal */}
              {showAwModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                    <div className="bg-red-700 px-5 py-4 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">✈️ Connect with AwardWallet</span>
                      <button onClick={() => setShowAwModal(false)} className="text-red-200 hover:text-white text-lg">×</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-center">
                        <div className="text-2xl mb-2">🔴</div>
                        <p className="text-sm font-bold text-white">Delta SkyMiles</p>
                        <p className="text-xs text-slate-400 mt-1">
                          AwardWallet securely tracks your Delta loyalty balance.
                          Your SkyMiles number is stored in AwardWallet's encrypted vault.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Delta SkyMiles Number"
                          className="form-control text-xs w-full"
                          readOnly
                          value="••••••••7823"
                        />
                        <input
                          type="password"
                          placeholder="SkyMiles PIN"
                          className="form-control text-xs w-full"
                          readOnly
                          value="••••"
                        />
                      </div>
                      <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg px-3 py-2 text-[10px] text-amber-400">
                        ⚡ Simulator Mode — syncs your account (182,490 miles) + spouse's account (124,000 miles).
                      </div>
                      <button
                        onClick={confirmAwConnect}
                        className="w-full py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold transition-all"
                      >
                        Connect Delta SkyMiles
                      </button>
                      <p className="text-[9px] text-slate-500 text-center">
                        Powered by AwardWallet · Credentials encrypted at rest
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-xl font-extrabold font-heading text-white">💳 My Travel Credit Card Wallet</h2>
                <p className="text-xs text-slate-400 mt-1">Select the credit cards you own to automatically calculate reward points and select optimal payment strategies for flight deals.</p>
              </div>

              <div className="space-y-3">
                {Object.keys(PREMIUM_CARDS).map(cardName => {
                  const card = PREMIUM_CARDS[cardName];
                  const owned = profile.creditCards.includes(cardName);
                  
                  return (
                    <div 
                      key={cardName} 
                      onClick={() => toggleCreditCard(cardName)}
                      className={`glass-card p-4 flex items-center justify-between cursor-pointer border-l-4 transition-all ${
                        owned 
                          ? 'border-l-indigo-500 bg-indigo-950/10 border-indigo-500/20' 
                          : 'border-l-transparent hover:bg-slate-800/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                          owned ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-600'
                        }`}>
                          {owned && '✓'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold font-heading text-white">{card.name}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">{card.idealFor}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-indigo-300">{card.multiplier}x Points</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">Valued at {(card.valuation * 100).toFixed(1)}¢ each</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Collapsible Developer accordion */}
              <details className="group glass-card p-1 border-slate-800/80 shadow-2xl">
                <summary className="flex justify-between items-center p-4 font-heading font-bold text-sm text-slate-300 cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span>💻</span>
                    <span>Developer Logs & Agent Terminal</span>
                  </div>
                  <span className="text-xs text-indigo-400 font-semibold group-open:hidden">Show Logs ➔</span>
                  <span className="text-xs text-indigo-400 font-semibold hidden group-open:inline">Hide Logs ✕</span>
                </summary>
                
                <div className="p-4 pt-0 space-y-4">
                  <div className="flex flex-col h-[350px] bg-slate-950 rounded-xl overflow-hidden border border-slate-900">
                    {/* Console Header */}
                    <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-900 flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                        <span className="text-[10px] text-slate-500 font-mono ml-2">flight_agent_daemon.sh</span>
                      </div>
                      <button 
                        onClick={triggerScan}
                        disabled={scanning}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold font-mono disabled:opacity-50"
                      >
                        {scanning ? 'RUNNING...' : 'DEPLOY AGENT'}
                      </button>
                    </div>

                    {/* Console Terminal Screen */}
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-[11px] overflow-y-auto text-emerald-400 space-y-1.5">
                      {scanConsoleLogs.length === 0 ? (
                        <div className="text-slate-500 text-center pt-24">
                          <p>&gt; Agent Terminal Ready.</p>
                          <p className="mt-2 text-[10px]">Hit "DEPLOY AGENT" above to see the logs, triggers, routing, and calculations in real time.</p>
                        </div>
                      ) : (
                        scanConsoleLogs.map((logLine, idx) => {
                          let color = 'text-emerald-400';
                          if (logLine.includes('[System Error]')) color = 'text-rose-400';
                          else if (logLine.includes('[System]')) color = 'text-indigo-400';
                          else if (logLine.includes('Warning:')) color = 'text-amber-400';
                          
                          return (
                            <div key={idx} className={color}>
                              &gt; {logLine}
                            </div>
                          );
                        })
                      )}
                      <div ref={terminalEndRef}></div>
                    </div>
                  </div>

                  {/* Database logs history */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">⏱️ Scan Execution History (data/logs.json)</h4>
                    {logs.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic">No past scans logged yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {logs.slice(0, 5).map((logItem, idx) => (
                          <div key={idx} className="bg-slate-950/60 border border-slate-900/60 p-2.5 rounded-lg flex justify-between items-center text-[11px]">
                            <div>
                              <span className="font-bold text-slate-300">🔍 {logItem.message}</span>
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                Engine: {logItem.engine.toUpperCase()} • Time: {new Date(logItem.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                            <span className={`badge text-[8px] px-1.5 py-0 ${
                              logItem.status === 'success' ? 'badge-success' : logItem.status === 'warning' ? 'badge-warning' : 'bg-rose-950/20 border-rose-800 text-rose-400 border'
                            }`}>
                              {logItem.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>

            {/* Right Column: Agent Settings & Airport Origins (1 col wide) */}
            <div className="space-y-6">
              <div className="glass-card p-5 space-y-5">
                <h3 className="text-lg font-bold font-heading text-white border-b border-slate-800 pb-2">🤖 Agent Setup</h3>
                
                {/* Select Flight Scanner Engine */}
                <div className="form-group">
                  <label className="form-label">⚙️ Active Scan Engine</label>
                  <select 
                    value={profile.activeEngine} 
                    onChange={(e) => saveProfile({ ...profile, activeEngine: e.target.value })}
                    className="form-control text-xs"
                  >
                    <option value="demo">Demo Mode (Fidelity Mock, No Keys)</option>
                    <option value="kiwi">Kiwi.com Tequila API (Real Anywhere Search)</option>
                    <option value="gemini">Gemini Web Grounding (Live AI Search)</option>
                    <option value="travelpayouts">Travelpayouts API (Real Global Cache)</option>
                  </select>
                  <p className="text-[9px] text-slate-500 mt-1.5 leading-normal">
                    {profile.activeEngine === 'demo' && "• Safely works immediately. Simulates drops with rich, seasonal route mock engines."}
                    {profile.activeEngine === 'kiwi' && "• Connects to Kiwi's powerful Tequila engine to find the cheapest active flights from your origin to anywhere in the world. Requires KIWI_API_KEY."}
                    {profile.activeEngine === 'gemini' && "• Searches the live web using Gemini 2.5 Flash Google Search integration. Requires GEMINI_API_KEY."}
                    {profile.activeEngine === 'travelpayouts' && "• Directly pulls cached airline ticket prices queried by global users. Requires TRAVELPAYOUTS_TOKEN."}
                  </p>
                </div>

                {/* Configured Departure Airports */}
                <div className="form-group border-t border-slate-900 pt-4">
                  <label className="form-label">🛫 My Departure Origins</label>
                  <div className="flex gap-2 mt-1">
                    <input 
                      type="text" 
                      maxLength="3"
                      placeholder="e.g. JFK" 
                      value={newAirportCode}
                      onChange={(e) => setNewAirportCode(e.target.value)}
                      className="form-control text-xs flex-1 uppercase"
                    />
                    <button onClick={addAirport} className="btn btn-secondary px-3 py-1 text-xs min-h-[36px]">Add</button>
                  </div>

                  <div className="space-y-1.5 mt-3">
                    {profile.airports.map(airport => (
                      <div key={airport.code} className="flex justify-between items-center bg-slate-950/60 border border-slate-900 rounded px-2.5 py-1.5 text-xs">
                        <div>
                          <span className="font-bold text-indigo-300 font-mono">{airport.code}</span>
                          <span className="text-slate-400 ml-2 text-[10px]">{airport.name}</span>
                        </div>
                        <button 
                          onClick={() => removeAirport(airport.code)}
                          className="text-rose-400 hover:text-rose-500 font-bold px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scheduled background daemon parameters */}
                <div className="border-t border-slate-900 pt-4 text-xs text-slate-500 space-y-1.5">
                  <div className="font-bold text-[9px] uppercase text-indigo-400 tracking-wider">📅 Background Daemon Schedule</div>
                  <div>• Frequency: Twice daily (every 12 hours)</div>
                  <div>• Next scan: Automatic background interval armed</div>
                </div>
              </div>

              {/* WhatsApp Alerts Setup Card */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-lg font-bold font-heading text-white border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">📲 WhatsApp Alerts</span>
                  {profile.whatsapp?.verified && (
                    <span className="badge badge-success text-[8px] tracking-widest font-extrabold px-2 py-0.5 animate-pulse">ACTIVE</span>
                  )}
                </h3>
                
                <p className="text-xs text-slate-400 leading-relaxed pretty-paragraph">
                  Get real-time deal alerts and mistake fares sent directly to your phone when prices drop below your family budget limits.
                </p>

                <div className="space-y-3 pt-1">
                  <div className="form-group">
                    <label className="form-label">📞 WhatsApp Phone Number</label>
                    <div className="flex gap-2">
                      <select className="form-control text-xs w-[85px] px-1 bg-slate-900 border-slate-800 text-slate-200">
                        <option value="1">+1 (US)</option>
                        <option value="44">+44 (UK)</option>
                        <option value="57">+57 (CO)</option>
                        <option value="81">+81 (JP)</option>
                      </select>
                      <input 
                        type="tel" 
                        placeholder="(555) 000-0000" 
                        value={waPhoneNumber}
                        onChange={(e) => setWaPhoneNumber(e.target.value)}
                        className="form-control text-xs flex-1 bg-slate-900 border-slate-800 text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 py-1 select-none">
                    <input 
                      type="checkbox" 
                      id="wa_opt_alerts"
                      checked={waOptInAlerts}
                      onChange={(e) => setWaOptInAlerts(e.target.checked)}
                      className="w-4 h-4 accent-[#5f5af6] cursor-pointer"
                    />
                    <label htmlFor="wa_opt_alerts" className="text-xs text-slate-300 font-medium cursor-pointer">
                      Enable real-time alert notifications
                    </label>
                  </div>

                  <button 
                    onClick={registerWhatsApp}
                    disabled={waRegistering || !waPhoneNumber}
                    className="btn btn-primary w-full text-xs py-2 shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5"
                  >
                    {waRegistering ? (
                      <>
                        <span className="animate-spin text-xs">🔄</span>
                        <span>SAVING ALERTS...</span>
                      </>
                    ) : profile.whatsapp?.verified ? (
                      '⚡ UPDATE PHONE SETTINGS'
                    ) : (
                      '🔔 ACTIVATE INSTANT ALERTS'
                    )}
                  </button>

                  {waSuccessMsg && (
                    <div className="text-[11px] text-emerald-400 font-bold text-center mt-2 animate-bounce">
                      {waSuccessMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: TRIP PLANNER (ITINERARY) */}
        {activeTab === 'itinerary' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Itinerary Filter config */}
            <div className="space-y-6">
              <div className="glass-card p-5 space-y-5">
                <h3 className="text-lg font-bold font-heading text-white border-b border-slate-800 pb-2">👨‍👩‍👧‍👦 Family Profile Settings</h3>
                <p className="text-xs text-slate-400">Tweak these settings. They are sent directly to the Gemini Agent to personalize generated travel itineraries!</p>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="form-group">
                      <label className="form-label">👨 Adults</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={profile.familyProfile.adults} 
                        onChange={(e) => updateFamilyDetails('adults', parseInt(e.target.value) || 1)}
                        className="form-control"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">👶 Kids</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={profile.familyProfile.kids} 
                        onChange={(e) => updateFamilyDetails('kids', parseInt(e.target.value) || 0)}
                        className="form-control"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="form-group">
                      <label className="form-label">🛂 Passport Nationality</label>
                      <select
                        value={profile.passportCountry || 'India'}
                        onChange={(e) => setProfile({ ...profile, passportCountry: e.target.value })}
                        className="form-control text-xs"
                      >
                        <option value="India">India</option>
                        <option value="China">China</option>
                        <option value="USA">United States</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">📄 US Immigration Status</label>
                      <select
                        value={profile.usStatus || 'Valid US Visa (B1/B2/H1/H4)'}
                        onChange={(e) => setProfile({ ...profile, usStatus: e.target.value })}
                        className="form-control text-xs"
                      >
                        <option value="US Citizen">US Citizen</option>
                        <option value="US Green Card">US Green Card</option>
                        <option value="Advance Parole (I-512L)">Advance Parole (I-512L)</option>
                        <option value="Valid US Visa (B1/B2/H1/H4)">Valid US Visa (B1/B2/H1/H4)</option>
                        <option value="Expired US Visa / No Visa">Expired US Visa / No Visa</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <span>💰 Total Trip Budget</span>
                      <span className="text-indigo-400">${profile.familyProfile.budget}</span>
                    </label>
                    <input 
                      type="range" 
                      min="1000" 
                      max="10000" 
                      step="500"
                      value={profile.familyProfile.budget} 
                      onChange={(e) => updateFamilyDetails('budget', parseInt(e.target.value) || 1000)}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">🎯 Interests & Styles</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {["Beach", "Theme Parks", "Cultural", "Kid-Friendly", "Museums", "Adventure", "Nature", "Luxury", "Shopping"].map(interest => {
                        const checked = profile.familyProfile.interests?.includes(interest);
                        return (
                          <button
                            key={interest}
                            onClick={() => handleInterestToggle(interest)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                              checked 
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {interest}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Itinerary Display */}
            <div className="lg:col-span-2">
              {researchingDest ? (
                <div className="glass-card p-16 text-center space-y-6 flex flex-col items-center justify-center min-h-[400px]">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-heading text-white">Scouting & Organizing Trip...</h3>
                    <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">Our travel agent is currently researching hotels, safety ratings, transport routes, packing lists, and day pacing for **{researchingDest}**...</p>
                  </div>
                </div>
              ) : activeItinerary ? (
                <div className="glass-card p-6 md:p-8 space-y-6 border-indigo-500/10 shadow-indigo-950/20 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">📍 Active Custom Itinerary</div>
                    <button 
                      onClick={() => window.print()} 
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700"
                    >
                      🖨️ Export PDF
                    </button>
                  </div>
                  <MarkdownRenderer markdown={activeItinerary.content} />
                </div>
              ) : (
                <div className="glass-card p-12 text-center space-y-4 min-h-[300px] flex flex-col items-center justify-center">
                  <div className="text-4xl">🗺️</div>
                  <h3 className="text-xl font-bold font-heading">No Travel Plan Selected</h3>
                  <p className="text-slate-400 max-w-md mx-auto">Select a flight deal in the **Flight Deals** tab and click **Research Trip**! Our Agent will instantly generate a 5-day customized travel itinerary optimized for your family details.</p>
                </div>
              )}
            </div>
          </section>
        )}



      </main>

      {/* DETAILED DEAL MODAL */}
      {selectedDeal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-[#0b0d13] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#0c0f16]/95 border-b border-slate-900 px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest">
                  DEAL RADAR ANALYSIS
                </span>
                <h3 className="text-white text-xl font-extrabold font-heading mt-1 leading-tight flex items-center gap-2">
                  {selectedDeal.destination}
                  {(profile.wishlist || []).some(w => selectedDeal.destination.toLowerCase().includes(w.destination.toLowerCase())) && (
                    <span className="text-xs bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border border-yellow-400/30">
                      ⭐ Wishlist Match
                    </span>
                  )}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedDeal(null)}
                className="text-slate-400 hover:text-white transition-colors text-2xl font-bold bg-transparent border-none cursor-pointer px-2 outline-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Price & Savings Header */}
              {(() => {
                const passengers = profile.familyProfile.adults + profile.familyProfile.kids;
                const familyTotal = selectedDeal.dealPrice * passengers;
                return (
                  <div className="bg-[#131722]/80 border border-slate-900/60 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-3xl font-black font-heading text-white">
                            ${selectedDeal.dealPrice}
                          </div>
                          <span className="text-xs text-slate-400 font-semibold">/ person</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">
                          Normally ~${selectedDeal.normalPrice} / person
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="badge badge-success text-xs px-3 py-1 font-bold">
                          {selectedDeal.savingsPercent}% OFF
                        </span>
                        <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mt-1.5 font-mono">
                          {selectedDeal.departureAirport} ➔ {selectedDeal.destinationAirport}
                        </div>
                      </div>
                    </div>
                    {/* Family total */}
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Family Total</div>
                        <div className="text-lg font-extrabold text-emerald-400 font-heading mt-0.5">
                          ${familyTotal.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {profile.familyProfile.adults} adult{profile.familyProfile.adults !== 1 ? 's' : ''}{profile.familyProfile.kids > 0 ? ` + ${profile.familyProfile.kids} kid${profile.familyProfile.kids !== 1 ? 's' : ''}` : ''} · {passengers} passengers
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Scanned At</div>
                        <div className="text-[10px] text-amber-400 mt-0.5 font-semibold">Deal price — may vary</div>
                        <div className="text-[9px] text-slate-600 mt-0.5">Google Flights shows live fares</div>
                      </div>
                    </div>
                    {/* Verification status strip */}
                    {selectedDeal.verified === true ? (
                      <div className="text-[9px] text-emerald-500 font-bold flex items-center gap-1 pt-1">
                        ✓ Live-verified price — confirmed via {selectedDeal.engine === 'kiwi' ? 'Kiwi Tequila API' : selectedDeal.engine === 'travelpayouts' ? 'Travelpayouts cache' : 'real-time search'}
                      </div>
                    ) : selectedDeal.engine === 'demo' ? (
                      <div className="text-[9px] text-slate-500 italic pt-1">
                        Demo / illustrative price — enable Kiwi or Travelpayouts engine for live verification
                      </div>
                    ) : (
                      <div className="text-[9px] text-amber-500 font-semibold flex items-center gap-1 pt-1">
                        ⚠ Price unverified — may differ from live fares
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                  AGENT SUMMARY
                </h4>
                <p className="text-slate-300 text-sm leading-relaxed pretty-paragraph">
                  {selectedDeal.description}
                </p>
                <div className="text-xs text-slate-500 mt-2 font-semibold">
                  ✈️ Operated by: <span className="text-slate-300">{selectedDeal.airlines}</span>
                </div>
              </div>

              {/* Travel Details */}
              <div className="grid grid-cols-2 gap-3 bg-[#0c0f16]/90 border border-slate-900/40 p-3 rounded-xl text-xs text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">OUTBOUND</span>
                  📅 {selectedDeal.outboundDate}
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider mb-0.5">RETURN</span>
                  📅 {selectedDeal.returnDate}
                </div>
              </div>

              {/* Long Layover Warning */}
              {selectedDeal.longLayoverWarning && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-400/90 leading-relaxed font-bold tracking-wide">
                  <span className="relative flex h-2.5 w-2.5 mt-0.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span>{selectedDeal.longLayoverWarning}</span>
                </div>
              )}

              {/* Delta Award Search */}
              {awBalances.length > 0 && (
                <DeltaAwardSearchPanel
                  deal={selectedDeal}
                  awBalances={awBalances}
                  backendUrl={BACKEND_URL}
                  authHeaders={authHeaders()}
                />
              )}

              {/* Card Wallet Recommender */}
              <div className="border-t border-slate-900 pt-4 space-y-3">
                <div className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest">
                  💳 CARD WALLET PAYMENT OPTIMIZATION
                </div>
                
                {(() => {
                  const benefits = calculateCardBenefits(selectedDeal.dealPrice);
                  if (benefits.length === 0) return (
                    <p className="text-xs text-slate-500 italic">
                      Add credit cards in the Card Wallet tab to calculate customized point rewards for this transaction.
                    </p>
                  );
                  
                  const winner = benefits[0];
                  const others = benefits.slice(1);
                  const familyCount = profile.familyProfile.adults + profile.familyProfile.kids;
                  const totalPurchase = selectedDeal.dealPrice * familyCount;

                  return (
                    <div className="space-y-4">
                      {/* WINNER CALLOUT */}
                      <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/80 border border-indigo-500/30 rounded-2xl p-4 shadow-lg shadow-indigo-900/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="flex justify-between items-start mb-3 relative z-10">
                          <div>
                            <div className="text-[10px] text-indigo-300 font-bold tracking-widest uppercase mb-1 flex items-center gap-1.5">
                              <span>🏆</span> Best Card to Use
                            </div>
                            <div className="text-sm font-extrabold text-white">{winner.cardName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 font-medium">Net Effective Cost</div>
                            <div className="text-lg font-black text-emerald-400 drop-shadow-sm">
                              ${winner.netEffectiveCost.toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-500 line-through">
                              ${totalPurchase.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between bg-black/40 rounded-lg p-2.5 border border-white/5 relative z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs">✨</div>
                            <div>
                              <div className="text-[10px] text-slate-300">Earn <span className="font-bold text-white">{winner.points.toLocaleString()} points</span></div>
                              <div className="text-[9px] text-slate-500">{winner.idealFor}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-emerald-400">~${winner.savings} Value</div>
                            <div className="text-[9px] text-slate-400 font-mono">{winner.returnRate.toFixed(1)}% back</div>
                          </div>
                        </div>
                      </div>

                      {/* OTHER CARDS COMPARISON */}
                      {others.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Other Options</div>
                          {others.map((benefit) => (
                            <div key={benefit.cardName} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                              <div className="truncate pr-4">
                                <div className="text-[11px] font-bold text-slate-300 truncate">{benefit.cardName}</div>
                                <div className="text-[9px] text-slate-500 truncate">{benefit.points.toLocaleString()} pts</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[11px] font-bold text-emerald-500/80">~${benefit.savings}</div>
                                <div className="text-[9px] text-slate-500 font-mono">{benefit.returnRate.toFixed(1)}% back</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="text-[9px] text-slate-500 leading-normal text-right px-1">
                        *Conservative point valuations used. Based on ${totalPurchase.toLocaleString()} family spend.
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-[#0c0f16]/95 border-t border-slate-900 px-6 py-4 flex gap-3">
              <a
                href={(() => {
                  const adults = profile.familyProfile.adults;
                  const kids   = profile.familyProfile.kids;
                  const passengerPhrase = `for ${adults} adult${adults !== 1 ? 's' : ''}${kids > 0 ? ` and ${kids} child${kids !== 1 ? 'ren' : ''}` : ''}`;
                  const q = `Flights ${passengerPhrase} from ${selectedDeal.departureAirport} to ${selectedDeal.destinationAirport} on ${selectedDeal.outboundDate} returning ${selectedDeal.returnDate}`;
                  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
                })()}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary flex-1 text-center py-2.5 text-xs shadow-lg shadow-indigo-600/20 leading-none flex items-center justify-center"
              >
                SEARCH ON GOOGLE FLIGHTS 🛫
              </a>
              <button 
                onClick={() => {
                  setSelectedDeal(null);
                  researchTrip(selectedDeal);
                }} 
                className="btn btn-secondary py-2.5 text-xs leading-none"
              >
                🕵️‍♂️ RESEARCH TRIP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING BOTTOM NAVIGATION BAR */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] w-full max-w-4xl px-6 animate-in slide-in-from-bottom-6 duration-300">
        <div className="bg-[#0b0d13]/85 backdrop-blur-xl border border-slate-800/40 shadow-2xl rounded-2xl p-2 flex items-center justify-between gap-2">
          
          <button 
            onClick={() => setActiveTab('deals')} 
            className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
              activeTab === 'deals' 
                ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-xs font-bold font-heading">Flight Deals</div>
              <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'deals' ? 'text-indigo-200' : 'text-slate-500'}`}>
                {deals.length} active drop{deals.length !== 1 ? 's' : ''}
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Deals</span>
          </button>
          
          {(activeItinerary !== null || researchingDest !== null) && (
            <button 
              onClick={() => setActiveTab('itinerary')} 
              className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
                activeTab === 'itinerary' 
                  ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L16 4m0 13V4m0 0L9 7" />
              </svg>
              <div className="text-left leading-tight hidden md:block">
                <div className="text-xs font-bold font-heading">Trip Planner</div>
                <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'itinerary' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {researchingDest ? 'Researching...' : 'AI itineraries'}
                </div>
              </div>
              <span className="text-[10px] font-bold md:hidden">Planner</span>
            </button>
          )}

          <button 
            onClick={() => setActiveTab('wishlist')} 
            className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
              activeTab === 'wishlist' 
                ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-xs font-bold font-heading">Wishlist</div>
              <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'wishlist' ? 'text-indigo-200' : 'text-slate-500'}`}>
                {profile.wishlist ? profile.wishlist.length : 0} alerts
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Wishlist</span>
          </button>

          <button 
            onClick={() => setActiveTab('settings')} 
            className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-xs font-bold font-heading">Settings & Wallet</div>
              <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'settings' ? 'text-indigo-200' : 'text-slate-500'}`}>
                Agent & Cards setup
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Settings</span>
          </button>
          
        </div>
      </div>

      {/* ONBOARDING FLOW GUIDED TOUR OVERLAY */}
      {renderOnboardingOverlay()}
    </div>
  );
}
