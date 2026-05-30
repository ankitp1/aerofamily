# 💳 AeroFamily Product Blueprint: Side-by-Side Multi-Card Comparison Engine

When a traveler holds multiple premium credit cards (such as the **Chase Sapphire Reserve®** AND the **Amex Platinum Card®**), deciding which card to swipe is a complex trade-off: **Maximum Points Earnings** vs. **Superior Travel Insurance Protection**.

AeroFamily will automate this decision by rendering an interactive **Side-by-Side Card Comparison Panel** for every flight deal, based directly on the active cards whitelisted in their profile.

---

## 🏗️ 1. Complete System Architecture & Decision Matrix

The **Card-vs-Card Compiler** evaluates all credit cards selected in the user's wallet and computes a comparative matrix across point returns and protection rules:

```mermaid
graph TD
    A[Deal: Nassau Bahamas for $298] --> B[Card-vs-Card Compiler]
    C[(User Wallet: Chase Reserve + Amex Platinum)] --> B
    
    B --> D[Compute Point Multipliers & Values]
    B --> E[Compare Travel Protection Rule Trigger Times]
    
    D --> F[Amex: 1,490 pts ~$30 return | Chase: 894 pts ~$18 return]
    E --> G[Amex: 12h delay, secondary CDW | Chase: 6h delay, primary CDW]
    
    F & G --> H[Aero-Recommendation Verdict]
    H --> I[Interactive UI Side-by-Side Comparison Grid]
```

---

## 🎨 2. Proposed Interactive UI Card Comparison Grid

When clicking on a flight deal, if the traveler has more than one card whitelisted, the app displays a **Card-vs-Card Comparison Panel**:

### Active Comparison: Chase Sapphire Reserve® vs. Amex Platinum Card® (Booking: $298 Cash)

```
+---------------------------------------------------------------------------------+
| 💳 CARD-VS-CARD REWARDS & PROTECTION COMPARISON                                 |
+------------------------------+---------------------------+----------------------+
| BENEFIT / FEATURE            | CHASE SAPPHIRE RESERVE®   | AMEX PLATINUM CARD®  |
+------------------------------+---------------------------+----------------------+
| General Points Program       | Chase Ultimate Rewards    | Amex Membership      |
| General Point Valuation      | 2.0¢ per point            | 2.0¢ per point       |
| Multiplier On Flights        | 3x travel ($18 return)    | 5x flights ($30)     |
| Points redemptions Portal    | 1.5x value (19,866 pts)   | 1.0x (29,800 pts)    |
| Trip Delay trigger time      | ⏳ 6 Hours ($500 limit)   | ⏳ 12 Hours ($500)   |
| Baggage Delay protection     | 🧳 $100/day for 5 days   | ❌ None              |
| Rental Car Protection (CDW)  | 🚗 Primary (up to $75k)   | 🚗 Secondary         |
+------------------------------+---------------------------+----------------------+
| 🏆 AEROFAMILY VERDICT:                                                           |
| • 💰 For Maximum Points: Swipe The Amex Platinum (Yields $30 in travel value).   |
| • 🛡️ For Best Protection: Swipe Chase Sapphire Reserve (Provides superior 6h   |
|   delay coverage and Primary rental car collision coverage).                    |
+---------------------------------------------------------------------------------+
```

---

## 💾 3. Database Rule Extensions (`data/credit_cards.json`)

To support this comparative compilation, we structure card profiles to hold precise conditional values:

```json
{
  "chase_sapphire_reserve": {
    "name": "Chase Sapphire Reserve®",
    "multiplier_label": "3x Travel",
    "valuation_offset": 0.06,
    "delay_hours": 6,
    "baggage_delay_limit": "$100/day (5 days)",
    "cdw_type": "Primary"
  },
  "amex_platinum": {
    "name": "Amex Platinum Card®",
    "multiplier_label": "5x Flights",
    "valuation_offset": 0.10,
    "delay_hours": 12,
    "baggage_delay_limit": "None",
    "cdw_type": "Secondary"
  }
}
```

---

## 🛠️ 4. Implementation Roadmap

### Phase 1: Interactive Wallet Array Check (`src/App.jsx`)
In `src/App.jsx`, implement a helper that checks if `profile.creditCards.length > 1`. If yes, render a comparison toggle link `"Compare Card Benefits"`.

### Phase 2: Comparison Tabular Component
Build a responsive, highly premium tabular component matching the CSS design system that dynamically maps rows for `points_return`, `delay_trigger`, `baggage_rules`, and `cdw_type` for each card owned by the user.

### Phase 3: Automated Verdict Engine
Write an automated recommendation helper in JavaScript that parses the card characteristics and highlights the optimal cards for both the **Financial Return** and **Travel Protection** vectors.
