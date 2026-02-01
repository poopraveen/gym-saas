# Vercel Deployment Guide

This app has **two parts**: a **React frontend** (Vite) and a **NestJS backend**. Vercel hosts static sites and serverless functions, but **NestJS is a long-running server** and cannot run on Vercel.

**Recommended setup:**
- **Frontend** → Deploy to **Vercel**
- **Backend** → Deploy to **Railway**, **Render**, or **Fly.io**

---

## 1. Backend Deployment (Railway / Render / Fly.io)

Deploy the NestJS API first so you have an API URL for the frontend.

### Environment variables (backend)

Set these on your backend hosting platform:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas URI, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/gym-saas?retryWrites=true&w=majority` |
| `JWT_SECRET` | Yes | Strong secret for JWT signing (e.g. 32+ random chars) |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `PORT` | No | Usually set automatically (e.g. 3000) |
| `CORS_ORIGIN` | No | Comma-separated allowed origins (e.g. `https://yourapp.vercel.app`) |
| `MONGO_URI` | No | Optional; for Atlas Members migration |

### CORS configuration

The backend uses `enableCors()`. For production, restrict origins. Update `src/main.ts`:

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
});
```

### Build & start (backend)

```bash
npm run build
npm run start:prod
```

### Hosting options

- **Railway**: Connect repo, set env vars, deploy.
- **Render**: Web Service, Node, build `npm install && npm run build`, start `npm run start:prod`.
- **Fly.io**: Use `fly launch` and configure `Dockerfile` or Node buildpack.

---

## 2. Frontend Deployment (Vercel)

### Changes needed

#### A. Add `vercel.json` in project root

Create `vercel.json` in the **gym-saas** folder (or in `client` if you deploy only the client):

```json
{
  "buildCommand": "cd client && npm install && npm run build",
  "outputDirectory": "client/dist",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

If deploying from the `client` folder only:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### B. Set environment variable in Vercel

In Vercel → Project → Settings → Environment Variables:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_API_URL` | `https://your-backend-url.com/api` | Production, Preview |

Replace `your-backend-url.com` with your deployed backend URL (e.g. `yourapp.onrender.com`, `yourapp.up.railway.app`).

#### C. Update `client/src/api/client.ts` (if needed)

Current code already uses:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api';
```

So as long as `VITE_API_URL` is set in Vercel, no code change is needed.

---

## 3. Pre-deployment Checklist

### Backend
- [ ] MongoDB Atlas cluster created and URI obtained
- [ ] Atlas IP whitelist allows `0.0.0.0/0` (or your host’s IP)
- [ ] `MONGODB_URI` set in backend env
- [ ] `JWT_SECRET` set (strong, random)
- [ ] Backend deployed and reachable (test `/api` or `/api/docs`)
- [ ] CORS allows your Vercel domain

### Frontend
- [ ] `vercel.json` created
- [ ] `VITE_API_URL` set in Vercel to backend API URL
- [ ] `client/dist` built and tested locally with backend URL

### Database
- [ ] Run seed script: `npm run seed` (against production DB, or use a migration)
- [ ] Tenant and admin user created for login

---

## 4. Deploy Steps (summary)

### Backend (e.g. Railway)
1. Push code to GitHub
2. Create new project on Railway, connect repo
3. Set root directory to project root (or backend)
4. Set env vars: `MONGODB_URI`, `JWT_SECRET`, etc.
5. Deploy and copy the public URL

### Frontend (Vercel)
1. Install Vercel CLI: `npm i -g vercel`
2. In project: `vercel` (or connect via vercel.com)
3. Set `VITE_API_URL` = `https://YOUR-BACKEND-URL/api`
4. Deploy

### Test
- Open Vercel URL
- Log in (or create tenant/user via seed)
- Verify API calls work (e.g. member list, finance)

---

## 5. Root `vercel.json` (monorepo style)

If your repo root is `gym-saas` and you want Vercel to build the client:

```json
{
  "buildCommand": "cd client && npm ci && npm run build",
  "outputDirectory": "client/dist",
  "installCommand": "cd client && npm ci",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 6. Optional: API proxy (same domain)

To avoid CORS and keep the API on the same domain, you can add Vercel rewrites so `/api` is proxied to your backend. Example:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-backend.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Then set `VITE_API_URL` to `""` or `/api` so the frontend calls the same origin.
