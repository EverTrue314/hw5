"""FastAPI routes and command-line entry points for Campus Customs."""

from __future__ import annotations

import argparse
import asyncio
import re
import sqlite3
from collections import defaultdict, deque
from contextlib import closing
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

if __package__:
    from .agents import MODEL_NAME, run_open_tickets, run_ticket
    from .audit import AUDIT_PATH, append_event, read_events
else:
    from agents import MODEL_NAME, run_open_tickets, run_ticket
    from audit import AUDIT_PATH, append_event, read_events


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
DATABASE_PATH = PROJECT_DIR / "data" / "campus_customs_new.db"
ORIGINAL_DATABASE_PATH = PROJECT_DIR / "data" / "campus_customs.db"
TICKET_IDS = (101, 102, 103)

app = FastAPI(title="Campus Customs Agent Desk", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ApprovalRequest(BaseModel):
    """An explicit human decision for a prepared invoice, rent, or purchase outflow."""

    model_config = ConfigDict(extra="forbid")

    action_type: Literal["invoice_payment", "rent_payment", "purchase"]
    approved: bool
    approved_by: str = Field(min_length=1, max_length=100)
    account_name: str = Field(min_length=1, max_length=100)
    invoice_id: int | None = Field(default=None, ge=1)
    lease_id: int | None = Field(default=None, ge=1)
    ticket_id: int | None = Field(default=None, ge=1)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm_reset: bool


def _connect_readonly() -> sqlite3.Connection:
    uri = f"{DATABASE_PATH.as_uri()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def _payment_result(
    connection: sqlite3.Connection,
    *,
    action_type: str,
    ticket_id: int | None,
    invoice_id: int | None,
    lease_id: int | None,
    amount: Decimal,
    account_name: str,
    approved_by: str,
) -> dict[str, Any]:
    """Apply one approved cash outflow and its audit row inside an open transaction."""
    account = connection.execute(
        "SELECT name, balance FROM cash_accounts WHERE name = ?",
        (account_name,),
    ).fetchone()
    if account is None:
        raise HTTPException(status_code=404, detail="Cash account not found.")
    if Decimal(str(account["balance"])) < amount:
        raise HTTPException(status_code=409, detail="Insufficient funds; no records were changed.")

    desk = connection.execute("SELECT date_today FROM desk LIMIT 1").fetchone()
    if desk is None:
        raise HTTPException(status_code=409, detail="Shop date is unavailable; no records were changed.")
    paid_at = str(desk["date_today"])

    debit = connection.execute(
        "UPDATE cash_accounts SET balance = balance - ?, date = ? "
        "WHERE name = ? AND balance >= ?",
        (float(amount), paid_at, account_name, float(amount)),
    )
    if debit.rowcount != 1:
        raise HTTPException(status_code=409, detail="Insufficient funds; no records were changed.")

    connection.execute(
        "INSERT INTO payments (kind, ref_id, amount, account, paid_at, approved_by) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ({"invoice_payment": "invoice", "rent_payment": "rent", "purchase": "purchase"}[action_type],
         invoice_id if action_type == "invoice_payment" else lease_id if action_type == "rent_payment" else ticket_id,
         float(amount), account_name, paid_at, approved_by),
    )
    remaining = connection.execute(
        "SELECT balance FROM cash_accounts WHERE name = ?",
        (account_name,),
    ).fetchone()["balance"]
    return {
        "status": "approved_and_recorded",
        "action_type": action_type,
        "ticket_id": ticket_id,
        "invoice_id": invoice_id,
        "lease_id": lease_id,
        "amount": float(amount),
        "account": account_name,
        "remaining_balance": remaining,
        "approved_by": approved_by,
        "paid_at": paid_at,
    }


