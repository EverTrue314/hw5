# Campus Customs MCP Server

This FastMCP server supplies database-backed facts to the Campus Customs agent team. It uses `data/campus_customs_new.db`; Pydantic AI connects through the project-root `.mcp.json` configuration. Every MCP tool is read-only. Agents prepare payment and purchase proposals; a human-approved FastAPI route handles approved cash changes.

## Tools

- `get_ticket_101_tee_reprint_context` — ticket, white size-S tee stock and pricing, linked invoice, and vendor (`tickets`, `inventory`, `pricing`, `invoices`, `vendors`).
- `get_ticket_102_rent_context` — rent ticket and linked lease (`tickets`, `leases`).
- `get_ticket_103_bulk_hoodie_context` — bulk request, navy size-M stock, and hoodie pricing (`tickets`, `inventory`, `pricing`).
- `list_open_tickets` — open tickets with operational fields; excludes requester names and free-text notes (`tickets`).
- `get_ticket_summary` — one ticket's operational fields without requester names or free-text notes (`tickets`).
- `get_shop_date` — the authoritative shop date (`desk`).
- `get_inventory_stock` — exact SKU and size stock quantity and location (`inventory`).
- `get_product_pricing` — internal unit cost and list price (`pricing`).
- `get_customer_list_price` — list price only for customer-service drafts (`pricing`).
- `list_vendors` — vendor names, specialties, and lead times; the database has no SKU-to-vendor mapping (`vendors`).
- `check_vendor_shipping_hold` — tells whether a known vendor has open unpaid invoices that block shipment of new products (`vendors`, `invoices`).
- `get_accounting_snapshot` — account balances, invoices with vendor names, and recorded payments (`cash_accounts`, `invoices`, `vendors`, `payments`).
- `get_lease_details` — one lease's property and due-date details (`leases`).
- `get_invoice_status_for_ticket` — linked invoice status and due date, without payment amounts or vendor details (`tickets`, `invoices`).
- `get_ticket_invoice_vendor_context` — linked invoice supplier, specialty, lead time, and description without payment amounts (`tickets`, `invoices`, `vendors`).
- No payment or purchase write tool is exposed to agents. The FastAPI `POST /approvals` route is the only application path that changes cash; it requires an explicit human approval payload, rechecks the invoice/ticket and balance inside a transaction, prevents duplicate actions and negative balances, and updates the `payments` table. Purchase approvals are recorded as `kind='purchase'` cash outflows linked to a ticket; the provided database has no purchase-order table, so the route does not place external orders or update inventory.
- No route or tool contacts customers or vendors. `POST /database/reset` restores the working copy from the original supplied database after explicit confirmation.

Start the API from `backend/` with `uvicorn main:app --reload --port 8000`. Before a fresh assignment run, the human can restore the working copy through `POST /database/reset` with `{"confirm_reset": true}`; reset is never automatic.
