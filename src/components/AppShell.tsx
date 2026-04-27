import { useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { DemoPanel } from '@/components/DemoPanel'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/discharges', label: 'Discharge Queue' },
  { to: '/escalations', label: 'Escalations' },
  { to: '/patients', label: 'Patients' },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      <ul className="flex flex-col gap-1">
        {NAV_LINKS.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { signOut } = useAuth()
  const { reconnecting, connectionAttempts } = useWebSocket()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const location = useLocation()

  const isDemoMode = searchParams.get('demo') === 'true'
  const connectionFailed = !reconnecting && connectionAttempts >= 5

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Connection banners ── */}
      {reconnecting && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Connection lost — reconnecting…
        </div>
      )}
      {connectionFailed && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Connection failed — please refresh the page
        </div>
      )}

      {/* ── Header (mobile/tablet <1280px) ── */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 desktop:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {/* Hamburger icon */}
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <span className="text-base font-semibold text-gray-900">CareBridge</span>
        </div>

        <div className="flex items-center gap-2">
          {isDemoMode && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
              Demo Mode
            </span>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Mobile/tablet slide-out nav ── */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="border-b border-gray-200 bg-white px-4 py-3 desktop:hidden"
        >
          <NavItems onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex">
        {/* ── Persistent sidebar (desktop ≥1280px) ── */}
        <aside className="hidden desktop:flex desktop:w-56 desktop:flex-shrink-0 desktop:flex-col desktop:border-r desktop:border-gray-200 desktop:bg-white desktop:px-4 desktop:py-6">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-base font-semibold text-gray-900">CareBridge</span>
            {isDemoMode && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                Demo
              </span>
            )}
          </div>

          <div className="flex-1">
            <NavItems />
          </div>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main
          className="flex-1 overflow-auto p-4 desktop:p-6"
          // Suppress unused variable warning — location used for future active state
          data-pathname={location.pathname}
        >
          {children}
        </main>
      </div>

      {/* ── Demo Panel (floating, bottom-right) ── */}
      <DemoPanel />
    </div>
  )
}
