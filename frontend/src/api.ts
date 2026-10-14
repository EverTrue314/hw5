import type {
  AgentEvent,
  ApprovalProposal,
  ApprovalRequest,
  ApprovalResult,
  CheckingBalance,
  RunReport,
  Ticket,
} from './types'

const API_ROOT = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status}).`
    throw new Error(detail)
  }
  return payload as T
}

export const getTickets = () => request<Ticket[]>('/tickets')

export const runTicket = (ticketId: number) =>
  request<RunReport>(`/tickets/${ticketId}/run`, { method: 'POST' })

export const getRecentEvents = (limit = 100) =>
  request<AgentEvent[]>(`/events?limit=${limit}`, { cache: 'no-store' })

export const getPendingApprovals = () =>
  request<ApprovalProposal[]>('/approvals/pending', { cache: 'no-store' })

export const getCheckingBalance = () =>
  request<CheckingBalance>('/cash/checking', { cache: 'no-store' })

export const approveAction = (payload: ApprovalRequest) =>
  request<ApprovalResult>('/approvals', { method: 'POST', body: JSON.stringify(payload) })

export const resetDatabase = () =>
  request<{ status: string }>('/database/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm_reset: true }),
  })
