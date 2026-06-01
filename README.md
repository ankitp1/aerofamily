# ✈️ AeroFamily: Intelligent Family Flight Deal Scanner & Award Travel Optimizer

AeroFamily is a high-fidelity, self-healing flight deal intelligence and itinerary planner specifically tailored for family travelers and award travel optimization. The application scans live global flight price caches, checks airline schedules, alerts families on layover constraints, optimizes premium credit card reward payouts, and drafts deep generative AI itineraries using Gemini.

Built using a **pure serverless architecture**, AeroFamily is fully ready for deployment on the **Google Firebase Suite (Hosting & Functions)**, using **Google Cloud Firestore** for isolated multi-tenant data storage.

---

## 🚀 Core Features

### 1. High-Fidelity Interactive Dashboard
*   **Central Flight Coordinate Radar**: An interactive SVG flight map that calculates and renders bezier flight paths projecting from a family's central departure airport (e.g., ATL) to destination nodes.
*   **Dynamic Visual Elements**: Airport nodes highlight on card hover, pulsing amber alert rings identify active expiring drops (e.g., San Juan SJU), and custom CSS grid layers hide horizontal scrollbars for clean navigation.
*   **Docked Floating Glassmorphic Nav**: A sleek bottom-docked navigation bar presenting outlining SVG icons and vertically stacked dual-line sub-labels (e.g., "Flight Deals - 6 active drops", "Card Wallet - 2 cards optimized").

### 2. Family-First Pricing & Constraints
*   **Family-of-3 Multipliers**: Automatically calculates total flight costs for a configured family structure (defaulting to 2 adults and 1 child) to prevent budget mismatch.
*   **Smart Layover Highlighting**: Explicitly scans and flags layovers exceeding **3 hours** with visible warnings on the flight card details overlay.
*   **Nonstop / Single Stop Filtering**: Filters flight paths to only allow direct or 1-stop routes, protecting families from complex itineraries.

### 3. Credit Card Wallet Benefit Optimizer
*   **Multi-Card Valuation Math**: Automatically compares points multipliers and average valuations for premium travel credit cards owned by the user, including:
    *   *Amex Platinum* (5x points on flights, 2.0¢ average value)
    *   *Chase Sapphire Reserve* (3x points on travel, 2.0¢ average value)
    *   *Amex Gold* (3x points on flights, 2.0¢ average value)
    *   *Capital One Venture X* (2x points flat-rate, 1.8¢ average value)
    *   *Chase Sapphire Preferred* (2x points on travel, 2.0¢ average value)
*   **Net Return Rate Calculations**: Dynamically computes the **Net Return Rate** and exact cash value of rewards earned on the flight transaction to identify the optimal card to swipe.

### 4. Destination Wishlist Alerts
*   **Set and Forget**: Track bucket-list travel destinations with optional target month ranges.
*   **Targeted Background Scans**: The daily background daemon searches for generic cache deals and immediately checks them against your active wishlist.
*   **Email Notifications**: Dispatches an instant email via `nodemailer` if a live price drop matches a saved wishlist destination, guarded by a smart 24-hour anti-spam cooldown.

### 5. Passport & Visa Guard
*   **Citizenship Aware**: Tracks user's home passport and current US Immigration status (e.g., B1/B2, H-1B, Advance Parole).
*   **Third-Country Transit Check**: Automatically flags deals requiring transit visas for specific layover countries, ensuring families never get stuck at the border.

### 6. Deep Generative Travel Research (Gemini Agent)
*   **5-Day Custom Itineraries**: Connects with Gemini to draft detailed day-by-day travel plans customized to the family's profile, budget, interests (e.g., Beach, Kid-Friendly), and safety ratings.
*   **Shared Itinerary Caching**: Caches markdown itineraries under isolated Firestore hashes to eliminate redundant Gemini API invocation costs.

### 7. Marketing Onboarding Funnel
*   **Premium Landing Page**: A fully responsive, scrollable marketing funnel that hooks users by selling the primary value propositions before they ever reach the login gate.
*   **Glassmorphic Design**: Utilizes beautiful dark-mode glassmorphic cards and dynamic text gradients.

### 5. Multi-Tenant Google Authentication & Cloud Firestore
*   **Secure Google Sign-In**: Authenticates users via the Google Identity Services JWT SDK.
*   **Simulated Dev Sandbox Mode**: Permits seamless offline testing. In the absence of a Google Client ID, entering any email immediately simulates a secure sandbox tenant to test database isolation.
*   **Isolated Cloud Firestore Collections**:
    *   `/profiles/{userId}`: Stores active travelers, budget, interests, and credit card wallets.
    *   `/deals/{userId}`: Stores live flight deals captured by the background daemon.
    *   `/logs/{userId}`: Stores historical scan reports and console outputs.

---

## 🛠️ Technology Stack
*   **Frontend**: React (Vite), Tailwind-free HSL Custom Variables, Interactive SVG Canvas.
*   **Backend**: Node.js, Express.js, Firebase Admin SDK, Firebase Functions (Node 20).
*   **Database**: Google Cloud Firestore (isolated multi-tenant schema).
*   **Background Jobs**: Firebase v2 Cloud Scheduler (Scheduled Functions).

---

## 📁 Project Architecture

```mermaid
graph TD
    subgraph Client [Firebase Hosting Edge CDN]
        Vite[React SPA Client - dist/]
    end

    subgraph API [Firebase Cloud Functions - Node 20]
        Express[Express Route API]
        Scheduler[Scheduled Scan Agent - Cloud Scheduler]
    end

    subgraph DB [Google Cloud Firestore]
        Profiles[/profiles/userId]
        Deals[/deals/userId]
        Logs[/logs/userId]
        ItinCache[/itinerary_caches/hash]
    end

    Vite -->|HTTPS Requests| Express
    Express <-->|CRUD Operations| DB
    Scheduler -->|Triggers Scan & Saves| DB
```

---

## 💻 Local Quick Start Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/flight-deal-agent.git
cd flight-deal-agent
npm install
```

### 2. Configure Environment Secrets
Create a `.env` file in the root directory:
```env
PORT=3001
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
GEMINI_API_KEY=your_gemini_api_key
TRAVELPAYOUTS_TOKEN=your_travelpayouts_token
KIWI_API_KEY=your_optional_kiwi_key
```

### 3. Run Development Server
Boot up the concurrent environment (Vite frontend on `http://localhost:5173` and Express backend on `http://localhost:3001` with nodemon):
```bash
npm run dev
```

---

## ☁️ Serverless Firebase Deployment

AeroFamily uses a **direct root codebase deploy**, allowing your server files and configurations to be packaged directly into a serverless Cloud Function with zero folder duplication.

### 1. Initialize and Push Code to GitHub
Ensure your local branch is fully up-to-date and push your secure codebase:
```bash
git remote add origin https://github.com/<your-username>/flight-deal-agent.git
git branch -M main
git push -u origin main
```
*(Your private credentials inside `.env` and local database cache under `data/` are strictly excluded from Git tracking via `.gitignore`).*

### 2. Cloud Deployment
Configure your active project inside `.firebaserc` and run:
```bash
npx -y firebase-tools@latest deploy
```

### 3. Register Cloud Secrets
Securely register your API keys with Google Cloud Secrets Manager so the Cloud Functions can execute scans and research:
```bash
npx -y firebase-tools@latest functions:secrets:set GEMINI_API_KEY="your_gemini_key"
npx -y firebase-tools@latest functions:secrets:set TRAVELPAYOUTS_TOKEN="your_travelpayouts_token"
```
