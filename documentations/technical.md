# Technical Document: Kasparro AI Customer Support Agent

## 1. System Architecture Overview

The Kasparro AI Customer Support Agent is a microservices-based application built for scalability, separation of concerns, and optimized AI workloads. It consists of six core services working in tandem to ingest, analyze, route, and manage customer support emails.

*   **React Frontend:** The user-facing dashboard for Customer Satisfaction Managers to review tickets, analytics, and settings.
*   **NGINX (Reverse Proxy):** The single entry point that routes traffic between the frontend static assets and backend API services.
*   **Node.js Backend:** The primary web server handling authentication, ticket CRUD operations, caching logic, and frontend API requests.
*   **FastAPI Agent Server:** A dedicated Python microservice handling computationally heavy AI operations using LangGraph.
*   **PostgreSQL Database:** The primary persistent data store for users, tickets, and audit logs.
*   **Redis Cache:** An in-memory data store used for session management, JWT blacklisting, and query caching.

**Architecture Diagram:**

```text
[React Dashboard]
       ↓ HTTPS
    [NGINX]
   ↙        ↘
[Node.js]  [FastAPI]
JWT+Redis   LangGraph
   ↘        ↙
  [PostgreSQL]
  [Redis Cache]
       ↑
 [Gmail API] → EmailPoller → Agent → Auto/Human routing
```

---

## 2. Service Breakdown

### 2a. NGINX (Reverse Proxy)
*   **Role & Routing:** NGINX acts as the gateway for the application. It routes `/api/agent/*` traffic to the FastAPI service, `/api/*` traffic to the Node.js backend, and serves the static React build files for all other routes.
*   **Why NGINX:** It provides high performance, handles SSL termination (in production environments), and ensures a single entry point for the application, mitigating CORS issues between the frontend and the multiple backend services.

### 2b. React Frontend
*   **Component Architecture:** Built with React 18 and styled using Tailwind CSS for a modern, responsive UI. Components are modularized (e.g., `TicketCard`, `Sidebar`, `ApproveModal`) for reusability.
*   **State Management:** Utilizes React Context combined with custom hooks (`useTickets`, `useAuth`, `useLLMProvider`) to manage global state. 
*   **Real-time Polling Strategy:** Instead of complex WebSockets, the frontend implements a lightweight 30-second polling interval for fetching new tickets, ensuring the dashboard remains fresh without overwhelming the backend.
*   **Why no Redux:** Redux introduces unnecessary boilerplate for this scope. React Context is entirely sufficient for managing authentication state and caching simple data structures like user preferences.

### 2c. Node.js Backend
*   **Role:** Built with Express.js, this service handles user authentication, acts as the primary API for the frontend, manages the PostgreSQL database connections, and orchestrates calls to the FastAPI agent.
*   **JWT Implementation:** Issues JWTs on login, verifies them via middleware on protected routes, and blacklists tokens upon logout by storing them in Redis.
*   **Redis Caching Strategy:** Caches high-frequency read queries like the analytics summary and the ticket list. Cache TTLs range from 60 seconds (tickets) to 5 minutes (analytics summary), with targeted invalidation when a ticket's status changes.
*   **Why Node.js:** Node.js offers extremely fast asynchronous I/O and a massive npm ecosystem, making it ideal for the web API layer. However, its single-threaded nature makes it less appropriate for the heavy synchronous workloads often required by AI SDKs.

### 2d. FastAPI Agent Server
*   **Why a Separate Python Service:** Python is the native language for the AI/ML ecosystem. Using FastAPI allows us to seamlessly integrate LangChain and LangGraph without fighting language barriers, maintaining a clean separation of concerns from the CRUD web layer.
*   **API Endpoints:** Exposes endpoints like `/api/agent/analyze` (for processing incoming emails) and `/api/agent/regenerate` (for drafting new replies based on manager feedback).
*   **Async Architecture:** Runs on the Uvicorn ASGI server, allowing for highly concurrent, asynchronous handling of multiple LLM API calls simultaneously.

