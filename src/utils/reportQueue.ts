import { createStore, del, entries, keys, set } from 'idb-keyval'
import type { CommunityReport } from '../types'
import { addCommunityReport } from '../services/firebase'

export const REPORT_QUEUE_EVENT = 'report-queue-updated'

type QueuedReport = Omit<CommunityReport, 'id' | 'geohash'>

const store = createStore('guardnet', 'reportQueue')

const notifyQueueChange = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(REPORT_QUEUE_EVENT))
}

const buildQueueKey = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const queueReport = async (report: QueuedReport) => {
  await set(buildQueueKey(), report, store)
  notifyQueueChange()
}

export const getQueuedReportCount = async () => {
  const reportKeys = await keys(store)
  return reportKeys.length
}

export const flushQueue = async () => {
  const queuedEntries = (await entries(store)) as Array<
    [IDBValidKey, QueuedReport]
  >

  if (queuedEntries.length === 0) {
    return 0
  }

  const sorted = [...queuedEntries].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0])),
  )

  let flushed = 0

  for (const [key, report] of sorted) {
    try {
      await addCommunityReport(report)
      await del(key, store)
      flushed += 1
    } catch {
      // Keep the report queued for the next retry.
    }
  }

  if (flushed > 0) {
    notifyQueueChange()
  }

  return flushed
}
