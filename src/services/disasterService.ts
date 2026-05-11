import type { DisasterEvent } from '../types'

const CACHE_KEY = 'disasters:active'
const CACHE_TTL_MS = 10 * 60 * 1000
const DEDUPE_DISTANCE_KM = 50

let disasterOverride: DisasterEvent[] | null = null

export const setDisasterOverride = (override: DisasterEvent[] | null) => {
  disasterOverride = override
}

const severityRank: Record<DisasterEvent['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

type CacheEntry = {
  expiresAt: number
  data: DisasterEvent[]
}

type UsgsFeature = {
  id?: string
  properties?: {
    mag?: number
    place?: string
    time?: number
    url?: string
  }
  geometry?: {
    coordinates?: [number, number, number]
  }
}

type UsgsResponse = {
  features?: UsgsFeature[]
}

type NasaCategory = {
  id?: number
}

type NasaGeometry = {
  coordinates?: [number, number]
  date?: string
}

type NasaEvent = {
  id?: string
  title?: string
  categories?: NasaCategory[]
  geometry?: NasaGeometry[]
  link?: string
  sources?: Array<{ url?: string }>
  geometry_default?: NasaGeometry
}

type NasaResponse = {
  events?: NasaEvent[]
}

const readCache = (): DisasterEvent[] | null => {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) {
    return null
  }

  try {
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return entry.data
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

const writeCache = (data: DisasterEvent[]) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  const entry: CacheEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  }

  localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
}

const toSeverityFromMagnitude = (mag: number): DisasterEvent['severity'] => {
  if (mag >= 7) {
    return 'critical'
  }
  if (mag >= 6) {
    return 'high'
  }
  if (mag >= 4) {
    return 'medium'
  }
  return 'low'
}

const toSeverityFromAlertLevel = (
  level: string | null,
): DisasterEvent['severity'] => {
  const normalized = level?.toLowerCase() ?? ''
  if (normalized === 'red') {
    return 'critical'
  }
  if (normalized === 'orange') {
    return 'high'
  }
  if (normalized === 'green') {
    return 'low'
  }
  return 'medium'
}

const toTypeFromNasaCategory = (
  categoryId: number | undefined,
): DisasterEvent['type'] | null => {
  switch (categoryId) {
    case 8:
      return 'fire'
    case 19:
      return 'flood'
    case 10:
      return 'cyclone'
    default:
      return null
  }
}

const toTypeFromGdacs = (
  eventType: string | null,
): DisasterEvent['type'] | null => {
  const normalized = eventType?.toLowerCase() ?? ''
  if (normalized === 'eq' || normalized === 'earthquake') {
    return 'earthquake'
  }
  if (normalized === 'tc' || normalized === 'cyclone') {
    return 'cyclone'
  }
  if (normalized === 'fl' || normalized === 'flood') {
    return 'flood'
  }
  if (normalized === 'wf' || normalized === 'wildfire' || normalized === 'fire') {
    return 'fire'
  }
  if (normalized === 'ht' || normalized === 'heatwave') {
    return 'heatwave'
  }
  return null
}

const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

const dedupeEvents = (events: DisasterEvent[]) => {
  const deduped: DisasterEvent[] = []

  for (const event of events) {
    const matchIndex = deduped.findIndex(
      (candidate) =>
        candidate.type === event.type &&
        haversineDistanceKm(
          candidate.lat,
          candidate.lng,
          event.lat,
          event.lng,
        ) <= DEDUPE_DISTANCE_KM,
    )

    if (matchIndex === -1) {
      deduped.push(event)
      continue
    }

    const existing = deduped[matchIndex]
    if (severityRank[event.severity] > severityRank[existing.severity]) {
      deduped[matchIndex] = event
    }
  }

  return deduped
}

const fetchUsgs = async (): Promise<DisasterEvent[]> => {
  const response = await fetch(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson',
  )

  if (!response.ok) {
    throw new Error('USGS request failed')
  }

  const data = (await response.json()) as UsgsResponse

  return (data.features ?? [])
    .map((feature) => {
      const coords = feature.geometry?.coordinates
      const lat = coords?.[1]
      const lng = coords?.[0]
      if (lat == null || lng == null) {
        return null
      }

      const magnitude = feature.properties?.mag ?? 0

      return {
        id: feature.id ?? `usgs-${lat}-${lng}-${feature.properties?.time ?? 0}`,
        type: 'earthquake',
        title: feature.properties?.place ?? 'Earthquake',
        severity: toSeverityFromMagnitude(magnitude),
        lat,
        lng,
        radius: 75,
        source: 'usgs',
        timestamp: feature.properties?.time
          ? new Date(feature.properties.time).toISOString()
          : new Date().toISOString(),
        url: feature.properties?.url ?? 'https://earthquake.usgs.gov',
      } satisfies DisasterEvent
    })
    .filter(Boolean) as DisasterEvent[]
}

