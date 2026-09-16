import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseAppletConfig from '../../firebase-applet-config.json';

// Web app's Firebase configuration provided by AI Studio
export const firebaseConfig = firebaseAppletConfig;

// Initialize Firebase App instance safely (singleton)
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth & Providers
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Initialize Firestore safely with database ID from configuration
export const db: Firestore = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${(firebaseConfig as any).firestoreDatabaseId}/data?openUpgradeDialog=true`;
export const FIREBASE_AUTH_SETTINGS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

export interface FirestoreStatus {
  isConnected: boolean;
  isQuotaExceeded: boolean;
  isOffline: boolean;
  errorMessage?: string;
  upgradeUrl?: string;
}

/**
 * Deeply sanitizes any object for Firestore by removing `undefined` values,
 * transforming empty strings or nulls safely.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return (data === undefined ? null : data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        result[key] = sanitizeForFirestore(value);
      }
    }
    return result as T;
  }
  return data;
}

// Analytics setup guarded for browser support
let analyticsInstance: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analyticsInstance = getAnalytics(app);
    }
  }).catch(() => {
    // Analytics optional in restricted iframe environments
  });
}
export const analytics = analyticsInstance;

// Error Handling Infrastructure
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (msg.includes('permission') || msg.includes('insufficient')) {
    throw new Error(JSON.stringify(errInfo));
  }
  return errInfo;
}

// Connection test helper following Firebase skill guidelines
export async function testFirestoreConnection(): Promise<FirestoreStatus> {
  try {
    const docRef = doc(db, 'system', 'connection_test');
    await getDocFromServer(docRef);
    return {
      isConnected: true,
      isQuotaExceeded: false,
      isOffline: false,
    };
  } catch (error: any) {
    const code = error?.code || '';
    const msg = error?.message || String(error);
    const isQuota = code === 'resource-exhausted' || msg.includes('Quota') || msg.includes('quota');
    const isOffline = code === 'unavailable' || msg.includes('offline') || msg.includes('Could not reach Cloud Firestore') || msg.includes('the client is offline');

    if (isQuota) {
      console.warn('Firestore daily read units quota reached. Running in robust offline local mode.', FIRESTORE_UPGRADE_URL);
      return {
        isConnected: false,
        isQuotaExceeded: true,
        isOffline: false,
        errorMessage: "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'",
        upgradeUrl: FIRESTORE_UPGRADE_URL
      };
    }

    if (isOffline) {
      console.info('Firestore is operating in offline mode.');
      return {
        isConnected: false,
        isQuotaExceeded: false,
        isOffline: true,
        errorMessage: 'Client operating in offline mode.'
      };
    }

    return {
      isConnected: false,
      isQuotaExceeded: false,
      isOffline: true,
      errorMessage: msg
    };
  }
}
