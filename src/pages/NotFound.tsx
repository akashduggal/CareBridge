import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">404 — Page Not Found</h1>
      <p className="text-gray-600">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/dashboard" className="text-blue-600 underline hover:text-blue-800">
        Go to Dashboard
      </Link>
    </div>
  )
}
