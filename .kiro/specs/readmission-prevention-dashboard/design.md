# Design Document: Readmission Prevention Dashboard

## Overview

The Readmission Prevention Dashboard is a React + TypeScript single-page application (SPA) that provides clinical staff with real-time visibility into post-discharge patient follow-up activities. The application enables nurses, physicians, and administrators to monitor AI-generated risk assessments, manage escalations, and create discharge events through a responsive, accessible interface.

### Core Capabilities

- **Real-time monitoring**: WebSocket-driven updates for discharge events, call completions, and escalations
- **Risk visualization**: Dashboard with aggregate statistics, risk tier distribution, and trend charts
- **Escalation management**: Tiered queues (Tier 2 callbacks, Tier 3 urgent alerts, Human Review) with role-based access
- **Call transcript analysis**: Full transcript viewer with highlighted risk phrases and confidence indicators
- **Discharge intake**: Form-based discharge event creation with inline patient search and medication management
- **Role-based access control**: Firebase Authentication with Google Sign-In and custom claims for Nurse, Physician, and Admin roles

### Technology Stack

- **Frontend Framework**: React 18+ with Vite build tooling
- **Language**: TypeScript with strict mode enabled
- **Styling**: TailwindCSS for utility-first responsive design
- **Data Fetching**: TanStack Query v5 for REST API interactions and cache management
- **Real-time Updates**: Native WebSocket API with exponential backoff reconnection
- **Authentication**: Firebase Authentication with Google Sign-In (signInWithPopup + GoogleAuthProvider)
- **Authorization**: Firebase Custom Claims for role metadata (Nurse, Physician, Admin)
- **Routing**: React Router v6 with protected route guards
- **Charts**: Recharts for data visualization (donut charts, bar charts)
- **Testing**: Vitest + React Testing Library + fast-check for property-based testing
- **Accessibility**: WCAG 2.1 AA compliance with focus management and ARIA annotations

### Design Principles

1. **Real-time First**: All data updates propagate via WebSocket; UI reflects changes without manual refresh
2. **Offline Resilience**: Graceful degradation during disconnection with automatic reconciliation on reconnect
3. **Type Safety**: Comprehensive TypeScript types for all domain entities and API responses
4. **Accessibility**: Keyboard navigation, screen reader support, and focus management throughout
5. **Role-based Security**: Granular access control enforced at route, component, and action levels
6. **Test-Driven Development**: Property-based tests for critical invariants; unit tests for specific behaviors

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Application Shell                      │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │         Auth Context Provider                 │  │    │
│  │  │  - Firebase Auth State Observer               │  │    │
│  │  │  - Token Refresh Interceptor                  │  │    │
│  │  │  - Role-based Access Control                  │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │      TanStack Query Provider                  │  │    │
│  │  │  - REST API Cache Management                  │  │    │
│  │  │  - Optimistic Updates                         │  │    │
│  │  │  - Background Refetching                      │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │      WebSocket Client Manager                 │  │    │
│  │  │  - Connection Lifecycle                       │  │    │
│  │  │  - Event Deduplication                        │  │    │
│  │  │  - Exponential Backoff Reconnection           │  │    │
│  │  │  - Cache Invalidation on Events               │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │         React Router                          │  │    │
│  │  │  - Protected Route Guards                     │  │    │
│  │  │  - Role-based Route Filtering                 │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │                  Page Components                    │    │
│  │  - Dashboard                                        │    │
│  │  - Discharge Queue                                  │    │
│  │  - Call Transcript Viewer                           │    │
│  │  - Escalation Management                            │    │
│  │  - Patient List                                     │    │
│  │  - Discharge Intake Form                            │    │
│  │  - Login Page                                       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS + Bearer Token
                            │ WebSocket + Token Query Param
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│  - REST Endpoints (GET /dashboard/stats, POST /discharges)  │
│  - WebSocket Endpoint (/ws?token=<firebase_id_token>)       │
│  - Firebase Admin SDK (Custom Claims Verification)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Firebase Authentication                    │
│  - Google Sign-In Provider                                   │
│  - Custom Claims (role: nurse | physician | admin)          │
│  - ID Token Management                                       │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── AuthProvider (Context)
│   ├── Firebase Auth State Observer
│   ├── Token Refresh Logic
│   └── Role Extraction from Custom Claims
├── QueryClientProvider (TanStack Query)
├── WebSocketProvider (Context)
│   ├── Connection Manager
│   ├── Event Handler
│   └── Reconnection Logic
└── Router
    ├── PublicRoute: /login
    └── ProtectedRoutes (Auth Required)
        ├── /dashboard (All Roles)
        ├── /discharges (All Roles, Physician: read-only)
        ├── /calls/:id (All Roles, read-only)
        ├── /escalations (All Roles, filtered by role)
        ├── /patients (All Roles)
        └── /discharges/new (Admin Only)
```

### Data Flow Patterns

#### 1. REST API Data Flow (TanStack Query)

```
Component Mount
    ↓
useQuery Hook Invoked
    ↓
Check TanStack Query Cache
    ↓
Cache Hit? → Return Cached Data
    ↓
Cache Miss or Stale? → Fetch from API
    ↓
Attach Firebase ID Token (Bearer)
    ↓
API Request → Backend
    ↓
Response → Update Cache
    ↓
Re-render Component with Data
```

#### 2. WebSocket Event Flow

```
WebSocket Event Received
    ↓
Parse Event Type (discriminated union)
    ↓
Check Event ID for Deduplication
    ↓
Already Processed? → Ignore
    ↓
New Event? → Process
    ↓
Update TanStack Query Cache
    ↓
Trigger Component Re-render
```

#### 3. Authentication Flow

```
App Initialization
    ↓
