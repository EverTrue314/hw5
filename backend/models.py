"""Structured outputs shared by the Campus Customs agent team."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AgentName = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]


class AgentFinding(BaseModel):
    """A bounded, evidence-based report from one specialist."""

    agent: AgentName
    ticket_id: int
    status: Literal["complete", "needs_human_review", "blocked"]
    findings: list[str] = Field(default_factory=list, description="Brief facts supported by MCP results")
    recommendation: str = Field(description="Next step; payments and external communication remain drafts")
    draft_message: str | None = Field(default=None, description="Optional customer message draft; never sent")
    action_draft: str | None = Field(default=None, description="Optional payment or purchase-order proposal for human review only")
    human_approval_required: bool = Field(default=False)


class TicketDecision(BaseModel):
    """Boss's consolidated decision for one ticket."""

    ticket_id: int
    summary: str
    specialist_findings: list[AgentFinding] = Field(default_factory=list)
    recommendation: str
    customer_message_draft: str | None = None
    action_draft: str | None = Field(default=None, description="Proposed payment, purchase, or other consequential action for human review only")
    human_approval_required: bool = Field(
        default=False,
        description="True for payment, purchase, price override, or other consequential action needing human review",
    )
    unresolved_questions: list[str] = Field(default_factory=list)


class BossReport(BaseModel):
    """Bounded report for one ticket or the current open-ticket queue."""

    decisions: list[TicketDecision] = Field(default_factory=list)
    stopped_reason: str | None = Field(default=None, description="Explain any work left for a budget or data limit")