### 2e. LangGraph Agent
*   **State Machine Explanation:** The core of the AI intelligence is a LangGraph state machine. It passes a shared `AgentState` object through a defined graph of nodes, modifying the state at each step.
*   **Nodes:** 
    *   `classify_email`: Extracts category, urgency, and sentiment.
    *   `route_decision`: Decides between auto-resolve and human review based on the category.
    *   `draft_auto_reply`: Generates a response intended for immediate sending.
    *   `draft_human_review`: Generates a draft that requires approval.
    *   `quality_check`: (Optional/Future) Audits the draft against policy constraints.
*   **Edge Routing Logic:** Conditional edges evaluate the output of `route_decision` to direct the flow down either the automated or manual path.
*   **Why LangGraph:** It provides a stateful, observable, and highly controllable framework for agentic workflows, natively supporting cyclical graphs and human-in-the-loop interruption mechanisms which are critical for our safety constraints.

### 2f. PostgreSQL
*   **Schema Overview:** Consists of 6 core tables: `users`, `tickets`, `audit_logs`, `analytics_daily`, etc.
*   **Key Design Decisions:**
    *   **UUID Primary Keys:** Used universally for security and to prevent enumeration attacks.
    *   **JSONB Columns:** Utilized for storing raw LLM responses and flexible metadata without needing schema migrations.
    *   **`audit_action` Enum:** Strict database-level enums (e.g., `'created'`, `'ai_drafted'`, `'regenerated'`) ensure data integrity and prevent bad inserts.
*   **Indexing Strategy:** B-tree indexes on high-frequency lookup columns like `ticket_id`, `status`, and `created_at` optimize the frontend polling queries.

### 2g. Redis
*   **What is Cached:** User sessions, active ticket lists, dashboard analytics summaries, and user LLM provider preferences.
*   **TTL Strategy:** Short TTLs for dynamic data (60s for tickets) and longer TTLs for static/semi-static data (1 hour for user preferences).
*   **JWT Blacklist:** When a user logs out, their JWT is added to a Redis set with a TTL matching the token's remaining expiration time. The auth middleware checks this set before authorizing requests.

---

## 3. LLM Provider Strategy

*   **Provider Switching End-to-End:** Users can select their preferred LLM via the React Settings page. This preference is saved in PostgreSQL, cached in Redis, and passed as an `X-LLM-Provider` header from the Node.js backend to the FastAPI agent on every request.
*   **LangChain Abstraction:** LangChain's unified `ChatModel` interface abstracts away the underlying provider API differences.
*   **Grok:** Acts as the high-speed, free-tier option. Because Grok offers an OpenAI-compatible API, it is implemented simply by swapping the `base_url` in the LangChain OpenAI wrapper.
*   **OpenAI:** Utilizes the GPT-4o model for complex reasoning and higher quality drafts when the user demands premium outputs.

---

## 4. Email Processing Pipeline

*   **Gmail OAuth2 Flow:** The system authenticates with the Gmail API using a pre-configured Client ID, Client Secret, and a long-lived Refresh Token to operate autonomously in the background.
*   **EmailPoller Loop:** A background service in the Python agent wakes up every 60 seconds to fetch unread emails matching specific criteria.
*   **Duplicate Prevention:** Every processed email's `gmail_message_id` is checked against the database to prevent double-processing.
*   **Auto-Resolve Path:** If categorized as FAQ or tracking, the agent generates a draft, the system instantly uses the Gmail API to reply to the sender, and the ticket is marked as `auto_resolved`.
*   **Human-in-Loop Path:** If categorized as a refund or complaint, the draft is saved to the database, and the ticket is marked as `pending` to appear on the manager's dashboard.
*   **Error Handling:** Features a maximum of 3 retries with exponential backoff for transient API failures.

---

## 5. Security Implementation

