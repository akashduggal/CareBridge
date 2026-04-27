# Sticky Sidebar Layout Bugfix Design

## Overview

The desktop sidebar in the CareBridge dashboard scrolls away with the page content instead of remaining fixed to the viewport. The root cause is that the outer flex container uses `min-h-screen` (which grows unbounded with content) and the sidebar `aside` has no sticky/fixed positioning or explicit viewport height. The fix constrains the outer flex container to viewport height at desktop and applies sticky positioning with `h-screen` to the sidebar, enabling independent scrolling of the main content area. Mobile and tablet layouts remain completely unchanged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — viewport is ≥1280px (desktop breakpoint) and the sidebar lacks sticky positioning and explicit viewport height, causing it to scroll with the page
- **Property (P)**: The desired behavior — the sidebar remains fixed to the viewport and spans full viewport height at desktop, while main content scrolls independently
- **Preservation**: Mobile/tablet hamburger menu layout, sidebar navigation links, connection banners, branding, Demo badge, and Sign Out button must all remain unchanged
- **AppShell**: The layout component in `src/components/AppShell.tsx` that renders the responsive shell with header, sidebar, and main content area
- **desktop breakpoint**: Custom Tailwind breakpoint at ≥1280px defined in `tailwind.config.js`
- **Connection banners**: Sticky banners at the top of the page for reconnecting and connection-failed states

## Bug Details

### Bug Condition

The bug manifests when the viewport is ≥1280px (desktop) and the user views a page with content that either does not fill or exceeds the viewport height. The outer `div.flex` container uses `min-h-screen` which allows it to grow beyond the viewport, and the sidebar `aside` has no sticky positioning or explicit height — it relies entirely on flexbox stretch from the content area to determine its height.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { viewportWidth: number, contentHeight: number, sidebarClasses: string[], outerContainerClasses: string[] }
  OUTPUT: boolean

  RETURN input.viewportWidth >= 1280
         AND NOT sidebarClasses.includes('sticky')
         AND NOT sidebarClasses.includes('h-screen')
         AND NOT outerContainerClasses.includes('h-screen')
END FUNCTION
```

### Examples

- **Short content on desktop**: Viewport is 1440px wide, main content is 400px tall. The sidebar only stretches to 400px instead of spanning the full viewport height. Expected: sidebar spans full viewport height (100vh).
- **Long content on desktop**: Viewport is 1440px wide, main content is 2000px tall. Scrolling the page causes the sidebar to scroll out of view. Expected: sidebar stays fixed at the top of the viewport.
- **Exactly at breakpoint**: Viewport is exactly 1280px wide. The sidebar behaves the same as wider viewports — it should be sticky and full-height. Expected: sidebar is sticky with `h-screen`.
- **Below breakpoint (no bug)**: Viewport is 1024px wide (tablet). The sidebar is CSS-hidden and the hamburger menu is shown. This should be completely unaffected by the fix.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mobile/tablet layout (viewport <1280px): hamburger menu header with slide-out navigation must continue to work exactly as before
- Sidebar navigation links must continue to navigate to correct routes and highlight the active link
- Connection banners (reconnecting/connection-failed) must continue to display above the layout with proper `sticky top-0 z-50` positioning
- Sidebar branding ("CareBridge"), Demo badge (when in demo mode), and Sign Out button must remain visible and functional
- The `DemoPanel` floating component must remain unaffected
- The mobile slide-out nav panel (`#mobile-nav`) must continue to toggle correctly

**Scope:**
All inputs that do NOT involve the desktop sidebar layout should be completely unaffected by this fix. This includes:
- All mobile viewports (<768px)
- All tablet viewports (768px–1279px)
- Mouse clicks on navigation links at any viewport
- Connection banner display and z-indexing
- Demo mode badge visibility
- Sign Out button functionality

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is a combination of two CSS issues:

1. **Outer container not height-constrained**: The outer `div.flex` container sits inside a `div.min-h-screen` wrapper. The `min-h-screen` class allows the container to grow beyond the viewport height when content overflows. At desktop, this container should be constrained to exactly viewport height (`h-screen`) so that the sidebar and main content can independently manage their overflow.

2. **Sidebar lacks sticky positioning**: The `aside` element uses `desktop:flex desktop:w-56 desktop:flex-shrink-0 desktop:flex-col` but has no `sticky`, `top-0`, or `h-screen` classes. Without these, the sidebar's height is determined by flexbox stretch from the content area rather than being independently set to viewport height. Adding `desktop:sticky desktop:top-0 desktop:h-screen` will make the sidebar span the full viewport and remain fixed during scrolling.

3. **Interaction with connection banners**: The connection banners use `sticky top-0 z-50` and appear above the flex container. If the outer container is changed to `h-screen`, the banners may need to be accounted for (e.g., the flex container height may need to subtract banner height). However, since the banners are siblings rendered before the flex container inside the `min-h-screen` wrapper, and the sidebar uses `sticky` (not `fixed`), the layout should naturally accommodate banners pushing content down.

4. **Main content already has overflow-auto**: The `<main>` element already has `overflow-auto`, so once the outer container is height-constrained, the main content will scroll independently without additional changes.

## Correctness Properties

Property 1: Bug Condition - Sidebar Has Sticky Positioning and Viewport Height at Desktop

_For any_ render of the AppShell component where the viewport width is ≥1280px (desktop breakpoint), the sidebar `aside` element SHALL have `desktop:sticky`, `desktop:top-0`, and `desktop:h-screen` Tailwind classes applied, ensuring it remains fixed to the viewport and spans full viewport height regardless of main content length.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Mobile and Tablet Layout Unchanged

