export type AgentKey = 'boss' | 'inventory' | 'accounting' | 'facilities' | 'customer_service'

export type Ticket = {
  ticket_id: number
  type: string
  subject: string
  sku: string | null
  size: string | null
  quantity: number | null
  lease_id: number | null
  lease_space_name: string | null
  lease_landlord: string | null
  lease_monthly_rent: number | null
  lease_next_due: string | null
  lease_notes: string | null
  invoice_id: number | null
  invoice_amount: number | null
  invoice_status: string | null
  invoice_due_date: string | null
  invoice_description: string | null
  invoice_vendor_id: number | null
  invoice_vendor_name: string | null
  invoice_vendor_specialty: string | null
  invoice_vendor_lead_days: number | null
  human_approved_action: {
    action_type: 'invoice_payment' | 'rent_payment' | 'purchase'
    amount: number
    invoice_id: number | null
    lease_id: number | null
    date: string | null
    approved_by: string
  } | null
  created_at: string
  status: 'open' | 'resolved'
  is_open: boolean
}

export type AgentFinding = {
  agent: AgentKey
  ticket_id: number
  status: 'complete' | 'needs_human_review' | 'blocked'
  findings: string[]
  recommendation: string
  draft_message?: string | null
  action_draft?: string | null
  human_approval_required: boolean
}

export type TicketDecision = {
  ticket_id: number
  summary: string
  specialist_findings: AgentFinding[]
  recommendation: string
  customer_message_draft?: string | null
  action_draft?: string | null
  human_approval_required: boolean
  unresolved_questions: string[]
}

export type RunReport = {
  decisions: TicketDecision[]
  stopped_reason: string | null
}

export type AgentStatement = {
  status?: string
  findings?: string[]
  recommendation?: string
  human_approval_required?: boolean
  decisions?: Array<{
    ticket_id: number
    summary: string
    specialist_findings: AgentFinding[]
    recommendation: string
    action_draft?: string | null
    unresolved_questions: string[]
    human_approval_required: boolean
  }>
  stopped_reason?: string | null
}

export type AgentEvent = {
  timestamp: string
  agent: AgentKey
  ticket_id: number
  run_id: string
  parent_run_id: string | null
  status: 'running' | 'completed' | 'failed'
  current_activity: string
  said: AgentStatement | null
  tools_used: string[]
}

export type CheckingBalance = {
  account: string
  balance: number
  date: string
}

export type ApprovalProposal = {
  ticket_id: number
  action_type: 'invoice_payment' | 'rent_payment' | 'purchase'
  invoice_id: number | null
  lease_id: number | null
  amount: number | null
  payee?: string | null
  purpose?: string | null
  due_date?: string | null
  draft: string
  recovered: boolean
  source_timestamp: string
}

export type ApprovalRequest = {
  action_type: 'invoice_payment' | 'rent_payment' | 'purchase'
  approved: boolean
  approved_by: string
  account_name: string
  invoice_id?: number
  lease_id?: number
  ticket_id?: number
  amount?: number
}

export type ApprovalResult = {
  status: string
  database_changed?: boolean
  action_type?: string
  amount?: number
  remaining_balance?: number
}
