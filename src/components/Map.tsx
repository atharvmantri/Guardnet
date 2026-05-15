import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { LatLngExpression, Map as LeafletMap } from 'leaflet'
import { DivIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CommunityReport, DisasterEvent, RiskScore, Route } from '../types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const GRID_SIZE = 3
const GRID_SPACING_KM = 2

export type Facility = {
  name: string
  lat: number
  lng: number
}

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void
}

type RiskLookup = (lat: number, lng: number) => RiskScore | null

type MapProps = {
  disasters?: DisasterEvent[]
  communityReports?: CommunityReport[]
  routes?: Route[]
  facilities?: Facility[]
  riskCache?: Record<string, RiskScore>
  riskLookup?: RiskLookup
  onMapLongPress?: (lat: number, lng: number) => void
  userLocationOverride?: { lat: number; lng: number } | null
  className?: string
}

type LocationState = {
  lat: number
  lng: number
  accuracy: number
}

const severityStyles: Record<DisasterEvent['severity'], { color: string }> = {
  critical: { color: '#ef4444' },
  high: { color: '#f97316' },
  medium: { color: '#eab308' },
  low: { color: '#22c55e' },
}

const reportColors: Record<CommunityReport['type'], string> = {
  flooding: '#2563eb',
  powercut: '#facc15',
  roadblocked: '#f97316',
  wind: '#38bdf8',
  fire: '#ef4444',
}

