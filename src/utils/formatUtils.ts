/**
 * Formats an ISO 8601 datetime string to a human-readable date and time.
 * Example: "2024-01-15T14:30:00Z" → "Jan 15, 2024, 2:30 PM"
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats an ISO 8601 date string to a human-readable date.
 * Example: "2024-01-15" → "Jan 15, 2024"
 */
export function formatDate(iso: string): string {
  // Parse as UTC to avoid timezone-induced date shifts for date-only strings
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
