# Python Face Recognition Service - no dlib compile; use conda-forge pre-built binaries.
# Builds in ~3-5 min instead of 20+ min.

FROM continuumio/miniconda3:latest

WORKDIR /app

# Pre-built dlib + face_recognition from conda-forge (no compilation)
RUN conda install -c conda-forge -y --no-update-deps \
    python=3.10 \
    dlib \
    face_recognition \
    pillow \
    numpy \
    && conda clean -afy

# FastAPI stack via pip (lightweight)
RUN pip install --no-cache-dir \
    "fastapi>=0.100.0" \
    "uvicorn>=0.23.0" \
    "python-multipart>=0.0.6"

COPY main.py .

ENV PORT=8000
EXPOSE 8000
CMD ["/bin/bash", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
