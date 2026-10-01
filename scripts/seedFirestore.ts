import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, getDocs, collection, terminate } from 'firebase/firestore';
import * as fs from 'fs';
import {
  INITIAL_ACCOUNTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_CLASSROOMS,
  INITIAL_LESSON_PLANS,
  INITIAL_SCHOOL_PROFILE,
  INITIAL_STUDENTS,
  INITIAL_ATTENDANCE_RECORDS
} from '../src/data/mockData';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

const app = initializeApp({
  projectId: config.projectId,
  apiKey: config.apiKey,
  authDomain: config.authDomain,
});

const db = getFirestore(app, config.firestoreDatabaseId);

const DEFAULT_LEVELS = [
  { id: 'lvl_toddlers', name: 'Pre-Nursery', displayName: 'Pre-Nursery', khmerName: 'ថ្នាក់កូនក្មេង' },
  { id: 'lvl_nursery', name: 'Nursery', displayName: 'Nursery', khmerName: 'ថ្នាក់មត្តេយ្យទាប' },
  { id: 'lvl_pre_school', name: 'Pre-School', displayName: 'Pre-School', khmerName: 'ថ្នាក់មត្តេយ្យមធ្យម' },
  { id: 'lvl_kindergarten', name: 'Kindergarten', displayName: 'Kindergarten', khmerName: 'ថ្នាក់មត្តេយ្យខ្ពស់' },
];

function sanitize(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        res[k] = sanitize(v);
      }
    }
    return res;
  }
  return data;
}

async function seed() {
  console.log('Seeding Firestore Database with Batched Writes:', config.firestoreDatabaseId);

  const batch = writeBatch(db);

  // 1. Health check document
  batch.set(doc(db, 'system', 'connection_test'), {
    status: 'online',
    lastChecked: new Date().toISOString(),
    service: 'Dewey Kindergarten & Childcare House Cloud Sync',
    institution: 'Dewey Early Childhood Education'
  });

  // 2. School Profile
  batch.set(doc(db, 'settings', 'schoolProfile'), sanitize({
    ...INITIAL_SCHOOL_PROFILE,
    updatedAt: new Date().toISOString(),
    updatedBy: 'System Institutional Sync'
  }), { merge: true });

  // 3. Classrooms
  for (const c of INITIAL_CLASSROOMS) {
    batch.set(doc(db, 'classrooms', c.id), sanitize(c), { merge: true });
  }

  // 4. Users / Accounts
  for (const u of INITIAL_ACCOUNTS) {
    batch.set(doc(db, 'users', u.id), sanitize(u), { merge: true });
  }

  // 5. Lesson Plans
  for (const p of INITIAL_LESSON_PLANS) {
    batch.set(doc(db, 'lessonPlans', p.id), sanitize(p), { merge: true });
  }

  // 6. Grade Levels
  for (const l of DEFAULT_LEVELS) {
    batch.set(doc(db, 'levels', l.id), sanitize(l), { merge: true });
  }

  // 7. Students Roster
  for (const s of INITIAL_STUDENTS) {
    batch.set(doc(db, 'students', s.id), sanitize(s), { merge: true });
  }

  // 8. Attendance Records
  for (const a of INITIAL_ATTENDANCE_RECORDS) {
    batch.set(doc(db, 'attendance', a.id), sanitize(a), { merge: true });
  }

  // 9. Audit Logs
  for (const log of INITIAL_AUDIT_LOGS) {
    batch.set(doc(db, 'auditLogs', log.id), sanitize(log), { merge: true });
  }

  console.log('Committing batch write to Firestore...');
  await batch.commit();
  console.log('✔ Batch committed successfully!');

  console.log('\n--- VERIFYING COLLECTIONS IN FIRESTORE ---');
  const collections = ['system', 'settings', 'users', 'lessonPlans', 'classrooms', 'levels', 'students', 'attendance', 'auditLogs'];
  for (const col of collections) {
    const snap = await getDocs(collection(db, col));
    console.log(`  Collection /${col}: ${snap.size} documents.`);
  }

  await terminate(db);
  console.log('\nSUCCESS: All Firestore collections verified complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});

