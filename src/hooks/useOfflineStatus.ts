import { useCallback, useEffect, useRef, useState } from 'react'
import {
  flushQueue,
  getQueuedReportCount,
  REPORT_QUEUE_EVENT,
} from '../utils/reportQueue'

const LAST_ONLINE_KEY = 'guardnet:lastOnlineAt'

const readStoredLastOnline = () => {
  if (typeof localStorage === 'undefined') {
    return null
  }

  return localStorage.getItem(LAST_ONLINE_KEY)
}

export const useOfflineStatus = () => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [lastOnlineAt, setLastOnlineAt] = useState<string | null>(() =>
    readStoredLastOnline(),
  )
  const [pendingReports, setPendingReports] = useState(0)
  const wasOnline = useRef(isOnline)

  const setLastOnline = useCallback((timestamp: string) => {
    setLastOnlineAt(timestamp)

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_ONLINE_KEY, timestamp)
    }
  }, [])

  const refreshPendingReports = useCallback(async () => {
    const count = await getQueuedReportCount()
    setPendingReports(count)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadPending = async () => {
      const count = await getQueuedReportCount()
      if (isMounted) {
        setPendingReports(count)
      }
    }

    loadPending()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleOnline = () => {
      setIsOnline(true)
      setLastOnline(new Date().toISOString())
      refreshPendingReports()
    }

    const handleOffline = () => {
      setIsOnline(false)
      refreshPendingReports()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPendingReports, setLastOnline])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleQueueUpdate = () => {
      refreshPendingReports()
    }

    window.addEventListener(REPORT_QUEUE_EVENT, handleQueueUpdate)

    return () => {
      window.removeEventListener(REPORT_QUEUE_EVENT, handleQueueUpdate)
    }
  }, [refreshPendingReports])

  useEffect(() => {
    if (isOnline && !lastOnlineAt) {
      setLastOnline(new Date().toISOString())
    }
  }, [isOnline, lastOnlineAt, setLastOnline])

  useEffect(() => {
    if (isOnline && !wasOnline.current) {
      const syncQueued = async () => {
        await flushQueue()
        await refreshPendingReports()
      }

      syncQueued()
    }

    wasOnline.current = isOnline
  }, [isOnline, refreshPendingReports])

  return {
    isOnline,
    lastOnlineAt,
    pendingReports,
  }
}
