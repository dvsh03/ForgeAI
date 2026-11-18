const request = require('supertest');
const app = require('../../src/app');
const CompanySecret = require('../../src/models/CompanySecret');

describe('Secrets Vault Endpoints (Integration Tests)', () => {
  let userToken;
  let companyId;

  beforeEach(async () => {
    // Register user
    const userRes = await request(app).post('/api/auth/register').send({
      name: 'Vault Tester',
      email: 'vault@example.com',
      password: 'Password123!',
    });
    userToken = userRes.body.token;

    // Create company
    const compRes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Vault Corp',
        issuePrefix: 'VLT',
      });
    companyId = compRes.body.company._id;
  });

  test('POST /api/companies/:cid/secrets should store encrypted secret and return ONLY masked preview', async () => {
    const rawApiKey = 'gsk_super_secret_groq_production_key_99999999';

    const res = await request(app)
      .post(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        key: 'GROQ_API_KEY',
        value: rawApiKey,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('secret');
    expect(res.body.secret.key).toBe('GROQ_API_KEY');
    expect(res.body.secret.maskedPreview).toMatch(/^gsk_••••9999$/);

    // CRITICAL SECURITY ASSERTION: Raw plaintext API key MUST NEVER appear in response body!
    expect(JSON.stringify(res.body)).not.toContain(rawApiKey);
    expect(res.body.secret).not.toHaveProperty('encryptedValue');
    expect(res.body.secret).not.toHaveProperty('iv');
    expect(res.body.secret).not.toHaveProperty('authTag');

    // Verify stored in DB with encryption
    const secretInDb = await CompanySecret.findOne({ companyId, key: 'GROQ_API_KEY' }).select(
      '+encryptedValue +iv +authTag'
    );
    expect(secretInDb).not.toBeNull();
    expect(secretInDb.encryptedValue).not.toBe(rawApiKey);
    expect(secretInDb.iv).toBeDefined();
    expect(secretInDb.authTag).toBeDefined();
  });

  test('GET /api/companies/:cid/secrets should list masked secrets with zero encrypted leaks', async () => {
    await request(app)
      .post(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        key: 'GEMINI_API_KEY',
        value: 'AIzaSy_fake_gemini_token_abcdef12345678',
      });

    const res = await request(app)
      .get(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.secrets.length).toBe(1);
    expect(res.body.secrets[0].key).toBe('GEMINI_API_KEY');
    expect(res.body.secrets[0].maskedPreview).toBe('AIza••••5678');
    expect(res.body.secrets[0]).not.toHaveProperty('encryptedValue');
    expect(res.body.secrets[0]).not.toHaveProperty('iv');
    expect(res.body.secrets[0]).not.toHaveProperty('authTag');
  });

  test('DELETE /api/companies/:cid/secrets/:key should remove secret from vault', async () => {
    await request(app)
      .post(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        key: 'OBSOLETE_KEY',
        value: 'some_val_123456',
      });

    const delRes = await request(app)
      .delete(`/api/companies/${companyId}/secrets/OBSOLETE_KEY`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(delRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/companies/${companyId}/secrets`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(listRes.body.secrets.length).toBe(0);
  });
});

