# Architectural Decision Log

This document records the architectural decisions made during the development of the Kasparro AI Customer Support Agent. It serves as a historical record of context, tradeoffs, and reasoning.

## Decision 1: Separate Python microservice vs running agent in Node.js
**Date:** [During build]
**Status:** Decided

### Context
We needed to integrate complex AI agent logic (prompting, routing, state management) into an application that already required a fast, stable web API for a React frontend.

### Options Considered
- **Option A:** Node.js Monolith — Use LangChain.js inside the existing Express backend. Pros: Single codebase, simpler deployment. Cons: JavaScript AI ecosystem lags significantly behind Python; lacks LangGraph parity; computationally heavy tasks block the Node event loop.
- **Option B:** Python Microservice — Isolate AI logic in a FastAPI service communicating via HTTP. Pros: Access to superior Python AI libraries (LangChain/LangGraph), non-blocking web server. Cons: Requires managing two backend services.

### Decision
We chose **Option B (Python Microservice)**.

### Reasoning
The Python ecosystem is the undisputed leader for AI/ML tools. LangGraph is heavily optimized and documented for Python. Forcing complex agent logic into Node.js would have resulted in fighting the framework. Separating the concerns allows the Node.js API to remain highly responsive for the frontend while FastAPI handles the heavy computational workloads.

### Tradeoffs Accepted
Increased operational complexity by adding a second backend container and requiring intra-service HTTP communication.

### Consequences
We must maintain two sets of dependencies, separate Dockerfiles, and ensure robust error handling for network requests between Node.js and FastAPI.

---

## Decision 2: LangGraph vs vanilla LangChain agent vs custom state machine
**Date:** [During build]
**Status:** Decided

### Context
The AI agent needs to classify emails, decide routing paths, and draft responses. It must support human interruption for high-stakes tickets.

### Options Considered
- **Option A:** Vanilla LangChain Agent — Standard zero-shot agent. Pros: Quick to set up. Cons: Unpredictable, hard to test, lacks deterministic routing.
- **Option B:** Custom State Machine — Build our own python loop. Pros: Total control. Cons: Reinventing the wheel, high maintenance, lacks built-in tracing.
- **Option C:** LangGraph — Graph-based state machine. Pros: Deterministic control flows, built-in human-in-the-loop support, highly observable. Cons: Steeper learning curve.

### Decision
We chose **Option C (LangGraph)**.

### Reasoning
Customer support requires strict safety rails. A standard LangChain agent is a "black box" that might unpredictably skip steps. LangGraph forces the agent to move through a deterministic, cyclical graph, ensuring that classification always precedes routing, and auto-reply paths are completely separated from manual-review paths. 

### Tradeoffs Accepted
Increased initial development time compared to throwing prompts at a standard agent chain.

### Consequences
The agent pipeline is highly rigid but exceptionally safe. Adding new nodes (e.g., a "Quality Assurance" node) is straightforward.

---

## Decision 3: Human-in-loop for financial decisions vs full automation
**Date:** [During build]
**Status:** Decided

### Context
Customers frequently request refunds or report damaged products. The AI is capable of drafting apologies and offering resolutions.

### Options Considered
- **Option A:** Full Automation — AI executes refunds and sends emails directly. Pros: Zero human effort, instant resolution. Cons: Hallucination risk; one bad prompt could cost the business thousands of dollars.
- **Option B:** Human-in-the-Loop (HITL) — AI drafts the email and proposes an action, but a manager must click "Approve". Pros: 100% financial safety, builds trust in the system. Cons: Slower resolution time for complex tickets.

### Decision
We chose **Option B (Human-in-the-Loop)**.

### Reasoning
In e-commerce, the cost of a wrong action (offering a free replacement when policy denies it) far outweighs the cost of a delayed email. By utilizing HITL for sensitive categories, we position the AI as a highly competent assistant rather than an unmonitored proxy.

### Tradeoffs Accepted
We sacrifice the metric of "100% automated resolution" in exchange for brand safety and legal compliance.

### Consequences
The dashboard UX had to be designed explicitly around a rapid review-and-approve workflow to minimize the friction of this manual step.

---

## Decision 4: Grok as default LLM vs OpenAI vs Claude
**Date:** [During build]
**Status:** Decided

### Context
We needed a reliable Large Language Model for reasoning, classification, and generation.

### Options Considered
- **Option A:** OpenAI (GPT-4o) — Pros: Industry standard, excellent reasoning. Cons: Paid only, limits accessibility for users wanting to self-host for free.
- **Option B:** Claude (Sonnet 3.5) — Pros: Excellent tone for customer support. Cons: Different API structure, paid only.
- **Option C:** Grok — Pros: Free tier available, OpenAI-compatible API structure, highly fast. Cons: Slightly less nuanced reasoning on complex edge cases.

### Decision
We chose **Option C (Grok)** as the default, with an architecture that allows switching to **OpenAI** or others.