const riskColors: Record<RiskScore['level'], string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const typeIcons: Record<DisasterEvent['type'], string> = {
  flood: 'F',
  earthquake: 'E',
  cyclone: 'C',
  fire: 'R',
  heatwave: 'H',
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

const roundCoord = (value: number) => Number(value.toFixed(2))

const buildRiskKey = (lat: number, lng: number) =>
  `${roundCoord(lat)},${roundCoord(lng)}`

const getRiskFromCache = (
  lat: number,
  lng: number,
  cache?: Record<string, RiskScore>,
) => {
  if (!cache) {
    return null
  }

  const key = buildRiskKey(lat, lng)
  return cache[key] ?? null
}

const toGridOffset = (lat: number, km: number) => {
  const latOffset = km / 110.574
  const lngOffset = km / (111.32 * Math.cos(toRadians(lat)))
  return { latOffset, lngOffset }
}

const createDisasterIcon = (severity: DisasterEvent['severity'], label: string) =>
  new DivIcon({
    className: 'disaster-icon',
    html: `<div class="disaster-badge" style="background:${severityStyles[severity].color}">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

const createReportIcon = (color: string) =>
  new DivIcon({
    className: 'report-icon',
    html: `<div class="report-pin" style="background:${color}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  })

const createFacilityIcon = () =>
  new DivIcon({
    className: 'facility-icon',
    html: `<div class="facility-cross">+</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

const MapLongPressHandler = ({
  onLongPress,
}: {
  onLongPress?: (lat: number, lng: number) => void
}) => {
  const timerRef = useRef<number | null>(null)
  const targetRef = useRef<{ lat: number; lng: number } | null>(null)

  useMapEvents({
    mousedown: (event) => {
      if (!onLongPress) {
        return
      }
      targetRef.current = {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      }
      timerRef.current = window.setTimeout(() => {
        if (!targetRef.current) {
          return
        }
        onLongPress(targetRef.current.lat, targetRef.current.lng)
        targetRef.current = null
        timerRef.current = null
      }, 500)
    },
    mouseup: () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      targetRef.current = null
    },
  })

  return null
}

const fetchFacilities = async (lat: number, lng: number) => {
  const latPadding = 0.06
  const lngPadding = 0.06 / Math.cos(toRadians(Math.max(-89, Math.min(89, lat))))

  const query = [
    '[out:json][timeout:10];',
    '(',
    `node[amenity=hospital](${lat - latPadding},${
      lng - lngPadding
    },${lat + latPadding},${lng + lngPadding});`,
    `node[amenity=shelter](${lat - latPadding},${
      lng - lngPadding
    },${lat + latPadding},${lng + lngPadding});`,
    ');',
    'out center 20;',
  ].join('\n')

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!response.ok) {
    throw new Error('Failed to fetch facilities')
  }

  const data = (await response.json()) as {
    elements?: Array<{
      lat?: number
      lon?: number
      center?: { lat?: number; lon?: number }
      tags?: { name?: string; amenity?: string; emergency?: string }
    }>
  }

  return (data.elements ?? [])
    .map((element) => {
      const facilityLat = element.lat ?? element.center?.lat
      const facilityLng = element.lon ?? element.center?.lon
      if (facilityLat == null || facilityLng == null) {
        return null
      }

      const name =
        element.tags?.name ??
        (element.tags?.amenity === 'hospital'
          ? 'Hospital'
          : element.tags?.emergency === 'yes'
            ? 'Emergency shelter'
            : 'Emergency facility')

      return {
        name,
        lat: facilityLat,
        lng: facilityLng,
      }
    })
    .filter(Boolean) as Facility[]
}

const MapController = ({ center }: { center: LatLngExpression }) => {
  const map = useMap()
  useEffect(() => {
    map.setView(center)
  }, [center, map])
  return null
}

const Map = forwardRef<MapHandle, MapProps>(
  (
    {
      disasters = [],
      communityReports = [],
      routes = [],
      facilities,
      riskCache,
      riskLookup,
      onMapLongPress,
      userLocationOverride,
      className,
    },
    ref,
  ) => {
    const [userLocation, setUserLocation] = useState<LocationState | null>(null)
    const [facilityMarkers, setFacilityMarkers] = useState<Facility[]>([])
    const mapRef = useRef<LeafletMap | null>(null)
    const hasCenteredRef = useRef(false)

    const resolvedLocation = useMemo<LocationState | null>(() => {
      if (userLocationOverride) {
        return {
          lat: userLocationOverride.lat,
          lng: userLocationOverride.lng,
          accuracy: 0,
        }
      }
      return userLocation
    }, [userLocation, userLocationOverride])

    useImperativeHandle(ref, () => ({
      flyTo: (lat, lng, zoom = 14) => {
        mapRef.current?.flyTo([lat, lng], zoom)
      },
    }))

    useEffect(() => {
      if (userLocationOverride || !navigator.geolocation) {
        return
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
      )

      return () => navigator.geolocation.clearWatch(watchId)
    }, [userLocationOverride])

    useEffect(() => {
      if (!resolvedLocation || !mapRef.current || hasCenteredRef.current) {
        return
      }

      mapRef.current.flyTo([resolvedLocation.lat, resolvedLocation.lng], 13)
      hasCenteredRef.current = true
    }, [resolvedLocation])

    useEffect(() => {
      hasCenteredRef.current = false
    }, [userLocationOverride?.lat, userLocationOverride?.lng])

    const lastFacilityFetchCoords = useRef<{ lat: number; lng: number } | null>(null)

    useEffect(() => {
      if (!resolvedLocation || facilities) {
        return
      }

      const last = lastFacilityFetchCoords.current
      if (
        last &&
        haversineDistanceKm(
          last.lat,
          last.lng,
          resolvedLocation.lat,
          resolvedLocation.lng
        ) < 1
      ) {
        return
      }

      let active = true
      lastFacilityFetchCoords.current = { lat: resolvedLocation.lat, lng: resolvedLocation.lng }

      fetchFacilities(resolvedLocation.lat, resolvedLocation.lng)
        .then((data) => {
          if (active && data.length > 0) {
            setFacilityMarkers(data)
          }
        })
        .catch(() => {
          // Keep existing markers on error
        })

      return () => {
        active = false
      }
    }, [facilities, resolvedLocation])

    const facilityList = facilities ?? facilityMarkers

    const riskGrid = useMemo(() => {
      if (!resolvedLocation) {
        return [] as Array<{ lat: number; lng: number; level: RiskScore['level'] }>
      }

      const grid: Array<{ lat: number; lng: number; level: RiskScore['level'] }> = []
      const half = Math.floor(GRID_SIZE / 2)
      const { latOffset, lngOffset } = toGridOffset(
        resolvedLocation.lat,
        GRID_SPACING_KM,
      )

      for (let row = -half; row <= half; row += 1) {
        for (let col = -half; col <= half; col += 1) {
          const lat = resolvedLocation.lat + row * latOffset
          const lng = resolvedLocation.lng + col * lngOffset
          const lookup = riskLookup?.(lat, lng) ?? getRiskFromCache(lat, lng, riskCache)

          if (!lookup) {
            continue
          }

          grid.push({ lat, lng, level: lookup.level })
        }
      }

      return grid
    }, [riskCache, riskLookup, resolvedLocation])

    const baseCenter: LatLngExpression = resolvedLocation
      ? [resolvedLocation.lat, resolvedLocation.lng]
      : [0, 0]

    return (
      <div className={`relative h-full w-full ${className ?? ''}`}>
        <MapContainer
          center={baseCenter}
          zoom={12}
          className="h-full w-full"
          ref={(mapInstance) => {
            if (mapInstance) {
              mapRef.current = mapInstance
            }
          }}
        >
          <MapController center={baseCenter} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapLongPressHandler onLongPress={onMapLongPress} />

          {resolvedLocation ? (
            <>
              <Circle
                center={[resolvedLocation.lat, resolvedLocation.lng]}
                radius={resolvedLocation.accuracy}
                pathOptions={{
                  color: '#60a5fa',
                  weight: 1,
                  fillColor: '#60a5fa',
                  fillOpacity: 0.15,
                }}
              />
              <CircleMarker
                center={[resolvedLocation.lat, resolvedLocation.lng]}
                radius={8}
                pathOptions={{
                  color: '#2563eb',
                  weight: 2,
                  fillColor: '#3b82f6',
                  fillOpacity: 1,
                  className: 'user-pulse',
                }}
              >
                <Popup>Your current location</Popup>
              </CircleMarker>
            </>
          ) : null}

          {riskGrid.map((point) => (
            <CircleMarker
              key={`risk-${point.lat}-${point.lng}`}
              center={[point.lat, point.lng]}
              radius={35}
              pathOptions={{
                color: riskColors[point.level],
                fillColor: riskColors[point.level],
                fillOpacity: 0.15,
                weight: 1,
              }}
            />
          ))}

          {disasters.map((event) => {
            const icon = createDisasterIcon(
              event.severity,
              typeIcons[event.type] ?? 'D',
            )
            const distance = resolvedLocation
              ? haversineDistanceKm(
                  resolvedLocation.lat,
                  resolvedLocation.lng,
                  event.lat,
                  event.lng,
                )
              : null

            return (
              <Marker
                key={event.id}
                position={[event.lat, event.lng]}
                icon={icon}
              >
                <Popup>
                  <div className="space-y-1 text-sm">
                    <p className="text-base font-semibold">{event.title}</p>
                    <p>Type: {event.type}</p>
                    <p>Severity: {event.severity}</p>
                    {distance != null ? (
                      <p>Distance: {distance.toFixed(2)} km</p>
                    ) : null}
                    <p>Source: {event.source}</p>
                    <p>{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {communityReports.map((report) => (
            <Marker
              key={report.id}
              position={[report.lat, report.lng]}
              icon={createReportIcon(reportColors[report.type])}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold">{report.type}</p>
                  <p>{report.description}</p>
                  <p>{new Date(report.timestamp).toLocaleString()}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {facilityList.map((facility) => (
            <Marker
              key={`${facility.name}-${facility.lat}-${facility.lng}`}
              position={[facility.lat, facility.lng]}
              icon={createFacilityIcon()}
            >
              <Popup>
                <div className="text-sm">
                  <p className="text-base font-semibold">{facility.name}</p>
                  <p>Hospital/Shelter</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {routes.map((route, index) => (
            <Polyline
              key={`route-${index}`}
              positions={route.geometry.coordinates.map(
                ([lng, lat]) => [lat, lng],
              )}
              pathOptions={{
                color: index === 0 ? '#22c55e' : '#eab308',
                weight: 5,
                opacity: 0.9,
                className: 'route-dash',
              }}
            />
          ))}
        </MapContainer>

        <style>
          {`
            .user-pulse {
              animation: pulse 2.4s ease-out infinite;
            }

            .route-dash {
              stroke-dasharray: 10 14;
              animation: dash 6s linear infinite;
            }

            .disaster-icon {
              background: transparent;
              border: none;
            }

            .disaster-badge {
              width: 30px;
              height: 30px;
              border-radius: 999px;
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 13px;
              box-shadow: 0 6px 12px rgba(15, 23, 42, 0.2);
            }

            .report-icon {
              background: transparent;
              border: none;
            }

            .report-pin {
              width: 14px;
              height: 14px;
              border-radius: 999px;
              border: 2px solid #fff;
              box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
            }

            .facility-icon {
              background: transparent;
              border: none;
            }

            .facility-cross {
              width: 22px;
              height: 22px;
              border-radius: 6px;
              background: #1d4ed8;
              color: #fff;
              font-weight: 700;
              font-size: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 6px 12px rgba(15, 23, 42, 0.2);
            }

            @keyframes dash {
              to {
                stroke-dashoffset: -40;
              }
            }

            @keyframes pulse {
              0% {
                transform: scale(0.9);
                opacity: 1;
              }
              70% {
                transform: scale(1.8);
                opacity: 0;
              }
              100% {
                transform: scale(0.9);
                opacity: 0;
              }
            }
          `}
        </style>
      </div>
    )
  },
)

Map.displayName = 'Map'

export default Map
