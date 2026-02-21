# Python Face Recognition Service - deployable to Render/Railway/Fly.io
# Use full bookworm image + runtime libs so dlib wheel works; avoid building from source.

FROM python:3.10-bookworm

# Runtime libs often required by dlib/face_recognition wheels (manylinux)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Upgrade pip/wheel so pip prefers binary wheels; then install
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}'