Firebase Auth State Observer
    ↓
User Signed In?
    ↓
No → Redirect to /login
    ↓
Yes → Extract Custom Claims (role)
    ↓
Role Present?
    ↓
No → Sign Out + Error Message
    ↓
Yes → Store in Auth Context
    ↓
Render Protected Routes
```

#### 4. Token Refresh Flow

```
API Request Initiated
    ↓
Check Token Expiry (< 5 min remaining?)
    ↓
Yes → Call getIdToken(true)
    ↓
Await Fresh Token
    ↓
Attach to Request Header
    ↓
Send Request
    ↓
401 Response?
    ↓
Yes → Refresh Token Once
    ↓
Retry Request with New Token
    ↓
Still 401? → Sign Out + Redirect to /login
```

---

## Components and Interfaces

### Core Context Providers

#### AuthContext

**Purpose**: Manages Firebase Authentication state, token refresh, and role-based access control.

**State**:
```typescript
interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<string>;
}

type UserRole = "nurse" | "physician" | "admin";
```

**Key Responsibilities**:
- Observe Firebase `onAuthStateChanged` to track authentication state
- Extract `role` from Firebase Custom Claims via `getIdTokenResult()`
- Provide `refreshToken()` method that calls `getIdToken(true)` and handles concurrent refresh requests
- Implement sign-out logic that clears auth state and redirects to `/login`
- Validate that signed-in users have a valid role claim; sign out users without roles

**Token Refresh Strategy**:
- Proactive refresh: Before each API request, check if token expires within 5 minutes
- Reactive refresh: On 401 response, refresh token once and retry request
- Concurrent request handling: Use a shared promise to prevent multiple simultaneous refresh calls

#### WebSocketContext

**Purpose**: Manages WebSocket connection lifecycle, event handling, and reconnection logic.

**State**:
```typescript
interface WebSocketContextValue {
  connected: boolean;
  reconnecting: boolean;
  connectionAttempts: number;
  lastEventId: string | null;
}
```

**Key Responsibilities**:
- Establish WebSocket connection to `/ws?token=<firebase_id_token>` after auth state resolves
- Implement exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Refresh Firebase ID token before each reconnection attempt via `getIdToken(true)`
- Deduplicate events using event ID and in-memory cache (cleared on sign-out)
- Update TanStack Query cache on event receipt: `queryClient.setQueryData()` for updates, `queryClient.invalidateQueries()` after reconnection
- Display connection status banner when disconnected or reconnecting

**Event Handling**:
- `call_completed`: Update call record in cache with new `riskScore`, `confidence`, `outcome`
- `discharge_created`: Prepend to discharges list cache (page 1 only; show notification for other pages)
- `call_started`: Update discharge record's `callStatus` in cache
- `escalation_triggered`: Add to escalations list cache

**Reconnection Logic**:
```typescript
let attempt = 0;
const maxDelay = 30000; // 30 seconds

function reconnect() {
  const delay = Math.min(1000 * Math.pow(2, attempt), maxDelay);
  setTimeout(async () => {
    const token = await getIdToken(true); // Fresh token
    connect(`/ws?token=${token}`);
    attempt++;
  }, delay);
}
```

#### QueryClientProvider (TanStack Query)

**Purpose**: Provides TanStack Query client for REST API data fetching and caching.

**Configuration**:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
```

**Key Patterns**:
- Use `useQuery` for GET requests with automatic caching and background refetching
- Use `useMutation` for POST/PUT/DELETE requests with optimistic updates
- Invalidate queries after WebSocket reconnection to reconcile missed events
- Use query keys with hierarchical structure: `['discharges', { page, filters }]`

### Page Components

#### Dashboard (`/dashboard`)

**Purpose**: Display aggregate statistics and trend charts for today's discharge activity.

**Data Dependencies**:
- `GET /dashboard/stats` → `DashboardStats`

**UI Elements**:
- Summary cards: Today's discharges, pending calls, active escalations
- Donut chart: Risk tier distribution (Tier 1, Tier 2, Tier 3)
- Bar chart: Daily discharge volume (past 7 days)
- Loading skeletons during fetch
- Error banner with retry button on failure

**WebSocket Integration**:
- `discharge_created`: Increment today's discharges count
- `call_completed`: Update pending calls count and risk tier distribution
- `escalation_triggered`: Increment active escalations count

**Accessibility**:
- ARIA labels on chart elements
- Color contrast ratio ≥ 4.5:1 for chart colors
- Keyboard-accessible chart tooltips

#### Discharge Queue (`/discharges`)

**Purpose**: Sortable, filterable table of discharge records with slide-out drawer for details.

**Data Dependencies**:
- `GET /discharges?page=<n>&limit=25&diagnosisGroup=<filter>&riskTier=<filter>&callOutcome=<filter>`

**UI Elements**:
- Table columns: Patient name, diagnosis group badge, discharge datetime, call outcome pill, risk tier badge
- Filter controls: Diagnosis group (multi-select), risk tier (segmented button), call outcome (multi-select)
- Sort controls: Click column header to toggle ascending/descending
- Pagination: 25 rows per page with previous/next controls
- Slide-out drawer: Medication list and call history timeline (Admin/Nurse only)
- Empty state: "No discharges found" with illustration

**Role-based Behavior**:
- **Admin/Nurse**: Table rows clickable, drawer opens on click
- **Physician**: Table rows non-interactive (`cursor: default`, no hover state, no click handler)

**WebSocket Integration**:
- `discharge_created`: Prepend to page 1; show notification banner on other pages

**Accessibility**:
- `<th>` elements with `scope` attributes
- Focus trap in slide-out drawer
- Escape key closes drawer
- Focus returns to triggering row on drawer close

