import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconBarrierBlock,
  IconBoltOff,
  IconFlame,
  IconRipple,
  IconWind,
} from '@tabler/icons-react'
import type { CommunityReport } from '../types'
import { getCommunityReports } from '../services/firebase'
import './reporting.css'

type LocationState = {
  lat: number
  lng: number
}

type ReportTypeMeta = {
  label: string
  Icon: typeof IconRipple
}

const REPORT_RADIUS_KM = 25
const MAX_REPORTS = 30

const REPORT_META: Record<CommunityReport['type'], ReportTypeMeta> = {
  flooding: { label: 'Flooding', Icon: IconRipple },
  powercut: { label: 'Power Cut', Icon: IconBoltOff },
  roadblocked: { label: 'Road Blocked', Icon: IconBarrierBlock },
  wind: { label: 'Strong Winds', Icon: IconWind },
  fire: { label: 'Fire/Smoke', Icon: IconFlame },
}

const toMinutesAgo = (timestamp: string) => {
  const ms = Date.parse(timestamp)
  if (!Number.isFinite(ms)) {
    return null
  }
  const diff = Date.now() - ms
  return Math.max(1, Math.floor(diff / 60000))
}

const toRadians = (value: number) => (value * Math.PI) / 180

const haversineDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const earthRadiusKm = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm === null || Number.isNaN(distanceKm)) {
    return 'Distance unavailable'
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`
  }
  return `${distanceKm.toFixed(1)} km away`
}

const ReportFeed = () => {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [location, setLocation] = useState<LocationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<number | null>(null)

  const loadReports = async (coords: LocationState) => {
    setLoading(true)
    setError(null)

    try {
      const data = await getCommunityReports(
        coords.lat,
        coords.lng,
        REPORT_RADIUS_KM,
      )
      setReports(data.slice(0, MAX_REPORTS))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load community reports.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is unavailable.')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setLocation(coords)
      },
      (geoError) => {
        setError(geoError.message || 'Unable to access your location.')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    if (!location) {
      return
    }

    let active = true

    loadReports(location).then(() => {
      if (!active) {
        return
      }
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
      }
      intervalRef.current = window.setInterval(() => {
        loadReports(location)
      }, 60000)
    })

    return () => {
      active = false
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
      }
    }
  }, [location])

  const cards = useMemo(() => {
    return reports.map((report) => {
      const minutesAgo = toMinutesAgo(report.timestamp)
      const distanceKm = location
        ? haversineDistanceKm(
            location.lat,
            location.lng,
            report.lat,
            report.lng,
          )
        : null
      const isLive = minutesAgo !== null && minutesAgo <= 30
      const isStale = minutesAgo !== null && minutesAgo >= 120

      return {
        report,
        minutesAgo,
        distanceLabel: formatDistance(distanceKm),
        isLive,
        isStale,
      }
    })
  }, [location, reports])

  return (
    <section className="report-feed">
      <header className="report-feed-header">
        <div>
          <h3>Community reports</h3>
          <p>Last 30 updates near you</p>
        </div>
        <span className="report-refresh">Auto-refreshes every minute</span>
      </header>
      {loading && <p className="report-feed-status">Loading reports...</p>}
      {error && <p className="report-feed-error">{error}</p>}
      {!loading && !error && cards.length === 0 && (
        <p className="report-feed-status">No recent reports nearby.</p>
      )}
      <div className="report-feed-list">
        {cards.map(({ report, minutesAgo, distanceLabel, isLive, isStale }) => {
          const meta = REPORT_META[report.type]
          const Icon = meta.Icon
          const timeLabel =
            minutesAgo === null ? 'Time unknown' : `${minutesAgo} min ago`

          return (
            <article
              key={report.id}
              className={`report-card ${isStale ? 'is-stale' : ''}`}
            >
              <div className="report-card-header">
                <div className="report-type">
                  <span className="report-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <div>
                    <div className="report-label">{meta.label}</div>
                    <div className="report-meta">{timeLabel}</div>
                  </div>
                </div>
                {isLive && (
                  <span className="live-badge">
                    <span className="live-dot" aria-hidden="true" /> LIVE
                  </span>
                )}
              </div>
              {report.description && (
                <p className="report-description">{report.description}</p>
              )}
              <div className="report-distance">{distanceLabel}</div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default ReportFeed