_For any_ render of the AppShell component, the mobile/tablet header SHALL retain its `desktop:hidden` class, the sidebar SHALL retain its `hidden` base class (CSS-hidden below 1280px), the hamburger menu SHALL remain functional, and connection banners, branding, Demo badge, and Sign Out button SHALL all remain present and correctly styled, preserving all existing non-desktop-sidebar behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/AppShell.tsx`

**Component**: `AppShell`

**Specific Changes**:

1. **Add viewport height constraint to outer flex container**: Change the `<div className="flex">` to include `desktop:h-screen` so the flex container is constrained to viewport height at desktop. This prevents the container from growing beyond the viewport when content overflows.
   - Current: `<div className="flex">`
   - Fixed: `<div className="flex desktop:h-screen">`

2. **Add sticky positioning to sidebar**: Add `desktop:sticky desktop:top-0 desktop:h-screen` to the `aside` element so it remains fixed to the viewport and spans full viewport height.
   - Current: `className="hidden desktop:flex desktop:w-56 desktop:flex-shrink-0 desktop:flex-col desktop:border-r desktop:border-gray-200 desktop:bg-white desktop:px-4 desktop:py-6"`
   - Fixed: `className="hidden desktop:flex desktop:w-56 desktop:flex-shrink-0 desktop:flex-col desktop:border-r desktop:border-gray-200 desktop:bg-white desktop:px-4 desktop:py-6 desktop:sticky desktop:top-0 desktop:h-screen"`

3. **Add overflow-y-auto to sidebar**: Add `desktop:overflow-y-auto` to the sidebar so that if the sidebar's own content (nav links, sign out button) ever exceeds viewport height, it can scroll independently.
   - This is a defensive addition — current sidebar content is short, but it prevents future regressions if more nav items are added.

4. **No changes to main content area**: The `<main>` element already has `overflow-auto` which will handle independent scrolling once the outer container is height-constrained.

5. **No changes to mobile/tablet layout**: All changes use the `desktop:` prefix, so they only apply at ≥1280px. The mobile header, hamburger menu, and slide-out nav are completely unaffected.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. Since this is a CSS class-based bug in a React component, tests will verify the presence/absence of Tailwind CSS classes on DOM elements using `@testing-library/react` and Vitest.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render the AppShell component and inspect the sidebar `aside` element's class list for the absence of sticky positioning and viewport height classes. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Missing sticky class**: Render AppShell, query the sidebar `aside`, assert it does NOT have `desktop:sticky` class (will pass on unfixed code, confirming the bug)
2. **Missing h-screen class on sidebar**: Render AppShell, query the sidebar `aside`, assert it does NOT have `desktop:h-screen` class (will pass on unfixed code)
3. **Missing h-screen class on flex container**: Render AppShell, query the outer `div.flex`, assert it does NOT have `desktop:h-screen` class (will pass on unfixed code)
4. **Sidebar height depends on content**: Render AppShell with minimal content, verify sidebar has no independent height constraint (will pass on unfixed code)

**Expected Counterexamples**:
- The sidebar `aside` element lacks `desktop:sticky`, `desktop:top-0`, and `desktop:h-screen` classes
- The outer flex container lacks `desktop:h-screen` class
- Possible causes confirmed: no sticky positioning, no explicit viewport height

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderAppShell_fixed(input)
  sidebar := result.querySelector('aside')
  flexContainer := sidebar.parentElement
  ASSERT sidebar.classList.contains('desktop:sticky')
  ASSERT sidebar.classList.contains('desktop:top-0')
  ASSERT sidebar.classList.contains('desktop:h-screen')
  ASSERT flexContainer.classList.contains('desktop:h-screen')
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderAppShell_original(input).mobileHeader = renderAppShell_fixed(input).mobileHeader
  ASSERT renderAppShell_original(input).hamburgerMenu = renderAppShell_fixed(input).hamburgerMenu
  ASSERT renderAppShell_original(input).connectionBanners = renderAppShell_fixed(input).connectionBanners
  ASSERT renderAppShell_original(input).sidebarContent = renderAppShell_fixed(input).sidebarContent
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of component state (demo mode on/off, connection states, different routes) automatically
- It catches edge cases in class combinations that manual unit tests might miss
- It provides strong guarantees that mobile/tablet behavior is unchanged across all state combinations

**Test Plan**: Observe behavior on UNFIXED code first for mobile/tablet layout, connection banners, and sidebar content, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Mobile header preservation**: Verify the mobile header retains `desktop:hidden` class and hamburger button remains functional across all component states
2. **Sidebar base class preservation**: Verify the sidebar retains `hidden` base class (CSS-hidden below 1280px) across all component states
3. **Connection banner preservation**: Verify reconnecting and connection-failed banners render with correct `sticky top-0 z-50` classes
4. **Sidebar content preservation**: Verify branding, nav links, Demo badge, and Sign Out button remain present in the sidebar

### Unit Tests

- Test that the sidebar `aside` has `desktop:sticky`, `desktop:top-0`, `desktop:h-screen`, and `desktop:overflow-y-auto` classes after the fix
- Test that the outer flex container has `desktop:h-screen` class after the fix
- Test that the main content area retains `overflow-auto` class
- Test that mobile header retains `desktop:hidden` class
- Test connection banner rendering with reconnecting and connection-failed states

### Property-Based Tests

- Generate random combinations of component state (demo mode, connection state, route) and verify the sidebar always has the correct sticky/height classes at desktop
- Generate random component states and verify mobile/tablet layout classes are unchanged across all combinations
- Generate random connection states and verify banners render correctly regardless of sidebar fix

### Integration Tests

- Test full AppShell render with navigation between routes — sidebar stays sticky
- Test AppShell with connection banners active — sidebar and banners coexist correctly
- Test AppShell in demo mode — Demo badge visible in sidebar alongside sticky positioning
