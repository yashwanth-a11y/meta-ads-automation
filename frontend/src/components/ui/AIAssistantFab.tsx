import { Fab } from '@mui/material'
import { alpha } from '@mui/material/styles'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'

interface AIAssistantFabProps {
  active: boolean
  onToggle: () => void
}

export function AIAssistantFab({ active, onToggle }: AIAssistantFabProps) {
  return (
    <Fab
      color="primary"
      aria-label={active ? 'Exit AI assistant' : 'Open AI assistant'}
      onClick={onToggle}
      sx={{
        position: 'fixed',
        right: { xs: 16, md: 28 },
        bottom: { xs: 16, md: 28 },
        zIndex: (t) => t.zIndex.drawer + 2,
        boxShadow: `0 12px 40px ${alpha('#000000', 0.45)}, 0 0 0 1px ${alpha('#FFFFFF', 0.12)}`,
      }}
    >
      {active ? <CloseRoundedIcon sx={{
        color:"#FFF"
      }} /> : 
      <AutoAwesomeOutlinedIcon sx={{
        color: '#FFF',
      }}  />}
    </Fab>
  )
}
