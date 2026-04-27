# Bugfix Requirements Document

## Introduction

The left sidebar navigation in the CareBridge dashboard does not remain fixed to the viewport when the main content area is scrolled. On desktop viewports (≥1280px), the sidebar should be sticky and span the full viewport height, while the right-side dashboard content panes should scroll independently. Currently, both the sidebar and main content scroll together as a single document flow, which degrades navigation usability on pages with long content.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the viewport is ≥1280px (desktop) AND the main content exceeds the viewport height THEN the sidebar scrolls out of view along with the page content

1.2 WHEN the viewport is ≥1280px (desktop) AND the main content does not fill the full viewport height THEN the sidebar only stretches to match the main content height rather than spanning the full viewport height independently

1.2.1 WHEN the viewport is ≥1280px (desktop) AND the main content does fill the full viewport height THEN the sidebar matches the content height but still does not remain fixed/sticky when scrolling

1.3 WHEN the viewport is ≥1280px (desktop) AND the user scrolls the page THEN both the sidebar and main content scroll together as a single document, preventing independent navigation access

### Expected Behavior (Correct)

2.1 WHEN the viewport is ≥1280px (desktop) AND the main content exceeds the viewport height THEN the system SHALL keep the sidebar fixed in place (sticky to the viewport) so it remains visible at all times

2.2 WHEN the viewport is ≥1280px (desktop) THEN the system SHALL render the sidebar spanning the full viewport height (`h-screen`)

2.3 WHEN the viewport is ≥1280px (desktop) AND the user scrolls THEN the system SHALL allow only the main content area to scroll independently while the sidebar remains stationary

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the viewport is <1280px (mobile/tablet) THEN the system SHALL CONTINUE TO hide the sidebar and show the hamburger menu header with slide-out navigation

3.2 WHEN the viewport is ≥1280px (desktop) AND the user interacts with sidebar navigation links THEN the system SHALL CONTINUE TO navigate to the correct routes and highlight the active link

3.3 WHEN connection banners (reconnecting or connection failed) are displayed THEN the system SHALL CONTINUE TO show them above the layout content with proper z-indexing

3.4 WHEN the viewport is ≥1280px (desktop) THEN the system SHALL CONTINUE TO display the "CareBridge" branding, Demo badge (when in demo mode), and Sign Out button in the sidebar
