import {
  IconBell,
  IconClipboardList,
  IconCloudRain,
  IconMap2,
  IconMapPin,
  IconPlus,
  IconSearch,
  IconShield,
  IconTemperature,
  IconUserShield,
  IconWind,
} from '@tabler/icons-react'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import GuardianPanel from './components/GuardianPanel'
import Map from './components/Map'
import DemoTour from './components/DemoTour'
import OfflineBanner from './components/OfflineBanner'
import ReportFeed from './components/ReportFeed'
import ReportModal from './components/ReportModal'
import { useOfflineStatus } from './hooks/useOfflineStatus'
import { activateDemoMode } from './utils/demoMode'
import { generateRiskBriefing } from './services/aiNarration'
import { getDisastersNear } from './services/disasterService'
import { calculateRisk } from './services/riskEngine'
import { getWeather } from './services/weatherService'
import type { DisasterEvent, RiskScore, WeatherData } from './types'
import './App.css'

type Coords = {
  lat: number
  lng: number
}

const LOCATION_REFRESH_MS = 10 * 60 * 1000
const DISASTER_RADIUS_KM = 250

const riskRingColors: Record<RiskScore['level'], string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

const formatDistance = (distanceKm: number) =>
  distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`

const toRelativeTime = (timestamp: string) => {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) {
    return 'Unknown'
  }
  const diffMinutes = Math.max(1, Math.floor((Date.now() - parsed) / 60000))
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }
  const hours = Math.floor(diffMinutes / 60)
  return `${hours} hr ago`
}

const haversineDistanceKm = (a: Coords, b: Coords) => {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const calc =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(calc), Math.sqrt(1 - calc))
}

const formatLocationName = (payload: {
  display_name?: string
  address?: Record<string, string>
}) => {
  const address = payload.address ?? {}
  return (
    address.city ||
    address.town ||
    address.village ||
    address.county ||
    address.state ||
    payload.display_name?.split(',')[0] ||
    'Unknown location'
  )
}

const App = () => {
  const { isOnline } = useOfflineStatus()
  const [coords, setCoords] = useState<Coords | null>(null)
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [disasters, setDisasters] = useState<DisasterEvent[]>([])
  const [locationName, setLocationName] = useState('Locating...')
  const [locationUpdatedAt, setLocationUpdatedAt] = useState(0)
  const [aiNarration, setAiNarration] = useState('')
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportCoords, setReportCoords] = useState<Coords | null>(null)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [demoActive, setDemoActive] = useState(() => {
    if (typeof sessionStorage === 'undefined') {
      return false
    }
    return sessionStorage.getItem('guardnet_demo') === 'true'
  })
  const [demoOffline, setDemoOffline] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [mobileTab, setMobileTab] = useState<'map' | 'risk' | 'guardian' | 'reports'>(
    'map',
  )
  const refreshTimer = useRef<number | null>(null)

  const loadLocationName = useCallback(async (target: Coords) => {
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(target.lat),
        lon: String(target.lng),
      })
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      )
      if (!response.ok) {
        throw new Error('Location lookup failed')
      }
      const payload = (await response.json()) as {
        display_name?: string
        address?: Record<string, string>
      }
      setLocationName(formatLocationName(payload))
      setLocationUpdatedAt(Date.now())
    } catch {
      setLocationName('Unknown location')
    }
  }, [])

  const loadRisk = useCallback(async () => {
    if (!coords) {
      return
    }
    setRiskLoading(true)
    try {
      const score = await calculateRisk(coords.lat, coords.lng)
      setRiskScore(score)
    } catch {
      setRiskScore(null)
    } finally {
      setRiskLoading(false)
    }
  }, [coords])

  const loadWeather = useCallback(async () => {
    if (!coords) {
      return
    }
    try {
      const data = await getWeather(coords.lat, coords.lng)
      setWeatherData(data)
    } catch {
      setWeatherData(null)
    }
  }, [coords])

  const loadDisasters = useCallback(async () => {
    if (!coords) {
      return
    }
    try {
      const data = await getDisastersNear(
        coords.lat,
        coords.lng,
        DISASTER_RADIUS_KM,
      )
      setDisasters(data)
    } catch {
      setDisasters([])
    }
  }, [coords])

  useEffect(() => {
    if (demoActive) {
      activateDemoMode()
    }
  }, [demoActive])

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setCoords(next)
        setReportCoords(next)
      },
      () => {
        setCoords(null)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    if (!coords) {
      return
    }

    loadRisk()
    loadWeather()
    loadDisasters()
    loadLocationName(coords)

    if (refreshTimer.current) {
      window.clearInterval(refreshTimer.current)
    }
    refreshTimer.current = window.setInterval(() => {
      loadRisk()
      loadWeather()
      loadDisasters()
      const now = Date.now()
      if (now - locationUpdatedAt > LOCATION_REFRESH_MS) {
        loadLocationName(coords)
      }
    }, 60000)

    return () => {
      if (refreshTimer.current) {
        window.clearInterval(refreshTimer.current)
      }
    }
  }, [
    coords,
    loadDisasters,
    loadLocationName,
    loadRisk,
    loadWeather,
    locationUpdatedAt,
  ])

  useEffect(() => {
    if (!riskScore || !weatherData) {
      return
    }

    const getNarration = async () => {
      const text = await generateRiskBriefing(
        riskScore,
        weatherData,
        disasters,
        locationName,
      )
      setAiNarration(text)
    }

    getNarration()
  }, [disasters, locationName, riskScore, weatherData])

  const ringStyle = useMemo(() => {
    const level = riskScore?.level ?? 'low'
    const ringColor = riskRingColors[level]
    return {
      background: `conic-gradient(${ringColor}, rgba(15, 23, 42, 0.15), ${ringColor})`,
    }
  }, [riskScore])

  const weatherItems = useMemo(() => {
    if (!weatherData) {
      return [
        { label: 'Temp', value: '--', Icon: IconTemperature },
        { label: 'Wind', value: '--', Icon: IconWind },
        { label: 'Rain', value: '--', Icon: IconCloudRain },
      ]
    }

    return [
      {
        label: 'Temp',
        value: `${Math.round(weatherData.temp)} C`,
        Icon: IconTemperature,
      },
      {
        label: 'Wind',
        value: `${Math.round(weatherData.windSpeed)} km/h`,
        Icon: IconWind,
      },
      {
        label: 'Rain',
        value: `${Math.round(weatherData.precipitation)} mm`,
        Icon: IconCloudRain,
      },
    ]
  }, [weatherData])

  const disasterCards = useMemo(() => {
    if (!coords) {
      return []
    }
    return disasters
      .map((event) => {
        const distance = haversineDistanceKm(coords, {
          lat: event.lat,
          lng: event.lng,
        })
        return {
          event,
          distance,
          timeLabel: toRelativeTime(event.timestamp),
        }
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12)
  }, [coords, disasters])

  const riskScoreValue = riskScore?.score ?? 0
  const riskLevelLabel = riskScore?.level ?? 'low'
  const narrationText = aiNarration || riskScore?.aiSummary || 'Risk briefing unavailable.'

  const locationBadge = (
    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
      <IconMapPin size={14} />
      <span className="max-w-[140px] truncate sm:max-w-none">
        {locationName}
      </span>
    </div>
  )

  const demoBanner = demoActive ? (
    <div className="fixed left-0 right-0 top-[52px] z-40 flex items-center justify-between bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
      <span>DEMO MODE</span>
      <button
        type="button"
        id="offline-banner-toggle"
        className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white"
        onClick={() => setDemoOffline((prev) => !prev)}
      >
        Toggle offline banner
      </button>
    </div>
  ) : null

  const onlineBadge = (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        isOnline
          ? 'bg-emerald-400/20 text-emerald-200'
          : 'bg-rose-400/20 text-rose-200'
      }`}
    >
      {isOnline ? 'Online' : 'Offline'}
    </span>
  )

  const sideCardClass =
    'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900"
      style={
        {
          '--gn-navy': '#0F172A',
          '--gn-blue': '#3B82F6',
          '--gn-critical': '#EF4444',
          '--gn-high': '#F97316',
        } as CSSProperties
      }
    >
      <OfflineBanner
        forceShow={demoActive && demoOffline}
        forcedPendingReports={2}
        forcedLastOnlineAt={new Date(Date.now() - 35 * 60000).toISOString()}
      />
      {demoBanner}
      <header className="fixed inset-x-0 top-0 z-40 flex h-[52px] items-center justify-between border-b border-white/10 bg-[color:var(--gn-navy)] px-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-xs font-bold uppercase tracking-[0.2em]">
            GN
          </div>
          <div>
            <p className="text-sm font-semibold">GuardNet</p>
            <p className="text-[11px] text-white/60">Field command</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 sm:flex">
            <IconSearch size={14} />
            <input
              value={searchValue}
              onChange={(event) => {
                const next = event.target.value
                setSearchValue(next)
                if (next.trim().toLowerCase() === 'demo') {
                  setDemoActive(true)
                }
              }}
              placeholder="Search"
              className="w-28 bg-transparent text-xs text-white placeholder:text-white/50 focus:outline-none"
            />
          </label>
          {locationBadge}
          {onlineBadge}
          <button
            type="button"
            className="rounded-full border border-white/15 p-2 text-white/80 transition hover:bg-white/10"
            aria-label="Notifications"
          >
            <IconBell size={18} />
          </button>
        </div>
      </header>

      <main className="pt-[52px]">
        <div
          className={`hidden h-[calc(100vh-52px)] gap-4 px-4 py-4 md:flex ${
            demoActive ? 'pt-10' : ''
          }`}
        >
          <aside className="flex w-[300px] flex-col gap-4">
            <section className={sideCardClass} id="risk-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Risk score
                  </p>
                  <p className="text-sm font-semibold capitalize text-slate-900">
                    {riskLevelLabel}
                  </p>
                </div>
                {riskLoading && (
                  <span className="text-xs font-medium text-slate-400">
                    Updating...
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="relative flex h-32 w-32 animate-pulse items-center justify-center rounded-full p-2 motion-reduce:animate-none"
                  style={ringStyle}
                >
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white">
                    <span className="text-3xl font-semibold text-slate-900">
                      {riskScoreValue}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                      / 100
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-slate-600">{narrationText}</p>
                  <p className="text-xs text-slate-400">
                    Last updated{' '}
                    {riskScore
                      ? new Date(riskScore.lastUpdated).toLocaleTimeString()
                      : 'Unknown'}
                  </p>
                </div>
              </div>
            </section>

            <section className={sideCardClass}>
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Weather bar</h3>
                <span className="text-[11px] text-slate-400">Live</span>
              </header>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {weatherItems.map(({ label, value, Icon }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2"
                  >
                    <Icon size={18} className="text-slate-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      {value}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={sideCardClass}>
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Nearby disasters
                </h3>
                <span className="text-[11px] text-slate-400">
                  {disasterCards.length} active
                </span>
              </header>
              <div className="mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-2">
                {disasterCards.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No active events within {DISASTER_RADIUS_KM} km.
                  </p>
                )}
                {disasterCards.map(({ event, distance, timeLabel }) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            event.severity === 'critical'
                              ? 'bg-[color:var(--gn-critical)]'
                              : event.severity === 'high'
                                ? 'bg-[color:var(--gn-high)]'
                                : event.severity === 'medium'
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                          }`}
                        />
                        <p className="text-sm font-semibold text-slate-900">
                          {event.title}
                        </p>
                      </div>
                      <span className="text-[11px] uppercase text-slate-400">
                        {event.severity}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{formatDistance(distance)}</span>
                      <span>{timeLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="flex flex-1 flex-col" id="disaster-map">
            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <div className="flex items-center gap-2">
                  <IconMap2 size={18} className="text-[color:var(--gn-blue)]" />
                  <span className="text-sm font-semibold text-slate-900">
                    Live map
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    id="evacuation-route"
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"
                  >
                    Evacuation route
                  </span>
                  <span className="text-xs text-slate-400">Full coverage</span>
                </div>
              </div>
              <div className="h-full overflow-hidden">
                <Map className="h-full w-full" />
              </div>
            </div>
          </section>

          <aside
            className={`flex flex-col transition-all duration-300 ${
              isRightCollapsed ? 'w-16' : 'w-[260px]'
            }`}
          >
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <IconUserShield
                  size={18}
                  className="text-[color:var(--gn-blue)]"
                />
                {!isRightCollapsed && (
                  <span className="text-sm font-semibold text-slate-900">
                    Guardian ops
                  </span>
                )}
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 p-1 text-slate-500"
                onClick={() => setIsRightCollapsed((prev) => !prev)}
                aria-label="Toggle right panel"
              >
                {isRightCollapsed ? '>' : '<'}
              </button>
            </div>
            {!isRightCollapsed && (
              <div className="mt-4 flex flex-1 flex-col gap-4 overflow-hidden">
                <div
                  className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  id="guardian-panel"
                >
                  <GuardianPanel />
                </div>
                <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <ReportFeed />
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="md:hidden">
          <div
            className={`h-[calc(100vh-52px-72px)] px-4 py-4 ${
              demoActive ? 'pt-10' : ''
            }`}
          >
            {mobileTab === 'map' && (
              <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Map className="h-full w-full" />
              </div>
            )}
            {mobileTab === 'risk' && (
              <div className="space-y-4">
                <section className={sideCardClass}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Risk score
                      </p>
                      <p className="text-sm font-semibold capitalize text-slate-900">
                        {riskLevelLabel}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <div
                      className="relative flex h-28 w-28 animate-pulse items-center justify-center rounded-full p-2"
                      style={ringStyle}
                    >
                      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
                        <span className="text-2xl font-semibold text-slate-900">
                          {riskScoreValue}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          / 100
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm text-slate-600">{narrationText}</p>
                      <p className="text-xs text-slate-400">
                        Last updated{' '}
                        {riskScore
                          ? new Date(riskScore.lastUpdated).toLocaleTimeString()
                          : 'Unknown'}
                      </p>
                    </div>
                  </div>
                </section>

                <section className={sideCardClass}>
                  <header className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Weather bar
                    </h3>
                    <span className="text-[11px] text-slate-400">Live</span>
                  </header>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {weatherItems.map(({ label, value, Icon }) => (
                      <div
                        key={label}
                        className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2"
                      >
                        <Icon size={18} className="text-slate-600" />
                        <span className="text-xs font-semibold text-slate-700">
                          {value}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={sideCardClass}>
                  <header className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Nearby disasters
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {disasterCards.length} active
                    </span>
                  </header>
                  <div className="mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-2">
                    {disasterCards.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No active events within {DISASTER_RADIUS_KM} km.
                      </p>
                    )}
                    {disasterCards.map(({ event, distance, timeLabel }) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                event.severity === 'critical'
                                  ? 'bg-[color:var(--gn-critical)]'
                                  : event.severity === 'high'
                                    ? 'bg-[color:var(--gn-high)]'
                                    : event.severity === 'medium'
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-400'
                              }`}
                            />
                            <p className="text-sm font-semibold text-slate-900">
                              {event.title}
                            </p>
                          </div>
                          <span className="text-[11px] uppercase text-slate-400">
                            {event.severity}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>{formatDistance(distance)}</span>
                          <span>{timeLabel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {mobileTab === 'guardian' && (
              <div className="h-full overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <GuardianPanel />
              </div>
            )}
            {mobileTab === 'reports' && (
              <div className="h-full overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <ReportFeed />
              </div>
            )}
          </div>

          <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[72px] items-center justify-around border-t border-slate-200 bg-white px-4">
            <button
              type="button"
              onClick={() => setMobileTab('map')}
              className={`flex flex-col items-center gap-1 text-xs font-semibold ${
                mobileTab === 'map' ? 'text-[color:var(--gn-blue)]' : 'text-slate-500'
              }`}
            >
              <IconMap2 size={20} />
              Map
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('risk')}
              className={`flex flex-col items-center gap-1 text-xs font-semibold ${
                mobileTab === 'risk' ? 'text-[color:var(--gn-blue)]' : 'text-slate-500'
              }`}
            >
              <IconShield size={20} />
              Risk
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('guardian')}
              className={`flex flex-col items-center gap-1 text-xs font-semibold ${
                mobileTab === 'guardian'
                  ? 'text-[color:var(--gn-blue)]'
                  : 'text-slate-500'
              }`}
            >
              <IconUserShield size={20} />
              Guardian
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('reports')}
              className={`flex flex-col items-center gap-1 text-xs font-semibold ${
                mobileTab === 'reports'
                  ? 'text-[color:var(--gn-blue)]'
                  : 'text-slate-500'
              }`}
            >
              <IconClipboardList size={20} />
              Reports
            </button>
          </nav>
          <div className="fixed bottom-[84px] left-4 right-4 z-40 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm">
            <IconSearch size={16} />
            <input
              value={searchValue}
              onChange={(event) => {
                const next = event.target.value
                setSearchValue(next)
                if (next.trim().toLowerCase() === 'demo') {
                  setDemoActive(true)
                }
              }}
              placeholder="Search"
              className="w-full bg-transparent text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </main>

      <button
        type="button"
        id="report-fab"
        onClick={() => {
          if (!reportCoords) {
            return
          }
          setIsReportOpen(true)
        }}
        className="fixed bottom-[92px] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--gn-blue)] text-white shadow-xl transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 md:bottom-6"
        aria-label="Open report modal"
        disabled={!reportCoords}
      >
        <IconPlus size={22} />
      </button>

      <DemoTour
        isActive={demoActive}
        onOpenReportModal={() => {
          if (reportCoords) {
            setIsReportOpen(true)
          }
        }}
        onToggleOfflineBanner={() => setDemoOffline((prev) => !prev)}
      />

      <ReportModal
        isOpen={isReportOpen}
        lat={reportCoords?.lat ?? 0}
        lng={reportCoords?.lng ?? 0}
        onClose={() => setIsReportOpen(false)}
      />
    </div>
  )
}

export default App
