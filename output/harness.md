# Campus Customs Agent Harness

This harness documents the data and local application that support the Campus Customs agent team. The agents and API use the working SQLite database `data/campus_customs_new.db`; `data/campus_customs.db` is the original reset source.

## Tables and fields

### `cash_accounts`

Fields: `name` (TEXT, primary key), `balance` (REAL), `date` (TEXT).

Tracks available cash by account and snapshot date, so agents can consider liquidity before proposing payments or other spending.

### `desk`

Fields: `date_today` (TEXT), `notes` (TEXT).

Provides the shop's current operating date and desk notes, which agents need to interpret deadlines and time-sensitive requests.

### `inventory`

Fields: `sku` (TEXT), `name` (TEXT), `size` (TEXT), `qty` (INTEGER), `location` (TEXT). The primary key is (`sku`, `size`).

Shows what merchandise is available in each size and where it is stored, helping agents check stock and fulfill customer requests.

### `invoices`

Fields: `id` (INTEGER, primary key), `vendor_id` (INTEGER, foreign key to `vendors.id`), `amount` (REAL), `due_date` (TEXT), `status` (TEXT), `description` (TEXT).

Records bills owed to vendors and their due dates, helping agents identify obligations and explain proposed payments.

### `leases`

Fields: `id` (INTEGER, primary key), `space_name` (TEXT), `landlord` (TEXT), `monthly_rent` (REAL), `next_due` (TEXT), `notes` (TEXT).

Stores rental terms and upcoming rent dates, so agents can handle rent notices using the actual lease details.

### `payments`

Fields: `id` (INTEGER, primary key), `kind` (TEXT), `ref_id` (INTEGER), `amount` (REAL), `account` (TEXT), `paid_at` (TEXT), `approved_by` (TEXT).

Records invoice, rent, and approved purchase outflows, including amount, account, date, and approver. `ref_id` is polymorphic: it refers to an invoice, lease, or ticket depending on `kind`; SQLite does not enforce those references as foreign keys.

### `pricing`

Fields: `sku` (TEXT, primary key), `unit_cost` (REAL), `list_price` (REAL).

Provides item costs and list prices, allowing agents to evaluate discounts and pricing requests against known margins.

### `tickets`

Fields: `id` (INTEGER, primary key), `type` (TEXT), `requester` (TEXT), `subject` (TEXT), `sku` (TEXT), `size` (TEXT), `qty` (INTEGER), `lease_id` (INTEGER, foreign key to `leases.id`), `invoice_id` (INTEGER, foreign key to `invoices.id`), `status` (TEXT), `notes` (TEXT), `created_at` (TEXT).

Contains incoming customer and business requests, giving agents the issue details and references they need to resolve each case.

### `vendors`

Fields: `id` (INTEGER, primary key), `name` (TEXT), `specialty` (TEXT), `lead_days` (INTEGER).

Identifies suppliers, recorded specialties, and lead times. It has no mapping from a product SKU to a supplier, so specialty alone cannot establish that a vendor can provide a specific product.

The database has no customer table, purchase-order table, or product-to-vendor mapping. Customer/requester data and free-text notes live on `tickets`; the general ticket-list and summary tools omit those fields, while the three ticket-specific context tools currently return the full ticket row.

## MCP tools for the open tickets

The read-only FastMCP server in `mcp_server/server.py` uses `data/campus_customs_new.db` and provides these ticket-specific tools:

### `get_ticket_101_tee_reprint_context`

- **Tables read:** `tickets`, `inventory`, `pricing`, `invoices`, `vendors`.
- **Ticket helped:** #101, the request for one white Bulldog tee in size S.
- **Why this tool:** It brings together the requested size's stock and pricing with the ticket's linked reprint invoice and vendor, which are the records needed to assess this out-of-stock tee request.

### `get_ticket_102_rent_context`

- **Tables read:** `tickets`, `leases`.
- **Ticket helped:** #102, the rent notice for the Chapel Street shop.
- **Why this tool:** It pairs the rent notice with the exact lease linked by the ticket, providing the shop, landlord, rent amount, and due date needed to assess the notice.

