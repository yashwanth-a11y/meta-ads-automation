import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  OutlinedInput,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import CampaignIcon from '@mui/icons-material/Campaign'
import BarChartIcon from '@mui/icons-material/BarChart'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'
import { ChatMessage } from '../components/genui/ChatMessage'
import {
  streamChat,
  listConversations,
  getConversationMessages,
  deleteConversation,
  type ChatMessage as ChatMessageType,
  type Conversation,
  type MessagePart,
  type OutboundMessage,
} from '../api/genui'
import logo from '../assets/favicon.svg'

const uuidv4 = () => crypto.randomUUID()

// ─── Suggested prompts ────────────────────────────────────────────────────────

const EMPTY_STATE_PROMPTS = [
  { icon: <TrendingUpIcon sx={{ fontSize: 20, color: '#22D3EE' }} />, label: 'Campaign performance', prompt: 'Which campaign got the most leads this week?' },
  { icon: <CampaignIcon sx={{ fontSize: 20, color: '#A855F7' }} />, label: 'Create an ad', prompt: 'Create an ad for WhatsApp automation, D2C brands India, ₹1000/day' },
  { icon: <BarChartIcon sx={{ fontSize: 20, color: '#F97316' }} />, label: 'Top creatives', prompt: 'Show me my top performing creatives this month' },
  { icon: <AutoAwesomeIcon sx={{ fontSize: 20, color: '#34D399' }} />, label: 'Detect anomalies', prompt: 'Are there any anomalies in my ad spend or CTR?' },
]

// ─── GenUI Page ───────────────────────────────────────────────────────────────

