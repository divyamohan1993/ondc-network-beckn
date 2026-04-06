/**
 * Format amount in INR with proper locale support.
 */
export function formatINR(value: number | string, locale: string = 'en-IN'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '₹0';
  return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format date in locale-appropriate format.
 */
export function formatDate(date: string | Date | null, locale: string = 'en-IN'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: string | Date | null, locale: string = 'en-IN'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale === 'hi' ? 'hi' : 'en', { numeric: 'auto' });

  if (days > 0) return rtf.format(-days, 'day');
  if (hours > 0) return rtf.format(-hours, 'hour');
  if (minutes > 0) return rtf.format(-minutes, 'minute');
  return rtf.format(-seconds, 'second');
}

/**
 * Map order action to display status.
 */
export function orderStatusLabel(action: string): string {
  const map: Record<string, string> = {
    search: 'New',
    select: 'New',
    init: 'New',
    confirm: 'New',
    on_confirm: 'Accepted',
    on_status: 'In Progress',
    on_track: 'In Progress',
    on_cancel: 'Cancelled',
    cancel: 'Cancelled',
  };
  return map[action] || action;
}

/**
 * Map order action to status category for filtering.
 */
export function orderStatusCategory(action: string): 'new' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' {
  const map: Record<string, 'new' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'> = {
    search: 'new',
    select: 'new',
    init: 'new',
    confirm: 'new',
    on_confirm: 'accepted',
    on_status: 'in_progress',
    on_track: 'in_progress',
    on_update: 'in_progress',
    on_cancel: 'cancelled',
    cancel: 'cancelled',
  };
  return map[action] || 'new';
}

/**
 * Truncate string with ellipsis.
 */
export function truncate(str: string, len: number = 20): string {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}
