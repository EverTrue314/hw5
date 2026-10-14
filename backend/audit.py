"""Append-only, privacy-conscious JSON audit records for agent and MCP steps."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
AUDIT_PATH = PROJECT_DIR / "output" / "audit_trail.json"
_LOCK = threading.Lock()
_LOCK_PATH = AUDIT_PATH.with_suffix(".lock")
_SAFE_ARGUMENTS = {"ticket_id", "sku", "size", "lease_id", "invoice_id"}


def _safe_args(value: dict[str, Any]) -> dict[str, Any]:
    """Keep only operational identifiers; omit free text, people, amounts, and credentials."""
    return {
        key: item
        for key, item in value.items()
        if key in _SAFE_ARGUMENTS and isinstance(item, (str, int))
    }


def _safe_result_summary(value: Any) -> dict[str, Any]:
    """Summarize a tool result without recording its customer, vendor, or payment data."""
    if isinstance(value, dict):
        summary: dict[str, Any] = {"keys": sorted(str(key) for key in value)}
        for key in ("id", "ticket_id", "status"):
            if isinstance(value.get(key), (str, int)):
                summary[key] = value[key]
        return summary
    if isinstance(value, list):
        return {"record_count": len(value)}
    return {"result_type": type(value).__name__, "has_result": value is not None}


def append_event(event: dict[str, Any]) -> None:
    """Append one event to a valid JSON array while retaining all earlier records."""
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {"timestamp": datetime.now(timezone.utc).isoformat(), **event}
    with _LOCK:
        lock_descriptor = os.open(_LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(lock_descriptor, fcntl.LOCK_EX)
            records = _read_records_for_append()
            records.append(record)
            encoded = (json.dumps(records, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            descriptor, temporary_path = tempfile.mkstemp(prefix=".audit_trail.", dir=AUDIT_PATH.parent)
            try:
                os.fchmod(descriptor, 0o600)
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(encoded)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary_path, AUDIT_PATH)
                directory_descriptor = os.open(AUDIT_PATH.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
            except Exception:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass
                raise
        finally:
            fcntl.flock(lock_descriptor, fcntl.LOCK_UN)
            os.close(lock_descriptor)


def _read_records_for_append() -> list[dict[str, Any]]:
    """Read existing JSON-array or legacy JSONL records without discarding bad data."""
    if not AUDIT_PATH.exists():
        return []
    content = AUDIT_PATH.read_text(encoding="utf-8")
    if not content.strip():
        return []
    try:
        records = json.loads(content)
    except json.JSONDecodeError:
        records = [json.loads(line) for line in content.splitlines() if line.strip()]
    if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
        raise ValueError("Audit trail must contain a JSON array of event objects.")
    return records


def read_events() -> list[dict[str, Any]]:
    """Read event objects from the current JSON array or legacy JSONL format."""
    if not AUDIT_PATH.is_file():
        return []
    content = AUDIT_PATH.read_text(encoding="utf-8")
    if not content.strip():
        return []
    try:
        records = json.loads(content)
        return [item for item in records if isinstance(item, dict)] if isinstance(records, list) else []
    except json.JSONDecodeError:
        records = []
        for line in content.splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                records.append(event)
        return records


def safe_tool_start(args: dict[str, Any]) -> dict[str, Any]:
    return _safe_args(args)


def safe_tool_result(value: Any) -> dict[str, Any]:
    return _safe_result_summary(value)