#### Call Transcript Viewer (`/calls/:id`)

**Purpose**: Display full call transcript with highlighted risk phrases and confidence indicators.

**Data Dependencies**:
- `GET /calls/:id/transcript` → `CallTranscript`

**UI Elements**:
- Transcript body: Speaker-labeled utterances (Agent vs. Patient) with visual distinction
- Highlighted phrases: Red background with tooltip showing clinical reason
- Risk flags sidebar: Grouped by clinical category
- Risk score meter: Animated scale from 0 to actual score with tier boundary markers (3, 6, 10+)
- Risk tier badge: Color-coded (green/amber/red)
- Confidence indicator: Percentage with "Low Confidence" warning badge if < 0.6
- Loading skeleton during fetch
- 404 state: "Call not found" with link to Discharge Queue
- Error state: Error message with retry button

**Accessibility**:
- Sufficient color contrast for highlighted phrases (≥ 4.5:1)
- Keyboard-accessible tooltips
- ARIA labels on score meter and tier badge

#### Escalation Management (`/escalations`)

**Purpose**: Tiered queues for escalated patient cases requiring human follow-up.

**Data Dependencies**:
- `GET /escalations` → `Escalation[]`

**UI Elements**:
- **Tier 3 Urgent Alerts**: Red alert banners with patient name, risk score, confidence (if < 0.6), link to transcript
- **Tier 2 Callback Queue**: Callback cards with patient name, diagnosis group, discharge datetime, risk score (Nurse/Admin only)
- **Human Review Queue**: Cards with patient name, confidence value, risk score, link to transcript (all roles)
- Empty state: "No active escalations"
- Loading skeletons for each section

**Display Logic**:
- Record appears in exactly one section
- Tier 3 (score ≥ 7) takes precedence over Human Review
- Human Review: Confidence < 0.6 AND Risk Tier < 3
- Tier 2: Score 4–6 (Nurse/Admin only)

**WebSocket Integration**:
- `escalation_triggered`: Add to appropriate section without page reload

**Accessibility**:
- ARIA live regions on Tier 3 alert banners for screen reader announcements
- Keyboard navigation between cards

#### Patient List (`/patients`)

**Purpose**: Searchable, paginated list of patients with discharge history.

**Data Dependencies**:
- `GET /patients?search=<query>&page=<n>&limit=25`

**UI Elements**:
- Search input: Debounced server-side search (300ms delay)
- Patient rows: Name, date of birth, most recent discharge date
- Pagination: 25 rows per page
- Empty state: "No patients found"
- Loading skeleton during search

**Behavior**:
- Click patient row → Navigate to patient detail view with discharge history

**Accessibility**:
- Associated `<label>` for search input
- Keyboard navigation through patient rows

#### Discharge Intake Form (`/discharges/new`, Admin Only)

**Purpose**: Create new discharge event with patient search, diagnosis, medications, and risk level.

**Data Dependencies**:
- `GET /patients?search=<query>` (inline patient search)
- `POST /patients` (create new patient inline)
- `POST /discharges` (submit discharge)

**UI Elements**:
- Patient search/create: Autocomplete with inline patient creation
- Diagnosis group selector: CHF, COPD, AMI, PNEUMONIA, ORTHO, OTHER
- ICD-10 code input: Pattern validation `[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?`
- Discharge datetime picker: Rejects future datetimes
- Medication list editor: Add/remove rows (name, dosage, frequency, newMed flag)
- Risk level selector: Low, Medium, High
- Submit button: Validates all required fields before submission
- Success notification: Auto-dismiss after 5 seconds
- Error notification: Persists until user dismisses

**Validation Rules**:
- Required fields: Patient, diagnosis group, ICD-10 code, discharge datetime, at least one medication
- ICD-10 format: Must match pattern
- Discharge datetime: Cannot be in the future
- Display inline error messages adjacent to invalid fields

**Accessibility**:
- Associated `<label>` elements for all inputs
- Error messages linked via `aria-describedby`
- Keyboard navigation through form fields

#### Login Page (`/login`)

**Purpose**: Google Sign-In authentication entry point.

**UI Elements**:
- "Sign in with Google" button
- Error message display (popup dismissed, network error, unauthorized account)
- Loading spinner during sign-in

**Behavior**:
- Click button → `signInWithPopup(auth, new GoogleAuthProvider())`
- On success → Check for role claim → Redirect to originally requested URL or `/dashboard`
- On failure → Display user-friendly error message
- No role claim → Sign out immediately + "Your account is not authorized" error

**Accessibility**:
- Descriptive `aria-label` on sign-in button
- Error messages announced via `role="alert"`

### Utility Components

#### ProtectedRoute

**Purpose**: Route guard that redirects unauthenticated users to `/login`.

**Logic**:
```typescript
function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" state={{ redirect: location.pathname }} />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <PermissionDenied />;
  }

  return children;
}
```

#### DemoPanel

**Purpose**: Floating panel for activating demo scenarios (visible only when `?demo=true` and authenticated).

**Scenarios**:
- **Happy Path CHF**: Tier 1, Risk Score 2, completed call
- **Medium Risk COPD**: Tier 2, Risk Score 5, completed call
- **Emergency Chest Pain**: Tier 3, Risk Score 9, completed call, active escalation

**Behavior**:
- Override TanStack Query cache with scenario mock data
- Disable live WebSocket connection; use local mock emitter
- Intercept all REST API requests; resolve against mock data
- Display "Demo Mode" badge in application header

---

## Data Models

### TypeScript Interfaces

#### Patient

```typescript
interface Patient {
  id: string;
  name: string;
  dateOfBirth: string; // ISO 8601 date
  lastDischargeDate?: string; // ISO 8601 datetime
}
```

