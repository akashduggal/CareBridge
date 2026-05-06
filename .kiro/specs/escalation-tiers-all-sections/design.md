# Design Document — Escalation Tiers: All Sections Always Visible

## Overview

The Escalations page currently renders tier sections conditionally — a section only appears when it contains at least one record. This feature changes that behavior so all four tier sections are always rendered simultaneously, regardless of data state. A new Tier 1 Monitored section is introduced, and every section shows a contextual empty-state message when it has no records.

The change is additive and surgical: the existing `getEscalationSection` routing utility is extended to return `'tier1'` for low-risk, high-confidence records (instead of throwing), and `EscalationPage.tsx` is refactored to always render all four sections. No new data-fetching infrastructure is needed — the existing TanStack Query + WebSocket reactive update path already handles the escalations cache correctly.

### Goals

- Always render four sections: Tier 3 Urgent Alerts, Tier 2 Callback Queue (non-Physician only), Human Review, Tier 1 Monitored.
- Replace the global "No active escalations" empty state with per-section empty states.
- Extend routing to classify Tier 1 high-confidence records into the new Tier 1 section.
- Maintain WCAG 2.1 AA compliance and existing WebSocket reactivity.

---

## Architecture

The feature is entirely contained within the frontend React application. No backend changes are required — the `GET /escalations` API already returns all escalation records; the frontend simply needs to route and display them differently.

```
┌─────────────────────────────────────────────────────────────┐
│  EscalationPage.tsx                                         │
│                                                             │
│  useQuery(escalations)  ←──── GET /api/escalations          │
│         │                                                   │
│         ▼                                                   │
│  partitionEscalations()  ←── getEscalationSection() (ext.)  │
│         │                                                   │
│         ├── tier3[]                                         │
│         ├── tier2[]  (hidden for Physician)                 │
│         ├── humanReview[]                                   │
│         └── tier1[]   ← NEW                                 │
│                                                             │
│  Always renders 4 <section> elements                        │
│  Each section: records OR <SectionEmptyState>               │
└─────────────────────────────────────────────────────────────┘
         ▲
         │  cache invalidation / optimistic append
         │
┌────────┴────────────────────────────────────────────────────┐
│  WebSocketContext.tsx                                       │
│  escalation_triggered → setQueryData(escalations, append)   │
└─────────────────────────────────────────────────────────────┘
```

The WebSocket handler in `WebSocketContext.tsx` already appends new escalation records to the TanStack Query cache on `escalation_triggered` events. Because `EscalationPage` reads from that same cache via `useQuery`, the reactive update path requires no changes — new records will automatically appear in the correct section and replace the empty state.

---

## Components and Interfaces

### Modified: `getEscalationSection` in `src/utils/riskUtils.ts`

The current signature throws for Tier 1 high-confidence records. It is extended to return `'tier1'` instead:

```typescript
export function getEscalationSection(
  riskTier: RiskTier,
  confidence: number
): 'tier3' | 'tier2' | 'humanReview' | 'tier1'
```

**New routing table (precedence order):**

| Condition | Section |
|---|---|
| `riskTier === 3` | `'tier3'` |
| `confidence < 0.6 && riskTier < 3` | `'humanReview'` |
| `riskTier === 2 && confidence >= 0.6` | `'tier2'` |
| `riskTier === 1 && confidence >= 0.6` | `'tier1'` ← new |
| anything else | throws (silently caught at call site) |

The precedence change from the current implementation: Human Review now takes precedence over Tier 2. This matches the requirements (Req 4.1): Tier 3 → Human Review → Tier 2 → Tier 1.

### New: `SectionEmptyState` component (inline in `EscalationPage.tsx`)

A lightweight inline component that renders the per-section empty state. It is not exported — it lives inside `EscalationPage.tsx` alongside the other section sub-components.

```typescript
interface SectionEmptyStateProps {
  message: string
}

function SectionEmptyState({ message }: SectionEmptyStateProps)
```

Renders a muted, non-alarming placeholder using gray text and a subtle icon. The message text is rendered in a `<p>` element that is visible to screen readers without requiring interaction.

### New: `Tier1MonitoredCard` component (inline in `EscalationPage.tsx`)

A card for Tier 1 monitored patients, styled with green tones to reflect low risk:

```typescript
function Tier1MonitoredCard({ escalation }: { escalation: Escalation })
```

Displays: patient name, `RiskTierBadge` (Tier 1), diagnosis group badge, discharge date/time.

### Modified: `EscalationPage` component

**Partition logic** — extended to include `tier1`:

