const request = require('supertest');
const app = require('../../src/app');

describe('Multi-Tenant Isolation Security Verification (Day 7)', () => {
  let userA, tokenA, companyAId;
  let userB, tokenB, companyBId;

  beforeEach(async () => {
    // 1. Create Tenant A
    const resA = await request(app).post('/api/auth/register').send({
      name: 'Tenant Admin A',
      email: 'adminA@tenant-a.com',
      password: 'Password123!',
    });
    userA = resA.body.user;
    tokenA = resA.body.token;

    const compARes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Company Alpha', issuePrefix: 'ALP' });
    companyAId = compARes.body.company._id;

    // Store a secret in Company A vault
    await request(app)
      .post(`/api/companies/${companyAId}/secrets`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'ALPHA_SECRET', value: 'alpha_secret_value_1234' });

    // 2. Create Tenant B
    const resB = await request(app).post('/api/auth/register').send({
      name: 'Tenant Admin B',
      email: 'adminB@tenant-b.com',
      password: 'Password123!',
    });
    userB = resB.body.user;
    tokenB = resB.body.token;

    const compBRes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Company Beta', issuePrefix: 'BET' });
    companyBId = compBRes.body.company._id;
  });

  test('Tenant B should be denied access (403 Forbidden) when reading Tenant A company details', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Tenant B should be denied access (403 Forbidden) when reading Tenant A secrets vault', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyAId}/secrets`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Tenant B should be denied access (403 Forbidden) when writing to Tenant A secrets vault', async () => {
    const res = await request(app)
      .post(`/api/companies/${companyAId}/secrets`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ key: 'INTRUDER_KEY', value: 'intruder_value_1234' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Tenant B should be denied access (403 Forbidden) when exporting Tenant A data', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyAId}/export`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Tenant B should be denied access (403 Forbidden) when exporting Tenant A audit logs', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyAId}/audit/export`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('Tenant B should be denied access (403 Forbidden) when triggering demo seed on Tenant A', async () => {
    const res = await request(app)
      .post(`/api/companies/${companyAId}/seed-demo`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  test('GET /api/companies should only return companies where user is owner/member', async () => {
    const resA = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.companies.length).toBe(1);
    expect(resA.body.companies[0]._id.toString()).toBe(companyAId.toString());

    const resB = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.companies.length).toBe(1);
    expect(resB.body.companies[0]._id.toString()).toBe(companyBId.toString());
  });
});