### Reasoning
Grok provides an incredibly fast and accessible entry point for the tool due to its free tier. Because its API mirrors OpenAI's, we were able to build an abstraction layer that treats Grok as the default while allowing users to dynamically switch to OpenAI or other providers via OpenRouter if they demand higher reasoning quality and are willing to pay.

### Tradeoffs Accepted
Grok's baseline models may occasionally require manager editing on complex emotional tickets compared to GPT-4o.

### Consequences
We must maintain a unified provider registry in the backend and ensure all prompts are model-agnostic.

---

## Decision 5: Gmail polling (pull) vs Gmail Push Notifications (webhooks)
**Date:** [During build]
**Status:** Decided

### Context
The system needs to fetch new customer emails from a support inbox.

### Options Considered
- **Option A:** Gmail Push Notifications (Pub/Sub Webhooks) — Pros: Instant ticket creation. Cons: Requires setting up Google Cloud Pub/Sub, verifying domain ownership, and exposing a public webhook endpoint.
- **Option B:** Periodic Polling (Pull) — A background task queries the API every 60 seconds. Pros: Extremely simple to set up locally and in production, requires no public IPs. Cons: Up to 60 seconds of latency on ticket creation.

### Decision
We chose **Option B (Periodic Polling)**.

### Reasoning
The complexity of configuring GCP Pub/Sub and public webhooks creates a massive barrier to entry for self-hosting. In asynchronous customer support via email, a 60-second delay is entirely imperceptible to the end customer. The simplicity of a chron-based pull mechanism vastly outweighs the benefit of sub-second ingestion.

### Tradeoffs Accepted
A built-in maximum latency of 60 seconds between an email hitting the inbox and appearing on the dashboard.

### Consequences
Requires a dedicated background thread in the Python service and strict database constraints to prevent duplicate processing if a polling cycle overlaps.

---

## Decision 6: Redis for caching + session vs in-memory vs database only
**Date:** [During build]
**Status:** Decided

### Context
The application needs to store temporary session states, manage JWT blacklists, and serve dashboard analytics rapidly.

### Options Considered
- **Option A:** In-memory (Node.js Maps) — Pros: Zero setup. Cons: Doesn't scale horizontally, state lost on container restart.
- **Option B:** Database Only (PostgreSQL) — Pros: Single source of truth. Cons: Analytics queries are heavy, querying the DB on every single auth check causes severe bottlenecking.
- **Option C:** Redis — Pros: Sub-millisecond reads, native TTL support, scales independently. Cons: Adds an infrastructural dependency.

### Decision
We chose **Option C (Redis)**.

### Reasoning
Redis is perfectly suited for managing token blacklists and caching heavy aggregated analytics. By caching the ticket list and analytics for 60-300 seconds, we offload massive amounts of read pressure from PostgreSQL, keeping the primary database optimized for write-heavy audit logging and ticket ingestion.

### Tradeoffs Accepted
Increased memory footprint and infrastructural complexity by running a separate Redis container.

### Consequences
Cache invalidation logic must be meticulously managed in the Node.js controllers whenever a ticket's state changes.

---

## Decision 7: PostgreSQL vs MongoDB for ticket storage
**Date:** [During build]
**Status:** Decided

### Context
We needed a persistent storage layer for tickets, users, and audit logs.

### Options Considered
- **Option A:** MongoDB (NoSQL) — Pros: Flexible schema, easy to dump raw JSON emails. Cons: Poor at relational joins (e.g., matching tickets to assigned users), lacks strict schema enforcement.
- **Option B:** PostgreSQL (Relational) — Pros: Strict data integrity, foreign key constraints, ACID compliance, native JSONB support. Cons: Requires schema migrations.

### Decision
We chose **Option B (PostgreSQL)**.

### Reasoning
Customer support software is inherently relational: users own tickets, tickets generate audit logs, and actions require rigid status tracking. PostgreSQL's strict enum types ensure that AI hallucinations cannot inject invalid categories or statuses into the database. Furthermore, PostgreSQL's JSONB columns give us the flexibility of NoSQL for storing raw LLM payloads without sacrificing relational integrity.

### Tradeoffs Accepted
Database schema changes require rigid SQL migration scripts rather than flexible code-level updates.

### Consequences
Requires a structured initialization script (`001_initial_schema.sql`) and strict typing on the backend.

---

## Decision 8: JWT blacklist via Redis vs short expiry tokens only
**Date:** [During build]
**Status:** Decided

### Context
We needed a secure authentication mechanism for the React dashboard.

### Options Considered
- **Option A:** Short-lived JWTs (15 mins) + Refresh Tokens — Pros: Secure, stateless. Cons: Complex frontend implementation, requires constant background refreshing.
- **Option B:** Long-lived JWTs (24 hours) with Redis Blacklist — Pros: Simpler frontend logic, allows immediate server-side revocation on logout. Cons: Requires stateful check on every request.

