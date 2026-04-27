# Implementation Plan: User Profile Page

## Overview

Implement the `/profile` route inside the existing `AppShell` layout. The feature introduces three new files (`ProfilePage.tsx`, `RoleBadge.tsx`, `ProfileAvatar.tsx`) and modifies three existing ones (`queryKeys.ts`, `App.tsx`, `AppShell.tsx`). Identity data is read-only (sourced from `AuthContext`); the only mutable state is the notification preferences toggle, persisted via `PATCH /api/users/me/preferences` with an optimistic update pattern.

## Tasks

- [x] 1. Add `UserPreferences` type and `userProfile` query key
  - [x] 1.1 Add `UserPreferences` interface to `src/types/index.ts`
    - Add `export interface UserPreferences { escalationNotifications: boolean }` to the existing types file
    - _Requirements: 6.1, 6.3_
  - [x] 1.2 Add `userProfile` query key to `src/lib/queryKeys.ts`
    - Add `userProfile: () => ['users', 'me', 'preferences'] as const` to the `queryKeys` factory
    - _Requirements: 6.1, 6.3_

- [x] 2. Implement `RoleBadge` component
  - [x] 2.1 Create `src/components/RoleBadge.tsx`
    - Accept `role: UserRole` and optional `className` props
    - Render a `<span>` with role-specific Tailwind colour classes: `admin` → `bg-purple-100 text-purple-800`, `nurse` → `bg-blue-100 text-blue-800`, `physician` → `bg-green-100 text-green-800`
    - Include an `aria-label` of the form `"Role: {role}"` and visible capitalised role text
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 7.5_
  - [ ]* 2.2 Write property test for `RoleBadge` — Property 4: distinct styles per role
    - **Property 4: Role badge renders distinct styles for each role**
    - **Validates: Requirements 1.6, 1.7, 1.8**
    - Use `fc.uniqueArray(fc.constantFrom('admin', 'nurse', 'physician'), { minLength: 2, maxLength: 2 })` to generate pairs of distinct roles and assert their rendered class strings differ
    - Tag: `// Feature: user-profile-page, Property 4`
  - [ ]* 2.3 Write property test for `RoleBadge` — Property 5: aria-label contains role name
    - **Property 5: Role badge exposes role name to screen readers**
    - **Validates: Requirements 7.5**
    - Use `fc.constantFrom('admin', 'nurse', 'physician')` and assert the rendered element's `aria-label` contains the role string
    - Tag: `// Feature: user-profile-page, Property 5`

- [x] 3. Implement `ProfileAvatar` component
  - [x] 3.1 Create `src/components/ProfileAvatar.tsx`
    - Accept `photoURL: string | null`, `displayName: string | null`, and optional `size?: 'sm' | 'md' | 'lg'` (default `'md'`) props
    - When `photoURL` is provided, render an `<img>` with `alt` containing the display name; attach `onError` to switch to the initials fallback
    - Initials extraction: split `displayName` on whitespace, take first char of first and last word (uppercased); fall back to `"?"` when `displayName` is null or empty
    - Size classes: `sm` → `h-8 w-8 text-xs`, `md` → `h-10 w-10 text-sm`, `lg` → `h-16 w-16 text-xl`
    - _Requirements: 1.3, 1.4, 5.3_
  - [ ]* 3.2 Write property test for `ProfileAvatar` — Property 2: avatar alt text contains display name
    - **Property 2: Avatar image alt text contains the display name**
    - **Validates: Requirements 1.3**
    - Use `fc.record({ photoURL: fc.webUrl(), displayName: fc.string({ minLength: 1 }) })` and assert the rendered `<img>` `alt` attribute contains the display name
    - Tag: `// Feature: user-profile-page, Property 2`
  - [ ]* 3.3 Write property test for `ProfileAvatar` — Property 3: initials fallback derived from display name
    - **Property 3: Initials fallback is derived from the display name**
    - **Validates: Requirements 1.4, 5.3**
    - Use `fc.string({ minLength: 1 })` and assert the rendered fallback text equals the expected initials (first char of first word + first char of last word, uppercased)
    - Tag: `// Feature: user-profile-page, Property 3`

- [x] 4. Checkpoint — Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement `ProfilePage`
  - [x] 5.1 Create `src/pages/ProfilePage.tsx` with identity section
    - Read `user`, `role`, `loading`, and `signOut` from `useAuth()`
    - Render a single `<h1>` with text "My Profile"
    - While `loading` is true, render skeleton cards in place of profile content (reuse `SkeletonCard` component)
    - Render the profile header section: `ProfileAvatar` (size `lg`), display name, email, and `RoleBadge`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 7.1_
  - [x] 5.2 Add sign-out control to `ProfilePage`
    - Add a sign-out button that calls `signOut()` from `useAuth()`
    - On success, redirect to `/login` (use `useNavigate`)
    - On failure, set `signOutError` state and render an inline error message in a `role="alert"` region; do not navigate away
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 5.3 Write property test for `ProfilePage` — Property 1: displays authenticated user's identity
    - **Property 1: Profile page displays the authenticated user's identity data**
    - **Validates: Requirements 1.1, 1.2, 2.5**
    - Use `fc.record({ displayName: fc.string(), email: fc.emailAddress() })` to generate user data; mock `useAuth` and assert both display name and email appear in the rendered output
    - Tag: `// Feature: user-profile-page, Property 1`
  - [ ]* 5.4 Write property test for `ProfilePage` — Property 6: sign-out error displayed inline
    - **Property 6: Sign-out error messages are displayed inline**
    - **Validates: Requirements 3.3**
    - Use `fc.string({ minLength: 1 })` as the error message thrown by `signOut`; assert the error text appears in the DOM and the route does not change
    - Tag: `// Feature: user-profile-page, Property 6`

