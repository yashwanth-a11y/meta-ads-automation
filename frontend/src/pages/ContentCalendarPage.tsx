import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded'
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded'
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded'
import CalendarViewMonthRoundedIcon from '@mui/icons-material/CalendarViewMonthRounded'
import CalendarViewWeekRoundedIcon from '@mui/icons-material/CalendarViewWeekRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PublishRoundedIcon from '@mui/icons-material/PublishRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { apiFetch } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentType = 'reel' | 'image_post' | 'carousel' | 'story'
type BundleStatus = 'draft' | 'rendering' | 'ready' | 'approved' | 'rejected' | 'published'
type ViewMode = 'week' | 'month'
type SpecialDayCategory = 'festival' | 'national' | 'international' | 'shopping' | 'wedding'

interface Bundle {
  id: string
  content_type: ContentType
  channel_id: string
  channel_name?: string
  status: BundleStatus
  caption?: string
  hashtags?: string[]
  hook?: string
  thumbnail_url?: string
  image_urls?: string[]
  video_url?: string
  scheduled_publish_at?: string
  published_at?: string
  created_at: string
  effective_date: string
}

interface Channel {
  id: string
  name: string
  brand_name: string
}

interface SpecialDay {
  key: string
  name: string
  emoji: string
  category: SpecialDayCategory
  date: string
  end_date: string
  color: string
  tags: string[]
  relevance_score: number
  content_ideas: string[]
}

