# Implementation Tasks: Readmission Prevention Dashboard

## Overview

This document contains the ordered implementation tasks for the Readmission Prevention Dashboard React + TypeScript SPA. Tasks follow a TDD approach — property-based and unit tests are written alongside or before each implementation unit. Tasks are organized from foundational infrastructure through page components to integration and polish.

---

## Task 1: Project Scaffolding and Tooling Setup

- [x] 1.1 Initialize Vite + React + TypeScript project with `strict: true` in tsconfig.json
- [x] 1.2 Install and configure TailwindCSS with custom breakpoints (768px, 1280px)
- [x] 1.3 Install dependencies: `react-router-dom`, `@tanstack/react-query`, `recharts`, `firebase`
- [x] 1.4 Install test dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@fast-check/vitest`, `fast-check`, `jsdom`
- [x] 1.5 Configure Vitest with jsdom environment, coverage thresholds (80% lines/statements/functions, 75% branches), and `vitest --run` single-execution mode
- [x] 1.6 Configure path aliases in tsconfig and vite.config (e.g., `@/` → `src/`)
- [x] 1.7 Set up ESLint + Prettier with TypeScript rules and no-`any` enforcement
- [x] 1.8 Create base folder structure: `src/components`, `src/pages`, `src/contexts`, `src/hooks`, `src/utils`, `src/types`, `src/mocks`, `src/tests`

---

## Task 2: TypeScript Domain Types

- [x] 2.1 Define `UserRole`, `DiagnosisGroup`, `CallOutcome`, `RiskTier` union types
- [x] 2.2 Define `Patient`, `Medication`, `Discharge`, `Call` interfaces
- [x] 2.3 Define `CallTranscript`, `Utterance`, `FlaggedPhrase` interfaces
- [x] 2.4 Define `Escalation`, `DashboardStats`, `DailyVolume` interfaces
- [x] 2.5 Define `WebSocketEvent` discriminated union: `CallCompletedEvent`, `DischargeCreatedEvent`, `CallStartedEvent`, `EscalationTriggeredEvent` — each with `id` (UUID) and `type` fields
- [x] 2.6 Define `ApiResponse<T>` and `ApiError` envelope types
- [x] 2.7 Define `AuthContextValue` and `WebSocketContextValue` interfaces
- [x] 2.8 Verify zero TypeScript errors with `tsc --noEmit`

---

## Task 3: Utility Functions and Property-Based Tests

- [x] 3.1 Implement `deriveRiskTier(riskScore: number): RiskTier` — returns 1 if ≤3, 2 if 4–6, 3 if ≥7
- [x] 3.2 Write PBT for `deriveRiskTier`: `fc.integer({ min: 0, max: 20 })` — verify correct tier for all inputs with boundaries at 3 and 6
  - `// Feature: readmission-prevention-dashboard, Property 1: Risk Tier Derivation Consistency`
- [ ] 3.3 Implement `validateICD10(code: string): boolean` — pattern `^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$`
- [x] 3.4 Write PBT for `validateICD10` correctness: `fc.string()` — verify true iff matches pattern
  - `// Feature: readmission-prevention-dashboard, Property 2: ICD-10 Validation Correctness`
- [x] 3.5 Write PBT for `validateICD10` idempotence: valid code generator — verify `validateICD10(s) === validateICD10(s)`
- [x] 3.6 Implement `shouldShowLowConfidenceWarning(confidence: number): boolean` — returns `confidence < 0.6`
- [x] 3.7 Write PBT for `shouldShowLowConfidenceWarning`: `fc.float({ min: 0, max: 1 })` — verify badge visible iff confidence < 0.6
  - `// Feature: readmission-prevention-dashboard, Property 5: Low Confidence Warning Badge Consistency`
