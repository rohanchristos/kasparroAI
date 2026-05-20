# Kasparro AI — Customer Support Agent

> AI-powered customer support platform that automatically analyzes, categorizes, and responds to customer emails using LangGraph agents with switchable LLM providers (Grok / OpenAI).

---

## Architecture

```
                        ┌─────────────────┐
                        │   Browser :80   │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   NGINX :80     │
                        │  Reverse Proxy  │
                        └───┬────┬────┬───┘
                            │    │    │
              ┌─────────────┘    │    └──────────────┐
              │                  │                   │
     ┌────────▼────────┐ ┌──────▼───────┐  ┌───────▼────────┐
     │  React :3000    │ │ Node.js :5000│  │ FastAPI :8000  │
     │  Dashboard UI   │ │ REST API     │  │ AI Agent       │
     │  • Tickets      │ │ • Auth/JWT   │  │ • LangGraph    │
     │  • Analytics    │ │ • Tickets    │  │ • Gmail        │
     │  • Settings     │ │ • Audit      │  │ • Email Poller │
     │  • Audit Log    │ │ • Analytics  │  │ • LLM Service  │
     └────────────────┘  └──┬───────┬──┘  └───┬──────┬─────┘
                            │       │         │      │
                   ┌────────▼──┐ ┌──▼────┐    │   ┌──▼──────────┐
                   │PostgreSQL │ │ Redis │    │   │ Gmail API   │
                   │  :5432    │ │ :6379 │    │   └─────────────┘
                   └───────────┘ └───────┘    │
                                        ┌─────▼──────────┐
                                        │  Grok / OpenAI │
                                        │  LLM APIs      │
                                        └────────────────┘
```

### Services (6 containers)

| Service    | Port | Technology                    | Purpose                             |
|------------|------|-------------------------------|-------------------------------------|
| `nginx`    | 80   | NGINX                         | Reverse proxy, SSL, gzip, caching   |
| `react`    | 3000 | React 18 + Tailwind           | Manager dashboard UI                |
| `nodejs`   | 5000 | Express + PostgreSQL          | REST API, auth, tickets, audit      |
| `fastapi`  | 8000 | FastAPI + LangGraph           | AI agent, Gmail, email poller       |
| `postgres` | 5432 | PostgreSQL 16                 | Tickets, users, audit logs          |
| `redis`    | 6379 | Redis 7                       | Session cache, LLM prefs, analytics |

---

## Prerequisites

