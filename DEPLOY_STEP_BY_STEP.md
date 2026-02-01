# Step-by-Step Deployment: Vercel (Frontend) + Render (Backend)

Follow these steps in order. You'll need:
- A **GitHub** account
- A **MongoDB Atlas** account (free tier)
- A **Vercel** account (free)
- A **Render** account (free)

---

## Part 1: Prepare MongoDB Atlas

### Step 1.1: Create database
1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and sign in
2. Create a cluster (free tier M0)
3. Wait for the cluster to be ready

### Step 1.2: Get connection string
1. Click **Connect** on your cluster
2. Choose **Drivers** → Node.js
3. Copy the connection string, e.g.:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with your actual database password
5. Add the database name before `?`:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/gym-saas?retryWrites=true&w=majority
   ```
6. Save this as your **MONGODB_URI**

### Step 1.3: Allow network access
1. In Atlas: **Network Access** → **Add IP Address**
2. Click **Allow Access from Anywhere** (0.0.0.0/0) for development, or add Render's IPs for production

---

## Part 2: Push code to GitHub

### Step 2.1: Create a repo
1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (e.g. `gym-saas`)
3. Do **not** add README (you already have code)

### Step 2.2: Push your code
```bash
cd c:\Users\hp\Desktop\GymOrg\gym-saas

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gym-saas.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Part 3: Deploy Backend to Render

### Step 3.1: Create Web Service
1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New** → **Web Service**  
   (Or **New** → **Blueprint** if you want to use the included `render.yaml`)
3. Connect your GitHub account if needed
4. Select your **gym-saas** repository

### Step 3.2: Configure the service

| Field | Value |
|-------|-------|
| **Name** | `gym-saas-api` (or any name) |
| **Region** | Choose closest to you |
| **Root Directory** | Leave empty (uses repo root) |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:prod` |

### Step 3.3: Add environment variables
Click **Advanced** → **Add Environment Variable**, then add:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your Atlas URI from Step 1.2 |
| `JWT_SECRET` | A long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `JWT_EXPIRES_IN` | `7d` |

### Step 3.4: Deploy
1. Click **Create Web Service**
2. Wait 3–5 minutes for the build
3. When it's live, copy the service URL, e.g. `https://gym-saas-api.onrender.com`

### Step 3.5: Test the API
- Visit `https://YOUR-RENDER-URL/api` — you should see `{"message":"..."}` or similar
- Visit `https://YOUR-RENDER-URL/api/docs` — Swagger UI should load

### Step 3.6: Seed the database
Run the seed script locally against your production DB:

```bash
cd c:\Users\hp\Desktop\GymOrg\gym-saas
set MONGODB_URI=your-atlas-uri-here
npm run seed
```

Or use a one-off script/command. This creates the default tenant and admin user.

---

## Part 4: Deploy Frontend to Vercel

### Step 4.1: Create project
1. Go to [vercel.com](https://vercel.com) and sign in (use GitHub)
2. Click **Add New** → **Project**
3. Import your **gym-saas** repository

### Step 4.2: Configure project
Vercel should detect the setup. Ensure:

| Field | Value |
|-------|-------|
| **Framework Preset** | Other (or Vite) |
| **Root Directory** | Leave as `.` |
| **Build Command** | `cd client && npm install && npm run build` |
| **Output Directory** | `client/dist` |

(The project’s `vercel.json` should already set these.)

### Step 4.3: Add environment variable
Under **Environment Variables**, add:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://YOUR-RENDER-URL/api` |

Replace `YOUR-RENDER-URL` with your Render URL from Step 3.4 (e.g. `https://gym-saas-api.onrender.com/api`).

### Step 4.4: Deploy
1. Click **Deploy**
2. Wait 2–3 minutes
3. Copy your Vercel URL, e.g. `https://gym-saas-xxx.vercel.app`

---

## Part 5: Connect frontend and backend (CORS)

### Step 5.1: Update Render env
1. In Render: your service → **Environment**
2. Add:

| Key | Value |
|-----|-------|
| `CORS_ORIGIN` | `https://gym-saas-xxx.vercel.app` |

Use your actual Vercel URL (no trailing slash).

### Step 5.2: Redeploy backend
Render will redeploy after saving. Wait for it to finish.

---

## Part 6: Test the app

1. Open your Vercel URL: `https://gym-saas-xxx.vercel.app`
2. You should see the login page
3. Default login (after seed):
   - **Tenant ID**: from seed output (the ID printed, e.g. `673a1b2c...`)
   - **Email**: `admin@repsanddips.com`
   - **Password**: `Admin123!`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Login fails | Run `npm run seed` with `MONGODB_URI` pointing to Atlas |
| CORS errors | Set `CORS_ORIGIN` in Render to your exact Vercel URL |
| API 404 | Ensure `VITE_API_URL` ends with `/api` |
| Render sleep | Free tier sleeps after 15 min; first request may take 30–60s |
| Build fails on Vercel | Check that `vercel.json` exists and `client/` has valid `package.json` |

---

## Summary of URLs

After deployment you should have:

- **Frontend**: `https://your-app.vercel.app`
- **Backend API**: `https://your-api.onrender.com/api`
- **API docs**: `https://your-api.onrender.com/api/docs`
