const request = require('supertest');
const app = require('../../src/app');
const Agent = require('../../src/models/Agent');
const Goal = require('../../src/models/Goal');
const Issue = require('../../src/models/Issue');
const Company = require('../../src/models/Company');

describe('Companies & Demo Seeder Endpoints (Integration Tests)', () => {
  let userToken;
  let companyId;

  beforeEach(async () => {
    const userRes = await request(app).post('/api/auth/register').send({
      name: 'Startup Founder',
      email: 'founder@paperclip.dev',
      password: 'Password123!',
    });
    userToken = userRes.body.token;

    const compRes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Acme AI Startup',
        description: 'Building autonomous agents',
        issuePrefix: 'ACM',
      });
    companyId = compRes.body.company._id;
  });

  test('POST /api/companies/:cid/seed-demo should seed 4 agents, 2 goals, and 3 starter issues', async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/seed-demo`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('agents');
    expect(res.body).toHaveProperty('goals');
    expect(res.body).toHaveProperty('issues');

    expect(res.body.agents.length).toBe(4);
    expect(res.body.goals.length).toBe(2);
    expect(res.body.issues.length).toBe(3);

    // Verify Org Chart Hierarchy: CEO -> CTO & Marketer, CTO -> Senior Engineer
    const ceo = res.body.agents.find((a) => a.role === 'CEO');
    const cto = res.body.agents.find((a) => a.role === 'CTO');
    const eng = res.body.agents.find((a) => a.role === 'Senior Engineer');
    const mkt = res.body.agents.find((a) => a.role === 'Growth Marketer');

    expect(ceo.reportsTo).toBeNull();
    expect(cto.reportsTo.toString()).toBe(ceo._id.toString());
    expect(mkt.reportsTo.toString()).toBe(ceo._id.toString());
    expect(eng.reportsTo.toString()).toBe(cto._id.toString());

    // Verify Atomic Issue Numbering: ACM-1, ACM-2, ACM-3
    const issueKeys = res.body.issues.map((i) => i.issueKey);
    expect(issueKeys).toEqual(['ACM-1', 'ACM-2', 'ACM-3']);

    // Verify Acceptance Criteria checklists
    expect(res.body.issues[0].acceptanceCriteria.length).toBeGreaterThan(0);

    // Verify Company issueCounter was updated to 3
    const compDoc = await Company.findById(companyId);
    expect(compDoc.issueCounter).toBe(3);
  });

  test('GET /api/companies/:cid/export should export company JSON and scrub secrets', async () => {
    // Seed demo first
    await request(app)
      .post(`/api/companies/${companyId}/seed-demo`)
      .set('Authorization', `Bearer ${userToken}`);

    // Store a vault secret
    await request(app)
      .post(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: 'PRIVATE_API_KEY', value: 'secret_to_scrub_9999' });

    const res = await request(app)
      .get(`/api/companies/${companyId}/export`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty('company');
    expect(res.body).toHaveProperty('agents');
    expect(res.body).toHaveProperty('goals');
    expect(res.body).toHaveProperty('issues');

    // Verify secret scrubbing
    const rawExportString = JSON.stringify(res.body);
    expect(rawExportString).not.toContain('secret_to_scrub_9999');
  });

  test('POST /api/companies/import should restore company from export JSON', async () => {
    // First seed demo and export
    await request(app)
      .post(`/api/companies/${companyId}/seed-demo`)
      .set('Authorization', `Bearer ${userToken}`);

    const exportRes = await request(app)
      .get(`/api/companies/${companyId}/export`)
      .set('Authorization', `Bearer ${userToken}`);

    const exportPayload = exportRes.body;

    // Now import into new company
    const importRes = await request(app)
      .post('/api/companies/import')
      .set('Authorization', `Bearer ${userToken}`)
      .send(exportPayload);

    expect(importRes.status).toBe(201);
    expect(importRes.body).toHaveProperty('company');
    expect(importRes.body.counts.agents).toBe(4);
    expect(importRes.body.counts.goals).toBe(2);
    expect(importRes.body.counts.issues).toBe(3);

    const newCompanyId = importRes.body.company._id;
    const newAgents = await Agent.find({ companyId: newCompanyId });
    expect(newAgents.length).toBe(4);
  });

  test('GET /api/companies/:cid/audit/export should return RFC-4180 CSV with valid headers', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyId}/audit/export`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/i);
    expect(res.text).toContain('Timestamp,ActorType,ActorName,Action,EntityType,EntityId,Details,IP');
  });
});

