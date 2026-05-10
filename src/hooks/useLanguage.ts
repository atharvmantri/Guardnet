import { useCallback, useEffect, useMemo, useState } from 'react'
import { translations, type SupportedLanguage } from '../i18n/translations'

const LANGUAGE_STORAGE_KEY = 'guardnet:language'
const LANGUAGE_EVENT = 'guardnet-language-change'

const supportedLanguages = Object.keys(translations) as SupportedLanguage[]

const toBaseLanguage = (value: string) => value.toLowerCase().split('-')[0]

const getStoredLanguage = (): SupportedLanguage | null => {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (!stored) {
    return null
  }

  return supportedLanguages.includes(stored as SupportedLanguage)
    ? (stored as SupportedLanguage)
    : null
}

const findBestMatch = (locale: string | null | undefined) => {
  if (!locale) {
    return null
  }

  const normalized = locale.toLowerCase()
  if (supportedLanguages.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage
  }

  const base = toBaseLanguage(normalized)
  return supportedLanguages.includes(base as SupportedLanguage)
    ? (base as SupportedLanguage)
    : null
}

const detectLanguage = (): SupportedLanguage => {
  const stored = getStoredLanguage()
  if (stored) {
    return stored
  }

  if (typeof navigator === 'undefined') {
    return 'en'
  }

  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]

  for (const candidate of candidates) {
    const match = findBestMatch(candidate)
    if (match) {
      return match
    }
  }

  return 'en'
}

const translate = (lang: SupportedLanguage, key: string) => {
  const parts = key.split('.')
  let current: unknown = translations[lang]

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return key
    }
    current = (current as Record<string, unknown>)[part]
  }

  return typeof current === 'string' ? current : key
}

export const useLanguage = () => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() =>
    detectLanguage(),
  )

  const setLanguage = useCallback((next: SupportedLanguage) => {
    setLanguageState(next)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleLanguageChange = () => {
      const stored = getStoredLanguage()
      if (stored && stored !== language) {
        setLanguageState(stored)
      }
    }

    window.addEventListener('storage', handleLanguageChange)
    window.addEventListener(LANGUAGE_EVENT, handleLanguageChange)

    return () => {
      window.removeEventListener('storage', handleLanguageChange)
      window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange)
    }
  }, [language])

  const t = useCallback(
    (key: string) => translate(language, key),
    [language],
  )

  return useMemo(
    () => ({ language, setLanguage, supportedLanguages, t }),
    [language, setLanguage, t],
  )
}
