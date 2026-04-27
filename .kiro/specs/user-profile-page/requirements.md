# Requirements Document

## Introduction

The User Profile page gives every authenticated CareBridge user a dedicated view of their own account information. It surfaces the identity data held by Firebase Auth (display name, email, avatar), exposes the user's assigned role, and provides self-service controls for display preferences and sign-out. Because CareBridge is a healthcare dashboard with role-based access (admin, nurse, physician), the page must clearly communicate what a user can and cannot do within the system, and must never expose another user's data.

## Glossary

- **Profile_Page**: The `/profile` route rendered inside the AppShell that displays and manages the current user's account information.
- **Auth_Context**: The React context (`AuthContext`) that holds the Firebase `User` object, the resolved `UserRole`, and auth actions (`signOut`, `refreshToken`).
- **User**: The currently authenticated Firebase user, identified by a unique UID.
- **UserRole**: One of three string literals — `"admin"`, `"nurse"`, or `"physician"` — stored as a custom claim on the Firebase ID token.
- **Display_Name**: The human-readable name associated with the Firebase user account (sourced from `user.displayName`).
- **Avatar**: The profile photo URL associated with the Firebase user account (sourced from `user.photoURL`).
- **Role_Badge**: A visual indicator that renders the user's `UserRole` with a distinct colour per role.
- **Notification_Preferences**: Per-user toggles controlling whether in-app notifications are shown for escalation events.
- **AppShell**: The persistent layout wrapper that contains the sidebar navigation and main content area.

---

## Requirements

### Requirement 1: View Profile Information

**User Story:** As an authenticated user, I want to view my profile information, so that I can confirm my identity and role within the CareBridge system.

#### Acceptance Criteria

1. WHEN a user navigates to `/profile`, THE Profile_Page SHALL display the user's Display_Name sourced from `Auth_Context`.
2. WHEN a user navigates to `/profile`, THE Profile_Page SHALL display the user's email address sourced from `Auth_Context`.
3. WHEN a user navigates to `/profile` and the user has an Avatar URL, THE Profile_Page SHALL render the Avatar as an image with a non-empty `alt` attribute containing the Display_Name.
4. WHEN a user navigates to `/profile` and the user has no Avatar URL, THE Profile_Page SHALL render a fallback avatar composed of the user's initials.
5. WHEN a user navigates to `/profile`, THE Profile_Page SHALL display a Role_Badge showing the user's UserRole.
6. THE Role_Badge SHALL render the `"admin"` role with a distinct visual style different from `"nurse"` and `"physician"` roles.
7. THE Role_Badge SHALL render the `"nurse"` role with a distinct visual style different from `"admin"` and `"physician"` roles.
8. THE Role_Badge SHALL render the `"physician"` role with a distinct visual style different from `"admin"` and `"nurse"` roles.

---

### Requirement 2: Role-Based Access to Profile Page

**User Story:** As a system administrator, I want the profile page to be accessible to all authenticated roles, so that every user can view their own account details regardless of their role.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor navigates to `/profile`, THE Profile_Page SHALL redirect the visitor to `/login` with a `redirect` query parameter set to `/profile`.
2. WHEN an authenticated user with role `"admin"` navigates to `/profile`, THE Profile_Page SHALL render the full profile view.
3. WHEN an authenticated user with role `"nurse"` navigates to `/profile`, THE Profile_Page SHALL render the full profile view.
4. WHEN an authenticated user with role `"physician"` navigates to `/profile`, THE Profile_Page SHALL render the full profile view.
5. THE Profile_Page SHALL display only the data belonging to the currently authenticated User and SHALL NOT expose data from any other user.

---

### Requirement 3: Sign Out from Profile Page

**User Story:** As an authenticated user, I want to sign out directly from my profile page, so that I can end my session without navigating back to the sidebar.

#### Acceptance Criteria

1. WHEN a user activates the sign-out control on the Profile_Page, THE Auth_Context SHALL invoke the Firebase sign-out operation.
2. WHEN the sign-out operation completes successfully, THE Profile_Page SHALL redirect the user to `/login`.
3. IF the sign-out operation fails, THEN THE Profile_Page SHALL display an inline error message describing the failure without navigating away from the page.

---

### Requirement 4: Navigation to Profile Page

**User Story:** As an authenticated user, I want a consistent way to reach my profile page from anywhere in the app, so that I can access my account settings without hunting through menus.

#### Acceptance Criteria

1. THE AppShell SHALL render a profile entry point (avatar image or initials fallback) in the sidebar footer on desktop viewports (≥1280 px).
2. THE AppShell SHALL render a profile entry point in the mobile header on viewports narrower than 1280 px.
3. WHEN a user activates the profile entry point in the AppShell, THE AppShell SHALL navigate to `/profile`.
4. WHEN the current route is `/profile`, THE AppShell SHALL apply an active visual state to the profile entry point consistent with the active state applied to other navigation links.
5. WHERE demo mode is active, THE AppShell SHALL append the `?demo=true` query parameter to the `/profile` navigation link.

---

### Requirement 5: Loading and Error States

**User Story:** As an authenticated user, I want the profile page to handle slow or failed data loads gracefully, so that I always receive clear feedback about the state of my information.

#### Acceptance Criteria

1. WHILE Auth_Context is resolving the authenticated user, THE Profile_Page SHALL render a loading skeleton in place of profile content.
2. IF Auth_Context resolves with a null user after the loading phase, THEN THE Profile_Page SHALL redirect to `/login`.
3. IF the Avatar image fails to load, THEN THE Profile_Page SHALL fall back to the initials-based avatar without displaying a broken image.

---

### Requirement 6: Notification Preferences

**User Story:** As an authenticated user, I want to manage my in-app notification preferences from my profile page, so that I can control which alerts I receive during my shift.

#### Acceptance Criteria

1. THE Profile_Page SHALL display a Notification_Preferences section containing a toggle for escalation event notifications.
2. WHEN a user changes a Notification_Preferences toggle, THE Profile_Page SHALL persist the updated preference to the user's profile in the backend within 2 seconds.
3. WHEN a user navigates away from and returns to `/profile`, THE Profile_Page SHALL display the previously saved Notification_Preferences state.
4. IF the preference save operation fails, THEN THE Profile_Page SHALL display an inline error message and revert the toggle to its previous state.
5. WHILE a Notification_Preferences save operation is in progress, THE Profile_Page SHALL disable the affected toggle to prevent duplicate submissions.

---

### Requirement 7: Accessibility

**User Story:** As a user who relies on assistive technology, I want the profile page to be fully keyboard-navigable and screen-reader-compatible, so that I can use it without a mouse.

#### Acceptance Criteria

1. THE Profile_Page SHALL have a single `<h1>` landmark with visible text identifying the page (e.g., "My Profile").
2. THE Profile_Page SHALL expose all interactive controls (sign-out button, notification toggles) as focusable elements reachable via sequential keyboard navigation.
3. THE Profile_Page SHALL maintain a visible focus indicator on all interactive elements that meets WCAG 2.1 AA focus-visible requirements.
4. WHEN a Notification_Preferences toggle changes state, THE Profile_Page SHALL announce the new state to screen readers via an `aria-live` region or equivalent ARIA attribute.
5. THE Role_Badge SHALL include an `aria-label` or visible text that conveys the role name to screen readers without relying solely on colour.
