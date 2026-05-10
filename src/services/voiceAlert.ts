const VOICE_PREF_KEY = 'voiceEnabled'

const isSpeechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export const isVoiceEnabled = () => {
  if (typeof localStorage === 'undefined') {
    return true
  }

  const stored = localStorage.getItem(VOICE_PREF_KEY)
  if (stored === null) {
    return true
  }

  return stored === 'true'
}

export const setVoiceEnabled = (enabled: boolean) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(VOICE_PREF_KEY, enabled ? 'true' : 'false')
}

const waitForVoices = (): Promise<SpeechSynthesisVoice[]> => {
  if (!isSpeechSupported()) {
    return Promise.resolve([])
  }

  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) {
    return Promise.resolve(voices)
  }

  return new Promise((resolve) => {
    const handleVoicesChanged = () => {
      const updated = window.speechSynthesis.getVoices()
      window.speechSynthesis.removeEventListener(
        'voiceschanged',
        handleVoicesChanged,
      )
      resolve(updated)
    }

    window.speechSynthesis.addEventListener(
      'voiceschanged',
      handleVoicesChanged,
    )

    setTimeout(() => {
      window.speechSynthesis.removeEventListener(
        'voiceschanged',
        handleVoicesChanged,
      )
      resolve(window.speechSynthesis.getVoices())
    }, 1500)
  })
}

const selectVoice = (
  voices: SpeechSynthesisVoice[],
  lang?: string,
) => {
  if (!lang) {
    return voices[0] ?? null
  }

  const normalized = lang.toLowerCase()
  const base = normalized.split('-')[0]

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(base)) ??
    voices[0] ??
    null
  )
}

export const announceAlert = async (text: string, lang?: string) => {
  if (!text.trim()) {
    return
  }

  if (!isSpeechSupported() || !isVoiceEnabled()) {
    return
  }

  const voices = await waitForVoices()
  const utterance = new SpeechSynthesisUtterance(text)

  if (lang) {
    utterance.lang = lang
  }

  const voice = selectVoice(voices, lang)
  if (voice) {
    utterance.voice = voice
  }

  utterance.rate = 0.9
  utterance.pitch = 1

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
