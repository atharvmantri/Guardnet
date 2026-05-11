import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  doc,
  endAt,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  startAt,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import {
  distanceBetween,
  geohashForLocation,
  geohashQueryBounds,
} from 'geofire-common'
import type {
  CommunityReport,
  GuardianProfile,
  VolunteerAssignment,
} from '../types'

let communityReportsOverride: CommunityReport[] | null = null

export const setCommunityReportsOverride = (
  override: CommunityReport[] | null,
) => {
  communityReportsOverride = override
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const db = getFirestore(firebaseApp)
export const auth = getAuth(firebaseApp)

const AUTH_ERROR_KEY = 'gn:auth_config_error'
let hasAuthConfigError = typeof localStorage !== 'undefined' && localStorage.getItem(AUTH_ERROR_KEY) === 'true'

onAuthStateChanged(auth, (user) => {
  if (!user && !hasAuthConfigError) {
    signInAnonymously(auth).catch((error) => {
      // Only log the full error if it's not a config issue we've already seen
      if (error.code === 'auth/configuration-not-found') {
        hasAuthConfigError = true
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTH_ERROR_KEY, 'true')
        }
        console.warn('Anonymous Authentication is not enabled in the Firebase Console. GuardNet will continue in restricted mode.')
      } else {
        console.error('Firebase Anonymous Auth Error:', error)
      }
    })
  }
})

export async function addCommunityReport(
  report: Omit<CommunityReport, 'id' | 'geohash'>,
): Promise<string> {
  const geohash = geohashForLocation([report.lat, report.lng])
  const docRef = await addDoc(collection(db, 'communityReports'), {
    ...report,
    geohash,
  })
  return docRef.id
}

export async function getCommunityReports(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<CommunityReport[]> {
  if (communityReportsOverride) {
    const center: [number, number] = [lat, lng]
    return communityReportsOverride
      .filter(
        (report) =>
          distanceBetween([report.lat, report.lng], center) <= radiusKm,
      )
      .sort(
        (a, b) =>
          (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0),
      )
      .slice(0, 50)
  }

  const center: [number, number] = [lat, lng]
  const radiusInM = radiusKm * 1000
  const bounds = geohashQueryBounds(center, radiusInM)


  const snapshots = await Promise.all(
    bounds.map((bound: [string, string]) =>
      getDocs(
        query(
          collection(db, 'communityReports'),
          orderBy('geohash'),
          startAt(bound[0]),
          endAt(bound[1]),
        ),
      ),
    ),
  )

  const matching: CommunityReport[] = []

  snapshots.forEach((snapshot: any) => {
    snapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data() as Omit<CommunityReport, 'id'>
      const distance = distanceBetween([data.lat, data.lng], center)
      if (distance <= radiusKm) {
        matching.push({
          id: docSnap.id,
          ...data,
        })
      }
    })
  })

  return matching
    .sort((a, b) =>
      (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0),
    )
    .slice(0, 50)
}

export async function registerGuardian(
  profile: Omit<GuardianProfile, 'id' | 'geohash'>,
): Promise<string> {
  const geohash = geohashForLocation([profile.lat, profile.lng])
  const docRef = await addDoc(collection(db, 'guardians'), {
    ...profile,
    geohash,
  })
  return docRef.id
}

export async function registerVolunteer(
  userId: string,
  lat: number,
  lng: number,
): Promise<string> {
  const geohash = geohashForLocation([lat, lng])
  const docRef = await addDoc(collection(db, 'volunteers'), {
    userId,
    lat,
    lng,
    geohash,
    createdAt: new Date().toISOString(),
  })
  return docRef.id
}

export async function createAssignment(
  assignment: Omit<VolunteerAssignment, 'id'>,
): Promise<string> {
  const docRef = await addDoc(collection(db, 'assignments'), {
    ...assignment,
    assignedAt: assignment.assignedAt || new Date().toISOString(),
  })
  return docRef.id
}

export async function updateAssignmentStatus(
  id: string,
  status: VolunteerAssignment['status'],
): Promise<void> {
  await updateDoc(doc(db, 'assignments', id), {
    status,
    completedAt: status === 'complete' ? new Date().toISOString() : null,
  })
}

export function listenToAssignments(
  userId: string,
  callback: (assignments: VolunteerAssignment[]) => void,
): () => void {
  const assignmentsQuery = query(
    collection(db, 'assignments'),
    where('volunteerId', '==', userId),
    orderBy('assignedAt', 'desc'),
  )

  return onSnapshot(assignmentsQuery, (snapshot) => {
    const assignments = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<VolunteerAssignment, 'id'>),
    }))
    callback(assignments)
  })
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return null
  }

  const supported = await isSupported()
  if (!supported) {
    return null
  }

  const messaging = getMessaging(firebaseApp)
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as
    | string
    | undefined

  return getToken(messaging, vapidKey ? { vapidKey } : undefined)
}

export function sendLocalNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  }
}
