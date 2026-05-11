import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  endAt,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAt,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import {
  distanceBetween,
  geohashForLocation,
  geohashQueryBounds,
} from 'geofire-common'
import type { DisasterEvent, GuardianProfile, VolunteerAssignment } from '../types'
import { db } from './firebase'

type GuardianInput = Omit<GuardianProfile, 'id' | 'geohash'>

type VolunteerStatus = 'available' | 'assigned'

type VolunteerRecord = {
  userId: string
  lat: number
  lng: number
  geohash: string
  status: VolunteerStatus
  createdAt: string
  updatedAt?: string
}

type StoredGuardian = Omit<GuardianProfile, 'id'>

type AssignmentRecord = Omit<VolunteerAssignment, 'id'>

type NotificationDoc = {
  volunteerId: string
  guardianId: string
  guardianName: string
  guardianAddress: string
  guardianPhone: string
  guardianLat: number
  guardianLng: number
  disaster: DisasterEvent
  assignmentId: string
  createdAt: string
  status: 'pending'
}

type GuardianAlertResult = {
  guardiansInRange: number
  volunteersMatched: number
  assignmentsCreated: number
  errors: string[]
}

const VOLUNTEER_RADIUS_KM = 2

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Geolocation is unavailable.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        reject(new Error(error.message || 'Location permission denied.'))
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    )
  })
}

const fetchNearbyByGeohash = async <T extends { lat: number; lng: number }>(
  collectionName: string,
  center: [number, number],
  radiusKm: number,
  constraints: QueryConstraint[] = [],
): Promise<Array<{ id: string; data: T }>> => {
  const radiusInM = radiusKm * 1000
  const bounds = geohashQueryBounds(center, radiusInM)

  const snapshots = await Promise.all(
    bounds.map((bound) =>
      getDocs(
        query(
          collection(db, collectionName),
          ...constraints,
          orderBy('geohash'),
          startAt(bound[0]),
          endAt(bound[1]),
        ),
      ),
    ),
  )

  const matches = new Map<string, { id: string; data: T }>()

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as T
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        return
      }

      const distanceKm = distanceBetween([data.lat, data.lng], center)
      if (distanceKm <= radiusKm) {
        matches.set(docSnap.id, { id: docSnap.id, data })
      }
    })
  })

  return Array.from(matches.values())
}

const findNearestVolunteer = (
  volunteers: Array<{ id: string; data: VolunteerRecord }>,
  center: [number, number],
): { id: string; data: VolunteerRecord; distanceKm: number } | null => {
  let nearest: { id: string; data: VolunteerRecord; distanceKm: number } | null = null

  volunteers.forEach((volunteer) => {
    const distanceKm = distanceBetween(
      [volunteer.data.lat, volunteer.data.lng],
      center,
    )

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        ...volunteer,
        distanceKm,
      }
    }
  })

  return nearest
}

const buildAssignment = (
  volunteerId: string,
  guardianId: string,
  disasterEventId: string,
): AssignmentRecord => ({
  volunteerId,
  guardianId,
  disasterEventId,
  status: 'pending',
  assignedAt: new Date().toISOString(),
  completedAt: null,
})

const buildNotification = (
  guardian: StoredGuardian,
  guardianId: string,
  volunteerId: string,
  assignmentId: string,
  disaster: DisasterEvent,
): NotificationDoc => ({
  volunteerId,
  guardianId,
  guardianName: guardian.name,
  guardianAddress: guardian.address,
  guardianPhone: guardian.phone,
  guardianLat: guardian.lat,
  guardianLng: guardian.lng,
  disaster,
  assignmentId,
  createdAt: new Date().toISOString(),
  status: 'pending',
})

const findVolunteerDocId = async (userId: string) => {
  const snapshot = await getDocs(
    query(collection(db, 'volunteers'), where('userId', '==', userId)),
  )

  const docSnap = snapshot.docs[0]
  if (!docSnap) {
    throw new Error('Volunteer record not found.')
  }

  return docSnap.id
}

