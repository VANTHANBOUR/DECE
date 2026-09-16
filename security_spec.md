# Security Specification & Test-Driven Verification

## 1. Data Invariants & Structural Rules

1. **Identity & Authentication Invariant**:
   - Only authenticated users (`request.auth != null`) may read or write application data.
   - Non-authenticated visitors cannot read internal staff records, lesson plans, or audit logs.

2. **Role-Based Access Control (RBAC) & Authority Invariant**:
   - Only users with `admin` or `academic_officer` roles (or bootstrapped super admin `vanthanbour@diu.edu.kh`) can approve, reject, or request revisions on lesson plans (`status: 'approved'` or `status: 'revision_requested'`).
   - Regular teachers cannot approve their own lesson plans or modify another teacher's lesson plans.
   - Users cannot escalate their own roles or privileges (e.g. self-assigning `admin` or changing `role`).

3. **Lesson Plan Integrity Invariant**:
   - Every lesson plan must have valid non-empty identifiers: `id`, `classId`, `teacherId`, `weekNumber`, `themeTitle`, and `status`.
   - `status` must strictly be one of: `['draft', 'submitted', 'under_review', 'revision_requested', 'approved']`.
   - Approved lesson plans cannot be deleted or arbitrarily wiped by teachers.

4. **Classroom & Grade Configuration Invariant**:
   - Classroom allocations and levels (`/classrooms/{classId}`, `/levels/{levelId}`) can only be created, modified, or deleted by authorized School Administrators (`admin`).

5. **Audit Trail Invariant**:
   - System Audit Logs (`/auditLogs/{logId}`) are append-only. They may be created by authenticated staff for auditing actions, but cannot be modified (`update: false`) or deleted (`delete: false`).

6. **Institutional Settings & Branding Invariant**:
   - Institutional Profile & Branding (`/settings/schoolProfile`) can only be modified by authorized School Administrators (`admin`).

---

## 2. The "Dirty Dozen" Malicious / Invalid Test Payloads

| Payload ID | Targeted Collection | Attack Vector / Violation | Expected Result |
|---|---|---|---|
| **DD-01** | `/users/{userId}` | Unauthenticated creation of user account | `PERMISSION_DENIED` |
| **DD-02** | `/users/{userId}` | Privilege escalation: Teacher attempts to set `role: "admin"` on own profile | `PERMISSION_DENIED` |
| **DD-03** | `/lessonPlans/{planId}` | Unauthorized Approval: Teacher attempts to change status to `"approved"` | `PERMISSION_DENIED` |
| **DD-04** | `/lessonPlans/{planId}` | Identity Spoofing: Teacher attempts to create plan with another user's `teacherId` | `PERMISSION_DENIED` |
| **DD-05** | `/lessonPlans/{planId}` | Invalid State: Plan status set to malicious or undefined string `"auto_hacked"` | `PERMISSION_DENIED` |
| **DD-06** | `/lessonPlans/{planId}` | Schema Tampering: Omits required fields (`themeTitle` or `weekNumber`) | `PERMISSION_DENIED` |
| **DD-07** | `/auditLogs/{logId}` | Tampering with History: Updating or falsifying an existing audit log | `PERMISSION_DENIED` |
| **DD-08** | `/auditLogs/{logId}` | Evidence Destruction: Deleting an existing audit log entry | `PERMISSION_DENIED` |
| **DD-09** | `/classrooms/{classId}` | Unauthorized Mutation: Regular teacher attempts to delete a classroom | `PERMISSION_DENIED` |
| **DD-10** | `/settings/schoolProfile` | Vandalism: Non-admin staff attempts to overwrite school profile / logo | `PERMISSION_DENIED` |
| **DD-11** | `/levels/{levelId}` | Unauthorized Configuration: Non-admin attempts to edit school level | `PERMISSION_DENIED` |
| **DD-12** | Any collection | Resource Exhaustion: Injecting oversized string (>100KB) into text fields | `PERMISSION_DENIED` |

---

## 3. Test Runner & Verification Logic

All rules are verified against these invariants to guarantee zero regression, data consistency, and smooth, error-free operations across all roles.
