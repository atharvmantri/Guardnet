import type { DisasterEvent, RiskScore, WeatherData } from '../types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'openrouter/owl-alpha'
const MAX_TOKENS = 120
const CACHE_TTL_MS = 20 * 60 * 1000
const USE_AI = false // OpenRouter API unreliable, using local fallback

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
  let location = locationName.trim()
  if (!location || location === 'Locating..') {
    location = 'your area'
  }
  const reason = riskScore.factors[0] || 'current conditions'

  if (riskScore.level === 'low') {
    return `Safety risk is currently low in ${location} (${riskScore.score}/100). No immediate hazards detected; stay weather-aware.`
  }

  return `Risk level is ${riskScore.level} in ${location} (${riskScore.score}/100) due to ${reason}. It is advised to stay indoors and keep emergency alerts active.`
}

let lastRequestTime = 0
const GLOBAL_COOLDOWN_MS = 20000 // 20s minimum between any AI calls

export const generateRiskBriefing = async (
  riskScore: RiskScore,
  weatherData: WeatherData,
  nearbyDisasters: DisasterEvent[],
  locationName: string,
): Promise<string> => {
  // 1. Connectivity check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return buildFallbackBriefing(riskScore, locationName)
  }

  // 2. Cache check
  const cacheKey = toCacheKey(locationName, riskScore.level)
  const cached = briefingCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.text
  }

  // 3. Cooldown check
  const now = Date.now()
  if (now - lastRequestTime < GLOBAL_COOLDOWN_MS) {
    return cached?.text || buildFallbackBriefing(riskScore, locationName)
  }

  const apiKey = import.meta.env.VITE_OPENROUTER_KEY
  const fallback = buildFallbackBriefing(riskScore, locationName)

  if (!USE_AI || !apiKey || apiKey === 'YOUR_OPENROUTER_KEY') {
    return fallback
  }

  lastRequestTime = now
  const message = buildUserMessage(
    riskScore,
    weatherData,
    nearbyDisasters,
    locationName,
  )

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://guardnet.app',
        'X-Title': 'GuardNet',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      }),
    })

    if (response.status === 429) {
      return fallback
    }

    if (!response.ok) {
      throw new Error('OpenRouter request failed')
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) {
      return fallback
    }

    briefingCache.set(cacheKey, { text, ts: Date.now() })
    return text
  } catch {
    return fallback
  }
}