#### Medication

```typescript
interface Medication {
  name: string;
  dose: string;
  frequency: string;
  newMed: boolean; // True if prescribed at discharge
}
```

#### Discharge

```typescript
interface Discharge {
  id: string;
  patientId: string;
  patientName: string;
  diagnosisGroup: DiagnosisGroup;
  icd10Code: string;
  dischargeDateTime: string; // ISO 8601 datetime
  medications: Medication[];
  riskLevel: "low" | "medium" | "high";
  callStatus: "pending" | "in_progress" | "completed" | "failed";
  riskScore?: number;
  riskTier?: RiskTier;
  confidence?: number;
}

type DiagnosisGroup = "CHF" | "COPD" | "AMI" | "PNEUMONIA" | "ORTHO" | "OTHER";
type RiskTier = 1 | 2 | 3;
```

#### Call

```typescript
interface Call {
  id: string;
  dischargeId: string;
  startTime: string; // ISO 8601 datetime
  endTime?: string; // ISO 8601 datetime
  outcome: CallOutcome;
  riskScore?: number;
  confidence?: number;
  transcript?: CallTranscript;
}

type CallOutcome = "completed" | "voicemail" | "no_answer" | "refused" | "wrong_party";
```

#### CallTranscript

```typescript
interface CallTranscript {
  id: string;
  callId: string;
  utterances: Utterance[];
  flaggedPhrases: FlaggedPhrase[];
  riskScore: number;
  confidence: number;
  riskTier: RiskTier;
}

interface Utterance {
  speaker: "agent" | "patient";
  text: string;
  timestamp: number; // Seconds from call start
}

interface FlaggedPhrase {
  text: string;
  category: string; // e.g., "medication_adherence", "symptom_worsening"
  reason: string; // Clinical explanation
  utteranceIndex: number; // Index in utterances array
}
```

#### Escalation

```typescript
interface Escalation {
  id: string;
  dischargeId: string;
  patientName: string;
  diagnosisGroup: DiagnosisGroup;
  dischargeDateTime: string;
  riskScore: number;
  riskTier: RiskTier;
  confidence: number;
  callId: string;
  createdAt: string; // ISO 8601 datetime
}
```

#### DashboardStats

```typescript
interface DashboardStats {
  todayDischarges: number;
  pendingCalls: number;
  activeEscalations: number;
  tierDistribution: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  dailyVolume: DailyVolume[]; // Past 7 days
  completedToday: number; // Calls completed today (for tier distribution validation)
}

interface DailyVolume {
  date: string; // ISO 8601 date
  count: number;
}
```

#### WebSocket Events

```typescript
type WebSocketEvent =
  | CallCompletedEvent
  | DischargeCreatedEvent
  | CallStartedEvent
  | EscalationTriggeredEvent;

interface CallCompletedEvent {
  type: "call_completed";
  id: string; // Event UUID for deduplication
  callId: string;
  dischargeId: string;
  outcome: CallOutcome;
  riskScore: number;
  confidence: number;
  riskTier: RiskTier;
  timestamp: string; // ISO 8601 datetime
}

interface DischargeCreatedEvent {
  type: "discharge_created";
  id: string;
  discharge: Discharge;
  timestamp: string;
}

interface CallStartedEvent {
  type: "call_started";
  id: string;
  callId: string;
  dischargeId: string;
  timestamp: string;
}

interface EscalationTriggeredEvent {
  type: "escalation_triggered";
  id: string;
  escalation: Escalation;
  timestamp: string;
}
```

### API Response Shapes

All API responses follow a consistent envelope structure:

```typescript
interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

interface ApiError {
  error: {
    message: string;
    code: string;
  };
}
```

### Utility Functions

#### deriveRiskTier

```typescript
function deriveRiskTier(riskScore: number): RiskTier {
  if (riskScore <= 3) return 1;
  if (riskScore <= 6) return 2;
  return 3;
}
```

#### validateICD10

```typescript
function validateICD10(code: string): boolean {
  const pattern = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
  return pattern.test(code);
}
```

#### shouldShowLowConfidenceWarning

```typescript
function shouldShowLowConfidenceWarning(confidence: number): boolean {
  return confidence < 0.6;
}
```

#### getEscalationSection

```typescript
function getEscalationSection(
  riskTier: RiskTier,
  confidence: number
): "tier3" | "tier2" | "humanReview" {
  if (riskTier === 3) return "tier3"; // Tier 3 takes precedence
  if (riskTier === 2) return "tier2";
  if (confidence < 0.6 && riskTier < 3) return "humanReview";
  throw new Error("Escalation does not match any section criteria");
}
```

---
## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Risk Tier Derivation Consistency

*For any* integer risk score in the range [0, 20], the `deriveRiskTier` function SHALL return exactly one value from {1, 2, 3}, with tier boundaries at score ≤ 3 (Tier 1), score 4–6 (Tier 2), and score ≥ 7 (Tier 3). The tier badge color displayed in any component SHALL be consistent with the derived tier: green for Tier 1, amber for Tier 2, red for Tier 3.

**Validates: Requirements 3.6, 8.1 (Correctness Properties from Requirements)**

### Property 2: ICD-10 Validation Correctness

*For any* string input, the `validateICD10` function SHALL return `true` if and only if the string matches the pattern `[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?`. All strings accepted by the validator SHALL match this pattern, and all strings rejected SHALL not match this pattern.

**Validates: Requirements 6.3**

### Property 3: ICD-10 Validation Idempotence

*For any* string `s` accepted by the `validateICD10` function, applying the validator to `s` a second time SHALL return the same accepted result (idempotent validation).

**Validates: Requirements 12.3 (Correctness Properties from Requirements)**

### Property 4: Escalation Routing Exclusivity

