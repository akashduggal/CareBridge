# Requirements Document

## Introduction

The Escalations page currently renders tier sections conditionally — a section only appears when it contains at least one record. This means care coordinators may see one, two, or three sections depending on the current data, with no visual indication that a section exists but is empty.

This feature changes the Escalations page so that all required tier sections are always rendered simultaneously, regardless of whether they contain records. Care coordinators will always see the full structure of the escalation workflow — Tier 3 Urgent Alerts, Tier 2 Callback Queue, Human Review, and Tier 1 Monitored — giving them a consistent spatial layout and making it immediately clear when a section is empty versus populated.

The Tier 2 Callback Queue section remains hidden for users with the Physician role, consistent with existing role-based access rules.

Empty sections are always expanded and visible — they are not collapsible.

---

## Glossary

- **Escalation_View**: The React component rendered at the `/escalations` route (`EscalationPage.tsx`).
- **Tier_Section**: A visually distinct, labeled area within the Escalation_View that groups escalation records by their routing category.
- **Tier_3_Section**: The Tier_Section displaying Tier 3 urgent alert banners (Risk_Score ≥ 7).
- **Tier_2_Section**: The Tier_Section displaying Tier 2 callback queue cards (Risk_Score 4–6, Confidence ≥ 0.6). Hidden for Physician users.
- **Human_Review_Section**: The Tier_Section displaying records with Confidence < 0.6 and Risk_Tier < 3.
- **Tier_1_Section**: The Tier_Section displaying low-risk, high-confidence monitored patients (Risk_Score 0–3, Confidence ≥ 0.6). Rendered below the Human_Review_Section for all roles.
- **Empty_Section_State**: The visual treatment rendered inside a Tier_Section when it contains zero escalation records. Empty sections are always expanded and visible — they are never collapsible.
- **Risk_Tier**: A classification derived from Risk_Score: Tier 1 (score 0–3), Tier 2 (score 4–6), Tier 3 (score ≥ 7).
- **Confidence**: A float from 0.0 to 1.0 representing the AI agent's certainty in its risk assessment.
- **Escalation**: A discharge record elevated for human clinical review based on Risk_Tier or low Confidence.
- **Physician**: A clinical staff role that does not manage the Tier 2 callback queue.
- **Nurse**: A clinical staff role responsible for Tier 2 callback queue management.
- **Admin**: A clinical staff role with full access to all escalation sections.
- **TanStack_Query**: The data-fetching and caching library used for all REST API interactions.
- **WCAG_2_1_AA**: Web Content Accessibility Guidelines version 2.1, Level AA — the accessibility compliance target.

---

## Requirements

### Requirement 1: Always-Visible Tier Sections

**User Story:** As a care coordinator, I want to see all escalation tier sections at once on the Escalations page, so that I can immediately understand the full state of the escalation workflow without sections appearing or disappearing based on data.

#### Acceptance Criteria

1. WHEN escalation records are loaded and the Escalation_View is rendered, THE Escalation_View SHALL display the Tier_3_Section, the Tier_2_Section (for non-Physician users), the Human_Review_Section, and the Tier_1_Section simultaneously, regardless of whether each section contains any records.
2. WHEN a Tier_Section contains zero escalation records, THE Escalation_View SHALL render an Empty_Section_State inside that section in place of record cards.
3. WHEN a Tier_Section contains one or more escalation records, THE Escalation_View SHALL render the existing record cards (Tier3AlertBanner, Tier2CallbackCard, HumanReviewCard, or Tier1MonitoredCard) inside that section, unchanged from current behavior.
4. THE Escalation_View SHALL render sections in the following top-to-bottom order: Tier_3_Section, Tier_2_Section (non-Physician only), Human_Review_Section, Tier_1_Section — preserving priority order with monitored patients at the bottom.
5. WHILE the `GET /escalations` request is in-flight, THE Escalation_View SHALL display loading skeletons for all Tier_Sections simultaneously.
6. IF the `GET /escalations` request fails, THEN THE Escalation_View SHALL display an inline error banner with a retry button and SHALL NOT render any Tier_Section content.
7. WHEN all Tier_Sections contain zero records after data loads, THE Escalation_View SHALL NOT display the global "No active escalations" empty state — instead, each section SHALL display its own Empty_Section_State.

### Requirement 2: Empty Section State

**User Story:** As a care coordinator, I want empty tier sections to display a clear placeholder message, so that I can distinguish between a section that has no current escalations and a section that failed to load.

#### Acceptance Criteria