@app.get("/tickets")
def get_tickets() -> list[dict[str, Any]]:
    """Return the three assignment tickets with open/resolved status."""
    try:
        with closing(_connect_readonly()) as connection:
            rows = connection.execute(
                "SELECT tickets.id, tickets.type, tickets.subject, tickets.sku, tickets.size, tickets.qty, "
                "tickets.lease_id, tickets.invoice_id, tickets.status, tickets.created_at, "
                "leases.space_name AS lease_space_name, leases.landlord AS lease_landlord, "
                "leases.monthly_rent AS lease_monthly_rent, leases.next_due AS lease_next_due, "
                "leases.notes AS lease_notes, "
                "invoices.amount AS invoice_amount, invoices.status AS invoice_status, "
                "invoices.due_date AS invoice_due_date, invoices.description AS invoice_description, "
                "vendors.id AS invoice_vendor_id, vendors.name AS invoice_vendor_name, "
                "vendors.specialty AS invoice_vendor_specialty, vendors.lead_days AS invoice_vendor_lead_days, "
                "(SELECT p.kind FROM payments p WHERE "
                "((lower(p.kind) = 'invoice' AND p.ref_id = tickets.invoice_id) OR "
                "(lower(p.kind) = 'rent' AND p.ref_id = tickets.lease_id) OR "
                "(lower(p.kind) = 'purchase' AND p.ref_id = tickets.id)) "
                "AND trim(p.approved_by) <> '' ORDER BY p.id DESC LIMIT 1) AS human_approval_kind, "
                "(SELECT p.amount FROM payments p WHERE "
                "((lower(p.kind) = 'invoice' AND p.ref_id = tickets.invoice_id) OR "
                "(lower(p.kind) = 'rent' AND p.ref_id = tickets.lease_id) OR "
                "(lower(p.kind) = 'purchase' AND p.ref_id = tickets.id)) "
                "AND trim(p.approved_by) <> '' ORDER BY p.id DESC LIMIT 1) AS human_approval_amount, "
                "(SELECT p.paid_at FROM payments p WHERE "
                "((lower(p.kind) = 'invoice' AND p.ref_id = tickets.invoice_id) OR "
                "(lower(p.kind) = 'rent' AND p.ref_id = tickets.lease_id) OR "
                "(lower(p.kind) = 'purchase' AND p.ref_id = tickets.id)) "
                "AND trim(p.approved_by) <> '' ORDER BY p.id DESC LIMIT 1) AS human_approval_date, "
                "(SELECT p.approved_by FROM payments p WHERE "
                "((lower(p.kind) = 'invoice' AND p.ref_id = tickets.invoice_id) OR "
                "(lower(p.kind) = 'rent' AND p.ref_id = tickets.lease_id) OR "
                "(lower(p.kind) = 'purchase' AND p.ref_id = tickets.id)) "
                "AND trim(p.approved_by) <> '' ORDER BY p.id DESC LIMIT 1) AS human_approved_by "
                "FROM tickets LEFT JOIN invoices ON invoices.id = tickets.invoice_id "
                "LEFT JOIN leases ON leases.id = tickets.lease_id "
                "LEFT JOIN vendors ON vendors.id = invoices.vendor_id "
                "WHERE tickets.id IN (?, ?, ?) ORDER BY tickets.id",
                TICKET_IDS,
            ).fetchall()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Unable to read ticket status.") from exc

    if len(rows) != len(TICKET_IDS):
        raise HTTPException(status_code=500, detail="The database does not contain all three assignment tickets.")
    return [
        {
            "ticket_id": int(row["id"]),
            "type": row["type"],
            "subject": row["subject"],
            "sku": row["sku"],
            "size": row["size"],
            "quantity": row["qty"],
            "lease_id": row["lease_id"],
            "lease_space_name": row["lease_space_name"],
            "lease_landlord": row["lease_landlord"],
            "lease_monthly_rent": row["lease_monthly_rent"],
            "lease_next_due": row["lease_next_due"],
            "lease_notes": row["lease_notes"],
            "invoice_id": row["invoice_id"],
            "invoice_amount": row["invoice_amount"],
            "invoice_status": row["invoice_status"],
            "invoice_due_date": row["invoice_due_date"],
            "invoice_description": row["invoice_description"],
            "invoice_vendor_id": row["invoice_vendor_id"],
            "invoice_vendor_name": row["invoice_vendor_name"],
            "invoice_vendor_specialty": row["invoice_vendor_specialty"],
            "invoice_vendor_lead_days": row["invoice_vendor_lead_days"],
            "human_approved_action": (
                {
                    "action_type": {"invoice": "invoice_payment", "rent": "rent_payment"}.get(
                        str(row["human_approval_kind"]).lower(), "purchase"
                    ),
                    "amount": row["human_approval_amount"],
                    "invoice_id": row["invoice_id"] if str(row["human_approval_kind"]).lower() == "invoice" else None,
                    "lease_id": row["lease_id"] if str(row["human_approval_kind"]).lower() == "rent" else None,
                    "date": row["human_approval_date"],
                    "approved_by": row["human_approved_by"],
                }
                if row["human_approval_kind"] is not None else None
            ),
            "created_at": row["created_at"],
            "status": "open" if str(row["status"]).lower() == "open" else "resolved",
            "is_open": str(row["status"]).lower() == "open",
        }
        for row in rows
    ]


