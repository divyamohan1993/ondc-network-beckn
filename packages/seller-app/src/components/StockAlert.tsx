import Link from 'next/link';

interface StockAlertProps {
  count: number;
  message: string;
  locale: string;
}

export default function StockAlert({ count, message, locale }: StockAlertProps) {
  if (count === 0) return null;

  return (
    <div
      className="card border-l-4 border-l-gold-500 bg-gold-500/5"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center" aria-hidden="true">
            <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gold-400">
              {locale === 'hi' ? 'कम स्टॉक चेतावनी' : 'Low Stock Alert'}
            </p>
            <p className="text-xs text-ash-400">{message}</p>
          </div>
        </div>
        <Link
          href="/inventory?filter=low_stock"
          className="btn-warning text-xs"
          aria-label={locale === 'hi' ? 'इन्वेंटरी देखें' : 'View Inventory'}
        >
          {locale === 'hi' ? 'देखें' : 'View'}
        </Link>
      </div>
    </div>
  );
}