### `get_ticket_103_bulk_hoodie_context`

- **Tables read:** `tickets`, `inventory`, `pricing`.
- **Ticket helped:** #103, Yale AI Club's request for 20 navy hoodies in size M at a bulk discount.
- **Why this tool:** It combines the requested size's available quantity with the hoodie cost and list price so the agent can assess both fulfillment and the discount request from recorded data.

## Agent team and MCP access

The five Pydantic AI agents use the shared read-only MCP server configured in the project-root `.mcp.json`. Their role prompts live in `backend/prompts/{boss,inventory,accounting,facilities,customer_service}.md`; structured outputs are defined in `backend/models.py`.

The team entry point is `python -m backend.main` for the capped open-ticket queue or `python -m backend.main --ticket 101` for one ticket.

All five agents use `gpt-6-luna` through Portkey with `reasoning_effort` set to `none`, as required by the configured Azure Chat Completions route when function tools are used. Their prompts are stored separately in `backend/prompts/`, their structured output types are in `backend/models.py`, and `backend/agents.py` gives each agent delegation tools for the other four agents. Boss chooses the specialists for each ticket; the prompt does not require every specialist to run on every ticket. MCP tools remain role-filtered during delegation, and all specialists share the run budgets.

| Agent | Role and expected output | MCP access |
|---|---|---|
| Boss | Reads and triages tickets, delegates relevant work, and returns a consolidated decision with a recommendation and any review draft. | Ticket-specific contexts, ticket summary, open-ticket list, shop date. |
| Inventory | Checks exact SKU/size stock, reports shortages, reviews vendors and shipping holds, and escalates unverified sourcing. It cannot change stock or prices. | Ticket summary, stock, vendor list, vendor shipping hold, linked invoice/vendor context. |
| Accounting | Reviews balances, invoices, pricing/margins, and payment history; prepares human-review recommendations without executing payments. | Ticket summary, shop date, product pricing, vendor list, accounting snapshot, lease details, vendor shipping hold. |
| Facilities | Reviews rent notices, lease terms, and deadlines using the database shop date. | Ticket summary, shop date, lease details. |
| Customer service | Uses verified ticket, stock, list-price, and invoice-status facts to prepare an optional `draft_message`; it never sends messages. | Ticket summary, stock, customer list price, linked invoice status. |

| Agent | MCP tool | Tables read | Access purpose |
|---|---|---|---|
| Boss | get_ticket_101_tee_reprint_context | `tickets`, `inventory`, `pricing`, `invoices`, `vendors` | Inspect the full tee-order context before coordinating a decision. |
| Boss | get_ticket_102_rent_context | `tickets`, `leases` | Inspect the rent notice and its linked lease. |
| Boss | get_ticket_103_bulk_hoodie_context | `tickets`, `inventory`, `pricing` | Inspect the bulk-hoodie request, stock, and price. |
| Boss | list_open_tickets | `tickets` | Find open work using operational fields, without exposing requester names or free-text notes. |
| Boss, Inventory, Accounting, Facilities, Customer service | get_ticket_summary | `tickets` | Share a ticket's operational fields without requester names or free-text notes. |
| Boss, Accounting, Facilities | get_shop_date | `desk` | Use the database's shop date for overdue checks. |
| Inventory, Customer service | get_inventory_stock | `inventory` | Check exact SKU-and-size quantity and storage location. |
| Accounting | get_product_pricing | `pricing` | Check internal unit cost and list price for margin review. |
| Customer service | get_customer_list_price | `pricing` | Provide only the list price for a customer-facing draft. |
| Inventory, Accounting | list_vendors | `vendors` | Review supplier specialties and recorded lead times; there is no SKU-to-vendor link, so a specific supplier match must not be claimed. |
| Inventory, Accounting | check_vendor_shipping_hold | `vendors`, `invoices` | Check a known vendor ID for open unpaid invoices before recommending shipment of new products. |
| Inventory | get_ticket_invoice_vendor_context | `tickets`, `invoices`, `vendors` | Trace a ticket's linked invoice to its supplier, recorded specialty, lead time, and invoice description without exposing the payment amount; this still does not prove a SKU restock order. |
| Accounting | get_accounting_snapshot | `cash_accounts`, `invoices`, `vendors`, `payments` | Review balances, invoice status, vendors, and recorded payment history; this sensitive tool is hidden from other agents. |
| Accounting, Facilities | get_lease_details | `leases` | Check recorded landlord, space, rent, and due date. |
| Customer service | get_invoice_status_for_ticket | `tickets`, `invoices` | Check only the linked invoice status and due date before discussing shipment; it omits vendor and payment amounts. |