*For any* escalation record with a given `riskTier` and `confidence` value, the `getEscalationSection` function SHALL return exactly one section identifier from {"tier3", "tier2", "humanReview"}. The routing logic SHALL follow these rules: (1) if `riskTier === 3`, return "tier3" regardless of confidence; (2) if `riskTier === 2`, return "tier2"; (3) if `confidence < 0.6` AND `riskTier < 3`, return "humanReview". No escalation SHALL appear in more than one section simultaneously.

**Validates: Requirements 4.4, 4.5, 4.9, 4.1 (Invariant from Requirements)**

### Property 5: Low Confidence Warning Badge Consistency

*For any* call transcript with a `confidence` value in the range [0.0, 1.0], the "Low Confidence" warning badge SHALL be visible if and only if `confidence < 0.6`. The badge SHALL never appear when `confidence ≥ 0.6`, and SHALL always appear when `confidence < 0.6`.

**Validates: Requirements 3.8, 3.3 (Invariant from Requirements)**

### Property 6: Flagged Phrase Count Invariant

*For any* loaded call transcript, the count of highlighted `FlaggedPhrase` elements in the transcript body SHALL equal the count of items listed in the risk flags sidebar. No flagged phrase SHALL be highlighted without appearing in the sidebar, and no sidebar item SHALL exist without a corresponding highlight in the transcript.

**Validates: Requirements 3.3, 3.2 (Invariant from Requirements)**

### Property 7: Sort Operation Reversibility

*For any* discharge list of length ≥ 2 and any sortable column, sorting the list in ascending order and then reversing the result SHALL produce the same row order as sorting the list in descending order. Additionally, sorting by any column SHALL preserve all rows without duplication or omission.

**Validates: Requirements 2.3, 12.7 (Metamorphic from Requirements)**

### Property 8: Filter Subset Invariant

*For any* discharge list and any combination of active filters (diagnosis group, risk tier, call outcome), the count of displayed rows after filtering SHALL be less than or equal to the total unfiltered row count. Applying multiple filters simultaneously SHALL produce results that match all filter criteria (AND logic), and the filtered result set SHALL be a subset of each individual filter's result set.

**Validates: Requirements 2.12, 2.13, 2.14, 2.15, 2.1 (Invariant from Requirements)**

### Property 9: Pagination Row Limit Invariant

*For any* paginated list (discharges, patients) with page size configured to 25 rows, each page SHALL display at most 25 rows. The last page MAY contain fewer than 25 rows if the total count is not evenly divisible by 25, but no page SHALL ever exceed 25 rows.

**Validates: Requirements 2.16, 5.7, 2.3 (Invariant from Requirements)**

### Property 10: Form Validation Submission Blocking

*For any* discharge form state, the form submission handler SHALL never invoke `POST /discharges` when any required field (patient, diagnosis group, ICD-10 code, discharge datetime, medications) is missing or invalid. The submission SHALL be blocked at the client side before any network request is initiated.

**Validates: Requirements 6.7, 6.1 (Invariant from Requirements)**

### Property 11: Future Datetime Rejection

*For any* datetime value selected in the discharge datetime picker, if the datetime is in the future (greater than the current moment), the form validation SHALL reject the value and display the error "Discharge time cannot be in the future". All past and present datetimes SHALL be accepted.

**Validates: Requirements 6.4, 6.10**

### Property 12: WebSocket Reconnection Exponential Backoff

*For any* sequence of WebSocket reconnection attempts, the delay between consecutive attempts SHALL follow exponential backoff: delay(n) = min(1000 * 2^n, 30000) milliseconds, where n is the attempt number starting from 0. The delay sequence SHALL be non-decreasing, and no delay SHALL exceed 30,000 milliseconds (30 seconds).

**Validates: Requirements 7.7, 7.5 (Invariant from Requirements)**

### Property 13: WebSocket Connection Token Gating

*For any* WebSocket connection attempt (initial or reconnection), the connection SHALL NOT be initiated unless a valid, non-expired Firebase ID token is available. Before each reconnection attempt, the client SHALL obtain a fresh token via `getIdToken(true)`.

**Validates: Requirements 7.1, 7.8, 7.2 (Invariant from Requirements)**

### Property 14: WebSocket Event Idempotence

*For any* duplicate WebSocket event with the same event ID received within a single authenticated session (from sign-in to sign-out), processing the event a second time SHALL produce the same application cache state as processing it once. The deduplication cache SHALL be cleared on sign-out, allowing the same event ID to be processed again in a subsequent authenticated session.

**Validates: Requirements 7.3 (Idempotence from Requirements)**

### Property 15: Dashboard Tier Distribution Invariant

*For any* valid `GET /dashboard/stats` response, the sum of Tier 1 + Tier 2 + Tier 3 counts in the donut chart SHALL equal the `completedToday` count (calls completed today), NOT the `todayDischarges` count. Pending calls, voicemails, and no-answer attempts have no tier assignment and SHALL NOT be included in the tier distribution.

**Validates: Requirements 1.3, 1.1 (Invariant from Requirements)**

### Property 16: Dashboard WebSocket Event Count Updates

*For any* sequence of WebSocket events received (`discharge_created`, `call_completed`, `escalation_triggered`), the dashboard counts SHALL update correctly: (1) `discharge_created` increments today's discharges count by 1; (2) `call_completed` updates pending calls count and risk tier distribution; (3) `escalation_triggered` increments active escalations count by 1. The pending calls count SHALL never become negative.

**Validates: Requirements 1.7, 1.8, 1.9, 1.2 (Invariant from Requirements)**

### Property 17: Token Refresh Proactive Strategy

