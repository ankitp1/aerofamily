/**
 * loyaltyPrograms.js
 * Built-in catalog of loyalty programs with conservative point valuations.
 * An optional data/loyalty_programs.json (gitignored) can override or extend
 * these defaults at runtime — see getLoyaltyPrograms() in server.js.
 */

export const DEFAULT_LOYALTY_PROGRAMS = {
  delta_skymiles: {
    program_name: 'Delta SkyMiles',
    type: 'airline',
    airline_code: 'DL',
    valuation_cents_per_mile: 1.2,
  },
  united_mileageplus: {
    program_name: 'United MileagePlus',
    type: 'airline',
    airline_code: 'UA',
    valuation_cents_per_mile: 1.3,
  },
  american_aadvantage: {
    program_name: 'American AAdvantage',
    type: 'airline',
    airline_code: 'AA',
    valuation_cents_per_mile: 1.5,
  },
  southwest_rapid_rewards: {
    program_name: 'Southwest Rapid Rewards',
    type: 'airline',
    airline_code: 'WN',
    valuation_cents_per_mile: 1.4,
  },
  jetblue_trueblue: {
    program_name: 'JetBlue TrueBlue',
    type: 'airline',
    airline_code: 'B6',
    valuation_cents_per_mile: 1.3,
  },
  alaska_mileage_plan: {
    program_name: 'Alaska Mileage Plan',
    type: 'airline',
    airline_code: 'AS',
    valuation_cents_per_mile: 1.6,
  },
  chase_ultimate_rewards: {
    program_name: 'Chase Ultimate Rewards',
    type: 'bank',
    valuation_cents_per_mile: 2.0,
  },
  amex_membership_rewards: {
    program_name: 'Amex Membership Rewards',
    type: 'bank',
    valuation_cents_per_mile: 2.0,
  },
  capital_one_miles: {
    program_name: 'Capital One Miles',
    type: 'bank',
    valuation_cents_per_mile: 1.8,
  },
  marriott_bonvoy: {
    program_name: 'Marriott Bonvoy',
    type: 'hotel',
    valuation_cents_per_mile: 0.8,
  },
  hilton_honors: {
    program_name: 'Hilton Honors',
    type: 'hotel',
    valuation_cents_per_mile: 0.5,
  },
};
