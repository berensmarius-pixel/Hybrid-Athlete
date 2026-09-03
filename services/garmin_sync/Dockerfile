# Multi-stage lightweight Python Dockerfile for Render / Cloud deployment
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUTF8=1
ENV PORT=8000
ENV GARMIN_TOKEN_DIR=/tmp/garmin_tokens

WORKDIR /app

# Install curl and ca-certificates for secure outbound API connections
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy microservice code
COPY . .

# Ensure token directory exists with proper permissions
RUN mkdir -p /tmp/garmin_tokens && chmod 777 /tmp/garmin_tokens

EXPOSE ${PORT}

# Run FastAPI app with uvicorn
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