- [x] 3.8 Implement `getEscalationSection(riskTier, confidence)` — Tier 3 precedence, then Tier 2, then Human Review
- [x] 3.9 Write PBT for `getEscalationSection` exclusivity: `fc.record({ riskTier: fc.integer({min:1,max:3}), confidence: fc.float({min:0,max:1}) })` — verify exactly one section returned
  - `// Feature: readmission-prevention-dashboard, Property 4: Escalation Routing Exclusivity`
- [x] 3.10 Implement `getRiskTierColor(tier: RiskTier): string` — green/amber/red mapping
- [x] 3.11 Implement `formatDateTime(iso: string): string` and `formatDate(iso: string): string` display helpers
- [x] 3.12 Implement `calculateReconnectDelay(attempt: number): number` — `Math.min(1000 * 2^attempt, 30000)`
- [x] 3.13 Write PBT for `calculateReconnectDelay`: `fc.integer({ min: 0, max: 10 })` — verify non-decreasing, never exceeds 30000
  - `// Feature: readmission-prevention-dashboard, Property 12: WebSocket Reconnection Exponential Backoff`

---

## Task 4: Firebase Authentication — AuthContext

- [x] 4.1 Initialize Firebase app with environment variables (`VITE_FIREBASE_*`)
- [x] 4.2 Implement `AuthProvider` with `onAuthStateChanged` observer
- [x] 4.3 Extract `role` from Firebase Custom Claims via `getIdTokenResult()` on auth state change
- [x] 4.4 Sign out immediately and display error if no valid role claim found after sign-in
- [x] 4.5 Implement `signInWithGoogle()` using `signInWithPopup` + `GoogleAuthProvider`
- [x] 4.6 Implement `signOut()` — clears auth state, clears WebSocket deduplication cache, redirects to `/login`
- [x] 4.7 Implement `refreshToken()` with shared-promise mutex to prevent concurrent refresh calls
- [x] 4.8 Implement proactive token refresh interceptor: check expiry < 5 min before each API request, call `getIdToken(true)` if needed
- [x] 4.9 Implement reactive 401 handler: refresh token once, retry request; if second 401, sign out and redirect
- [x] 4.10 Expose `useAuth()` hook
- [x] 4.11 Write unit tests: auth state loading spinner shown until resolved; protected content not rendered before resolution
  - `// Feature: readmission-prevention-dashboard, Property 19: Authentication State Resolution Gating`
- [x] 4.12 Write unit tests: `signInWithPopup` called with `GoogleAuthProvider` on button click
- [x] 4.13 Write unit tests: user without role claim is signed out with "Your account is not authorized" error
- [x] 4.14 Write unit tests: concurrent 401 responses trigger exactly one `getIdToken(true)` call
  - `// Feature: readmission-prevention-dashboard, Property 18: Token Refresh Concurrent Request Deduplication`
- [x] 4.15 Write PBT for role enforcement: `fc.constantFrom("nurse","physician","admin","invalid","")` — valid roles grant access, invalid trigger sign-out
  - `// Feature: readmission-prevention-dashboard, Property 20: Role-Based Route Access Enforcement`

---

## Task 5: Routing and Protected Routes

- [x] 5.1 Set up React Router v6 with `BrowserRouter`
- [x] 5.2 Implement `ProtectedRoute` component — shows loading spinner while auth resolves, redirects unauthenticated users to `/login?redirect=<path>`, shows `PermissionDenied` for wrong role
- [x] 5.3 Define all routes: `/login` (public), `/dashboard`, `/discharges`, `/discharges/new` (Admin only), `/calls/:id`, `/escalations`, `/patients`
- [x] 5.4 Implement `PermissionDenied` page — "You don't have permission to access this page" with link to Dashboard
- [x] 5.5 Implement 404 not-found page with link to Dashboard
- [x] 5.6 Write component tests: unauthenticated user navigating to `/dashboard` redirects to `/login`
- [x] 5.7 Write component tests: Nurse/Physician accessing `/discharges/new` sees PermissionDenied
- [x] 5.8 Write component tests: after sign-in, user is redirected to originally requested URL from `redirect` param

