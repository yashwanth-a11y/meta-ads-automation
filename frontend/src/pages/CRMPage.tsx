import {
  FormControl,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { alpha } from '@mui/material/styles'
import { useState } from 'react'
import { GlassCard } from '../components/ui/GlassCard'
import { PageHeader } from '../components/ui/PageHeader'

type Status = 'New' | 'Contacted' | 'Interested' | 'Won' | 'Lost'

const rows: { name: string; phone: string; status: Status; source: string }[] = [
  { name: 'Jordan Lee', phone: '+1 (415) 555-0192', status: 'New', source: 'Meta Lead Form' },
  { name: 'Samira Khan', phone: '+44 7700 900321', status: 'Contacted', source: 'Organic Search' },
  { name: 'Chris Patel', phone: '+1 (646) 555-0138', status: 'Interested', source: 'Webinar' },
  { name: 'Taylor Brooks', phone: '+61 400 000 111', status: 'Won', source: 'Partner Referral' },
  { name: 'Riley Chen', phone: '+1 (206) 555-0177', status: 'Lost', source: 'Cold Outreach' },
]

const statusStyles: Record<
  Status,
  { bg: string; border: string; color: string }
> = {
  New: {
    bg: alpha('#FFFFFF', 0.08),
    border: alpha('#FFFFFF', 0.2),
    color: '#FAFAFA',
  },
  Contacted: {
    bg: alpha('#FFFFFF', 0.05),
    border: alpha('#FFFFFF', 0.12),
    color: '#D4D4D4',
  },
  Interested: {
    bg: alpha('#FFFFFF', 0.12),
    border: alpha('#FFFFFF', 0.28),
    color: '#FFFFFF',
  },
  Won: {
    bg: alpha('#FFFFFF', 0.18),
    border: alpha('#FFFFFF', 0.35),
    color: '#FFFFFF',
  },
  Lost: {
    bg: alpha('#FFFFFF', 0.03),
    border: alpha('#FFFFFF', 0.08),
    color: '#A3A3A3',
  },
}

export function CRMPage() {
  const [statuses, setStatuses] = useState<Record<string, Status>>(
    Object.fromEntries(rows.map((r) => [r.name, r.status])),
  )

  const handleChange = (name: string) => (e: SelectChangeEvent<Status>) => {
    setStatuses((s) => ({ ...s, [name]: e.target.value as Status }))
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="CRM"
        subtitle="Operational pipeline with crisp states — monochrome tags keep scanning effortless."
      />

      <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell width={200}>Status</TableCell>
                <TableCell>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name} hover>
                  <TableCell>
                    <Typography variant='subtitle2'>{row.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography  color="text.secondary">
                      {row.phone}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <Select
                        value={statuses[row.name]}
                        onChange={handleChange(row.name)}
                        sx={{
                          borderRadius: 2,
                          '& .MuiSelect-select': {
                            py: 1,
                            px: 1.25,
                            fontWeight: 700,
                            fontSize: '0.8125rem',
                            bgcolor: statusStyles[statuses[row.name]].bg,
                            border: `1px solid ${statusStyles[statuses[row.name]].border}`,
                            borderRadius: 2,
                            color: statusStyles[statuses[row.name]].color,
                          },
                        }}
                      >
                        {(['New', 'Contacted', 'Interested', 'Won', 'Lost'] as const).map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Typography color="text.secondary">
                      {row.source}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>
    </Stack>
  )
}