interface AIIdea {
  title: string
  caption: string
  content_type: ContentType
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#22D3EE'
const ACCENT_DARK = '#0891B2'

const STATUS_CFG: Record<BundleStatus, { bg: string; color: string; border: string; label: string; dot: string }> = {
  draft: { bg: alpha('#94A3B8', 0.12), color: '#64748B', border: alpha('#94A3B8', 0.28), label: 'Draft', dot: '#94A3B8' },
  rendering: { bg: alpha('#60A5FA', 0.12), color: '#2563EB', border: alpha('#60A5FA', 0.3), label: 'Rendering', dot: '#60A5FA' },
  ready: { bg: alpha('#FBBF24', 0.14), color: '#B45309', border: alpha('#FBBF24', 0.35), label: 'Ready', dot: '#FBBF24' },
  approved: { bg: alpha('#34D399', 0.12), color: '#059669', border: alpha('#34D399', 0.3), label: 'Approved', dot: '#34D399' },
  rejected: { bg: alpha('#F87171', 0.12), color: '#DC2626', border: alpha('#F87171', 0.28), label: 'Rejected', dot: '#F87171' },
  published: { bg: alpha('#2DD4BF', 0.12), color: '#0D9488', border: alpha('#2DD4BF', 0.3), label: 'Published', dot: '#2DD4BF' },
}

const CT_CFG: Record<ContentType, { bg: string; color: string; border: string; label: string; icon: React.ReactNode }> = {
  reel: { bg: alpha('#A78BFA', 0.12), color: '#7C3AED', border: alpha('#A78BFA', 0.3), label: 'Reel', icon: <PlayArrowRoundedIcon sx={{ fontSize: 10 }} /> },
  image_post: { bg: alpha('#60A5FA', 0.12), color: '#2563EB', border: alpha('#60A5FA', 0.3), label: 'Image', icon: <ImageRoundedIcon sx={{ fontSize: 10 }} /> },
  carousel: { bg: alpha('#FB923C', 0.12), color: '#D97706', border: alpha('#FB923C', 0.28), label: 'Carousel', icon: <SlideshowRoundedIcon sx={{ fontSize: 10 }} /> },
  story: { bg: alpha('#F472B6', 0.12), color: '#DB2777', border: alpha('#F472B6', 0.28), label: 'Story', icon: <AutoStoriesRoundedIcon sx={{ fontSize: 10 }} /> },
}

const CATEGORY_CFG: Record<SpecialDayCategory, { label: string; color: string }> = {
  festival: { label: 'Festival', color: '#F59E0B' },
  national: { label: 'National', color: '#3B82F6' },
  international: { label: 'International', color: '#8B5CF6' },
  shopping: { label: 'Shopping', color: '#EC4899' },
  wedding: { label: 'Wedding', color: '#EF4444' },
}

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function getWeekStart(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

function getMonthStart(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), 1)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatWeekLabel(start: Date, end: Date): string {
  const so = { month: 'short' as const, day: 'numeric' as const }
  const s = start.toLocaleDateString('en-US', so)
  const e = end.toLocaleDateString('en-US', { ...so, year: 'numeric' })
  return `${s} – ${e}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

async function parseJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
    const msg = err?.error?.message ?? err?.message ?? `Request failed (${r.status})`
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniCtChip({ ct }: { ct: ContentType }) {
  const c = CT_CFG[ct] ?? CT_CFG.image_post
  return (
    <Stack
      direction="row"
      spacing={0.375}
      sx={{
        alignItems: 'center',
        px: 0.625,
        py: 0.25,
        borderRadius: '4px',
        bgcolor: c.bg,
        border: `1px solid ${c.border}`,
        flexShrink: 0,
      }}
    >
      <Box sx={{ color: c.color, display: 'flex' }}>{c.icon}</Box>
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: c.color, lineHeight: 1, letterSpacing: '0.04em' }}>
        {c.label}
      </Typography>
    </Stack>
  )
}

function StatusDot({ status }: { status: BundleStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.draft
  return (
    <Box
      title={c.label}
      sx={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        bgcolor: c.dot,
        flexShrink: 0,
        boxShadow: `0 0 5px ${alpha(c.dot, 0.55)}`,
      }}
    />
  )
}

function SpecialDayBadge({ day, onClick }: { day: SpecialDay; onClick: () => void }) {
  const bg = alpha(day.color, 0.18)
  const border = alpha(day.color, 0.38)
  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick() }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.75,
        py: 0.25,
        borderRadius: '4px',
        bgcolor: bg,
        border: `1px solid ${border}`,
        cursor: 'pointer',
        transition: 'all 140ms ease',
        '&:hover': { bgcolor: alpha(day.color, 0.26), transform: 'scale(1.03)' },
        overflow: 'hidden',
        maxWidth: '100%',
      }}
    >
      <Typography sx={{ fontSize: 10, lineHeight: 1 }}>{day.emoji}</Typography>
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 700,
          color: day.color,
          lineHeight: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}
      >
        {day.name}
      </Typography>
    </Box>
  )
}

// ─── Compact Bundle Card (week/month cells) ───────────────────────────────────

function BundleCardCompact({ bundle, onClick }: { bundle: Bundle; onClick: () => void }) {
  const ct = CT_CFG[bundle.content_type] ?? CT_CFG.image_post
  const thumb = bundle.thumbnail_url ?? bundle.image_urls?.[0]

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick() }}
      sx={{
        p: 0.875,
        borderRadius: '6px',
        border: '1px solid',
        borderColor: alpha('#0F172A', 0.09),
        bgcolor: (t) => alpha(t.palette.background.paper, 0.9),
        cursor: 'pointer',
        transition: 'all 160ms ease',
        '&:hover': {
          borderColor: alpha(ACCENT, 0.42),
          bgcolor: (t) => alpha(t.palette.background.paper, 1),
          boxShadow: `0 4px 14px ${alpha('#0F172A', 0.1)}`,
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        {thumb ? (
          <Box
            component="img"
            src={thumb}
            alt=""
            sx={{
              width: 28,
              height: 28,
              borderRadius: '4px',
              objectFit: 'cover',
              flexShrink: 0,
              bgcolor: alpha('#0F172A', 0.06),
            }}
          />
        ) : (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '4px',
              bgcolor: ct.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Box sx={{ color: ct.color, display: 'flex', fontSize: 12 }}>{ct.icon}</Box>
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.25 }}>
            <MiniCtChip ct={bundle.content_type} />
            <StatusDot status={bundle.status} />
          </Stack>
          {bundle.channel_name && (
            <Typography
              sx={{
                fontSize: 9,
                color: 'text.disabled',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {bundle.channel_name}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekDays: Date[]
  bundlesByDay: Record<string, Bundle[]>
  specialDaysByDay: Record<string, SpecialDay[]>
  today: Date
  onBundleClick: (b: Bundle) => void
  onSpecialDayClick: (sd: SpecialDay) => void
}

function WeekView({ weekDays, bundlesByDay, specialDaysByDay, today, onBundleClick, onSpecialDayClick }: WeekViewProps) {
  const MAX_VISIBLE = 3

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: '1px',
        bgcolor: alpha('#0F172A', 0.07),
        borderRadius: '10px',
        overflow: 'hidden',
        border: `1px solid ${alpha('#0F172A', 0.07)}`,
      }}
    >
      {weekDays.map((day) => {
        const ymd = toYMD(day)
        const isToday = isSameDay(day, today)
        const dayBundles = bundlesByDay[ymd] ?? []
        const daySpecial = specialDaysByDay[ymd] ?? []
        const visible = dayBundles.slice(0, MAX_VISIBLE)
        const more = dayBundles.length - MAX_VISIBLE

        return (
          <Box
            key={ymd}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              bgcolor: isToday ? alpha(ACCENT, 0.045) : 'rgba(255,255,255,0.03)',
              minHeight: 160,
              borderLeft: daySpecial[0] ? `3px solid ${daySpecial[0].color}` : 'none',
              position: 'relative',
            }}
          >
            {/* Day header */}
            <Box
              sx={{
                px: 1.25,
                py: 1,
                borderBottom: `1px solid ${alpha('#0F172A', 0.07)}`,
                bgcolor: isToday ? alpha(ACCENT, 0.07) : alpha('#0F172A', 0.025),
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isToday ? ACCENT_DARK : 'text.disabled',
                  lineHeight: 1,
                }}
              >
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </Typography>
              <Box
                sx={{
                  mt: 0.375,
                  width: isToday ? 26 : 'auto',
                  height: isToday ? 26 : 'auto',
                  borderRadius: isToday ? '50%' : 0,
                  bgcolor: isToday ? ACCENT : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                }}
              >
                <Typography
                  sx={{
                    fontSize: isToday ? 13 : 13,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? '#fff' : 'text.primary',
                    lineHeight: 1,
                  }}
                >
                  {day.getDate()}
                </Typography>
              </Box>
            </Box>

            {/* Cell content */}
            <Box sx={{ flex: 1, p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {/* Special day badges */}
              {daySpecial.map((sd) => (
                <SpecialDayBadge key={sd.key} day={sd} onClick={() => onSpecialDayClick(sd)} />
              ))}

              {/* Bundle cards */}
              {visible.length === 0 && daySpecial.length === 0 && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.35,
                    minHeight: 60,
                  }}
                >
                  <Typography sx={{ fontSize: 9, color: 'text.disabled', textAlign: 'center' }}>
                    No posts
                  </Typography>
                </Box>
              )}

              <Stack spacing={0.5}>
                {visible.map((b) => (
                  <BundleCardCompact key={b.id} bundle={b} onClick={() => onBundleClick(b)} />
                ))}
              </Stack>

              {more > 0 && (
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '4px',
                    bgcolor: alpha(ACCENT, 0.08),
                    border: `1px solid ${alpha(ACCENT, 0.2)}`,
                    cursor: 'default',
                    alignSelf: 'flex-start',
                  }}
                >
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: ACCENT_DARK, lineHeight: 1 }}>
                    +{more} more
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

interface MonthViewProps {
  monthStart: Date
  bundlesByDay: Record<string, Bundle[]>
  specialDaysByDay: Record<string, SpecialDay[]>
  today: Date
  onDayClick: (date: Date, bundles: Bundle[], specialDays: SpecialDay[]) => void
  onBundleClick: (b: Bundle) => void
  onSpecialDayClick: (sd: SpecialDay) => void
}

function MonthView({ monthStart, bundlesByDay, specialDaysByDay, today, onDayClick, onSpecialDayClick }: MonthViewProps) {
  // Build calendar grid: start from Monday of the first week containing the 1st
  const gridStart = getWeekStart(monthStart)
  const daysInGrid = 42 // 6 rows × 7 cols
  const gridDays = Array.from({ length: daysInGrid }, (_, i) => addDays(gridStart, i))
  const currentMonth = monthStart.getMonth()

  return (
    <Box>
      {/* Day-of-week headers */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          mb: '1px',
        }}
      >
        {WEEK_DAY_LABELS.map((lbl) => (
          <Box key={lbl} sx={{ py: 1, textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: 'text.disabled',
              }}
            >
              {lbl}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Grid cells */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: '1px',
          bgcolor: alpha('#0F172A', 0.07),
          borderRadius: '10px',
          overflow: 'hidden',
          border: `1px solid ${alpha('#0F172A', 0.07)}`,
        }}
      >
        {gridDays.map((day) => {
          const ymd = toYMD(day)
          const isToday = isSameDay(day, today)
          const isCurrentMonth = day.getMonth() === currentMonth
          const dayBundles = bundlesByDay[ymd] ?? []
          const daySpecial = specialDaysByDay[ymd] ?? []
          const firstSpecial = daySpecial[0]

          return (
            <Box
              key={ymd}
              onClick={() => onDayClick(day, dayBundles, daySpecial)}
              sx={{
                minHeight: 96,
                p: 0.75,
                bgcolor: isToday
                  ? alpha(ACCENT, 0.045)
                  : isCurrentMonth
                    ? '#FFF'
                    : alpha('#0F172A', 0.015),
                borderLeft: firstSpecial ? `3px solid ${firstSpecial.color}` : 'none',
                cursor: 'pointer',
                transition: 'background-color 140ms ease',
                '&:hover': {
                  bgcolor: isToday ? alpha(ACCENT, 0.07) : alpha('#0F172A', 0.04),
                },
              }}
            >
              {/* Date number */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: isToday ? ACCENT : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: isToday ? 800 : isCurrentMonth ? 600 : 400,
                      color: isToday ? '#fff' : isCurrentMonth ? 'text.primary' : 'text.disabled',
                      lineHeight: 1,
                      opacity: isCurrentMonth ? 1 : 0.4,
                    }}
                  >
                    {day.getDate()}
                  </Typography>
                </Box>
              </Box>

              {/* Special day badge */}
              {firstSpecial && (
                <Box sx={{ mb: 0.375 }}>
                  <SpecialDayBadge day={firstSpecial} onClick={() => onSpecialDayClick(firstSpecial)} />
                </Box>
              )}

              {/* Bundle dots / compact chips */}
              {dayBundles.length > 0 && (
                <Stack direction="row" spacing={0.375} sx={{ flexWrap: 'wrap', gap: 0.375 }}>
                  {dayBundles.slice(0, 2).map((b) => {
                    const ct = CT_CFG[b.content_type] ?? CT_CFG.image_post
                    return (
                      <Box
                        key={b.id}
                        onClick={(e) => { e.stopPropagation() }}
                        title={ct.label}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: ct.color,
                          flexShrink: 0,
                          boxShadow: `0 0 4px ${alpha(ct.color, 0.5)}`,
                        }}
                      />
                    )
                  })}
                  {dayBundles.length > 2 && (
                    <Typography sx={{ fontSize: 8, fontWeight: 700, color: 'text.disabled', lineHeight: '8px' }}>
                      +{dayBundles.length - 2}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ─── Day Detail Drawer (Month View) ──────────────────────────────────────────

interface DayDetailDrawerProps {
  open: boolean
  date: Date | null
  bundles: Bundle[]
  specialDays: SpecialDay[]
  onClose: () => void
  onBundleClick: (b: Bundle) => void
  onSpecialDayClick: (sd: SpecialDay) => void
}

function DayDetailDrawer({ open, date, bundles, specialDays, onClose, onBundleClick, onSpecialDayClick }: DayDetailDrawerProps) {
  if (!date) return null

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 400 },
            maxWidth: '100%',
            borderLeft: `1px solid ${alpha('#0F172A', 0.08)}`,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`, flexShrink: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
              {dateLabel}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5 }}>
              {bundles.length} post{bundles.length !== 1 ? 's' : ''} scheduled
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        <Stack spacing={2.5}>
          {/* Special days */}
          {specialDays.length > 0 && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}
              >
                Special Days
              </Typography>
              <Stack spacing={0.75}>
                {specialDays.map((sd) => (
                  <Box
                    key={sd.key}
                    onClick={() => { onSpecialDayClick(sd); onClose() }}
                    sx={{
                      p: 1.25,
                      borderRadius: '8px',
                      border: `1px solid ${alpha(sd.color, 0.3)}`,
                      bgcolor: alpha(sd.color, 0.07),
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      '&:hover': { bgcolor: alpha(sd.color, 0.13) },
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 18, lineHeight: 1 }}>{sd.emoji}</Typography>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{sd.name}</Typography>
                        <Typography sx={{ fontSize: 11, color: 'text.disabled', textTransform: 'capitalize' }}>
                          {sd.category} • relevance {sd.relevance_score}/10
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {/* Bundles */}
          {bundles.length > 0 ? (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}
              >
                Scheduled Posts
              </Typography>
              <Stack spacing={1}>
                {bundles.map((b) => {
                  const ct = CT_CFG[b.content_type] ?? CT_CFG.image_post
                  const st = STATUS_CFG[b.status] ?? STATUS_CFG.draft
                  const thumb = b.thumbnail_url ?? b.image_urls?.[0]
                  return (
                    <Box
                      key={b.id}
                      onClick={() => { onBundleClick(b); onClose() }}
                      sx={{
                        p: 1.25,
                        borderRadius: '8px',
                        border: `1px solid ${alpha('#0F172A', 0.08)}`,
                        bgcolor: (t) => alpha(t.palette.background.paper, 0.85),
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        '&:hover': { borderColor: alpha(ACCENT, 0.35), bgcolor: (t) => alpha(t.palette.background.paper, 1) },
                      }}
                    >
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        {thumb ? (
                          <Box
                            component="img"
                            src={thumb}
                            alt=""
                            sx={{ width: 40, height: 40, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: '6px',
                              bgcolor: ct.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Box sx={{ color: ct.color, display: 'flex', fontSize: 18 }}>{ct.icon}</Box>
                          </Box>
                        )}
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.375 }}>
                            <MiniCtChip ct={b.content_type} />
                            <Box
                              sx={{
                                px: 0.625,
                                py: 0.25,
                                borderRadius: '4px',
                                bgcolor: st.bg,
                                border: `1px solid ${st.border}`,
                              }}
                            >
                              <Typography sx={{ fontSize: 9, fontWeight: 700, color: st.color, lineHeight: 1 }}>
                                {st.label}
                              </Typography>
                            </Box>
                          </Stack>
                          {b.caption && (
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: 'text.secondary',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {b.caption}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                  )
                })}
              </Stack>
            </Box>
          ) : specialDays.length === 0 ? (
            <Box
              sx={{
                textAlign: 'center',
                py: 4,
                opacity: 0.5,
              }}
            >
              <CalendarTodayRoundedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
              <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>No posts scheduled</Typography>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </Drawer>
  )
}

// ─── Bundle Detail Drawer ─────────────────────────────────────────────────────

interface BundleDetailDrawerProps {
  bundle: Bundle | null
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

function BundleDetailDrawer({ bundle, open, onClose, onRefresh }: BundleDetailDrawerProps) {
  const [scheduling, setScheduling] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduleValue, setScheduleValue] = useState('')
  const [showScheduler, setShowScheduler] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (!bundle) return
    if (bundle.scheduled_publish_at) {
      const d = new Date(bundle.scheduled_publish_at)
      setScheduleValue(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
    } else {
      setScheduleValue('')
    }
    setShowScheduler(false)
    setNotice(null)
  }, [bundle?.id])

  const handleReschedule = async () => {
    if (!bundle || !scheduleValue) return
    setScheduling(true)
    setNotice(null)
    try {
      const iso = new Date(scheduleValue).toISOString()
      const r = await apiFetch(`/api/v1/calendar/${bundle.id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduled_publish_at: iso }),
      })
      await parseJson<unknown>(r)
      setNotice({ type: 'success', msg: 'Post rescheduled successfully.' })
      setShowScheduler(false)
      onRefresh()
    } catch (e) {
      setNotice({ type: 'error', msg: e instanceof Error ? e.message : 'Failed to reschedule.' })
    } finally {
      setScheduling(false)
    }
  }

  const handlePublishNow = async () => {
    if (!bundle) return
    setPublishing(true)
    setNotice(null)
    try {
      const r = await apiFetch(`/api/v1/calendar/${bundle.id}/publish`, { method: 'POST' })
      await parseJson<unknown>(r)
      setNotice({ type: 'success', msg: 'Post published successfully.' })
      onRefresh()
    } catch (e) {
      setNotice({ type: 'error', msg: e instanceof Error ? e.message : 'Failed to publish.' })
    } finally {
      setPublishing(false)
    }
  }

  if (!bundle) return null
  const ct = CT_CFG[bundle.content_type] ?? CT_CFG.image_post
  const st = STATUS_CFG[bundle.status] ?? STATUS_CFG.draft
  const thumb = bundle.thumbnail_url ?? bundle.image_urls?.[0]

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 480 },
            maxWidth: '100%',
            borderLeft: `1px solid ${alpha('#0F172A', 0.08)}`,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`, flexShrink: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: 'center',
                  px: 1,
                  py: 0.375,
                  borderRadius: '6px',
                  bgcolor: ct.bg,
                  border: `1px solid ${ct.border}`,
                }}
              >
                <Box sx={{ color: ct.color, display: 'flex', fontSize: 14 }}>{ct.icon}</Box>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: ct.color }}>{ct.label}</Typography>
              </Stack>
              <Box sx={{ px: 1, py: 0.375, borderRadius: '6px', bgcolor: st.bg, border: `1px solid ${st.border}` }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</Typography>
              </Box>
              {bundle.channel_name && (
                <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}>
                  {bundle.channel_name}
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {bundle.scheduled_publish_at
                ? `Scheduled: ${new Date(bundle.scheduled_publish_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
                : `Created: ${new Date(bundle.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary', mt: -0.5 }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        <Stack spacing={2.5}>
          {notice && (
            <Alert
              severity={notice.type}
              onClose={() => setNotice(null)}
              sx={{ borderRadius: '8px', fontSize: 13 }}
            >
              {notice.msg}
            </Alert>
          )}

          {/* Media */}
          {bundle.content_type === 'reel' && bundle.video_url ? (
            <Box
              sx={{
                borderRadius: '10px',
                overflow: 'hidden',
                bgcolor: '#050505',
                aspectRatio: '9/16',
                maxHeight: 360,
                mx: 'auto',
                width: '100%',
              }}
            >
              <Box
                component="video"
                src={bundle.video_url}
                controls
                playsInline
                sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </Box>
          ) : bundle.content_type === 'carousel' && bundle.image_urls && bundle.image_urls.length > 0 ? (
            <Box
              sx={{
                overflowX: 'auto',
                display: 'flex',
                gap: 1.5,
                pb: 1,
                scrollbarWidth: 'thin',
                scrollbarColor: `${alpha('#0F172A', 0.15)} transparent`,
              }}
            >
              {bundle.image_urls.map((url, i) => (
                <Box
                  key={i}
                  component="img"
                  src={url}
                  alt={`Slide ${i + 1}`}
                  sx={{
                    width: 160,
                    height: 160,
                    objectFit: 'cover',
                    borderRadius: '8px',
                    flexShrink: 0,
                    border: `1px solid ${alpha('#0F172A', 0.1)}`,
                  }}
                />
              ))}
            </Box>
          ) : thumb ? (
            <Box
              sx={{
                borderRadius: '10px',
                overflow: 'hidden',
                aspectRatio: bundle.content_type === 'story' ? '9/16' : '4/5',
                maxHeight: 360,
                mx: 'auto',
                width: '100%',
              }}
            >
              <Box
                component="img"
                src={thumb}
                alt=""
                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </Box>
          ) : null}

          {/* Caption */}
          {bundle.caption && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}
              >
                Caption
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {bundle.caption}
              </Typography>
            </Box>
          )}

          {/* Hook */}
          {bundle.hook && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}
              >
                Hook
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.65 }}>
                {bundle.hook}
              </Typography>
            </Box>
          )}

          {/* Hashtags */}
          {bundle.hashtags && bundle.hashtags.length > 0 && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}
              >
                Hashtags
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {bundle.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag.startsWith('#') ? tag : `#${tag}`}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: '6px',
                      bgcolor: alpha(ACCENT, 0.08),
                      color: ACCENT_DARK,
                      border: `1px solid ${alpha(ACCENT, 0.22)}`,
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Reschedule panel */}
          {showScheduler && (
            <Box
              sx={{
                p: 2,
                borderRadius: '10px',
                border: `1px solid ${alpha('#0F172A', 0.1)}`,
                bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
                Schedule date &amp; time
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  type="datetime-local"
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={() => void handleReschedule()}
                  disabled={scheduling || !scheduleValue}
                  startIcon={scheduling ? <CircularProgress size={13} sx={{ color: 'inherit' }} /> : <ScheduleRoundedIcon />}
                  sx={{ height: 40, minWidth: 100 }}
                >
                  {scheduling ? 'Saving…' : 'Confirm'}
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: `1px solid ${alpha('#0F172A', 0.08)}`,
          flexShrink: 0,
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="outlined"
          size="medium"
          startIcon={<ScheduleRoundedIcon />}
          onClick={() => setShowScheduler((v) => !v)}
          sx={{ flex: 1, minWidth: 130 }}
        >
          {showScheduler ? 'Cancel' : 'Reschedule'}
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="medium"
          startIcon={publishing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <PublishRoundedIcon />}
          onClick={() => void handlePublishNow()}
          disabled={publishing || bundle.status === 'published'}
          sx={{ flex: 1, minWidth: 130 }}
        >
          {publishing ? 'Publishing…' : 'Publish Now'}
        </Button>
      </Box>
    </Drawer>
  )
}

// ─── Plan Content Drawer (Special Day) ───────────────────────────────────────

interface PlanContentDrawerProps {
  specialDay: SpecialDay | null
  open: boolean
  channelId: string
  onClose: () => void
  bundlesForDay: Bundle[]
}

function PlanContentDrawer({ specialDay, open, channelId, onClose, bundlesForDay }: PlanContentDrawerProps) {
  const [generating, setGenerating] = useState(false)
  const [aiIdeas, setAiIdeas] = useState<AIIdea[]>([])
  const [genError, setGenError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      setAiIdeas([])
      setGenError(null)
      setCopiedIdx(null)
    }
  }, [open, specialDay?.key])

  const handleGenerateIdeas = async () => {
    if (!specialDay) return
    setGenerating(true)
    setGenError(null)
    try {
      const r = await apiFetch('/api/v1/calendar/special-days/generate-idea', {
        method: 'POST',
        body: JSON.stringify({
          channel_id: channelId || undefined,
          special_day_name: specialDay.name,
          content_ideas: specialDay.content_ideas,
          date: specialDay.date,
        }),
      })
      const data = await parseJson<{ ideas?: AIIdea[] } | AIIdea[]>(r)
      const list = Array.isArray(data) ? data : (data.ideas ?? [])
      setAiIdeas(list)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate ideas.')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyCaption = async (caption: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch {
      setCopiedIdx(null)
    }
  }

  if (!specialDay) return null

  const catCfg = CATEGORY_CFG[specialDay.category] ?? { label: specialDay.category, color: '#64748B' }
  const daysLeft = daysUntil(specialDay.date)
  const dateLabel = new Date(specialDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 520 },
            maxWidth: '100%',
            borderLeft: `1px solid ${alpha('#0F172A', 0.08)}`,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2.5,
          borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`,
          flexShrink: 0,
          borderTop: `3px solid ${specialDay.color}`,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
              <Typography sx={{ fontSize: 32, lineHeight: 1 }}>{specialDay.emoji}</Typography>
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
                  {specialDay.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                  {dateLabel}
                  {daysLeft > 0 ? ` • ${daysLeft} day${daysLeft !== 1 ? 's' : ''} away` : daysLeft === 0 ? ' • Today!' : ' • Passed'}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              <Box
                sx={{
                  px: 1,
                  py: 0.375,
                  borderRadius: '6px',
                  bgcolor: alpha(catCfg.color, 0.1),
                  border: `1px solid ${alpha(catCfg.color, 0.25)}`,
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: catCfg.color }}>
                  {catCfg.label}
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 1,
                  py: 0.375,
                  borderRadius: '6px',
                  bgcolor: alpha('#22D3EE', 0.08),
                  border: `1px solid ${alpha('#22D3EE', 0.2)}`,
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: ACCENT_DARK }}>
                  Relevance {specialDay.relevance_score}/10
                </Typography>
              </Box>
              {specialDay.tags.slice(0, 3).map((tag) => (
                <Box
                  key={tag}
                  sx={{
                    px: 1,
                    py: 0.375,
                    borderRadius: '6px',
                    bgcolor: alpha('#64748B', 0.07),
                    border: `1px solid ${alpha('#64748B', 0.15)}`,
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>
                    {tag}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary', mt: -0.5 }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
        <Stack spacing={3}>
          {/* Content Ideas */}
          {specialDay.content_ideas.length > 0 && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.25 }}
              >
                Content Ideas
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {specialDay.content_ideas.map((idea) => (
                  <Box
                    key={idea}
                    sx={{
                      px: 1.25,
                      py: 0.625,
                      borderRadius: '20px',
                      bgcolor: alpha(specialDay.color, 0.08),
                      border: `1px solid ${alpha(specialDay.color, 0.22)}`,
                    }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                      {idea}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {/* Generate AI Ideas */}
          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                AI-Generated Ideas
              </Typography>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={
                  generating
                    ? <CircularProgress size={13} sx={{ color: 'inherit' }} />
                    : <AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />
                }
                onClick={() => void handleGenerateIdeas()}
                disabled={generating}
                sx={{ height: 32, fontSize: 11, fontWeight: 700, px: 1.5 }}
              >
                {generating ? 'Generating…' : 'Generate Ideas'}
              </Button>
            </Stack>

            {genError && (
              <Alert severity="error" onClose={() => setGenError(null)} sx={{ borderRadius: '8px', mb: 1.5, fontSize: 12 }}>
                {genError}
              </Alert>
            )}

            {aiIdeas.length === 0 && !generating && !genError && (
              <Box
                sx={{
                  py: 3,
                  textAlign: 'center',
                  borderRadius: '10px',
                  border: `1px dashed ${alpha('#0F172A', 0.12)}`,
                  bgcolor: alpha('#0F172A', 0.015),
                }}
              >
                <AutoAwesomeRoundedIcon sx={{ fontSize: 28, color: 'text.disabled', mb: 0.75 }} />
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  Click "Generate Ideas" to get AI-powered content suggestions
                </Typography>
              </Box>
            )}

            {aiIdeas.length > 0 && (
              <Stack spacing={1.5}>
                {aiIdeas.map((idea, idx) => {
                  const iCt = CT_CFG[idea.content_type] ?? CT_CFG.image_post
                  const copied = copiedIdx === idx
                  return (
                    <Box
                      key={idx}
                      sx={{
                        p: 1.75,
                        borderRadius: '10px',
                        border: `1px solid ${alpha('#0F172A', 0.09)}`,
                        bgcolor: (t) => alpha(t.palette.background.paper, 0.85),
                      }}
                    >
                      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                          <Box
                            sx={{
                              px: 0.875,
                              py: 0.375,
                              borderRadius: '6px',
                              bgcolor: iCt.bg,
                              border: `1px solid ${iCt.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <Box sx={{ color: iCt.color, display: 'flex', fontSize: 12 }}>{iCt.icon}</Box>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: iCt.color }}>{iCt.label}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{idea.title}</Typography>
                        </Stack>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={copied ? <CheckCircleRoundedIcon sx={{ fontSize: 13 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 13 }} />}
                          onClick={() => void handleCopyCaption(idea.caption, idx)}
                          sx={{
                            height: 28,
                            fontSize: 10,
                            fontWeight: 700,
                            px: 1.25,
                            minWidth: 80,
                            flexShrink: 0,
                            borderColor: copied ? alpha('#34D399', 0.4) : undefined,
                            color: copied ? '#059669' : undefined,
                            '&:hover': copied ? { borderColor: alpha('#34D399', 0.6), bgcolor: alpha('#34D399', 0.05) } : undefined,
                          }}
                        >
                          {copied ? 'Copied!' : 'Use This'}
                        </Button>
                      </Stack>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: 'text.secondary',
                          lineHeight: 1.6,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {idea.caption}
                      </Typography>
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Box>

          {/* Existing posts for this day */}
          {bundlesForDay.length > 0 && (
            <Box>
              <Typography
                sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.25 }}
              >
                Posts on This Day ({bundlesForDay.length})
              </Typography>
              <Stack spacing={1}>
                {bundlesForDay.map((b) => {
                  const bCt = CT_CFG[b.content_type] ?? CT_CFG.image_post
                  const bSt = STATUS_CFG[b.status] ?? STATUS_CFG.draft
                  return (
                    <Box
                      key={b.id}
                      sx={{
                        p: 1.25,
                        borderRadius: '8px',
                        border: `1px solid ${alpha('#0F172A', 0.08)}`,
                        bgcolor: (t) => alpha(t.palette.background.paper, 0.7),
                      }}
                    >
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <Box sx={{ px: 0.75, py: 0.25, borderRadius: '4px', bgcolor: bCt.bg, border: `1px solid ${bCt.border}` }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 700, color: bCt.color }}>{bCt.label}</Typography>
                        </Box>
                        <Box sx={{ px: 0.75, py: 0.25, borderRadius: '4px', bgcolor: bSt.bg, border: `1px solid ${bSt.border}` }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 700, color: bSt.color }}>{bSt.label}</Typography>
                        </Box>
                        {b.channel_name && (
                          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontWeight: 600 }}>
                            {b.channel_name}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  )
                })}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>
    </Drawer>
  )
}

