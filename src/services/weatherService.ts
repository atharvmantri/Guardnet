import type { WeatherData } from '../types'

const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_PREFIX = 'weather:'
const CACHE_PRECISION = 3

type OpenMeteoResponse = {
  latitude?: number
  longitude?: number
  current?: {
    temperature_2m?: number
    wind_speed_10m?: number
    precipitation?: number
    weather_code?: number
  }
  hourly?: {
    precipitation_probability?: number[]
  }
}

type OpenWeatherResponse = {
  coord?: {
    lat?: number
    lon?: number
  }
  main?: {
    feels_like?: number
    humidity?: number
    temp?: number
  }
  wind?: {
    speed?: number
  }
  rain?: {
    '1h'?: number
    '3h'?: number
  }
  weather?: Array<{
    description?: string
  }>
}

type CacheEntry = {
  expiresAt: number
  data: WeatherData
}

const roundCoord = (value: number) =>
  Number(value.toFixed(CACHE_PRECISION))

const getCacheKey = (lat: number, lng: number) => {
  const roundedLat = roundCoord(lat)
  const roundedLng = roundCoord(lng)
  return `${CACHE_PREFIX}${roundedLat},${roundedLng}`
}

const readCache = (key: string): WeatherData | null => {
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

const writeCache = (key: string, data: WeatherData) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  const entry: CacheEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  }

  localStorage.setItem(key, JSON.stringify(entry))
}

const fetchOpenMeteo = async (lat: number, lng: number) => {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,wind_speed_10m,precipitation,weather_code',
    hourly: 'precipitation_probability',
  })

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('Open-Meteo request failed')
  }

  return (await response.json()) as OpenMeteoResponse
}

const fetchOpenWeather = async (lat: number, lng: number) => {
  const apiKey = import.meta.env.VITE_OPENWEATHER_KEY
  if (!apiKey) {
    throw new Error('Missing VITE_OPENWEATHER_KEY')
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    appid: apiKey,
    units: 'metric',
  })

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('OpenWeatherMap request failed')
  }

  return (await response.json()) as OpenWeatherResponse
}

export const mergeWeatherData = (
  owm: OpenWeatherResponse | null,
  meteo: OpenMeteoResponse | null,
): WeatherData => {
  const temp = meteo?.current?.temperature_2m ?? owm?.main?.temp ?? 0
  const windSpeed = meteo?.current?.wind_speed_10m ?? owm?.wind?.speed ?? 0
  const precipitation =
    meteo?.current?.precipitation ??
    meteo?.hourly?.precipitation_probability?.[0] ??
    owm?.rain?.['1h'] ??
    owm?.rain?.['3h'] ??
    0
  const humidity = owm?.main?.humidity ?? 0
  const feelsLike = owm?.main?.feels_like ?? temp
  const condition = owm?.weather?.[0]?.description ?? 'Unknown'
  const lat = meteo?.latitude ?? owm?.coord?.lat ?? 0
  const lng = meteo?.longitude ?? owm?.coord?.lon ?? 0

  const sources = [
    meteo ? 'open-meteo' : null,
    owm ? 'openweather' : null,
  ].filter(Boolean)

  return {
    temp,
    feelsLike,
    humidity,
    windSpeed,
    precipitation,
    condition,
    lat,
    lng,
    timestamp: new Date().toISOString(),
    source: sources.join('+') || 'unknown',
  }
}

export const getWeather = async (
  lat: number,
  lng: number,
): Promise<WeatherData> => {
  const cacheKey = getCacheKey(lat, lng)
  const cached = readCache(cacheKey)
  if (cached) {
    return cached
  }

  const [meteoResult, owmResult] = await Promise.allSettled([
    fetchOpenMeteo(lat, lng),
    fetchOpenWeather(lat, lng),
  ])

  const meteo = meteoResult.status === 'fulfilled' ? meteoResult.value : null
  const owm = owmResult.status === 'fulfilled' ? owmResult.value : null

  if (!meteo && !owm) {
    throw new Error('Weather sources unavailable')
  }

  const merged = mergeWeatherData(owm, meteo)
  writeCache(cacheKey, merged)
  return merged
}
