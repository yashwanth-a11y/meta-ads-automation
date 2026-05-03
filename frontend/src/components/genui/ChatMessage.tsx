import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlined'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import RefreshIcon from '@mui/icons-material/Refresh'
// import PersonIcon from '@mui/icons-material/Person'
import type { ChatMessage as ChatMessageType, MessagePart, ToolStatus } from '../../api/genui'
import { ChartRenderer } from './ChartRenderer'
import { AdDraftCard } from './AdDraftCard'
import { KPICard } from '../ui/KPICard'
import logo from '../../assets/favicon.svg'
import user from '../../assets/user.png'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
  onSuggestedPrompt?: (prompt: string) => void
  onAction?: (actionType: string, payload: Record<string, unknown>) => void
}

export function ChatMessage({
  message,
  isStreaming,
  onSuggestedPrompt,
  onAction,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1 }}>
        <Box
          sx={{
            maxWidth: '75%',
            px: 2,
            py: 1.25,
            borderRadius: '12px 12px 2px 12px',
            bgcolor: '#0F172A',
            border: '1px solid #1E293B',
          }}
        >
          <Typography variant="body1" sx={{ color: '#F1F5F9', lineHeight: 1.6 }}>
            {message.parts.find((p) => p.type === 'text')?.type === 'text'
              ? (message.parts.find((p) => p.type === 'text') as Extract<MessagePart, { type: 'text' }>).text
              : ''}
          </Typography>
        </Box>
        <Box
          sx={{
            ml: 1,
            mt: 0.5,
            width: 30,
            height: 30,
            overflow: 'hidden',
            borderRadius: '50%',
            bgcolor: alpha('#475569', 0.15),
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,

          }}
        >
          <img src={user} alt="VIRLO Assistant" width="28px" />
          {/* <PersonIcon sx={{ fontSize: 16, color: '#64748B' }} /> */}
        </Box>
      </Stack>
    )
  }

  // ── Assistant message ────────────────────────────────────────────────────
  return (
    <Stack direction="row" sx={{ px: 1, alignItems: 'flex-start' }} spacing={1}>
      {/* Avatar */}
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          bgcolor: alpha('#22D3EE', 0.12),
          border: `1px solid ${alpha('#22D3EE', 0.25)}`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          mt: 0.25,
        }}
      >
        {/* <AutoAwesomeIcon sx={{ fontSize: 14, color: '#22D3EE' }} /> */}
        <img src={logo} alt="VIRLO Assistant" width="14px" />
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {message.parts.map((part, i) => (
          <PartRenderer
            key={i}
            part={part}
            onSuggestedPrompt={onSuggestedPrompt}
            onAction={onAction}
          />
        ))}

        {/* Typing indicator */}
        {isStreaming && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, alignItems: 'center' }}>
            {[0, 1, 2].map((dot) => (
              <Box
                key={dot}
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#22D3EE',
                  animation: 'blink 1.2s infinite',
                  animationDelay: `${dot * 0.2}s`,
                  '@keyframes blink': {
                    '0%, 80%, 100%': { opacity: 0.2 },
                    '40%': { opacity: 1 },
                  },
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

// ─── Part renderer ────────────────────────────────────────────────────────────

function PartRenderer({
  part,
  onSuggestedPrompt,
  onAction,
}: {
  part: MessagePart
  onSuggestedPrompt?: (prompt: string) => void
  onAction?: (actionType: string, payload: Record<string, unknown>) => void
}) {
  switch (part.type) {
    case 'text':
      return part.text ? (
        <Typography
          variant="subtitle2"
          sx={{
            color: '#1E293B',
            lineHeight: 1.7,
            mt: 0.25,
            '& strong': { fontWeight: 700 },
            '& em': { fontStyle: 'italic' },
            whiteSpace: 'pre-wrap',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
        />
      ) : null

    case 'tool_status':
      return <ToolStatusChip status={part.status} />

    case 'chart':
      return <ChartRenderer payload={part.data} />

    case 'stat':
      return (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}
        >
          {part.items.map((item, i) => (
            <Box key={i} sx={{ minWidth: 100, flex: '1 1 100px', maxWidth: 180 }}>
              <KPICard title={item.label} value={item.value} delta={item.delta} />
            </Box>
          ))}
        </Stack>
      )

    case 'action':
      return (
        <ActionButton
          label={part.data.label}
          actionType={part.data.actionType}
          payload={part.data.payload}
          onAction={onAction}
        />
      )

    case 'ad_draft':
      return (
        <AdDraftCard
          draft={part.draft}
          onSendApproval={onAction ? () => onAction('send_approval', { draft: part.draft }) : undefined}
        />
      )

    case 'suggested_prompts':
      return (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {part.prompts.map((prompt, i) => (
            <Chip
              key={i}
              label={prompt}
              size="small"
              onClick={() => onSuggestedPrompt?.(prompt)}
              sx={{
                fontSize: 11,
                height: 26,
                cursor: 'pointer',
                bgcolor: alpha('#22D3EE', 0.07),
                color: '#0EA5B7',
                border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                fontWeight: 500,
                '&:hover': { bgcolor: alpha('#22D3EE', 0.14) },
              }}
            />
          ))}
        </Stack>
      )

    default:
      return null
  }
}

// ─── Tool status chip ─────────────────────────────────────────────────────────

function ToolStatusChip({ status }: { status: ToolStatus }) {
  if (status.status === 'done') return null

  return (
    <Chip
      icon={
        status.status === 'running' ? (
          <CircularProgress size={10} sx={{ color: '#22D3EE !important' }} />
        ) : (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#F87171' }} />
        )
      }
      label={status.label ?? status.toolName}
      size="small"
      sx={{
        mt: 0.75,
        height: 22,
        fontSize: 11,
        bgcolor: alpha('#22D3EE', 0.06),
        color: '#475569',
        border: `1px solid ${alpha('#22D3EE', 0.15)}`,
        '& .MuiChip-icon': { ml: 0.75 },
      }}
    />
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ReactNode> = {
  pause_campaign: <PauseCircleOutlineIcon sx={{ fontSize: 16 }} />,
  scale_budget: <TrendingUpIcon sx={{ fontSize: 16 }} />,
  refresh_creative: <RefreshIcon sx={{ fontSize: 16 }} />,
}

function ActionButton({
  label,
  actionType,
  payload,
  onAction,
}: {
  label: string
  actionType: string
  payload: Record<string, unknown>
  onAction?: (actionType: string, payload: Record<string, unknown>) => void
}) {
  return (
    <Box sx={{ mt: 1 }}>
      <Button
        variant="outlined"
        size="small"
        startIcon={ACTION_ICONS[actionType]}
        onClick={() => onAction?.(actionType, payload)}
        sx={{
          borderColor: '#dddddd57',
          color: '#475569',
          fontWeight: 500,
          textTransform: 'none',
          fontSize: 12,
          '&:hover': {
            borderColor: actionType === 'pause_campaign' ? '#F87171' : '#22D3EE',
            color: actionType === 'pause_campaign' ? '#EF4444' : '#0EA5B7',
            bgcolor: actionType === 'pause_campaign' ? alpha('#F87171', 0.05) : alpha('#22D3EE', 0.05),
          },
        }}
      >
        {label}
      </Button>
    </Box>
  )
}

// ─── Minimal markdown renderer (bold + italic only) ──────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(148,163,184,0.15);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
}