1. WHEN a Tier_Section contains zero records, THE Escalation_View SHALL display a short descriptive message inside that section indicating it is currently clear: "No urgent alerts" for the Tier_3_Section, "No callbacks pending" for the Tier_2_Section, "No cases for review" for the Human_Review_Section, and "No monitored patients" for the Tier_1_Section.
2. WHEN a Tier_Section contains zero records, THE Escalation_View SHALL display the Empty_Section_State using muted, non-alarming visual styling that does not compete with populated sections.
3. WHEN a Tier_Section transitions from zero records to one or more records (e.g., via a `escalation_triggered` WebSocket event), THE Escalation_View SHALL replace the Empty_Section_State with the appropriate record card without a full page reload.
4. WHEN a Tier_Section transitions from one or more records to zero records, THE Escalation_View SHALL replace the record cards with the Empty_Section_State without a full page reload.
5. THE Empty_Section_State SHALL include an appropriate `aria-label` or descriptive text so screen readers can announce the section as empty.
6. THE Escalation_View SHALL always render each Tier_Section in its expanded state — empty sections SHALL NOT be collapsible.

### Requirement 3: Role-Based Section Visibility

**User Story:** As a system designer, I want the Tier 2 section visibility rules to remain consistent with the existing role-based access model, so that Physician users are not shown the callback queue they are not responsible for.

#### Acceptance Criteria

1. WHILE the authenticated user has the Physician role, THE Escalation_View SHALL NOT render the Tier_2_Section — neither its header, its record cards, nor its Empty_Section_State.
2. WHILE the authenticated user has the Nurse or Admin role, THE Escalation_View SHALL render the Tier_2_Section at all times, including when it contains zero records.
3. THE Escalation_View SHALL continue to render the Tier_3_Section, Human_Review_Section, and Tier_1_Section for all roles (Nurse, Physician, Admin) regardless of record count.

### Requirement 4: Section Record Routing Invariants

**User Story:** As a care coordinator, I want each escalation record to appear in exactly one section, so that I never see duplicate entries or miss a record.

#### Acceptance Criteria

1. WHEN escalation records are loaded, THE Escalation_View SHALL route each record to exactly one Tier_Section using the following precedence: Tier 3 (Risk_Score ≥ 7) takes highest precedence, then Human Review (Confidence < 0.6 and Risk_Tier < 3), then Tier 2 (Risk_Tier = 2 and Confidence ≥ 0.6), then Tier 1 (Risk_Tier = 1 and Confidence ≥ 0.6).
2. IF an escalation record does not qualify for any section, THEN THE Escalation_View SHALL silently exclude that record from all sections.
3. WHEN a record qualifies for both Tier 3 and Human Review (Risk_Tier 3 AND Confidence < 0.6), THE Escalation_View SHALL display the record only in the Tier_3_Section.

#### Correctness Properties

- **Invariant**: FOR ALL loaded escalation records, each record SHALL appear in at most one Tier_Section. The sum of record counts across all visible sections SHALL equal the count of records that qualify for at least one section.
- **Invariant**: FOR ALL records in the Tier_3_Section, the associated Risk_Score SHALL be greater than or equal to 7.
- **Invariant**: FOR ALL records in the Human_Review_Section, the associated Confidence value SHALL be strictly less than 0.6 AND the Risk_Tier SHALL be less than 3.
- **Invariant**: FOR ALL records in the Tier_2_Section, the associated Risk_Tier SHALL equal 2 AND the Confidence value SHALL be greater than or equal to 0.6.
- **Invariant**: FOR ALL records in the Tier_1_Section, the associated Risk_Tier SHALL equal 1 AND the Confidence value SHALL be greater than or equal to 0.6.

### Requirement 5: Accessibility

**User Story:** As a care coordinator using assistive technology, I want all tier sections to be properly labeled and announced, so that I can navigate the escalation workflow using a screen reader or keyboard.

#### Acceptance Criteria

1. THE Escalation_View SHALL render each Tier_Section as a `<section>` element with a descriptive `aria-label` attribute identifying the section by name (e.g., "Tier 3 Urgent Alerts", "Tier 2 Callback Queue", "Human Review", "Tier 1 Monitored").
2. THE Tier_3_Section SHALL retain its existing `aria-live="polite"` region so screen readers announce newly added urgent alerts.
3. WHEN a Tier_Section displays an Empty_Section_State, THE Empty_Section_State SHALL be readable by screen readers without requiring interaction.
4. THE Escalation_View SHALL meet WCAG_2_1_AA requirements, including sufficient color contrast for all section headers and empty state text.
