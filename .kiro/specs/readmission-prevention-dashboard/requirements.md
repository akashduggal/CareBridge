# Requirements Document

## Introduction

The Readmission Prevention Dashboard is a React + TypeScript single-page application (SPA) that enables clinical staff — nurses, physicians, and administrators — to monitor post-discharge patient follow-up calls, view AI-generated risk scores, manage escalations, and create discharge events. The system integrates with a backend API and receives real-time updates via WebSocket to support timely clinical intervention and reduce hospital readmission rates.

The application is deployed on Vercel and built with React, Vite, TypeScript, TailwindCSS, TanStack Query, Recharts, React Router, and Firebase Authentication (Google Sign-In) for identity and role-based access control.

---

## Glossary

- **Dashboard**: The `/dashboard` route displaying aggregate statistics and charts for the current day.
- **Discharge**: A recorded patient discharge event containing diagnosis, medications, and associated call history.
- **Discharge_Queue**: The sortable table on `/discharges` listing all discharge records.
- **Call**: A post-discharge follow-up phone call attempt made by the AI agent to a patient.
- **Transcript**: The full text record of a completed call, segmented by speaker with flagged phrases.
- **Escalation**: A discharge record that has been elevated for human clinical review based on risk tier or low confidence score.
- **Risk_Score**: An integer from 0 to 13+ produced by the AI agent representing readmission risk. Multiple clinical signals can stack, resulting in scores above 10. The score is unbounded on the high end.
- **Risk_Tier**: A classification derived from Risk_Score: Tier 1 (score 0–3, green), Tier 2 (score 4–6, amber), Tier 3 (score ≥ 7, red).
- **Confidence**: A float from 0.0 to 1.0 representing the AI agent's certainty in its risk assessment.
- **Flagged_Phrase**: A segment of call transcript text identified by the AI as clinically significant.
- **Diagnosis_Group**: One of six categories: CHF, COPD, AMI, PNEUMONIA, ORTHO, OTHER.
- **Call_Outcome**: One of five terminal states for a call: completed, voicemail, no_answer, refused, wrong_party.
- **Demo_Mode**: A special application mode activated via the `?demo=true` URL query parameter that loads pre-configured scenario data.
- **WebSocket_Client**: The browser-side WebSocket connection to the `/ws` endpoint that receives real-time server-sent events.
- **TanStack_Query**: The data-fetching and caching library (React Query v5) used for all REST API interactions.
- **ICD-10**: International Classification of Diseases, 10th Revision — a standardized medical diagnosis code.
- **Nurse**: A clinical staff role responsible for Tier 2 callback queue management.
- **Physician**: A clinical staff role with read access to call transcripts and risk flags.
- **Admin**: A clinical staff role with full access to all application features.
- **WCAG_2_1_AA**: Web Content Accessibility Guidelines version 2.1, Level AA — the accessibility compliance target.
- **RTL**: React Testing Library — the component testing utility used alongside Vitest.
- **Vitest**: The unit and component test runner for the application.
- **Firebase_Auth**: Firebase Authentication — the identity provider used for Google Sign-In and session management.
- **Firebase_Custom_Claims**: Role metadata (`role: "nurse" | "physician" | "admin"`) stored in the Firebase ID token, set server-side via the Firebase Admin SDK.
- **Protected_Route**: A React Router route that redirects unauthenticated users to `/login` before rendering.
- **Auth_Context**: A React context providing the current Firebase user, their role, and auth state to all components.
- **Google_Sign_In**: Firebase Authentication's `signInWithPopup` flow using `GoogleAuthProvider`, restricting sign-in to authorized Google accounts only.

---

## Requirements

### Requirement 1: Dashboard Statistics Overview

**User Story:** As a clinical staff member, I want to see today's key metrics at a glance, so that I can quickly assess the current state of post-discharge follow-up activity.

#### Acceptance Criteria

1. WHEN the Dashboard page loads, THE Dashboard SHALL fetch statistics from `GET /dashboard/stats` using TanStack_Query.
2. WHEN the `GET /dashboard/stats` response is received, THE Dashboard SHALL display the count of today's discharges, pending calls, and active escalations as numeric summary cards.
3. WHEN the `GET /dashboard/stats` response is received, THE Dashboard SHALL render a donut chart showing the distribution of Risk_Tier counts (Tier 1, Tier 2, Tier 3) using Recharts.
4. WHEN the `GET /dashboard/stats` response is received, THE Dashboard SHALL render a bar chart showing daily discharge volume for the past 7 days using Recharts.
5. WHILE the `GET /dashboard/stats` request is in-flight, THE Dashboard SHALL display a loading skeleton in place of each summary card and chart.
6. IF the `GET /dashboard/stats` request fails, THEN THE Dashboard SHALL display an inline error message with a retry button without navigating away from the page.
7. WHEN a `discharge_created` WebSocket event is received, THE Dashboard SHALL increment the today's discharges count without requiring a full page reload.
8. WHEN a `call_completed` WebSocket event is received, THE Dashboard SHALL update the pending calls count and Risk_Tier distribution without requiring a full page reload.
9. WHEN a `escalation_triggered` WebSocket event is received, THE Dashboard SHALL increment the active escalations count without requiring a full page reload.
10. THE Dashboard SHALL meet WCAG_2_1_AA requirements, including chart color contrast ratios of at least 4.5:1 and ARIA labels on all chart elements.

