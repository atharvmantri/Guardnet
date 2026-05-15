import type { CommunityReport, DisasterEvent, RiskScore, WeatherData } from '../types'
import { getDisastersNear } from './disasterService'
import { getCommunityReports } from './firebase'
import { getWeather } from './weatherService'

const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_PREFIX = 'risk:'
const CACHE_PRECISION = 2

type CacheEntry = {
  expiresAt: number
  data: RiskScore
}

type FactorEntry = {
  points: number
  label: string
}

type ElevationResponse = {
  elevation?: number[]
}

const roundCoord = (value: number) =>
  Number(value.toFixed(CACHE_PRECISION))

const getCacheKey = (lat: number, lng: number) => {
  const roundedLat = roundCoord(lat)
  const roundedLng = roundCoord(lng)
  return `${CACHE_PREFIX}${roundedLat},${roundedLng}`
}

const readCache = (key: string): RiskScore | null => {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key)
      return null
    }

    return entry.data
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

const writeCache = (key: string, data: RiskScore) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  const entry: CacheEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  }

  localStorage.setItem(key, JSON.stringify(entry))
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const toLevel = (score: number): RiskScore['level'] => {
  if (score >= 75) {
    return 'critical'
  }
  if (score >= 50) {
    return 'high'
  }
  if (score >= 25) {
    return 'medium'
  }
  return 'low'
}

const fetchElevation = async (lat: number, lng: number): Promise<number> => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error('Elevation request failed')
    }

    const data = (await response.json()) as ElevationResponse
    const elevation = data.elevation?.[0]
    if (typeof elevation !== 'number' || Number.isNaN(elevation)) {
      throw new Error('Elevation data unavailable')
    }

    return elevation
  } catch {
    return 0
  }
}

const scoreWeather = (weather: WeatherData) => {
  let score = 0
  const factors: FactorEntry[] = []

  if (weather.windSpeed > 100) {
    score += 25
    factors.push({
      points: 25,
      label: 'Wind speed over 100 km/h (+25)',
    })
  } else if (weather.windSpeed > 60) {
    score += 15
    factors.push({
      points: 15,
      label: 'Wind speed over 60 km/h (+15)',
    })
  }

  if (weather.precipitation > 50) {
    score += 25
    factors.push({
      points: 25,
      label: 'Precipitation over 50 mm/hr (+25)',
    })
  } else if (weather.precipitation > 20) {
    score += 15
    factors.push({
      points: 15,
      label: 'Precipitation over 20 mm/hr (+15)',
    })
  }

  if (weather.temp > 42) {
    score += 10
    factors.push({
      points: 10,
      label: 'Temperature over 42 C (+10)',
    })
  }

  return {
    score: Math.min(score, 35),
    factors,
  }
}

const scoreDisasters = (events: DisasterEvent[], lat: number, lng: number) => {
  let score = 0
  const factors: FactorEntry[] = []

  events.forEach((event) => {
    const distanceKm = haversineDistanceKm(lat, lng, event.lat, event.lng)

    if (event.severity === 'critical' && distanceKm <= 10) {
      score += 35
      factors.push({
        points: 35,
        label: `Critical disaster within 10 km: ${event.title} (+35)`,
      })
      return
    }

    if (event.severity === 'high' && distanceKm <= 25) {
      score += 20
      factors.push({
        points: 20,
        label: `High disaster within 25 km: ${event.title} (+20)`,
      })
      return
    }

    if (event.severity === 'medium' && distanceKm <= 50) {
      score += 10
      factors.push({
        points: 10,
        label: `Medium disaster within 50 km: ${event.title} (+10)`,
      })
    }
  })

  return {
    score: Math.min(score, 35),
    factors,
  }
}

const scoreTerrain = (elevation: number) => {
  if (elevation < 5) {
    return {
      score: 15,
      factors: [{ points: 15, label: 'Elevation below 5 m (+15)' }],
    }
  }

  if (elevation < 20) {
    return {
      score: 8,
      factors: [{ points: 8, label: 'Elevation below 20 m (+8)' }],
    }
  }

  return { score: 0, factors: [] as FactorEntry[] }
}

const scoreCommunityReports = (reports: CommunityReport[]) => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  const relevant = reports.filter((report) => {
    if (report.type !== 'flooding' && report.type !== 'powercut') {
      return false
    }

    const timestamp = Date.parse(report.timestamp)
    return Number.isFinite(timestamp) && timestamp >= cutoff
  })

  if (relevant.length >= 3) {
    return {
      score: 15,
      factors: [
        {
          points: 15,
          label: `Community reports (3+ in 2 hrs) (+15)`,
        },
      ],
    }
  }

  if (relevant.length >= 1) {
    return {
      score: 7,
      factors: [
        {
          points: 7,
          label: `Community reports (1-2 in 2 hrs) (+7)`,
        },
      ],
    }
  }

  return { score: 0, factors: [] as FactorEntry[] }
}

const buildTopFactors = (entries: FactorEntry[], limit = 3) => {
  if (!entries.length) {
    return ['No significant risk signals detected']
  }

  const ranked = entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points
      }
      return a.index - b.index
    })

  return ranked.slice(0, limit).map((entry) => entry.label)
}

export const calculateRisk = async (
  lat: number,
  lng: number,
): Promise<RiskScore> => {
  const cacheKey = getCacheKey(lat, lng)
  const cached = readCache(cacheKey)
  if (cached) {
    return cached
  }

  const [weatherResult, disastersResult, elevationResult, reportsResult] =
    await Promise.allSettled([
      getWeather(lat, lng),
      getDisastersNear(lat, lng, 50),
      fetchElevation(lat, lng),
      getCommunityReports(lat, lng, 5),
    ])

  let weatherScore = 0
  let disasterScore = 0
  let terrainScore = 0
  let communityScore = 0
  const factorEntries: FactorEntry[] = []

  if (weatherResult.status === 'fulfilled') {
    const weather = scoreWeather(weatherResult.value)
    weatherScore = weather.score
    factorEntries.push(...weather.factors)
  }

  if (disastersResult.status === 'fulfilled') {
    const disasters = scoreDisasters(disastersResult.value, lat, lng)
    disasterScore = disasters.score
    factorEntries.push(...disasters.factors)
  }

  if (elevationResult.status === 'fulfilled') {
    const terrain = scoreTerrain(elevationResult.value)
    terrainScore = terrain.score
    factorEntries.push(...terrain.factors)
  }

  if (reportsResult.status === 'fulfilled') {
    const community = scoreCommunityReports(reportsResult.value)
    communityScore = community.score
    factorEntries.push(...community.factors)
  }

  const rawScore = weatherScore + disasterScore + terrainScore + communityScore
  const score = clamp(rawScore, 0, 100)
  const level = toLevel(score)
  const hasEntries = factorEntries.length > 0
  const factors = buildTopFactors(factorEntries)
  const aiSummary = hasEntries
    ? `Risk level ${level} (${score}/100). Top signals: ${factors.join('; ')}.`
    : `Risk level ${level} (${score}/100). No significant signals detected.`

  const result: RiskScore = {
    score,
    level,
    factors,
    aiSummary,
    lastUpdated: new Date().toISOString(),
  }

  writeCache(cacheKey, result)
  return result
}
