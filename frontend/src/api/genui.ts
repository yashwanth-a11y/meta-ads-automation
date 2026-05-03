import { getAuthToken } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant'

export type ChartType = 'line' | 'bar' | 'pie' | 'funnel'

export interface StatItem {
  label: string
  value: string
  delta?: string
  unit?: string
}

export interface ChartPayload {
  chartType: ChartType
  title: string
  data: Record<string, unknown>[]
  xKey: string
  yKeys: string[]
  unit?: string
}

export interface ActionPayload {
  label: string
  actionType: 'pause_campaign' | 'scale_budget' | 'refresh_creative'
  payload: Record<string, unknown>
}

export interface AdDraft {
  objective: string
  audience: string
  budget: string
  schedule: string
  headlines: string[]
  primaryTexts: string[]
  cta: string
  riskFlags: string[]
}

export interface ToolStatus {
  toolName: string
  status: 'running' | 'done' | 'error'
  label?: string
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'chart'; data: ChartPayload }
  | { type: 'stat'; items: StatItem[] }
  | { type: 'action'; data: ActionPayload }
  | { type: 'ad_draft'; draft: AdDraft }
  | { type: 'suggested_prompts'; prompts: string[] }
  | { type: 'tool_status'; status: ToolStatus }

export interface ChatMessage {
  id: string
  role: ChatRole
  parts: MessagePart[]
  timestamp: string
}

export interface OutboundMessage {
  role: ChatRole
  content: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface StoredMessage {
  id: string
  conversation_id: string
  role: ChatRole
  parts: MessagePart[]
  created_at: string
}

// ─── Stream consumer ──────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export interface StreamHandlers {
  onText: (delta: string) => void
  onChart: (payload: ChartPayload) => void
  onStat: (items: StatItem[]) => void
  onAction: (action: ActionPayload) => void
  onAdDraft: (draft: AdDraft) => void
  onSuggestedPrompts: (prompts: string[]) => void
  onToolStatus: (status: ToolStatus) => void
  onConversationId: (id: string) => void
  onDone: () => void
  onError: (message: string) => void
}

export function streamChat(
  messages: OutboundMessage[],
  handlers: StreamHandlers,
  conversationId?: string | null,
): () => void {
  const controller = new AbortController()

  ;(async () => {
    try {
      const token = getAuthToken()
      const response = await fetch(`${BASE_URL}/api/v1/genui/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages, conversation_id: conversationId ?? null }),
        signal: controller.signal,
      })

      if (!response.ok) {
        handlers.onError(`Request failed: ${response.status}`)
        handlers.onDone()
        return
      }

      if (!response.body) {
        handlers.onError('No response stream')
        handlers.onDone()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? '' // keep incomplete chunk

        for (const part of parts) {
          const lines = part.trim().split('\n')
          let eventType = 'message'
          let dataLine = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              dataLine = line.slice(6).trim()
            }
          }

          if (!dataLine) continue

          let parsed: unknown
          try {
            parsed = JSON.parse(dataLine)
          } catch {
            continue
          }

          dispatchEvent(eventType, parsed, handlers)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      handlers.onError('Connection error. Please try again.')
      handlers.onDone()
    }
  })()

  return () => controller.abort()
}

function dispatchEvent(eventType: string, data: unknown, handlers: StreamHandlers) {
  switch (eventType) {
    case 'text':
      handlers.onText((data as { delta: string }).delta ?? '')
      break
    case 'chart':
      handlers.onChart(data as ChartPayload)
      break
    case 'stat':
      handlers.onStat(data as StatItem[])
      break
    case 'action':
      handlers.onAction(data as ActionPayload)
      break
    case 'ad_draft':
      handlers.onAdDraft(data as AdDraft)
      break
    case 'suggested_prompts':
      handlers.onSuggestedPrompts(data as string[])
      break
    case 'tool_status':
      handlers.onToolStatus(data as ToolStatus)
      break
    case 'conversation_id':
      handlers.onConversationId((data as { id: string }).id)
      break
    case 'error':
      handlers.onError((data as { message: string }).message ?? 'Unknown error')
      break
    case 'done':
      handlers.onDone()
      break
  }
}

// ─── Conversation REST API ────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function listConversations(limit = 30): Promise<Conversation[]> {
  const res = await fetch(`${BASE_URL}/api/v1/genui/conversations?limit=${limit}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`)
  const data = await res.json()
  return data.conversations
}

export async function getConversationMessages(conversationId: string): Promise<StoredMessage[]> {
  const res = await fetch(`${BASE_URL}/api/v1/genui/conversations/${conversationId}/messages`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`)
  const data = await res.json()
  return data.messages
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/genui/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`)
}
