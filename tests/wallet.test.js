import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js'; // Pulls in all Firebase and agent.js ESM mocks!
import { app } from '../server.js';
import { computeAwardAffordability } from '../awardWalletService.js';
import { extractAwardPricing } from '../deltaAwardSearch.js';
import { DEFAULT_LOYALTY_PROGRAMS } from '../loyaltyPrograms.js';

describe('Manual Loyalty Wallet', () => {

  describe('GET /api/wallet/manual', () => {
    it('returns an empty balance list plus the program catalog', async () => {
      const res = await request(app).get('/api/wallet/manual');

      expect(res.status).toBe(200);
      expect(res.body.balances).toEqual([]);
      expect(res.body.programs.delta_skymiles.program_name).toBe('Delta SkyMiles');
    });
  });

  describe('POST /api/wallet/manual - add / update / delete lifecycle', () => {
    it('adds a new balance entry and reads it back with staleness metadata', async () => {
      const addRes = await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'delta_skymiles', member_label: 'Spouse', balance: 124000 });

      expect(addRes.status).toBe(200);
      expect(addRes.body.success).toBe(true);
      const saved = addRes.body.balance;
      expect(saved.account_id).toMatch(/^manual_/);
      expect(saved.program_name).toBe('Delta SkyMiles');
      expect(saved.airline_code).toBe('DL');
      expect(saved.balance).toBe(124000);
      expect(saved.source).toBe('manual');
      expect(saved.stale).toBe(false);

      const listRes = await request(app).get('/api/wallet/manual');
      expect(listRes.body.balances).toHaveLength(1);
      expect(listRes.body.balances[0].ageDays).toBe(0);
    });

    it('updates an existing entry in place when account_id matches', async () => {
      const addRes = await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'chase_ultimate_rewards', balance: 50000 });
      const id = addRes.body.balance.account_id;
      expect(addRes.body.balance.balanceLabel).toBe('points'); // bank program default

      const updateRes = await request(app)
        .post('/api/wallet/manual')
        .send({ account_id: id, program_id: 'chase_ultimate_rewards', balance: 62000 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.balance.balance).toBe(62000);

      const listRes = await request(app).get('/api/wallet/manual');
      const entries = listRes.body.balances.filter(b => b.account_id === id);
      expect(entries).toHaveLength(1);
      expect(entries[0].balance).toBe(62000);
    });

    it('rejects a negative or missing balance with 400', async () => {
      const res = await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'delta_skymiles', balance: -5 });
      expect(res.status).toBe(400);

      const res2 = await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'delta_skymiles' });
      expect(res2.status).toBe(400);
    });

    it('accepts an unknown program via free-text program_name', async () => {
      const res = await request(app)
        .post('/api/wallet/manual')
        .send({ program_name: 'Turkish Miles&Smiles', balance: 30000 });

      expect(res.status).toBe(200);
      expect(res.body.balance.program_id).toBe('turkish_miles_smiles');
      expect(res.body.balance.program_name).toBe('Turkish Miles&Smiles');
    });

    it('deletes an entry by account_id', async () => {
      const addRes = await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'amex_membership_rewards', balance: 84500 });
      const id = addRes.body.balance.account_id;

      const delRes = await request(app).delete(`/api/wallet/manual/${id}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const listRes = await request(app).get('/api/wallet/manual');
      expect(listRes.body.balances.some(b => b.account_id === id)).toBe(false);
    });
  });

  describe('GET /api/awardwallet/balances - merged manual + synced view', () => {
    it('includes manual entries tagged with source=manual', async () => {
      await request(app)
        .post('/api/wallet/manual')
        .send({ program_id: 'delta_skymiles', member_label: 'Your Account', balance: 182490 });

      const res = await request(app).get('/api/awardwallet/balances');
      expect(res.status).toBe(200);

      const manual = res.body.balances.filter(b => b.source === 'manual');
      expect(manual.length).toBeGreaterThanOrEqual(1);
      expect(manual.some(b => b.balance === 182490)).toBe(true);
    });
  });
});

describe('Award Affordability Engine', () => {
  const balances = [
    { account_id: 'a1', program_id: 'delta_skymiles', program_name: 'Delta SkyMiles', balance: 182490, member_label: 'Your Account' },
    { account_id: 'a2', program_id: 'delta_skymiles', program_name: 'Delta SkyMiles', balance: 124000, member_label: 'Spouse' },
    { account_id: 'a3', program_id: 'amex_membership_rewards', program_name: 'Amex Membership Rewards', balance: 84500, member_label: 'Your Account' },
  ];

  it('falls back to cents-per-mile estimates without live pricing', () => {
    const report = computeAwardAffordability(1380, balances, DEFAULT_LOYALTY_PROGRAMS);
    const delta = report.find(r => r.program_name === 'Delta SkyMiles');

    expect(delta.pricing_source).toBe('estimate');
    expect(delta.miles_needed).toBe(Math.ceil((1380 * 100) / 1.2));
    expect(delta.combined_balance).toBe(306490);
    expect(delta.taxes_usd).toBeNull();
  });

  it('uses live per-passenger award pricing for the matching program only', () => {
    const liveAward = {
      program_id: 'delta_skymiles',
      miles_per_passenger: 45000,
      taxes_usd_per_passenger: 5.6,
      date: '2026-07-15',
      source: 'seats.aero',
    };
    const report = computeAwardAffordability(1380, balances, DEFAULT_LOYALTY_PROGRAMS, { liveAward, passengers: 3 });

    const delta = report.find(r => r.program_name === 'Delta SkyMiles');
    expect(delta.pricing_source).toBe('seats.aero');
    expect(delta.miles_needed).toBe(135000); // 45k × 3 travelers
    expect(delta.can_afford).toBe(true);
    expect(delta.taxes_usd).toBeCloseTo(16.8);
    expect(delta.award_date).toBe('2026-07-15');
    // Per-member: primary account covers it, spouse alone does not
    expect(delta.member_breakdown.find(m => m.member_label === 'Your Account').can_afford).toBe(true);
    expect(delta.member_breakdown.find(m => m.member_label === 'Spouse').can_afford).toBe(false);

    const amex = report.find(r => r.program_name === 'Amex Membership Rewards');
    expect(amex.pricing_source).toBe('estimate');
  });
});

describe('extractAwardPricing', () => {
  it('extracts the requested cabin from a seats.aero result', () => {
    const pricing = extractAwardPricing({
      source: 'seats.aero',
      found: true,
      cheapest: { date: '2026-07-01', cabin: 'economy', miles: 18500, taxes_usd: 5.6 },
      results: [
        { date: '2026-07-01', cabin: 'economy', miles: 18500, taxes_usd: 5.6 },
        { date: '2026-07-02', cabin: 'business', miles: 52000, taxes_usd: 5.6 },
      ],
    });

    expect(pricing.program_id).toBe('delta_skymiles');
    expect(pricing.miles_per_passenger).toBe(18500);
    expect(pricing.date).toBe('2026-07-01');
    expect(pricing.source).toBe('seats.aero');
  });

  it('extracts the economy range from a gemini/demo result', () => {
    const pricing = extractAwardPricing({
      source: 'demo',
      found: true,
      results: [
        { cabin: 'economy', miles_low: 8000, miles_high: 25000, typical_taxes_usd: 5.6 },
        { cabin: 'business', miles_low: 25000, miles_high: 70000, typical_taxes_usd: 5.6 },
      ],
    });

    expect(pricing.miles_per_passenger).toBe(8000);
    expect(pricing.miles_high_per_passenger).toBe(25000);
    expect(pricing.source).toBe('demo');
  });

  it('returns null when nothing was found', () => {
    expect(extractAwardPricing({ found: false, results: [] })).toBeNull();
    expect(extractAwardPricing(null)).toBeNull();
  });
});