const fetchNasa = async (): Promise<DisasterEvent[]> => {
  const response = await fetch(
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50',
  )

  if (!response.ok) {
    throw new Error('NASA EONET request failed')
  }

  const data = (await response.json()) as NasaResponse

  return (data.events ?? [])
    .map((event) => {
      const categoryId = event.categories?.[0]?.id
      const type = toTypeFromNasaCategory(categoryId)
      if (!type) {
        return null
      }

      const geometry =
        event.geometry?.[event.geometry.length - 1] ??
        event.geometry_default

      const lat = geometry?.coordinates?.[1]
      const lng = geometry?.coordinates?.[0]

      if (lat == null || lng == null) {
        return null
      }

      return {
        id: event.id ?? `nasa-${type}-${lat}-${lng}`,
        type,
        title: event.title ?? 'Active event',
        severity: 'medium',
        lat,
        lng,
        radius: 150,
        source: 'nasa',
        timestamp: geometry?.date
          ? new Date(geometry.date).toISOString()
          : new Date().toISOString(),
        url:
          event.sources?.[0]?.url ??
          event.link ??
          'https://eonet.gsfc.nasa.gov',
      } satisfies DisasterEvent
    })
    .filter(Boolean) as DisasterEvent[]
}

const fetchGdacs = async (): Promise<DisasterEvent[]> => {
  const response = await fetch('https://www.gdacs.org/xml/rss.xml')

  if (!response.ok) {
    throw new Error('GDACS request failed')
  }

  const xmlText = await response.text()
  if (typeof DOMParser === 'undefined') {
    return []
  }

  const document = new DOMParser().parseFromString(xmlText, 'application/xml')
  const items = Array.from(document.querySelectorAll('item'))

  return items
    .map((item) => {
      const alertLevel = item.querySelector('gdacs\\:alertlevel')?.textContent
      const eventType = item.querySelector('gdacs\\:eventtype')?.textContent
      const type = toTypeFromGdacs(eventType)
      if (!type) {
        return null
      }

      const latText = item.querySelector('geo\\:lat')?.textContent
      const lngText = item.querySelector('geo\\:long')?.textContent
      const lat = latText ? Number(latText) : null
      const lng = lngText ? Number(lngText) : null

      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null
      }

      const title = item.querySelector('title')?.textContent ?? 'GDACS event'
      const link = item.querySelector('link')?.textContent ?? 'https://www.gdacs.org'
      const pubDate = item.querySelector('pubDate')?.textContent

      return {
        id: item.querySelector('guid')?.textContent ?? `gdacs-${type}-${lat}-${lng}`,
        type,
        title,
        severity: toSeverityFromAlertLevel(alertLevel),
        lat,
        lng,
        radius: 200,
        source: 'gdacs',
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: link,
      } satisfies DisasterEvent
    })
    .filter(Boolean) as DisasterEvent[]
}

const loadDisasters = async (): Promise<DisasterEvent[]> => {
  const [usgsResult, nasaResult, gdacsResult] = await Promise.allSettled([
    fetchUsgs(),
    fetchNasa(),
    fetchGdacs(),
  ])

  const events = [usgsResult, nasaResult, gdacsResult]
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  return dedupeEvents(events)
}

export const getActiveDisasters = async (): Promise<DisasterEvent[]> => {
  if (disasterOverride) {
    return disasterOverride
  }

  const cached = readCache()
  if (cached) {
    return cached
  }

  const events = await loadDisasters()
  writeCache(events)
  return events
}

export const getDisastersNear = async (
  lat: number,
  lng: number,
  km: number,
): Promise<DisasterEvent[]> => {
  if (disasterOverride) {
    return disasterOverride.filter(
      (event) =>
        haversineDistanceKm(lat, lng, event.lat, event.lng) <= km,
    )
  }

  const events = await getActiveDisasters()
  return events.filter(
    (event) =>
      haversineDistanceKm(lat, lng, event.lat, event.lng) <= km,
  )
}
