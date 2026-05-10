import { IconVolume } from '@tabler/icons-react'
import type { RiskScore } from '../types'
import { useLanguage } from '../hooks/useLanguage'

type RiskCardProps = {
  riskScore: RiskScore | null
  isLoading?: boolean
  onSpeak?: () => void
  voiceEnabled?: boolean
}

const RiskCard = ({
  riskScore,
  isLoading = false,
  onSpeak,
  voiceEnabled = true,
}: RiskCardProps) => {
  const { t } = useLanguage()

  const levelLabel = riskScore
    ? t(`riskLevels.${riskScore.level}`)
    : t('alertMessages.noRiskData')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('alertMessages.riskStatus')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {levelLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onSpeak}
          disabled={!riskScore || !voiceEnabled}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('buttonLabels.speakAlert')}
          title={t('buttonLabels.speakAlert')}
        >
          <IconVolume size={18} />
        </button>
      </div>

      {isLoading && (
        <p className="mt-3 text-sm text-slate-500">
          {t('alertMessages.loadingRisk')}
        </p>
      )}

      {!isLoading && riskScore && (
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>{riskScore.aiSummary}</p>
          <p className="text-xs text-slate-400">
            {t('alertMessages.lastUpdated')}{' '}
            {new Date(riskScore.lastUpdated).toLocaleString()}
          </p>
        </div>
      )}

      {!isLoading && !riskScore && (
        <p className="mt-3 text-sm text-slate-500">
          {t('alertMessages.noRiskData')}
        </p>
      )}
    </section>
  )
}

export default RiskCard