#### Correctness Properties

- **Invariant**: FOR ALL valid `GET /dashboard/stats` responses, the sum of Tier 1 + Tier 2 + Tier 3 counts in the donut chart SHALL equal the `completed_today` count, not the `today_discharges` count — pending calls, voicemails, and no-answer attempts have no tier assignment and SHALL NOT be included in the tier distribution.
- **Invariant**: FOR ALL sequences of `call_completed` WebSocket events received, the pending calls count displayed SHALL never be negative.

---

### Requirement 2: Discharge Queue

**User Story:** As a clinical staff member, I want to browse and sort the list of patient discharges, so that I can prioritize follow-up actions based on risk and call status.

#### Acceptance Criteria

1. WHEN the Discharge_Queue page loads, THE Discharge_Queue SHALL fetch discharge records from `GET /discharges` using TanStack_Query.
2. WHEN discharge records are loaded, THE Discharge_Queue SHALL display each record as a table row containing: patient name, Diagnosis_Group badge, discharge datetime, Call_Outcome status pill, and Risk_Tier badge.
3. WHEN a column header is clicked, THE Discharge_Queue SHALL sort the table rows by that column in ascending order; clicking the same header again SHALL sort in descending order.
4. WHEN the Discharge_Queue contains no records, THE Discharge_Queue SHALL display an empty-state illustration and the message "No discharges found."
5. WHILE the `GET /discharges` request is in-flight, THE Discharge_Queue SHALL display a table skeleton with 5 placeholder rows.
6. IF the `GET /discharges` request fails, THEN THE Discharge_Queue SHALL display an inline error banner with a retry button.
7. WHEN a table row is clicked by a user with the Admin or Nurse role, THE Discharge_Queue SHALL open a slide-out drawer displaying the patient's medication list and call history timeline for that discharge.
8. WHEN a table row is clicked by a user with the Physician role, THE Discharge_Queue SHALL NOT respond to the click event — rows SHALL be visually non-interactive for Physician users (no hover state, `cursor: default`) and Physician users access call transcripts only via direct links from escalation cards.
9. WHEN the slide-out drawer is open, THE Discharge_Queue SHALL display each call history entry with its timestamp, Call_Outcome, and Risk_Score if available.
10. WHEN the slide-out drawer is open and the user presses the Escape key, THE Discharge_Queue SHALL close the drawer.
11. WHEN the slide-out drawer is open, THE Discharge_Queue SHALL trap keyboard focus within the drawer until it is closed.
12. THE Discharge_Queue SHALL support filtering by Diagnosis_Group using a multi-select dropdown filter control.
13. THE Discharge_Queue SHALL support filtering by Risk_Tier using a segmented button control with options: All, Tier 1, Tier 2, Tier 3.
14. THE Discharge_Queue SHALL support filtering by Call_Outcome using a multi-select dropdown filter control.
15. WHEN filters are applied, THE Discharge_Queue SHALL display only the rows matching all active filter criteria simultaneously.
16. THE Discharge_Queue SHALL implement pagination displaying 25 rows per page with previous/next page controls and a current page indicator.
17. WHEN a `discharge_created` WebSocket event is received AND the user is viewing page 1, THE Discharge_Queue SHALL prepend the new discharge record to the top of the list without requiring a page reload.
18. WHEN a `discharge_created` WebSocket event is received AND the user is viewing any page other than page 1, THE Discharge_Queue SHALL add the new discharge record to the TanStack_Query cache (so it appears when the user navigates to page 1) AND SHALL display a dismissible notification banner at the top of the table stating "New discharges available" with a "Go to page 1" button — the new record SHALL NOT be inserted into the current page view.
19. WHEN the user clicks "Go to page 1" from the notification banner, THE Discharge_Queue SHALL navigate to page 1 and dismiss the banner.

#### Correctness Properties

- **Invariant**: FOR ALL combinations of active filters, the count of displayed rows SHALL be less than or equal to the total unfiltered row count.
- **Metamorphic**: FOR ALL sort operations, applying ascending sort followed by descending sort on the same column SHALL produce a row order that is the reverse of the ascending sort result.
- **Invariant**: FOR ALL paginated states, the number of rows displayed per page SHALL not exceed 25.

---

### Requirement 3: Call Transcript Viewer

**User Story:** As a physician or nurse, I want to review the full transcript of a completed call with highlighted risk phrases, so that I can understand the clinical context behind a patient's risk score.

#### Acceptance Criteria