const updateAssignmentStatus = async (
  assignmentId: string,
  status: VolunteerAssignment['status'],
) => {
  await updateDoc(doc(db, 'assignments', assignmentId), {
    status,
    completedAt: status === 'complete' ? new Date().toISOString() : null,
  })
}

export async function registerGuardian(profile: GuardianInput): Promise<string> {
  try {
    const geohash = geohashForLocation([profile.lat, profile.lng])
    const now = new Date().toISOString()

    const docRef = await addDoc(collection(db, 'guardians'), {
      ...profile,
      geohash,
      createdAt: now,
      updatedAt: now,
    })

    return docRef.id
  } catch (error) {
    throw new Error(
      `Failed to register guardian: ${toErrorMessage(
        error,
        'Unknown error',
      )}`,
    )
  }
}

export async function registerAsVolunteer(
  userId: string,
  lat: number,
  lng: number,
): Promise<string> {
  try {
    const geohash = geohashForLocation([lat, lng])
    const now = new Date().toISOString()

    const docRef = await addDoc(collection(db, 'volunteers'), {
      userId,
      lat,
      lng,
      geohash,
      status: 'available',
      createdAt: now,
      updatedAt: now,
    })

    return docRef.id
  } catch (error) {
    throw new Error(
      `Failed to register volunteer: ${toErrorMessage(
        error,
        'Unknown error',
      )}`,
    )
  }
}

export async function triggerGuardianAlert(
  event: DisasterEvent,
): Promise<GuardianAlertResult> {
  try {
    const guardians: Array<{ id: string; data: StoredGuardian }> = await fetchNearbyByGeohash<StoredGuardian>(
      'guardians',
      [event.lat, event.lng],
      event.radius,
    )

    let volunteersMatched = 0
    let assignmentsCreated = 0
    const errors: string[] = []

    for (const guardian of guardians) {
      try {
        const volunteers: Array<{ id: string; data: VolunteerRecord }> = await fetchNearbyByGeohash<VolunteerRecord>(
          'volunteers',
          [guardian.data.lat, guardian.data.lng],
          VOLUNTEER_RADIUS_KM,
          [where('status', '==', 'available')],
        )

        const nearest = findNearestVolunteer(volunteers, [
          guardian.data.lat,
          guardian.data.lng,
        ])

        if (nearest) {
          const n = nearest as { id: string; data: VolunteerRecord; distanceKm: number }
          volunteersMatched += 1

          const guardianId = guardian.data.userId || guardian.id
          const assignment = buildAssignment(
            n.data.userId,
            guardianId,
            event.id,
          )

          const assignmentRef = await addDoc(
            collection(db, 'assignments'),
            assignment,
          )

          assignmentsCreated += 1

          await updateDoc(doc(db, 'volunteers', n.id), {
            status: 'assigned',
            updatedAt: new Date().toISOString(),
          })

          const notification = buildNotification(
            guardian.data,
            guardianId,
            n.data.userId,
            assignmentRef.id,
            event,
          )

          await setDoc(doc(db, 'notifications', n.data.userId), notification)
        } else {
          continue
        }
      } catch (error) {
        errors.push(
          `Guardian ${guardian.id}: ${toErrorMessage(
            error,
            'Alert processing failed',
          )}`,
        )
      }
    }

    return {
      guardiansInRange: guardians.length,
      volunteersMatched,
      assignmentsCreated,
      errors,
    }
  } catch (error) {
    throw new Error(
      `Failed to trigger guardian alert: ${toErrorMessage(
        error,
        'Unknown error',
      )}`,
    )
  }
}