---

## Task 6: TanStack Query and API Client Setup

- [x] 6.1 Configure `QueryClient` with staleTime 5 min, cacheTime 10 min, retry 1, refetchOnWindowFocus/Reconnect true
- [x] 6.2 Implement `apiClient` fetch wrapper — attaches `Authorization: Bearer <token>` header, handles proactive token refresh, handles 401 reactive refresh
- [x] 6.3 Define query key factory: `queryKeys.dashboard()`, `queryKeys.discharges(params)`, `queryKeys.calls(id)`, `queryKeys.escalations()`, `queryKeys.patients(params)`
- [x] 6.4 Write unit tests: token attached to every outbound request; proactive refresh called when token expires < 5 min
  - `// Feature: readmission-prevention-dashboard, Property 17: Token Refresh Proactive Strategy`

---

## Task 7: WebSocket Context

- [x] 7.1 Implement `WebSocketProvider` — waits for auth state resolution before connecting
- [x] 7.2 Connect to `/ws?token=<firebase_id_token>` only after valid token available
- [x] 7.3 Implement event parsing with discriminated union type guard
- [x] 7.4 Implement in-memory event deduplication cache (Set of event IDs); clear on sign-out
- [x] 7.5 Implement exponential backoff reconnection using `calculateReconnectDelay`; call `getIdToken(true)` before each reconnect attempt
- [x] 7.6 Track `connectionAttempts`; after 5 failures display "Connection failed — please refresh the page"
- [x] 7.7 On reconnect success: hide banner, call `queryClient.invalidateQueries()` for all active queries
- [x] 7.8 Handle `call_completed`: update call record in TanStack Query cache
- [x] 7.9 Handle `discharge_created`: prepend to page-1 discharges cache; show notification banner on other pages
- [x] 7.10 Handle `call_started`: update discharge `callStatus` in cache
- [x] 7.11 Handle `escalation_triggered`: add to escalations cache
- [x] 7.12 Log unrecognized event types to browser console without throwing
- [x] 7.13 Expose `useWebSocket()` hook
- [x] 7.14 Write unit tests: WebSocket NOT connected before auth resolves
  - `// Feature: readmission-prevention-dashboard, Property 13: WebSocket Connection Token Gating`
- [x] 7.15 Write unit tests: reconnect delays follow exponential backoff formula, never exceed 30s
- [x] 7.16 Write unit tests: duplicate event ID processed only once (same cache state)
  - `// Feature: readmission-prevention-dashboard, Property 14: WebSocket Event Idempotence`
- [x] 7.17 Write unit tests: "Connection lost — reconnecting…" banner shown while disconnected; hidden on reconnect

---

## Task 8: Application Shell and Navigation

- [x] 8.1 Implement `AppShell` layout with navigation sidebar (desktop ≥1280px) and hamburger menu (mobile/tablet <1280px)
- [x] 8.2 Implement responsive navigation: collapsible hamburger for <1280px, persistent sidebar for ≥1280px
- [x] 8.3 Implement "Demo Mode" badge in header (visible when `?demo=true` active)
- [x] 8.4 Implement "Connection lost — reconnecting…" persistent banner (from WebSocketContext)
- [x] 8.5 Implement "Connection failed — please refresh the page" banner after 5 failed reconnect attempts
- [x] 8.6 Implement `Sign Out` button calling `signOut()` from AuthContext
- [x] 8.7 Ensure navigation links are keyboard accessible with visible focus indicators (3:1 contrast)

---

## Task 9: Shared UI Components