1. WHEN the `/calls/{id}` route is navigated to, THE Transcript_Viewer SHALL fetch the transcript from `GET /calls/{id}/transcript` using TanStack_Query.
2. WHEN the transcript is loaded, THE Transcript_Viewer SHALL render each utterance with a speaker label of either "Agent" or "Patient" visually distinguished by alignment and color.
3. WHEN the transcript is loaded, THE Transcript_Viewer SHALL highlight each Flagged_Phrase in red with a tooltip displaying the clinical reason for the flag.
4. WHEN the transcript is loaded, THE Transcript_Viewer SHALL display a risk flags sidebar listing all Flagged_Phrases grouped by clinical category.
5. WHEN the transcript is loaded, THE Transcript_Viewer SHALL display an animated score meter showing the Risk_Score on a scale from 0 to the actual score value, with visual markers at 3 (Tier 1/2 boundary), 6 (Tier 2/3 boundary), and 10+ (high risk zone).
6. WHEN the transcript is loaded, THE Transcript_Viewer SHALL display the Risk_Tier badge with the appropriate color: green for Tier 1, amber for Tier 2, red for Tier 3.
7. WHEN the transcript is loaded, THE Transcript_Viewer SHALL display a confidence indicator showing the Confidence value as a percentage.
8. WHEN the Confidence value is less than 0.6, THE Transcript_Viewer SHALL display a "Low Confidence" warning badge adjacent to the confidence indicator.
9. WHILE the `GET /calls/{id}/transcript` request is in-flight, THE Transcript_Viewer SHALL display a loading skeleton for the transcript area and sidebar.
10. IF the `GET /calls/{id}/transcript` request returns a 404 status, THEN THE Transcript_Viewer SHALL display a "Call not found" message with a link back to the Discharge_Queue.
11. IF the `GET /calls/{id}/transcript` request fails with a non-404 error, THEN THE Transcript_Viewer SHALL display an error message with a retry button.
12. THE Transcript_Viewer SHALL meet WCAG_2_1_AA requirements, including sufficient color contrast for flagged phrase highlights and keyboard-accessible tooltips.

#### Correctness Properties

- **Invariant**: FOR ALL loaded transcripts, the Risk_Tier badge color SHALL be consistent with the Risk_Score value: green if score ≤ 3, amber if score is 4–6, red if score ≥ 7.
- **Invariant**: FOR ALL loaded transcripts, the count of highlighted Flagged_Phrases in the transcript body SHALL equal the count of items listed in the risk flags sidebar.
- **Invariant**: FOR ALL loaded transcripts, the "Low Confidence" warning badge SHALL be visible if and only if the Confidence value is strictly less than 0.6.

---

### Requirement 4: Escalation Management

**User Story:** As a nurse or administrator, I want to view and manage escalated patient cases, so that I can ensure high-risk patients receive timely human follow-up.

#### Acceptance Criteria

1. WHEN the `/escalations` route is navigated to, THE Escalation_View SHALL fetch escalation records from `GET /escalations` using TanStack_Query.
2. WHEN escalation records are loaded, THE Escalation_View SHALL display Tier 2 escalations as callback cards in a dedicated queue section.
3. WHEN escalation records are loaded, THE Escalation_View SHALL display Tier 3 escalations as red alert banners in a separate urgent alerts section above the Tier 2 queue.
4. WHEN escalation records are loaded, THE Escalation_View SHALL display calls with Confidence less than 0.6 AND Risk_Tier less than 3 in a "Human Review" queue section separate from the Tier 2 and Tier 3 sections.
5. WHEN an escalation record has BOTH Risk_Tier 3 (score ≥ 7) AND Confidence < 0.6, THE Escalation_View SHALL display the record ONLY in the Tier 3 urgent alerts section — Tier 3 takes precedence over Human Review for display purposes.
6. WHEN the Escalation_View contains no escalation records in any section, THE Escalation_View SHALL display an empty-state message "No active escalations."
7. WHILE the `GET /escalations` request is in-flight, THE Escalation_View SHALL display loading skeletons for each queue section.
8. IF the `GET /escalations` request fails, THEN THE Escalation_View SHALL display an inline error banner with a retry button.
9. WHEN a `escalation_triggered` WebSocket event is received, THE Escalation_View SHALL add the new escalation record to the appropriate section without requiring a page reload.
10. WHEN a Tier 3 red alert banner is displayed, THE Escalation_View SHALL include the patient name, Risk_Score, Confidence value (if < 0.6), and a direct link to the associated Call transcript.
11. WHEN a Tier 2 callback card is displayed, THE Escalation_View SHALL include the patient name, Diagnosis_Group, discharge datetime, and Risk_Score.
12. WHEN a Human Review queue card is displayed, THE Escalation_View SHALL include the patient name, Confidence value, Risk_Score, and a direct link to the associated Call transcript.
13. THE Escalation_View SHALL meet WCAG_2_1_AA requirements, including ARIA live regions on the Tier 3 alert banners so screen readers announce new urgent alerts.

#### Correctness Properties

- **Invariant**: FOR ALL escalation records displayed, a record SHALL appear in exactly one of the three sections (Tier 2 queue, Tier 3 alerts, Human Review queue) and never in more than one section simultaneously — when a record qualifies for multiple sections, Tier 3 takes precedence over Human Review, and Tier 2 is mutually exclusive with both.
- **Invariant**: FOR ALL records in the Tier 3 alerts section, the associated Risk_Score SHALL be greater than or equal to 7.
- **Invariant**: FOR ALL records in the Human Review queue section, the associated Confidence value SHALL be strictly less than 0.6 AND the Risk_Tier SHALL be less than 3 (Tier 1 or Tier 2 only).

---

### Requirement 5: Patient List and Management