*For any* outbound REST API request, if the Firebase ID token expires within the next 5 minutes, the application SHALL proactively refresh the token via `getIdToken(true)` before attaching it to the request. The refreshed token SHALL be used for the current request and all subsequent requests until the next refresh is needed.

**Validates: Requirements 14.11, 14.1 (Invariant from Requirements)**

### Property 18: Token Refresh Concurrent Request Deduplication

*For any* set of concurrent API requests that receive a 401 response simultaneously, exactly one token refresh SHALL be initiated. All waiting requests SHALL reuse the result of that single refresh operation and retry with the refreshed token. No parallel refresh calls SHALL be triggered.

**Validates: Requirements 14.13, 14.5 (Invariant from Requirements)**

### Property 19: Authentication State Resolution Gating

*For any* navigation attempt to a protected route while the Firebase auth state is being resolved (loading), the application SHALL display a loading spinner and SHALL NOT render any protected route content. Protected content SHALL only render after auth state resolution completes and a valid authenticated user with a role claim is confirmed.

**Validates: Requirements 14.2, 14.4 (Invariant from Requirements)**

### Property 20: Role-Based Route Access Enforcement

*For any* authenticated user with a `role` value from Firebase custom claims, the role SHALL be exactly one of {"nurse", "physician", "admin"}. Any other role value or missing role SHALL be treated as unauthenticated, triggering immediate sign-out and redirect to `/login`. Each role SHALL have access to exactly the routes specified in the requirements, with no overlap or gaps.

**Validates: Requirements 14.8, 14.14, 14.2 (Invariant from Requirements)**

---

## Error Handling

### Client-Side Error Handling

#### Network Errors

**REST API Failures**:
- Display inline error banner with user-friendly message (no raw HTTP status codes)
- Provide retry button that re-triggers the failed TanStack Query fetch
- Preserve user input in forms when submission fails
- Log detailed error information to browser console for debugging

**WebSocket Disconnections**:
- Display persistent "Connection lost — reconnecting…" banner at top of page
- Implement exponential backoff reconnection (1s, 2s, 4s, 8s, 16s, 30s max)
- After 5 consecutive failed reconnection attempts, display "Connection failed — please refresh the page"
- On successful reconnection, hide banner and refetch all active TanStack Query queries to reconcile missed updates

#### Authentication Errors

**Sign-In Failures**:
- Google Sign-In popup dismissed: "Sign-in was cancelled. Please try again."
- Network error during sign-in: "Unable to connect. Please check your internet connection and try again."
- Popup blocked by browser: "Please allow popups for this site to sign in with Google."
- No role claim after sign-in: "Your account is not authorized to access this application." (sign out immediately)

**Token Refresh Failures**:
- Single 401 response: Refresh token once via `getIdToken(true)`, retry request
- Second 401 after refresh: Sign out user, redirect to `/login` with error message "Your session has expired. Please sign in again."
- Token refresh network error: Retry refresh once; if still fails, sign out and redirect

**Authorization Errors**:
- User attempts to access Admin-only route without Admin role: Display "You don't have permission to access this page" with link to Dashboard
- User attempts to access route not allowed for their role: Redirect to Dashboard with permission denied message

#### Validation Errors

**Form Validation**:
- Display inline error messages adjacent to invalid fields (linked via `aria-describedby`)
- Prevent form submission when validation fails (no network request)
- Error messages:
  - Missing required field: "{Field name} is required"
  - Invalid ICD-10 code: "Invalid ICD-10 code format. Expected format: A00 or A00.1234"
  - Future discharge datetime: "Discharge time cannot be in the future"
  - Empty medication list: "At least one medication is required"

#### Data Errors

**404 Not Found**:
- Call transcript not found: Display "Call not found" message with link back to Discharge Queue
- Patient not found: Display "Patient not found" message with link back to Patient List
- Route not found: Display 404 page with link to Dashboard

**Empty States**:
- No discharges: "No discharges found" with illustration
- No patients: "No patients found" with illustration
- No escalations: "No active escalations" with illustration
- No search results: "No patients found matching '{query}'" with clear search button

### Server-Side Error Handling (Backend Expectations)

The frontend expects the backend to return consistent error response shapes:

```typescript
interface ApiError {
  error: {
    message: string; // User-friendly error message
    code: string; // Machine-readable error code (e.g., "INVALID_ICD10")
  };
}
```

**Expected HTTP Status Codes**:
- `400 Bad Request`: Invalid request payload (e.g., malformed ICD-10 code)
- `401 Unauthorized`: Missing or expired Firebase ID token
- `403 Forbidden`: Valid token but insufficient role permissions
- `404 Not Found`: Resource does not exist (e.g., call transcript, patient)
- `422 Unprocessable Entity`: Validation error (e.g., future discharge datetime)
- `500 Internal Server Error`: Unexpected server error

**Error Message Guidelines**:
- Use plain language without technical jargon
- Do not expose stack traces, database errors, or internal implementation details
- Provide actionable guidance when possible (e.g., "Please check your input and try again")

### Error Recovery Strategies

#### Automatic Recovery

- **Token expiry**: Automatically refresh token and retry request (once)
- **WebSocket disconnection**: Automatically reconnect with exponential backoff
- **Transient network errors**: TanStack Query retries once by default

#### User-Initiated Recovery

- **Persistent errors**: Display retry button for user to manually re-trigger failed operation
- **Form submission errors**: Keep form data intact; user can correct and resubmit
- **Connection failures after 5 attempts**: User must manually refresh page

#### Data Reconciliation

- **After WebSocket reconnection**: Invalidate all TanStack Query caches and refetch to reconcile any missed events
- **After sign-in**: Fetch fresh data for all active queries
- **After demo mode deactivation**: Clear demo data from cache and refetch live data

---

