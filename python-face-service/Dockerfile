# Python Face Recognition Service - deployable to Render/Railway/Fly.io
# Use Python 3.10 so pip can install pre-built dlib wheels (no 15+ min compile).

FROM python:3.10-slim-bookworm

WORKDIR /app
COPY requirements.txt .
# Pre-built dlib wheels exist for Linux x86_64 + Python 3.10; avoids building from source
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}'