export function useGuardianMode(userId: string | null) {
  const [myAssignments, setMyAssignments] = useState<VolunteerAssignment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setMyAssignments([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const assignmentsQuery = query(
      collection(db, 'assignments'),
      where('volunteerId', '==', userId),
      orderBy('assignedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const assignments = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<VolunteerAssignment, 'id'>),
        }))

        setMyAssignments(assignments)
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Failed to load assignments.')
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [userId])

  const updateVolunteerStatus = useCallback(
    async (status: VolunteerStatus, location?: { lat: number; lng: number }) => {
      if (!userId) {
        throw new Error('Missing user ID.')
      }

      const volunteerDocId = await findVolunteerDocId(userId)
      const updates: Partial<VolunteerRecord> = {
        status,
        updatedAt: new Date().toISOString(),
      }

      if (location) {
        updates.lat = location.lat
        updates.lng = location.lng
        updates.geohash = geohashForLocation([location.lat, location.lng])
      }

      await updateDoc(doc(db, 'volunteers', volunteerDocId), updates)
    },
    [userId],
  )

  const acceptAssignment = useCallback(
    async (assignmentId: string) => {
      setActionLoading(true)
      setActionError(null)

      try {
        const location = await getCurrentLocation()
        await updateVolunteerStatus('assigned', location)
        await updateAssignmentStatus(assignmentId, 'accepted')
      } catch (error) {
        setActionError(
          toErrorMessage(error, 'Failed to accept the assignment.'),
        )
        throw error
      } finally {
        setActionLoading(false)
      }
    },
    [updateVolunteerStatus],
  )

  const markCheckedIn = useCallback(async (assignmentId: string) => {
    setActionLoading(true)
    setActionError(null)

    try {
      await updateAssignmentStatus(assignmentId, 'checkedin')
    } catch (error) {
      setActionError(
        toErrorMessage(error, 'Failed to mark check-in status.'),
      )
      throw error
    } finally {
      setActionLoading(false)
    }
  }, [])

  const markComplete = useCallback(
    async (assignmentId: string) => {
      setActionLoading(true)
      setActionError(null)

      try {
        await updateAssignmentStatus(assignmentId, 'complete')
        await updateVolunteerStatus('available')
      } catch (error) {
        setActionError(
          toErrorMessage(error, 'Failed to complete the assignment.'),
        )
        throw error
      } finally {
        setActionLoading(false)
      }
    },
    [updateVolunteerStatus],
  )

  return {
    myAssignments,
    loading,
    error,
    actionLoading,
    actionError,
    acceptAssignment,
    markCheckedIn,
    markComplete,
  }
}

export function useDisasterWatcher() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seenIdsRef = useRef(new Set<string>())
  const initializedRef = useRef(false)

  useEffect(() => {
    const disastersQuery = query(collection(db, 'disasters'))

    const unsubscribe = onSnapshot(
      disastersQuery,
      (snapshot) => {
        const handleSnapshot = async () => {
          if (!initializedRef.current) {
            snapshot.docs.forEach((docSnap) => {
              seenIdsRef.current.add(docSnap.id)
            })
            initializedRef.current = true
            setLoading(false)
            return
          }

          const newEvents = snapshot
            .docChanges()
            .filter((change) => change.type === 'added')
            .map((change) => ({
              id: change.doc.id,
              ...(change.doc.data() as Omit<DisasterEvent, 'id'>),
            }))
            .filter(
              (event) =>
                event.severity === 'high' || event.severity === 'critical',
            )
            .filter((event) => !seenIdsRef.current.has(event.id))

          newEvents.forEach((event) => seenIdsRef.current.add(event.id))

          if (!newEvents.length) {
            return
          }

          try {
            await Promise.all(newEvents.map((event) => triggerGuardianAlert(event)))
          } catch (err) {
            setError(
              toErrorMessage(err, 'Failed to trigger guardian alerts.'),
            )
          }
        }

        void handleSnapshot()
      },
      (err) => {
        setError(err.message || 'Failed to watch disasters.')
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  return {
    loading,
    error,
  }
}
