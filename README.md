# CareBridge

Frontend dashboard for an AI-powered post-discharge care system that monitors patient recovery, visualizes risk scores, and manages real-time escalation workflows through an intuitive clinical interface.

## Overview

CareBridge is a React + TypeScript SPA built for clinical staff — nurses, physicians, and administrators — to monitor post-discharge patient follow-up calls, review AI-generated risk assessments, manage escalations, and create discharge events. It integrates with a backend API and receives real-time updates via WebSocket to support timely clinical intervention and reduce hospital readmission rates.

## Features

- **Dashboard** — Live summary cards (today's discharges, pending calls, active escalations), risk tier donut chart, and 7-day discharge volume bar chart
- **Discharge Queue** — Sortable, filterable table with slide-out drawer for medication lists and call history; role-based interactivity
- **Call Transcript Viewer** — Full transcript with highlighted risk phrases, animated score meter, confidence indicator, and risk flags sidebar
- **Escalation Management** — Tiered queues: Tier 3 urgent alerts, Tier 2 callback queue (Nurse/Admin), and Human Review queue
- **Patient List** — Debounced server-side search with pagination and patient detail view
- **Discharge Intake Form** — Patient search/create, ICD-10 validation, medication list editor, future datetime rejection (Admin only)
- **Demo Mode** — Three pre-configured scenarios (Happy Path CHF, Medium Risk COPD, Emergency Chest Pain) with mock data and no real network requests
- **Real-time WebSocket updates** — Exponential backoff reconnection, event deduplication, and automatic cache reconciliation on reconnect
- **Role-based access control** — Firebase Custom Claims for Nurse, Physician, and Admin roles with protected routes

## Tech Stack

| Category | Library |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript (strict mode) |
| Styling | TailwindCSS |
| Data fetching | TanStack Query v5 |
| Routing | React Router v6 |
| Auth | Firebase Authentication (Google Sign-In) |
| Charts | Recharts |
| Testing | Vitest + React Testing Library + fast-check |

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Google Sign-In enabled and custom claims configured for user roles (`role: "nurse" | "physician" | "admin"`)

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (e.g. `your-project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_WS_URL` | WebSocket server URL (e.g. `ws://localhost:3000`) |

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run all tests (single execution, CI-compatible) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint (zero warnings allowed) |

## Testing

The project uses a TDD approach with property-based tests (PBT) for critical invariants alongside unit, component, and integration tests.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

Coverage thresholds: **80%** lines/statements/functions, **75%** branches.

Key correctness properties verified by PBT:
- Risk tier derivation consistency (score → tier → badge color)
- ICD-10 validation correctness and idempotence
- Escalation routing exclusivity (each record in exactly one section)
- Sort reversibility and filter subset invariants
- Pagination row limit (≤ 25 rows per page)
- Form validation submission blocking
- WebSocket reconnection exponential backoff
- WebSocket event idempotence (deduplication)

## Demo Mode

Append `?demo=true` to any URL to activate Demo Mode. You must be signed in with a valid account. The demo panel appears in the bottom-right corner with three scenarios:

- **Happy Path CHF** — Tier 1, Risk Score 2, completed call
- **Medium Risk COPD** — Tier 2, Risk Score 5, completed call
- **Emergency Chest Pain** — Tier 3, Risk Score 9, completed call + active escalation

In Demo Mode, all REST and WebSocket traffic is intercepted locally — no requests reach the real backend.

## Accessibility

The application targets **WCAG 2.1 AA** compliance:
- Visible keyboard focus indicators (≥ 3:1 contrast)
- Color is never the sole means of conveying information (badges include text labels)
- All form inputs have associated `<label>` elements
- Focus trap in modal drawers; focus returns to trigger on close
- ARIA live regions on Tier 3 alert banners
- Text-based alternatives for all chart data
- Full keyboard operability — no mouse-only interactions
