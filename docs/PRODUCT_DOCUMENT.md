# Product Document: Kasparro AI Customer Support Agent

## 1. Executive Summary

The **Kasparro AI Customer Support Agent** is an intelligent, dual-path automation platform built for Customer Satisfaction Managers at e-commerce brands. In an era where consumers expect immediate responses, support teams are frequently bottlenecked by repetitive inquiries. Kasparro solves this by ingesting incoming customer emails, passing them through a LangGraph-powered AI agent, and categorizing them by intent, sentiment, and urgency. 

The core value proposition lies in its intelligent routing: low-risk, informational queries (like FAQ and tracking updates) are automatically resolved and replied to instantly. High-stakes tickets (like refunds, damaged goods, or complaints) are drafted by the AI but routed to a Human-in-the-Loop manager dashboard for final approval. This hybrid approach allows brands to drastically reduce average resolution times and lower support costs at scale without sacrificing customer trust or financial safety.

---

## 2. Problem Statement

Modern e-commerce brands face a growing crisis in customer support scale and quality:
* **Overwhelmed Support Teams**: Peak shopping seasons result in unmanageable ticket backlogs.
* **Slow Response Times**: Customers demanding immediate tracking updates or policy clarifications are left waiting hours or days, leading to frustration and lost retention.
* **Inconsistent Reply Quality**: Human agents typing hundreds of responses a day inevitably suffer from fatigue, leading to typos, missed context, or inconsistent tone.
* **Wasted Human Capital**: Managers and experienced agents spend the majority of their time answering simple, repetitive questions instead of focusing on complex relationship-saving interactions.
* **Cost of Scaling**: Hiring more human support agents scales linearly with revenue, creating a heavy operational cost burden that hurts margins.

---

## 3. Target User

### Primary User
**Customer Satisfaction Manager at an e-commerce brand.**
* **Pain Points**: Constantly fighting fires, managing stressed support agents, dealing with angry customers whose basic issues were ignored too long, and struggling to report actionable metrics to leadership.
* **Goals**: Lower average resolution time (ART), increase customer satisfaction (CSAT) scores, maintain high quality assurance on outgoing emails, and reduce overall support operations cost.

### Secondary Users
**Support Team Leads & Small Business Owners.**
* **Pain Points**: Cannot afford a massive 24/7 support team, fear of automation giving wrong answers and costing money (e.g., offering unapproved refunds).
* **Goals**: Safely automate the easy 60% of tickets, handle the hard 40% efficiently, and maintain a premium brand voice.

---

## 4. Solution Overview

The Kasparro AI Customer Support Agent operates as a seamless layer between the customer's inbox and the brand's support team. 

**How It Works (Step-by-Step):**
1. **Ingestion**: An incoming customer email is fetched automatically.
2. **Analysis**: The LangGraph AI pipeline reads the email, extracts context, and assigns a Category, Sentiment, and Urgency score.
3. **Routing Decision**:
   - **Auto-Resolve Path**: If the ticket is categorized as low-risk (e.g., tracking info, policy question, FAQ), the AI drafts a perfect response and sends it immediately to the customer without human intervention.
   - **Human-in-the-Loop Path**: If the ticket involves money, damaged products, or high-urgency complaints, the AI drafts a proposed response and routes it to the Manager Dashboard.
4. **Manager Action**: The manager logs into the dashboard, reviews the pending ticket, and can click "Approve" (sends instantly), edit the text, or click "Regenerate" for a new draft.

**Why This Split Makes Sense**: 
Total automation is dangerous for e-commerce. A hallucinating AI offering a $500 refund damages the business. By splitting the flow, Kasparro provides the speed of AI where it's safe, and the judgment of a human where trust and financial safety are required.

---

## 5. Key Features

* **Intelligent Ticket Triage & Tagging**
  * *Description*: AI automatically tags every incoming ticket by Category (refund, tracking, wrong item, etc.), Sentiment (angry to positive), and Urgency.
  * *Value*: Allows managers to sort and prioritize the most critical tickets first, preventing angry customers from churning.
* **Two-Path Routing (Auto vs. Manual)**
  * *Description*: Safely auto-resolves informational tickets while queuing sensitive tickets for human review.
  * *Value*: Instantly clears up to 60% of the queue, saving massive amounts of time and keeping response times at 0 minutes for basic questions.
* **AI Draft Generation & Regeneration**
  * *Description*: Generates context-aware, empathetic email drafts. Managers can accept them with one click or regenerate them on the fly.
  * *Value*: Eliminates the "blank page" problem for support agents, turning them from writers into fast reviewers.
