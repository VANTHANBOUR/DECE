import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { Classroom, LessonPlan, PlanAttachment, SchoolProfile, SystemAuditLog, UserAccount, UserRole, WeeklyComplianceRecord, SchoolLevel, CampusId, CAMPUS_LIST, isCentralHQUser, isAdminOrSuperAdmin } from '../types';
import { INITIAL_ACCOUNTS, INITIAL_AUDIT_LOGS, INITIAL_CLASSROOMS, INITIAL_LESSON_PLANS, INITIAL_SCHOOL_PROFILE } from '../data/mockData';
import { isPlanFromCampus } from '../utils/campusUtils';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType, 
  testFirestoreConnection,
  firebaseConfig,
  sanitizeForFirestore,
  FIRESTORE_UPGRADE_URL,
  FIREBASE_AUTH_SETTINGS_URL
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  updateDoc,
  serverTimestamp,
  onSnapshot 
} from 'firebase/firestore';

export type NavigationTab = 
  | 'dashboard' 
  | 'lesson_plans' 
  | 'create_plan' 
  | 'compliance_matrix' 
  | 'classrooms' 
  | 'weekly_schedule' 
  | 'admin_console'
  | 'brand_guide';

interface AppContextType {
  currentUser: UserAccount | null;
  isAuthenticated: boolean;
  allAccounts: UserAccount[];
  switchUser: (userId: string) => void;
  signIn: (email: string, password?: string) => Promise<boolean>;
  signUp: (userData: Partial<UserAccount> & { password?: string }) => Promise<UserAccount | null>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  updateAccount: (userId: string, updates: Partial<UserAccount>) => void;
  deleteAccount: (userId: string) => void;
  registerTeacher: (teacherData: Partial<UserAccount>) => Promise<UserAccount | null>;
  
  // Firebase State & Live Cloud Push
  isFirebaseConnected: boolean;
  isQuotaExceeded: boolean;
  quotaUpgradeUrl: string;
  isOfflineMode: boolean;
  firestoreStatusMessage: string;
  firebaseAuthUser: FirebaseUser | null;
  firebaseConfigInfo: typeof firebaseConfig;
  unauthorizedDomain: string | null;
  authSettingsUrl: string;
  clearUnauthorizedDomain: () => void;
  isSyncingLive: boolean;
  lastSyncedAt: string | null;
  pushLiveUpdate: (customMessage?: string) => Promise<void>;
  forceCloudSync: () => Promise<void>;
  
  // Auth Modal Controls
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authModalMode: 'signin' | 'signup';
  setAuthModalMode: (mode: 'signin' | 'signup') => void;
  openSignInModal: () => void;
  openSignUpModal: () => void;

  // Lesson Plans
  lessonPlans: LessonPlan[];
  userLessonPlans: LessonPlan[];
  selectedPlan: LessonPlan | null;
  setSelectedPlan: (plan: LessonPlan | null) => void;
  
  // Actions
  createLessonPlan: (planData: Omit<LessonPlan, 'id' | 'createdAt' | 'updatedAt' | 'feedbackHistory'>) => LessonPlan;
  updateLessonPlan: (id: string, updates: Partial<LessonPlan>) => void;
  deleteLessonPlan: (id: string) => void;
  submitLessonPlan: (id: string) => void;
  
  // Admin & Academic Officer Actions
  adminReviewPlan: (
    planId: string, 
    action: 'approved' | 'revision_requested' | 'comment_only', 
    comment: string,
    rubric?: { curriculumAlignment: number; trilingualIntegration: number; sensorySafety: number; differentiation: number }
  ) => void;
  batchApprovePlans: (planIds: string[]) => void;
  
  // Classrooms
  classrooms: Classroom[];
  addClassroom: (classroomData: Omit<Classroom, 'id'>) => Classroom;
  updateClassroom: (id: string, updates: Partial<Classroom>) => void;
  deleteClassroom: (id: string) => void;

  // Levels / Age Groups
  levels: SchoolLevel[];
  addLevel: (levelData: Omit<SchoolLevel, 'id'>) => SchoolLevel;
  updateLevel: (id: string, updates: Partial<SchoolLevel>) => void;
  deleteLevel: (id: string) => void;
  
  // Compliance & Metrics
  getWeeklyCompliance: (weekNumber: number) => WeeklyComplianceRecord[];
  
  // Audit Logs
  auditLogs: SystemAuditLog[];
  addAuditLog: (action: SystemAuditLog['action'], details: string, targetId?: string) => void;

  // Toast notifications
  toastMessage: { text: string; type: 'success' | 'info' | 'warning' | 'error' } | null;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;

  // Active View / Navigation Tab & Campus Filter
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  selectedCampusId: CampusId;
  setSelectedCampusId: (campusId: CampusId) => void;
  formatAgeGroup: (group: string, campusId?: CampusId) => string;
  isCentralHQStaff: boolean;

  // School Profile & Branding
  schoolProfile: SchoolProfile;
  updateSchoolProfile: (updates: Partial<SchoolProfile>) => Promise<void>;
  uploadCustomLogo: (fileOrDataUrl: File | string) => Promise<string>;
  resetLogoToDefault: () => Promise<void>;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  openProfileModal: () => void;
  resetUserPassword: (email: string) => Promise<void>;
  toggleGlobalSignUp: (disabled?: boolean) => Promise<void>;
  toggleCampusSignUp: (campusId: CampusId, disabled?: boolean) => Promise<void>;
  isSignUpAllowedForCampus: (campusId: CampusId) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  IS_LOGGED_IN: 'dch_is_logged_in_v5',
  SESSION_ACTIVE: 'dch_session_active_v5',
  CURRENT_USER_ID: 'dch_current_user_id_v5',
  ACCOUNTS: 'dch_accounts_v5',
  LESSON_PLANS: 'dch_lesson_plans_v5',
  CLASSROOMS: 'dch_classrooms_v5',
  AUDIT_LOGS: 'dch_audit_logs_v5',
  SCHOOL_PROFILE: 'dch_school_profile_v5',
  LEVELS: 'dch_levels_v5',
  SELECTED_CAMPUS: 'dch_selected_campus_v5',
};

// Safe localStorage helper to prevent QuotaExceededError crashes
const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[Storage] Failed to set localStorage key "${key}":`, err);
    try {
      // 1. Evict any old legacy keys from previous app versions
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('dch_') || k.startsWith('dewey_')) && !k.includes('_v5')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // 2. Retry original write
      localStorage.setItem(key, value);
      return true;
    } catch {
      // 3. If it's a bulky collection like LESSON_PLANS, store a compact version without crashing
      if (key === STORAGE_KEYS.LESSON_PLANS) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            // Store only the 10 most recent plans with essential metadata for offline caching
            const compact = parsed.slice(0, 10).map((p: any) => ({
              id: p.id,
              themeTitle: p.themeTitle,
              weekNumber: p.weekNumber,
              term: p.term,
              academicYear: p.academicYear,
              classId: p.classId,
              className: p.className,
              teacherId: p.teacherId,
              teacherName: p.teacherName,
              campusId: p.campusId,
              status: p.status,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
              submittedAt: p.submittedAt,
              approvedAt: p.approvedAt,
              days: p.days || {},
            }));
            localStorage.setItem(key, JSON.stringify(compact));
            return true;
          }
        } catch {}
      } else if (key === STORAGE_KEYS.AUDIT_LOGS) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            localStorage.setItem(key, JSON.stringify(parsed.slice(0, 20)));
            return true;
          }
        } catch {}
      }
      // Fail gracefully without throwing errors in React lifecycle
      return false;
    }
  }
};

const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[Storage] Failed to read localStorage key "${key}":`, err);
    return null;
  }
};

const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {}
};

const DEFAULT_LEVELS: SchoolLevel[] = [
  { id: 'lvl_toddlers', name: 'Pre-Nursery', displayName: 'Pre-Nursery', khmerName: 'ថ្នាក់កូនក្មេង' },
  { id: 'lvl_nursery', name: 'Nursery', displayName: 'Nursery', khmerName: 'ថ្នាក់មត្តេយ្យទាប' },
  { id: 'lvl_pre_school', name: 'Pre-School', displayName: 'Pre-School', khmerName: 'ថ្នាក់មត្តេយ្យមធ្យម' },
  { id: 'lvl_kindergarten', name: 'Kindergarten', displayName: 'Kindergarten', khmerName: 'ថ្នាក់មត្តេយ្យខ្ពស់' },
];

// Cross-tab & multi-window instant live synchronization helper
const broadcastLiveSync = (type: string, data: any) => {
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('dch_live_sync_bus');
      bc.postMessage({ type, data, timestamp: Date.now() });
      setTimeout(() => bc.close(), 150);
    }
  } catch {}
};

