"""
Face recognition microservice - fallback for higher accuracy.
Uses face_recognition (dlib) - industry standard, lower false positive rate.

Deploy separately (Render, Railway, etc.). When FACE_SERVICE_URL is set,
NestJS can proxy face matches here instead of in-process face-api.js matching.

API: POST /match-image
Body: multipart/form-data with "image" file
Query: enrolled_json = JSON array of {regNo, name, descriptor} (128-d from face_recognition)
"""

import json
import os
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# face_recognition imported lazily in routes so /health works without dlib installed

app = FastAPI(title="Gym Face Recognition Service")


@app.exception_handler(Exception)
async def json_exception_handler(request, exc):
    """Ensure every error response is JSON so the Nest backend can parse it."""
    return JSONResponse(
        status_code=500,
        content={"error": str(exc) if str(exc) else "Internal server error"},
    )

# Stricter threshold = fewer false positives (dlib default is 0.6)
MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.45"))


class EnrolledMember(BaseModel):
    regNo: int
    name: str
    descriptor: list[float]


class MatchResult(BaseModel):
    regNo: int
    name: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/encode-image")
async def encode_image(image: UploadFile = File(...)):
    """Encode a face image to 128-d descriptor. For enrollment. Always returns JSON."""
    try:
        import face_recognition
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Face recognition library not available: {e}. Install with: pip install face_recognition"})
    try:
        data = await image.read()
        import io
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        arr = np.array(img)
        encodings = face_recognition.face_encodings(arr)
        if not encodings:
            return {"error": "No face found in image"}
        return {"descriptor": encodings[0].tolist()}
    except Exception as e:
        msg = str(e) if str(e) else "Failed to process image"
        return JSONResponse(status_code=200, content={"error": msg})


@app.post("/match")
async def match(
    descriptor: str = Form(..., description="JSON array of 128 numbers"),
    enrolled: str = Form(..., description="JSON array of {regNo, name, descriptor}"),
):
    """
    Match a 128-d descriptor against enrolled members.
    Uses face_recognition.face_distance (euclidean). Returns best match if within threshold.
    """
    import face_recognition
    import numpy as np
    try:
        desc = json.loads(descriptor)
        members = json.loads(enrolled)
    except json.JSONDecodeError as e:
        return {"error": str(e)}

    if len(desc) != 128:
        return {"error": "Descriptor must be 128-d"}

    query = np.array(desc, dtype=np.float64)
    best: Optional[MatchResult] = None
    best_dist = float("inf")

    for m in members:
        if not isinstance(m, dict) or "descriptor" not in m:
            continue
        enc = np.array(m["descriptor"], dtype=np.float64)
        if len(enc) != 128:
            continue
        dist = float(face_recognition.face_distance([enc], query)[0])
        if dist < MATCH_THRESHOLD and dist < best_dist:
            best_dist = dist
            best = MatchResult(regNo=int(m.get("regNo", 0)), name=str(m.get("name", "")))

    if best:
        return best
    return {"match": False}


@app.post("/match-image")
async def match_image(
    image: UploadFile = File(...),
    enrolled: str = Form(...),
):
    """
    Encode image, then match against enrolled. Single call for client sending image.
    """
    import face_recognition
    data = await image.read()
    import io
    import numpy as np
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    arr = np.array(img)
    encodings = face_recognition.face_encodings(arr)
    if not encodings:
        return {"error": "No face found"}

    return await match(
        descriptor=json.dumps(encodings[0].tolist()),
        enrolled=enrolled,
    )
