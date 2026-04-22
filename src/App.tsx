import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/contexts/AuthContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DischargeQueuePage } from '@/pages/DischargeQueuePage'
import { DischargeFormPage } from '@/pages/DischargeFormPage'
import { TranscriptViewerPage } from '@/pages/TranscriptViewerPage'
import { EscalationPage } from '@/pages/EscalationPage'
import { PatientListPage } from '@/pages/PatientListPage'
import { PermissionDenied } from '@/pages/PermissionDenied'
import { NotFound } from '@/pages/NotFound'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <WebSocketProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected — all roles — wrapped in AppShell */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <DashboardPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discharges"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <DischargeQueuePage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calls/:id"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <TranscriptViewerPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/escalations"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <EscalationPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patients"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <PatientListPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />

              {/* Protected — Admin only */}
              <Route
                path="/discharges/new"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AppShell>
                      <DischargeFormPage />
                    </AppShell>
                  </ProtectedRoute>
                }
              />

              {/* Redirects and fallbacks */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/permission-denied" element={<PermissionDenied />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
