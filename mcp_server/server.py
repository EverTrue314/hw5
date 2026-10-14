"""Read-only Campus Customs MCP tools backed by campus_customs_new.db."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from fastmcp import FastMCP


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "campus_customs_new.db"
mcp = FastMCP("Campus Customs")


def _fetchone(connection: sqlite3.Connection, query: str, values: tuple[Any, ...]) -> dict[str, Any] | None:
    row = connection.execute(query, values).fetchone()
    return dict(row) if row is not None else None


def _read_ticket_context(ticket_id: int, related_queries: dict[str, tuple[str, tuple[Any, ...]]]) -> dict[str, Any]:
    """Read one ticket and its related records without allowing database writes."""
    database_uri = f"{DATABASE_PATH.as_uri()}?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        ticket = _fetchone(
            connection,
            "SELECT * FROM tickets WHERE id = ?",
            (ticket_id,),
        )
        if ticket is None:
            return {"ticket": None, "related_records": {}}

        records = {
            name: _fetchone(connection, query, values)
            for name, (query, values) in related_queries.items()
        }
        return {"ticket": ticket, "related_records": records}


def _fetchall(connection: sqlite3.Connection, query: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(query, values).fetchall()]


def _read(query: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Run a parameterized read-only query against the homework database."""
    database_uri = f"{DATABASE_PATH.as_uri()}?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        return _fetchall(connection, query, values)


@mcp.tool
def list_open_tickets() -> list[dict[str, Any]]:
    """List up to three open tickets with operational fields, omitting names and free-text notes."""
    return _read(
        "SELECT id, type, subject, sku, size, qty, lease_id, invoice_id, status, created_at "
        "FROM tickets WHERE lower(status) = 'open' ORDER BY id LIMIT 3"
    )


@mcp.tool
def get_ticket_summary(ticket_id: int) -> dict[str, Any] | None:
    """Read one ticket's operational fields without requester names or free-text notes."""
    rows = _read(
        "SELECT id, type, subject, sku, size, qty, lease_id, invoice_id, status, created_at "
        "FROM tickets WHERE id = ?",
        (ticket_id,),
    )
    return rows[0] if rows else None


@mcp.tool
def get_shop_date() -> dict[str, Any] | None:
    """Read the shop's current date from desk.date_today for overdue checks."""
    rows = _read("SELECT date_today FROM desk LIMIT 1")
    return rows[0] if rows else None


@mcp.tool
def get_inventory_stock(sku: str, size: str) -> dict[str, Any] | None:
    """Look up recorded stock quantity and location for one exact SKU and size."""
    rows = _read(
        "SELECT sku, name, size, qty, location FROM inventory WHERE sku = ? AND size = ?",
        (sku, size),
    )
    return rows[0] if rows else None


@mcp.tool
def get_product_pricing(sku: str) -> dict[str, Any] | None:
    """Read recorded unit cost and list price for an exact SKU; intended for internal decisions."""
    rows = _read("SELECT sku, unit_cost, list_price FROM pricing WHERE sku = ?", (sku,))
    return rows[0] if rows else None


@mcp.tool
def get_customer_list_price(sku: str) -> dict[str, Any] | None:
    """Read only the recorded list price for customer-service drafts; omits internal unit cost."""
    rows = _read("SELECT sku, list_price FROM pricing WHERE sku = ?", (sku,))
    return rows[0] if rows else None


@mcp.tool
def list_vendors() -> list[dict[str, Any]]:
    """List recorded vendor names, specialties, and lead times; the database has no SKU-vendor mapping."""
    return _read("SELECT id, name, specialty, lead_days FROM vendors ORDER BY id")


@mcp.tool
def check_vendor_shipping_hold(vendor_id: int) -> dict[str, Any]:
    """Check whether a known vendor has an open invoice that blocks new-product shipment."""
    vendors = _read("SELECT id FROM vendors WHERE id = ?", (vendor_id,))
    if not vendors:
        return {
            "vendor_id": vendor_id,
            "vendor_found": False,
            "shipping_hold": None,
            "open_unpaid_invoices": [],
        }
    open_invoices = _read(
        "SELECT id AS invoice_id, due_date, status FROM invoices "
        "WHERE vendor_id = ? AND lower(status) = 'open' ORDER BY id",
        (vendor_id,),
    )
    return {
        "vendor_id": vendor_id,
        "vendor_found": True,
        "shipping_hold": bool(open_invoices),
        "open_unpaid_invoices": open_invoices,
    }


