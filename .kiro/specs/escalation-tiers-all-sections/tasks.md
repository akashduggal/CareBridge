# Implementation Plan: Escalation Tiers — All Sections Always Visible

## Overview

Extend `getEscalationSection` to classify Tier 1 high-confidence records, then refactor `EscalationPage.tsx` to always render all four tier sections with per-section empty states. Add a `Tier1MonitoredCard` and `SectionEmptyState` inline component, update the loading skeleton count, and write property-based and example-based tests covering all new behavior.

All changes are confined to `src/utils/riskUtils.ts` and `src/pages/EscalationPage.tsx`, plus a new test file.

---

## Tasks

- [x] 1. Extend `getEscalationSection` in `src/utils/riskUtils.ts`
  - [x] 1.1 Update the return type from `'tier3' | 'tier2' | 'humanReview'` to `'tier3' | 'tier2' | 'humanReview' | 'tier1'`
  - [x] 1.2 Fix routing precedence to: Tier 3 → Human Review → Tier 2 → Tier 1
    - New routing table (in order):
      1. `riskTier === 3` → `'tier3'`
      2. `confidence < 0.6 && riskTier < 3` → `'humanReview'`
      3. `riskTier === 2 && confidence >= 0.6` → `'tier2'`
      4. `riskTier === 1 && confidence >= 0.6` → `'tier1'`
      5. anything else → throw (unchanged)
    - _Requirements: 4.1, 4.3_
  - [ ]* 1.3 Update existing `getEscalationSection` unit tests in `src/tests/riskUtils.test.ts`
    - Add example tests: `getEscalationSection(1, 0.6)` → `'tier1'`, `getEscalationSection(1, 1.0)` → `'tier1'`
    - Update the existing test that asserts `getEscalationSection(2, 0.0)` → `'tier2'` to instead assert it returns `'humanReview'` (confidence 0.0 < 0.6 takes precedence)
    - Update the existing test that asserts `getEscalationSection(2, 0.8)` → `'tier2'` — this remains correct
    - Update the existing Property 4 test in `src/tests/riskUtils.test.ts` to include `'tier1'` in `validSections` and add the Tier 1 routing assertion
    - _Requirements: 4.1_

- [x] 2. Add `SectionEmptyState` and `Tier1MonitoredCard` inline components in `EscalationPage.tsx`
  - [x] 2.1 Add `SectionEmptyState` inline component (above `EscalationPage` function, alongside other section sub-components)
    - Props: `{ message: string }`
    - Render a `<p>` with muted gray styling (`text-sm text-gray-400 py-4`); no `aria-hidden`; no `display:none`
    - Do not use the existing `EmptyState` component — this is a lightweight inline variant
    - _Requirements: 2.1, 2.2, 2.5, 5.3_
  - [x] 2.2 Add `Tier1MonitoredCard` inline component (alongside other section sub-components)
    - Props: `{ escalation: Escalation }`
    - Style with green tones (`border-green-200 bg-green-50`)
    - Display: patient name (`text-green-900 font-semibold`), `RiskTierBadge` (tier 1), `DiagnosisGroupBadge`, discharge date/time via `formatDateTime`
    - _Requirements: 1.3_

- [x] 3. Refactor partition logic in `EscalationPage` to include `tier1[]`
  - Add `const tier1: Escalation[] = []` alongside the existing `tier3`, `tier2`, `humanReview` arrays
  - In the `for` loop, add `else if (section === 'tier1') tier1.push(esc)` branch (the existing `else humanReview.push(esc)` catch-all must be replaced with explicit `else if (section === 'humanReview') humanReview.push(esc)` and a final `else tier1.push(esc)`)
  - Remove the `allEmpty` constant — it is no longer used
  - _Requirements: 1.1, 4.1_