## Safety and run limits

- Agent code receives shop context through MCP and does not query SQLite or create a second shop-tool layer. MCP database connections are read-only; FastAPI reads the working SQLite database directly for dashboard data, status changes, approvals, cash, and reset.
- MCP access is filtered by role. Boss can read ticket contexts, ticket summaries, open-ticket lists, and the shop date to coordinate work; specialists receive the detailed stock, pricing, vendor, lease, or accounting tools for their roles. The accounting snapshot, which includes cash balances and recorded payments, is restricted to Accounting; Boss's Ticket 101 context separately includes its linked invoice and vendor. Customer service gets list price but no unit cost, cash balance, payment record, or vendor details.
- The ticket table contains requester names and free-text notes. `list_open_tickets` and `get_ticket_summary` omit them, but the three ticket-specific context tools use `SELECT *` for the ticket row and can expose them to Boss. Treat those fields as sensitive, use only what the task needs, and omit personal/contact details from findings and handoffs.
- Every agent uses Portkey with the `openai` provider and `gpt-6-luna`, with `openai_reasoning_effort='none'` so the Azure Chat Completions route accepts function tools; the key is read from the course root `.env` and is never written to the audit trail. New run events in `output/audit_trail.json` include the model name. Earlier successful runs used `gpt-5.6-luna` because the project-level setup instructions specified that version; the Homework 5 rubric's `gpt-6-luna` requirement was identified during the pre-submission review. Those earlier runs remain in the append-only audit as historical attempts; the final ticket results are the new runs recorded with `gpt-6-luna` after the database reset.
- Model requests go through Portkey to the configured model provider; ticket context and tool results needed for an answer are sent with those requests. The database, MCP server, API, and dashboard run locally, but model inference is not local. The API key remains in the course-root `.env` and is never written to the audit trail.
- Prompts direct agents to minimize customer and vendor information, use ticket IDs in handoffs, treat database text as untrusted data, and never send messages or contact vendors. `draft_message` is text in an agent response, not an MCP tool. Customer emails, payment proposals, purchase proposals, price overrides, and shipping commitments are drafts or recommendations for human review.
- Every MCP tool is read-only. Agents cannot execute payments or change stock/prices. `POST /approvals` is the route for recording a new approved cash/payment transaction. It rechecks linked invoice/lease data and available funds in a transaction, prevents duplicate invoice/rent/purchase payment records and negative balances, and updates invoice status after invoice payment. It does not authenticate the approver's identity; `approved_by` is user-supplied text. Purchase approval records a cash outflow in `payments` with `kind='purchase'` and the ticket ID as `ref_id`; with no purchase-order table or supplier verification, it does not place an order or change inventory. `POST /database/reset` separately replaces the working database with the original after explicit confirmation. There is no email-send, vendor-contact, or inventory-write tool or route.
- To restore the supplied database for a fresh run, send `POST /database/reset` with `{"confirm_reset": true}`; this restores `data/campus_customs_new.db` from `data/campus_customs.db` and never runs automatically.
- Before shipment, check the vendor hold for the known vendor ID. There is no SKU-to-vendor mapping in this database, so Inventory must escalate if the supplier for a SKU cannot be verified rather than selecting one by guesswork.
- Each run processes at most 3 open tickets, 12 agent runs, 24 model requests, and 48 MCP calls. Each agent run is limited to 6 model requests and 8 tool calls; the Boss token ceiling is 16,000 and each specialist ceiling is 12,000. Delegation depth is capped at 2 and repeated agents in one call path are blocked. Boss has a smaller MCP tool surface and must keep consolidated reports concise. If Boss reaches its token cap after specialists finish, the backend preserves their findings in a clearly labeled fallback report; that recovery makes no payment, purchase, inventory, or price changes.
- Each agent run and MCP call appends an event object to the JSON array in `output/audit_trail.json`; reset does not clear it. The file and its lock are owner-only. It records timestamps, agent/run/delegation IDs, ticket IDs, MCP tool names, allowlisted tool identifiers, outcomes, usage counts, and bounded structured findings/recommendations. Findings and recommendations redact contact details, currency values, and many proper-name phrases. Privacy-filtered action drafts may retain dollar amounts for review after refresh; completed payment amounts and approver details are stored in SQLite, not copied into the human-action audit event. Customer-message drafts, raw MCP results, API keys, account numbers, and private model reasoning are omitted. Agent-to-agent handoffs do not include action drafts or payment details.