## Testing Strategy

### Testing Approach

The application follows a **Test-Driven Development (TDD)** approach with a dual testing strategy:

1. **Property-Based Tests**: Verify universal properties across all inputs using fast-check
2. **Unit Tests**: Verify specific examples, edge cases, and error conditions using Vitest + React Testing Library

Together, these provide comprehensive coverage: unit tests catch concrete bugs, property tests verify general correctness.

### Testing Tools

- **Test Runner**: Vitest (configured for single-execution CI compatibility via `vitest --run`)
- **Component Testing**: React Testing Library (RTL) for component rendering and interaction
- **Property-Based Testing**: fast-check with `@fast-check/vitest` integration
- **Mocking**: Vitest's built-in mocking for Firebase Auth, TanStack Query, WebSocket
- **Coverage**: Minimum 80% line coverage on critical paths

### Property-Based Testing Configuration

**Library**: `@fast-check/vitest` for seamless Vitest integration

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test references its design document property via comment tag
- Tag format: `// Feature: readmission-prevention-dashboard, Property {number}: {property_text}`

**Example Property Test**:
```typescript
import { test } from 'vitest';
import { fc } from '@fast-check/vitest';
import { deriveRiskTier } from './utils';

// Feature: readmission-prevention-dashboard, Property 1: Risk Tier Derivation Consistency
test.prop([fc.integer({ min: 0, max: 20 })])(
  'deriveRiskTier returns correct tier for any risk score',
  (riskScore) => {
    const tier = deriveRiskTier(riskScore);
    
    if (riskScore <= 3) {
      expect(tier).toBe(1);
    } else if (riskScore <= 6) {
      expect(tier).toBe(2);
    } else {
      expect(tier).toBe(3);
    }
  },
  { numRuns: 100 }
);
```

### Critical Path Coverage Requirements

The test suite SHALL achieve minimum 80% line coverage on:

1. **Risk Score Display Logic**: `deriveRiskTier`, tier badge color mapping
2. **Risk Tier Derivation**: Boundary testing at scores 3, 6, 7
3. **Escalation Routing Display**: `getEscalationSection` with all tier/confidence combinations
4. **Discharge Form Submission**: Validation logic, required field checks, ICD-10 pattern matching
5. **Firebase Authentication Integration**: Sign-in, sign-out, token refresh, 401 retry, role extraction
6. **Role-Based Route Guards**: ProtectedRoute component with all role combinations
7. **WebSocket Reconnection Logic**: Exponential backoff calculation, token refresh before reconnect
8. **ICD-10 Validation**: Pattern matching for valid and invalid codes
9. **Form Validation**: Required field checks, future datetime rejection

### Property-Based Test Suite

#### Property 1: Risk Tier Derivation Consistency
- **Generator**: `fc.integer({ min: 0, max: 20 })`
- **Property**: For any risk score, `deriveRiskTier` returns correct tier (1, 2, or 3)
- **Validation**: Check tier boundaries at ≤3, 4-6, ≥7

#### Property 2: ICD-10 Validation Correctness
- **Generator**: `fc.string()` (all strings)
- **Property**: `validateICD10` returns true only for strings matching `[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?`
- **Validation**: Test both valid and invalid codes

#### Property 3: ICD-10 Validation Idempotence
- **Generator**: Valid ICD-10 codes (custom generator)
- **Property**: Validating a valid code twice returns same result
- **Validation**: `validateICD10(s) === validateICD10(s)`

#### Property 4: Escalation Routing Exclusivity
- **Generator**: `fc.record({ riskTier: fc.integer({ min: 1, max: 3 }), confidence: fc.float({ min: 0, max: 1 }) })`
- **Property**: `getEscalationSection` returns exactly one section for any escalation
- **Validation**: Check routing rules (Tier 3 precedence, Tier 2, Human Review)

#### Property 5: Low Confidence Warning Badge Consistency
- **Generator**: `fc.float({ min: 0, max: 1 })`
- **Property**: Warning badge visible iff confidence < 0.6
- **Validation**: `shouldShowLowConfidenceWarning(c) === (c < 0.6)`

#### Property 6: Flagged Phrase Count Invariant
- **Generator**: Random transcripts with varying flagged phrase counts
- **Property**: Highlighted phrase count equals sidebar item count
- **Validation**: Count highlights in DOM, count sidebar items, assert equality

#### Property 7: Sort Operation Reversibility
- **Generator**: `fc.array(dischargeGenerator, { minLength: 2 })`
- **Property**: Ascending sort + reverse = descending sort
- **Validation**: Sort both ways, compare results

#### Property 8: Filter Subset Invariant
- **Generator**: Random discharge lists + random filter combinations
- **Property**: Filtered count ≤ total count; filtered results match all criteria
- **Validation**: Apply filters, verify subset property

#### Property 9: Pagination Row Limit Invariant
- **Generator**: `fc.array(dischargeGenerator, { minLength: 0, maxLength: 100 })`
- **Property**: Each page has ≤ 25 rows
- **Validation**: Paginate list, check each page length

#### Property 10: Form Validation Submission Blocking
- **Generator**: Random form states with varying missing fields
- **Property**: Submission blocked when any required field missing
- **Validation**: Attempt submit, verify POST not called

#### Property 11: Future Datetime Rejection
- **Generator**: `fc.date()` (past, present, future)
- **Property**: Future datetimes rejected, past/present accepted
- **Validation**: Validate datetime, check rejection for future dates

#### Property 12: WebSocket Reconnection Exponential Backoff
- **Generator**: `fc.integer({ min: 0, max: 10 })` (attempt number)
- **Property**: Delay = min(1000 * 2^n, 30000)
- **Validation**: Calculate delay for each attempt, verify formula