export default function GenUIPage() {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [streamingParts, setStreamingParts] = useState<MessagePart[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')

  // Conversation history state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const streamingIdRef = useRef<string | null>(null)

  // Load conversation list on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Auto-scroll as content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingParts])

  async function loadConversations() {
    try {
      const list = await listConversations(50)
      setConversations(list)
    } catch { /* non-fatal */ }
  }

  async function openConversation(conv: Conversation) {
    if (activeConversationId === conv.id) return
    if (isStreaming) return

    setHistoryLoading(true)
    try {
      const stored = await getConversationMessages(conv.id)
      const hydrated: ChatMessageType[] = stored.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        timestamp: m.created_at,
      }))
      setMessages(hydrated)
      setStreamingParts([])
      setActiveConversationId(conv.id)
    } catch { /* non-fatal */ } finally {
      setHistoryLoading(false)
    }
  }

  async function handleDeleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    try {
      await deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversationId === id) {
        setActiveConversationId(null)
        setMessages([])
        setStreamingParts([])
      }
    } catch { /* non-fatal */ }
  }

  function startNewConversation() {
    if (isStreaming) return
    setActiveConversationId(null)
    setMessages([])
    setStreamingParts([])
    setInput('')
  }

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      setInput('')

      const userMsg: ChatMessageType = {
        id: uuidv4(),
        role: 'user',
        parts: [{ type: 'text', text: trimmed }],
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMsg])
      setStreamingParts([])
      setIsStreaming(true)

      const assistantId = uuidv4()
      streamingIdRef.current = assistantId

      const outbound: OutboundMessage[] = [...messages, userMsg]
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as Extract<MessagePart, { type: 'text' }>).text)
            .join(''),
        }))

      let localParts: MessagePart[] = []

      const abort = streamChat(
        outbound,
        {
          onText: (delta) => {
            // flushSync forces a render per delta so text streams word-by-word
            // instead of appearing in batched chunks
            flushSync(() => {
              setStreamingParts((prev) => {
                const last = prev[prev.length - 1]
                if (last?.type === 'text') {
                  const updated = [...prev]
                  updated[updated.length - 1] = { type: 'text', text: last.text + delta }
                  localParts = updated
                  return updated
                }
                const next = [...prev, { type: 'text' as const, text: delta }]
                localParts = next
                return next
              })
            })
          },
          onChart: (payload) => {
            setStreamingParts((prev) => {
              const next = [...prev, { type: 'chart' as const, data: payload }]
              localParts = next
              return next
            })
          },
          onStat: (items) => {
            setStreamingParts((prev) => {
              const next = [...prev, { type: 'stat' as const, items }]
              localParts = next
              return next
            })
          },
          onAction: (data) => {
            setStreamingParts((prev) => {
              const next = [...prev, { type: 'action' as const, data }]
              localParts = next
              return next
            })
          },
          onAdDraft: (draft) => {
            setStreamingParts((prev) => {
              const next = [...prev, { type: 'ad_draft' as const, draft }]
              localParts = next
              return next
            })
          },
          onSuggestedPrompts: (prompts) => {
            setStreamingParts((prev) => {
              const next = [...prev, { type: 'suggested_prompts' as const, prompts }]
              localParts = next
              return next
            })
          },
          onToolStatus: (status) => {
            setStreamingParts((prev) => {
              if (status.status === 'done') {
                const next = prev.filter(
                  (p) => !(p.type === 'tool_status' && (p as Extract<MessagePart, { type: 'tool_status' }>).status.toolName === status.toolName),
                )
                localParts = next
                return next
              }
              const existing = prev.findIndex(
                (p) => p.type === 'tool_status' && (p as Extract<MessagePart, { type: 'tool_status' }>).status.toolName === status.toolName,
              )
              if (existing >= 0) {
                const next = [...prev]
                next[existing] = { type: 'tool_status', status }
                localParts = next
                return next
              }
              const next = [...prev, { type: 'tool_status' as const, status }]
              localParts = next
              return next
            })
          },
          onConversationId: (id) => {
            setActiveConversationId(id)
            // Refresh the conversation list so the new entry appears in the sidebar
            loadConversations()
          },
          onDone: () => {
            setMessages((prev) => [
              ...prev,
              { id: assistantId, role: 'assistant', parts: localParts, timestamp: new Date().toISOString() },
            ])
            setStreamingParts([])
            setIsStreaming(false)
            streamingIdRef.current = null
            // Refresh list to update 'updated_at' timestamp in sidebar
            loadConversations()
          },
          onError: (message) => {
            setStreamingParts([{ type: 'text', text: `⚠ ${message}` }])
          },
        },
        activeConversationId,
      )

      abortRef.current = abort
    },
    [isStreaming, messages, activeConversationId],
  )

  const handleStop = () => {
    abortRef.current?.()
    abortRef.current = null
    if (streamingIdRef.current && streamingParts.length) {
      setMessages((prev) => [
        ...prev,
        {
          id: streamingIdRef.current!,
          role: 'assistant',
          parts: [...streamingParts, { type: 'text', text: '\n\n_Response stopped._' }],
          timestamp: new Date().toISOString(),
        },
      ])
    }
    setStreamingParts([])
    setIsStreaming(false)
  }

  const streamingMessage: ChatMessageType | null =
    isStreaming && streamingParts.length > 0
      ? { id: 'streaming', role: 'assistant', parts: streamingParts, timestamp: new Date().toISOString() }
      : null

  const isEmpty = messages.length === 0 && !isStreaming

  function handleAction(actionType: string, payload: Record<string, unknown>) {
    if (actionType === 'send_approval') { sendMessage('Please send this ad draft for approval.'); return }
    const label = (payload.campaignName as string) ?? (payload.bundleHook as string) ?? actionType
    sendMessage(`Confirm: ${actionType.replace(/_/g, ' ')} for "${label}"`)
  }

  return (
    <Stack spacing={2} sx={{ height: 'calc(100vh - 80px)' }}>
      <PageHeader
        title="VIRLO AI Assistant"
        subtitle="Ask anything about your campaigns, content, and leads."
        action={
          <Tooltip title="New conversation">
            <IconButton
              onClick={startNewConversation}
              disabled={isStreaming}
              size="small"
              sx={{
                bgcolor: alpha('#22D3EE', 0.08),
                border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                color: '#0EA5B7',
                '&:hover': { bgcolor: alpha('#22D3EE', 0.15) },
              }}
            >
              <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        }
      />

      <GlassCard
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          p: 0,
          '&:hover': { transform: 'none' },
        }}
      >
        {/* ── History sidebar ─────────────────────────────────────── */}
        <Box
          sx={{
            width: { xs: 0, md: 260 },
            minWidth: { xs: 0, md: 260 },
            borderRight: '1px solid #dddddd57',
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction="row"
            sx={{ px: 1.5, py: 1.25, alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              History
            </Typography>
          </Stack>
          <Divider sx={{ borderColor: '#dddddd57' }} />

          <Box sx={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${alpha('#94A3B8', 0.3)} transparent` }}>
            {conversations.length === 0 ? (
              <Stack sx={{ alignItems: 'center', py: 4, px: 1.5, gap: 0.75 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 22, color: '#CBD5E1' }} />
                <Typography variant="body2" sx={{ color: '#94A3B8', textAlign: 'center' }}>
                  Your conversations will appear here
                </Typography>
              </Stack>
            ) : (
              conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeConversationId === conv.id}
                  onClick={() => openConversation(conv)}
                  onDelete={(e) => handleDeleteConversation(e, conv.id)}
                />
              ))
            )}
          </Box>
        </Box>

        {/* ── Chat area ───────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Message list */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: { xs: 1.5, sm: 2.5 },
              py: 2,
              scrollbarWidth: 'thin',
              scrollbarColor: `${alpha('#94A3B8', 0.3)} transparent`,
            }}
          >
            {historyLoading ? (
              <Stack sx={{ alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <CircularProgress size={24} sx={{ color: '#22D3EE' }} />
              </Stack>
            ) : isEmpty ? (
              <EmptyState onPrompt={(p) => sendMessage(p)} />
            ) : (
              <Stack spacing={2.5}>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} onSuggestedPrompt={(p) => sendMessage(p)} onAction={handleAction} />
                ))}
                {streamingMessage && (
                  <ChatMessage
                    message={streamingMessage}
                    isStreaming={isStreaming && streamingParts.every((p) => p.type !== 'suggested_prompts')}
                    onSuggestedPrompt={(p) => sendMessage(p)}
                    onAction={handleAction}
                  />
                )}
                {isStreaming && streamingParts.length === 0 && (
                  <Stack direction="row" spacing={1} sx={{ px: 1, alignItems: 'center' }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: alpha('#22D3EE', 0.12), border: `1px solid ${alpha('#22D3EE', 0.25)}`, display: 'grid', placeItems: 'center' }}>
                      <AutoAwesomeIcon sx={{ fontSize: 14, color: '#22D3EE' }} />
                    </Box>
                    <CircularProgress size={14} sx={{ color: '#22D3EE' }} />
                    <Typography variant="body1" sx={{ color: '#64748B' }}>
                      Thinking…
                    </Typography>
                  </Stack>
                )}
                <div ref={bottomRef} />
              </Stack>
            )}
          </Box>

          {/* Input bar */}
          <Box sx={{ borderTop: '1px solid #dddddd57', px: { xs: 1.5, sm: 2.5 }, py: 1.5 }}>
            <OutlinedInput
              fullWidth
              multiline
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
              placeholder="Ask about campaigns, create an ad, or analyse performance…"
              disabled={isStreaming}
              endAdornment={
                <InputAdornment position="end">
                  {isStreaming ? (
                    <IconButton onClick={handleStop} size="small" sx={{ color: '#EF4444' }}>
                      <StopIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  ) : (
                    <IconButton onClick={() => sendMessage(input)} disabled={!input.trim()} size="small" sx={{ color: input.trim() ? '#22D3EE' : '#94A3B8', '&:hover': { color: '#0EA5B7' } }}>
                      <SendIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  )}
                </InputAdornment>
              }
              sx={{
                borderRadius: '8px',
                bgcolor: alpha('#F8FAFC', 0.8),
                fontSize: 14,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#dddddd57' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#22D3EE', 0.4) },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#22D3EE' },
              }}
            />
            <Typography variant="caption" sx={{ color: '#94A3B8', mt: 0.5, display: 'block' }}>
              Enter to send · Shift+Enter for new line
            </Typography>
          </Box>
        </Box>
      </GlassCard>
    </Stack>
  )
}

// ─── Conversation list item ───────────────────────────────────────────────────

function ConversationItem({
  conv,
  isActive,
  onClick,
  onDelete,
}: {
  conv: Conversation
  isActive: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <Stack
      direction="row"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        alignItems: 'center',
        gap: 0.75,
        bgcolor: isActive ? alpha('#22D3EE', 0.08) : 'transparent',
        borderRight: isActive ? `2px solid #22D3EE` : '2px solid transparent',
        '&:hover': { bgcolor: alpha('#22D3EE', 0.05) },
        transition: 'background 150ms ease',
      }}
    >
      <ChatBubbleOutlineIcon sx={{ fontSize: 14, color: isActive ? '#22D3EE' : '#94A3B8', flexShrink: 0 }} />
      <Typography
        
        sx={{
          flex: 1,
          color: isActive ? '#0F172A' : '#475569',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
          fontSize: 12,
        }}
      >
        {conv.title}
      </Typography>
      {hovered && (
        <IconButton
          size="small"
          onClick={onDelete}
          sx={{ p: 0.25, color: '#94A3B8', '&:hover': { color: '#EF4444' } }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Stack>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', py: 4, textAlign: 'center' }} spacing={3}>
      <Box sx={{ width: 56, height: 56, borderRadius: '14px', bgcolor: alpha('#22D3EE', 0.1), border: `1px solid ${alpha('#22D3EE', 0.2)}`, display: 'grid', placeItems: 'center' }}>
        <img src={logo} alt="VIRLO Assistant" width="28px" />
      </Box>
      {/* <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#0F172A', mb: 0.5 }}>VIRLO AI Assistant</Typography>
        <Typography variant="subtitle2" sx={{ color: '#64748B', maxWidth: 400 }}>
          Ask about campaign performance, analyse creatives, or create a Meta ad — all from a single conversation.
        </Typography>
      </Box> */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, width: '100%', maxWidth: 560, px: 1 }}>
        {EMPTY_STATE_PROMPTS.map((item) => (
          <GlassCard
            key={item.prompt}
            onClick={() => onPrompt(item.prompt)}
            sx={{ p: 2, cursor: 'pointer', textAlign: 'left', '&:hover': { borderColor: alpha('#22D3EE', 0.35) } }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: alpha('#F8FAFC', 0.9), border: '1px solid #dddddd57', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {item.icon}
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0F172A', mb: 0.25 }}>{item.label}</Typography>
                <Typography variant="caption" sx={{ color: '#64748B', lineHeight: 1.4 }}>{item.prompt}</Typography>
              </Box>
            </Stack>
          </GlassCard>
        ))}
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 0.75 }}>
        {['Lead funnel', 'Anomaly check', 'Pause worst campaign', 'Scale top campaign'].map((label) => (
          <Chip
            key={label}
            label={label}
            size="small"
            icon={<AddCircleOutlineIcon sx={{ fontSize: 13 }} />}
            onClick={() => onPrompt(label)}
            sx={{ fontSize: 11, height: 26, cursor: 'pointer', bgcolor: alpha('#94A3B8', 0.06), color: '#475569', border: '1px solid #dddddd57', '&:hover': { bgcolor: alpha('#22D3EE', 0.07), color: '#0EA5B7', borderColor: alpha('#22D3EE', 0.2) }, '& .MuiChip-icon': { color: 'inherit' } }}
          />
        ))}
      </Stack>
    </Stack>
  )
}