- [x] 4. Refactor `EscalationPage` render to always show all four sections
  - [x] 4.1 Remove the `allEmpty` guard and the global `<EmptyState message="No active escalations" />` fallback
    - Replace the `{!isLoading && !isError && !allEmpty && (...)}` block with `{!isLoading && !isError && (...)}`
    - _Requirements: 1.1, 1.7_
  - [x] 4.2 Render Tier 3 section unconditionally (remove the `{tier3.length > 0 && ...}` guard)
    - When `tier3.length === 0`, render `<SectionEmptyState message="No urgent alerts" />` in place of the banner list
    - Keep the existing `aria-live="polite"` region; it wraps the banner list or the empty state
    - `aria-label="Tier 3 Urgent Alerts"` on the `<section>` element
    - _Requirements: 1.1, 1.2, 2.1, 5.1, 5.2_
  - [x] 4.3 Render Tier 2 section unconditionally for non-Physician (remove the `{!isPhysician && tier2.length > 0 && ...}` guard, keep the `!isPhysician` role gate)
    - When `tier2.length === 0`, render `<SectionEmptyState message="No callbacks pending" />`
    - `aria-label="Tier 2 Callback Queue"` on the `<section>` element
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 5.1_
  - [x] 4.4 Render Human Review section unconditionally (remove the `{humanReview.length > 0 && ...}` guard)
    - When `humanReview.length === 0`, render `<SectionEmptyState message="No cases for review" />`
    - `aria-label="Human Review"` on the `<section>` element
    - _Requirements: 1.1, 1.2, 2.1, 3.3, 5.1_
  - [x] 4.5 Add Tier 1 Monitored section (new, always rendered for all roles)
    - When `tier1.length > 0`, render `Tier1MonitoredCard` for each record
    - When `tier1.length === 0`, render `<SectionEmptyState message="No monitored patients" />`
    - Section heading: `"Tier 1 — Monitored"` in green (`text-green-700`)
    - `aria-label="Tier 1 Monitored"` on the `<section>` element
    - Place below Human Review in the DOM (last section)
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 3.3, 5.1_

- [x] 5. Update loading skeleton to four skeletons
  - Change the loading `<div className="space-y-8">` block from three `<SectionSkeleton />` to four
  - _Requirements: 1.5_

- [x] 6. Checkpoint — verify existing tests still pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write example-based tests for new behavior in `src/tests/escalationPage.test.tsx`
  - [x] 7.1 Test: all four sections render when data loads with zero records (all-empty state)
    - Assert Tier 3, Human Review, Tier 1 sections are in the DOM
    - Assert Tier 2 section is in the DOM for Nurse/Admin role
    - Assert the global "No active escalations" text is absent
    - Assert each section contains its correct empty state message
    - _Requirements: 1.1, 1.2, 1.7, 2.1_
  - [x] 7.2 Test: four loading skeletons render while query is in-flight
    - Assert four `role="status"` elements (SkeletonCard) are present during loading
    - _Requirements: 1.5_
  - [x] 7.3 Test: Tier 1 Monitored section renders `Tier1MonitoredCard` for a qualifying record
    - Use `makeEscalation({ riskTier: 1, riskScore: 2, confidence: 0.8 })`
    - Assert patient name, RiskTierBadge, DiagnosisGroupBadge, and formatted discharge date appear inside `aria-label="Tier 1 Monitored"` section
    - _Requirements: 1.3_
  - [x] 7.4 Test: Tier 1 record with confidence < 0.6 routes to Human Review, not Tier 1 Monitored
    - Use `makeEscalation({ riskTier: 1, riskScore: 2, confidence: 0.4 })`
    - Assert patient name appears in Human Review section
    - Assert Tier 1 Monitored section shows "No monitored patients"
    - _Requirements: 4.1_
  - [x] 7.5 Test: Tier 2 section shows "No callbacks pending" empty state for Nurse when no Tier 2 records exist
    - _Requirements: 2.1_
  - [x] 7.6 Test: Tier 2 section absent for Physician even when all-empty (role gate still applies)
    - Assert `queryByRole('region', { name: /tier 2 callback queue/i })` returns null for Physician
    - _Requirements: 3.1_
  - [x] 7.7 Test: WebSocket `escalation_triggered` event replaces Tier 1 empty state with a card
    - Start with empty data, assert "No monitored patients" is shown
    - Inject a Tier 1 record via `qc.setQueryData`, assert the card appears and empty state is gone
    - _Requirements: 2.3_
  - [x] 7.8 Test: section DOM order is Tier 3 → Tier 2 → Human Review → Tier 1 for Nurse role
    - Assert heading order using `getAllByRole('heading', { level: 2 })` index comparison
    - _Requirements: 1.4_
  - [ ]* 7.9 Update the existing "shows empty state when no escalations exist" test
    - The old test asserts `screen.getByText(/no active escalations/i)` — update it to assert per-section empty state messages instead
    - _Requirements: 1.7, 2.1_

