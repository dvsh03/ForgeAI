# Render & MongoDB Atlas Deployment Guide (Free-Tier $0 Budget)

This guide documents the production deployment procedure for the **Paperclip MERN Backend** (`server/`) to **Render Free Web Services** connected to a **MongoDB Atlas M0 Free Tier** cluster.

---

## 1. Prerequisites (All Free-Tier, No Credit Card Required)

1. **MongoDB Atlas Account**: Free Shared M0 Cluster (512 MB storage, 500 max connections).
2. **Render Account**: Free Web Service (512 MB RAM, 750 free instance hours/month).
3. **Cloudinary Account**: Free plan (25 credits/month for media uploads).
4. **Cron-job.org Account**: Free HTTP monitor (pings `/api/health` every 10 minutes to prevent Render free-tier cold starts).

---

## 2. Environment Variables Configuration

In the Render Dashboard (`Dashboard > Web Service > Environment`), configure the following environment variables:

| Variable | Recommended / Required Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode, disables stack traces in error responses |
| `PORT` | `10000` | Port automatically assigned or used by Render |
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/paperclip?retryWrites=true&w=majority` | Connection string to MongoDB Atlas M0 cluster |
| `JWT_SECRET` | *(Random 64-char string)* | Symmetric key for signing JWT tokens |
| `JWT_EXPIRES_IN` | `7d` | Session expiration window |
| `ENCRYPTION_KEY` | *(Random 32-byte / 64-hex string)* | AES-256-GCM symmetric encryption key for the Secrets Vault |
| `CLIENT_URL` | `https://your-frontend.vercel.app` | Allowed CORS origin for the React Vite frontend |
| `CLOUDINARY_CLOUD_NAME` | `your-cloud-name` | Cloudinary account cloud name |
| `CLOUDINARY_API_KEY` | `your-api-key` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | `your-api-secret` | Cloudinary API secret for generating upload signatures |

> **Security Notice**: Generate a secure 64-hex `ENCRYPTION_KEY` using Node.js:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 3. Render Service Configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: paperclip-backend
    env: node
    plan: free
    rootDir: server
    buildCommand: npm install --omit=dev
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

---

## 4. Cold-Start Mitigation (Cron-job.org)

Render Free web services spin down after 15 minutes of inactivity. To keep the AI Control Plane responsive:
1. Create a free account at [cron-job.org](https://cron-job.org).
2. Add a new cron job targeting: `https://<your-render-subdomain>.onrender.com/api/health`.
3. Set the schedule to **Every 10 minutes** during working hours.
4. Response verification: Expect HTTP `200 OK`.

---

## 5. Pre-Deployment Verification Checklist

- [x] All 14 Mongoose models have TTL indexes and microcent integer fields.
- [x] Multi-tenant isolation verified (Company A cannot view or mutate Company B).
- [x] Secrets Vault strictly encrypts via AES-256-GCM with zero plaintext leaks.
- [x] Cloudinary signed upload endpoint is operational.
- [x] JSON Company Export automatically scrubs all secret keys.
- [x] Audit log captures all mutating operations with RFC-4180 CSV export.