// ─── Upcoming Festivals Strip ─────────────────────────────────────────────────

interface FestivalStripProps {
  events: SpecialDay[]
  onFestivalClick: (sd: SpecialDay) => void
}

function FestivalStrip({ events, onFestivalClick }: FestivalStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = events
    .filter((e) => e.relevance_score >= 4 && daysUntil(e.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))

  if (filtered.length === 0) return null

  return (
    <Box
      ref={scrollRef}
      sx={{
        display: 'flex',
        gap: 1.5,
        overflowX: 'auto',
        pb: 0.5,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {filtered.map((event) => {
        const days = daysUntil(event.date)
        const daysLabel = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days} days`
        return (
          <Box
            key={event.key}
            onClick={() => onFestivalClick(event)}
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 1.75,
              py: 1.25,
              borderRadius: '10px',
              bgcolor: (t) => alpha(t.palette.background.paper, 0.9),
              border: `1px solid ${alpha(event.color, 0.3)}`,
              borderTop: `3px solid ${event.color}`,
              cursor: 'pointer',
              transition: 'all 160ms ease',
              boxShadow: `0 2px 8px ${alpha(event.color, 0.1)}`,
              '&:hover': {
                bgcolor: alpha(event.color, 0.07),
                transform: 'translateY(-2px)',
                boxShadow: `0 6px 18px ${alpha(event.color, 0.18)}`,
              },
            }}
          >
            <Typography sx={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{event.emoji}</Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
                {event.name}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {daysLabel}
                </Typography>
                <Box
                  sx={{
                    px: 0.625,
                    py: 0.125,
                    borderRadius: '4px',
                    bgcolor: alpha(event.color, 0.15),
                    border: `1px solid ${alpha(event.color, 0.3)}`,
                  }}
                >
                  <Typography sx={{ fontSize: 9, fontWeight: 700, color: event.color, whiteSpace: 'nowrap' }}>
                    {event.relevance_score}/10
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Upcoming Events Sidebar ──────────────────────────────────────────────────

function UpcomingEventsSidebar({ events, onEventClick }: { events: SpecialDay[]; onEventClick: (sd: SpecialDay) => void }) {
  const filtered = events
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
    .slice(0, 20)

  return (
    <Box
      sx={{
        borderRadius: '14px',
        border: `1px solid`,
        borderColor: (t) => alpha(t.palette.divider, 0.7),
        bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        position: 'sticky',
        top: 20,
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid`, borderColor: (t) => alpha(t.palette.divider, 0.5) }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled' }}>
          Upcoming Events
        </Typography>
      </Box>

      {/* Event list */}
      <Stack
        sx={{
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': { bgcolor: (t) => alpha(t.palette.divider, 0.4), borderRadius: 2 },
        }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>No upcoming events</Typography>
            <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.5 }}>Sync holidays to populate</Typography>
          </Box>
        ) : (
          filtered.map((event, idx) => {
            const days = daysUntil(event.date)
            const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d away`
            const isUrgent = days <= 3
            const isSoon = days <= 7

            return (
              <Box
                key={event.key}
                onClick={() => onEventClick(event)}
                sx={{
                  px: 2,
                  py: 1.375,
                  borderBottom: idx < filtered.length - 1 ? `1px solid` : 'none',
                  borderColor: (t) => alpha(t.palette.divider, 0.35),
                  cursor: 'pointer',
                  transition: 'all 140ms ease',
                  '&:hover': {
                    bgcolor: (t) => alpha(event.color, 0.06),
                  },
                  borderLeft: '3px solid',
                  borderLeftColor: event.color,
                }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{event.emoji}</Typography>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {event.name}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: isUrgent ? event.color : isSoon ? '#D97706' : 'text.secondary',
                        }}
                      >
                        {daysLabel}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                        {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Typography>
                    </Stack>
                  </Box>
                  <Box
                    sx={{
                      px: 0.625,
                      py: 0.25,
                      borderRadius: '4px',
                      bgcolor: alpha(event.color, 0.14),
                      border: `1px solid ${alpha(event.color, 0.3)}`,
                      flexShrink: 0,
                    }}
                  >
                    <Typography sx={{ fontSize: 9, fontWeight: 800, color: event.color }}>
                      {event.relevance_score}/10
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })
        )}
      </Stack>
    </Box>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ContentCalendarPage() {
  const todayRef = useRef<Date>((() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })())
  const today = todayRef.current

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  // Navigation state
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [monthStart, setMonthStart] = useState<Date>(() => getMonthStart(new Date()))

  // Data
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<SpecialDay[]>([])

  // Loading / error
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [calLoading, setCalLoading] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)

  // Drawer state
  const [bundleDrawerOpen, setBundleDrawerOpen] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null)
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false)
  const [selectedSpecialDay, setSelectedSpecialDay] = useState<SpecialDay | null>(null)
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedDayBundles, setSelectedDayBundles] = useState<Bundle[]>([])
  const [selectedDaySpecialDays, setSelectedDaySpecialDays] = useState<SpecialDay[]>([])

  // Snackbar
  const [snackOpen, setSnackOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')

  const [syncingHolidays, setSyncingHolidays] = useState(false)
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [addEventForm, setAddEventForm] = useState({ name: '', emoji: '📅', date: '', end_date: '', color: '#6366F1', description: '', is_recurring: false })
  const [savingEvent, setSavingEvent] = useState(false)

  // ── Derived date ranges ─────────────────────────────────────────────────────

  const weekEnd = addDays(weekStart, 6)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Month grid: Mon-aligned, 6 full rows
  const monthGridStart = getWeekStart(monthStart)
  const monthRange = { from: toYMD(monthGridStart), to: toYMD(addDays(monthGridStart, 41)) }

  const activeFrom = viewMode === 'week' ? toYMD(weekStart) : monthRange.from
  const activeTo = viewMode === 'week' ? toYMD(weekEnd) : monthRange.to

  // ── Fetch channels ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setChannelsLoading(true)
      try {
        const r = await apiFetch('/api/v1/channels')
        if (r.ok) {
          const data = await r.json() as { channels?: Channel[] } | Channel[]
          const list = Array.isArray(data) ? data : (data.channels ?? [])
          setChannels(list)
        }
      } catch {
        // non-fatal
      } finally {
        setChannelsLoading(false)
      }
    }
    void load()
  }, [])

  // ── Fetch calendar bundles ──────────────────────────────────────────────────

  const fetchCalendar = useCallback(async () => {
    setCalLoading(true)
    setCalError(null)
    try {
      let url = `/api/v1/calendar?from=${activeFrom}&to=${activeTo}`
      if (selectedChannelId) url += `&channel_id=${selectedChannelId}`
      const r = await apiFetch(url)
      const data = await parseJson<{ bundles?: Bundle[] } | Bundle[]>(r)
      const list: Bundle[] = Array.isArray(data) ? data : (data.bundles ?? [])
      const enriched = list.map((b) => {
        const ch = channels.find((c) => c.id === b.channel_id)
        return { ...b, channel_name: b.channel_name ?? ch?.brand_name ?? ch?.name }
      })
      setBundles(enriched)
    } catch (e) {
      setCalError(e instanceof Error ? e.message : 'Failed to load calendar.')
    } finally {
      setCalLoading(false)
    }
  }, [activeFrom, activeTo, selectedChannelId, channels])

  useEffect(() => {
    void fetchCalendar()
  }, [fetchCalendar])

  // ── Fetch special days ──────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        let url = `/api/v1/calendar/special-days?from=${activeFrom}&to=${activeTo}`
        if (selectedChannelId) url += `&channel_id=${selectedChannelId}`
        const r = await apiFetch(url)
        if (r.ok) {
          const data = await r.json() as { special_days?: SpecialDay[] }
          setSpecialDays(data.special_days ?? [])
        }
      } catch {
        // non-fatal
      }
    }
    void load()
  }, [activeFrom, activeTo, selectedChannelId])

  // ── Fetch upcoming events (once on mount + channel change) ──────────────────

  useEffect(() => {
    const load = async () => {
      try {
        let url = '/api/v1/calendar/upcoming-events?days=60'
        if (selectedChannelId) url += `&channel_id=${selectedChannelId}`
        const r = await apiFetch(url)
        if (r.ok) {
          const data = await r.json() as { upcoming?: SpecialDay[] }
          setUpcomingEvents(data.upcoming ?? [])
        }
      } catch {
        // non-fatal
      }
    }
    void load()
  }, [selectedChannelId])

  // ── Holiday sync ────────────────────────────────────────────────────────────

  const handleSyncHolidays = async () => {
    setSyncingHolidays(true)
    try {
      const year = (viewMode === 'week' ? weekStart : monthStart).getFullYear()
      const r = await apiFetch(`/api/v1/calendar/sync-holidays?year=${year}&country=IN`, { method: 'POST' })
      const data = await r.json() as { inserted?: number; source?: string; error?: string }
      if (!r.ok) throw new Error(data.error ?? 'Sync failed')
      setSnackMsg(`Synced ${data.inserted ?? 0} holidays from ${data.source ?? 'external source'} for ${year}.`)
      setSnackOpen(true)
      // Reload special days
      const sdUrl = `/api/v1/calendar/special-days?from=${activeFrom}&to=${activeTo}${selectedChannelId ? `&channel_id=${selectedChannelId}` : ''}`
      const sdR = await apiFetch(sdUrl)
      if (sdR.ok) {
        const sdData = await sdR.json() as { special_days?: SpecialDay[] }
        setSpecialDays(sdData.special_days ?? [])
      }
    } catch (e) {
      setSnackMsg(e instanceof Error ? e.message : 'Sync failed.')
      setSnackOpen(true)
    } finally {
      setSyncingHolidays(false)
    }
  }

  // ── Add custom event ─────────────────────────────────────────────────────────

  const handleSaveCustomEvent = async () => {
    if (!addEventForm.name || !addEventForm.date) return
    setSavingEvent(true)
    try {
      const r = await apiFetch('/api/v1/calendar/custom-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addEventForm, channel_id: selectedChannelId || null }),
      })
      if (!r.ok) {
        const d = await r.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to save event')
      }
      setAddEventOpen(false)
      setAddEventForm({ name: '', emoji: '📅', date: '', end_date: '', color: '#6366F1', description: '', is_recurring: false })
      setSnackMsg('Custom event added!')
      setSnackOpen(true)
      // Reload special days to show new custom event
      const sdUrl = `/api/v1/calendar/special-days?from=${activeFrom}&to=${activeTo}${selectedChannelId ? `&channel_id=${selectedChannelId}` : ''}`
      const sdR = await apiFetch(sdUrl)
      if (sdR.ok) {
        const sdData = await sdR.json() as { special_days?: SpecialDay[] }
        setSpecialDays(sdData.special_days ?? [])
      }
    } catch (e) {
      setSnackMsg(e instanceof Error ? e.message : 'Failed to save.')
      setSnackOpen(true)
    } finally {
      setSavingEvent(false)
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handlePrev = () => {
    if (viewMode === 'week') setWeekStart((d) => addDays(d, -7))
    else setMonthStart((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  const handleNext = () => {
    if (viewMode === 'week') setWeekStart((d) => addDays(d, 7))
    else setMonthStart((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  const handleToday = () => {
    setWeekStart(getWeekStart(new Date()))
    setMonthStart(getMonthStart(new Date()))
  }

  // ── Lookups ─────────────────────────────────────────────────────────────────

  const bundlesByDay: Record<string, Bundle[]> = {}
  for (const b of bundles) {
    const key = b.effective_date
    if (!bundlesByDay[key]) bundlesByDay[key] = []
    bundlesByDay[key].push(b)
  }

  const specialDaysByDay: Record<string, SpecialDay[]> = {}
  for (const sd of specialDays) {
    if (!specialDaysByDay[sd.date]) specialDaysByDay[sd.date] = []
    specialDaysByDay[sd.date].push(sd)
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBundleClick = (b: Bundle) => {
    setSelectedBundle(b)
    setBundleDrawerOpen(true)
  }

  const handleSpecialDayClick = (sd: SpecialDay) => {
    setSelectedSpecialDay(sd)
    setPlanDrawerOpen(true)
  }

  const handleDayClick = (date: Date, dayBundles: Bundle[], daySpecialDays: SpecialDay[]) => {
    setSelectedDay(date)
    setSelectedDayBundles(dayBundles)
    setSelectedDaySpecialDays(daySpecialDays)
    setDayDrawerOpen(true)
  }

  const handleRefresh = async () => {
    await fetchCalendar()
    setSnackMsg('Calendar refreshed.')
    setSnackOpen(true)
  }

  const bundlesForSpecialDay: Bundle[] = selectedSpecialDay
    ? (bundlesByDay[selectedSpecialDay.date] ?? [])
    : []

  const navLabel = viewMode === 'week'
    ? formatWeekLabel(weekStart, weekEnd)
    : formatMonthLabel(monthStart)

  // ── Skeleton grid ───────────────────────────────────────────────────────────

  const SkeletonGrid = () => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: viewMode === 'week' ? 'repeat(7, minmax(0, 1fr))' : 'repeat(7, minmax(0, 1fr))',
        gap: 1,
      }}
    >
      {Array.from({ length: viewMode === 'week' ? 7 : 35 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={viewMode === 'week' ? 180 : 96} sx={{ borderRadius: '8px' }} />
      ))}
    </Box>
  )

  // Quick stats for the hero strip — totals are computed from whatever
  // window is currently fetched (week or month).
  const heroStats = (() => {
    const total = bundles.length
    const ready = bundles.filter((b) => b.status === 'ready' || b.status === 'approved').length
    const draft = bundles.filter((b) => b.status === 'draft' || b.status === 'rendering').length
    const events = upcomingEvents.length
    return { total, ready, draft, events }
  })()

  return (
    <Stack spacing={2.5}>
      {/* ── Hero header ────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          border: `1px solid ${alpha(ACCENT, 0.18)}`,
          bgcolor: 'background.paper',
          // Soft accent wash so the page has a clear "you are here" feel
          // without being heavy.
          backgroundImage: `linear-gradient(135deg, ${alpha(ACCENT, 0.08)} 0%, ${alpha(ACCENT, 0.02)} 60%, ${alpha('#FFFFFF', 0)} 100%)`,
          px: { xs: 2.5, md: 3.5 },
          py: { xs: 2.5, md: 3 },
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
                color: '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                boxShadow: `0 8px 24px ${alpha(ACCENT, 0.3)}`,
              }}
            >
              <CalendarTodayRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}
              >
                Content Calendar
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25 }}
              >
                Plan, schedule, and manage posts across all channels.
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              flexShrink: 0,
              alignSelf: { xs: 'stretch', md: 'auto' },
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Tooltip title="Sync holidays & festivals from external calendar source">
              <Button
                variant="outlined"
                size="small"
                startIcon={syncingHolidays ? <CircularProgress size={14} /> : <SyncRoundedIcon />}
                onClick={() => void handleSyncHolidays()}
                disabled={syncingHolidays}
                sx={{
                  height: 38,
                  px: 1.75,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '10px',
                  borderColor: alpha('#0F172A', 0.12),
                  color: 'text.primary',
                  bgcolor: 'background.paper',
                  '&:hover': {
                    borderColor: ACCENT,
                    bgcolor: alpha(ACCENT, 0.06),
                    color: ACCENT_DARK,
                  },
                }}
              >
                Sync holidays
              </Button>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              startIcon={<EventNoteRoundedIcon />}
              onClick={() => setAddEventOpen(true)}
              sx={{
                height: 38,
                px: 1.75,
                fontSize: 12.5,
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: '10px',
                borderColor: alpha('#0F172A', 0.12),
                color: 'text.primary',
                bgcolor: 'background.paper',
                '&:hover': {
                  borderColor: ACCENT,
                  bgcolor: alpha(ACCENT, 0.06),
                  color: ACCENT_DARK,
                },
              }}
            >
              Add event
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddRoundedIcon />}
              sx={{
                minWidth: 130,
                height: 38,
                px: 2,
                fontSize: 12.5,
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
                boxShadow: `0 6px 16px ${alpha(ACCENT, 0.35)}`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${ACCENT_DARK} 0%, ${ACCENT_DARK} 100%)`,
                  boxShadow: `0 8px 20px ${alpha(ACCENT, 0.45)}`,
                },
              }}
            >
              New post
            </Button>
          </Stack>
        </Stack>

        {/* Stats strip — at-a-glance summary of the loaded window */}
        <Stack
          direction="row"
          spacing={3}
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: `1px dashed ${alpha('#0F172A', 0.1)}`,
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {[
            { label: 'Scheduled', value: heroStats.total, color: '#0F172A' },
            { label: 'Ready', value: heroStats.ready, color: '#10B981' },
            { label: 'Drafts', value: heroStats.draft, color: '#F59E0B' },
            { label: 'Upcoming events', value: heroStats.events, color: ACCENT_DARK },
          ].map((s) => (
            <Stack
              key={s.label}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: s.color,
                  flexShrink: 0,
                  boxShadow: `0 0 0 3px ${alpha(s.color, 0.15)}`,
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>
                {s.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, color: 'text.primary', fontSize: 13 }}
              >
                {s.value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Main content + sidebar row */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>

        {/* Main calendar area */}
        <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>

          {/* Error banner */}
          {calError && (
            <Alert severity="error" onClose={() => setCalError(null)} sx={{ borderRadius: '10px' }}>
              {calError}
            </Alert>
          )}

          {/* Controls bar */}
          <GlassCard sx={{ px: 2, py: 1.5 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              sx={{
                alignItems: { xs: 'stretch', md: 'center' },
                justifyContent: 'space-between',
              }}
            >
              {/* Left cluster — date navigation */}
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              >
                {/* Prev / next paired group with shared border */}
                <Stack
                  direction="row"
                  sx={{
                    border: `1px solid ${alpha('#0F172A', 0.1)}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                    height: 38,
                  }}
                >
                  <Tooltip title={viewMode === 'week' ? 'Previous week' : 'Previous month'}>
                    <IconButton
                      onClick={handlePrev}
                      sx={{
                        borderRadius: 0,
                        width: 38,
                        height: 38,
                        color: 'text.secondary',
                        '&:hover': {
                          bgcolor: alpha(ACCENT, 0.08),
                          color: ACCENT_DARK,
                        },
                      }}
                    >
                      <ArrowBackIosNewRoundedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Box
                    sx={{
                      width: 1,
                      bgcolor: alpha('#0F172A', 0.08),
                    }}
                  />
                  <Tooltip title={viewMode === 'week' ? 'Next week' : 'Next month'}>
                    <IconButton
                      onClick={handleNext}
                      sx={{
                        borderRadius: 0,
                        width: 38,
                        height: 38,
                        color: 'text.secondary',
                        '&:hover': {
                          bgcolor: alpha(ACCENT, 0.08),
                          color: ACCENT_DARK,
                        },
                      }}
                    >
                      <ArrowForwardIosRoundedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>

                {/* Date label */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    px: 1.75,
                    height: 38,
                    minWidth: { xs: 'auto', sm: 220 },
                    borderRadius: '10px',
                    border: `1px solid ${alpha('#0F172A', 0.1)}`,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'text.primary',
                      whiteSpace: 'nowrap',
                      letterSpacing: -0.1,
                    }}
                  >
                    {navLabel}
                  </Typography>
                </Box>

                <Button
                  variant="outlined"
                  onClick={handleToday}
                  sx={{
                    height: 38,
                    fontSize: 12.5,
                    fontWeight: 700,
                    textTransform: 'none',
                    px: 2,
                    borderRadius: '10px',
                    borderColor: alpha('#0F172A', 0.12),
                    color: 'text.primary',
                    bgcolor: 'background.paper',
                    '&:hover': {
                      borderColor: ACCENT,
                      color: ACCENT_DARK,
                      bgcolor: alpha(ACCENT, 0.06),
                    },
                  }}
                >
                  Today
                </Button>
              </Stack>

              {/* Right cluster — view toggle + channel filter */}
              <Stack
                direction="row"
                spacing={1.25}
                sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              >
                {/* View toggle — segmented */}
                <Stack
                  direction="row"
                  sx={{
                    height: 38,
                    p: '3px',
                    borderRadius: '10px',
                    border: `1px solid ${alpha('#0F172A', 0.1)}`,
                    bgcolor: alpha('#0F172A', 0.025),
                    flexShrink: 0,
                  }}
                >
                  {(['week', 'month'] as ViewMode[]).map((mode) => {
                    const isActive = viewMode === mode
                    return (
                      <Box
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          px: 1.75,
                          height: '100%',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          transition:
                            'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
                          bgcolor: isActive ? '#FFFFFF' : 'transparent',
                          color: isActive ? ACCENT_DARK : 'text.secondary',
                          boxShadow: isActive
                            ? `0 1px 3px ${alpha('#0F172A', 0.08)}`
                            : 'none',
                          '&:hover': isActive
                            ? {}
                            : { color: 'text.primary' },
                        }}
                      >
                        {mode === 'week' ? (
                          <CalendarViewWeekRoundedIcon sx={{ fontSize: 15 }} />
                        ) : (
                          <CalendarViewMonthRoundedIcon sx={{ fontSize: 15 }} />
                        )}
                        <Typography
                          sx={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            lineHeight: 1,
                            textTransform: 'capitalize',
                          }}
                        >
                          {mode}
                        </Typography>
                      </Box>
                    )
                  })}
                </Stack>

                {/* Channel selector */}
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="cal-channel-lbl" sx={{ fontSize: 13 }}>
                    All channels
                  </InputLabel>
                  <Select
                    labelId="cal-channel-lbl"
                    label="All channels"
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    disabled={channelsLoading}
                    sx={{
                      fontSize: 13,
                      height: 38,
                      borderRadius: '10px',
                      bgcolor: 'background.paper',
                      '& fieldset': {
                        borderColor: alpha('#0F172A', 0.12),
                      },
                      '&:hover fieldset': {
                        borderColor: `${alpha(ACCENT, 0.5)} !important`,
                      },
                    }}
                  >
                    <MenuItem value=""><em>All channels</em></MenuItem>
                    {channels.map((ch) => (
                      <MenuItem key={ch.id} value={ch.id} sx={{ fontSize: 13 }}>
                        {ch.brand_name || ch.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
          </GlassCard>

          {/* Calendar grid */}
          <GlassCard sx={{ p: 1.5 }}>
            {calLoading ? (
              <SkeletonGrid />
            ) : viewMode === 'week' ? (
              <>
                {/* Desktop week view */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <WeekView
                    weekDays={weekDays}
                    bundlesByDay={bundlesByDay}
                    specialDaysByDay={specialDaysByDay}
                    today={today}
                    onBundleClick={handleBundleClick}
                    onSpecialDayClick={handleSpecialDayClick}
                  />
                </Box>

                {/* Mobile week view: day selector strip + single day */}
                <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                  <MobileWeekView
                    weekDays={weekDays}
                    bundlesByDay={bundlesByDay}
                    specialDaysByDay={specialDaysByDay}
                    today={today}
                    onBundleClick={handleBundleClick}
                    onSpecialDayClick={handleSpecialDayClick}
                  />
                </Box>
              </>
            ) : (
              <MonthView
                monthStart={monthStart}
                bundlesByDay={bundlesByDay}
                specialDaysByDay={specialDaysByDay}
                today={today}
                onDayClick={handleDayClick}
                onBundleClick={handleBundleClick}
                onSpecialDayClick={handleSpecialDayClick}
              />
            )}
          </GlassCard>

        </Stack>

        {/* Upcoming events sidebar */}
        <Box sx={{ width: 272, flexShrink: 0 }}>
          <UpcomingEventsSidebar
            events={upcomingEvents}
            onEventClick={handleSpecialDayClick}
          />
        </Box>

      </Stack>

      {/* Drawers */}
      <BundleDetailDrawer
        bundle={selectedBundle}
        open={bundleDrawerOpen}
        onClose={() => setBundleDrawerOpen(false)}
        onRefresh={() => void handleRefresh()}
      />

      <PlanContentDrawer
        specialDay={selectedSpecialDay}
        open={planDrawerOpen}
        channelId={selectedChannelId}
        onClose={() => setPlanDrawerOpen(false)}
        bundlesForDay={bundlesForSpecialDay}
      />

      <DayDetailDrawer
        open={dayDrawerOpen}
        date={selectedDay}
        bundles={selectedDayBundles}
        specialDays={selectedDaySpecialDays}
        onClose={() => setDayDrawerOpen(false)}
        onBundleClick={handleBundleClick}
        onSpecialDayClick={handleSpecialDayClick}
      />

      {/* Add Custom Event Dialog */}
      <Dialog
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, pb: 1 }}>
          Add Custom Event
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Emoji"
                value={addEventForm.emoji}
                onChange={(e) => setAddEventForm((f) => ({ ...f, emoji: e.target.value }))}
                sx={{ width: 80 }}
                size="small"
                slotProps={{ htmlInput: { maxLength: 4 } }}
              />
              <TextField
                label="Event Name"
                value={addEventForm.name}
                onChange={(e) => setAddEventForm((f) => ({ ...f, name: e.target.value }))}
                fullWidth
                size="small"
                required
                placeholder="e.g. Brand Anniversary Sale"
              />
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Date"
                type="date"
                value={addEventForm.date}
                onChange={(e) => setAddEventForm((f) => ({ ...f, date: e.target.value }))}
                fullWidth
                size="small"
                required
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="End Date (optional)"
                type="date"
                value={addEventForm.end_date}
                onChange={(e) => setAddEventForm((f) => ({ ...f, end_date: e.target.value }))}
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <TextField
              label="Description (optional)"
              value={addEventForm.description}
              onChange={(e) => setAddEventForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="What is this event about?"
            />
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <TextField
                label="Color"
                type="color"
                value={addEventForm.color}
                onChange={(e) => setAddEventForm((f) => ({ ...f, color: e.target.value }))}
                size="small"
                sx={{ width: 100 }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Typography variant="caption" color="text.secondary">
                Color used to display this event on the calendar
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setAddEventOpen(false)} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSaveCustomEvent()}
            variant="contained"
            size="small"
            disabled={savingEvent || !addEventForm.name || !addEventForm.date}
            startIcon={savingEvent ? <CircularProgress size={14} /> : null}
            sx={{ borderRadius: '8px', minWidth: 100 }}
          >
            Save Event
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success snackbar */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={3500}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSnackOpen(false)} sx={{ borderRadius: '10px', fontWeight: 600 }}>
          {snackMsg}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

// ─── Mobile Week View ─────────────────────────────────────────────────────────

interface MobileWeekViewProps {
  weekDays: Date[]
  bundlesByDay: Record<string, Bundle[]>
  specialDaysByDay: Record<string, SpecialDay[]>
  today: Date
  onBundleClick: (b: Bundle) => void
  onSpecialDayClick: (sd: SpecialDay) => void
}

function MobileWeekView({ weekDays, bundlesByDay, specialDaysByDay, today, onBundleClick, onSpecialDayClick }: MobileWeekViewProps) {
  const todayIdx = weekDays.findIndex((d) => isSameDay(d, today))
  const [selectedIdx, setSelectedIdx] = useState(todayIdx >= 0 ? todayIdx : 0)

  const activeDay = weekDays[selectedIdx]
  const activeDayYmd = activeDay ? toYMD(activeDay) : ''
  const activeBundles = bundlesByDay[activeDayYmd] ?? []
  const activeSpecial = specialDaysByDay[activeDayYmd] ?? []
  const firstSpecial = activeSpecial[0]

  return (
    <Stack spacing={1.5}>
      {/* Day strip */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          overflowX: 'auto',
          pb: 0.5,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isSelected = selectedIdx === i
          const ymd = toYMD(day)
          const hasBundles = (bundlesByDay[ymd] ?? []).length > 0

          return (
            <Box
              key={i}
              onClick={() => setSelectedIdx(i)}
              sx={{
                flexShrink: 0,
                width: 48,
                py: 1,
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isSelected ? alpha(ACCENT, 0.5) : alpha('#0F172A', 0.09),
                bgcolor: isSelected ? alpha(ACCENT, 0.08) : 'transparent',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 140ms ease',
                '&:hover': { borderColor: alpha(ACCENT, 0.3) },
              }}
            >
              <Typography sx={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: isToday ? ACCENT_DARK : 'text.disabled' }}>
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </Typography>
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  bgcolor: isToday ? ACCENT : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mt: 0.25,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: isSelected ? 800 : 600,
                    color: isToday ? '#fff' : 'text.primary',
                  }}
                >
                  {day.getDate()}
                </Typography>
              </Box>
              {hasBundles && (
                <Box
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    bgcolor: ACCENT,
                    mx: 'auto',
                    mt: 0.5,
                    boxShadow: `0 0 4px ${alpha(ACCENT, 0.6)}`,
                  }}
                />
              )}
            </Box>
          )
        })}
      </Box>

      {/* Active day content */}
      <Box
        sx={{
          borderRadius: '10px',
          border: `1px solid ${firstSpecial ? alpha(firstSpecial.color, 0.35) : alpha('#0F172A', 0.08)}`,
          borderLeft: firstSpecial ? `3px solid ${firstSpecial.color}` : undefined,
          bgcolor: 'rgba(255,255,255,0.03)',
          minHeight: 160,
          p: 1.25,
        }}
      >
        <Stack spacing={0.75}>
          {/* Special day badges */}
          {activeSpecial.map((sd) => (
            <SpecialDayBadge key={sd.key} day={sd} onClick={() => onSpecialDayClick(sd)} />
          ))}

          {/* Bundles */}
          {activeBundles.length === 0 && activeSpecial.length === 0 && (
            <Box
              sx={{
                minHeight: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.4,
              }}
            >
              <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>No posts scheduled</Typography>
            </Box>
          )}

          <Stack spacing={0.75}>
            {activeBundles.map((b) => (
              <BundleCardCompact key={b.id} bundle={b} onClick={() => onBundleClick(b)} />
            ))}
          </Stack>
        </Stack>
      </Box>
    </Stack>
  )
}