- **Docker Desktop** ≥ 24.0 (with Docker Compose v2)
- **Gmail account** with OAuth2 credentials
- **Grok API key** (free at [console.x.ai](https://console.x.ai))
- **OpenAI API key** *(optional, for provider switching)*

---

## Quick Start

### 1. Clone & Configure

```bash
git clone <repo-url> kasparoAi
cd kasparoAi
cp .env.example .env
```

### 2. Set Environment Variables

Edit `.env` and fill in all required values (see [Environment Variables](#environment-variables) below).

### 3. Start All Services

```bash
# Development
docker-compose up --build -d

# Production (with resource limits + log rotation)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

### 4. Verify

```bash
# Check all 6 services are running
docker-compose ps

# Check health
curl http://localhost/health
curl http://localhost/api/audit/health
```

### 5. Login

Open `http://localhost` in your browser.

**Default credentials:**
```
Email:    admin@kasparro.com
Password: admin123
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=kasparro
DB_USER=kasparro_user
DB_PASSWORD=<strong-password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

# JWT
JWT_SECRET=<random-64-char-string>
JWT_EXPIRES_IN=24h

# FastAPI Agent
AGENT_API_URL=http://fastapi:8000
```

### Agent (`agent/.env`)

```env
# Server
ENVIRONMENT=development
PORT=8000

# Grok (xAI)
XAI_API_KEY=<your-grok-api-key>
XAI_MODEL=grok-3-mini-fast

# OpenAI (optional)
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-4o-mini

# Gmail OAuth2
GMAIL_CLIENT_ID=<oauth-client-id>
GMAIL_CLIENT_SECRET=<oauth-client-secret>
GMAIL_REFRESH_TOKEN=<oauth-refresh-token>
GMAIL_USER_EMAIL=support@yourcompany.com

# Backend API (for poller callbacks)
BACKEND_API_URL=http://nodejs:5000
BACKEND_API_KEY=<internal-api-key>

# Email Polling
EMAIL_POLL_INTERVAL=60
```

---

## Gmail OAuth2 Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project → "Kasparro AI"
3. Enable **Gmail API** in APIs & Services

### Step 2: Create OAuth2 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: `https://developers.google.com/oauthplayground`
5. Copy **Client ID** and **Client Secret**

### Step 3: Get Refresh Token

1. Go to [OAuth Playground](https://developers.google.com/oauthplayground)
2. Click ⚙️ Settings → Check **"Use your own OAuth credentials"**
3. Enter your Client ID and Secret
4. In Step 1, select **Gmail API v1** → select all scopes
5. Click **Authorize APIs** → Sign in with your support email
6. Click **Exchange authorization code for tokens**
7. Copy the **Refresh Token**

### Step 4: Configure

```env
GMAIL_CLIENT_ID=123456789.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxx
GMAIL_REFRESH_TOKEN=1//xxxxxxxxx
GMAIL_USER_EMAIL=support@yourcompany.com
```

---

## Grok API Setup

1. Go to [console.x.ai](https://console.x.ai)
2. Sign up / Sign in
3. Create an API key
4. Add to `agent/.env`:

```env
XAI_API_KEY=xai-xxxxxxxxx
XAI_MODEL=grok-3-mini-fast
```

> **Note:** Grok offers free API credits for new accounts.

---

## OpenAI API Setup (Optional)

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Add to `agent/.env`:

```env
OPENAI_API_KEY=sk-xxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

> Managers can switch between Grok and OpenAI from the dashboard Settings page.

---

## Testing with Mock Emails

If you don't have Gmail connected yet, you can test the full flow using the API:

```bash
# 1. Login to get JWT token
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kasparro.com","password":"admin123"}' \
  | jq -r '.token')

# 2. Send a test email for processing
curl -X POST http://localhost/api/email/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_email": "customer@example.com",
    "from_name": "John Doe",
    "subject": "Refund Request - Order #12345",
    "body": "Hi, I ordered a laptop last week but it arrived damaged. I would like a full refund. Order number is #12345. Please help ASAP."
  }'

# 3. Check the dashboard — a new ticket should appear!
```

---

## API Documentation

### Authentication

| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| POST   | `/api/auth/login`           | Login (returns JWT)      |
| POST   | `/api/auth/logout`          | Logout                   |
| GET    | `/api/auth/me`              | Get current user         |
| PATCH  | `/api/auth/llm-preference`  | Switch LLM provider      |

### Tickets

| Method | Endpoint                          | Description                    |
|--------|-----------------------------------|--------------------------------|
| GET    | `/api/tickets`                    | List tickets (filtered, paged) |
| GET    | `/api/tickets/:id`                | Get single ticket              |
| PATCH  | `/api/tickets/:id/approve`        | Approve + send email           |
| PATCH  | `/api/tickets/:id/reject`         | Reject with reason             |
| PATCH  | `/api/tickets/:id/regenerate`     | Regenerate AI draft            |
| GET    | `/api/tickets/analytics/summary`  | Full analytics summary         |

### Audit

| Method | Endpoint            | Description                |
|--------|---------------------|----------------------------|
| GET    | `/api/audit`        | Paginated audit logs       |
| GET    | `/api/audit/export` | Export to CSV              |
| GET    | `/api/audit/health` | Service health check       |

### AI Agent (FastAPI)

| Method | Endpoint               | Description                |
|--------|------------------------|----------------------------|
| POST   | `/api/agent/chat`      | Analyze email              |
| POST   | `/api/agent/regenerate`| Regenerate draft           |
| GET    | `/api/agent/providers` | List LLM providers         |
| POST   | `/api/email/send`      | Send email via Gmail       |
| POST   | `/api/email/test`      | Inject test email          |

---

## Dashboard Pages

| Page         | Route        | Features                                              |
|-------------|-------------|-------------------------------------------------------|
| **Login**    | `/login`     | Email/password auth, JWT, Kasparro branding           |
| **Dashboard**| `/dashboard` | KPI cards, AI performance, 7-day trend                |
| **Tickets**  | `/tickets`   | Filter/search, approve/edit/reject/regenerate, modals |
| **Analytics**| `/analytics` | Area chart, donut, sentiment bars, LLM usage          |
| **Audit Log**| `/audit`     | Action table, date filters, CSV export                |
| **Settings** | `/settings`  | LLM switch, dark mode, password, health panel         |

---

## Project Structure

```
kasparoAi/
├── docker-compose.yml          # Development orchestration
├── docker-compose.prod.yml     # Production overrides
├── .env.example                # Environment template
├── README.md
│
├── nginx/
│   └── nginx.conf              # Reverse proxy + gzip + caching
│
├── frontend/                   # React 18 + Tailwind CSS
│   ├── src/
│   │   ├── context/            # AuthContext (JWT + user state)
│   │   ├── hooks/              # useTickets, useAnalytics, useAuditLogs, useDarkMode, useLLMProvider
│   │   ├── components/         # Sidebar, Navbar, TicketCard, Modals, DashboardLayout
│   │   ├── pages/              # Login, Dashboard, Tickets, Analytics, Audit, Settings
│   │   └── services/           # Axios instance with interceptors
│   └── Dockerfile
│
├── backend/                    # Node.js + Express
│   ├── src/
│   │   ├── controllers/        # auth, tickets, audit
│   │   ├── services/           # auth, tickets, redis, agent
│   │   ├── middleware/         # JWT, rate limiter, error handler
│   │   ├── routes/             # auth, tickets, audit
│   │   └── db/                 # SQL schema + seed
│   └── Dockerfile
│
└── agent/                      # FastAPI + LangGraph
    ├── src/
    │   ├── agent/              # state, graph, nodes, tools
    │   ├── routers/            # agent, email
    │   └── services/           # llm, gmail, email_poller, agent
    └── Dockerfile
```

---

## License

MIT © RohanTechLabs
