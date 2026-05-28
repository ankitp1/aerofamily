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
  
  // Custom mock email input state for Simulated Dev Login
  const [devEmail, setDevEmail] = useState('');
  
  const terminalEndRef = useRef(null);

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

  return (
    <div className="min-h-screen pb-12">
      {/* HEADER SECTION */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-600/40">✈️</div>
          <div>
            <h1 className="text-xl font-extrabold font-heading tracking-tight gradient-text">AeroFamily</h1>
            <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Agentic Deal Finder</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs w-full max-w-lg">
          <button onClick={() => setActiveTab('deals')} className={`tab-btn ${activeTab === 'deals' ? 'active' : ''}`}>
            🏷️ Flight Deals
          </button>
          <button onClick={() => setActiveTab('wallet')} className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}>
            💳 Card Wallet
          </button>
          <button onClick={() => setActiveTab('itinerary')} className={`tab-btn ${activeTab === 'itinerary' ? 'active' : ''}`}>
            🗺️ Trip Planner
          </button>
          <button onClick={() => setActiveTab('agent')} className={`tab-btn ${activeTab === 'agent' ? 'active' : ''}`}>
            🤖 Agent Terminal
          </button>
        </nav>

        {/* User profile & Log Out */}
        {isLoggedIn && user ? (
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800/80 rounded-full pl-2.5 pr-4 py-1.5 text-xs">
            <img 
              src={user.picture} 
              alt={user.name} 
              className="w-7 h-7 rounded-full border border-indigo-500/30 object-cover shadow shadow-indigo-500/20"
            />
            <div className="text-left hidden md:block">
              <div className="font-bold text-slate-200 leading-tight">{user.name}</div>
              <div className="text-[9px] text-indigo-400 leading-none">{user.email}</div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-rose-400 transition-colors font-extrabold ml-1 px-1 text-sm cursor-pointer bg-transparent border-none outline-none"
              title="Log Out"
            >
              🚪
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300">Scanner Daemon Armed</span>
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-6 mt-8">

        {/* TAB 1: FLIGHT DEALS */}
        {activeTab === 'deals' && (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-extrabold font-heading">🔥 Top Active Flight Deals</h2>
                <p className="text-sm text-slate-400">Scouted departures from: {profile.airports.map(a => a.code).join(', ')}</p>
              </div>
              <button 
                onClick={triggerScan} 
                disabled={scanning} 
                className="btn btn-primary"
              >
                {scanning ? '🔄 Scanning...' : '🔎 Scan for Drops Now'}
              </button>
            </div>

            {deals.length === 0 ? (
              <div className="glass-card p-12 text-center space-y-4">
                <div className="text-4xl">📭</div>
                <h3 className="text-xl font-bold font-heading">No Deals Found</h3>
                <p className="text-slate-400 max-w-md mx-auto">The flight deal index is empty. Hit the scan button above to deploy our AI scouts to search the web for deals!</p>
              </div>
            ) : (
              <div className="grid-cols-deals">
                {deals.map(deal => {
                  const cardBenefits = calculateCardBenefits(deal.dealPrice);
                  const bestCard = cardBenefits[0];
                  const familyCount = profile.familyProfile.adults + profile.familyProfile.kids;
                  const totalFlightCost = deal.dealPrice * familyCount;

                  return (
                    <article key={deal.id} className="glass-card deal-card p-5 space-y-4">
                      {/* Deal Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-heading font-extrabold text-2xl tracking-tight text-white">${deal.dealPrice}</span>
                            <span className="badge badge-success text-[10px]">{deal.savingsPercent}% OFF</span>
                            {deal.verified && (
                              <span className="badge text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 font-extrabold animate-pulse">
                                ✓ Verified Live
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-medium">Normally ~${deal.normalPrice}</span>
                        </div>
                        <div className="text-right">
                          <span className="badge badge-accent text-[10px] font-bold">{deal.departureAirport} ➔ {deal.destinationAirport}</span>
                          <div className="text-[10px] text-slate-500 mt-1 font-semibold">{deal.airlines}</div>
                        </div>
                      </div>

                      {/* Destination Details */}
                      <div>
                        <h3 className="text-lg font-bold font-heading text-white">{deal.destination}</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-3">{deal.description}</p>
                      </div>

                      {/* Travel details */}
                      <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs text-slate-300">
                        <div>📅 {deal.outboundDate} to {deal.returnDate}</div>
                        <div className="text-[10px] uppercase font-bold text-amber-500">⚡ Expires: {deal.bookingWindow}</div>
                      </div>

                      {deal.longLayoverWarning && (
                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2.5 flex items-center gap-2 text-xs font-bold text-rose-400/90 tracking-wide">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                          <span>{deal.longLayoverWarning}</span>
                        </div>
                      )}

                      {/* Payment Benefit Recommender */}
                      <div className="border-t border-slate-800/80 pt-3.5 space-y-2">
                        <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">💳 Wallet Payment Optimizer</div>
                        {bestCard ? (
                          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-2.5 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-indigo-300">💳 Best Card: {bestCard.cardName}</div>
                              <p className="text-[10px] text-slate-400 mt-0.5">{bestCard.idealFor}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-extrabold text-emerald-400">+{bestCard.points.toLocaleString()} pts</span>
                              <div className="text-[9px] text-slate-400 mt-0.5">Worth ~${bestCard.savings}</div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-500">Add cards in the Wallet tab to calculate point rewards for this flight.</p>
                        )}
                        <div className="text-[9px] text-slate-500">Calculated for family of {familyCount}: total ticket purchase cost is ${totalFlightCost.toLocaleString()}</div>
                      </div>

                      {/* Booking Action Buttons */}
                      <div className="flex gap-2.5 pt-2">
                        <a 
                          href={deal.bookingLink} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="btn btn-primary flex-1 text-center py-2 text-xs"
                        >
                          Book Flight 🛫
                        </a>
                        <button 
                          onClick={() => researchTrip(deal)} 
                          className="btn btn-secondary py-2 text-xs"
                        >
                          🕵️‍♂️ Research Trip
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
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
    </div>
  );
}
