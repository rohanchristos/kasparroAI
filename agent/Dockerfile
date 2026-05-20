# ============================================================
# Kasparro AI — Agent Dockerfile (FastAPI / Python)
# ============================================================

FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer caching)
COPY requirements.txt ./

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create non-root user for security
RUN groupadd -r kasparro && \
    useradd -r -g kasparro -d /app -s /sbin/nologin kasparro && \
    chown -R kasparro:kasparro /app

USER kasparro

EXPOSE 8000

# Run with uvicorn — workers tuned for production
CMD ["uvicorn", "src.main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--workers", "4", \
    "--loop", "uvloop", \
    "--http", "httptools", \
    "--log-level", "info", \
    "--access-log"]