- [ ] 8. Write property-based tests in `src/tests/escalationPage.test.tsx`
  - [ ]* 8.1 Write property test for Property 1: All sections always present
    - **Property 1: All sections always present**
    - **Validates: Requirements 1.1, 3.2, 3.3**
    - Generate random `Escalation[]` arrays (including empty) using `fc.array(fc.record({...}))` with `riskTier: fc.integer({ min: 1, max: 3 })` and `confidence: fc.float({ min: 0, max: 1, noNaN: true })`
    - Render `EscalationPage` as Nurse; assert `getByRole('region', { name: /tier 3 urgent alerts/i })`, `getByRole('region', { name: /tier 2 callback queue/i })`, `getByRole('region', { name: /human review/i })`, `getByRole('region', { name: /tier 1 monitored/i })` are all in the DOM
    - Minimum 100 runs (`numRuns: 100`)
  - [ ]* 8.2 Write property test for Property 2: Correct empty state message per section
    - **Property 2: Correct empty state message per section**
    - **Validates: Requirements 1.2, 2.1**
    - Generate escalation sets where a specific section is forced empty (e.g., no records with `riskTier === 3` for Tier 3 empty)
    - For each empty section, assert the exact message string is rendered inside that section element using `within(section).getByText(...)`
    - Minimum 100 runs
  - [ ]* 8.3 Write property test for Property 3: Section DOM order invariant
    - **Property 3: Section DOM order invariant**
    - **Validates: Requirements 1.4**
    - Generate random escalation arrays; render as Nurse/Admin
    - Assert DOM position order: Tier 3 before Tier 2, Tier 2 before Human Review, Human Review before Tier 1 using `compareDocumentPosition` or heading index comparison
    - Minimum 100 runs
  - [ ]* 8.4 Write property test for Property 4: Tier 2 hidden for Physician, visible for all other roles
    - **Property 4: Tier 2 hidden for Physician, visible for all other roles**
    - **Validates: Requirements 3.1, 3.2**
    - Generate random escalation arrays; render as Physician and assert Tier 2 section absent; render as Nurse and assert Tier 2 section present
    - Minimum 100 runs
  - [ ]* 8.5 Write property test for Property 5: Each record routed to exactly one section
    - **Property 5: Each record routed to exactly one section**
    - **Validates: Requirements 4.1**
    - Generate random `Escalation` arrays with varying `riskTier` (1–3) and `confidence` (0.0–1.0)
    - Call `getEscalationSection` for each record; collect qualifying records (those that don't throw)
    - Assert the union of all section arrays equals the qualifying set with no duplicates (sum of section counts equals qualifying count)
    - Minimum 100 runs
  - [ ]* 8.6 Write property test for Property 6: Tier 3 precedence over Human Review
    - **Property 6: Tier 3 precedence over Human Review**
    - **Validates: Requirements 4.3**
    - Generate records with `riskTier === 3` and `confidence` drawn from `fc.float({ min: 0, max: 0.59, noNaN: true })`
    - Assert `getEscalationSection(3, confidence)` returns `'tier3'` for all of them
    - Minimum 100 runs
  - [ ]* 8.7 Write property test for Property 7: Section aria-labels are always correct
    - **Property 7: Section aria-labels are always correct**
    - **Validates: Requirements 5.1**
    - Generate random escalation arrays; render as Nurse/Admin
    - Assert each rendered `<section>` element has the correct `aria-label` attribute: "Tier 3 Urgent Alerts", "Tier 2 Callback Queue", "Human Review", "Tier 1 Monitored"
    - Minimum 100 runs

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `@fast-check/vitest` (`test.prop`) and `fast-check` (`fc`) — both already installed
- The `SectionEmptyState` component is intentionally lightweight and inline; do not reuse the existing `EmptyState` component (different visual weight)
- The `allEmpty` constant and the global `<EmptyState message="No active escalations" />` are removed entirely — this is a breaking change to the existing "shows empty state when no escalations exist" test (task 7.9 updates it)
- WCAG 2.1 AA compliance for new section headers and empty state text is achieved by using the same Tailwind color palette already validated in `colorContrast.test.tsx`; full validation requires manual testing with assistive technologies
- The existing `aria-live="polite"` region on the Tier 3 section is preserved (Req 5.2)
- No backend changes are required