- [x] 9.1 Implement `LoadingSpinner` (full-screen variant for auth loading)
- [x] 9.2 Implement `SkeletonCard` and `SkeletonRow` loading placeholders
- [x] 9.3 Implement `EmptyState` component with illustration slot and message prop
- [x] 9.4 Implement `ErrorBanner` component with retry button and `role="alert"`
- [x] 9.5 Implement `RiskTierBadge` — color + text label (never color alone); green/amber/red per tier
- [x] 9.6 Implement `DiagnosisGroupBadge`
- [x] 9.7 Implement `CallOutcomePill`
- [x] 9.8 Implement `Notification` toast — auto-dismiss after 5s for status-only; persistent for actionable content; manual dismiss for errors
- [x] 9.9 Implement `Pagination` component — previous/next controls, current page indicator, 25 rows per page
- [x] 9.10 Implement `FocusTrap` utility for modal dialogs and slide-out drawers
- [x] 9.11 Ensure all shared components meet WCAG 2.1 AA: focus indicators, aria-labels, color contrast ≥4.5:1

---

## Task 10: Login Page

- [ ] 10.1 Implement `LoginPage` at `/login` with "Sign in with Google" button
- [ ] 10.2 Call `signInWithGoogle()` on button click; show loading spinner during sign-in
- [ ] 10.3 Display user-friendly error messages for: popup dismissed, network error, popup blocked, unauthorized account
- [ ] 10.4 Redirect to `redirect` query param URL after successful sign-in, or `/dashboard` if absent
- [ ] 10.5 Add `aria-label` on sign-in button; error messages via `role="alert"`
- [ ] 10.6 Write component tests: button triggers `signInWithPopup` with `GoogleAuthProvider`
- [ ] 10.7 Write component tests: error displayed on sign-in failure; no raw Firebase error codes shown
- [ ] 10.8 Write component tests: redirect to originally requested URL after successful sign-in

---

## Task 11: Dashboard Page

- [ ] 11.1 Implement `DashboardPage` at `/dashboard` — fetch `GET /dashboard/stats` with `useQuery`
- [ ] 11.2 Render three summary cards: today's discharges, pending calls, active escalations
- [ ] 11.3 Render donut chart (Recharts) for Risk Tier distribution with ARIA labels and ≥4.5:1 color contrast
- [ ] 11.4 Render bar chart (Recharts) for daily discharge volume (past 7 days) with ARIA labels
- [ ] 11.5 Provide text-based alternative for chart data accessible to screen readers
- [ ] 11.6 Show loading skeletons for cards and charts while fetching
- [ ] 11.7 Show `ErrorBanner` with retry on fetch failure
- [ ] 11.8 Handle `discharge_created` WebSocket event: increment today's discharges count
- [ ] 11.9 Handle `call_completed` WebSocket event: update pending calls count and tier distribution; pending calls count never goes negative
- [ ] 11.10 Handle `escalation_triggered` WebSocket event: increment active escalations count
- [ ] 11.11 Responsive layout: charts stack vertically on mobile/tablet, side-by-side on desktop
- [ ] 11.12 Write integration test: mount → loading skeleton → data loaded → WebSocket `discharge_created` → count increments
  - `// Feature: readmission-prevention-dashboard, Property 16: Dashboard WebSocket Event Count Updates`
- [ ] 11.13 Write unit test: sum of tier1+tier2+tier3 in donut chart equals `completedToday`, not `todayDischarges`
  - `// Feature: readmission-prevention-dashboard, Property 15: Dashboard Tier Distribution Invariant`

---

## Task 12: Discharge Queue Page

