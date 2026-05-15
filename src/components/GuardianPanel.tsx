import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { distanceBetween, geohashForLocation } from 'geofire-common'
import type { GuardianProfile, VolunteerAssignment } from '../types'
import { auth, db } from '../services/firebase'
import {
  registerAsVolunteer,
  registerGuardian,
  useGuardianMode,
} from '../services/guardianService'

type Mode = 'guardian' | 'volunteer'

type GuardianEntry = GuardianProfile

type AssignmentDetail = {
  assignment: VolunteerAssignment
  guardian: GuardianEntry | null
}

type LocationCoords = {
  lat: number
  lng: number
}

const vulnerabilityOptions = [
  { id: 'elderly', label: 'Elderly' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'infant', label: 'Infant' },
  { id: 'medical', label: 'Medical' },
]

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm === null) {
    return 'Distance unavailable'
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`
  }
  return `${distanceKm.toFixed(2)} km away`
}

const toPhoneLink = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : 'tel:'
}

const playChime = (ctxRef: MutableRefObject<AudioContext | null>) => {
  if (typeof window === 'undefined') {
    return
  }

  const AudioContextConstructor = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextConstructor) {
    return
  }

  const ctx = ctxRef.current ?? new AudioContextConstructor()
  ctxRef.current = ctx

  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(523.25, now)
  oscillator.frequency.exponentialRampToValueAtTime(659.25, now + 0.4)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.55)
}

const getCurrentPosition = (): Promise<LocationCoords> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is unavailable.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        reject(new Error(error.message || 'Unable to get location.'))
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    )
  })

const useGuardianDirectory = () => {
  const [guardians, setGuardians] = useState<GuardianEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const guardiansQuery = query(
      collection(db, 'guardians'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      guardiansQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<GuardianProfile, 'id'>),
        }))
        setGuardians(entries)
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Failed to load guardians.')
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  return { guardians, loading, error }
}

const fetchGuardianProfile = async (guardianId: string) => {
  const guardiansRef = collection(db, 'guardians')
  const byUserId = await getDocs(
    query(guardiansRef, where('userId', '==', guardianId)),
  )

  if (!byUserId.empty) {
    const docSnap = byUserId.docs[0]
    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<GuardianProfile, 'id'>),
    } satisfies GuardianEntry
  }

  const docSnap = await getDoc(doc(db, 'guardians', guardianId))
  if (!docSnap.exists()) {
    return null
  }

  return {
    id: docSnap.id,
    ...(docSnap.data() as Omit<GuardianProfile, 'id'>),
  } satisfies GuardianEntry
}

const statusLabel = (status: VolunteerAssignment['status']) => {
  switch (status) {
    case 'pending':
      return 'Awaiting response'
    case 'accepted':
      return 'Accepted'
    case 'checkedin':
      return 'Checked in'
    case 'complete':
      return 'Complete'
    default:
      return status
  }
}

const GuardianPanel = () => {
  const [mode, setMode] = useState<Mode>('guardian')
  const [userId, setUserId] = useState<string | null>(null)
  const [formState, setFormState] = useState({
    name: '',
    address: '',
    phone: '',
    vulnerabilities: new Set<string>(),
  })
  const [submitStatus, setSubmitStatus] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState(false)
  const [availabilityStatus, setAvailabilityStatus] = useState<string | null>(
    null,
  )
  const [currentLocation, setCurrentLocation] = useState<LocationCoords | null>(
    null,
  )
  const audioContextRef = useRef<AudioContext | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastLocationUpdateRef = useRef<number>(0)
  const volunteerDocIdRef = useRef<string | null>(null)
  const pendingAssignmentRef = useRef<Set<string>>(new Set())

  const { guardians, loading: guardiansLoading, error: guardiansError } =
    useGuardianDirectory()
  const {
    myAssignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    actionLoading,
    actionError,
    acceptAssignment,
    markCheckedIn,
    markComplete,
  } = useGuardianMode(userId)

  const hasPendingAssignments = myAssignments.some(
    (assignment) => assignment.status === 'pending',
  )

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!availability) {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      setAvailabilityStatus('Geolocation is unavailable on this device.')
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now()
        if (now - lastLocationUpdateRef.current < 60000) {
          return
        }

        lastLocationUpdateRef.current = now
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setCurrentLocation(coords)

        if (!volunteerDocIdRef.current) {
          return
        }

        try {
          const geohash = geohashForLocation([coords.lat, coords.lng])
          await updateDoc(doc(db, 'volunteers', volunteerDocIdRef.current), {
            lat: coords.lat,
            lng: coords.lng,
            geohash,
            status: 'available',
            updatedAt: new Date().toISOString(),
          })
        } catch (error) {
          setAvailabilityStatus(
            error instanceof Error
              ? error.message
              : 'Unable to update volunteer location.',
          )
        }
      },
      (error) => {
        setAvailabilityStatus(error.message || 'Location tracking failed.')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 15000,
      },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [availability])

  useEffect(() => {
    const pendingIds = new Set(
      myAssignments
        .filter((assignment) => assignment.status === 'pending')
        .map((assignment) => assignment.id),
    )

    let hasNewPending = false
    pendingIds.forEach((id) => {
      if (!pendingAssignmentRef.current.has(id)) {
        hasNewPending = true
      }
    })

    if (hasNewPending) {
      playChime(audioContextRef)
    }

    pendingAssignmentRef.current = pendingIds
  }, [myAssignments])

  const assignmentDetails = useAssignmentDetails(myAssignments)

  const assignmentCards = useMemo(() => {
    return assignmentDetails.map(({ assignment, guardian }) => {
      const distanceKm =
        guardian && currentLocation
          ? distanceBetween(
              [guardian.lat, guardian.lng],
              [currentLocation.lat, currentLocation.lng],
            )
          : null

      return {
        assignment,
        guardian,
        distanceLabel: formatDistance(distanceKm),
      }
    })
  }, [assignmentDetails, currentLocation])

  const handleVulnerabilityToggle = (id: string) => {
    setFormState((prev) => {
      const next = new Set(prev.vulnerabilities)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { ...prev, vulnerabilities: next }
    })
  }

  const handleGuardianSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitStatus(null)

    if (!userId) {
      setSubmitStatus('Please sign in before registering a guardian.')
      return
    }

    if (!formState.name || !formState.address || !formState.phone) {
      setSubmitStatus('Please fill out name, address, and phone.')
      return
    }

    setSubmitting(true)

    try {
      const location = await getCurrentPosition()

      await registerGuardian({
        userId,
        name: formState.name,
        address: formState.address,
        phone: formState.phone,
        lat: location.lat,
        lng: location.lng,
        vulnerabilities: Array.from(formState.vulnerabilities),
        emergencyContact: '',
      })

      setFormState({
        name: '',
        address: '',
        phone: '',
        vulnerabilities: new Set(),
      })
      setSubmitStatus('Guardian registered successfully.')
    } catch (error) {
      if (error instanceof Error) {
        setSubmitStatus(error.message)
      } else {
        setSubmitStatus('Unable to register guardian right now.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAvailabilityToggle = async () => {
    setAvailabilityStatus(null)

    if (!availability) {
      if (!userId) {
        setAvailabilityStatus('Please sign in before volunteering.')
        return
      }

      try {
        const location = await getCurrentPosition()
        setCurrentLocation(location)

        const existing = await getDocs(
          query(collection(db, 'volunteers'), where('userId', '==', userId)),
        )

        if (!existing.empty) {
          const docSnap = existing.docs[0]
          volunteerDocIdRef.current = docSnap.id
          const geohash = geohashForLocation([location.lat, location.lng])

          await updateDoc(doc(db, 'volunteers', docSnap.id), {
            lat: location.lat,
            lng: location.lng,
            geohash,
            status: 'available',
            updatedAt: new Date().toISOString(),
          })
        } else {
          const id = await registerAsVolunteer(
            userId,
            location.lat,
            location.lng,
          )
          volunteerDocIdRef.current = id
        }

        lastLocationUpdateRef.current = Date.now()
        setAvailability(true)
      } catch (error) {
        setAvailabilityStatus(
          error instanceof Error
            ? error.message
            : 'Unable to enable volunteer availability.',
        )
      }
      return
    }

    if (volunteerDocIdRef.current) {
      try {
        await updateDoc(doc(db, 'volunteers', volunteerDocIdRef.current), {
          status: 'assigned',
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        setAvailabilityStatus(
          error instanceof Error
            ? error.message
            : 'Unable to update volunteer status.',
        )
      }
    }

    setAvailability(false)
  }

  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/40">
      <header className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Guardian Response
          </p>
          <h2 className="text-xl font-semibold text-slate-900">
            Protect vulnerable neighbors
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Register guardians and coordinate volunteers.
          </p>
        </div>
        <div className="grid grid-cols-2 rounded-full border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('guardian')}
            className={`relative rounded-full py-2 text-center text-sm font-semibold transition ${
              mode === 'guardian'
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Guardian
          </button>
          <button
            type="button"
            onClick={() => setMode('volunteer')}
            className={`relative flex items-center justify-center gap-2 rounded-full py-2 text-center text-sm font-semibold transition ${
              mode === 'volunteer'
                ? 'bg-white text-slate-900 shadow'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Volunteer
            {hasPendingAssignments ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {mode === 'guardian' ? (
        <div className="mt-4 grid gap-4">
          <form
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            onSubmit={handleGuardianSubmit}
          >
            <h3 className="text-base font-semibold text-slate-900">
              Register a vulnerable person
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              We will use this information to coordinate nearby volunteers.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Full name
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-200 px-4 text-slate-900 outline-none transition focus:border-slate-400"
                  placeholder="Full name"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Address
                <input
                  type="text"
                  value={formState.address}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      address: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-200 px-4 text-slate-900 outline-none transition focus:border-slate-400"
                  placeholder="Street, city, zip"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Phone
                <input
                  type="tel"
                  value={formState.phone}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-200 px-4 text-slate-900 outline-none transition focus:border-slate-400"
                  placeholder="Phone number"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-700">
                Vulnerabilities
              </p>
              <div className="mt-2 grid gap-2">
                {vulnerabilityOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={formState.vulnerabilities.has(option.id)}
                      onChange={() => handleVulnerabilityToggle(option.id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? 'Registering...' : 'Register Guardian'}
            </button>

            {submitStatus ? (
              <p className="mt-2 text-sm text-slate-600">{submitStatus}</p>
            ) : null}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Registered guardians
              </h3>
              <span className="text-sm text-slate-400">
                {guardians.length} total
              </span>
            </div>

            {guardiansLoading ? (
              <p className="mt-2 text-sm text-slate-500">Loading guardians...</p>
            ) : guardiansError ? (
              <p className="mt-2 text-sm text-rose-500">{guardiansError}</p>
            ) : guardians.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No guardians registered yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {guardians.map((guardian) => (
                  <li
                    key={guardian.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {guardian.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {guardian.address}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {guardian.phone}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {guardian.vulnerabilities.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Volunteer availability
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Toggle availability to receive guardian assignments.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAvailabilityToggle}
                className={`relative w-full rounded-2xl px-6 py-4 text-left text-sm font-semibold transition ${
                  availability
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>I am available to help</span>
                  <span
                    className={`h-6 w-12 rounded-full p-1 transition ${
                      availability ? 'bg-white/30' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition ${
                        availability ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </div>
              </button>
            </div>
            {availabilityStatus ? (
              <p className="mt-4 text-sm text-rose-500">
                {availabilityStatus}
              </p>
            ) : null}
            {currentLocation ? (
              <p className="mt-4 text-xs text-slate-400">
                Last location update: {currentLocation.lat.toFixed(4)},{' '}
                {currentLocation.lng.toFixed(4)}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                My assignments
              </h3>
              {assignmentsLoading ? (
                <span className="text-sm text-slate-400">Loading...</span>
              ) : null}
            </div>
            {assignmentsError ? (
              <p className="mt-4 text-sm text-rose-500">{assignmentsError}</p>
            ) : assignmentCards.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No assignments yet. Stay available to be matched.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {assignmentCards.map(({ assignment, guardian, distanceLabel }) => (
                  <article
                    key={assignment.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {guardian?.name ?? 'Guardian request'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {guardian?.address ?? 'Address pending'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {distanceLabel}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {statusLabel(assignment.status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      <span>{guardian?.phone ?? 'Phone pending'}</span>
                      {guardian?.phone ? (
                        <a
                          href={toPhoneLink(guardian.phone)}
                          className="text-sm font-semibold text-slate-900"
                        >
                          Click to call
                        </a>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={
                          assignment.status !== 'pending' || actionLoading
                        }
                        onClick={() => acceptAssignment(assignment.id)}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-200"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={
                          assignment.status !== 'accepted' || actionLoading
                        }
                        onClick={() => markCheckedIn(assignment.id)}
                        className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-200"
                      >
                        Checked In
                      </button>
                      <button
                        type="button"
                        disabled={
                          assignment.status !== 'checkedin' || actionLoading
                        }
                        onClick={() => markComplete(assignment.id)}
                        className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-teal-200"
                      >
                        Complete
                      </button>
                    </div>

                    {actionError ? (
                      <p className="mt-3 text-xs text-rose-500">
                        {actionError}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const useAssignmentDetails = (assignments: VolunteerAssignment[]) => {
  const [details, setDetails] = useState<AssignmentDetail[]>([])

  useEffect(() => {
    let active = true

    const load = async () => {
      const next: AssignmentDetail[] = await Promise.all(
        assignments.map(async (assignment) => {
          const guardian = await fetchGuardianProfile(assignment.guardianId)
          return { assignment, guardian }
        }),
      )

      if (active) {
        setDetails(next)
      }
    }

    if (assignments.length) {
      load().catch(() => {
        if (active) {
          setDetails(
            assignments.map((assignment) => ({
              assignment,
              guardian: null,
            })),
          )
        }
      })
    } else {
      setDetails([])
    }

    return () => {
      active = false
    }
  }, [assignments])

  return details
}

export default GuardianPanel