@app.post("/tickets/{ticket_id}/run")
async def run_ticket_team(ticket_id: int) -> dict[str, Any]:
    """Run the bounded agent team for one of the three known homework tickets."""
    if ticket_id not in TICKET_IDS:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    try:
        report = await run_ticket(ticket_id)
    except Exception as exc:
        upstream_status_code = getattr(exc, "status_code", None)
        detail = f"Agent run failed ({type(exc).__name__})."
        if type(exc).__name__ == "UsageLimitExceeded":
            limit_name = next((
                name for name in (
                    "request_limit", "tool_calls_limit", "total_tokens_limit",
                    "input_tokens_limit", "output_tokens_limit", "cost_limit",
                ) if name in str(exc)
            ), "unknown")
            detail = f"Agent run failed (UsageLimitExceeded: {limit_name})."
        elif isinstance(upstream_status_code, int):
            detail = f"Agent run failed ({type(exc).__name__}; upstream HTTP {upstream_status_code})."
        raise HTTPException(status_code=502, detail=detail) from exc
    try:
        with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("UPDATE tickets SET status = 'resolved' WHERE id = ?", (ticket_id,))
            connection.commit()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Agent run finished, but ticket status could not be updated.") from exc
    append_event({"event": "ticket_resolved", "model": MODEL_NAME, "ticket_id": ticket_id, "source": "agent_run_completed"})
    return report.model_dump(mode="json")