```typescript
const tier3: Escalation[] = []
const tier2: Escalation[] = []
const humanReview: Escalation[] = []
const tier1: Escalation[] = []   // NEW

for (const esc of escalations) {
  try {
    const section = getEscalationSection(esc.riskTier, esc.confidence)
    if (section === 'tier3') tier3.push(esc)
    else if (section === 'tier2') tier2.push(esc)
    else if (section === 'humanReview') humanReview.push(esc)
    else tier1.push(esc)
  } catch {
    // Record doesn't qualify for any section — skip silently
  }
}
```

**Rendering** — sections are always rendered (no `allEmpty` guard):

```typescript
// Always render all sections; each shows SectionEmptyState when empty
{!isLoading && !isError && (
  <div className="space-y-8">
    {/* Tier 3 — always visible */}
    <section aria-label="Tier 3 Urgent Alerts"> ... </section>

    {/* Tier 2 — always visible for non-Physician */}
    {!isPhysician && (
      <section aria-label="Tier 2 Callback Queue"> ... </section>
    )}

    {/* Human Review — always visible */}
    <section aria-label="Human Review"> ... </section>

    {/* Tier 1 Monitored — always visible */}
    <section aria-label="Tier 1 Monitored"> ... </section>
  </div>
)}
```

**Loading state** — four skeletons instead of three:

```typescript
{isLoading && (
  <div className="space-y-8">
    <SectionSkeleton />
    <SectionSkeleton />
    <SectionSkeleton />
    <SectionSkeleton />  {/* NEW */}
  </div>
)}
```

The global `allEmpty` check and the `<EmptyState message="No active escalations" />` fallback are removed entirely.

---

## Data Models

No new data models are introduced. The existing `Escalation` type already carries all fields needed to route a record to the Tier 1 section (`riskTier: 1`, `confidence >= 0.6`).

The `getEscalationSection` return type is widened from `'tier3' | 'tier2' | 'humanReview'` to `'tier3' | 'tier2' | 'humanReview' | 'tier1'`. All call sites in `EscalationPage.tsx` are updated to handle the new return value.

### Section routing summary

```
Escalation record
  ├── riskTier === 3                          → tier3
  ├── confidence < 0.6 AND riskTier < 3       → humanReview
  ├── riskTier === 2 AND confidence >= 0.6    → tier2
  ├── riskTier === 1 AND confidence >= 0.6    → tier1
  └── (none of the above)                    → silently excluded
```

### Empty state messages (per section)

| Section | `aria-label` | Empty state message |
|---|---|---|
| Tier 3 Urgent Alerts | `"Tier 3 Urgent Alerts"` | `"No urgent alerts"` |
| Tier 2 Callback Queue | `"Tier 2 Callback Queue"` | `"No callbacks pending"` |
| Human Review | `"Human Review"` | `"No cases for review"` |
| Tier 1 Monitored | `"Tier 1 Monitored"` | `"No monitored patients"` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: All sections always present

*For any* set of escalation records (including the empty set), when the Escalation_View finishes loading without error, all four section elements (`aria-label` = "Tier 3 Urgent Alerts", "Human Review", "Tier 1 Monitored") SHALL be present in the DOM, and the Tier 2 section SHALL be present for any non-Physician role.

**Validates: Requirements 1.1, 3.2, 3.3**

### Property 2: Correct empty state message per section

*For any* escalation record set where a given section contains zero qualifying records, the empty state message rendered inside that section SHALL exactly match the specified copy: "No urgent alerts" for Tier 3, "No callbacks pending" for Tier 2, "No cases for review" for Human Review, "No monitored patients" for Tier 1.

**Validates: Requirements 1.2, 2.1**

### Property 3: Section DOM order invariant

*For any* escalation record set and any non-Physician role, the four section elements SHALL appear in the DOM in the order: Tier 3 → Tier 2 → Human Review → Tier 1 (top to bottom), as determined by `compareDocumentPosition`.

**Validates: Requirements 1.4**

### Property 4: Tier 2 hidden for Physician, visible for all other roles

*For any* escalation record set, when the authenticated user has the Physician role, the Tier 2 Callback Queue section SHALL NOT be present in the DOM. When the user has the Nurse or Admin role, the Tier 2 section SHALL always be present.

**Validates: Requirements 3.1, 3.2**

### Property 5: Each record routed to exactly one section

*For any* set of escalation records, the sum of record counts across all visible sections SHALL equal the count of records that qualify for at least one section. No record SHALL appear in more than one section.

**Validates: Requirements 4.1**

### Property 6: Tier 3 precedence over Human Review

*For any* escalation record with `riskTier === 3` and `confidence < 0.6` (qualifying for both Tier 3 and Human Review), the record SHALL appear only in the Tier 3 section and SHALL NOT appear in the Human Review section.

**Validates: Requirements 4.3**

### Property 7: Section aria-labels are always correct

*For any* data state, each rendered `<section>` element SHALL have an `aria-label` attribute matching its designated name ("Tier 3 Urgent Alerts", "Tier 2 Callback Queue", "Human Review", "Tier 1 Monitored").