- [ ] 12.1 Implement `DischargeQueuePage` at `/discharges` — fetch `GET /discharges` with pagination/filter params
- [ ] 12.2 Render table with columns: patient name, diagnosis group badge, discharge datetime, call outcome pill, risk tier badge; `<th>` with `scope` attributes
- [ ] 12.3 Implement column header sort (ascending/descending toggle)
- [ ] 12.4 Implement filter controls: Diagnosis Group (multi-select dropdown), Risk Tier (segmented button: All/1/2/3), Call Outcome (multi-select dropdown)
- [ ] 12.5 Implement pagination: 25 rows per page, previous/next controls, page indicator
- [ ] 12.6 Show table skeleton (5 placeholder rows) while fetching
- [ ] 12.7 Show `ErrorBanner` with retry on fetch failure
- [ ] 12.8 Show `EmptyState` "No discharges found" when no records
- [ ] 12.9 Implement slide-out drawer for Admin/Nurse: medication list + call history timeline with timestamp, outcome, risk score
- [ ] 12.10 Drawer: Escape key closes, focus trap while open, focus returns to triggering row on close
- [ ] 12.11 Physician role: rows non-interactive (`cursor: default`, no hover state, no click handler)
- [ ] 12.12 Handle `discharge_created` WebSocket: prepend to page 1; show dismissible "New discharges available" banner with "Go to page 1" button on other pages
- [ ] 12.13 Responsive: card layout on mobile (<768px), scrollable table on tablet (768–1279px)
- [ ] 12.14 Write PBT for sort reversibility: ascending + reverse = descending
  - `// Feature: readmission-prevention-dashboard, Property 7: Sort Operation Reversibility`
- [ ] 12.15 Write PBT for filter subset invariant: filtered count ≤ total count
  - `// Feature: readmission-prevention-dashboard, Property 8: Filter Subset Invariant`
- [ ] 12.16 Write PBT for pagination row limit: each page ≤ 25 rows
  - `// Feature: readmission-prevention-dashboard, Property 9: Pagination Row Limit Invariant`
- [ ] 12.17 Write component tests: Physician rows non-interactive; Admin/Nurse rows open drawer on click

---

## Task 13: Call Transcript Viewer Page

- [ ] 13.1 Implement `TranscriptViewerPage` at `/calls/:id` — fetch `GET /calls/:id/transcript`
- [ ] 13.2 Render utterances with speaker labels ("Agent" / "Patient") visually distinguished by alignment and color
- [ ] 13.3 Highlight `FlaggedPhrase` text in red (≥4.5:1 contrast) with keyboard-accessible tooltip showing clinical reason
- [ ] 13.4 Render risk flags sidebar grouped by clinical category
- [ ] 13.5 Render animated score meter: scale 0 to actual score, visual markers at 3, 6, 10+; ARIA label on meter
- [ ] 13.6 Render `RiskTierBadge` consistent with risk score value
- [ ] 13.7 Render confidence indicator as percentage; show "Low Confidence" warning badge if confidence < 0.6
- [ ] 13.8 Show loading skeleton for transcript area and sidebar while fetching
- [ ] 13.9 Show "Call not found" with link to Discharge Queue on 404
- [ ] 13.10 Show `ErrorBanner` with retry on non-404 error
- [ ] 13.11 Write component tests: highlighted phrase count equals sidebar item count
  - `// Feature: readmission-prevention-dashboard, Property 6: Flagged Phrase Count Invariant`
- [ ] 13.12 Write component tests: "Low Confidence" badge visible iff confidence < 0.6
  - `// Feature: readmission-prevention-dashboard, Property 5: Low Confidence Warning Badge Consistency`
- [ ] 13.13 Write component tests: tier badge color consistent with risk score
  - `// Feature: readmission-prevention-dashboard, Property 1: Risk Tier Derivation Consistency`

---

## Task 14: Escalation Management Page

- [ ] 14.1 Implement `EscalationPage` at `/escalations` — fetch `GET /escalations`
- [ ] 14.2 Render Tier 3 urgent alerts section (above Tier 2): red banners with patient name, risk score, confidence (if <0.6), link to transcript; ARIA live region for screen reader announcements
- [ ] 14.3 Render Tier 2 callback queue section (Nurse/Admin only): cards with patient name, diagnosis group, discharge datetime, risk score
- [ ] 14.4 Render Human Review queue section: cards with patient name, confidence, risk score, link to transcript
- [ ] 14.5 Apply `getEscalationSection` routing: Tier 3 takes precedence; each record in exactly one section
- [ ] 14.6 Show `EmptyState` "No active escalations" when all sections empty
- [ ] 14.7 Show loading skeletons for each section while fetching
- [ ] 14.8 Show `ErrorBanner` with retry on fetch failure
- [ ] 14.9 Handle `escalation_triggered` WebSocket: add to correct section without page reload
- [ ] 14.10 Write component tests: record with Tier 3 + confidence <0.6 appears only in Tier 3 section
- [ ] 14.11 Write component tests: Tier 2 section hidden for Physician role
- [ ] 14.12 Write PBT for escalation routing exclusivity (reuse Property 4 test from Task 3.9)

