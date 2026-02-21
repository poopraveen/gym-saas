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
   - **Runtime:** **Docker** (use the Dockerfile in `python-face-service`).
   - **Instance type:** Free or paid (free can spin down; first request may be slow).
5. **Environment:**
   - `PORT` is set by Render; no need to add it.
   - Optional: `FACE_MATCH_THRESHOLD=0.45`
6. **Create Web Service.** Wait for the first build (dlib compiles; can take 10–15 minutes).
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

The Python service exposes:

- `GET /health` – health check
- `POST /encode-image` – image → 128-d descriptor (enrollment)
- `POST /match` and image-based match endpoints used by the Nest backend when `FACE_SERVICE_URL` is set.