**User Story:** As a clinical staff member, I want to search and browse the patient list, so that I can locate patient records and initiate discharge events.

#### Acceptance Criteria

1. WHEN the `/patients` route is navigated to, THE Patient_List SHALL fetch patient records from `GET /patients` using TanStack_Query.
2. WHEN patient records are loaded, THE Patient_List SHALL display each patient's name, date of birth, and most recent discharge date if available.
3. WHEN the search input receives text input, THE Patient_List SHALL send a debounced server-side search request to `GET /patients?search=<query>` within 300ms of the last keystroke, replacing the current patient list with the search results.
4. WHEN the Patient_List contains no records matching the current search, THE Patient_List SHALL display an empty-state message "No patients found."
5. WHILE a search request (`GET /patients?search=<query>`) is in-flight, THE Patient_List SHALL display a loading skeleton.
6. IF the `GET /patients` request fails, THEN THE Patient_List SHALL display an inline error banner with a retry button.
7. THE Patient_List SHALL implement server-side pagination displaying 25 rows per page with previous/next page controls — pagination parameters SHALL be sent as `GET /patients?page=<n>&limit=25`. WHEN a search query is active, pagination SHALL be combined with the search parameter as `GET /patients?search=<query>&page=<n>&limit=25`.
8. WHEN a patient row is clicked, THE Patient_List SHALL navigate to a patient detail view showing the patient's full discharge history.

#### Correctness Properties

- **Invariant**: FOR ALL non-empty search queries, the count of displayed patient rows SHALL be less than or equal to the total unfiltered patient count returned by `GET /patients` without the search parameter.
- **Round-trip**: FOR ALL search queries, clearing the search input SHALL trigger a request to `GET /patients` without the search parameter, restoring the full unfiltered patient list from the server.

---

### Requirement 6: Discharge Intake Form

**User Story:** As an administrator, I want to create a new discharge event for a patient, so that the AI agent can initiate a post-discharge follow-up call.

#### Acceptance Criteria

1. THE Discharge_Form SHALL allow the user to search for an existing patient by name or create a new patient record inline.
2. THE Discharge_Form SHALL provide a Diagnosis_Group selector with options: CHF, COPD, AMI, PNEUMONIA, ORTHO, OTHER.
3. THE Discharge_Form SHALL provide an ICD-10 code input field that accepts codes matching the pattern `[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?`.
4. THE Discharge_Form SHALL provide a discharge datetime picker that accepts dates and times up to and including the current moment and rejects future datetimes.
5. THE Discharge_Form SHALL provide a medication list editor allowing the user to add medication rows (name and dosage) and remove existing rows.
6. THE Discharge_Form SHALL provide a risk level selector with options: Low, Medium, High.
7. WHEN the form is submitted, THE Discharge_Form SHALL validate that patient, Diagnosis_Group, ICD-10 code, discharge datetime, and at least one medication row are all present.
8. IF any required field is missing on submission, THEN THE Discharge_Form SHALL display an inline validation error message adjacent to each missing field without submitting the form.
9. IF the ICD-10 code does not match the required pattern on submission, THEN THE Discharge_Form SHALL display the error "Invalid ICD-10 code format" adjacent to the ICD-10 field.
10. IF the discharge datetime is set to a future value on submission, THEN THE Discharge_Form SHALL display the error "Discharge time cannot be in the future" adjacent to the datetime field.
11. WHEN all validation passes, THE Discharge_Form SHALL submit the form data to `POST /discharges` and display a success notification upon a 201 response.
12. IF the `POST /discharges` request fails, THEN THE Discharge_Form SHALL display an error notification with the server error message and keep the form data intact.
13. WHEN a new patient is created inline, THE Discharge_Form SHALL submit the patient data to `POST /patients` before submitting the discharge, and SHALL display an error if patient creation fails.
14. THE Discharge_Form SHALL meet WCAG_2_1_AA requirements, including associated `<label>` elements for all form inputs and descriptive error messages linked via `aria-describedby`.

#### Correctness Properties

- **Invariant**: FOR ALL form submission attempts, THE Discharge_Form SHALL never call `POST /discharges` when any required field fails validation.
- **Invariant**: FOR ALL medication list states, the remove button for a medication row SHALL be present if and only if there is more than one row in the list.
- **Round-trip**: FOR ALL valid ICD-10 codes accepted by the form, the code stored in the submitted payload SHALL be identical to the value entered by the user without transformation.

---

### Requirement 7: Real-Time WebSocket Updates

**User Story:** As a clinical staff member, I want the application to reflect live changes without manual refresh, so that I always see the most current patient and call status.

#### Acceptance Criteria

