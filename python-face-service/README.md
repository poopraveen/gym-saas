# Python Face Recognition Service (Fallback)

If the built-in face-api.js recognition still shows false positives (unenrolled people matching wrong members), deploy this Python microservice for higher accuracy.

## Why Python?

- **face_recognition** (dlib-based): Industry-standard, very accurate, low false positive rate
- **DeepFace** (TensorFlow): Alternative with multiple backends (VGG-Face, ArcFace, etc.)

## Quick Start (face_recognition)

**Windows:** `face_recognition` depends on `dlib`, which needs **CMake** to build. Install CMake from [cmake.org](https://cmake.org/download/) and add it to your PATH, then:

```bash
cd python-face-service
pip install -r requirements.txt
pip install face_recognition
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Alternative (no Python needed):** Leave `FACE_SERVICE_URL` empty in the backend `.env`. The app will use the built-in flow (face-api.js in the browser) for face enrollment and check-in—no `face_recognition` or Python required.

**Linux / macOS:**

```bash
cd python-face-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Run Python locally + backend locally (testing)

You can run the Python service on your machine and point your **local** NestJS backend to it:

1. **Terminal 1 – Python (this service)**  
   ```bash
   cd python-face-service
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
   Leave this running (e.g. http://localhost:8000).

2. **Terminal 2 – NestJS backend**  
   In the **project root** (not python-face-service), create or edit `.env`:
   ```env
   FACE_SERVICE_URL=http://localhost:8000
   MONGODB_URI=...   # your DB
   ```
   Then:
   ```bash
   npm run start:dev
   ```

3. **Terminal 3 – Frontend (optional)**  
   ```bash
   cd client && npm run dev
   ```
   Open the app, go to Check-in → use face check-in or face enrollment. Face recognition will use your **local** Python service.

## Run Python on server, backend locally (testing against deployed Python)

Deploy the Python service to Render/Railway and use it from your **local** backend:

1. Deploy `python-face-service` to Render (or similar) and note the URL, e.g. `https://gym-face.onrender.com`.

2. In your **local** `.env` (project root):
   ```env
   FACE_SERVICE_URL=https://gym-face.onrender.com
   MONGODB_URI=...
   ```

3. Run backend and client locally:
   ```bash
   npm run start:dev
   # and in another terminal: cd client && npm run dev
   ```
   Face recognition will use the **server** Python; everything else runs locally.

**Production:** Run both NestJS and Python on the server. Set `FACE_SERVICE_URL` to your deployed Python URL in the NestJS service env (e.g. on Render).

## API

### POST /match

Match a face descriptor against enrolled members.

```json
// Request
{
  "descriptor": [0.1, -0.2, ...],  // 128-d from face-api.js (or 128-d from face_recognition)
  "enrolled": [
    { "regNo": 1029, "name": "Vicky T", "descriptor": [...] },
    { "regNo": 1030, "name": "John Doe", "descriptor": [...] }
  ]
}

// Response (match found)
{ "regNo": 1029, "name": "Vicky T" }

// Response (no match)
{ "match": false }
```

### POST /encode-image

Encode an image to 128-d descriptor (for enrollment if using Python end-to-end).

```bash
curl -X POST -F "image=@face.jpg" http://localhost:8000/encode-image
```

## Deployment (Render / Railway / Fly.io)

1. Add `Dockerfile` (see below)
2. Set `PORT` env var
3. Point your NestJS backend to this service via `FACE_SERVICE_URL` when configured

## Integration with NestJS Backend

Add optional env `FACE_SERVICE_URL`. When set, `findMemberByFace` calls this Python service instead of local matching. Fallback to local if Python service is down.

## Model Compatibility

**face-api.js** and **face_recognition** both produce 128-d vectors but from different models. They are **not interchangeable**. Options:

1. **Hybrid**: Keep face-api.js for capture (client). Use Python only for **matching** if you re-encode enrolled faces through Python once (call `/encode-image` for each enrolled face photo, store those descriptors). Or:
2. **Full Python**: Capture image client-side, send image to Python `/encode-image`, then `/match` — requires sending image bytes.
3. **Same model**: Use face-api.js for both (current flow). Python would need to run the same face-api.js model (possible via ONNX/TensorFlow.js in Python, but complex).

**Recommended**: Keep the refined face-api.js flow. The stricter threshold (0.38) and quality checks should fix most false positives. Deploy this Python service only if issues persist — then use option 2 (send image, Python encodes and matches).
