export interface WeatherData {
  temp: number
  feelsLike: number
  humidity: number
  windSpeed: number
  precipitation: number
  condition: string
  lat: number
  lng: number
  timestamp: string
  source: string
}

export interface RiskScore {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  factors: string[]
  aiSummary: string
  lastUpdated: string
}

export interface DisasterEvent {
  id: string
  type: 'flood' | 'earthquake' | 'cyclone' | 'fire' | 'heatwave'
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  lat: number
  lng: number
  radius: number
  source: 'usgs' | 'nasa' | 'gdacs'
  timestamp: string
  url: string
}

export interface CommunityReport {
  id: string
  userId: string
  type: 'flooding' | 'powercut' | 'roadblocked' | 'wind' | 'fire'
  description: string
  lat: number
  lng: number
  timestamp: string
  upvotes: number
  geohash: string
}

export interface GuardianProfile {
  id: string
  userId: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  vulnerabilities: string[]
  emergencyContact: string
  geohash: string
}

export interface VolunteerAssignment {
  id: string
  volunteerId: string
  guardianId: string
  disasterEventId: string
  status: 'pending' | 'accepted' | 'checkedin' | 'complete'
  assignedAt: string
  completedAt: string | null
}
