import { useState, useEffect, useRef } from 'react';

// Pre-defined credit card details database
const PREMIUM_CARDS = {
  "Amex Platinum": {
    name: "Amex Platinum",
    multiplier: 5,
    valuation: 0.020, // 2.0c
    returnRate: 0.10, // 10.0%
    idealFor: "Flights booked direct / Amex Travel"
  },
  "Chase Sapphire Reserve": {
    name: "Chase Sapphire Reserve",
    multiplier: 3,
    valuation: 0.020, // 2.0c
    returnRate: 0.06, // 6.0%
    idealFor: "Any travel purchase"
  },
  "Amex Gold": {
    name: "Amex Gold",
    multiplier: 3,
    valuation: 0.020, // 2.0c
    returnRate: 0.06, // 6.0%
    idealFor: "Flights booked direct"
  },
  "Capital One Venture X": {
    name: "Capital One Venture X",
    multiplier: 2, // 2x flat-rate, 5x via portal (we use 2.5x average or 2x flat)
    valuation: 0.018, // 1.8c
    returnRate: 0.036, // 3.6%
    idealFor: "General travel & flat-rate"
  },
  "Chase Sapphire Preferred": {
    name: "Chase Sapphire Preferred",
    multiplier: 2,
    valuation: 0.020, // 2.0c
    returnRate: 0.04, // 4.0%
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

  const [activeTab, setActiveTab] = useState('deals');
  const [deals, setDeals] = useState([]);
  const [profile, setProfile] = useState({
    airports: [{ code: "ATL", name: "Hartsfield-Jackson Atlanta (ATL)", type: "biggest" }],
    creditCards: ["Chase Sapphire Reserve", "Amex Gold"],
    familyProfile: { adults: 2, kids: 1, budget: 2500, interests: ["Beach", "Kid-Friendly"] },
    activeEngine: "demo"
  });
  const [logs, setLogs] = useState([]);
  const [activeItinerary, setActiveItinerary] = useState(null);
  const [researchingDest, setResearchingDest] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanConsoleLogs, setScanConsoleLogs] = useState([]);
  const [newAirportCode, setNewAirportCode] = useState('');
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [hoveredAirport, setHoveredAirport] = useState(null);
  
  // Custom mock email input state for Simulated Dev Login
  const [devEmail, setDevEmail] = useState('');
  
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
          google.accounts.id.renderButton(btnParent, {
            theme: "filled_dark",
            size: "large",
            shape: "pill"
          });
        }
      } catch (e) {
        console.error("GSI initialization error:", e);
      }
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col justify-between pb-12">
        {/* Simple Header */}
        <header className="glass-panel px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/40">✈️</div>
            <div>
              <h1 className="text-xl font-extrabold font-heading tracking-tight gradient-text">AeroFamily</h1>
              <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Agentic Deal Finder</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <span className="text-slate-300">Auth Gate Secured</span>
          </div>
        </header>

        {/* LOGIN SCREEN */}
        <main className="max-w-md w-full mx-auto px-6 mt-16 flex-1 flex flex-col justify-center">
          <div className="glass-card p-8 space-y-6 text-center shadow-2xl border-indigo-500/10">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-indigo-600/10 animate-bounce">
              🔒
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black font-heading text-white">Welcome to AeroFamily</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Sign in with your Google profile to access your personalized flight scanners, credit card benefit calculations, and 5-day family itineraries!
              </p>
            </div>

            {/* Google Sign In Button Container */}
            <div className="flex flex-col items-center justify-center py-2">
              <div id="google-signin-btn" className="shadow-lg shadow-slate-950/50"></div>
              <div className="text-[10px] text-slate-500 mt-2 font-mono">Secured by Google Identity Services</div>
            </div>

            <div className="flex items-center gap-2 my-4">
              <hr className="flex-1 border-slate-800/80" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">OR</span>
              <hr className="flex-1 border-slate-800/80" />
            </div>

            {/* Simulated Dev Login (Fallback) */}
            <form onSubmit={handleSimulatedLogin} className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 text-left">
              <div className="text-[10px] uppercase font-black tracking-wider text-indigo-400 flex items-center gap-1">
                <span>💡 Dev Sandbox Login</span>
                <span className="badge badge-accent text-[8px] px-1 py-0 border-none">Simulated</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                No Client ID configured? No problem! Type any email below to immediately simulate a Google Profile and test user database isolation.
              </p>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  required
                  placeholder="e.g. ankit@gmail.com"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  className="form-control text-xs flex-1 bg-slate-900 border-slate-800 text-slate-200"
                />
                <button type="submit" className="btn btn-primary text-xs py-1.5 px-4 cursor-pointer">
                  Dev Login
                </button>
              </div>
            </form>
          </div>
        </main>

        {/* Simple Footer */}
        <footer className="text-center text-[10px] text-slate-600 mt-12 font-mono">
          AeroFamily Web App v2.1 • Local Secure Storage Activated
        </footer>
      </div>
    );
  }

  const passengers = profile.familyProfile.adults + profile.familyProfile.kids;
  const filteredDeals = deals.filter(deal => {
    const totalCost = deal.dealPrice * passengers;
    return totalCost <= profile.familyProfile.budget;
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
                  
                  {/* Large Stat */}
                  <div className="flex items-baseline gap-3 mt-4">
                    <span className="text-white text-8xl font-black font-heading leading-none">{newDealsCount}</span>
                    <div className="flex flex-col">
                      <span className="text-emerald-400 font-extrabold text-sm uppercase tracking-wider leading-none">new</span>
                      <span className="text-emerald-400 font-extrabold text-sm uppercase tracking-wider leading-none mt-1">deals</span>
                    </div>
                  </div>
                  
                  {/* Dynamic description paragraph */}
                  <p className="text-slate-400 text-xs mt-4 leading-relaxed pretty-paragraph">
                    The agent scanned <strong className="text-slate-200">15 routes</strong> from {departureAirport} {timeAgoText}. {liveDealsCount} deals are in budget.
                  </p>

                  {/* Family & Budget Interactive Controls */}
                  <div className="mt-5 space-y-3.5 bg-slate-950/45 p-4 rounded-xl border border-slate-900/80">
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
                            className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >-</button>
                          <span className="text-white font-bold">{profile.familyProfile.adults}</span>
                          <button 
                            onClick={() => updateFamilyDetails('adults', profile.familyProfile.adults + 1)}
                            className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >+</button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">👶 Kids</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => updateFamilyDetails('kids', Math.max(0, profile.familyProfile.kids - 1))}
                            className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
                          >-</button>
                          <span className="text-white font-bold">{profile.familyProfile.kids}</span>
                          <button 
                            onClick={() => updateFamilyDetails('kids', profile.familyProfile.kids + 1)}
                            className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-xs"
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
                        {deals.length > 0 ? Math.max(...deals.map(d => d.savingsPercent)) : 56}%
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
                    {deals.length || 6} LIVE ROUTES FROM {profile.airports[0]?.code || 'ATL'}
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

                    {/* Central Glow under ATL */}
                    <circle cx="360" cy="150" r="70" fill="url(#halo-glow)" />

                    {/* Surrounding Nodes Bezier Curves */}
                    {[
                      { code: 'PHX', x: 230, y: 90, cx: 295, cy: 105 },
                      { code: 'KOA', x: 120, y: 190, cx: 230, cy: 155 },
                      { code: 'MDE', x: 380, y: 260, cx: 370, cy: 215 },
                      { code: 'SJU', x: 540, y: 220, cx: 480, cy: 200, isBest: true },
                      { code: 'NAS', x: 560, y: 120, cx: 485, cy: 125 },
                      { code: 'PUJ', x: 670, y: 110, cx: 535, cy: 115 }
                    ].map(node => {
                      const matchDeal = deals.find(d => d.destinationAirport === node.code);
                      const isWithinBudget = matchDeal ? (matchDeal.dealPrice * passengers <= profile.familyProfile.budget) : true;
                      const isActive = isWithinBudget && (hoveredAirport === node.code || (!hoveredAirport && node.isBest));
                      return (
                        <g key={`path-group-${node.code}`} opacity={isWithinBudget ? 1 : 0.15}>
                          {/* Shadow glow line for active curve */}
                          {isActive && (
                            <path
                              d={`M 360 150 Q ${node.cx} ${node.cy} ${node.x} ${node.y}`}
                              fill="none"
                              stroke={node.isBest ? '#fbbf24' : '#6366f1'}
                              strokeWidth="4"
                              opacity="0.15"
                              className="transition-all duration-300"
                            />
                          )}
                          {/* Standard Curve Line */}
                          <path
                            d={`M 360 150 Q ${node.cx} ${node.cy} ${node.x} ${node.y}`}
                            fill="none"
                            stroke={isActive ? (node.isBest ? '#fbbf24' : '#818cf8') : 'rgba(99, 102, 241, 0.15)'}
                            strokeWidth={isActive ? '2' : '1.2'}
                            strokeDasharray={isActive ? 'none' : '3 4'}
                            className="transition-all duration-300"
                          />
                        </g>
                      );
                    })}

                    {/* Central Origin Node (ATL) */}
                    <g>
                      <circle cx="360" cy="150" r="16" fill="rgba(255, 255, 255, 0.05)" />
                      <circle cx="360" cy="150" r="6" fill="#080a0f" stroke="white" strokeWidth="2" />
                      <text x="360" y="132" fill="white" fontSize="10" fontWeight="800" textAnchor="middle" fontFamily="Outfit">
                        {profile.airports[0]?.code || 'ATL'}
                      </text>
                    </g>

                    {/* Destination Nodes */}
                    {[
                      { code: 'PHX', x: 230, y: 90, price: '$229' },
                      { code: 'KOA', x: 120, y: 190, price: '$458' },
                      { code: 'MDE', x: 380, y: 260, price: '$289' },
                      { code: 'SJU', x: 540, y: 220, price: '$222', isBest: true },
                      { code: 'NAS', x: 560, y: 120, price: '$298' },
                      { code: 'PUJ', x: 670, y: 110, price: '$347' }
                    ].map(node => {
                      const matchDeal = deals.find(d => d.destinationAirport === node.code);
                      const isWithinBudget = matchDeal ? (matchDeal.dealPrice * passengers <= profile.familyProfile.budget) : true;
                      const isActive = isWithinBudget && (hoveredAirport === node.code || (!hoveredAirport && node.isBest));
                      const displayColor = node.isBest ? '#fbbf24' : '#6366f1';
                      
                      return (
                        <g 
                          key={`node-${node.code}`}
                          onMouseEnter={() => isWithinBudget && setHoveredAirport(node.code)}
                          onMouseLeave={() => isWithinBudget && setHoveredAirport(null)}
                          onClick={() => {
                            if (!isWithinBudget) return;
                            if (matchDeal) setSelectedDeal(matchDeal);
                          }}
                          className={isWithinBudget ? "cursor-pointer" : "cursor-not-allowed"}
                          opacity={isWithinBudget ? 1 : 0.25}
                        >
                          {/* Glow background behind SJU/active nodes */}
                          {isActive && (
                            <circle cx={node.x} cy={node.y} r="16" fill={node.isBest ? 'url(#yellow-glow)' : 'rgba(99, 102, 241, 0.15)'} />
                          )}
                          {/* Pulsing ring */}
                          {isActive && (
                            <circle 
                              cx={node.x} 
                              cy={node.y} 
                              r="12" 
                              fill="none" 
                              stroke={displayColor} 
                              strokeWidth="1.5" 
                              opacity="0.6" 
                              className="animate-ping"
                            />
                          )}
                          {/* Inner circle */}
                          <circle 
                            cx={node.x} 
                            cy={node.y} 
                            r={isActive ? "5" : "4"} 
                            fill={isActive ? displayColor : "#161b26"} 
                            stroke={isActive ? "white" : "rgba(148, 163, 184, 0.4)"} 
                            strokeWidth="1.5" 
                            className="transition-all duration-300"
                          />
                          {/* Muted Airport Code above */}
                          <text 
                            x={node.x} 
                            y={node.y - 12} 
                            fill={isWithinBudget ? "#64748b" : "#475569"} 
                            fontSize="9" 
                            fontWeight="bold" 
                            textAnchor="middle" 
                            fontFamily="Inter"
                          >
                            {node.code}
                          </text>
                          {/* Price Tag below */}
                          <text 
                            x={node.x} 
                            y={node.y + 18} 
                            fill={isWithinBudget ? (isActive ? displayColor : '#94a3b8') : '#ef4444'} 
                            fontSize="10" 
                            fontWeight="800" 
                            textAnchor="middle" 
                            fontFamily="Outfit"
                          >
                            {isWithinBudget ? node.price : 'Over Budget'}
                          </text>
                        </g>
                      );
                    })}
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
                </div>
                <button 
                  onClick={() => setActiveTab('deals')}
                  className="text-xs font-semibold text-[#5f5af6] hover:text-[#7f7bf8] transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none"
                >
                  Browse all <span className="text-sm">➔</span>
                </button>
              </div>

              {filteredDeals.length === 0 ? (
                <div className="glass-card p-12 text-center space-y-4 w-full">
                  <div className="text-4xl">📭</div>
                  <h3 className="text-xl font-bold font-heading">No Deals in Budget</h3>
                  <p className="text-slate-400 max-w-sm mx-auto">Try raising your flight budget slider on the left sidebar to see more scanned drops.</p>
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-none snap-x snap-mandatory">
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
                        className={`bg-[#0e111a] border border-[#1b1f2e] rounded-2xl p-5 w-[205px] shrink-0 snap-start cursor-pointer transition-all flex flex-col justify-between h-48 relative overflow-hidden ${
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
                          {isNew ? (
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
          </section>
        )}

        {/* TAB 2: CREDIT CARD WALLET */}
        {activeTab === 'wallet' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Wallet checklist */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold font-heading">💳 My Travel Credit Card Wallet</h2>
                <p className="text-sm text-slate-400">Select the credit cards you own to automatically calculate reward points and select optimal payment strategies for flight deals.</p>
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
            </div>

            {/* Valuation Guide */}
            <div className="space-y-6">
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-lg font-bold font-heading text-white border-b border-slate-800 pb-2">📊 Card Valuations Math</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Our system evaluates rewards by calculating your **Net Return Rate** on each purchase. 
                </p>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                  <div>Formula:</div>
                  <div className="text-indigo-400">Cost * Multiplier * PointValue</div>
                  <div className="border-t border-slate-800 my-1"></div>
                  <div>Example (Amex Platinum):</div>
                  <div>$1,000 * 5x = 5,000 Points</div>
                  <div>5,000 * 2.0¢ = $100 Rewards</div>
                  <div className="text-emerald-400">Net Return: 10% back!</div>
                </div>
                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>• Point valuations represent high-impact transfer partners (e.g. Hyatt, Emirates, Singapore Airlines) average returns.</p>
                  <p>• Valuations are updated for 2026 travel parameters.</p>
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

        {/* TAB 4: AGENT CONTROL PANEL */}
        {activeTab === 'agent' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Agent Settings Pane */}
              <div className="space-y-6">
                <div className="glass-card p-5 space-y-5">
                  <h3 className="text-lg font-bold font-heading text-white border-b border-slate-800 pb-2">🤖 Agent Setup</h3>
                  
                  {/* Select Flight Scanner Engine */}
                  <div className="form-group">
                    <label className="form-label">⚙️ Active Scan Engine</label>
                    <select 
                      value={profile.activeEngine} 
                      onChange={(e) => saveProfile({ ...profile, activeEngine: e.target.value })}
                      className="form-control"
                    >
                      <option value="demo">Demo Mode (Fidelity Mock, No Keys)</option>
                      <option value="kiwi">Kiwi.com Tequila API (Real Anywhere Search)</option>
                      <option value="gemini">Gemini Web Grounding (Live AI Search)</option>
                      <option value="travelpayouts">Travelpayouts API (Real Global Cache)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                      {profile.activeEngine === 'demo' && "• Safely works immediately. Simulates drops with rich, seasonal route mock engines."}
                      {profile.activeEngine === 'kiwi' && "• Connects to Kiwi's powerful Tequila engine to find the cheapest active flights from your origin to anywhere in the world. Requires KIWI_API_KEY."}
                      {profile.activeEngine === 'gemini' && "• Searches the live web using Gemini 2.5 Flash Google Search integration. Requires GEMINI_API_KEY."}
                      {profile.activeEngine === 'travelpayouts' && "• Directly pulls cached airline ticket prices queried by global users. Requires TRAVELPAYOUTS_TOKEN."}
                    </p>
                    <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 mt-2 text-[10px] text-indigo-300 leading-normal">
                      💡 <strong>No Kiwi Key? No problem!</strong> Use the <strong>Gemini Web Grounding</strong> or <strong>Travelpayouts</strong> engines. AeroFamily will automatically use your Travelpayouts Token (already active!) to verify and date-correct all deals!
                    </div>
                  </div>

                  {/* Configured Departure Airports */}
                  <div className="form-group">
                    <label className="form-label">🛫 My Departure Airports</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        maxLength="3"
                        placeholder="e.g. JFK" 
                        value={newAirportCode}
                        onChange={(e) => setNewAirportCode(e.target.value)}
                        className="form-control flex-1 uppercase"
                      />
                      <button onClick={addAirport} className="btn btn-secondary px-4 py-2">Add</button>
                    </div>

                    <div className="space-y-2 mt-3">
                      {profile.airports.map(airport => (
                        <div key={airport.code} className="flex justify-between items-center bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-xs">
                          <div>
                            <span className="font-bold text-indigo-300 font-mono">{airport.code}</span>
                            <span className="text-slate-400 ml-2 text-[10px]">{airport.name}</span>
                          </div>
                          <button 
                            onClick={() => removeAirport(airport.code)}
                            className="text-rose-400 hover:text-rose-500 font-bold px-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scheduled background daemon parameters */}
                  <div className="border-t border-slate-800 pt-3 text-xs text-slate-400 space-y-1.5">
                    <div className="font-bold text-[10px] uppercase text-indigo-400">📅 Background Daemon Schedule</div>
                    <div>• Frequency: **Twice daily** (every 12 hours)</div>
                    <div>• Next scan: **Automatic background interval armed**</div>
                    <div className="text-[10px] text-slate-500 mt-1 italic">Runs silently in background thread. Stores results inside deals.json file locally.</div>
                  </div>
                </div>
              </div>

              {/* Console log terminal visualizer */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-card flex flex-col h-[500px] border-slate-800/80 shadow-2xl">
                  
                  {/* Console Header */}
                  <div className="bg-slate-950 px-4 py-3 rounded-t-lg border-b border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                      <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                      <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                      <span className="text-xs text-slate-400 font-mono ml-2">flight_agent_daemon.sh</span>
                    </div>
                    <button 
                      onClick={triggerScan}
                      disabled={scanning}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold font-mono disabled:opacity-50"
                    >
                      {scanning ? 'RUNNING...' : 'DEPLOY AGENT'}
                    </button>
                  </div>

                  {/* Console Terminal Screen */}
                  <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-y-auto text-emerald-400 space-y-1.5">
                    {scanConsoleLogs.length === 0 ? (
                      <div className="text-slate-500 text-center pt-32">
                        <p>&gt; Agent Terminal Ready.</p>
                        <p className="mt-2 text-[11px]">Hit "DEPLOY AGENT" above to see the logs, triggers, routing, and calculations in real time.</p>
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
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 font-heading">⏱️ Scan Execution History (data/logs.json)</h3>
                  
                  {logs.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No past scans logged yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((logItem, idx) => (
                        <div key={idx} className="glass-card p-3 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-200">🔍 {logItem.message}</span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Engine: **{logItem.engine.toUpperCase()}** • Time: {new Date(logItem.timestamp).toLocaleString()}
                            </div>
                          </div>
                          <span className={`badge text-[9px] ${
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
                <h3 className="text-white text-xl font-extrabold font-heading mt-1 leading-tight">
                  {selectedDeal.destination}
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
              <div className="flex justify-between items-center bg-[#131722]/80 border border-slate-900/60 p-4 rounded-xl">
                <div>
                  <div className="text-3xl font-black font-heading text-white">
                    ${selectedDeal.dealPrice}
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">
                    Normally ~${selectedDeal.normalPrice}
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

              {/* Card Wallet Recommender */}
              <div className="border-t border-slate-900 pt-4 space-y-3">
                <div className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest">
                  💳 CARD WALLET PAYMENT OPTIMIZATION
                </div>
                
                {calculateCardBenefits(selectedDeal.dealPrice).length > 0 ? (
                  <div className="space-y-2">
                    {calculateCardBenefits(selectedDeal.dealPrice).slice(0, 2).map((benefit, bIdx) => (
                      <div key={benefit.cardName} className={`border rounded-xl p-3 flex items-center justify-between gap-4 ${
                        bIdx === 0 ? 'bg-indigo-950/10 border-indigo-500/25' : 'bg-slate-950/20 border-slate-900/60'
                      }`}>
                        <div>
                          <div className="text-xs font-bold text-slate-200">
                            {bIdx === 0 && '👑 '}
                            {benefit.cardName}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">{benefit.idealFor}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold text-emerald-400 block">
                            +{benefit.points.toLocaleString()} pts
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                            Worth ~${benefit.savings} ({benefit.returnRate.toFixed(1)}% back)
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="text-[9px] text-slate-500 leading-normal text-right">
                      Calculated for family of {profile.familyProfile.adults + profile.familyProfile.kids} (Total purchase: ${(selectedDeal.dealPrice * (profile.familyProfile.adults + profile.familyProfile.kids)).toLocaleString()})
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Add credit cards in the Card Wallet tab to calculate customized point rewards for this transaction.
                  </p>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-[#0c0f16]/95 border-t border-slate-900 px-6 py-4 flex gap-3">
              <a 
                href={selectedDeal.bookingLink} 
                target="_blank" 
                rel="noreferrer" 
                className="btn btn-primary flex-1 text-center py-2.5 text-xs shadow-lg shadow-indigo-600/20 leading-none flex items-center justify-center"
              >
                BOOK FLIGHT 🛫
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
                {deals.length || 6} active drops
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Deals</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('wallet')} 
            className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
              activeTab === 'wallet' 
                ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-xs font-bold font-heading">Card Wallet</div>
              <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'wallet' ? 'text-indigo-200' : 'text-slate-500'}`}>
                {profile.creditCards.length} cards optimized
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Wallet</span>
          </button>
          
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
                AI itineraries
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Planner</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('agent')} 
            className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border border-transparent cursor-pointer ${
              activeTab === 'agent' 
                ? 'bg-[#5f5af6] border-indigo-500/20 text-white shadow-lg shadow-indigo-600/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-left leading-tight hidden md:block">
              <div className="text-xs font-bold font-heading">Agent Terminal</div>
              <div className={`text-[9px] mt-0.5 font-medium ${activeTab === 'agent' ? 'text-indigo-200' : 'text-slate-500'}`}>
                {scanning ? 'Scanning...' : 'Daemon armed'}
              </div>
            </div>
            <span className="text-[10px] font-bold md:hidden">Terminal</span>
          </button>
          
        </div>
      </div>
    </div>
  );
}
