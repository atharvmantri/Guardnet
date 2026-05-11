// @ts-ignore: No types for this import
import { lineString, point } from '@turf/helpers';
// @ts-ignore: No types for this import
import pointToLineDistance from '@turf/point-to-line-distance';
import type { Route } from '../types'
import { getCommunityReports } from './firebase'

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'
const OVERPASS_URL = '/api/overpass/api/interpreter'
const DESTINATION_DISTANCE_KM = 15
const REPORT_PENALTY = 20
const REPORT_DISTANCE_KM = 0.3
const FACILITY_DISTANCE_KM = 5

type OrsResponse = {
  features?: Array<{
    geometry?: {
      type?: 'LineString'
      coordinates?: Array<[number, number]>
    }
    properties?: {
      summary?: {
        distance?: number
        duration?: number
      }
    }
  }>
}

type OverpassElement = {
  type?: 'node' | 'way'
  lat?: number
  lon?: number
  center?: {
    lat?: number
    lon?: number
  }
  tags?: {
    name?: string
    amenity?: string
    emergency?: string
  }
}

type OverpassResponse = {
  elements?: OverpassElement[]
}

type Facility = {
  name: string
  lat: number
  lng: number
}

type RouteCandidate = {
  geometry: Route['geometry']
  durationSec: number
  distanceKm: number
}

const toRadians = (value: number) => (value * Math.PI) / 180
const toDegrees = (value: number) => (value * 180) / Math.PI

const normalizeBearing = (value: number) => {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const bearingBetween = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) => {
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const deltaLng = toRadians(toLng - fromLng)

  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return normalizeBearing(toDegrees(Math.atan2(y, x)))
}

const destinationPoint = (
  lat: number,
  lng: number,
  bearing: number,
  distanceKm: number,
) => {
  const angularDistance = distanceKm / 6371
  const bearingRad = toRadians(bearing)
  const latRad = toRadians(lat)
  const lngRad = toRadians(lng)

  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  )

  const destLng =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat),
    )

  const destLngDeg = toDegrees(destLng)
  const normalizedLng = ((destLngDeg + 540) % 360) - 180

  return {
    lat: toDegrees(destLat),
    lng: normalizedLng,
  }
}

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

const buildCandidateDestinations = (
  userLat: number,
  userLng: number,
  disasterLat: number,
  disasterLng: number,
) => {
  const awayBearing = bearingBetween(
    disasterLat,
    disasterLng,
    userLat,
    userLng,
  )

  const offsets = [-90, -45, 0, 45, 90]
  const candidates = offsets.map((offset) => {
    const targetBearing = normalizeBearing(awayBearing + offset)
    const point = destinationPoint(
      userLat,
      userLng,
      targetBearing,
      DESTINATION_DISTANCE_KM,
    )

    return {
      ...point,
      distanceFromDisaster: haversineDistanceKm(
        disasterLat,
        disasterLng,
        point.lat,
        point.lng,
      ),
    }
  })

  // Keep the farthest three points while still sampling +/- 90 and +/- 45 degrees.
  return candidates
    .sort((a, b) => b.distanceFromDisaster - a.distanceFromDisaster)
    .slice(0, 3)
}

const fetchRoute = async (
  userLat: number,
  userLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
): Promise<RouteCandidate> => {
  const response = await fetch(ORS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      coordinates: [
        [userLng, userLat],
        [destLng, destLat],
      ],
    }),
  })

  if (!response.ok) {
    throw new Error('OpenRouteService request failed')
  }

  const data = (await response.json()) as OrsResponse
  const feature = data.features?.[0]
  const coords = feature?.geometry?.coordinates
  const summary = feature?.properties?.summary

  if (!coords || coords.length < 2 || !summary) {
    throw new Error('OpenRouteService response incomplete')
  }

  return {
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    durationSec: summary.duration ?? 0,
    distanceKm: summary.distance ? summary.distance / 1000 : 0,
  }
}

const getRouteSearchArea = (coordinates: Array<[number, number]>) => {
  const count = coordinates.length
  if (!count) {
    return { centerLat: 0, centerLng: 0, radiusKm: 0 }
  }

  const sums = coordinates.reduce(
    (acc, [lng, lat]) => ({
      lat: acc.lat + lat,
      lng: acc.lng + lng,
    }),
    { lat: 0, lng: 0 },
  )

  const centerLat = sums.lat / count
  const centerLng = sums.lng / count

  let maxDistance = 0
  coordinates.forEach(([lng, lat]) => {
    const distance = haversineDistanceKm(centerLat, centerLng, lat, lng)
    if (distance > maxDistance) {
      maxDistance = distance
    }
  })

  return {
    centerLat,
    centerLng,
    radiusKm: maxDistance + REPORT_DISTANCE_KM,
  }
}