---

## Task 15: Patient List Page

- [ ] 15.1 Implement `PatientListPage` at `/patients` — fetch `GET /patients?page=<n>&limit=25`
- [ ] 15.2 Render patient rows: name, date of birth, most recent discharge date
- [ ] 15.3 Implement debounced search input (300ms): sends `GET /patients?search=<query>&page=<n>&limit=25`
- [ ] 15.4 Clearing search triggers `GET /patients` without search param (full list restored)
- [ ] 15.5 Implement pagination: 25 rows per page, previous/next controls
- [ ] 15.6 Show loading skeleton while search request in-flight
- [ ] 15.7 Show `EmptyState` "No patients found" when no results
- [ ] 15.8 Show `ErrorBanner` with retry on fetch failure
- [ ] 15.9 Navigate to patient detail view on row click (showing full discharge history)
- [ ] 15.10 Write component tests: debounced search fires after 300ms; clears search restores full list
- [ ] 15.11 Write PBT for search subset invariant: search result count ≤ total unfiltered count

---

## Task 16: Discharge Intake Form Page

- [ ] 16.1 Implement `DischargeFormPage` at `/discharges/new` (Admin only)
- [ ] 16.2 Implement patient search autocomplete (`GET /patients?search=<query>`) with inline new patient creation
- [ ] 16.3 Implement Diagnosis Group selector (CHF, COPD, AMI, PNEUMONIA, ORTHO, OTHER)
- [ ] 16.4 Implement ICD-10 code input with `validateICD10` pattern validation
- [ ] 16.5 Implement discharge datetime picker — reject future datetimes
- [ ] 16.6 Implement medication list editor: add rows (name, dosage, frequency, newMed), remove rows; remove button present iff >1 row
- [ ] 16.7 Implement risk level selector (Low, Medium, High)
- [ ] 16.8 On submit: validate all required fields; display inline errors adjacent to each invalid field via `aria-describedby`
- [ ] 16.9 On valid submit: `POST /patients` (if new patient), then `POST /discharges`; show success notification (auto-dismiss 5s)
- [ ] 16.10 On API failure: show persistent error notification with server message; keep form data intact
- [ ] 16.11 All inputs have associated `<label>` elements; WCAG 2.1 AA compliant
- [ ] 16.12 Nurse/Physician see form in read-only mode; submit button hidden
- [ ] 16.13 Write PBT for form validation submission blocking: random missing-field states never call `POST /discharges`
  - `// Feature: readmission-prevention-dashboard, Property 10: Form Validation Submission Blocking`
- [ ] 16.14 Write PBT for future datetime rejection: `fc.date()` — future dates rejected, past/present accepted
  - `// Feature: readmission-prevention-dashboard, Property 11: Future Datetime Rejection`
- [ ] 16.15 Write component tests: remove button absent when only one medication row; present when >1
- [ ] 16.16 Write integration test: fill valid data → submit → `POST /discharges` called → success notification shown

---

## Task 17: Demo Mode

- [ ] 17.1 Implement `DemoPanel` floating component (bottom-right corner) — rendered only when `?demo=true` AND authenticated
- [ ] 17.2 Redirect to `/login?redirect=<url-with-demo=true>` when `?demo=true` but unauthenticated
- [ ] 17.3 Define mock data for three scenarios:
  - "Happy Path CHF": Tier 1, Risk Score 2, completed call
  - "Medium Risk COPD": Tier 2, Risk Score 5, completed call
  - "Emergency Chest Pain": Tier 3, Risk Score 9, completed call, active escalation
