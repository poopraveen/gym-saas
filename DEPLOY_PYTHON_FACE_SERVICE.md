# Deploy Python Face Service (Before Main App) – What to Follow

You only need to deploy the Python face service **if** you want server-side face recognition (higher accuracy, fewer false positives). If you’re fine with the built-in browser face-api.js flow, **skip this** and leave `FACE_SERVICE_URL` empty when you deploy the main app.

---

## Option 1: Don’t Use Python (Simplest)

- In your **NestJS backend** env (e.g. on Render), **do not set** `FACE_SERVICE_URL` (or leave it empty).
- Deploy only the main app (backend + frontend) as you normally do.
- Face enrollment and check-in will use **face-api.js in the browser** – no Python service to deploy.

---

## Option 2: Deploy Python Face Service First, Then Main App

If you want the Python face service (e.g. for better accuracy), deploy it **before** (or at the same time as) the main app, then point the backend to it.

### Step 1: Deploy the Python service (e.g. on Render)

1. **Open Render:** [dashboard.render.com](https://dashboard.render.com)
2. **New → Web Service**
3. **Connect** your GitHub repo (`gym-saas`).
4. **Configure:**
   - **Name:** e.g. `gym-face-service`
   - **Region:** Same as your API (e.g. Oregon).
   - **Branch:** `main`
   - **Root Directory:** `python-face-service`  ← important
   - **Runtime:** **Docker** ← required (so the Dockerfile’s Python 3.10 and pre-built dlib wheels are used; native Python can trigger a long dlib compile and timeout).
   - **Instance type:** Free or paid (free can spin down; first request may be slow).
5. **Environment:**
   - `PORT` is set by Render; no need to add it.
   - Optional: `FACE_MATCH_THRESHOLD=0.45`
6. **Create Web Service.** First build usually finishes in a few minutes (no dlib compile).
7. **Note the URL**, e.g. `https://gym-face-service.onrender.com`.  
   Test: `https://gym-face-service.onrender.com/health` → `{"status":"ok"}`.

### Step 2: Point the main backend at the Python service

1. In the **NestJS backend** service on Render (e.g. `gym-saas-api`):
   - **Environment** → Add variable:
   - **Key:** `FACE_SERVICE_URL`
   - **Value:** `https://gym-face-service.onrender.com` (your Python service URL, no trailing slash)
2. **Save** and let the backend redeploy (or trigger a manual deploy).

### Step 3: Deploy your main app changes

- Deploy the rest of your app as usual (backend + frontend).
- Backend already has `FACE_SERVICE_URL` set, so face enrollment and face check-in will use the Python service when the client sends an image.

---

## Summary

| Goal | What to do |
|------|------------|
| No Python, use browser-only face | Don’t set `FACE_SERVICE_URL`. Deploy only main app. |
| Use Python face service | 1) Deploy `python-face-service` (Docker, root dir `python-face-service`). 2) Set `FACE_SERVICE_URL` on the Nest backend. 3) Deploy main app. |

---

## Deploying Python service elsewhere (Railway / Fly.io)

- **Railway:** New project → add service from repo, set **Root Directory** to `python-face-service`, use Docker.
- **Fly.io:** From repo root, `fly launch`; then set root to `python-face-service` or run from `python-face-service` with a Dockerfile build. Set `PORT` / expose port as per Fly’s docs.

**If the build failed with “Building wheel for dlib (pyproject.toml)…”**  
You were likely using **Runtime: Python** (no Docker). That compiles dlib from source and often times out. Render often doesn’t let you change runtime on an existing service. **Create a new Web Service** with the settings below (Docker + Root Directory), then you can delete the old one. If you already use **Docker** and get `pip install` exit code 1: in Render **Settings** set **Dockerfile Path** to `Dockerfile.source-build` and redeploy (builds dlib from source, ~15–20 min).

---

## Create a new project (to fix runtime)

Use this when the old service was created with the wrong runtime and you want a fresh one.

1. Go to **[dashboard.render.com](https://dashboard.render.com)**.
2. Click **New +** → **Web Service**.
3. **Connect repository:** choose GitHub and select **gym-saas**. Click **Connect**.
4. **Configure:**

   | Field | Value |
   |-------|--------|
   | **Name** | `gym-face-service` (or any name) |
   | **Region** | Same as your API, e.g. **Oregon (US West)** |
   | **Branch** | `main` |
   | **Root Directory** | `python-face-service` ← type exactly |
   | **Runtime** | **Docker** ← must be Docker, not Python |
   | **Instance Type** | Free or Starter |

5. Leave **Build Command** and **Start Command** empty (Dockerfile handles them).
6. **Environment:** optional – add `FACE_MATCH_THRESHOLD` = `0.45`. Do not set `PORT`.
7. Click **Create Web Service**. Wait for the first build (about 2–5 minutes).
8. Copy the service URL (e.g. `https://gym-face-service.onrender.com`). Test: `https://YOUR-URL/health` → `{"status":"ok"}`.
9. In your **main backend** (gym-saas-api), add **`FACE_SERVICE_URL`** = `https://YOUR-URL` (no trailing slash), then redeploy the backend.

You can delete the old failed service from the dashboard if you want.

---

The Python service exposes:

- `GET /health` – health check
- `POST /encode-image` – image → 128-d descriptor (enrollment)
- `POST /match` and image-based match endpoints used by the Nest backend when `FACE_SERVICE_URL` is set.
