import { useMemo } from 'react'
import { useOfflineStatus } from '../hooks/useOfflineStatus'

const formatLastSync = (lastOnlineAt: string | null) => {
  if (!lastOnlineAt) {
    return 'Last synced: unknown'
  }

  const parsed = new Date(lastOnlineAt)
  if (Number.isNaN(parsed.getTime())) {
    return 'Last synced: unknown'
  }

  return `Last synced: ${parsed.toLocaleString()}`
}

type OfflineBannerProps = {
  forceShow?: boolean
  forcedPendingReports?: number
  forcedLastOnlineAt?: string | null
}

const OfflineBanner = ({
  forceShow = false,
  forcedPendingReports,
  forcedLastOnlineAt,
}: OfflineBannerProps) => {
  const { isOnline, lastOnlineAt, pendingReports } = useOfflineStatus()

  const resolvedOnline = forceShow ? false : isOnline
  const resolvedLastOnline = forceShow
    ? forcedLastOnlineAt ?? lastOnlineAt
    : lastOnlineAt
  const resolvedPendingReports = forceShow
    ? forcedPendingReports ?? pendingReports
    : pendingReports

  const lastSyncLabel = useMemo(
    () => formatLastSync(resolvedLastOnline),
    [resolvedLastOnline],
  )

  if (resolvedOnline) {
    return null
  }

  const reportLabel =
    resolvedPendingReports === 1
      ? '1 pending report'
      : `${resolvedPendingReports} pending reports`

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#fef08a',
        color: '#713f12',
        borderBottom: '1px solid #facc15',
        padding: '0.6rem 1rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        fontWeight: 600,
      }}
    >
      <span>Offline mode enabled.</span>
      <span>{lastSyncLabel}</span>
      <span>{reportLabel}</span>
    </div>
  )
}

export default OfflineBanner