- [ ] 17.4 On scenario button click: override TanStack Query cache with scenario mock data
- [ ] 17.5 Highlight active scenario button; display "Demo Mode" badge in header
- [ ] 17.6 In Demo Mode: disable live WebSocket; use local mock event emitter for scenario events
- [ ] 17.7 In Demo Mode: intercept all REST API requests and resolve against mock data (no real network requests)
- [ ] 17.8 Write component tests: `DemoPanel` not rendered when `?demo=true` absent
- [ ] 17.9 Write component tests: no outbound network requests in Demo Mode
  - `// Feature: readmission-prevention-dashboard, Property: Demo Mode Network Isolation`
- [ ] 17.10 Write component tests: "Emergency Chest Pain" scenario produces Tier 3 escalation in Escalation View

---

## Task 18: Accessibility Audit and Fixes

- [ ] 18.1 Audit all interactive elements for visible keyboard focus indicators (≥3:1 contrast)
- [ ] 18.2 Audit all images and icons for descriptive `alt` text or `aria-label`
- [ ] 18.3 Audit all form inputs for associated `<label>` or `aria-label`
- [ ] 18.4 Verify color is never the sole means of conveying information (badges include text labels)
- [ ] 18.5 Verify all modal dialogs and drawers trap focus and return focus on close
- [ ] 18.6 Verify all data tables have `<th scope>` attributes
- [ ] 18.7 Verify all error messages use `aria-live` or `role="alert"`
- [ ] 18.8 Verify text contrast ≥4.5:1 (normal text) and ≥3:1 (large text) throughout
- [ ] 18.9 Verify full keyboard operability — no mouse-only interactions
- [ ] 18.10 Verify chart data has text-based screen reader alternative

---

## Task 19: Responsive Layout Verification

- [ ] 19.1 Verify hamburger menu at <768px and 768–1279px; persistent sidebar at ≥1280px
- [ ] 19.2 Verify Discharge Queue shows card layout at <768px and scrollable table at 768–1279px
- [ ] 19.3 Verify Dashboard charts stack vertically on mobile and tablet; side-by-side on desktop
- [ ] 19.4 Verify no horizontal scrollbar at any breakpoint when content fits viewport

---

## Task 20: Integration Tests and Coverage Verification

- [ ] 20.1 Write integration test: full Dashboard flow — mount → loading → data → WebSocket event → updated count
- [ ] 20.2 Write integration test: full Discharge Form flow — fill valid data → submit → success notification
- [ ] 20.3 Write integration test: Firebase auth flow — unauthenticated → redirect to `/login` → sign in → redirect to original route → protected content renders
- [ ] 20.4 Write integration test: token refresh flow — token expiring in 3 min → API request → `getIdToken(true)` called → request sent with refreshed token
- [ ] 20.5 Write integration test: WebSocket reconnection flow — disconnect → banner shown → reconnect attempts with backoff → reconnect success → banner hidden → queries refetched
- [ ] 20.6 Run `vitest --run --coverage` and verify all critical paths meet 80% line coverage threshold
- [ ] 20.7 Fix any coverage gaps on: risk score display logic, escalation routing, form submission, auth integration, role-based route guards, WebSocket reconnection, ICD-10 validation

---

## Task 21: Build Verification and Final Checks

- [ ] 21.1 Run `tsc --noEmit` — verify zero TypeScript errors with `strict: true`
- [ ] 21.2 Verify no `any` types used without inline justification comment
- [ ] 21.3 Run `vitest --run` — verify all tests pass
- [ ] 21.4 Run production build (`vite build`) — verify no build errors
- [ ] 21.5 Verify environment variables documented in `.env.example`
- [ ] 21.6 Verify `vitest --run` command works for CI single-execution compatibility