@mcp.tool
def get_accounting_snapshot() -> dict[str, list[dict[str, Any]]]:
    """Read account balances, invoices, vendor details, and recorded payments for accounting review."""
    return {
        "cash_accounts": _read("SELECT name, balance, date FROM cash_accounts ORDER BY name"),
        "invoices": _read(
            "SELECT invoices.id, invoices.vendor_id, invoices.amount, invoices.due_date, invoices.status, "
            "invoices.description, vendors.name AS vendor_name "
            "FROM invoices LEFT JOIN vendors ON vendors.id = invoices.vendor_id ORDER BY invoices.id"
        ),
        "payments": _read(
            "SELECT id, kind, ref_id, amount, account, paid_at, approved_by FROM payments ORDER BY id"
        ),
    }


@mcp.tool
def get_lease_details(lease_id: int) -> dict[str, Any] | None:
    """Read the recorded lease for rent and property-deadline review."""
    rows = _read(
        "SELECT id, space_name, landlord, monthly_rent, next_due, notes FROM leases WHERE id = ?",
        (lease_id,),
    )
    return rows[0] if rows else None


@mcp.tool
def get_invoice_status_for_ticket(ticket_id: int) -> dict[str, Any] | None:
    """Read only a ticket's linked invoice status and due date for shipping checks and customer drafts."""
    rows = _read(
        "SELECT tickets.id AS ticket_id, invoices.id AS invoice_id, invoices.status, invoices.due_date "
        "FROM tickets JOIN invoices ON invoices.id = tickets.invoice_id WHERE tickets.id = ?",
        (ticket_id,),
    )
    return rows[0] if rows else None


@mcp.tool
def get_ticket_invoice_vendor_context(ticket_id: int) -> dict[str, Any] | None:
    """Read a ticket's linked invoice supplier, specialty, lead time, and description without payment amounts."""
    rows = _read(
        "SELECT tickets.id AS ticket_id, invoices.id AS invoice_id, invoices.status AS invoice_status, "
        "invoices.description AS invoice_description, vendors.id AS vendor_id, vendors.name AS vendor_name, "
        "vendors.specialty AS vendor_specialty, vendors.lead_days AS vendor_lead_days "
        "FROM tickets LEFT JOIN invoices ON invoices.id = tickets.invoice_id "
        "LEFT JOIN vendors ON vendors.id = invoices.vendor_id WHERE tickets.id = ?",
        (ticket_id,),
    )
    return rows[0] if rows else None


@mcp.tool
def get_ticket_101_tee_reprint_context() -> dict[str, Any]:
    """Read ticket 101, its size-S stock and price, and its linked reprint invoice/vendor."""
    return _read_ticket_context(
        101,
        {
            "inventory": (
                "SELECT * FROM inventory WHERE sku = ? AND size = ?",
                ("CC-TEE-WHITE", "S"),
            ),
            "pricing": (
                "SELECT * FROM pricing WHERE sku = ?",
                ("CC-TEE-WHITE",),
            ),
            "invoice_and_vendor": (
                "SELECT invoices.*, vendors.name AS vendor_name, vendors.specialty, vendors.lead_days "
                "FROM invoices JOIN vendors ON vendors.id = invoices.vendor_id "
                "WHERE invoices.id = (SELECT invoice_id FROM tickets WHERE id = ?)",
                (101,),
            ),
        },
    )


@mcp.tool
def get_ticket_102_rent_context() -> dict[str, Any]:
    """Read ticket 102 and the linked Chapel Street shop lease and due-date details."""
    return _read_ticket_context(
        102,
        {
            "lease": (
                "SELECT * FROM leases WHERE id = "
                "(SELECT lease_id FROM tickets WHERE id = ?)",
                (102,),
            ),
        },
    )


@mcp.tool
def get_ticket_103_bulk_hoodie_context() -> dict[str, Any]:
    """Read ticket 103, size-M hoodie stock, and hoodie cost and list price."""
    return _read_ticket_context(
        103,
        {
            "inventory": (
                "SELECT * FROM inventory WHERE sku = ? AND size = ?",
                ("CC-HOOD-NAVY", "M"),
            ),
            "pricing": (
                "SELECT * FROM pricing WHERE sku = ?",
                ("CC-HOOD-NAVY",),
            ),
        },
    )


if __name__ == "__main__":
    mcp.run()
