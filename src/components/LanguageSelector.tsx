import { useLanguage } from '../hooks/useLanguage'

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  bn: 'বাংলা',
  ta: 'தமிழ்',
  es: 'Español',
  fr: 'Français',
  ar: 'العربية',
}

const LanguageSelector = () => {
  const { language, setLanguage, supportedLanguages, t } = useLanguage()

  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
      <span>{t('buttonLabels.language')}</span>
      <select
        value={language}
        onChange={(event) =>
          setLanguage(event.target.value as typeof language)
        }
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm"
        aria-label={t('buttonLabels.language')}
      >
        {supportedLanguages.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_LABELS[code] ?? code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LanguageSelector