#### Property 13: WebSocket Connection Token Gating
- **Generator**: Auth states (unauthenticated, authenticating, authenticated)
- **Property**: Connection only initiated when token available
- **Validation**: Mock auth states, verify connection behavior

#### Property 14: WebSocket Event Idempotence
- **Generator**: Random WebSocket events with duplicate IDs
- **Property**: Processing duplicate event produces same cache state
- **Validation**: Process event twice, compare cache states

#### Property 15: Dashboard Tier Distribution Invariant
- **Generator**: Random dashboard stats with varying tier counts
- **Property**: Sum of tier counts = completedToday count
- **Validation**: Sum tier1 + tier2 + tier3, assert equals completedToday

#### Property 16: Dashboard WebSocket Event Count Updates
- **Generator**: Sequences of random WebSocket events
- **Property**: Counts update correctly; pending calls never negative
- **Validation**: Process events, verify count changes

#### Property 17: Token Refresh Proactive Strategy
- **Generator**: Token expiry times (< 5 min, ≥ 5 min)
- **Property**: Token refreshed when expiry < 5 min
- **Validation**: Mock token expiry, verify refresh called

#### Property 18: Token Refresh Concurrent Request Deduplication
- **Generator**: Multiple concurrent 401 responses
- **Property**: Exactly one refresh initiated
- **Validation**: Mock concurrent 401s, count refresh calls

#### Property 19: Authentication State Resolution Gating
- **Generator**: Auth states (loading, authenticated, unauthenticated)
- **Property**: Protected content only renders after auth resolution
- **Validation**: Mock loading state, verify no protected content renders

#### Property 20: Role-Based Route Access Enforcement
- **Generator**: `fc.constantFrom("nurse", "physician", "admin", "invalid")`
- **Property**: Only valid roles grant access; invalid roles trigger sign-out
- **Validation**: Mock role, verify route access or redirect

### Unit Test Suite

#### Component Tests

**Dashboard**:
- Renders loading skeleton during fetch
- Renders summary cards with correct data
- Renders donut chart with tier distribution
- Renders bar chart with daily volume
- Displays error banner on fetch failure
- Retry button re-triggers fetch

**Discharge Queue**:
- Renders table with discharge rows
- Renders empty state when no discharges
- Opens slide-out drawer on row click (Admin/Nurse)
- Does not open drawer on row click (Physician)
- Displays notification banner on page 2+ when discharge_created event received
- Navigates to page 1 when "Go to page 1" clicked

**Call Transcript Viewer**:
- Renders transcript with speaker labels
- Highlights flagged phrases in red
- Displays risk flags sidebar
- Displays risk score meter with correct value
- Displays tier badge with correct color
- Displays confidence indicator
- Displays "Low Confidence" warning when confidence < 0.6
- Displays "Call not found" on 404

**Escalation Management**:
- Renders Tier 3 alerts in urgent section
- Renders Tier 2 callbacks in callback queue (Nurse/Admin only)
- Renders Human Review items in review queue
- Displays empty state when no escalations
- Adds new escalation to correct section on escalation_triggered event

**Patient List**:
- Renders patient rows with name, DOB, last discharge date
- Sends debounced search request after 300ms
- Displays empty state when no search results
- Navigates to patient detail on row click

**Discharge Intake Form**:
- Renders all form fields
- Displays inline error for missing required fields
- Displays error for invalid ICD-10 code
- Displays error for future discharge datetime
- Submits form data to POST /discharges on valid submission
- Displays success notification on successful submission
- Displays error notification on failed submission
- Creates new patient inline before discharge submission

**Login Page**:
- Renders "Sign in with Google" button
- Calls signInWithPopup on button click
- Displays error message on sign-in failure
- Redirects to originally requested URL after successful sign-in
- Signs out user without role claim and displays error

#### Integration Tests

**Full Dashboard Flow**:
1. Mount Dashboard component
2. Verify loading skeleton displays
3. Mock successful API response
4. Verify summary cards and charts render with data
5. Send discharge_created WebSocket event
6. Verify today's discharges count increments

**Full Discharge Form Flow**:
1. Mount Discharge Form
2. Fill all required fields with valid data
3. Submit form
4. Verify POST /discharges called with correct payload
5. Verify success notification displays

**Firebase Authentication Flow**:
1. Mount app in unauthenticated state
2. Navigate to protected route
3. Verify redirect to /login
4. Click "Sign in with Google"
5. Mock successful sign-in with role claim
6. Verify redirect to originally requested route
7. Verify protected content renders

**Token Refresh Flow**:
1. Mock authenticated state with token expiring in 3 minutes
2. Trigger API request
3. Verify getIdToken(true) called before request
4. Verify request sent with refreshed token

**WebSocket Reconnection Flow**:
1. Establish WebSocket connection
2. Simulate disconnection
3. Verify "Connection lost" banner displays
4. Verify reconnection attempts with exponential backoff
5. Mock successful reconnection
6. Verify banner hidden and queries refetched

### Test Execution

**Local Development**:
```bash
vitest --watch  # Watch mode for TDD
vitest --run    # Single execution for CI
vitest --coverage  # Generate coverage report
```

**CI Pipeline**:
```bash
vitest --run --coverage --reporter=json
```

**Coverage Thresholds** (enforced in CI):
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Demo Mode Testing

**Demo Mode Tests**:
- Demo panel not rendered when `?demo=true` absent
- Demo panel rendered when `?demo=true` present and authenticated
- Redirect to /login when `?demo=true` present but unauthenticated
- Scenario buttons load correct mock data
- Active scenario button highlighted
- "Demo Mode" badge displays in header
- WebSocket connection not initiated in demo mode
- API requests intercepted and resolved against mock data

---