1. WHEN the application initializes, THE WebSocket_Client SHALL NOT establish a connection to the `/ws` endpoint until the Firebase auth state has been resolved and a valid Firebase ID token is available.
2. WHEN a valid Firebase ID token is available, THE WebSocket_Client SHALL establish a connection to the `/ws` endpoint, passing the token as a query parameter: `/ws?token=<firebase_id_token>`.
3. WHEN a `call_completed` WebSocket event is received, THE WebSocket_Client SHALL update the relevant call record in the TanStack_Query cache with the new tier and score values.
4. WHEN a `discharge_created` WebSocket event is received, THE WebSocket_Client SHALL prepend the new discharge record to the TanStack_Query cache for the discharges list.
5. WHEN a `call_started` WebSocket event is received, THE WebSocket_Client SHALL update the relevant discharge record's call status in the TanStack_Query cache.
6. WHEN a `escalation_triggered` WebSocket event is received, THE WebSocket_Client SHALL add the new escalation to the TanStack_Query cache for the escalations list.
7. WHEN the WebSocket connection is lost, THE WebSocket_Client SHALL attempt to reconnect using exponential backoff starting at 1 second, doubling each attempt, up to a maximum interval of 30 seconds.
8. WHEN reconnecting after a disconnection, THE WebSocket_Client SHALL obtain a fresh Firebase ID token via `getIdToken(true)` before each reconnection attempt to ensure the token is not expired.
9. WHILE the WebSocket connection is disconnected, THE Application SHALL display a persistent "Connection lost — reconnecting…" status banner at the top of the page.
10. WHEN the WebSocket connection is successfully re-established after a disconnection, THE Application SHALL hide the disconnection banner and SHALL refetch all active TanStack_Query queries to reconcile any missed updates.
11. IF the WebSocket connection fails to reconnect after 5 consecutive attempts, THEN THE Application SHALL display a "Connection failed — please refresh the page" message in place of the reconnecting banner.
12. THE WebSocket_Client SHALL ignore and log to the browser console any received event with an unrecognized event type.

#### Correctness Properties

- **Invariant**: FOR ALL sequences of WebSocket reconnection attempts, the delay between consecutive attempts SHALL be non-decreasing and SHALL not exceed 30 seconds.
- **Invariant**: FOR ALL WebSocket connection attempts (initial and reconnection), the connection SHALL NOT be initiated unless a valid, non-expired Firebase ID token is available.
- **Idempotence**: FOR ALL duplicate WebSocket events with the same event ID received within a single auth session (from sign-in to sign-out), processing the event a second time SHALL produce the same application cache state as processing it once. The deduplication cache SHALL be cleared on sign-out, allowing the same event ID to be processed again in a subsequent auth session.

---

### Requirement 8: Demo Mode

**User Story:** As a product demonstrator or developer, I want to activate a demo mode with pre-configured scenarios, so that I can showcase the application's capabilities without live backend data.

> **Auth behavior in Demo Mode**: Demo Mode requires a valid authenticated session. The `?demo=true` parameter activates the demo panel but does NOT bypass Firebase Authentication. Demonstrators must sign in with a dedicated demo Admin account. This prevents accidental exposure of the demo panel to unauthenticated users and keeps the auth flow visible during demos.

#### Acceptance Criteria

1. WHEN the application URL contains the query parameter `?demo=true` AND the user is authenticated, THE Demo_Panel SHALL be visible as a floating panel in the bottom-right corner of the screen.
2. WHEN the application URL contains `?demo=true` but the user is NOT authenticated, THE Application SHALL redirect to `/login` with the `redirect` parameter preserving the `?demo=true` URL, so the demo panel activates automatically after sign-in.
3. WHEN the application URL does not contain `?demo=true`, THE Demo_Panel SHALL not be rendered in the DOM.
4. THE Demo_Panel SHALL display three scenario buttons: "Happy Path CHF", "Medium Risk COPD", and "Emergency Chest Pain".
5. WHEN the "Happy Path CHF" scenario button is clicked, THE Demo_Panel SHALL load pre-configured data representing a Tier 1 CHF discharge with a completed call and Risk_Score of 2.
6. WHEN the "Medium Risk COPD" scenario button is clicked, THE Demo_Panel SHALL load pre-configured data representing a Tier 2 COPD discharge with a completed call and Risk_Score of 5.
7. WHEN the "Emergency Chest Pain" scenario button is clicked, THE Demo_Panel SHALL load pre-configured data representing a Tier 3 AMI discharge with a completed call, Risk_Score of 9, and an active escalation.
8. WHEN a demo scenario is loaded, THE Demo_Panel SHALL override TanStack_Query cache entries with the scenario's mock data so all pages reflect the scenario state.
9. WHEN a demo scenario is loaded, THE Demo_Panel SHALL highlight the active scenario button to indicate the currently loaded scenario.
10. WHEN a demo scenario is active, THE Application SHALL display a "Demo Mode" badge in the application header.
11. WHERE Demo_Mode is active, THE WebSocket_Client SHALL NOT connect to the live `/ws` endpoint; instead it SHALL simulate WebSocket events for the active scenario using a local mock emitter.
12. WHEN Demo_Mode is active, ALL outbound REST API requests SHALL be intercepted and resolved against the scenario's mock data — no real network requests SHALL be made to the backend.

#### Correctness Properties

- **Invariant**: FOR ALL demo scenarios, the Risk_Tier badge color displayed on the Dashboard and Discharge_Queue SHALL be consistent with the scenario's defined Risk_Score.
- **Invariant**: FOR ALL demo scenarios, the "Emergency Chest Pain" scenario SHALL always produce a Tier 3 escalation entry in the Escalation_View.
- **Invariant**: WHEN Demo_Mode is active, no outbound network request SHALL reach the real backend API or WebSocket endpoint.

