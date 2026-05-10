import { useCallback, useEffect, useRef, useState } from 'react'
import OfflineBanner from './components/OfflineBanner'
import LanguageSelector from './components/LanguageSelector'
import RiskCard from './components/RiskCard'
import { useLanguage } from './hooks/useLanguage'
import { calculateRisk } from './services/riskEngine'
import {
  announceAlert,
  isVoiceEnabled,
  setVoiceEnabled,
} from './services/voiceAlert'
import type { RiskScore } from './types'
import './App.css'

function App() {
  const { language, t } = useLanguage()
  const [voiceEnabled, setVoiceEnabledState] = useState(() =>
    isVoiceEnabled(),
  )
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const lastRiskLevelRef = useRef<RiskScore['level'] | null>(null)

  const loadRisk = useCallback(async () => {
    if (!coords) {
      return
    }

    setRiskLoading(true)
    try {
      const score = await calculateRisk(coords.lat, coords.lng)
      setRiskScore(score)
    } catch {
      setRiskScore(null)
    } finally {
      setRiskLoading(false)
    }
  }, [coords])

  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        setCoords(null)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    if (!coords) {
      return
    }

    loadRisk()
  }, [coords, loadRisk])

  useEffect(() => {
    if (!riskScore) {
      return
    }

    const level = riskScore.level
    const previous = lastRiskLevelRef.current

    if ((level === 'high' || level === 'critical') && level !== previous) {
      announceAlert(riskScore.aiSummary, language)
    }

    lastRiskLevelRef.current = level
  }, [language, riskScore])

  const handleSpeak = useCallback(() => {
    if (!riskScore) {
      return
    }
    announceAlert(riskScore.aiSummary, language)
  }, [language, riskScore])

  const handleVoiceToggle = () => {
    const next = !voiceEnabled
    setVoiceEnabledState(next)
    setVoiceEnabled(next)
  }

  return (
    <>
      <OfflineBanner />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <LanguageSelector />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleVoiceToggle}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {voiceEnabled
                ? t('buttonLabels.voiceOn')
                : t('buttonLabels.voiceOff')}
            </button>
            <button
              type="button"
              onClick={loadRisk}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t('buttonLabels.refreshRisk')}
            </button>
          </div>
        </section>

        <RiskCard
          riskScore={riskScore}
          isLoading={riskLoading}
          onSpeak={handleSpeak}
          voiceEnabled={voiceEnabled}
        />
      </main>
    </>
  )
}

export default App
