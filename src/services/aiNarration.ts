import type { DisasterEvent, RiskScore, WeatherData } from '../types'

const ANTHROPIC_URL = '/api/anthropic/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 120
const CACHE_TTL_MS = 20 * 60 * 1000

const SYSTEM_PROMPT =
  'You are a disaster safety announcer. Give a 2-sentence briefing - urgent but calm, no jargon, specific to the data given. First sentence: what the risk is and why. Second sentence: one concrete action the person should take right now.'

type CacheEntry = {
  text: string
  ts: number
}

const briefingCache = new Map<string, CacheEntry>()

const toCacheKey = (locationName: string, riskLevel: RiskScore['level']) => {
  const normalized = locationName.trim().toLowerCase() || 'unknown'
  return `${normalized}:${riskLevel}`
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

const buildDisasterList = (
  disasters: DisasterEvent[],
  lat: number,
  lng: number,
) => {
  if (!disasters.length) {
    return 'None reported nearby'
  }

  const ranked = disasters
    .map((event) => ({
      event,
      distanceKm: haversineDistanceKm(lat, lng, event.lat, event.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3)
    .map(({ event, distanceKm }) => {
      const rounded = Math.round(distanceKm * 10) / 10
      return `${event.title} (${event.severity}, ${rounded} km)`
    })

  return ranked.join('; ')
}

const buildFactorsList = (factors: string[]) => {
  const trimmed = factors.filter(Boolean).slice(0, 3)
  return trimmed.length ? trimmed.join('; ') : 'No significant risk signals detected'
}

const buildUserMessage = (
  riskScore: RiskScore,
  weatherData: WeatherData,
  nearbyDisasters: DisasterEvent[],
  locationName: string,
) => {
  const location = locationName.trim() || 'Unknown location'
  const disasters = buildDisasterList(
    nearbyDisasters,
    weatherData.lat,
    weatherData.lng,
  )
  const factors = buildFactorsList(riskScore.factors)

  return [
    `Location: ${location}`,
    `Risk: ${riskScore.score}/100 (${riskScore.level})`,
    `Weather: wind ${weatherData.windSpeed} km/h, rain ${weatherData.precipitation} mm/hr, temp ${weatherData.temp} C`,
    `Nearby disasters (up to 3): ${disasters}`,
    `Top risk factors (up to 3): ${factors}`,
  ].join('\n')
}

const buildFallbackBriefing = (
  riskScore: RiskScore,
  locationName: string,
) => {
  const location = locationName.trim() || 'your area'
  const reason = riskScore.factors[0] || 'current conditions'

  return `Risk is ${riskScore.level} in ${location} (${riskScore.score}/100) due to ${reason}. Move to a safer indoor spot and keep a phone and emergency alerts on right now.`
}

export const generateRiskBriefing = async (
  riskScore: RiskScore,
  weatherData: WeatherData,
  nearbyDisasters: DisasterEvent[],
  locationName: string,
): Promise<string> => {
  const cacheKey = toCacheKey(locationName, riskScore.level)
  const cached = briefingCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.text
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY
  const fallback = buildFallbackBriefing(riskScore, locationName)

  if (!apiKey) {
    return fallback
  }

  const message = buildUserMessage(
    riskScore,
    weatherData,
    nearbyDisasters,
    locationName,
  )

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error('Anthropic request failed')
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>
    }

    const text = data.content?.[0]?.text?.trim()
    if (!text) {
      throw new Error('Anthropic response empty')
    }

    briefingCache.set(cacheKey, { text, ts: Date.now() })
    return text
  } catch {
    return fallback
  }
}
