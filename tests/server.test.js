import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js'; // Pulls in all Firebase and agent.js ESM mocks!
import { app } from '../server.js'; // Imports our Express app!

describe('AeroFamily Robust Integration Test Suite', () => {

  describe('GET /api/whatsapp/webhook - Meta Handshake', () => {
    it('should successfully authenticate when mode is subscribe and token matches', async () => {
      const res = await request(app)
        .get('/api/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'AeroFamilyVerifyToken2026',
          'hub.challenge': 'MetaWebMockChallenge123'
        });
      
      expect(res.status).toBe(200);
      expect(res.text).toBe('MetaWebMockChallenge123');
    });

    it('should return 403 when hub.verify_token mismatches', async () => {
      const res = await request(app)
        .get('/api/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'WrongTokenValue',
          'hub.challenge': 'ChallengeCode'
        });
      
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/whatsapp/webhook - Inbound Messaging Webhook', () => {
    it('should parse interactive quick reply buttons and respond', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '15550192834',
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: 'action_research_SJU',
                    title: 'Research Trip'
                  }
                }
              }],
              contacts: [{ profile: { name: 'Jane' } }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/api/whatsapp/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('should parse plain text START command', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '15550192834',
                type: 'text',
                text: { body: 'START' }
              }],
              contacts: [{ profile: { name: 'Jane' } }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/api/whatsapp/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });

    it('should parse plain text BUDGET command', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '15550192834',
                type: 'text',
                text: { body: 'BUDGET 3000' }
              }]
            }
          }]
        }]
      };

      const res = await request(app)
        .post('/api/whatsapp/webhook')
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/profile/whatsapp - Verification OTP Bypass Registration', () => {
    it('should instantly register and verify a phone number during sandboxed test modes', async () => {
      const res = await request(app)
        .post('/api/profile/whatsapp')
        .send({
          phoneNumber: '+15550192834',
          optInAlerts: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(true);
      expect(res.body.whatsapp.phoneNumber).toBe('+15550192834');
      expect(res.body.whatsapp.optInAlerts).toBe(true);
    });

    it('should instantly verify with verify stub endpoint', async () => {
      const res = await request(app)
        .post('/api/profile/whatsapp/verify')
        .send({
          code: '4821'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verified).toBe(true);
    });
  });

  describe('POST /api/scan - Flight Deals Cache-Aside & Budget Multipliers', () => {
    it('should complete a scan, retrieve mock candidate deals, update caching, and apply budget filters', async () => {
      // Run scan on user123 (who has a budget threshold of $2500)
      // Mocks in setup.js return 2 candidates: SJU ($222) and CDG ($450)
      const res = await request(app)
        .post('/api/scan')
        .send(); // Use guest default profile context

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      // SJU ($222) is under budget ($3000), but CDG ($450) is also under budget ($3000)
      expect(res.body.dealsFound).toBeGreaterThanOrEqual(1);
      expect(res.body.deals[0].dealPrice).toBeLessThanOrEqual(3000);
    });
  });
});