@app.get("/events")
def get_recent_agent_events(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    """Return recent agent statements with the MCP tools called during each run."""
    if not AUDIT_PATH.is_file():
        return []

    records: deque[dict[str, Any]] = deque(maxlen=5000)
    try:
        records.extend(read_events())
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Unable to read agent events.") from exc

    runs: dict[str, dict[str, Any]] = {}
    for record in records:
        run_id = record.get("run_id")
        event_name = record.get("event")
        if not isinstance(run_id, str):
            continue
        if event_name == "agent_run_started":
            runs[run_id] = {
                "timestamp": record.get("timestamp"),
                "agent": record.get("agent"),
                "ticket_id": record.get("ticket_id"),
                "run_id": run_id,
                "parent_run_id": record.get("parent_run_id"),
                "status": "running",
                "current_activity": "Starting work",
                "said": None,
                "tools_used": [],
                "_active_tool": None,
            }
        elif event_name in {"agent_run_completed", "agent_run_failed", "agent_run_recovered"}:
            item = runs.setdefault(run_id, {
                "timestamp": record.get("timestamp"),
                "agent": record.get("agent"),
                "ticket_id": record.get("ticket_id"),
                "run_id": run_id,
                "parent_run_id": record.get("parent_run_id"),
                "tools_used": [],
                "_active_tool": None,
            })
            item["timestamp"] = record.get("timestamp", item.get("timestamp"))
            item["status"] = "failed" if event_name == "agent_run_failed" else "completed"
            item["current_activity"] = (
                "Recovered final report from completed specialists"
                if event_name == "agent_run_recovered"
                else "Finished this step" if event_name == "agent_run_completed" else "Step failed"
            )
            item["said"] = record.get("agent_statement")
        elif event_name in {"mcp_tool_call_started", "mcp_tool_call_completed", "mcp_tool_call_failed"}:
            tool_name = record.get("tool_name")
            item = runs.get(run_id)
            if item is None or not isinstance(tool_name, str):
                continue
            if tool_name not in item["tools_used"]:
                item["tools_used"].append(tool_name)
            if event_name == "mcp_tool_call_started":
                item["_active_tool"] = tool_name
                item["current_activity"] = f"Using {tool_name}"
            elif item.get("_active_tool") == tool_name:
                item["_active_tool"] = None
                if item.get("status") == "running":
                    item["current_activity"] = f"Used {tool_name}; continuing"

    run_events = sorted(runs.values(), key=lambda item: str(item.get("timestamp") or ""), reverse=True)[:limit]
    for event in run_events:
        event.pop("_active_tool", None)
    return run_events


@app.get("/approvals/pending")
def get_pending_approval_proposals() -> list[dict[str, Any]]:
    """Recover eligible invoice and rent payment proposals from recorded findings and database facts."""
    if not AUDIT_PATH.is_file():
        return []
    try:
        records = read_events()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Unable to read pending approval findings.") from exc

    resets = [str(row.get("timestamp", "")) for row in records if row.get("event") == "database_reset"]
    latest_reset = max(resets, default="")
    declined_invoices = {
        int(row["invoice_id"])
        for row in records
        if row.get("event") == "human_action_declined" and row.get("action_type") == "invoice_payment"
        and isinstance(row.get("invoice_id"), int)
    }
    declined_rent_tickets = {
        int(row["ticket_id"])
        for row in records
        if row.get("event") == "human_action_declined" and row.get("action_type") == "rent_payment"
        and isinstance(row.get("ticket_id"), int)
    }
    latest_recommendation: dict[int, dict[str, Any]] = {}
    for row in records:
        if (
            row.get("event") != "agent_run_completed"
            or row.get("agent") != "accounting"
            or not isinstance(row.get("ticket_id"), int)
            or str(row.get("timestamp", "")) < latest_reset
        ):
            continue
        statement = row.get("agent_statement")
        recommendation = statement.get("recommendation", "") if isinstance(statement, dict) else ""
        if isinstance(statement, dict) and statement.get("human_approval_required") and re.search(
            r"payment proposal.{0,100}human review|human review.{0,100}payment proposal|rent payment.{0,100}human review|human review.{0,100}rent payment|payment.{0,100}human review|human review.{0,100}payment",
            recommendation,
            re.I,
        ):
            latest_recommendation[int(row["ticket_id"])] = {"event": row, "draft": statement.get("action_draft")}

    proposals: list[dict[str, Any]] = []
    try:
        with closing(_connect_readonly()) as connection:
            for ticket_id, saved in latest_recommendation.items():
                record = saved["event"]
                row = connection.execute(
                    "SELECT id, invoice_id, lease_id, status FROM tickets WHERE id = ?",
                    (ticket_id,),
                ).fetchone()
                if row is None:
                    continue
                if row["invoice_id"] is not None and row["invoice_id"] not in declined_invoices:
                    invoice = connection.execute(
                        "SELECT amount, status FROM invoices WHERE id = ?", (row["invoice_id"],)
                    ).fetchone()
                    if invoice is None or str(invoice["status"]).lower() != "open":
                        continue
                    payment = connection.execute(
                        "SELECT 1 FROM payments WHERE lower(kind) = 'invoice' AND ref_id = ? LIMIT 1",
                        (row["invoice_id"],),
                    ).fetchone()
                    if payment is not None:
                        continue
                    invoice_id = int(row["invoice_id"])
                    proposals.append({
                        "ticket_id": ticket_id, "action_type": "invoice_payment", "invoice_id": invoice_id,
                        "lease_id": None, "amount": float(invoice["amount"]),
                        "draft": saved["draft"] or (
                            f"Accounting recommended preparing a human-reviewed payment proposal for invoice #{invoice_id}. "
                            "The original action draft was not retained; this proposal is reconstructed from the recorded accounting recommendation and current invoice record."
                        ),
                        "recovered": not bool(saved["draft"]), "source_timestamp": record.get("timestamp"),
                    })
                elif row["lease_id"] is not None and ticket_id not in declined_rent_tickets:
                    lease = connection.execute(
                        "SELECT id, space_name, landlord, monthly_rent, next_due FROM leases WHERE id = ?",
                        (row["lease_id"],),
                    ).fetchone()
                    if lease is None:
                        continue
                    payment = connection.execute(
                        "SELECT 1 FROM payments WHERE lower(kind) = 'rent' AND ref_id = ? LIMIT 1",
                        (lease["id"],),
                    ).fetchone()
                    if payment is not None:
                        continue
                    proposals.append({
                        "ticket_id": ticket_id, "action_type": "rent_payment", "invoice_id": None,
                        "lease_id": int(lease["id"]), "amount": float(lease["monthly_rent"]),
                        "payee": lease["landlord"], "purpose": f"Monthly rent for {lease['space_name']}",
                        "due_date": lease["next_due"],
                        "draft": saved["draft"] or (
                            f"A human may review a {lease['monthly_rent']:.2f} rent payment to {lease['landlord']} "
                            f"for {lease['space_name']}, due {lease['next_due']}. The amount and payee come from lease #{lease['id']}."
                        ),
                        "recovered": not bool(saved["draft"]), "source_timestamp": record.get("timestamp"),
                    })
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Unable to verify pending payment proposals.") from exc
    return proposals


@app.post("/approvals")
def approve_prepared_action(request: ApprovalRequest) -> dict[str, Any]:
    """Apply an explicitly approved invoice, rent, or purchase cash outflow."""
    approved_by = request.approved_by.strip()
    account_name = request.account_name.strip()
    if not approved_by or not account_name:
        raise HTTPException(status_code=422, detail="Approver and account are required.")
    if not request.approved:
        append_event({"event": "human_action_declined", "action_type": request.action_type,
                      "ticket_id": request.ticket_id, "invoice_id": request.invoice_id,
                      "lease_id": request.lease_id})
        return {"status": "not_approved", "database_changed": False}

    invoice_id: int | None = None
    lease_id: int | None = None
    ticket_id: int | None = None
    try:
        with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("BEGIN IMMEDIATE")

            if request.action_type == "invoice_payment":
                if request.invoice_id is None or request.amount is None:
                    raise HTTPException(status_code=422, detail="invoice_id and the reviewed amount are required for invoice payments.")
                invoice_id = request.invoice_id
                invoice = connection.execute(
                    "SELECT id, amount, status FROM invoices WHERE id = ?",
                    (invoice_id,),
                ).fetchone()
                if invoice is None:
                    raise HTTPException(status_code=404, detail="Invoice not found.")
                if str(invoice["status"]).lower() != "open":
                    raise HTTPException(status_code=409, detail="Invoice is not open; no records were changed.")
                duplicate = connection.execute(
                    "SELECT id FROM payments WHERE lower(kind) = 'invoice' AND ref_id = ? LIMIT 1",
                    (invoice_id,),
                ).fetchone()
                if duplicate is not None:
                    raise HTTPException(status_code=409, detail="Invoice payment is already recorded.")
                amount = Decimal(str(invoice["amount"])).quantize(Decimal("0.01"))
                if request.amount.quantize(Decimal("0.01")) != amount:
                    raise HTTPException(status_code=409, detail="Approved amount does not match the current invoice.")

            elif request.action_type == "rent_payment":
                if request.ticket_id is None or request.lease_id is None or request.amount is None:
                    raise HTTPException(status_code=422, detail="ticket_id, lease_id, and reviewed amount are required for rent payments.")
                ticket_id = request.ticket_id
                lease_id = request.lease_id
                ticket = connection.execute(
                    "SELECT status, lease_id FROM tickets WHERE id = ?",
                    (ticket_id,),
                ).fetchone()
                if ticket is None or ticket_id not in TICKET_IDS:
                    raise HTTPException(status_code=404, detail="Ticket not found.")
                if ticket["lease_id"] != lease_id:
                    raise HTTPException(status_code=409, detail="The lease is not linked to this ticket.")
                lease = connection.execute(
                    "SELECT monthly_rent FROM leases WHERE id = ?", (lease_id,)
                ).fetchone()
                if lease is None:
                    raise HTTPException(status_code=404, detail="Lease not found.")
                duplicate = connection.execute(
                    "SELECT id FROM payments WHERE lower(kind) = 'rent' AND ref_id = ? LIMIT 1",
                    (lease_id,),
                ).fetchone()
                if duplicate is not None:
                    raise HTTPException(status_code=409, detail="Rent payment is already recorded for this lease.")
                amount = Decimal(str(lease["monthly_rent"])).quantize(Decimal("0.01"))
                if request.amount.quantize(Decimal("0.01")) != amount:
                    raise HTTPException(status_code=409, detail="Approved amount does not match the current lease rent.")

            else:
                if request.ticket_id is None or request.amount is None:
                    raise HTTPException(status_code=422, detail="ticket_id and amount are required for purchases.")
                ticket_id = request.ticket_id
                if ticket_id not in TICKET_IDS:
                    raise HTTPException(status_code=404, detail="Ticket not found.")
                ticket = connection.execute(
                    "SELECT id, status FROM tickets WHERE id = ?",
                    (ticket_id,),
                ).fetchone()
                if ticket is None:
                    raise HTTPException(status_code=404, detail="Ticket not found.")
                if str(ticket["status"]).lower() != "open":
                    raise HTTPException(status_code=409, detail="Ticket is not open; no records were changed.")
                duplicate = connection.execute(
                    "SELECT id FROM payments WHERE lower(kind) = 'purchase' AND ref_id = ? LIMIT 1",
                    (ticket_id,),
                ).fetchone()
                if duplicate is not None:
                    raise HTTPException(status_code=409, detail="Purchase payment is already recorded for this ticket.")
                amount = request.amount.quantize(Decimal("0.01"))

            result = _payment_result(
                connection,
                action_type=request.action_type,
                ticket_id=ticket_id,
                invoice_id=invoice_id,
                lease_id=lease_id,
                amount=amount,
                account_name=account_name,
                approved_by=approved_by,
            )
            if invoice_id is not None:
                paid = connection.execute(
                    "UPDATE invoices SET status = 'paid' WHERE id = ? AND lower(status) = 'open'",
                    (invoice_id,),
                )
                if paid.rowcount != 1:
                    raise HTTPException(status_code=409, detail="Invoice changed; no records were changed.")
            connection.commit()
    except HTTPException:
        if "connection" in locals() and connection.in_transaction:
            connection.rollback()
        raise
    except (sqlite3.Error, InvalidOperation) as exc:
        if "connection" in locals() and connection.in_transaction:
            connection.rollback()
        raise HTTPException(status_code=500, detail="Unable to record the approved action.") from exc
    finally:
        if "connection" in locals():
            connection.close()

    append_event({
        "event": "human_action_approved",
        "action_type": request.action_type,
        "ticket_id": ticket_id,
        "invoice_id": invoice_id,
        "lease_id": lease_id,
        "outcome": "recorded",
    })
    return result


@app.get("/cash/checking")
def get_checking_balance() -> dict[str, Any]:
    """Return the recorded checking account balance and snapshot date."""
    try:
        with closing(_connect_readonly()) as connection:
            row = connection.execute(
                "SELECT name, balance, date FROM cash_accounts WHERE lower(name) = 'checking' LIMIT 1"
            ).fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Unable to read checking balance.") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Checking account not found.")
    return {"account": row["name"], "balance": row["balance"], "date": row["date"]}


