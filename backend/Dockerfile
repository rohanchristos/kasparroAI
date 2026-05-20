# ============================================================
# Kasparro AI — Backend Dockerfile (Node.js)
# ============================================================

FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Install dependencies first (layer caching)
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN \
    if [ -f pnpm-lock.yaml ]; then \
        corepack enable pnpm && pnpm install; \
    elif [ -f yarn.lock ]; then \
        yarn install; \
    elif [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Install nodemon globally for development hot-reloading
RUN npm install -g nodemon

# Copy application source
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S kasparro && \
    adduser -S kasparro -u 1001 -G kasparro && \
    chown -R kasparro:kasparro /app

USER kasparro

EXPOSE 5000

# Use nodemon in dev for hot-reload; node in production
CMD ["sh", "-c", \
    "if [ \"$NODE_ENV\" = 'production' ]; then \
        dumb-init node src/app.js; \
    else \
        nodemon --watch src --ext js,ts,json src/app.js; \
    fi"]