- [x] 6. Add notification preferences section to `ProfilePage`
  - [x] 6.1 Add preferences query and toggle UI to `ProfilePage`
    - Use `useQuery` with `queryKeys.userProfile()` to fetch `GET /api/users/me/preferences`
    - While `prefsLoading` is true, render a skeleton in the preferences section
    - If the query errors, render `ErrorBanner` with retry; hide the toggle section
    - Render a labelled toggle (`<input type="checkbox">` or equivalent) for `escalationNotifications`
    - Disable the toggle while the mutation is in flight (`prefsMutation.isPending`)
    - Announce toggle state changes via an `aria-live` region
    - _Requirements: 6.1, 6.5, 7.2, 7.3, 7.4_
  - [x] 6.2 Add preferences mutation with optimistic update to `ProfilePage`
    - Use `useMutation` with `PATCH /api/users/me/preferences`
    - Implement `onMutate` to cancel in-flight queries, snapshot previous data, and apply optimistic update via `queryClient.setQueryData`
    - Implement `onError` to rollback via `queryClient.setQueryData` with the snapshot and set an inline error state rendered in a `role="alert"` region
    - Implement `onSettled` to call `queryClient.invalidateQueries`
    - _Requirements: 6.2, 6.3, 6.4_
  - [ ]* 6.3 Write property test for `ProfilePage` — Property 7: preference round-trip preserves value
    - **Property 7: Notification preference round-trip preserves value**
    - **Validates: Requirements 6.3**
    - Use `fc.boolean()` as the preference value; mock the PATCH to resolve with the sent value and assert the toggle reflects it after mutation success
    - Tag: `// Feature: user-profile-page, Property 7`
  - [ ]* 6.4 Write property test for `ProfilePage` — Property 8: failed preference save reverts toggle
    - **Property 8: Failed preference save reverts toggle and shows error**
    - **Validates: Requirements 6.4**
    - Use `fc.record({ initial: fc.boolean(), errorMsg: fc.string({ minLength: 1 }) })`; mock the PATCH to reject and assert the toggle reverts to `initial` and an error message is shown
    - Tag: `// Feature: user-profile-page, Property 8`

- [x] 7. Checkpoint — Ensure all ProfilePage tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Register `/profile` route in `App.tsx`
  - Import `ProfilePage` and add a `ProtectedRoute`-wrapped `<Route path="/profile">` inside `AppShell`, following the same pattern as `/dashboard` and other protected routes
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 9. Add profile entry point to `AppShell`
  - [x] 9.1 Update desktop sidebar footer in `AppShell.tsx`
    - Replace the plain "Sign Out" button in the sidebar footer with a two-part footer:
      1. A `NavLink` to `/profile` (or `/profile?demo=true` in demo mode) containing a `ProfileAvatar` (size `sm`) and the user's display name; apply the same active-state class logic as `NAV_LINKS`
      2. A separate icon-only sign-out button with `aria-label="Sign out"`
    - Read `user` from `useAuth()` to supply `photoURL` and `displayName` to `ProfileAvatar`
    - _Requirements: 4.1, 4.3, 4.4, 4.5_
  - [x] 9.2 Update mobile header in `AppShell.tsx`
    - Add a `NavLink` to `/profile` (or `/profile?demo=true` in demo mode) in the right-hand header area, rendering a `ProfileAvatar` (size `sm`)
    - Retain the existing "Sign Out" button alongside it
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 10. Write example-based unit tests for `ProfilePage` and `AppShell` changes
  - Create `src/tests/profilePage.test.tsx` covering:
    - Role badge visible for each of the three roles (Requirements 1.5)
    - Unauthenticated visitor redirected to `/login?redirect=%2Fprofile` (Requirement 2.1)
    - All three roles see the full profile view (Requirements 2.2–2.4)
    - Clicking sign-out calls `AuthContext.signOut` (Requirement 3.1)
    - Successful sign-out redirects to `/login` (Requirement 3.2)
    - AppShell profile entry point renders in sidebar footer and mobile header (Requirements 4.1, 4.2)
    - Profile entry point navigates to `/profile` (Requirement 4.3)
    - Active state applied when route is `/profile` (Requirement 4.4)
    - `?demo=true` appended in demo mode (Requirement 4.5)
    - Loading skeleton renders while `AuthContext.loading` is true (Requirement 5.1)
    - Notification preferences section with toggle is present (Requirement 6.1)
    - Toggling the switch calls `PATCH /api/users/me/preferences` (Requirement 6.2)
    - Toggle is disabled while PATCH is in flight (Requirement 6.5)
    - Single `<h1>` on the page (Requirement 7.1)
    - All interactive controls are focusable (Requirements 7.2, 7.3)
    - `aria-live` region present for toggle state changes (Requirement 7.4)
  - _Requirements: 1.5, 2.1–2.4, 3.1, 3.2, 4.1–4.5, 5.1, 6.1, 6.2, 6.5, 7.1–7.4_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `@fast-check/vitest` (already installed) with a minimum of 100 iterations per property
- Unit tests use Vitest + `@testing-library/react` following the existing test patterns in `src/tests/`
- All API calls in tests are mocked via `vi.mock('@/lib/apiClient')` — no real network calls
- Firebase Auth is mocked via the existing pattern (`vi.mock('firebase/auth')`, `vi.mock('@/lib/firebase')`)
