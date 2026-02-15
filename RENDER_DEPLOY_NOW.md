# Deploy Backend to Render - Quick Reference

The Render dashboard should have opened. Follow these steps:

---

## Option A: Blueprint (uses render.yaml)

1. Go to **https://dashboard.render.com**
2. Click **New** → **Blueprint**
3. Connect **GitHub** if not already connected
4. Select repository: **poopraveen/gym-saas**
5. Render will detect `render.yaml` and create the service
6. **Add environment variables** (click each to add):
   - **MONGODB_URI** – Your MongoDB Atlas URI (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/gym-saas?retryWrites=true&w=majority`)
   - **CORS_ORIGIN** – Your frontend URL, e.g. `https://gymservice-eight.vercel.app` (comma-separate if multiple)
   - **PUBLIC_API_URL** – Your **Render API URL**, e.g. `https://gym-saas-api.onrender.com` (required for Telegram webhooks; use your actual Render service URL)
   - JWT_SECRET and JWT_EXPIRES_IN are auto-set by the blueprint
7. Click **Apply**

---

## Option B: Web Service (manual)

1. Go to **https://dashboard.render.com**
2. Click **New** → **Web Service**
3. Connect **poopraveen/gym-saas** repository
4. Configure:

| Field | Value |
|-------|-------|
| **Name** | `gym-saas-api` |
| **Region** | Oregon (US West) or closest |
| **Branch** | `main` |
| **Root Directory** | *(leave empty)* |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:prod` |

5. **Environment Variables** – Add:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | Random 32+ character string |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | Your frontend URL, e.g. `https://gymservice-eight.vercel.app` |
| `PUBLIC_API_URL` | Your Render API URL, e.g. `https://gym-saas-api.onrender.com` (required for Telegram webhooks) |

6. Click **Create Web Service**

---

## After Deploy

- Your API URL will be like: `https://gym-saas-api.onrender.com`
- Test: `https://gym-saas-api.onrender.com/api/docs`
- **PUBLIC_API_URL**: In Render env vars, set this to that same URL (e.g. `https://gym-saas-api.onrender.com`) so Telegram webhook registration works. No ngrok in production.
- **Update Vercel**: Add `VITE_API_URL` = `https://YOUR-RENDER-URL/api` in Vercel env vars, then redeploy frontend
- **Seed DB**: Run `MONGODB_URI=your-atlas-uri npm run seed` locally to create tenant and admin