---

### Requirement 9: Accessibility (WCAG 2.1 AA)

**User Story:** As a clinical staff member using assistive technology, I want the application to be fully navigable by keyboard and screen reader, so that I can perform all clinical tasks regardless of my accessibility needs.

#### Acceptance Criteria

1. THE Application SHALL provide a visible keyboard focus indicator on all interactive elements meeting a minimum contrast ratio of 3:1 against adjacent colors.
2. THE Application SHALL ensure all images and icons that convey meaning have descriptive `alt` text or `aria-label` attributes.
3. THE Application SHALL ensure all form inputs have programmatically associated `<label>` elements or `aria-label` attributes.
4. THE Application SHALL ensure color is never the sole means of conveying information (e.g., Risk_Tier badges SHALL include text labels in addition to color).
5. THE Application SHALL ensure all modal dialogs and slide-out drawers trap keyboard focus while open and return focus to the triggering element when closed.
6. THE Application SHALL ensure all data tables have `<th>` elements with appropriate `scope` attributes.
7. THE Application SHALL ensure all error messages are announced by screen readers via `aria-live` regions or `role="alert"`.
8. THE Application SHALL ensure the color contrast ratio of all text against its background meets a minimum of 4.5:1 for normal text and 3:1 for large text.
9. THE Application SHALL be fully operable using only a keyboard, with no functionality requiring a mouse or pointer device.
10. WHERE charts are displayed, THE Application SHALL provide a text-based alternative representation of the chart data accessible to screen readers.

---

### Requirement 10: Responsive Layout

**User Story:** As a clinical staff member accessing the application from a tablet or workstation, I want the layout to adapt to my screen size, so that I can use the application effectively on any device.

#### Acceptance Criteria

1. THE Application SHALL implement a responsive layout supporting three breakpoints: mobile (< 768px), tablet (768px–1279px), and desktop (≥ 1280px).
2. WHILE the viewport width is less than 768px, THE Application SHALL display the navigation as a collapsible hamburger menu.
3. WHILE the viewport width is 768px to 1279px (tablet), THE Application SHALL display the navigation as a collapsible hamburger menu to preserve horizontal space for content.
4. WHILE the viewport width is 1280px or greater (desktop), THE Application SHALL display the navigation as a persistent sidebar.
5. WHILE the viewport width is less than 768px, THE Discharge_Queue SHALL display a card-based layout instead of a table layout.
6. WHILE the viewport width is 768px to 1279px (tablet), THE Discharge_Queue SHALL display a table layout with horizontally scrollable overflow if needed.
7. WHILE the viewport width is less than 768px, THE Dashboard charts SHALL stack vertically and each chart SHALL occupy the full viewport width.
8. WHILE the viewport width is 768px to 1279px (tablet), THE Dashboard charts SHALL stack vertically with each chart occupying the full content width.
9. WHILE the viewport width is 1280px or greater (desktop), THE Dashboard charts SHALL display side by side in a two-column grid.
10. THE Application SHALL not display a horizontal scrollbar at any of the three defined breakpoints when content fits within the viewport.

---

### Requirement 11: TypeScript Type Safety

**User Story:** As a frontend developer, I want all API response shapes and domain entities to be defined as TypeScript types, so that type errors are caught at compile time rather than at runtime.

#### Acceptance Criteria

1. THE Application SHALL define a `Patient` TypeScript interface containing at minimum: `id`, `name`, `dateOfBirth`, and `lastDischargeDate` (optional).
2. THE Application SHALL define a `Medication` TypeScript interface containing at minimum: `name` (string), `dose` (string), `frequency` (string), and `newMed` (boolean indicating if this is a new medication prescribed at discharge).
3. THE Application SHALL define a `Discharge` TypeScript interface containing at minimum: `id`, `patientId`, `diagnosisGroup` (typed as `DiagnosisGroup` union), `dischargeDateTime`, `medications` (array of `Medication`), `riskLevel`, and `callStatus`.
4. THE Application SHALL define a `Call` TypeScript interface containing at minimum: `id`, `dischargeId`, `outcome` (typed as `CallOutcome` union), `riskScore` (optional), `confidence` (optional), and `transcript` (optional).
5. THE Application SHALL define a `DiagnosisGroup` TypeScript union type with members: `"CHF" | "COPD" | "AMI" | "PNEUMONIA" | "ORTHO" | "OTHER"`.
6. THE Application SHALL define a `CallOutcome` TypeScript union type with members: `"completed" | "voicemail" | "no_answer" | "refused" | "wrong_party"`.
7. THE Application SHALL define a `RiskTier` TypeScript union type with members: `1 | 2 | 3`.
8. THE Application SHALL define a `WebSocketEvent` TypeScript discriminated union covering all four event types: `call_completed`, `discharge_created`, `call_started`, `escalation_triggered`. Each event SHALL include an `id` field (string UUID) for idempotency checking and a `type` field for discrimination.
9. THE Application SHALL define a `DashboardStats` TypeScript interface matching the shape of the `GET /dashboard/stats` response.
10. THE Application SHALL compile with zero TypeScript errors using `strict: true` in `tsconfig.json`.
11. THE Application SHALL not use the `any` type except in explicitly justified cases documented with an inline comment.