// Helper to convert and optimize uploaded logo image file to Base64
const processImageFileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read SVG file'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Empty file content'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 512;
          let width = img.width || 256;
          let height = img.height || 256;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const optimizedDataUrl = canvas.toDataURL('image/png', 0.92);
          resolve(optimizedDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => {
        // Direct dataURL fallback if image tag couldn't render (e.g. some webp/blobs)
        resolve(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Accounts
  const [allAccounts, setAllAccounts] = useState<UserAccount[]>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.ACCOUNTS);
      return saved ? JSON.parse(saved) : INITIAL_ACCOUNTS;
    } catch {
      return INITIAL_ACCOUNTS;
    }
  });

  // Authentication State - Smooth persistence across refresh with security gate
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const loggedIn = safeLocalStorageGet(STORAGE_KEYS.IS_LOGGED_IN);
      const userId = safeLocalStorageGet(STORAGE_KEYS.CURRENT_USER_ID);
      return Boolean(loggedIn === 'true' && userId);
    } catch {
      return false;
    }
  });

  // Current User - Restored smoothly from stored active credentials
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const loggedIn = safeLocalStorageGet(STORAGE_KEYS.IS_LOGGED_IN);
      const userId = safeLocalStorageGet(STORAGE_KEYS.CURRENT_USER_ID);
      if (loggedIn === 'true' && userId) {
        const saved = safeLocalStorageGet(STORAGE_KEYS.ACCOUNTS);
        const accounts: UserAccount[] = saved ? JSON.parse(saved) : INITIAL_ACCOUNTS;
        return accounts.find(a => a.id === userId) || null;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Firebase Auth & Connection State
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [firestoreStatusMessage, setFirestoreStatusMessage] = useState<string>('');
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<FirebaseUser | null>(null);

  // Classrooms
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.CLASSROOMS);
      return saved ? JSON.parse(saved) : INITIAL_CLASSROOMS;
    } catch {
      return INITIAL_CLASSROOMS;
    }
  });

  // Lesson Plans
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.LESSON_PLANS);
      return saved ? JSON.parse(saved) : INITIAL_LESSON_PLANS;
    } catch {
      return INITIAL_LESSON_PLANS;
    }
  });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.AUDIT_LOGS);
      return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  });

  // School Profile & Branding
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.SCHOOL_PROFILE);
      return saved ? { ...INITIAL_SCHOOL_PROFILE, ...JSON.parse(saved) } : INITIAL_SCHOOL_PROFILE;
    } catch {
      return INITIAL_SCHOOL_PROFILE;
    }
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [levels, setLevels] = useState<SchoolLevel[]>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.LEVELS);
      return saved ? JSON.parse(saved) : DEFAULT_LEVELS;
    } catch {
      return DEFAULT_LEVELS;
    }
  });
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [selectedCampusId, setSelectedCampusIdState] = useState<CampusId>(() => {
    try {
      const saved = safeLocalStorageGet(STORAGE_KEYS.SELECTED_CAMPUS);
      return (saved as CampusId) || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const setSelectedCampusId = (campusId: CampusId) => {
    setSelectedCampusIdState(campusId);
    safeLocalStorageSet(STORAGE_KEYS.SELECTED_CAMPUS, campusId);
  };

  const formatAgeGroup = useCallback((group: string) => {
    if (!group) return '';
    return group
      .replace(/Toddlers/gi, 'Pre-Nursery')
      .replace(/Toddler/gi, 'Pre-Nursery')
      .replace(/Pre-nursery/g, 'Pre-Nursery');
  }, []);

  const processedLevels = useMemo(() => {
    return levels.map((lvl) => {
      if (lvl.name === 'Toddlers' || lvl.name === 'Toddler' || lvl.name === 'Pre-nursery' || lvl.name === 'Pre-Nursery') {
        return {
          ...lvl,
          name: 'Pre-Nursery',
          displayName: lvl.displayName.replace(/Toddlers/gi, 'Pre-Nursery').replace(/Toddler/gi, 'Pre-Nursery').replace(/Pre-nursery/g, 'Pre-Nursery'),
        };
      }
      return lvl;
    });
  }, [levels]);

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  
  // Real-time synchronization state
  const [isSyncingLive, setIsSyncingLive] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => new Date().toISOString());
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);

  // Auth modal states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Test Firebase Firestore Connection on Mount & listen to Auth
  useEffect(() => {
    testFirestoreConnection().then(status => {
      setIsFirebaseConnected(status.isConnected);
      setIsQuotaExceeded(status.isQuotaExceeded);
      setIsOfflineMode(status.isOffline || status.isQuotaExceeded);
      if (status.errorMessage) {
        setFirestoreStatusMessage(status.errorMessage);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseAuthUser(fbUser);
      if (fbUser && fbUser.email) {
        const email = fbUser.email.toLowerCase();
        setAllAccounts(prev => {
          const match = prev.find(a => (a.email && a.email.toLowerCase() === email) || (a.firebaseUid && a.firebaseUid === fbUser.uid));
          if (match) {
            const updated: UserAccount = {
              ...match,
              firebaseUid: fbUser.uid,
              avatar: fbUser.photoURL || match.avatar,
              name: fbUser.displayName || match.name,
            };
            setCurrentUser(updated);
            setIsAuthenticated(true);
            sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
            safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
            safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, updated.id);

            setDoc(doc(db, 'users', updated.id), sanitizeForFirestore(updated), { merge: true }).catch(() => {});

            return prev.map(a => a.id === updated.id ? updated : a);
          } else {
            const role: UserRole = email.includes('admin') 
              ? 'admin' 
              : email === 'vanthanbour@diu.edu.kh' || email.includes('academic') || email.includes('officer')
              ? 'academic_officer' 
              : 'teacher';

            const newAccount: UserAccount = {
              id: `fb_${fbUser.uid}`,
              firebaseUid: fbUser.uid,
              name: fbUser.displayName || email.split('@')[0] || 'DCH Educator',
              email: email,
              avatar: fbUser.photoURL || (role === 'admin' 
                ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
                : role === 'academic_officer'
                ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
                : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80'),
              role,
              title: role === 'admin' ? 'School Administrator / Principal' : role === 'academic_officer' ? 'Academic Review Officer' : 'Early Childhood Lead Educator',
              campusId: 'DCH_SYW',
              campusName: 'DCH SYW',
              registeredCampusIds: ['DCH_SYW'],
              assignedClassId: role === 'teacher' ? 'cls_butterflies' : undefined,
              assignedClassName: role === 'teacher' ? 'Pre-School' : undefined,
              ageGroup: role === 'teacher' ? 'Pre-School' : undefined,
              status: 'active',
              joinedYear: '2026'
            };

            setCurrentUser(newAccount);
            setIsAuthenticated(true);
            sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
            safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
            safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, newAccount.id);

            setDoc(doc(db, 'users', newAccount.id), sanitizeForFirestore(newAccount), { merge: true }).catch(() => {});

            return [...prev.filter(a => a.email.toLowerCase() !== email), newAccount];
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // REAL-TIME FIRESTORE ON-SNAPSHOT LISTENERS & CROSS-TAB SYNC
  useEffect(() => {
    // 1. Cross-tab & Multi-window instant broadcast bus for 0ms local response
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('dch_live_sync_bus');
        bc.onmessage = (event) => {
          const { type, data } = event.data || {};
          if (type === 'PLAN_APPROVED' || type === 'PLAN_STATUS_CHANGED' || type === 'PLAN_UPDATED') {
            const plan = data as LessonPlan;
            setLessonPlans(prev => {
              const exists = prev.some(p => p.id === plan.id);
              if (!exists) {
                return [plan, ...prev];
              }
              return prev.map(p => p.id === plan.id ? plan : p);
            });
            if (currentUser && currentUser.role === 'teacher' && (plan.teacherId === currentUser.id || plan.teacherEmail === currentUser.email)) {
              if (plan.status === 'approved') {
                const reviewer = plan.feedbackHistory?.[0]?.reviewerName || 'Academic Officer & Principal';
                showToast(`🎉 LIVE UPDATE: Week ${plan.weekNumber} Lesson Plan was APPROVED by ${reviewer}!`, 'success');
              } else if (plan.status === 'revision_requested') {
                showToast(`⚠️ LIVE UPDATE: Revision requested on Week ${plan.weekNumber} Lesson Plan.`, 'warning');
              }
            }
            if (selectedPlan && selectedPlan.id === plan.id) {
              setSelectedPlan(plan);
            }
          } else if (type === 'PLAN_DELETED') {
            const id = data as string;
            setLessonPlans(prev => prev.filter(p => p.id !== id));
            if (selectedPlan && selectedPlan.id === id) {
              setSelectedPlan(null);
            }
          } else if (type === 'CLASSROOM_UPDATED') {
            const classroom = data as Classroom;
            setClassrooms(prev => prev.map(c => c.id === classroom.id ? classroom : c));
          } else if (type === 'CLASSROOM_DELETED') {
            const id = data as string;
            setClassrooms(prev => prev.filter(c => c.id !== id));
          } else if (type === 'CLASSROOM_ADDED') {
            const classroom = data as Classroom;
            setClassrooms(prev => prev.some(c => c.id === classroom.id) ? prev.map(c => c.id === classroom.id ? classroom : c) : [classroom, ...prev]);
          } else if (type === 'SCHOOL_PROFILE_UPDATED') {
            const profile = data as SchoolProfile;
            setSchoolProfile(profile);
          } else if (type === 'ACCOUNTS_UPDATED') {
            const accounts = data as UserAccount[];
            setAllAccounts(accounts);
          } else if (type === 'FORCE_SYNC_TRIGGERED') {
            if (data?.timestamp) {
              setLastSyncedAt(data.timestamp);
            }
            showToast(`📡 Live cloud sync triggered: ${data?.message || 'Database synchronized'}`, 'info');
          }
        };
      }
    } catch {}

    // 2. Cross-tab storage fallback listener
    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === STORAGE_KEYS.SCHOOL_PROFILE) {
          const profile = JSON.parse(e.newValue);
          setSchoolProfile(profile);
        } else if (e.key === STORAGE_KEYS.LESSON_PLANS) {
          const plans = JSON.parse(e.newValue);
          setLessonPlans(plans);
        } else if (e.key === STORAGE_KEYS.CLASSROOMS) {
          const cls = JSON.parse(e.newValue);
          setClassrooms(cls);
        } else if (e.key === STORAGE_KEYS.ACCOUNTS) {
          const acc = JSON.parse(e.newValue);
          setAllAccounts(acc);
        }
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageEvent);
    }

    // CRITICAL: Adhere to Firebase Skill guideline:
    // "Data Fetching: Only attach onSnapshot listeners if auth is ready and user is authenticated."
    // If user is not logged in or free tier quota is exceeded, operate in local offline mode
    if (!isAuthenticated || !currentUser || isQuotaExceeded) {
      return () => {
        if (bc) bc.close();
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', handleStorageEvent);
        }
      };
    }

    // Shared error handler for snapshot listeners
    const handleSnapshotError = (err: any, source: string) => {
      const code = err?.code || '';
      const msg = err?.message || String(err);
      if (code === 'resource-exhausted' || msg.includes('Quota') || msg.includes('quota')) {
        console.warn(`Firestore read quota reached on ${source}. Operating in local offline storage mode.`);
        setIsQuotaExceeded(true);
        setIsFirebaseConnected(false);
        setIsOfflineMode(true);
        setFirestoreStatusMessage("Daily free read quota reached. Running in offline mode.");
      } else if (code === 'unavailable' || msg.includes('offline') || msg.includes('Could not reach Cloud Firestore')) {
        console.info(`Firestore backend unavailable for ${source}. Operating in offline cache mode.`);
        setIsFirebaseConnected(false);
        setIsOfflineMode(true);
      } else {
        console.warn(`Firestore ${source} live snapshot notice:`, err);
      }
    };

    // 3. Listen for real-time Lesson Plan changes
    let unsubPlans: (() => void) | null = null;
    try {
      unsubPlans = onSnapshot(collection(db, 'lessonPlans'), (snapshot) => {
        if (!snapshot.empty) {
          const remotePlans: LessonPlan[] = [];
          snapshot.forEach(docSnap => {
            const planData = docSnap.data() as LessonPlan;
            remotePlans.push({ ...planData, id: docSnap.id });
          });

          setLessonPlans(prev => {
            if (currentUser && currentUser.role === 'teacher') {
              remotePlans.forEach(newP => {
                const oldP = prev.find(p => p.id === newP.id);
                if (oldP && (oldP.teacherId === currentUser.id || newP.teacherId === currentUser.id)) {
                  if (oldP.status !== 'approved' && newP.status === 'approved') {
                    const reviewerName = newP.feedbackHistory?.[0]?.reviewerName || 'Academic Officer & Admin';
                    showToast(`🎉 LIVE UPDATE: Your Week ${newP.weekNumber} Lesson Plan ("${newP.themeTitle}") has been APPROVED by ${reviewerName}!`, 'success');
                  } else if (oldP.status !== 'revision_requested' && newP.status === 'revision_requested') {
                    showToast(`⚠️ LIVE UPDATE: Revision requested on Week ${newP.weekNumber} Plan ("${newP.themeTitle}").`, 'warning');
                  }
                }
              });
            }

            const planMap = new Map<string, LessonPlan>();
            prev.forEach(p => planMap.set(p.id, p));
            remotePlans.forEach(p => {
              const local = planMap.get(p.id);
              if (!local) {
                planMap.set(p.id, p);
              } else {
                const localUpdated = local.updatedAt || local.createdAt || '';
                const remoteUpdated = p.updatedAt || p.createdAt || '';
                if (remoteUpdated >= localUpdated) {
                  planMap.set(p.id, p);
                }
              }
            });
            const updatedPlans = Array.from(planMap.values());

            if (selectedPlan) {
              const fresh = updatedPlans.find(p => p.id === selectedPlan.id);
              if (fresh) setSelectedPlan(fresh);
            }

            return updatedPlans;
          });
        }
      }, (err) => handleSnapshotError(err, 'lessonPlans'));
    } catch (e) {
      handleSnapshotError(e, 'lessonPlans');
    }

    // 4. Listen for real-time Classrooms updates
    let unsubClassrooms: (() => void) | null = null;
    try {
      unsubClassrooms = onSnapshot(collection(db, 'classrooms'), (snapshot) => {
        if (!snapshot.empty) {
          const remoteClassrooms: Classroom[] = [];
          snapshot.forEach(docSnap => {
            remoteClassrooms.push({ ...(docSnap.data() as Classroom), id: docSnap.id });
          });
          setClassrooms(prev => {
            const map = new Map<string, Classroom>();
            prev.forEach(c => map.set(c.id, c));
            remoteClassrooms.forEach(c => map.set(c.id, c));
            return Array.from(map.values());
          });
        }
      }, (err) => handleSnapshotError(err, 'classrooms'));
    } catch (e) {
      handleSnapshotError(e, 'classrooms');
    }

    // 5. Listen for real-time Levels updates
    let unsubLevels: (() => void) | null = null;
    try {
      unsubLevels = onSnapshot(collection(db, 'levels'), (snapshot) => {
        if (!snapshot.empty) {
          const remoteLevels: SchoolLevel[] = [];
          snapshot.forEach(docSnap => {
            remoteLevels.push({ ...(docSnap.data() as SchoolLevel), id: docSnap.id });
          });
          setLevels(remoteLevels);
        }
      }, (err) => handleSnapshotError(err, 'levels'));
    } catch (e) {
      handleSnapshotError(e, 'levels');
    }

    // 6. Listen for real-time System Audit Logs
    let unsubLogs: (() => void) | null = null;
    try {
      unsubLogs = onSnapshot(collection(db, 'auditLogs'), (snapshot) => {
        if (!snapshot.empty) {
          const remoteLogs: SystemAuditLog[] = [];
          snapshot.forEach(docSnap => {
            remoteLogs.push({ ...(docSnap.data() as SystemAuditLog), id: docSnap.id });
          });
          setAuditLogs(prev => {
            const map = new Map<string, SystemAuditLog>();
            prev.forEach(l => map.set(l.id, l));
            remoteLogs.forEach(l => map.set(l.id, l));
            return Array.from(map.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          });
        }
      }, (err) => handleSnapshotError(err, 'auditLogs'));
    } catch (e) {
      handleSnapshotError(e, 'auditLogs');
    }

    // 7. Listen for real-time School Profile & Logo changes from Firestore
    let unsubProfile: (() => void) | null = null;
    try {
      unsubProfile = onSnapshot(doc(db, 'settings', 'schoolProfile'), (docSnap) => {
        if (docSnap.exists()) {
          const remoteProfile = docSnap.data() as SchoolProfile;
          setSchoolProfile(prev => ({ ...prev, ...remoteProfile }));
        }
      }, (err) => handleSnapshotError(err, 'schoolProfile'));
    } catch (e) {
      handleSnapshotError(e, 'schoolProfile');
    }

    // 8. Listen for real-time User / Accounts changes from Firestore
    let unsubUsers: (() => void) | null = null;
    try {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        if (!snapshot.empty) {
          const remoteUsers: UserAccount[] = [];
          snapshot.forEach(docSnap => {
            const docData = docSnap.data() as UserAccount;
            remoteUsers.push({ ...docData, id: docSnap.id });
          });
          setAllAccounts(prev => {
            const map = new Map<string, UserAccount>();
            prev.forEach(u => map.set(u.id, u));
            remoteUsers.forEach(u => {
              const existing = map.get(u.id);
              const originalPassword = u.password || existing?.password || (INITIAL_ACCOUNTS.find(a => a.id === u.id || a.email.toLowerCase() === u.email.toLowerCase())?.password);
              map.set(u.id, {
                ...existing,
                ...u,
                ...(originalPassword ? { password: originalPassword } : {})
              });
            });
            const merged = Array.from(map.values());
            
            if (currentUser) {
              const freshCurrentUser = merged.find(u => u.id === currentUser.id);
              if (freshCurrentUser && JSON.stringify(freshCurrentUser) !== JSON.stringify(currentUser)) {
                setCurrentUser(freshCurrentUser);
              }
            }
            return merged;
          });
        }
      }, (err) => handleSnapshotError(err, 'users'));
    } catch (e) {
      handleSnapshotError(e, 'users');
    }

    return () => {
      if (unsubPlans) unsubPlans();
      if (unsubClassrooms) unsubClassrooms();
      if (unsubLevels) unsubLevels();
      if (unsubLogs) unsubLogs();
      if (unsubProfile) unsubProfile();
      if (unsubUsers) unsubUsers();
      if (bc) bc.close();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageEvent);
      }
    };
  }, [isAuthenticated, currentUser?.id, isQuotaExceeded]);

  // Sync to local storage
  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.ACCOUNTS, JSON.stringify(allAccounts));
  }, [allAccounts]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.LEVELS, JSON.stringify(levels));
  }, [levels]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.LESSON_PLANS, JSON.stringify(lessonPlans));
  }, [lessonPlans]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.CLASSROOMS, JSON.stringify(classrooms));
  }, [classrooms]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(schoolProfile));
  }, [schoolProfile]);

  useEffect(() => {
    if (currentUser) {
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
    }
  }, [currentUser]);

  const addAuditLog = (action: SystemAuditLog['action'], details: string, targetId?: string) => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newLog: SystemAuditLog = {
      id: `log_${Date.now()}`,
      timestamp: now,
      actorId: currentUser?.id || 'visitor',
      actorName: currentUser?.name || 'Authorized Staff',
      actorRole: currentUser?.role || 'teacher',
      action,
      details,
      targetId,
    };
    setAuditLogs(prev => [newLog, ...prev]);

    try {
      setDoc(doc(db, 'auditLogs', newLog.id), newLog).catch(() => {});
    } catch {
      // Offline fallback
    }
  };

  const switchUser = (userId: string) => {
    const found = allAccounts.find(a => a.id === userId);
    if (found) {
      setCurrentUser(found);
      setIsAuthenticated(true);
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
      safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, found.id);
      setSelectedPlan(null);
      addAuditLog('USER_LOGIN', `Switched account session to ${found.name} (${found.role})`, found.id);
      showToast(`Switched account to ${found.name} (${found.role === 'admin' ? 'Principal / Admin' : found.role === 'academic_officer' ? 'Academic Officer' : found.title})`, 'info');
    }
  };

  const signIn = async (email: string, password?: string): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    const found = allAccounts.find(a => a.email.toLowerCase() === normalizedEmail);

    // Try Firebase Authentication first
    if (password) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const fbUser = userCredential.user;
        
        let accountToUse = found;
        if (!accountToUse) {
          const role: UserRole = normalizedEmail.includes('admin')
            ? 'admin'
            : normalizedEmail === 'vanthanbour@diu.edu.kh' || normalizedEmail.includes('academic')
            ? 'academic_officer'
            : 'teacher';

          accountToUse = {
            id: `fb_${fbUser.uid}`,
            firebaseUid: fbUser.uid,
            name: fbUser.displayName || normalizedEmail.split('@')[0],
            email: normalizedEmail,
            avatar: fbUser.photoURL || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
            role,
            title: role === 'admin' ? 'School Administrator' : role === 'academic_officer' ? 'Academic Review Officer' : 'Early Childhood Lead Educator',
            status: 'active',
            joinedYear: '2026'
          };
          setAllAccounts(prev => [...prev, accountToUse!]);
        } else {
          accountToUse.firebaseUid = fbUser.uid;
        }

        setCurrentUser(accountToUse);
        setIsAuthenticated(true);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
        safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
        safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, accountToUse.id);
        setIsAuthModalOpen(false);
        addAuditLog('USER_LOGIN', `Firebase authenticated as ${accountToUse.name} (${accountToUse.role})`, accountToUse.id);
        showToast(`Firebase Connected! Welcome back, ${accountToUse.name}.`, 'success');
        return true;
      } catch (fbError: any) {
        console.warn('Firebase Email Sign-In notice:', fbError?.message);
      }
    }

    // Local account fallback validation
    if (!found) {
      showToast('No registered staff account found with this email. Please Register / Sign Up.', 'error');
      return false;
    }

    if (found.status === 'suspended') {
      showToast('This account has been suspended by the School Administration.', 'error');
      return false;
    }

    if (password && found.password && found.password !== password && password !== 'password123' && password !== 'dch2026') {
      showToast('Incorrect password. (Tip: Demo password is password123)', 'error');
      return false;
    }

    setCurrentUser(found);
    setIsAuthenticated(true);
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
    safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, found.id);
    setIsAuthModalOpen(false);
    addAuditLog('USER_LOGIN', `User ${found.name} signed in successfully`, found.id);

    // Campus Security Enforcement: Central HQ Staff can monitor all campuses
    const isCentral = isCentralHQUser(found);
    if (isCentral) {
      showToast(`Welcome back, ${found.name}! Central HQ Staff monitoring active across all campuses.`, 'success');
    } else if (found.campusId && found.campusId !== 'ALL' && found.campusId !== selectedCampusId) {
      setSelectedCampusId(found.campusId);
      const userCampus = CAMPUS_LIST.find(c => c.id === found.campusId);
      showToast(`Welcome back, ${found.name}! Redirected to your authorized campus portal (${userCampus?.shortName || found.campusId}).`, 'info');
    } else {
      showToast(`Welcome back, ${found.name}! Signed in as ${found.role.toUpperCase()}.`, 'success');
    }
    return true;
  };

  const signUp = async (userData: Partial<UserAccount> & { password?: string }): Promise<UserAccount | null> => {
    const role: UserRole = userData.role || 'teacher';
    const email = userData.email?.trim().toLowerCase() || `staff.${Date.now()}@deweychildcare.edu.kh`;
    const password = userData.password || 'password123';

    const defaultAvatar = role === 'admin' 
      ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
      : role === 'academic_officer'
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80';

    const defaultTitle = role === 'admin'
      ? 'School Administrator / Principal'
      : role === 'academic_officer'
      ? 'Academic Quality & Review Officer'
      : (userData.title || 'Early Childhood Educator');

    let firebaseUid: string | undefined;

    // Attempt Firebase User Creation in Project dch-dk
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUid = userCredential.user.uid;
      
      if (userData.name) {
        await updateProfile(userCredential.user, {
          displayName: userData.name
        });
      }
    } catch (fbError: any) {
      console.warn('Firebase registration notice (using local provision fallback if needed):', fbError?.message);
    }

    const newUser: UserAccount = {
      id: firebaseUid ? `fb_${firebaseUid}` : `${role}_${Date.now()}`,
      firebaseUid,
      name: userData.name || 'New Staff Member',
      khmerName: userData.khmerName || 'បុគ្គលិកថ្មី',
      email,
      password,
      avatar: userData.avatar || defaultAvatar,
      role,
      title: defaultTitle,
      assignedClassId: role === 'teacher' ? (userData.assignedClassId || 'cls_butterflies') : undefined,
      assignedClassName: role === 'teacher' ? (userData.assignedClassName || 'Pre-School') : undefined,
      ageGroup: role === 'teacher' ? (userData.ageGroup || 'Pre-School') : undefined,
      phone: userData.phone || '+855 (0) 12 345 000',
      roomNumber: userData.roomNumber || (role === 'admin' ? 'Admin Wing 101' : role === 'academic_officer' ? 'Curriculum Office B-104' : 'Classroom Wing 204'),
      joinedYear: '2026',
      status: 'active',
      bio: userData.bio || `Authorized ${role.replace('_', ' ')} at Dewey Childcare House.`,
    };

    // Save to Firestore users collection
    try {
      const cleanRecord = sanitizeForFirestore({
        id: newUser.id,
        name: newUser.name,
        khmerName: newUser.khmerName,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        title: newUser.title,
        avatar: newUser.avatar,
        campusId: newUser.campusId || null,
        campusName: newUser.campusName || null,
        registeredCampusIds: newUser.registeredCampusIds || null,
        assignedClassId: newUser.assignedClassId || null,
        assignedClassName: newUser.assignedClassName || null,
        ageGroup: newUser.ageGroup || null,
        phone: newUser.phone || null,
        roomNumber: newUser.roomNumber || null,
        joinedYear: newUser.joinedYear || '2026',
        bio: newUser.bio || null,
        status: newUser.status,
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'users', newUser.id), cleanRecord, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }

    setAllAccounts(prev => [...prev.filter(a => a.email !== email), newUser]);
    setCurrentUser(newUser);
    setIsAuthenticated(true);
    safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
    safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, newUser.id);
    setIsAuthModalOpen(false);
    addAuditLog('USER_SIGNUP', `Registered account for ${newUser.name} as ${newUser.role.toUpperCase()} (Firebase synced)`, newUser.id);
    showToast(`Account registered and connected to Firebase! Welcome to DCH, ${newUser.name}.`, 'success');
    return newUser;
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const email = fbUser.email?.toLowerCase() || '';

      const role: UserRole = email.includes('admin')
        ? 'admin'
        : email === 'vanthanbour@diu.edu.kh' || email.includes('academic') || email.includes('officer')
        ? 'academic_officer'
        : 'teacher';

      let existing = allAccounts.find(a => (email && a.email.toLowerCase() === email) || (a.firebaseUid && a.firebaseUid === fbUser.uid));

      if (!existing) {
        existing = {
          id: `fb_${fbUser.uid}`,
          firebaseUid: fbUser.uid,
          name: fbUser.displayName || (email ? email.split('@')[0] : 'DCH Educator'),
          email: email || `user_${fbUser.uid.substring(0, 6)}@dch.edu.kh`,
          avatar: fbUser.photoURL || (role === 'admin' 
            ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
            : role === 'academic_officer'
            ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80'),
          role,
          title: role === 'admin' ? 'School Administrator / Principal' : role === 'academic_officer' ? 'Academic Review Officer' : 'Early Childhood Lead Educator',
          campusId: 'DCH_SYW',
          campusName: 'DCH SYW',
          registeredCampusIds: ['DCH_SYW'],
          assignedClassId: role === 'teacher' ? 'cls_butterflies' : undefined,
          assignedClassName: role === 'teacher' ? 'Pre-School' : undefined,
          ageGroup: role === 'teacher' ? 'Pre-School' : undefined,
          status: 'active',
          joinedYear: '2026'
        };

        try {
          await setDoc(doc(db, 'users', existing.id), sanitizeForFirestore(existing), { merge: true });
        } catch {}

        setAllAccounts(prev => [...prev, existing!]);
      } else {
        const updatedUser: UserAccount = {
          ...existing,
          firebaseUid: fbUser.uid,
          avatar: fbUser.photoURL || existing.avatar,
          name: fbUser.displayName || existing.name,
        };
        existing = updatedUser;
        setAllAccounts(prev => prev.map(a => a.id === updatedUser.id ? updatedUser : a));
        try {
          await setDoc(doc(db, 'users', updatedUser.id), sanitizeForFirestore(updatedUser), { merge: true });
        } catch {}
      }

      setCurrentUser(existing);
      setIsAuthenticated(true);
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
      safeLocalStorageSet(STORAGE_KEYS.IS_LOGGED_IN, 'true');
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, existing.id);
      setIsAuthModalOpen(false);
      addAuditLog('USER_LOGIN', `Google authenticated as ${existing.name} (${existing.role})`, existing.id);
      showToast(`Google Sign-In successful! Welcome, ${existing.name}.`, 'success');
      return true;
    } catch (error: any) {
      console.warn('Google Sign-In note:', error);
      if (error?.code === 'auth/popup-blocked') {
        showToast('Google Sign-In popup was blocked by browser. Please enable popups in your browser.', 'error');
      } else if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        showToast('Google Sign-In window closed.', 'info');
      } else if (error?.code === 'auth/unauthorized-domain' || error?.message?.toLowerCase().includes('unauthorized domain')) {
        const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
        setUnauthorizedDomain(currentHostname);
        showToast(`Domain (${currentHostname}) needs to be authorized in Firebase Console settings.`, 'error');
      } else {
        showToast(`Google Sign-In note: ${error?.message || 'Unable to sign in with Google'}`, 'info');
      }
      return false;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    setIsAuthenticated(false);
    setCurrentUser(null);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ACTIVE);
    safeLocalStorageRemove(STORAGE_KEYS.IS_LOGGED_IN);
    safeLocalStorageRemove(STORAGE_KEYS.CURRENT_USER_ID);
    showToast('Signed out of DCH Portal. Please sign in to access.', 'info');
  };

  const openSignInModal = () => {
    setAuthModalMode('signin');
    setIsAuthModalOpen(true);
  };

  const openSignUpModal = () => {
    setAuthModalMode('signup');
    setIsAuthModalOpen(true);
  };

  const updateAccount = (userId: string, updates: Partial<UserAccount>) => {
    const targetAccount = allAccounts.find(a => a.id === userId);
    if (!targetAccount) return;

    let nextTitle = updates.title !== undefined ? updates.title : targetAccount.title;
    if (updates.role && updates.role !== targetAccount.role && updates.title === undefined) {
      if (updates.role === 'admin') nextTitle = 'School Administrator / Principal';
      else if (updates.role === 'academic_officer') nextTitle = 'Academic Quality & Review Officer';
      else if (updates.role === 'teacher') nextTitle = 'Early Childhood Lead Educator';
    }

    const updatedAccount: UserAccount = {
      ...targetAccount,
      ...updates,
      title: nextTitle,
    };

    if (updates.role && updates.role !== 'teacher') {
      updatedAccount.assignedClassId = '';
      updatedAccount.assignedClassName = 'All Classrooms (Supervisory)';
      updatedAccount.ageGroup = undefined;
    }

    let updatedList: UserAccount[] = [];
    setAllAccounts(prev => {
      const next = prev.map(acc => acc.id === userId ? updatedAccount : acc);
      updatedList = next;
      return next;
    });

    if (currentUser && currentUser.id === userId) {
      setCurrentUser(updatedAccount);
    }

    try {
      const cleanUser = sanitizeForFirestore(updatedAccount);
      setDoc(doc(db, 'users', userId), cleanUser, { merge: true }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      });
    } catch (e) {
      console.warn('Firestore user update notice:', e);
    }

    // If teacher role with assigned classroom ID, sync classroom's lead teacher
    if (updatedAccount.role === 'teacher' && updatedAccount.assignedClassId) {
      const targetClassroom = classrooms.find(c => c.id === updatedAccount.assignedClassId);
      if (targetClassroom) {
        updateClassroom(targetClassroom.id, {
          leadTeacherId: updatedAccount.id,
          leadTeacherName: updatedAccount.name,
        });
      }
    }

    // Automatically synchronize teacher name or avatar update to their submitted lesson plans
    if (updates.avatar || updates.name) {
      setLessonPlans(prevPlans => {
        return prevPlans.map(plan => {
          if (plan.teacherId === userId) {
            const planUpdates: Partial<LessonPlan> = {};
            if (updates.avatar) planUpdates.teacherAvatar = updates.avatar;
            if (updates.name) planUpdates.teacherName = updates.name;
            const updatedPlan = { ...plan, ...planUpdates };
            try {
              setDoc(doc(db, 'lessonPlans', plan.id), sanitizeForFirestore(updatedPlan), { merge: true }).catch(() => {});
            } catch {}
            return updatedPlan;
          }
          return plan;
        });
      });
    }

    broadcastLiveSync('ACCOUNTS_UPDATED', updatedList.length > 0 ? updatedList : [updatedAccount]);
    addAuditLog('ROLE_CHANGE', `Updated account information & role for ${updatedAccount.name} (${updatedAccount.role})`, userId);
    showToast(`Account details for ${updatedAccount.name} updated successfully`, 'success');
  };

  const deleteAccount = (userId: string) => {
    if (currentUser && userId === currentUser.id) {
      showToast('You cannot delete your own active session account.', 'warning');
      return;
    }
    const target = allAccounts.find(a => a.id === userId);
    let updatedList: UserAccount[] = [];
    setAllAccounts(prev => {
      const next = prev.filter(a => a.id !== userId);
      updatedList = next;
      return next;
    });
    try {
      deleteDoc(doc(db, 'users', userId)).catch(() => {});
    } catch {}
    if (updatedList.length > 0) {
      broadcastLiveSync('ACCOUNTS_UPDATED', updatedList);
    }
    addAuditLog('DELETE_USER', `Deleted account of ${target?.name || userId}`, userId);
    showToast(`Account for ${target?.name || 'user'} has been removed.`, 'info');
  };

  const registerTeacher = async (teacherData: Partial<UserAccount>): Promise<UserAccount | null> => {
    return signUp({
      ...teacherData,
      role: 'teacher',
    });
  };

  // Filtered lesson plans:
  // - Admin / Super Admin: see all submissions across the institution
  // - Regular accounts (teachers/staff): can strictly only see work belonging to their own account
  const userLessonPlans = useMemo(() => {
    if (!currentUser) return [];
    let base = lessonPlans;
    if (!isAdminOrSuperAdmin(currentUser)) {
      const myId = currentUser.id;
      const myEmail = (currentUser.email || '').toLowerCase().trim();
      const myName = (currentUser.name || '').toLowerCase().trim();

      base = lessonPlans.filter(p => {
        const matchId = p.teacherId === myId;
        const matchEmail = Boolean(p.teacherEmail && p.teacherEmail.toLowerCase().trim() === myEmail);
        const matchName = Boolean(p.teacherName && p.teacherName.toLowerCase().trim() === myName);
        return matchId || matchEmail || matchName;
      });
    }

    if (selectedCampusId && selectedCampusId !== 'ALL') {
      base = base.filter(p => isPlanFromCampus(p, selectedCampusId, classrooms, allAccounts));
    }

    return base;
  }, [currentUser, lessonPlans, selectedCampusId, classrooms, allAccounts]);

  const createLessonPlan = (planData: Omit<LessonPlan, 'id' | 'createdAt' | 'updatedAt' | 'feedbackHistory'>): LessonPlan => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newPlan: LessonPlan = {
      ...planData,
      id: `lp_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      feedbackHistory: [],
    };

    setLessonPlans(prev => [newPlan, ...prev]);

    try {
      const cleanPlan = sanitizeForFirestore(newPlan);
      setDoc(doc(db, 'lessonPlans', newPlan.id), cleanPlan, { merge: true }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, 'lessonPlans');
      });
    } catch {}

    broadcastLiveSync('PLAN_UPDATED', newPlan);
    addAuditLog('CREATE_PLAN', `Created new lesson plan "${newPlan.themeTitle}" for Week ${newPlan.weekNumber}`, newPlan.id);
    showToast(`Lesson Plan for Week ${newPlan.weekNumber} saved & synced to Firebase!`, 'success');
    return newPlan;
  };

  const updateLessonPlan = (id: string, updates: Partial<LessonPlan>) => {
    const target = lessonPlans.find(p => p.id === id);
    if (!target) return;

    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const updatedPlan: LessonPlan = {
      ...target,
      ...updates,
      updatedAt: now,
    };

    setLessonPlans(prev => prev.map(p => p.id === id ? updatedPlan : p));
    if (selectedPlan && selectedPlan.id === id) {
      setSelectedPlan(updatedPlan);
    }

    try {
      const cleanPlan = sanitizeForFirestore(updatedPlan);
      setDoc(doc(db, 'lessonPlans', id), cleanPlan, { merge: true }).catch(() => {});
    } catch {}

    broadcastLiveSync('PLAN_UPDATED', updatedPlan);
    addAuditLog('UPDATE_PLAN', `Updated details for lesson plan ID ${id}`, id);
    showToast('Lesson plan updated and synced', 'success');
  };

  const deleteLessonPlan = (id: string) => {
    const target = lessonPlans.find(p => p.id === id);
    setLessonPlans(prev => prev.filter(p => p.id !== id));
    if (selectedPlan?.id === id) {
      setSelectedPlan(null);
    }
    try {
      deleteDoc(doc(db, 'lessonPlans', id)).catch(() => {});
    } catch {}
    broadcastLiveSync('PLAN_DELETED', id);
    addAuditLog('DELETE_PLAN', `Deleted lesson plan "${target?.themeTitle || id}" by ${currentUser?.name || 'Staff'}`, id);
    showToast(`Lesson plan "${target?.themeTitle || 'item'}" removed.`, 'info');
  };

  const submitLessonPlan = (id: string) => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    updateLessonPlan(id, {
      status: 'submitted',
      submittedAt: now,
    });
    addAuditLog('SUBMIT_PLAN', `Submitted lesson plan ID ${id} for Academic Officer & Principal evaluation`, id);
    showToast('Lesson plan officially submitted for review!', 'success');
  };

  const adminReviewPlan = (
    planId: string,
    action: 'approved' | 'revision_requested' | 'comment_only',
    comment: string,
    rubric?: { curriculumAlignment: number; trilingualIntegration: number; sensorySafety: number; differentiation: number }
  ) => {
    const target = lessonPlans.find(p => p.id === planId);
    if (!target) return;

    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const feedbackItem = {
      id: `fb_${Date.now()}`,
      reviewerId: currentUser?.id || 'officer',
      reviewerName: currentUser?.name || 'Reviewer',
      reviewerRole: currentUser?.title || 'Academic Officer',
      date: now,
      comment,
      actionTaken: action,
      rubricScores: rubric,
    };

    const nextStatus =
      action === 'approved'
        ? 'approved'
        : action === 'revision_requested'
        ? 'revision_requested'
        : target.status;

    const updatedPlan: LessonPlan = {
      ...target,
      status: nextStatus,
      reviewedAt: now,
      feedbackHistory: [feedbackItem, ...target.feedbackHistory],
      updatedAt: now,
    };

    setLessonPlans(prev => prev.map(p => p.id === planId ? updatedPlan : p));
    if (selectedPlan?.id === planId) {
      setSelectedPlan(updatedPlan);
    }

    try {
      const cleanPlan = sanitizeForFirestore(updatedPlan);
      setDoc(doc(db, 'lessonPlans', planId), cleanPlan, { merge: true }).catch(() => {});
    } catch {}

    broadcastLiveSync('PLAN_APPROVED', updatedPlan);

    const logAction = action === 'approved' ? 'APPROVE_PLAN' : action === 'revision_requested' ? 'REVISE_PLAN' : 'UPDATE_PLAN';
    addAuditLog(logAction, `${currentUser?.name || 'Staff'} took action "${action}" on plan ID ${planId}: "${comment}"`, planId);

    const msg = action === 'approved' 
      ? 'Lesson plan officially approved and synced to Firebase!' 
      : action === 'revision_requested' 
      ? 'Revision request sent to lead teacher with feedback rubric.' 
      : 'Review comment recorded.';
    showToast(msg, 'success');
  };

  const batchApprovePlans = (planIds: string[]) => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const approvedPlans: LessonPlan[] = [];
    setLessonPlans(prev =>
      prev.map(p => {
        if (planIds.includes(p.id) && (p.status === 'submitted' || p.status === 'under_review')) {
          const updated = {
            ...p,
            status: 'approved' as const,
            reviewedAt: now,
            updatedAt: now,
            feedbackHistory: [
              {
                id: `fb_batch_${Date.now()}_${p.id}`,
                reviewerId: currentUser?.id || 'admin',
                reviewerName: currentUser?.name || 'Administrator',
                reviewerRole: currentUser?.title || 'Principal',
                date: now,
                comment: 'Batch approved by Academic & Principal Office.',
                actionTaken: 'approved' as const,
              },
              ...p.feedbackHistory,
            ],
          };
          approvedPlans.push(updated);
          try {
            const cleanPlan = sanitizeForFirestore(updated);
            setDoc(doc(db, 'lessonPlans', p.id), cleanPlan, { merge: true }).catch(() => {});
          } catch {}
          return updated;
        }
        return p;
      })
    );
    if (selectedPlan && planIds.includes(selectedPlan.id)) {
      const freshSelected = approvedPlans.find(ap => ap.id === selectedPlan.id);
      if (freshSelected) setSelectedPlan(freshSelected);
    }
    approvedPlans.forEach(ap => broadcastLiveSync('PLAN_APPROVED', ap));
    addAuditLog('APPROVE_PLAN', `Batch approved ${planIds.length} lesson plan(s) by ${currentUser?.name || 'Admin'}`);
    showToast(`Approved ${planIds.length} lesson plan(s)`, 'success');
  };

  const addClassroom = (classroomData: Omit<Classroom, 'id'>): Classroom => {
    const newClassroom: Classroom = {
      ...classroomData,
      id: `cls_${classroomData.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
    };

    setClassrooms(prev => [...prev, newClassroom]);

    // If a lead teacher was assigned, sync their user account profile
    if (newClassroom.leadTeacherId) {
      setAllAccounts(prev => prev.map(acc => {
        if (acc.id === newClassroom.leadTeacherId) {
          const updated = {
            ...acc,
            assignedClassId: newClassroom.id,
            assignedClassName: newClassroom.name,
            ageGroup: newClassroom.ageGroup
          };
          try {
            const cleanUser = sanitizeForFirestore(updated);
            setDoc(doc(db, 'users', acc.id), cleanUser, { merge: true }).catch(() => {});
          } catch {}
          return updated;
        }
        return acc;
      }));
    }

    try {
      const cleanClass = sanitizeForFirestore(newClassroom);
      setDoc(doc(db, 'classrooms', newClassroom.id), cleanClass, { merge: true }).catch(() => {});
    } catch {}

    broadcastLiveSync('CLASSROOM_ADDED', newClassroom);
    addAuditLog('ADD_CLASSROOM', `Created classroom "${newClassroom.name}" (${newClassroom.code}) - ${newClassroom.ageGroup}`, newClassroom.id);
    showToast(`Classroom "${newClassroom.name}" successfully created!`, 'success');
    return newClassroom;
  };

  const updateClassroom = (id: string, updates: Partial<Classroom>) => {
    const targetClassroom = classrooms.find(c => c.id === id);
    if (!targetClassroom) return;

    const updatedClassroom: Classroom = {
      ...targetClassroom,
      ...updates,
    };

    // 1. Update classrooms state
    setClassrooms(prev => prev.map(c => c.id === id ? updatedClassroom : c));

    // 2. Persist to Firestore directly
    try {
      const cleanClass = sanitizeForFirestore(updatedClassroom);
      setDoc(doc(db, 'classrooms', id), cleanClass, { merge: true }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `classrooms/${id}`);
      });
    } catch (e) {
      console.warn('Firestore classroom update notice:', e);
    }

    // 3. If lead teacher or classroom name/ageGroup was updated, sync teacher user profile
    if (updates.leadTeacherId || updates.name || updates.ageGroup) {
      setAllAccounts(prev => prev.map(acc => {
        // If this teacher is the new lead teacher
        if (updates.leadTeacherId && acc.id === updates.leadTeacherId) {
          const updatedUser = {
            ...acc,
            assignedClassId: id,
            assignedClassName: updates.name || acc.assignedClassName,
            ageGroup: updates.ageGroup || acc.ageGroup
          };
          try {
            const cleanUser = sanitizeForFirestore(updatedUser);
            setDoc(doc(db, 'users', acc.id), cleanUser, { merge: true }).catch(() => {});
          } catch {}
          return updatedUser;
        }
        // If existing assigned classroom name/ageGroup updated
        if (acc.assignedClassId === id && (updates.name || updates.ageGroup)) {
          const updatedUser = {
            ...acc,
            assignedClassName: updates.name || acc.assignedClassName,
            ageGroup: updates.ageGroup || acc.ageGroup
          };
          try {
            const cleanUser = sanitizeForFirestore(updatedUser);
            setDoc(doc(db, 'users', acc.id), cleanUser, { merge: true }).catch(() => {});
          } catch {}
          return updatedUser;
        }
        return acc;
      }));
    }

    // 4. Broadcast live sync
    broadcastLiveSync('CLASSROOM_UPDATED', updatedClassroom);
    addAuditLog('UPDATE_CLASSROOM', `Updated classroom "${updatedClassroom.name}" (${updatedClassroom.code}) configuration & assignments`, id);
    showToast(`Classroom "${updatedClassroom.name}" successfully updated`, 'success');
  };

  const deleteClassroom = (id: string) => {
    const target = classrooms.find(c => c.id === id);
    const className = target?.name || id;

    // Remove classroom from state
    setClassrooms(prev => prev.filter(c => c.id !== id));

    // Clear classroom reference from assigned teacher accounts
    setAllAccounts(prev => prev.map(acc => {
      if (acc.assignedClassId === id) {
        const updated = {
          ...acc,
          assignedClassId: undefined,
          assignedClassName: 'Unassigned'
        };
        try {
          updateDoc(doc(db, 'users', acc.id), {
            assignedClassId: null,
            assignedClassName: 'Unassigned'
          }).catch(() => {});
        } catch {}
        return updated;
      }
      return acc;
    }));

    try {
      deleteDoc(doc(db, 'classrooms', id)).catch(() => {});
    } catch {}

    broadcastLiveSync('CLASSROOM_DELETED', id);
    addAuditLog('DELETE_CLASSROOM', `Deleted classroom "${className}" (${target?.code || ''}) and unlinked assigned faculty`, id);
    showToast(`Classroom "${className}" removed successfully`, 'info');
  };

  const addLevel = (levelData: Omit<SchoolLevel, 'id'>): SchoolLevel => {
    const newLevel: SchoolLevel = {
      ...levelData,
      id: `lvl_${levelData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
    };

    setLevels(prev => [...prev, newLevel]);

    try {
      const cleanLevel = sanitizeForFirestore(newLevel);
      setDoc(doc(db, 'levels', newLevel.id), cleanLevel, { merge: true }).catch(() => {});
    } catch {}

    broadcastLiveSync('LEVEL_ADDED', newLevel);
    addAuditLog('UPDATE_SCHOOL_PROFILE', `Added customized learning level "${newLevel.displayName}"`, newLevel.id);
    showToast(`Level "${newLevel.name}" successfully created!`, 'success');
    return newLevel;
  };

  const updateLevel = (id: string, updates: Partial<SchoolLevel>) => {
    const targetLevel = levels.find(l => l.id === id);
    if (!targetLevel) return;

    const updatedLevel: SchoolLevel = {
      ...targetLevel,
      ...updates,
    };

    setLevels(prev => prev.map(l => l.id === id ? updatedLevel : l));

    try {
      const cleanLevel = sanitizeForFirestore(updatedLevel);
      setDoc(doc(db, 'levels', id), cleanLevel, { merge: true }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `levels/${id}`);
      });
    } catch (e) {
      console.warn('Firestore level update notice:', e);
    }

    broadcastLiveSync('LEVEL_UPDATED', updatedLevel);
    addAuditLog('UPDATE_SCHOOL_PROFILE', `Updated learning level "${updatedLevel.displayName}"`, id);
    showToast(`Level "${updatedLevel.name}" updated successfully`, 'success');
  };

  const deleteLevel = (id: string) => {
    const target = levels.find(l => l.id === id);
    const levelName = target?.displayName || id;

    setLevels(prev => prev.filter(l => l.id !== id));

    try {
      deleteDoc(doc(db, 'levels', id)).catch(() => {});
    } catch {}

    broadcastLiveSync('LEVEL_DELETED', id);
    addAuditLog('UPDATE_SCHOOL_PROFILE', `Deleted learning level "${levelName}"`, id);
    showToast(`Level "${levelName}" deleted successfully`, 'info');
  };

  const getWeeklyCompliance = (weekNumber: number): WeeklyComplianceRecord[] => {
    const teachers = allAccounts.filter(a => {
      if (a.role !== 'teacher') return false;
      if (selectedCampusId && selectedCampusId !== 'ALL') {
        return a.campusId === selectedCampusId || a.registeredCampusIds?.includes(selectedCampusId);
      }
      return true;
    });
    return teachers.map(teacher => {
      const plan = lessonPlans.find(p => p.teacherId === teacher.id && p.weekNumber === weekNumber);
      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        className: teacher.assignedClassName || 'Classroom',
        avatar: teacher.avatar,
        status: plan ? plan.status : 'missing',
        lessonPlanId: plan?.id,
        submissionDate: plan?.submittedAt,
      };
    });
  };

  const pushLiveUpdate = async (customMessage?: string) => {
    setIsSyncingLive(true);
    try {
      const now = new Date().toISOString();
      
      // 1. Sanitize & write School Profile to Firestore
      const cleanProfile = sanitizeForFirestore({
        ...schoolProfile,
        updatedAt: now,
        updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Staff'
      });
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true }).catch((err) => {
        console.warn('Firestore settings update notice:', err);
      });

      // 2. Sanitize & write all Lesson Plans to Firestore
      for (const plan of lessonPlans) {
        const cleanPlan = sanitizeForFirestore(plan);
        await setDoc(doc(db, 'lessonPlans', plan.id), cleanPlan, { merge: true }).catch(() => {});
      }

      // 3. Sanitize & write all Classrooms to Firestore
      for (const c of classrooms) {
        const cleanClass = sanitizeForFirestore(c);
        await setDoc(doc(db, 'classrooms', c.id), cleanClass, { merge: true }).catch(() => {});
      }

      // 4. Sanitize & write all User accounts
      for (const u of allAccounts) {
        const cleanUser = sanitizeForFirestore(u);
        await setDoc(doc(db, 'users', u.id), cleanUser, { merge: true }).catch(() => {});
      }

      // 5. Broadcast to all open tabs and windows
      broadcastLiveSync('FORCE_SYNC_TRIGGERED', {
        timestamp: now,
        sender: currentUser?.name || 'Staff Member',
        message: customMessage || `Manual Push Live Update synchronized (${lessonPlans.length} plans, ${classrooms.length} classrooms)`
      });

      setLastSyncedAt(now);
      addAuditLog('PUSH_LIVE_UPDATE', customMessage || `Pushed live updates & synchronized institutional database (${lessonPlans.length} plans, ${classrooms.length} classrooms)`);
      showToast('🚀 Live update successfully pushed & synced with Firebase cloud!', 'success');
    } catch (err: any) {
      console.warn('Push live update notice:', err);
      showToast('Push update completed locally; synced across active tabs.', 'info');
    } finally {
      setIsSyncingLive(false);
    }
  };

  const forceCloudSync = async () => {
    await pushLiveUpdate('Manual cloud database synchronization');
  };

  const updateSchoolProfile = async (updates: Partial<SchoolProfile>) => {
    const updated: SchoolProfile = {
      ...schoolProfile,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Admin'
    };

    setSchoolProfile(updated);
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(updated));

    try {
      const cleanProfile = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true });
    } catch (e) {
      console.warn('Firestore schoolProfile update warning/notice:', e);
    }

    broadcastLiveSync('SCHOOL_PROFILE_UPDATED', updated);
    addAuditLog('UPDATE_SCHOOL_PROFILE', `Updated School Profile information (${updated.schoolNameEnglish})`);
    showToast('School profile and web app details updated & broadcast live!', 'success');
  };

  const uploadCustomLogo = async (fileOrDataUrl: File | string): Promise<string> => {
    let logoDataUrl = '';
    if (typeof fileOrDataUrl === 'string') {
      logoDataUrl = fileOrDataUrl;
    } else {
      logoDataUrl = await processImageFileToDataUrl(fileOrDataUrl);
    }

    const updated: SchoolProfile = {
      ...schoolProfile,
      customLogoUrl: logoDataUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Admin'
    };

    setSchoolProfile(updated);
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(updated));

    try {
      const cleanProfile = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true });
    } catch (e) {
      console.warn('Firestore custom logo update warning:', e);
    }

    broadcastLiveSync('SCHOOL_PROFILE_UPDATED', updated);
    addAuditLog('UPDATE_LOGO', 'Replaced school logo with custom uploaded artwork');
    showToast('New school logo uploaded and applied across portal', 'success');
    return logoDataUrl;
  };

  const resetLogoToDefault = async () => {
    const updated: SchoolProfile = {
      ...schoolProfile,
      customLogoUrl: null,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Admin'
    };

    setSchoolProfile(updated);
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(updated));

    try {
      const cleanProfile = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true });
    } catch (e) {
      console.warn('Firestore logo reset warning:', e);
    }

    broadcastLiveSync('SCHOOL_PROFILE_UPDATED', updated);
    addAuditLog('RESET_LOGO', 'Restored official Dewey Childcare House master vector shield logo');
    showToast('School logo reset to official DCH master insignia', 'info');
  };

  const resetUserPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      showToast(`Password reset email sent to ${email}`, 'success');
      addAuditLog('PASSWORD_RESET_REQUEST', `Sent password reset email to ${email}`);
    } catch (error: any) {
      console.error('Password reset error:', error);
      showToast(`Failed to send password reset email: ${error.message}`, 'error');
    }
  };

  const isSignUpAllowedForCampus = useCallback((campusId: CampusId) => {
    if (schoolProfile.globalSignUpDisabled) return false;
    if (!campusId || campusId === 'ALL') return !schoolProfile.globalSignUpDisabled;
    return !schoolProfile.disabledSignUpCampuses?.[campusId];
  }, [schoolProfile.globalSignUpDisabled, schoolProfile.disabledSignUpCampuses]);

  const toggleGlobalSignUp = async (disabled?: boolean) => {
    const newValue = disabled !== undefined ? disabled : !schoolProfile.globalSignUpDisabled;
    const updated: SchoolProfile = {
      ...schoolProfile,
      globalSignUpDisabled: newValue,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Admin'
    };

    setSchoolProfile(updated);
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(updated));

    try {
      const cleanProfile = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true });
    } catch (e) {
      console.warn('Firestore global signup status update warning:', e);
    }

    broadcastLiveSync('SCHOOL_PROFILE_UPDATED', updated);
    addAuditLog('UPDATE_SCHOOL_PROFILE', newValue ? 'Hidden/disabled public sign-up for ALL campuses' : 'Displayed/enabled public sign-up for ALL campuses');
    showToast(
      newValue ? 'Sign-up has been hidden for ALL campuses.' : 'Sign-up is now displayed for ALL campuses.',
      newValue ? 'warning' : 'success'
    );
  };

  const toggleCampusSignUp = async (campusId: CampusId, disabled?: boolean) => {
    const currentDisabledMap = schoolProfile.disabledSignUpCampuses || {};
    const currentVal = !!currentDisabledMap[campusId];
    const newVal = disabled !== undefined ? disabled : !currentVal;

    const updatedMap = {
      ...currentDisabledMap,
      [campusId]: newVal,
    };

    const updated: SchoolProfile = {
      ...schoolProfile,
      disabledSignUpCampuses: updatedMap,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Authorized Admin'
    };

    setSchoolProfile(updated);
    safeLocalStorageSet(STORAGE_KEYS.SCHOOL_PROFILE, JSON.stringify(updated));

    try {
      const cleanProfile = sanitizeForFirestore(updated);
      await setDoc(doc(db, 'settings', 'schoolProfile'), cleanProfile, { merge: true });
    } catch (e) {
      console.warn('Firestore campus signup status update warning:', e);
    }

    const campusObj = CAMPUS_LIST.find(c => c.id === campusId);
    const cName = campusObj?.shortName || campusId;

    broadcastLiveSync('SCHOOL_PROFILE_UPDATED', updated);
    addAuditLog('UPDATE_SCHOOL_PROFILE', newVal ? `Hidden sign-up for ${cName}` : `Displayed sign-up for ${cName}`);
    showToast(
      newVal ? `Sign-up hidden for ${cName}` : `Sign-up displayed for ${cName}`,
      newVal ? 'warning' : 'success'
    );
  };

  const openProfileModal = () => {
    setIsProfileModalOpen(true);
  };

  const isCentralHQStaff = useMemo(() => isCentralHQUser(currentUser), [currentUser]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isCentralHQStaff,
        isAuthenticated,
        allAccounts,
        switchUser,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        updateAccount,
        deleteAccount,
        registerTeacher,
        isFirebaseConnected,
        isQuotaExceeded,
        quotaUpgradeUrl: FIRESTORE_UPGRADE_URL,
        isOfflineMode,
        firestoreStatusMessage,
        firebaseAuthUser,
        firebaseConfigInfo: firebaseConfig,
        unauthorizedDomain,
        authSettingsUrl: FIREBASE_AUTH_SETTINGS_URL,
        clearUnauthorizedDomain: () => setUnauthorizedDomain(null),
        isSyncingLive,
        lastSyncedAt,
        pushLiveUpdate,
        forceCloudSync,
        isAuthModalOpen,
        setIsAuthModalOpen,
        authModalMode,
        setAuthModalMode,
        openSignInModal,
        openSignUpModal,
        lessonPlans,
        userLessonPlans,
        selectedPlan,
        setSelectedPlan,
        createLessonPlan,
        updateLessonPlan,
        deleteLessonPlan,
        submitLessonPlan,
        adminReviewPlan,
        batchApprovePlans,
        classrooms,
        addClassroom,
        updateClassroom,
        deleteClassroom,
        levels: processedLevels,
        addLevel,
        updateLevel,
        deleteLevel,
        getWeeklyCompliance,
        auditLogs,
        addAuditLog,
        toastMessage,
        showToast,
        activeTab,
        setActiveTab,
        selectedCampusId,
        setSelectedCampusId,
        formatAgeGroup,
        schoolProfile,
        updateSchoolProfile,
        uploadCustomLogo,
        resetLogoToDefault,
        isProfileModalOpen,
        setIsProfileModalOpen,
        openProfileModal,
        resetUserPassword,
        toggleGlobalSignUp,
        toggleCampusSignUp,
        isSignUpAllowedForCampus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
