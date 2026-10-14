import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { approveAction, getCheckingBalance, getPendingApprovals, getRecentEvents, getTickets, resetDatabase, runTicket } from './api'
import type { AgentEvent, AgentKey, AgentStatement, ApprovalProposal, RunReport, Ticket, TicketDecision } from './types'

const agents: Array<{ key: AgentKey; name: string; job: string; shirt: string[]; shirtColor: string; outlineColor: string }> = [
  { key: 'boss', name: 'Boss', job: 'Team coordinator', shirt: ['BOSS'], shirtColor: '#102c6b', outlineColor: '#d8ae4c' },
  { key: 'inventory', name: 'Inventory', job: 'Stock & sourcing', shirt: ['INVENTORY'], shirtColor: '#286b49', outlineColor: '#6eae78' },
  { key: 'accounting', name: 'Accounting', job: 'Cash & margins', shirt: ['ACCOUNTING'], shirtColor: '#853d58', outlineColor: '#b45f79' },
  { key: 'facilities', name: 'Facilities', job: 'Space & leases', shirt: ['FACILITIES'], shirtColor: '#216e79', outlineColor: '#4a99a2' },
  { key: 'customer_service', name: 'Customer service', job: 'Customer drafts', shirt: ['CUSTOMER', 'SERVICE'], shirtColor: '#63418e', outlineColor: '#8962b4' },
]

function formatLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function dollar(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function amountFromDraft(value: string): number | null {
  const match = value.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
  if (!match) return null
  const amount = Number(match[1].replaceAll(',', ''))
  return Number.isFinite(amount) ? amount : null
}

function decisionFor(report: RunReport | undefined, ticketId: number): TicketDecision | undefined {
  return report?.decisions.find(decision => decision.ticket_id === ticketId)
}

function decisionFromEvents(events: AgentEvent[], ticketId: number) {
  const bossRun = events.find(event =>
    event.ticket_id === ticketId && event.agent === 'boss' && event.status === 'completed' &&
    event.said?.decisions?.some(decision => decision.ticket_id === ticketId),
  )
  return bossRun?.said?.decisions?.find(decision => decision.ticket_id === ticketId)
}

function eventStatement(event: AgentEvent): string[] {
  const said: AgentStatement | null = event.said
  if (!said) return []
  if (event.agent === 'boss') {
    const decision = said.decisions?.find(item => item.ticket_id === event.ticket_id)
    return [decision?.summary, decision?.recommendation].filter((item): item is string => Boolean(item))
  }
  return [...(said.findings ?? []), said.recommendation].filter((item): item is string => Boolean(item))
}

function completeSentence(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const capitalized = text.charAt(0).toLocaleUpperCase() + text.slice(1)
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function joinedSentences(values: string[]): string {
  return values.map(completeSentence).filter(Boolean).join(' ')
}

function BulldogAvatar({ agent, compact = false }: { agent: (typeof agents)[number]; compact?: boolean }) {
  const fontSize = agent.shirt.join('').length > 10 ? 8 : 9
  return (
    <svg
      className={`bulldog-avatar${compact ? ' bulldog-avatar-compact' : ''}`}
      viewBox="0 0 160 164"
      role="img"
      aria-label={`${agent.name}, ${agent.job}, illustrated as a Bulldog in a Campus Customs t-shirt`}
    >
      <circle cx="80" cy="79" r="73" fill="#f8f6ef" stroke={agent.outlineColor} strokeWidth="1.8" />
      <path
        d="M52 82 22 97l10 43 17-8 2 24h58l2-24 17 8 10-43-30-15c-6 9-16 14-28 14s-22-5-28-14Z"
        fill={agent.shirtColor}
        stroke={agent.outlineColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="m64 82 16 14 16-14" fill="none" stroke={agent.outlineColor} strokeWidth="2" />
      <image href="/bulldog-mark.svg" x="28" y="7" width="104" height="89" preserveAspectRatio="xMidYMid meet" />
      <path d="M62 111h36" stroke="#ffffff" strokeOpacity=".3" strokeWidth="1" />
      <text x="80" y={agent.shirt.length === 1 ? 128 : 121} textAnchor="middle" fill="#fff8e8" fontFamily="DM Sans, sans-serif" fontSize={fontSize} fontWeight="700" letterSpacing=".6">
        {agent.shirt.map((line, index) => (
          <tspan key={line} x="80" dy={index === 0 ? 0 : 10}>{line}</tspan>
        ))}
      </text>
    </svg>
  )
}

function StatusPill({ status }: { status: 'running' | 'completed' | 'failed' | 'idle' | 'open' | 'resolved' }) {
  const label = status === 'running' ? 'Working' : status === 'completed' ? 'Complete' : status === 'failed' ? 'Needs attention' : status
  return <span className={`status-pill status-${status}`}><span className="status-dot" />{label}</span>
}

function AgentNode({ agent, event, nodeRef }: { agent: (typeof agents)[number]; event?: AgentEvent; nodeRef?: (node: HTMLElement | null) => void }) {
  const status = event?.status ?? 'idle'
  return (
    <article ref={nodeRef} className={`agent-node agent-node-${agent.key}${status === 'running' ? ' agent-node-live' : ''}`}>
      <div className="agent-node-topline"><span className="agent-job">{agent.job}</span><StatusPill status={status} /></div>
      <div className="agent-portrait-row">
        <BulldogAvatar agent={agent} />
        <div className="agent-identity"><h3>{agent.name}</h3><p>{event?.current_activity ?? 'Ready for a ticket'}</p></div>
      </div>
      {event?.tools_used?.length ? (
        <div className="tool-chip-list" aria-label={`${agent.name} MCP tools used`}>
          {event.tools_used.map(tool => <span className="tool-chip" key={tool}><Wrench size={11} />{tool.replace('campus-customs_', '')}</span>)}
        </div>
      ) : <p className="agent-empty">Tool calls will appear here as work starts.</p>}
    </article>
  )
}

function statementForDecision(decision?: TicketDecision): string[] {
  if (!decision) return []
  return [decision.summary, decision.recommendation].filter(Boolean)
}

function TicketCard({
  ticket,
  expanded,
  selected,
  running,
  report,
  persistedDecision,
  pendingApproval,
  onToggle,
  onRun,
  onApproved,
  balance,
}: {
  ticket: Ticket
  expanded: boolean
  selected: boolean
  running: boolean
  report?: RunReport
  persistedDecision?: Pick<TicketDecision, 'summary' | 'recommendation' | 'action_draft'>
  pendingApproval?: ApprovalProposal
  onToggle: () => void
  onRun: () => void
  onApproved: () => Promise<void>
  balance: number | null
}) {
  const decision = decisionFor(report, ticket.ticket_id)
  const hasRunSummary = Boolean(decision || persistedDecision)
  const summaries = decision
    ? statementForDecision(decision)
    : persistedDecision ? [persistedDecision.summary, persistedDecision.recommendation].filter(Boolean) : []
  return (
    <article className={`ticket-card${selected ? ' ticket-card-selected' : ''}${expanded ? ' ticket-card-expanded' : ''}`}>
      <button className="ticket-card-trigger" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="ticket-number">#{ticket.ticket_id}</span>
        <span className="ticket-trigger-copy">
          <strong>{ticket.subject}</strong>
          <span className="ticket-trigger-meta">
            <small>{formatLabel(ticket.type)}</small>
            <StatusPill status={ticket.status} />
            {ticket.human_approved_action && <span className="approved-badge" title={`Approved by ${ticket.human_approved_action.approved_by}: ${ticket.human_approved_action.action_type === 'invoice_payment' ? 'invoice payment' : ticket.human_approved_action.action_type === 'rent_payment' ? 'rent payment' : 'purchase'} of ${dollar(ticket.human_approved_action.amount)}`}><ShieldCheck size={14} />Approved</span>}
          </span>
        </span>
        <ChevronDown className="ticket-chevron" size={17} />
      </button>
      {expanded && <div className="ticket-detail" id={`ticket-detail-${ticket.ticket_id}`}>
        <div className="ticket-facts">
          <div><span>Request type</span><strong>{formatLabel(ticket.type)}</strong></div>
          {ticket.sku && <div><span>SKU</span><strong>{ticket.sku}</strong></div>}
          {ticket.size && <div><span>Size</span><strong>{ticket.size}</strong></div>}
          {ticket.quantity !== null && <div><span>Quantity</span><strong>{ticket.quantity}</strong></div>}
          {ticket.invoice_id !== null && <div><span>Linked invoice</span><strong>#{ticket.invoice_id}</strong></div>}
          {ticket.invoice_vendor_name && <div><span>Invoice supplier</span><strong>{ticket.invoice_vendor_name}</strong></div>}
          {ticket.lease_id != null && <div><span>Lease</span><strong>#{ticket.lease_id}{ticket.lease_space_name ? ` · ${ticket.lease_space_name}` : ''}</strong></div>}
          {ticket.lease_landlord && <div><span>Landlord</span><strong>{ticket.lease_landlord}</strong></div>}
          {ticket.lease_monthly_rent != null && Number.isFinite(ticket.lease_monthly_rent) && <div><span>Monthly rent</span><strong>{dollar(ticket.lease_monthly_rent)}</strong></div>}
          {ticket.lease_next_due && <div><span>Next rent due</span><strong>{ticket.lease_next_due}</strong></div>}
          <div><span>Created</span><strong>{new Date(ticket.created_at).toLocaleDateString()}</strong></div>
        </div>
        {ticket.human_approved_action && <div className="approved-action-note">
          <ShieldCheck size={17} />
          <span>
            <strong>Human approval recorded · {ticket.human_approved_action.approved_by}</strong>
            <small>
              {ticket.human_approved_action.action_type === 'invoice_payment'
                ? `Invoice #${ticket.human_approved_action.invoice_id} payment of ${dollar(ticket.human_approved_action.amount)}`
                : ticket.human_approved_action.action_type === 'rent_payment'
                  ? `Rent payment of ${dollar(ticket.human_approved_action.amount)} for ${ticket.lease_space_name ?? `lease #${ticket.human_approved_action.lease_id}`}`
                  : `Purchase of ${dollar(ticket.human_approved_action.amount)}`}
              {ticket.human_approved_action.date ? ` · ${ticket.human_approved_action.date}` : ''}.{' '}
              {ticket.human_approved_action.action_type === 'invoice_payment'
                ? 'This confirms the payment was completed after the team reported the invoice unpaid.'
                : 'The approved cash action was recorded after human review.'}
            </small>
          </span>
        </div>}
        {summaries.length > 0 && <div className="ticket-run-summary"><span className="mini-label">Latest team summary</span><p>{joinedSentences(summaries)}</p></div>}
        {(decision?.recommendation || decision?.action_draft || persistedDecision?.recommendation || persistedDecision?.action_draft) && (
          <div className="ticket-recommendation">
            <span className="mini-label">Recommendation and draft</span>
            {(decision?.recommendation ?? persistedDecision?.recommendation) && <p><strong>Boss recommendation</strong>{completeSentence(decision?.recommendation ?? persistedDecision?.recommendation ?? '')}</p>}
            {(decision?.action_draft ?? persistedDecision?.action_draft) && <p><strong>Agent draft</strong>{completeSentence(decision?.action_draft ?? persistedDecision?.action_draft ?? '')}</p>}
          </div>
        )}
        <div className="ticket-detail-footer">
          <span className="ticket-status-copy"><StatusPill status={ticket.status} />{ticket.status === 'resolved' ? 'The latest team run has finished.' : 'Ready for the agent team.'}</span>
          <button className="button button-primary ticket-run-button" type="button" onClick={onRun} disabled={running}>
            {running ? <><Loader2 className="spin" size={16} />Team working</> : <><Play size={15} fill="currentColor" />{hasRunSummary ? 'Run team again' : 'Start agent team'}<ArrowRight size={15} /></>}
          </button>
        </div>
        {pendingApproval ? (
          <ApprovalPanel ticket={ticket} proposal={pendingApproval} draft={pendingApproval.draft} recovered={pendingApproval.recovered} balance={balance} onApproved={onApproved} />
        ) : decision?.action_draft && decision.human_approval_required ? (
          <div className="approval-note"><ShieldCheck size={17} /><span>Agent draft requires human review, but there is no verified payment or purchase proposal available to approve. See the run summary for the recommendation.</span></div>
        ) : null}
      </div>}
    </article>
  )
}

function approvalType(proposal?: ApprovalProposal): 'invoice_payment' | 'rent_payment' | 'purchase' | null {
  return proposal?.action_type ?? null
}

function ApprovalPanel({ ticket, proposal, draft, recovered = false, balance, onApproved }: { ticket: Ticket; proposal?: ApprovalProposal; draft: string; recovered?: boolean; balance: number | null; onApproved: () => Promise<void> }) {
  const type = approvalType(proposal)
  const [invoiceId, setInvoiceId] = useState(String(ticket.invoice_id ?? proposal?.invoice_id ?? ''))
  const invoiceAmount = ticket.invoice_amount === null ? null : String(ticket.invoice_amount)
  const usableNumber = (value: number | null | undefined): number | null => value != null && Number.isFinite(value) ? value : null
  const leaseId = ticket.lease_id ?? proposal?.lease_id ?? null
  const leaseAmountValue = usableNumber(ticket.lease_monthly_rent) ?? (proposal?.action_type === 'rent_payment' ? usableNumber(proposal.amount) : null)
  const leaseAmount = leaseAmountValue === null ? null : String(leaseAmountValue)
  const leaseProperty = ticket.lease_space_name ?? proposal?.purpose?.replace(/^Monthly rent for\s*/i, '') ?? null
  const leasePayee = ticket.lease_landlord ?? proposal?.payee ?? null
  const leaseDueDate = ticket.lease_next_due ?? proposal?.due_date ?? null
  const proposalAmount = usableNumber(proposal?.amount)
  const parsedAmount = amountFromDraft(draft)
  const initialAmount = proposalAmount === null ? '' : String(proposalAmount)
  const [amount, setAmount] = useState(initialAmount)
  const [account, setAccount] = useState('checking')
  const [approver, setApprover] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setInvoiceId(String(ticket.invoice_id ?? proposal?.invoice_id ?? ''))
    const currentProposalAmount = usableNumber(proposal?.amount)
    setAmount(currentProposalAmount === null ? '' : String(currentProposalAmount))
    setMessage('')
    setError('')
  }, [ticket.ticket_id, proposal?.invoice_id, proposal?.amount])

  if (!type) return <div className="approval-note"><ShieldCheck size={17} /><span>Human review requested. This proposal is not a payment or purchase action.</span></div>
  const actionType = type

  async function submit(approved: boolean) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await approveAction({
        action_type: actionType,
        approved,
        approved_by: approver.trim(),
        account_name: account.trim(),
        ...(actionType === 'invoice_payment' ? { invoice_id: Number(invoiceId), ...(approved ? { amount: Number(amount) } : {}) } : {}),
        ...(actionType === 'rent_payment' ? { ticket_id: ticket.ticket_id, lease_id: leaseId!, ...(approved ? { amount: Number(amount) } : {}) } : {}),
        ...(actionType === 'purchase' ? { ticket_id: ticket.ticket_id, ...(approved ? { amount: Number(amount) } : {}) } : {}),
      })
      if (approved) {
        setMessage(`Approved and recorded. Checking now shows ${dollar(response.remaining_balance ?? balance ?? 0)}.`)
        await onApproved()
      } else {
        setMessage('Declined. Cash and payment records were left unchanged.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The approval could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="approval-panel" aria-labelledby={`approval-${ticket.ticket_id}`}>
      <div className="approval-heading"><span className="approval-icon"><ShieldCheck size={18} /></span><div><span className="mini-label">Human review required</span><h3 id={`approval-${ticket.ticket_id}`}>Approve {actionType === 'invoice_payment' ? 'invoice payment' : actionType === 'rent_payment' ? 'rent payment' : 'purchase'}</h3></div></div>
      <blockquote>{draft}</blockquote>
      {recovered && <p className="invoice-discrepancy">This approval request was recovered from the audit trail and checked against the current database record.</p>}
      {actionType === 'rent_payment' && <div className="rent-purpose-card"><div><span>Payee</span><strong>{leasePayee ?? 'Not recorded'}</strong></div><div><span>Purpose</span><strong>{leaseProperty ? `Monthly rent · ${leaseProperty}` : `Monthly rent · Lease #${leaseId ?? 'unknown'}`}</strong></div><div><span>Due date</span><strong>{leaseDueDate ?? 'Not recorded'}</strong></div></div>}
      <div className="approval-amount-callout"><span>{actionType === 'invoice_payment' ? 'Invoice amount requiring approval' : actionType === 'rent_payment' ? 'Lease monthly rent requiring approval' : 'Proposed amount requiring approval'}</span><strong>{amount ? dollar(Number(amount)) : 'Amount not provided'}</strong></div>
      {actionType === 'invoice_payment' && <details className="invoice-details">
        <summary>Invoice #{invoiceId || 'unknown'} details</summary>
        <dl>
          <div><dt>Invoice total</dt><dd>{ticket.invoice_amount === null ? 'Unavailable' : dollar(ticket.invoice_amount)}</dd></div>
          <div><dt>Status</dt><dd>{ticket.invoice_status ?? 'Unavailable'}</dd></div>
          <div><dt>Due date</dt><dd>{ticket.invoice_due_date ?? 'Unavailable'}</dd></div>
          <div><dt>Description</dt><dd>{ticket.invoice_description ?? 'Unavailable'}</dd></div>
          <div><dt>Linked supplier</dt><dd>{ticket.invoice_vendor_name ?? 'Unavailable'}</dd></div>
          <div><dt>Recorded specialty</dt><dd>{ticket.invoice_vendor_specialty ?? 'Unavailable'}</dd></div>
          <div><dt>Recorded lead time</dt><dd>{ticket.invoice_vendor_lead_days === null ? 'Unavailable' : `${ticket.invoice_vendor_lead_days} days`}</dd></div>
        </dl>
        {ticket.invoice_vendor_name && <p className="invoice-discrepancy">This is the supplier linked to the invoice. The database does not confirm a SKU-to-vendor restock relationship or delivery quantity.</p>}
        {invoiceAmount !== null && parsedAmount !== null && Number(invoiceAmount) !== Number(parsedAmount) && <p className="invoice-discrepancy">The agent draft lists {dollar(Number(parsedAmount))}, while the linked invoice total is {dollar(Number(invoiceAmount))}. This is an invoice amount mismatch, not the checking balance; approval uses the recorded invoice total.</p>}
      </details>}
      {actionType === 'rent_payment' && <details className="invoice-details">
        <summary>Lease #{leaseId ?? 'unknown'} details</summary>
        <dl>
          <div><dt>Property</dt><dd>{leaseProperty ?? 'Unavailable'}</dd></div>
          <div><dt>Landlord / payee</dt><dd>{leasePayee ?? 'Unavailable'}</dd></div>
          <div><dt>Monthly rent</dt><dd>{leaseAmountValue === null ? 'Unavailable' : dollar(leaseAmountValue)}</dd></div>
          <div><dt>Next due date</dt><dd>{leaseDueDate ?? 'Unavailable'}</dd></div>
          <div><dt>Lease notes</dt><dd>{ticket.lease_notes ?? 'No notes recorded'}</dd></div>
        </dl>
      </details>}
      <form className="approval-form" onSubmit={event => { event.preventDefault(); void submit(true) }}>
        {actionType === 'invoice_payment' && <label>Invoice ID<input type="number" min="1" required value={invoiceId} readOnly /></label>}
        <label>{actionType === 'invoice_payment' ? 'Invoice amount' : actionType === 'rent_payment' ? 'Lease rent amount' : 'Approved amount'}<input type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} readOnly={actionType !== 'purchase'} placeholder="Amount must be present in the approval request" /></label>
        <label>Cash account<select value={account} onChange={event => setAccount(event.target.value)}><option value="checking">Checking</option></select></label>
        <label>Approver name or initials<input required maxLength={100} value={approver} onChange={event => setApprover(event.target.value)} placeholder="Required for the payment record" /></label>
        <div className="approval-balance"><span>Available checking</span><strong>{balance === null ? 'Loading…' : dollar(balance)}</strong></div>
        <p className="approval-guardrail">Cash changes only after you approve. The server rechecks the recorded {actionType === 'invoice_payment' ? 'invoice' : actionType === 'rent_payment' ? 'lease rent and ticket link' : 'purchase'} amount and available balance before recording it.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {message && <p className="inline-success" role="status">{message}</p>}
        <div className="approval-actions">
          <button className="button button-outline" type="button" disabled={busy || !approver.trim()} onClick={() => { void submit(false) }}>Decline</button>
          <button className="button button-approve" type="submit" disabled={busy || !approver.trim() || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || (actionType === 'invoice_payment' && (!invoiceId || Number(invoiceId) <= 0 || invoiceAmount === null)) || (actionType === 'rent_payment' && (!leaseId || leaseAmount === null))}>
            {busy ? <><Loader2 className="spin" size={15} />Saving…</> : <><Check size={16} />Approve & record</>}
          </button>
        </div>
      </form>
    </section>
  )
}

function eventMessage(event: AgentEvent): string {
  const statement = joinedSentences(eventStatement(event))
  return statement || completeSentence(event.current_activity)
}

function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [checking, setChecking] = useState<number | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalProposal[]>([])
  const [reports, setReports] = useState<Record<number, RunReport>>({})
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(101)
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(101)
  const [runningTicketId, setRunningTicketId] = useState<number | null>(null)
  const teamChartRef = useRef<HTMLDivElement>(null)
  const agentNodeRefs = useRef<Partial<Record<AgentKey, HTMLElement | null>>>({})
  const lastFlightKey = useRef('')
  const flightTimer = useRef<number | null>(null)
  const [delegationFlight, setDelegationFlight] = useState<{ key: string; path: string } | null>(null)
  const [runStartedAt, setRunStartedAt] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refreshEvents() {
    try {
      const [recent, approvals] = await Promise.all([getRecentEvents(), getPendingApprovals()])
      setEvents(recent)
      setPendingApprovals(approvals)
    } catch (cause) {
      if (runningTicketId !== null) setError(cause instanceof Error ? cause.message : 'Could not refresh agent events.')
    }
  }

  async function refreshBoard() {
    const [ticketRows, balanceRow, recentEvents, approvals] = await Promise.all([getTickets(), getCheckingBalance(), getRecentEvents(), getPendingApprovals()])
    setTickets(ticketRows)
    setChecking(balanceRow.balance)
    setEvents(recentEvents)
    setPendingApprovals(approvals)
  }

  useEffect(() => {
    let active = true
    Promise.all([getTickets(), getCheckingBalance(), getRecentEvents(), getPendingApprovals()])
      .then(([ticketRows, balanceRow, recentEvents, approvals]) => {
        if (!active) return
        setTickets(ticketRows)
        setChecking(balanceRow.balance)
        setEvents(recentEvents)
        setPendingApprovals(approvals)
        setError('')
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'The backend could not be reached.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshEvents() }, runningTicketId === null ? 8000 : 1000)
    return () => window.clearInterval(timer)
  }, [runningTicketId])

  const selectedTicket = tickets.find(ticket => ticket.ticket_id === selectedTicketId) ?? null
  const visibleEvents = useMemo(() => {
    if (selectedTicketId === null) return []
    const startAt = runStartedAt[selectedTicketId]
    return events.filter(event => event.ticket_id === selectedTicketId && (!startAt || new Date(event.timestamp).getTime() >= startAt))
  }, [events, runStartedAt, selectedTicketId])
  const selectedReport = selectedTicketId === null ? undefined : reports[selectedTicketId]
  const selectedDecision = selectedTicketId === null ? undefined : decisionFor(selectedReport, selectedTicketId)
  const selectedPersistedDecision = selectedTicketId === null ? undefined : decisionFromEvents(visibleEvents, selectedTicketId)

  async function startRun(ticket: Ticket) {
    if (runningTicketId !== null) return
    setSelectedTicketId(ticket.ticket_id)
    setExpandedTicketId(ticket.ticket_id)
    setRunningTicketId(ticket.ticket_id)
    setRunStartedAt(current => ({ ...current, [ticket.ticket_id]: Date.now() }))
    setReports(current => { const next = { ...current }; delete next[ticket.ticket_id]; return next })
    setError('')
    setNotice(`The team is starting on ticket #${ticket.ticket_id}.`)
    try {
      const report = await runTicket(ticket.ticket_id)
      setReports(current => ({ ...current, [ticket.ticket_id]: report }))
      setTickets(current => current.map(item => item.ticket_id === ticket.ticket_id ? { ...item, status: 'resolved', is_open: false } : item))
      setNotice(`Ticket #${ticket.ticket_id} is resolved. The team run has finished.`)
      try {
        await refreshBoard()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Dashboard refresh failed.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The agent run failed.')
      setNotice('The ticket remains open because the team run did not finish.')
    } finally {
      setRunningTicketId(null)
    }
  }

  async function handleApprovalRecorded() {
    await refreshBoard()
    setNotice('Human approval recorded. The balance now reflects the approved action.')
  }

  async function handleReset() {
    if (!window.confirm('Restore the working database to the supplied original values? Ticket statuses and cash changes will reset.')) return
    setResetting(true)
    setError('')
    try {
      await resetDatabase()
      setReports({})
      setRunStartedAt({})
      await refreshBoard()
      setNotice('The working database has been restored to its original values.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The database could not be reset.')
    } finally {
      setResetting(false)
    }
  }

  function toggleTicket(ticket: Ticket) {
    setSelectedTicketId(ticket.ticket_id)
    setExpandedTicketId(current => current === ticket.ticket_id ? null : ticket.ticket_id)
    setNotice('')
  }

  const bossEvent = visibleEvents.find(event => event.agent === 'boss')
  const specialistEvents = visibleEvents.filter(event => event.agent !== 'boss')
  const hierarchyEvents = new Map<AgentKey, AgentEvent>()
  for (const agent of agents) {
    const current = visibleEvents.find(event => event.agent === agent.key)
    if (current) hierarchyEvents.set(agent.key, current)
  }

  useLayoutEffect(() => {
    if (runningTicketId === null || !teamChartRef.current) return
    const delegated = [...visibleEvents]
      .filter(event => event.agent !== 'boss' && event.parent_run_id && (event.status === 'running' || event.status === 'completed'))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .find(event => {
        const parent = visibleEvents.find(item => item.run_id === event.parent_run_id)
        return parent?.agent === 'boss'
      })
    if (!delegated) return
    const direction = delegated.status === 'running' ? 'out' : 'back'
    const flightKey = `${delegated.run_id}:${direction}`
    if (lastFlightKey.current === flightKey) return
    const chart = teamChartRef.current.getBoundingClientRect()
    const boss = agentNodeRefs.current.boss?.getBoundingClientRect()
    const specialist = agentNodeRefs.current[delegated.agent]?.getBoundingClientRect()
    if (!boss || !specialist) return
    const center = (rect: DOMRect) => ({ x: rect.left - chart.left + rect.width / 2, y: rect.top - chart.top + rect.height / 2 })
    const from = direction === 'out' ? center(boss) : center(specialist)
    const to = direction === 'out' ? center(specialist) : center(boss)
    const curveY = Math.min(from.y, to.y) - Math.max(25, Math.abs(to.x - from.x) * 0.12)
    const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${curveY} ${to.x} ${to.y}`
    lastFlightKey.current = flightKey
    setDelegationFlight({ key: flightKey, path })
    if (flightTimer.current !== null) window.clearTimeout(flightTimer.current)
    flightTimer.current = window.setTimeout(() => setDelegationFlight(null), 950)
  }, [visibleEvents, runningTicketId])

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Campus Customs agent desk">
          <span className="brand-seal">CC</span><span className="brand-name">CAMPUS<br />CUSTOMS</span>
          <span className="brand-divider" /><span className="brand-section">AGENT DESK</span>
        </a>
        <div className="topbar-actions">
          <div className="cash-balance" aria-live="polite">
            <span className="cash-icon"><CircleDollarSign size={18} /></span>
            <span><small>CHECKING BALANCE</small><strong>{checking === null ? '—' : dollar(checking)}</strong></span>
            <span className="cash-caption">Updates after human approval</span>
          </div>
          <button className="icon-button" type="button" onClick={() => { void refreshBoard().catch(cause => setError(cause.message)) }} aria-label="Refresh dashboard"><RefreshCw size={17} /></button>
          <button className="reset-button" type="button" onClick={() => { void handleReset() }} disabled={resetting || runningTicketId !== null}>
            {resetting ? <Loader2 className="spin" size={15} /> : <RotateCcw size={15} />}<span>Reset data</span>
          </button>
        </div>
      </header>

      <main id="top" className="dashboard-main">
        <section className="intro-row">
          <div><span className="eyebrow">Campus Customs · Operations</span><h1>Ticket <em>desk</em></h1><p>Bring the right people and the right evidence together.</p></div>
          <div className={`connection-chip${runningTicketId !== null ? ' connection-live' : ''}`}><span className="connection-dot" />{runningTicketId !== null ? `TEAM ACTIVE · #${runningTicketId}` : 'TEAM READY'}</div>
        </section>

        {error && <div className="alert alert-error" role="alert"><span>{error}</span><small>Check the append-only audit trail for the agent and tool step that failed. Failed runs leave tickets open; payments still require human approval.</small></div>}
        {notice && !error && <div className="alert alert-notice" role="status"><Check size={15} />{notice}</div>}

        <section className="ticket-section" aria-labelledby="tickets-heading">
          <div className="section-title-row"><div><span className="eyebrow">The queue</span><h2 id="tickets-heading">Open <em>tickets</em></h2></div><span className="queue-count">{loading ? 'Loading…' : `${tickets.length} tickets`}</span></div>
          <div className="ticket-list">
            {tickets.map(ticket => (
              <TicketCard
                key={ticket.ticket_id}
                ticket={ticket}
                selected={selectedTicketId === ticket.ticket_id}
                expanded={expandedTicketId === ticket.ticket_id}
                running={runningTicketId === ticket.ticket_id}
                report={reports[ticket.ticket_id]}
                persistedDecision={decisionFromEvents(events, ticket.ticket_id)}
                pendingApproval={pendingApprovals.find(item => item.ticket_id === ticket.ticket_id)}
                balance={checking}
                onToggle={() => toggleTicket(ticket)}
                onRun={() => { void startRun(ticket) }}
                onApproved={handleApprovalRecorded}
              />
            ))}
            {!loading && tickets.length === 0 && <div className="empty-card">No tickets were returned by the backend.</div>}
          </div>
        </section>

        <section className="workspace-grid" aria-label="Agent team and activity">
          <div className="panel team-panel">
            <div className="panel-heading"><div><span className="eyebrow">Team roster</span><h2>Meet the <em>pack</em></h2></div><span className="panel-meta"><span className="legend-dot" /> Five connected agents</span></div>
            <div className="org-chart" ref={teamChartRef} aria-label="Agent hierarchy with Boss coordinating four specialists">
              <div className="boss-node"><AgentNode agent={agents[0]} event={bossEvent} nodeRef={node => { agentNodeRefs.current.boss = node }} /></div>
              <div className="org-stem" aria-hidden="true" />
              <div className="agent-grid">
                {agents.slice(1).map(agent => <AgentNode key={agent.key} agent={agent} event={hierarchyEvents.get(agent.key)} nodeRef={node => { agentNodeRefs.current[agent.key] = node }} />)}
              </div>
              <div className="peer-link"><span className="peer-dashes" aria-hidden="true">························</span><span>Specialists can coordinate directly when work depends on another role</span><span className="peer-dashes" aria-hidden="true">························</span></div>
              {delegationFlight && <svg className="delegation-flight" aria-hidden="true"><path d={delegationFlight.path} className="delegation-flight-trail" /><g className="tennis-ball"><animateMotion key={delegationFlight.key} path={delegationFlight.path} dur=".85s" fill="freeze" /><circle r="10" fill="#d9ec55" stroke="#40531b" strokeWidth="1.4" /><path d="M-4-8C1-4 1 4-4 8M4-8C-1-4-1 4 4 8" fill="none" stroke="#fff" strokeWidth="1.6" /></g></svg>}
            </div>
          </div>

          <aside className="panel activity-panel" aria-labelledby="activity-heading">
            <div className="panel-heading"><div><span className="eyebrow">Run stream</span><h2 id="activity-heading">Live <em>activity</em></h2></div><span className={`live-badge${runningTicketId !== null ? ' is-live' : ''}`}><Activity size={14} />{runningTicketId !== null ? 'LIVE' : 'RECENT'}</span></div>
            <p className="activity-context">{selectedTicket ? `Ticket #${selectedTicket.ticket_id} · ${selectedTicket.subject}` : 'Choose a ticket to view activity'}</p>
            <div className="activity-list" aria-live="polite">
              {visibleEvents.slice(0, 9).map(event => {
                const parent = event.parent_run_id ? events.find(item => item.run_id === event.parent_run_id) : undefined
                return <article className={`activity-item activity-${event.status}`} key={event.run_id}>
                  <span className="activity-marker">{event.status === 'running' ? <Loader2 className="spin" size={13} /> : event.status === 'completed' ? <Check size={13} /> : <Clock3 size={13} />}</span>
                  <div className="activity-copy"><div className="activity-item-title"><strong>{agents.find(agent => agent.key === event.agent)?.name ?? formatLabel(event.agent)}</strong><span>{formatTime(event.timestamp)}</span></div>
                    <small>{parent ? `Delegated by ${agents.find(agent => agent.key === parent.agent)?.name ?? formatLabel(parent.agent)}` : event.current_activity}</small>
                    <p>{eventMessage(event)}</p>
                    {!!event.tools_used.length && <div className="activity-tools">{event.tools_used.map(tool => <span key={tool}><Wrench size={10} />{tool.replace('campus-customs_', '')}</span>)}</div>}
                  </div>
                </article>}
              )}
              {visibleEvents.length === 0 && <div className="activity-empty"><span className="empty-orbit"><Activity size={20} /></span><strong>{runningTicketId === selectedTicketId ? 'Agents are starting' : 'Ready when you are'}</strong><p>Start a ticket run to see delegations, tool calls, and agent summaries.</p></div>}
            </div>
            {(selectedDecision || selectedPersistedDecision) && <div className="decision-summary"><span className="mini-label">Boss summary</span><p>{completeSentence(selectedDecision?.recommendation ?? selectedPersistedDecision?.recommendation ?? '')}</p>{(selectedDecision?.unresolved_questions ?? selectedPersistedDecision?.unresolved_questions ?? []).length > 0 && <small>{(selectedDecision?.unresolved_questions ?? selectedPersistedDecision?.unresolved_questions ?? []).length} open question{(selectedDecision?.unresolved_questions ?? selectedPersistedDecision?.unresolved_questions ?? []).length === 1 ? '' : 's'} for human review</small>}</div>}
            {specialistEvents.length > 0 && <div className="activity-footnote">Findings refresh during the run; private model reasoning is not displayed.</div>}
          </aside>
        </section>

        <footer className="dashboard-footer"><span className="footer-mark">CC</span><span>Campus Customs · Agent operations</span><span>Shop facts from the assignment database</span></footer>
      </main>
    </div>
  )
}

export default App