**Validates: Requirements 5.1**

---

## Error Handling

### API failure

When `GET /escalations` fails, the existing `ErrorBanner` with a retry button is displayed. No section content is rendered. This behavior is unchanged.

### WebSocket disconnection

The existing WebSocket reconnection logic in `WebSocketContext.tsx` handles disconnection transparently. On reconnect, `queryClient.invalidateQueries()` is called, which re-fetches escalations and reconciles any missed events. The four sections will reflect the refreshed data automatically.

### Records that don't qualify for any section

The `try/catch` around `getEscalationSection` in the partition loop silently excludes records that throw (i.e., records that don't match any routing rule). This is unchanged behavior — such records are dropped without error.

### Tier 1 records with confidence < 0.6

These records route to Human Review (confidence < 0.6 takes precedence over tier). This is correct per the routing precedence table and the requirements (Req 4.1).

---

## Testing Strategy

### Unit tests (example-based)

These cover specific scenarios and structural requirements:

- **Loading state**: Verify four skeleton cards render while the query is in-flight.
- **Error state**: Verify `ErrorBanner` renders and no section content is shown on API failure.
- **All-empty state**: Verify all four sections render with their correct empty state messages; verify the global "No active escalations" text is absent.
- **Populated sections**: Verify each section renders the correct card type when records are present.
- **Physician role**: Verify Tier 2 section is absent for Physician; verify Tier 3, Human Review, Tier 1 are present.
- **Nurse/Admin role**: Verify all four sections are present.
- **aria-live region**: Verify `aria-live="polite"` is present on the Tier 3 live region.
- **No collapse controls**: Verify no toggle/collapse button exists on any section.
- **WebSocket reactive update (empty → populated)**: Fire an `escalation_triggered` event and verify the empty state is replaced by a card.
- **WebSocket reactive update (populated → empty)**: Simulate record removal and verify the card is replaced by the empty state.

### Property-based tests (fast-check / @fast-check/vitest)

Each property test runs a minimum of **100 iterations** with randomly generated escalation record sets.

**Property 1 — All sections always present**
Generate random arrays of `Escalation` objects (including empty arrays). Render `EscalationPage` as Nurse or Admin. Assert all four `<section>` elements are in the DOM.
*Tag: Feature: escalation-tiers-all-sections, Property 1: All sections always present*

**Property 2 — Correct empty state message per section**
Generate escalation record sets where specific sections are empty (by controlling `riskTier` and `confidence` values). For each empty section, assert the correct message string is rendered inside that section element.
*Tag: Feature: escalation-tiers-all-sections, Property 2: Correct empty state message per section*

**Property 3 — Section DOM order invariant**
Generate random escalation record sets and render as Nurse/Admin. Assert that the DOM position of Tier 3 precedes Tier 2, Tier 2 precedes Human Review, and Human Review precedes Tier 1 using `compareDocumentPosition`.
*Tag: Feature: escalation-tiers-all-sections, Property 3: Section DOM order invariant*

**Property 4 — Tier 2 hidden for Physician, visible for all other roles**
Generate random escalation record sets. Render as Physician and assert Tier 2 is absent. Render as Nurse/Admin and assert Tier 2 is present.
*Tag: Feature: escalation-tiers-all-sections, Property 4: Tier 2 hidden for Physician*

**Property 5 — Each record routed to exactly one section**
Generate random `Escalation` arrays with varying `riskTier` (1–3) and `confidence` (0.0–1.0). Call `getEscalationSection` for each record and collect results. Assert the union of all section arrays equals the set of qualifying records, with no duplicates.
*Tag: Feature: escalation-tiers-all-sections, Property 5: Each record routed to exactly one section*

**Property 6 — Tier 3 precedence over Human Review**
Generate `Escalation` records with `riskTier === 3` and `confidence` drawn from `[0.0, 0.59]`. Assert `getEscalationSection` returns `'tier3'` for all of them.
*Tag: Feature: escalation-tiers-all-sections, Property 6: Tier 3 precedence over Human Review*

**Property 7 — Section aria-labels are always correct**
Generate random escalation record sets. Render `EscalationPage` as Nurse/Admin. Assert each `<section>` element has the correct `aria-label` attribute value.
*Tag: Feature: escalation-tiers-all-sections, Property 7: Section aria-labels are always correct*

### Accessibility

- Existing `colorContrast.test.tsx` covers general contrast requirements. New section headers and empty state text use the same Tailwind color palette already validated there.
- Screen reader readability of empty states is verified by asserting the message `<p>` element is not hidden (`aria-hidden` absent, not `display:none`).
- Full WCAG 2.1 AA validation requires manual testing with assistive technologies (VoiceOver, NVDA) in addition to automated checks.
