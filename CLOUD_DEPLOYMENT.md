# Deploy to Cloud – What to Change

When you move from **local (ngrok)** to **cloud (Render + Vercel)**, use these settings. No code changes are required; only **environment variables** and **URLs** differ.

---

## 1. Backend (Render)

Set these in **Render** → your **gym-saas-api** service → **Environment**:

| Variable | Local (dev) | Cloud (production) |
|----------|-------------|--------------------|
| `MONGODB_URI` | Your Atlas URI (same) | Same Atlas URI |
| `JWT_SECRET` | Any secret | Strong random string (32+ chars) |
| `JWT_EXPIRES_IN` | `7d` | `7d` |
| `CORS_ORIGIN` | Not needed (we allow localhost) | **Your frontend URL(s)**, e.g. `https://gymservice-eight.vercel.app` (comma-separate if multiple) |
| **`PUBLIC_API_URL`** | `https://xxxx.ngrok-free.dev` (ngrok URL) | **Your Render API URL**, e.g. `https://gym-saas-api.onrender.com` (no trailing slash) |
| `OPENAI_API_KEY` | Your key (optional) | Same (optional) |
| Cloudinary vars | Your keys (optional) | Same (optional) |

**Important:** `PUBLIC_API_URL` in production must be the **public URL of the API itself** (the Render URL). Telegram will send webhook requests to that URL. Do **not** use ngrok in production.

---

## 2. Frontend (Vercel)

Set these in **Vercel** → your project → **Settings** → **Environment Variables**:

| Variable | Local (dev) | Cloud (production) |
|----------|-------------|--------------------|
| **`VITE_API_URL`** | `http://localhost:3000/api` (in `client/.env`) | **`https://YOUR-RENDER-URL/api`**, e.g. `https://gym-saas-api.onrender.com/api` |

After changing `VITE_API_URL`, **redeploy** the frontend so the new value is baked in.

---

## 3. Summary of Differences

| Item | Local | Cloud |
|------|--------|--------|
| API URL | `http://localhost:3000` | `https://gym-saas-api.onrender.com` (your Render URL) |
| Frontend calls API via | `VITE_API_URL` = `http://localhost:3000/api` | `VITE_API_URL` = `https://gym-saas-api.onrender.com/api` |
| Telegram webhook | ngrok URL in `PUBLIC_API_URL` (e.g. `https://xxxx.ngrok-free.dev`) | Render API URL in `PUBLIC_API_URL` (e.g. `https://gym-saas-api.onrender.com`) |
| CORS | Allows localhost; no `CORS_ORIGIN` needed | Set `CORS_ORIGIN` to your Vercel (and any other) frontend URL(s) |
| Ngrok | Required for Telegram locally | **Not used** in production |

---

## 4. Checklist Before Go-Live

- [ ] **Render**: `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, **`PUBLIC_API_URL`** (Render URL) set.
- [ ] **Vercel**: **`VITE_API_URL`** = `https://YOUR-RENDER-URL/api`, then redeploy.
- [ ] **Render**: Service is live; `https://YOUR-RENDER-URL/api` returns JSON (e.g. `{"status":"ok",...}`).
- [ ] **Telegram**: In your app, open the Telegram page; the “URL currently set for Telegram” should show `https://YOUR-RENDER-URL/api/notifications/telegram-webhook/...`. If you had already set a bot token, click **Re-register webhook** so Telegram uses the production URL.

---

## 5. Optional: Same Repo, Different Env

- **Local:** Keep using `.env` with `PUBLIC_API_URL=https://xxxx.ngrok-free.dev` when testing Telegram with ngrok.
- **Cloud:** Render and Vercel use their own env vars; they never read your local `.env`. So no need to change your local `.env` when you deploy; just set the correct values in Render and Vercel.