const scoreRoute = async (
  coordinates: Array<[number, number]>,
): Promise<number> => {
  if (coordinates.length < 2) {
    return 0
  }

  const { centerLat, centerLng, radiusKm } = getRouteSearchArea(coordinates)
  const reports = await getCommunityReports(centerLat, centerLng, radiusKm)
  const line = lineString(coordinates)

  const hazards = reports.filter(
    (report) => report.type === 'roadblocked' || report.type === 'flooding',
  )

  const impactedCount = hazards.reduce((count, report) => {
    const distanceKm = pointToLineDistance(
      point([report.lng, report.lat]),
      line,
      { units: 'kilometers' },
    )

    return distanceKm <= REPORT_DISTANCE_KM ? count + 1 : count
  }, 0)

  return Math.max(0, 100 - impactedCount * REPORT_PENALTY)
}

const normalizeFacilityName = (element: OverpassElement) => {
  if (element.tags?.name) {
    return element.tags.name
  }

  if (element.tags?.amenity === 'hospital') {
    return 'Hospital'
  }

  if (element.tags?.emergency === 'yes') {
    return 'Emergency shelter'
  }

  return 'Emergency facility'
}

const expandBoundingBox = (
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
  paddingKm: number,
) => {
  const meanLat = (minLat + maxLat) / 2
  const latPadding = paddingKm / 110.574
  const lngPadding =
    paddingKm / (111.32 * Math.cos(toRadians(Math.max(-89, Math.min(89, meanLat)))))

  return {
    south: minLat - latPadding,
    west: minLng - lngPadding,
    north: maxLat + latPadding,
    east: maxLng + lngPadding,
  }
}

const fetchFacilities = async (
  coordinates: Array<[number, number]>,
): Promise<Facility[]> => {
  if (coordinates.length < 2) {
    return []
  }

  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity

  coordinates.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat)
    minLng = Math.min(minLng, lng)
    maxLat = Math.max(maxLat, lat)
    maxLng = Math.max(maxLng, lng)
  })

  const bbox = expandBoundingBox(
    minLat,
    minLng,
    maxLat,
    maxLng,
    FACILITY_DISTANCE_KM,
  )

  const query = [
    '[out:json];',
    '(',
    `node[amenity=hospital](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
    `way[amenity=hospital](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
    `node[emergency=yes](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
    `way[emergency=yes](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
    ');',
    'out center;',
  ].join('\n')

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    throw new Error('Overpass request failed')
  }

  const data = (await response.json()) as OverpassResponse

  return (data.elements ?? [])
    .map((element): Facility | null => {
      const lat = element.lat ?? element.center?.lat
      const lng = element.lon ?? element.center?.lon
      if (lat == null || lng == null) {
        return null
      }
      return {
        name: normalizeFacilityName(element),
        lat: Number(lat),
        lng: Number(lng),
      }
    })
    .filter((f): f is Facility => f !== null)
}

const findNearestHospital = async (
  coordinates: Array<[number, number]>,
): Promise<Route['nearestHospital']> => {
  try {
    const facilities: Facility[] = await fetchFacilities(coordinates)
    if (!facilities.length) {
      return null
    }

    const line = lineString(coordinates)
    let nearest: Facility | null = null
    let nearestDistance = Infinity

    facilities.forEach((facility: Facility) => {
      const distanceKm = pointToLineDistance(
        point([facility.lng, facility.lat]),
        line,
        { units: 'kilometers' },
      )

      if (distanceKm <= FACILITY_DISTANCE_KM && distanceKm < nearestDistance) {
        nearest = facility
        nearestDistance = distanceKm
      }
    })

    if (nearest) {
      const facility = nearest as Facility;
      return {
        name: facility.name,
        lat: facility.lat,
        lng: facility.lng,
      }
    }
    return null
  } catch {
    return null
  }
}

export const getEvacuationRoutes = async (
  userLat: number,
  userLng: number,
  disasterLat: number,
  disasterLng: number,
): Promise<Route[]> => {
  const apiKey = import.meta.env.VITE_ORS_KEY
  if (!apiKey) {
    return []
  }

  const candidates = buildCandidateDestinations(
    userLat,
    userLng,
    disasterLat,
    disasterLng,
  )

  const routeResults = await Promise.allSettled(
    candidates.map((candidate) =>
      fetchRoute(userLat, userLng, candidate.lat, candidate.lng, apiKey),
    ),
  )

  const routes = routeResults
    .filter((result): result is PromiseFulfilledResult<RouteCandidate> =>
      result.status === 'fulfilled',
    )
    .map((result) => result.value)

  const enriched = await Promise.all(
    routes.map(async (route) => {
      const [riskScore, nearestHospital] = await Promise.all([
        scoreRoute(route.geometry.coordinates),
        findNearestHospital(route.geometry.coordinates),
      ])

      return {
        geometry: route.geometry,
        durationSec: route.durationSec,
        distanceKm: route.distanceKm,
        riskScore,
        nearestHospital,
      }
    }),
  )

  return enriched
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 2)
}
