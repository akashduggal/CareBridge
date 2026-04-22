import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
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
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — all roles */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/discharges"
            element={
              <ProtectedRoute>
                <DischargeQueuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calls/:id"
            element={
              <ProtectedRoute>
                <TranscriptViewerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/escalations"
            element={
              <ProtectedRoute>
                <EscalationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <PatientListPage />
              </ProtectedRoute>
            }
          />

          {/* Protected — Admin only */}
          <Route
            path="/discharges/new"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DischargeFormPage />
              </ProtectedRoute>
            }
          />

          {/* Redirects and fallbacks */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/permission-denied" element={<PermissionDenied />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