@app.post("/database/reset")
def reset_database(request: ResetRequest) -> dict[str, Any]:
    """Restore the working database from the assignment's original database file."""
    if not request.confirm_reset:
        raise HTTPException(status_code=400, detail="Set confirm_reset to true to restore the database.")
    if not ORIGINAL_DATABASE_PATH.is_file():
        raise HTTPException(status_code=500, detail="Original database file not found.")
    try:
        with closing(sqlite3.connect(f"{ORIGINAL_DATABASE_PATH.as_uri()}?mode=ro", uri=True, timeout=10)) as source:
            with closing(sqlite3.connect(DATABASE_PATH, timeout=10)) as destination:
                source.backup(destination)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Unable to restore the working database.") from exc
    append_event({
        "event": "database_reset",
        "outcome": "restored_from_original",
        "reason": "prepare_final_gpt-6-luna_runs",
        "prepared_model": MODEL_NAME,
    })
    return {"status": "reset", "source": "data/campus_customs.db", "working_database": "data/campus_customs_new.db"}


async def _run(ticket_id: int | None) -> None:
    result = await run_ticket(ticket_id) if ticket_id is not None else await run_open_tickets()
    print(result.model_dump_json(indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Campus Customs agent team for one ticket.")
    parser.add_argument("--ticket", type=int, help="Process one ticket ID.")
    args = parser.parse_args()
    asyncio.run(_run(args.ticket))


if __name__ == "__main__":
    main()
