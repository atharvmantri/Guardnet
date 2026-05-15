```
  ____                     _ _   _      _   
 / ___|_   _  __ _ _ __ __| | | | | ___| |_ 
| |  _| | | |/ _` | '__/ _` | |_| |/ _ \ __|
| |_| | |_| | (_| | | | (_| |  _  |  __/ |_ 
 \____|\__,_|\__,_|_|  \__,_|_| |_|\___|\__|
```

Community-powered disaster intelligence, delivered in real time.

![Built With React](https://img.shields.io/badge/Built%20With-React-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black) ![PWA Ready](https://img.shields.io/badge/PWA-ready-2D7FF9?logo=pwa&logoColor=white) ![License MIT](https://img.shields.io/badge/License-MIT-0E7C86) ![Hackathon 2026](https://img.shields.io/badge/WeatherWise%20Hack-2026-111827)

---

## What is GuardNet?

GuardNet is a community-first disaster intelligence network that turns raw weather chaos into clear, immediate action. It fuses live weather data, disaster feeds, terrain analysis, and community-submitted reports into a unified risk score with AI-generated safety guidance. Built for WeatherWise Hack 2026.

## Features

| Feature | Description |
|---------|-------------|
| **Live Risk Dashboard** | 0-100 risk gauge fusing weather, disasters, terrain & community signals |
| **Interactive Map** | Leaflet map showing disaster markers, community reports, hospital/shelter locations, and risk heat grid |
| **AI Safety Briefings** | Human-readable risk summaries (auto-generated fallback when AI API unavailable) |
| **Community Reports** | Submit & upvote incident reports (flooding, power cuts, roadblocks, fires, wind) |
| **Guardian Mode** | Register vulnerable people, dispatch volunteers, track assignments in real-time |
| **Offline-First PWA** | Service worker caching, IndexedDB report queue for offline submissions |
| **Location Search** | Search any location to get its risk assessment |
| **Demo Mode** | Instant sample data (Mumbai) — type "demo" in the search bar or click the Demo button |

## Quick Demo

```bash
npm install
npm run dev
```

Open in browser → **Click the "Demo" button** in the top-right header. This activates demo mode with sample disaster data from Mumbai — no API keys needed for the demo experience.

## Tech Stack

- **React 19 + TypeScript + Vite 8** — Modern, fast frontend
- **Tailwind CSS 3** — Utility-first styling
- **React Leaflet** — Interactive mapping (OSM tiles)
- **Firebase** — Auth, Firestore, Push notifications
- **Open-Meteo** — Free weather API (no key required)
- **USGS, NASA EONET, GDACS** — Multi-source disaster data
- **OpenRouteService** — Evacuation route planning
- **OpenRouter** — AI narration (optional, graceful fallback)
- **Workbox / vite-plugin-pwa** — Offline support

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_OPENWEATHER_KEY` | Optional | Fallback weather data (falls back to Open-Meteo) |
| `VITE_MAPBOX_TOKEN` | Optional | Enhanced map tiles (falls back to OSM) |
| `VITE_FIREBASE_*` | Optional | Auth, Firestore, Push (graceful degradation) |
| `VITE_OPENROUTER_KEY` | Optional | AI narration (falls back to local fallback) |
| `VITE_ORS_KEY` | Optional | Evacuation routing (disabled if missing) |

All features degrade gracefully — the app works without any API keys in demo mode.

## Architecture

```
[Weather APIs] ──┐
[Disaster APIs] ──┤
[Elevation API] ──┤──> Risk Engine ──> Dashboard + Map + AI Narration
[Community Reports] ┘
         │
    Guardian Mode ──> Volunteer Dispatch
```

## License

MIT — Built for WeatherWise Hack 2026