*   **JWT Authentication:** Tokens are signed with a strong secret, expire in 24 hours, and are actively blacklisted in Redis upon user logout.
*   **Input Validation:** The Node.js backend uses `express-validator` to strictly type-check and sanitize all incoming request bodies and parameters.
*   **SQL Injection Prevention:** The `pg` library is used exclusively with parameterized queries; raw SQL concatenation is strictly prohibited.
*   **Rate Limiting:** Implemented via `slowapi` in FastAPI and custom middleware in Node.js (100 requests/15min globally, 10 requests/15min for auth routes) to prevent abuse.
*   **NGINX Proxy:** Configured to hide server version tokens (`server_tokens off;`) and securely proxy headers.
*   **Business Logic Security:** The architecture strictly dictates that no financial operations or sensitive replies can occur without an explicit human approval trigger from the authenticated dashboard.
*   **Environment Variables:** Secrets are never hardcoded. A `.env.example` file is provided to safely share configuration structure.

---

## 6. Failure Handling

*   **Gmail API Down:** The `EmailPoller` logs the error, leaves the emails marked as unread, and retries on the next 60-second polling cycle.
*   **LLM API Timeout:** If Grok or OpenAI times out, the ticket is created with a fallback state (e.g., "AI processing failed") and remains in the `pending` queue for manual manager intervention.
*   **Email Send Failure:** If the final approval fails to send the email, the transaction is rolled back. The ticket status is NOT updated to `sent`, and a clear error is shown to the manager.
*   **Node.js Crash:** Docker's restart policy (`restart: always`) will revive the container. During downtime, NGINX will gracefully return a 502 Bad Gateway.
*   **FastAPI Crash:** The Node.js backend catches the connection refusal and returns a standardized "AI agent service unavailable" error to the frontend.
*   **PostgreSQL Down:** Redis continues to serve cached analytics and ticket lists where possible, masking momentary DB blips.
*   **Redis Down:** The backend catches Redis connection errors and gracefully falls through directly to the PostgreSQL database for all queries.

---

## 7. Known Limitations

*   **Pull-Based Ingestion:** Gmail processing relies on a 60-second polling loop rather than instant Webhook pushes, introducing a slight delay in ticket creation.
*   **Language Support:** The NLP classification and prompt engineering are currently optimized and tested exclusively for English.
*   **Stateless Agent:** The LangGraph agent analyzes each email in isolation; it does not currently maintain conversation history across multiple replies in a long thread.
*   **Polling-Based UI:** The React dashboard refreshes via interval polling rather than real-time WebSockets.
*   **Single Inbox:** The architecture currently supports authenticating and monitoring a single Gmail support inbox per deployment.
*   **LLM Variability:** Even with a low temperature setting (0.3), LLM outputs are inherently non-deterministic and phrasing may vary between regenerations.

---

## 8. Performance Considerations

*   **Caching Efficiency:** Redis heavily reduces the load on PostgreSQL, particularly for the analytics dashboard which aggregates data across thousands of rows.
*   **Agent Latency:** The LangGraph pipeline operates efficiently, averaging 3 to 8 seconds of processing time per email depending on the chosen LLM provider.
*   **Frontend Optimization:** NGINX is configured to use gzip compression for all served React static assets, ensuring fast initial load times.
*   **Pagination:** The `/api/tickets` endpoint enforces strict pagination (default 10 items per page) to ensure query speed regardless of database size.
*   **Database Efficiency:** Analytics queries utilize Common Table Expressions (CTEs) for highly optimized data aggregation.

---

## 9. Local Development Setup

### Prerequisites
*   Docker & Docker Compose installed
*   Node.js (v18+) & npm
*   Python 3.11+
*   A Google Cloud Project with Gmail API enabled
*   API keys for Grok and/or OpenAI

### Quickstart Steps
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/rohanchristos/kasparro-AI-.git
    cd kasparro-AI-
    ```
2.  **Configure Environment Variables:**
    Copy the example file and populate your keys:
    ```bash
    cp .env.example .env
    ```
    *Ensure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` are populated.*
3.  **Start the Infrastructure:**
    Use Docker Compose to build and start all six services simultaneously:
    ```bash
    docker compose up --build -d
    ```
4.  **Verify Services:**
    Navigate to `http://localhost/api/audit/health` to confirm Postgres, Redis, Node, and FastAPI are connected and healthy.
5.  **Access the Dashboard:**
    Open `http://localhost` in your browser. Log in with the default seeded admin credentials to begin processing tickets.
