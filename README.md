# ForgeAI

Paperclip MERN autonomous AI workforce control plane.

## Development

```powershell
cd client
npm install
npm run dev
```

```powershell
cd server
npm install
npm run dev
```

Set backend and encrypted vault values from `server/.env.example`.

## Developer 4

The Developer 4 surface includes the interactive org chart, agent configuration and revision drawer, governance approvals, budget circuit-breaker banner, settings and secrets vault, data portability, and audit log.

## Deployment

- **Backend:** deploy the repository's `render.yaml` Blueprint to Render. The service root is `server/`; Render supplies `PORT`.
- **Frontend:** create a Vercel project with the root directory set to `client/`; it uses `client/vercel.json`.
- Set Vercel's `VITE_API_URL` to the Render service origin (for example, `https://your-service.onrender.com`, without a trailing slash).
- Set Render's `CLIENT_URL` to the exact Vercel site origin (for example, `https://your-site.vercel.app`, without a trailing slash).
- Set the Render secrets `MONGODB_URI`, `ENCRYPTION_KEY`, and Cloudinary credentials in the Render dashboard. Use a unique production `ENCRYPTION_KEY` containing 64 hexadecimal characters; do not reuse the development key or commit production secrets.
- Render generates `JWT_SECRET` from the Blueprint configuration.

### Day 14 health check

The backend exposes a public `GET /api/health` endpoint and Render checks it automatically. After deployment, verify `https://your-service.onrender.com/api/health` returns HTTP 200 and a JSON response with `"status":"ok"`.

To keep a deployed service warm using Cron-job.org:

1. Create a new job with the URL `https://your-service.onrender.com/api/health`.
2. Select **GET** and set the schedule to every **10 minutes**.
3. Leave authentication and request body empty; the health endpoint is public and read-only.
4. Save the job and confirm its latest run receives HTTP 200.

Do not configure the Cron job until the public Render URL is known. A health ping does not replace checking MongoDB connectivity, Vercel's `VITE_API_URL`, production CORS, or a full authenticated workflow.