---

### Requirement 12: Testing Strategy (TDD)

**User Story:** As a developer, I want a comprehensive test suite written before implementation, so that I can verify correctness of critical paths and prevent regressions.

#### Acceptance Criteria

1. THE Test_Suite SHALL use Vitest as the test runner and React Testing Library (RTL) for component tests.
2. THE Test_Suite SHALL achieve a minimum of 80% line coverage on the following critical paths: Risk_Score display logic, Risk_Tier derivation, escalation routing display, Discharge_Form submission, Firebase Authentication integration (sign-in, sign-out, token refresh, 401 retry), and role-based route guards.
3. WHEN a utility function that derives Risk_Tier from Risk_Score is implemented, THE Test_Suite SHALL include a property-based test verifying that for all integers in [0, 20], the derived tier is exactly one of Tier 1, Tier 2, or Tier 3, with the tier boundaries at score ≤ 3 (Tier 1), score 4–6 (Tier 2), and score ≥ 7 (Tier 3).
4. WHEN the Discharge_Form is implemented, THE Test_Suite SHALL include component tests verifying that the form does not call `POST /discharges` when any required field is absent.
5. WHEN the WebSocket reconnection logic is implemented, THE Test_Suite SHALL include unit tests verifying that reconnection delays follow exponential backoff and do not exceed 30 seconds.
6. WHEN the Transcript_Viewer is implemented, THE Test_Suite SHALL include component tests verifying that the count of highlighted phrases in the transcript equals the count of items in the risk flags sidebar.
7. WHEN the Discharge_Queue sort logic is implemented, THE Test_Suite SHALL include property-based tests verifying that sorting by any column produces a result where no row appears more than once (no duplicates).
8. WHEN the ICD-10 validation utility is implemented, THE Test_Suite SHALL include property-based tests verifying that all strings accepted by the validator match the pattern `[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?` and all strings rejected do not.
9. THE Test_Suite SHALL include integration tests for the full Dashboard page flow: mount → loading state → data loaded → WebSocket event → updated count.
10. THE Test_Suite SHALL include integration tests for the full Discharge_Form flow: fill valid data → submit → success notification displayed.
11. WHEN the Demo_Mode panel is implemented, THE Test_Suite SHALL include component tests verifying that the Demo_Panel is not rendered when `?demo=true` is absent from the URL.
12. THE Test_Suite SHALL be runnable with the command `vitest --run` for single-execution CI compatibility.
13. WHEN the Firebase Authentication integration is implemented, THE Test_Suite SHALL include component tests verifying that protected routes redirect unauthenticated users to `/login` and that the "Sign in with Google" button triggers `signInWithPopup` with `GoogleAuthProvider`.
14. WHEN role-based access is implemented, THE Test_Suite SHALL include component tests verifying that a user with the Physician role cannot see the Discharge_Form submit button and cannot access Admin-only routes.
15. WHEN the token refresh interceptor is implemented, THE Test_Suite SHALL include unit tests verifying that concurrent 401 responses trigger exactly one token refresh call, and that all waiting requests retry with the refreshed token.
16. WHEN the Firebase auth state resolver is implemented, THE Test_Suite SHALL include integration tests verifying that the application displays a loading spinner until auth state is resolved, and never renders protected content before resolution completes.

#### Correctness Properties

- **Round-trip (ICD-10 validator)**: FOR ALL strings `s` accepted by the ICD-10 validator, applying the validator to `s` a second time SHALL return the same accepted result (idempotent validation).
- **Invariant (Risk_Tier derivation)**: FOR ALL integers `n` in [0, 20], `deriveRiskTier(n)` SHALL return exactly one value from `{1, 2, 3}` with no overlap between tier ranges: Tier 1 if n ≤ 3, Tier 2 if 4 ≤ n ≤ 6, Tier 3 if n ≥ 7.
- **Metamorphic (sort)**: FOR ALL discharge lists of length ≥ 2, sorting by a column in ascending order and then reversing the result SHALL produce the same order as sorting by that column in descending order.

---

### Requirement 13: Error and Empty States

**User Story:** As a clinical staff member, I want clear feedback when data is unavailable or an error occurs, so that I understand the application state and know what action to take.

#### Acceptance Criteria

1. THE Application SHALL define and apply a consistent empty-state component used across all list and table views when no data is available.
2. THE Application SHALL define and apply a consistent error-state component used across all data-fetching views when a request fails.
3. WHEN an error-state component is displayed, THE Application SHALL include a retry action that re-triggers the failed TanStack_Query fetch.
4. WHEN a success notification is displayed after form submission, THE Application SHALL automatically dismiss the notification after 5 seconds IF the notification contains only status text (e.g., "Discharge created successfully"). IF the notification contains actionable content (e.g., a "View discharge" link), THE Application SHALL keep the notification visible until the user explicitly dismisses it or takes the action.
5. WHEN an error notification is displayed after form submission, THE Application SHALL keep the notification visible until the user explicitly dismisses it.
6. IF a navigation route does not match any defined route, THEN THE Application SHALL display a 404 not-found page with a link to the Dashboard.
7. THE Application SHALL display all error messages in plain language without exposing raw HTTP status codes or stack traces to the user.

