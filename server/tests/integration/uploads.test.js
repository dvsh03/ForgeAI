const request = require('supertest');
const app = require('../../src/app');

describe('Uploads Signed URL Endpoint (Integration Tests)', () => {
  let userToken;

  beforeEach(async () => {
    const userRes = await request(app).post('/api/auth/register').send({
      name: 'Media Uploader',
      email: 'media@paperclip.dev',
      password: 'Password123!',
    });
    userToken = userRes.body.token;
  });

  test('POST /api/uploads/sign should return signature, timestamp, apiKey, and cloudName', async () => {
    const res = await request(app)
      .post('/api/uploads/sign')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ folder: 'issue_attachments' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('signature');
    expect(res.body).toHaveProperty('folder', 'issue_attachments');
    expect(res.body).toHaveProperty('cloudName');
    expect(res.body).toHaveProperty('apiKey');
  });

  test('POST /api/uploads/sign should reject unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/uploads/sign').send({});
    expect(res.status).toBe(401);
  });
});
