import { Navigate } from 'react-router-dom'
import { useActiveBusiness } from '@/features/business/hooks'

export function SettingsIndexRedirect() {
  const { role } = useActiveBusiness()
  const canManage = role === 'owner' || role === 'manager'
  return <Navigate to={canManage ? '/settings/business' : '/settings/appearance'} replace />
}
