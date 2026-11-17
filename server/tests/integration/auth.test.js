const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');

describe('Auth Endpoints (Integration Tests)', () => {
  const testUser = {
    name: 'Alice Founder',
    email: 'alice@example.com',
    password: 'Password123!',
  };

  test('POST /api/auth/register should create a new user and return JWT token', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user).not.toHaveProperty('password');

    // Verify persisted in DB
    const dbUser = await User.findOne({ email: testUser.email });
    expect(dbUser).not.toBeNull();
    expect(dbUser.password).not.toBe(testUser.password); // Bcrypt hashed
  });

  test('POST /api/auth/register should reject duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(testUser);
    const res = await request(app).post('/api/auth/register').send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('POST /api/auth/register should reject passwords shorter than 8 characters with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...testUser, email: 'short@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });

  test('POST /api/auth/login should authenticate valid credentials and return JWT', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(testUser.email);
  });

  test('POST /api/auth/login should reject incorrect password with 401', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('GET /api/auth/me should return current user when valid JWT Bearer provided', async () => {
    const regRes = await request(app).post('/api/auth/register').send(testUser);
    const token = regRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
  });

  test('GET /api/auth/me should return 401 when token is missing or invalid', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);

    const badRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(badRes.status).toBe(401);
  });
});
