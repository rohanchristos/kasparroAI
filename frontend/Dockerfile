# ============================================================
# Kasparro AI — Frontend Dockerfile (Multi-stage)
# ============================================================

# ── Stage 1: Build ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time env vars
ARG REACT_APP_API_URL=http://localhost/api
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV ESLINT_NO_DEV_ERRORS=true
ENV DISABLE_ESLINT_PLUGIN=true

# Install dependencies first (layer caching)
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN \
    if [ -f pnpm-lock.yaml ]; then \
        corepack enable pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
        yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source and build
COPY . .

RUN \
    if [ -f pnpm-lock.yaml ]; then \
        corepack enable pnpm && pnpm run build; \
    elif [ -f yarn.lock ]; then \
        yarn build; \
    else \
        npm run build; \
    fi

# ── Stage 2: Serve with NGINX ─────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/default.conf

# Custom nginx config for SPA routing
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — serve index.html for all client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Don't cache HTML (ensure fresh deploys propagate)
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Health check
    location /health {
        access_log off;
        return 200 '{"status":"ok","service":"frontend"}';
        add_header Content-Type application/json;
    }
}
EOF

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html
# If using Vite, the output is in /app/dist — uncomment below instead:
# COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
