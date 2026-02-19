# Python Face Recognition Service (Fallback)

If the built-in face-api.js recognition still shows false positives (unenrolled people matching wrong members), deploy this Python microservice for higher accuracy.

## Why Python?

- **face_recognition** (dlib-based): Industry-standard, very accurate, low false positive rate
- **DeepFace** (TensorFlow): Alternative with multiple backends (VGG-Face, ArcFace, etc.)

## Quick Start (face_recognition)

```bash
cd python-face-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

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