### Decision
We chose **Option B (Long-lived JWTs with Redis Blacklist)**.

### Reasoning
Customer Satisfaction Managers often keep their dashboard open for full 8-hour shifts. Constant refresh token rotation introduces unnecessary points of failure for this specific use case. By using a 24-hour token and checking it against a Redis blacklist on every request, we achieve the UX benefit of long sessions with the security benefit of instantaneous logout revocation, at the low cost of a 1ms Redis read.

### Tradeoffs Accepted
Authentication is no longer purely stateless, as the backend must verify the token is not in the Redis blacklist.

### Consequences
Requires a highly available Redis instance to ensure API requests do not fail due to auth-check timeouts.

---

## Decision 9: Auto-resolve scope decision (what qualifies for auto-resolve)
**Date:** [During build]
**Status:** Decided

### Context
The AI must decide which tickets to reply to automatically and which to send to a human.

### Options Considered
- **Option A:** Auto-resolve everything based purely on an AI Confidence Score > 90%.
- **Option B:** Auto-resolve restricted strictly by predefined Categories (FAQ, Tracking) regardless of confidence.

### Decision
We chose **Option B (Category-based restriction)**.

### Reasoning
AI confidence scores are notoriously unreliable (hallucinations are often generated with high confidence). A model might confidently offer a refund against policy. By restricting auto-resolution strictly to informational categories (FAQ, policy, tracking), we eliminate the risk of automated financial loss or brand damage, leaving sensitive interactions strictly to humans.

### Tradeoffs Accepted
We intentionally lower our potential automation rate to maintain absolute safety.

### Consequences
The LangGraph classifier node must be highly accurate at categorizing emails, as this category dictates the entire routing logic.

---

## Decision 10: Docker Compose vs Kubernetes for this stage
**Date:** [During build]
**Status:** Decided

### Context
We needed to orchestrate 6 services (React, Node.js, FastAPI, Postgres, Redis, NGINX).

### Options Considered
- **Option A:** Kubernetes — Pros: Highly scalable, self-healing. Cons: Massive operational overhead, overkill for MVP.
- **Option B:** Docker Compose — Pros: Single file definition, simple local development, easily deployable to a single VPS. Cons: Lacks advanced multi-node scaling.

### Decision
We chose **Option B (Docker Compose)**.

### Reasoning
For the current stage of the project, speed of deployment and ease of local setup for other developers are paramount. Docker Compose allows a developer to spin up the entire microservice architecture with a single command (`docker compose up`). Kubernetes would introduce unnecessary friction that does not map to current scaling requirements.

### Tradeoffs Accepted
We cannot scale individual services across multiple physical nodes out-of-the-box.

### Consequences
Deployment is limited to single-host environments (e.g., AWS EC2, DigitalOcean Droplet) until a migration to Kubernetes is warranted.

---

## Decision 11: Per-user LLM preference vs system-wide setting
**Date:** [During build]
**Status:** Decided

### Context
Different LLM providers (Grok, OpenAI) have different costs and speeds. We needed to decide how this is configured.

### Options Considered
- **Option A:** System-wide setting via `.env` variable.
- **Option B:** Per-user setting stored in the database.

### Decision
We chose **Option B (Per-user setting)**.

### Reasoning
In a team environment, a senior manager dealing with complex complaints might need the deep reasoning of GPT-4o, while a junior agent handling generic queries might only need the free, fast Grok model. Allowing LLM preferences to be set at the user level (saved to DB, cached in Redis, passed via headers) provides ultimate cost-control flexibility for the business.

### Tradeoffs Accepted
Increased backend complexity to pass user preferences through the Node.js API to the FastAPI service via HTTP headers.

### Consequences
The agent service must dynamically instantiate the correct LangChain `ChatModel` on a per-request basis rather than keeping a single model loaded in memory.

---

## Decision 12: Tailwind CSS vs component library (MUI/Chakra) for dashboard
**Date:** [During build]
**Status:** Decided

### Context
We needed to build a responsive, professional React dashboard quickly.

### Options Considered
- **Option A:** Component Library (Material UI / Chakra UI) — Pros: Pre-built accessible components. Cons: Hard to override styles, generic look, bloated bundle size.
- **Option B:** Tailwind CSS — Pros: Rapid styling, completely custom design system, zero runtime overhead. Cons: Requires writing components from scratch.

### Decision
We chose **Option B (Tailwind CSS)**.

### Reasoning
We required a highly bespoke layout for the ticket review interface (side-by-side original email vs AI draft) that standard component libraries struggle to support cleanly without heavy CSS overrides. Tailwind allowed us to rapidly build a custom, dense information layout tailored specifically for Customer Satisfaction Managers while keeping the frontend bundle extremely small.

### Tradeoffs Accepted
We had to build our own modal, dropdown, and alert components from scratch rather than importing them.

### Consequences
The resulting UI is highly unique and performant, but adding new complex UI patterns requires more manual DOM structuring.