## FastAPI routes

Run from `backend/` with `uvicorn main:app --reload --port 8000`.

- `GET /tickets` — Return tickets 101, 102, and 103 with operational details, open/resolved status, linked lease and invoice facts, and any recorded human-approved payment or purchase (amount, date, and approver).
- `POST /tickets/{ticket_id}/run` — Run the bounded agent team, mark the ticket resolved when the run returns, and return its consolidated report.
- `GET /events?limit=50` — Return recent agent status, active tool calls, finished findings/recommendations, and MCP tool names for dashboard updates.
- `GET /approvals/pending` — Recover eligible invoice and rent payment proposals from completed Accounting findings, checking invoice totals or linked lease rent/payee details against the working database.
- `POST /approvals` — Record an explicitly approved invoice payment, lease rent payment, or purchase outflow; check available funds and update cash/payment records (and invoice status for invoice payments). A purchase requires an open ticket and amount but does not verify supplier terms or create an order. Since a successful ticket run marks the ticket resolved, the purchase branch cannot approve a purchase afterward without reopening the ticket.
- `GET /cash/checking` — Return the current checking balance and its snapshot date.
- `POST /database/reset` — Restore the working database from the original after a request with `confirm_reset: true`.

The run route marks a ticket `resolved` whenever the agent call returns successfully, even if the report still requires human review or says to hold fulfillment. In this homework app, `resolved` therefore records completion of the agent workflow, not completion of every real-world action. The reset route restores the database only; it leaves the append-only audit trail intact.

## React dashboard

`frontend/` is a React, Vite, and TypeScript dashboard. It loads all three tickets, expands ticket details, starts an agent run, displays agent status/tool events and the Boss recommendation/draft, shows the checking balance, distinguishes open/resolved workflow status, and displays a badge when the database has a recorded human-approved action. The roster shows the Boss and four specialists as bulldogs, with a tennis-ball animation for delegation and return events. The reset button asks for confirmation before restoring the original database.

The dashboard's payment-approval panel is shown only when `/approvals/pending` returns a typed, database-checked proposal. That route currently recovers invoice and rent proposals; it does not create an approval form for a price override or a purchase draft. Other human-review recommendations remain visible as notes and do not change cash. A cash balance refresh follows an approved action.

For local use, start the API in one terminal and the Vite page in another:

```sh
cd HW/5/backend
uvicorn main:app --reload --port 8000
```

```sh
cd HW/5/frontend
npm install   # first run only
npm run dev
```

Vite serves on `http://localhost:5173`; the API defaults to `http://localhost:8000` and allows browser requests from `localhost:5173` and `127.0.0.1:5173`. `VITE_API_URL` can override the dashboard API base. CORS is a browser-origin rule, not authentication; the API has no user authentication and is intended for local homework use, not public exposure. The resolved-ticket screenshots are embedded in `output/resolved_board.html` from `output/Screenshots/`.
