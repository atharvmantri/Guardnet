```
  ____                     _ _   _      _   
 / ___|_   _  __ _ _ __ __| | | | | ___| |_ 
| |  _| | | |/ _` | '__/ _` | |_| |/ _ \ __|
| |_| | |_| | (_| | | | (_| |  _  |  __/ |_ 
 \____|\__,_|\__,_|_|  \__,_|_| |_|\___|\__|
```

Community-powered disaster intelligence, delivered in real time.

![Built With React](https://img.shields.io/badge/Built%20With-React-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black) ![PWA Ready](https://img.shields.io/badge/PWA-ready-2D7FF9?logo=pwa&logoColor=white) ![License MIT](https://img.shields.io/badge/License-MIT-0E7C86) ![Hackathon 2026](https://img.shields.io/badge/WeatherWise%20Hack-2026-111827)

## What is GuardNet?

GuardNet launches as a community-first disaster intelligence network that turns raw weather chaos into clear, immediate action. It fuses multiple data sources, calculates live risk, and broadcasts human-friendly guidance before panic spreads. Built for WeatherWise Hack 2026, it proves that resilient cities start with informed neighbors.

## Feature Breakdown

| Feature | What it does | APIs used |
| --- | --- | --- |
| Live Risk Dashboard | Fuses forecast, hazards, and alerts into a single risk meter | OpenWeather, Firebase |
| Risk Map | Visualizes hotspots, safe zones, and evacuation routes | Mapbox, OpenRouteService |
| AI Narration | Turns risk into concise, human language guidance | Anthropic |
| Community Reports | Collects verified incident reports with location context | Firebase |
| Guardian Mode | Dispatches alerts to nearby volunteers and agencies | Firebase, OpenRouteService |
| Offline-First PWA | Caches critical data when networks fail | Service Worker, Cache API |

## How It Works

```
[User Location]
	|
	v
[Multi-API Weather Fusion]
	|
	v
[Risk Score Engine]
	|
	v
[AI Narration]
	|
	v
[Community Reports]
	|
	v
[Guardian Mode Dispatch]
```

## Tech Stack

**Frontend**
- React, TypeScript, Vite, Tailwind CSS
- React Leaflet for map rendering

**Backend**
- Firebase (Auth, Firestore, Hosting)

**APIs & Data**
- OpenWeather for forecasts and alerts
- Mapbox for maps and geocoding
- OpenRouteService for routing and evacuation paths

**AI**
- Anthropic for real-time narrative guidance

**Offline**
- PWA Service Worker, Cache API, offline fallback

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/your-org/guardnet.git
   cd guardnet
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root
   ```bash
   VITE_OPENWEATHER_KEY=your_openweather_key
   VITE_MAPBOX_TOKEN=your_mapbox_token
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
   VITE_ANTHROPIC_KEY=your_anthropic_key
   VITE_ORS_KEY=your_openrouteservice_key
   ```
   - `VITE_OPENWEATHER_KEY`: Forecasts and severe weather alerts
   - `VITE_MAPBOX_TOKEN`: Base maps, tiles, and geocoding
   - `VITE_FIREBASE_API_KEY`: Firebase client authentication
   - `VITE_FIREBASE_PROJECT_ID`: Firebase project routing and storage
   - `VITE_ANTHROPIC_KEY`: AI narration and safety guidance
   - `VITE_ORS_KEY`: Evacuation routing and path scoring
4. Run the app
   ```bash
   npm run dev
   ```

## Free APIs Used

| API | Purpose | Key needed? |
| --- | --- | --- |
| OpenWeather | Forecasts and alerts | Yes |
| Mapbox (Free tier) | Maps and geocoding | Yes |
| OpenRouteService | Routing and evacuation paths | Yes |
| Firebase (Spark plan) | Auth and realtime data | Yes |

## Guardian Mode Deep Dive

- Activates when risk crosses a threshold, shifting the UI into response mode.
- Dispatches location-aware alerts to trusted volunteers and local agencies.
- Prioritizes reports by severity and proximity for faster action.
- Keeps a live status board so teams coordinate without noise.

## Screenshots

![Dashboard](https://placehold.co/1200x675?text=Dashboard)
*Dashboard*

![Risk Map](https://placehold.co/1200x675?text=Risk%20Map)
*Risk Map*

![Guardian Panel](https://placehold.co/1200x675?text=Guardian%20Panel)
*Guardian Panel*

![Mobile View](https://placehold.co/900x1600?text=Mobile%20View)
*Mobile View*

## Why GuardNet Wins

- **Innovation:** Multi-API fusion plus AI narration delivers signal where others deliver noise.
- **Impact:** Turns communities into coordinated responders, not passive bystanders.
- **Technical depth:** Real-time risk scoring, geospatial routing, and offline resilience in one stack.
- **Design:** Clear, fast, and trusted UI built for the chaos of real emergencies.

## Contributing

1. Fork the repo and create your branch (`git checkout -b feature/your-idea`).
2. Commit your changes (`git commit -m "Add your idea"`).
3. Push to the branch (`git push origin feature/your-idea`).
4. Open a pull request with a clear summary and screenshots when relevant.

## License

MIT

Built with ❤️ for WeatherWise Hack 2026
