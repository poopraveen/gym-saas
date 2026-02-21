# Python Face Recognition Service - deployable to Render/Railway/Fly.io
# Uses dlib for face_recognition (needs build tools and dlib compiled).

FROM python:3.10-slim-bullseye

RUN apt-get -y update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    gfortran \
    libatlas-base-dev \
    libavcodec-dev \
    libavformat-dev \
    libgtk2.0-dev \
    libjpeg-dev \
    liblapack-dev \
    libswscale-dev \
    pkg-config \
    python3-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dlib first (face_recognition depends on it)
RUN pip install --no-cache-dir numpy && \
    cd /tmp && \
    git clone -b v19.9 --single-branch https://github.com/davisking/dlib.git && \
    cd dlib && \
    python3 setup.py install && \
    cd / && rm -rf /tmp/dlib

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV PORT=8000
EXPOSE 8000
# Use shell so PORT is read at runtime (Render sets PORT)
CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}'
