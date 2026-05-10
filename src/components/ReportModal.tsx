import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  IconBarrierBlock,
  IconBoltOff,
  IconFlame,
  IconRipple,
  IconWind,
} from '@tabler/icons-react'
import type { CommunityReport } from '../types'
import { addCommunityReport, auth } from '../services/firebase'
import './reporting.css'

type ReportModalProps = {
  isOpen: boolean
  lat: number
  lng: number
  onClose: () => void
}

type ReportTypeOption = {
  type: CommunityReport['type']
  label: string
  Icon: typeof IconRipple
}

const REPORT_TYPES: ReportTypeOption[] = [
  { type: 'flooding', label: 'Flooding', Icon: IconRipple },
  { type: 'powercut', label: 'Power Cut', Icon: IconBoltOff },
  { type: 'roadblocked', label: 'Road Blocked', Icon: IconBarrierBlock },
  { type: 'wind', label: 'Strong Winds', Icon: IconWind },
  { type: 'fire', label: 'Fire/Smoke', Icon: IconFlame },
]

const formatCoords = (lat: number, lng: number) =>
  `${lat.toFixed(4)}, ${lng.toFixed(4)}`

const ReportModal = ({ isOpen, lat, lng, onClose }: ReportModalProps) => {
  const [selectedType, setSelectedType] = useState<CommunityReport['type']>(
    'flooding',
  )
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const toastTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!selectedType || Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Please choose a report type and valid coordinates.')
      return
    }

    setIsSubmitting(true)

    try {
      await addCommunityReport({
        userId: auth.currentUser?.uid ?? 'anonymous',
        type: selectedType,
        description: details.trim(),
        lat,
        lng,
        timestamp: new Date().toISOString(),
        upvotes: 0,
      })

      setDetails('')
      setShowToast(true)
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      toastTimerRef.current = window.setTimeout(() => {
        setShowToast(false)
      }, 3200)
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Report submission failed. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="report-modal-root" aria-hidden={!isOpen}>
      <div
        className={`report-modal-overlay ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
      />
      <section
        className={`report-modal-sheet ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Submit a community report"
      >
        <header className="report-modal-header">
          <h3>Report a nearby issue</h3>
          <button type="button" className="report-close" onClick={onClose}>
            Close
          </button>
        </header>
        <form className="report-modal-body" onSubmit={handleSubmit}>
          <div className="report-type-grid">
            {REPORT_TYPES.map(({ type, label, Icon }) => (
              <button
                key={type}
                type="button"
                className={`report-type-button ${
                  selectedType === type ? 'is-active' : ''
                }`}
                onClick={() => setSelectedType(type)}
              >
                <Icon aria-hidden="true" size={22} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <label className="report-field">
            <span>Details (optional)</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Share brief context (max 100 chars)."
              maxLength={100}
            />
          </label>
          <div className="report-meta-row">
            <span className="report-coords">{formatCoords(lat, lng)}</span>
            <span className="report-char-count">{details.length}/100</span>
          </div>
          {error && <p className="report-error">{error}</p>}
          <button
            type="submit"
            className="report-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit report'}
          </button>
        </form>
      </section>
      <div className={`report-toast ${showToast ? 'is-visible' : ''}`}>
        Report submitted — helping your neighbors
      </div>
    </div>
  )
}

export default ReportModal
