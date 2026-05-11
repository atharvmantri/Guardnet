import type { CommunityReport, DisasterEvent, GuardianProfile, WeatherData } from '../types'
import { setCommunityReportsOverride } from '../services/firebase'
import { setDisasterOverride } from '../services/disasterService'
import { setWeatherOverride } from '../services/weatherService'

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60000).toISOString()

export const DEMO_DATA = {
  communityReports: [
    {
      id: 'demo-report-1',
      userId: 'demo-user-1',
      type: 'flooding',
      description: 'Street-level flooding near Dharavi market lanes.',
      lat: 19.0445,
      lng: 72.8551,
      timestamp: minutesAgo(12),
      upvotes: 14,
      geohash: 'te7g2n',
    },
    {
      id: 'demo-report-2',
      userId: 'demo-user-2',
      type: 'powercut',
      description: 'Kurla East experiencing rolling outages.',
      lat: 19.0723,
      lng: 72.8796,
      timestamp: minutesAgo(28),
      upvotes: 9,
      geohash: 'te7g5q',
    },
    {
      id: 'demo-report-3',
      userId: 'demo-user-3',
      type: 'roadblocked',
      description: 'Bandra Linking Road partially blocked by debris.',
      lat: 19.0607,
      lng: 72.8364,
      timestamp: minutesAgo(42),
      upvotes: 6,
      geohash: 'te7g1v',
    },
    {
      id: 'demo-report-4',
      userId: 'demo-user-4',
      type: 'wind',
      description: 'Strong crosswinds reported near Worli Sea Face.',
      lat: 19.0062,
      lng: 72.8151,
      timestamp: minutesAgo(55),
      upvotes: 11,
      geohash: 'te7fzs',
    },
    {
      id: 'demo-report-5',
      userId: 'demo-user-5',
      type: 'flooding',
      description: 'Low-lying pockets in Dharavi still waterlogged.',
      lat: 19.0401,
      lng: 72.8522,
      timestamp: minutesAgo(67),
      upvotes: 8,
      geohash: 'te7g2m',
    },
    {
      id: 'demo-report-6',
      userId: 'demo-user-6',
      type: 'powercut',
      description: 'Kurla West transformers down after heavy rain.',
      lat: 19.0737,
      lng: 72.8719,
      timestamp: minutesAgo(82),
      upvotes: 5,
      geohash: 'te7g5m',
    },
  ] satisfies CommunityReport[],
  guardianProfiles: [
    {
      id: 'demo-guardian-1',
      userId: 'guardian-demo-1',
      name: 'Aarav Desai',
      address: 'Worli Sea Face, Mumbai',
      lat: 19.0065,
      lng: 72.8145,
      phone: '+91 90000 00001',
      vulnerabilities: ['elderly'],
      emergencyContact: '+91 90000 00101',
      geohash: 'te7fzr',
    },
    {
      id: 'demo-guardian-2',
      userId: 'guardian-demo-2',
      name: 'Meera Khan',
      address: 'Colaba Causeway, Mumbai',
      lat: 18.9221,
      lng: 72.8322,
      phone: '+91 90000 00002',
      vulnerabilities: ['infant'],
      emergencyContact: '+91 90000 00102',
      geohash: 'te7fwh',
    },
  ] satisfies GuardianProfile[],
  disasters: [
    {
      id: 'demo-flood-1',
      type: 'flood',
      title: 'Mumbai coastal flooding',
      severity: 'high',
      lat: 18.921,
      lng: 72.833,
      radius: 8,
      source: 'gdacs',
      timestamp: minutesAgo(20),
      url: 'https://www.gdacs.org',
    },
  ] satisfies DisasterEvent[],
  weather: {
    temp: 34,
    feelsLike: 38,
    humidity: 78,
    windSpeed: 55,
    precipitation: 38,
    condition: 'Heavy rain and wind',
    lat: 19.076,
    lng: 72.8777,
    timestamp: minutesAgo(6),
    source: 'demo',
  } satisfies WeatherData,
}

export const activateDemoMode = () => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('guardnet_demo', 'true')
  }

  setWeatherOverride(async () => DEMO_DATA.weather)
  setDisasterOverride(DEMO_DATA.disasters)
  setCommunityReportsOverride(DEMO_DATA.communityReports)
}