* **Flexible LLM Provider Switching**
  * *Description*: Users can switch the AI engine powering their agent between Grok (free tier) or OpenAI (premium tier) directly from the settings.
  * *Value*: Gives businesses control over their API costs and allows them to utilize different models based on their current budget or volume.
* **Comprehensive Analytics Dashboard**
  * *Description*: Real-time visualization of ticket volume trends, LLM usage, sentiment breakdown, and average resolution times.
  * *Value*: Provides actionable business intelligence to leadership without needing a data scientist.

---

## 6. Key Decisions & Tradeoffs

> [!NOTE]
> **Decision 1: Human-in-the-loop for money-related tickets**
> * **Tradeoff**: Slower resolution time vs. financial safety. We chose safety. In e-commerce, incorrectly promising a refund or replacement can lead to massive losses. Requiring manager approval ensures the AI acts as a smart assistant rather than a risky autonomous agent.

> [!NOTE]
> **Decision 2: Two LLM providers (Grok + OpenAI)**
> * **Tradeoff**: Cost flexibility vs. architectural complexity. We chose flexibility. By building an abstraction layer that supports both Grok (free) and OpenAI (paid), we allow startups to use the tool for free while giving enterprise clients the option to pay for top-tier reasoning models.

> [!NOTE]
> **Decision 3: Separate Python microservice for the LangGraph agent**
> * **Tradeoff**: Increased infrastructure overhead vs. correct tooling. We chose correct tooling. We built the backend in Node.js for fast API/DB operations, but isolated the AI logic into a FastAPI Python service to utilize the superior Python AI ecosystem (LangChain/LangGraph).

> [!TIP]
> **Decision 4: Auto-resolve restricted to safe categories**
> * **Tradeoff**: Lower overall automation rate vs. customer trust. We chose trust. We explicitly block the AI from auto-resolving complaints or wrong items, ensuring a human always applies empathy to negative customer experiences.

> [!IMPORTANT]
> **Decision 5: Custom PostgreSQL Enum constraints over loose strings**
> * **Tradeoff**: Slower schema updates vs. data integrity. We chose integrity. By strictly defining allowed categories, sentiments, and LLM providers at the database level, we prevent AI hallucinations from injecting garbage data into our analytics dashboard.

> [!TIP]
> **Decision 6: Polling architecture for email ingestion instead of Webhooks**
> * **Tradeoff**: Latency (up to 60s) vs. integration simplicity. We chose simplicity. A background polling worker pulling from Gmail APIs is vastly easier for users to configure (via OAuth) than setting up complex webhook endpoints and forwarding rules on their mail servers.

---

## 7. Scope (What's In & What's Out)

**IN SCOPE (What was built):**
* Automated email fetching and processing
* Complete LangGraph AI analysis pipeline (Classification, Routing, Drafting)
* React-based Manager Dashboard for ticket review and approval
* Real-time metrics and analytics tracking
* Multi-LLM provider support (Grok, OpenAI, OpenRouter)
* Full database audit trail of all actions

**OUT OF SCOPE (Current Release):**
* Slack or Microsoft Teams integration
* Phone/Voice AI support agents
* Multi-language translation support
* Direct Shopify/Stripe integration (automated refund execution)
* Deep CRM integrations (Zendesk/Salesforce sync)

---

## 8. Success Metrics

To measure if this product is successful, we track the following KPIs:

1. **Auto-Resolve Rate**: The percentage of total incoming tickets successfully handled end-to-end by the AI. (Target: > 40%)
2. **Average Resolution Time (ART)**: Time from ticket creation to final reply sent. AI auto-resolves should pull the global average down from days to minutes.
3. **Manager Time Saved**: Measured by the time difference between writing a custom email vs. reading and clicking "Approve" on an AI draft.
4. **Customer Satisfaction Score (CSAT)**: (Post-implementation tracking) Ensuring that AI replies and faster human replies result in happier customers compared to the baseline.
5. **AI Confidence Accuracy**: Comparing the AI's internal confidence score against how often managers reject or heavily edit the draft.

---

## 9. Future Roadmap

### Phase 1: Core Dashboard (Current)
* Focus on robust email ingestion, highly accurate text classification, and a fast, frictionless manager approval dashboard.

### Phase 2: Omnichannel Support (3 Months)
* Expand ingestion beyond Gmail to include WhatsApp, SMS, and Instagram DMs. 
* Implement Slack notifications for high-urgency tickets (e.g., "Angry customer requires immediate attention").

### Phase 3: Autonomous Execution & CRM Sync (6 Months)
* Connect directly to Shopify/Stripe APIs.
* Allow the AI to actually *process* refunds or *resend* tracking links autonomously (rather than just drafting the text) if the user's confidence threshold is met.
* Full two-way sync with enterprise CRMs like Zendesk and Salesforce.