---

### Requirement 14: Authentication and Authorization (Firebase)

**User Story:** As a clinical staff member, I want to securely log in with my credentials and have the application enforce role-based access, so that only authorized users can access sensitive patient data and clinical actions.

#### Acceptance Criteria

1. WHEN the application loads, THE Auth_Context SHALL initialize Firebase Authentication and observe the Firebase auth state change listener to determine if a user is authenticated.
2. WHILE the Firebase auth state is being resolved on initial load, THE Application SHALL display a full-screen loading spinner and SHALL NOT render any protected route content.
3. WHEN a user navigates to any protected route while unauthenticated, THE Application SHALL redirect them to `/login` and preserve the originally requested URL as a `redirect` query parameter.
4. WHEN the user is redirected to `/login` with a `redirect` parameter, THE Application SHALL navigate to the originally requested URL upon successful sign-in.
5. THE Login_Page SHALL display a "Sign in with Google" button as the sole authentication method.
6. WHEN the "Sign in with Google" button is clicked, THE Login_Page SHALL call Firebase Authentication's `signInWithPopup` method using `GoogleAuthProvider`.
7. IF the Google Sign-In popup is dismissed or fails (e.g., network error, popup blocked), THEN THE Login_Page SHALL display a user-friendly error message without exposing raw Firebase error codes.
8. WHEN sign-in succeeds, THE Application SHALL verify the signed-in Google account has an assigned role in Firebase Custom Claims (`role` field). IF no role claim exists, THE Application SHALL sign the user out immediately and display the error "Your account is not authorized to access this application."
9. WHEN sign-in succeeds and a valid role claim exists, THE Application SHALL store the Firebase user and their role in Auth_Context.
10. WHEN the user clicks "Sign Out", THE Application SHALL call Firebase Authentication's `signOut` method, clear Auth_Context, and redirect to `/login`.
10. THE Application SHALL attach the Firebase ID token as a `Bearer` token in the `Authorization` header of all requests made to the backend REST API and WebSocket endpoint.
11. THE Application SHALL implement an HTTP request interceptor that, before every outbound API request, checks whether the Firebase ID token expires within the next 5 minutes and proactively refreshes it via `getIdToken(true)` before attaching it to the request.
12. IF a backend API request returns an HTTP 401 response, THEN THE Application SHALL attempt to refresh the Firebase ID token once via `getIdToken(true)`, then automatically retry the original request exactly once with the new token. IF the retry also returns 401, THEN THE Application SHALL sign the user out and redirect to `/login`.
13. THE Application SHALL never queue or retry more than one token refresh at a time — concurrent requests that encounter a 401 SHALL wait for the single in-flight refresh to complete before retrying with the refreshed token.
14. THE Application SHALL enforce the following role-based access rules:
    - **Nurse**: Access to `/dashboard`, `/discharges`, `/escalations` (Tier 2 queue and Human Review queue only), `/patients`, and `/calls/{id}` (read-only).
    - **Physician**: Access to `/dashboard`, `/discharges` (read-only — table rows are visually non-interactive with no click handler), `/patients`, and `/calls/{id}` (read-only, accessible only via direct link from escalation cards).
    - **Admin**: Full access to all routes including the Discharge_Form and all escalation sections.
15. WHEN a user with the Nurse or Physician role attempts to access a route restricted to Admin (e.g., the Discharge_Form), THE Application SHALL display a "You don't have permission to access this page" message and a link back to the Dashboard.
16. THE Discharge_Form submit button SHALL be visible only to users with the Admin role; users with Nurse or Physician roles SHALL see the form in read-only mode if they navigate to it.
17. THE Escalation_View Tier 3 urgent alerts section SHALL be visible to all authenticated roles; the Tier 2 callback queue SHALL be visible to Nurse and Admin roles only.
18. THE Login_Page SHALL meet WCAG_2_1_AA requirements, including a descriptive `aria-label` on the "Sign in with Google" button and error messages announced via `role="alert"`.
19. THE Application SHALL not store the Firebase ID token in `localStorage`; Firebase SDK manages token persistence via `IndexedDB` by default.

#### Correctness Properties

- **Invariant**: FOR ALL authenticated sessions, every REST API request and WebSocket connection attempt SHALL include a valid, non-expired Firebase ID token in the `Authorization` header.
- **Invariant**: FOR ALL role values read from Firebase custom claims, the role SHALL be exactly one of `"nurse"`, `"physician"`, or `"admin"` — any other value SHALL be treated as unauthenticated and redirect to `/login`.
- **Round-trip**: FOR ALL sign-in → sign-out → sign-in sequences with the same credentials, the user's role and accessible routes SHALL be identical across both authenticated sessions.
- **Invariant**: FOR ALL unauthenticated navigation attempts to a protected route, THE Application SHALL never render protected route content before auth state is resolved.
- **Invariant**: FOR ALL concurrent API requests that receive a 401 response simultaneously, exactly one token refresh SHALL be initiated — subsequent requests SHALL wait for that single refresh and reuse the resulting token, never triggering parallel refresh calls.
