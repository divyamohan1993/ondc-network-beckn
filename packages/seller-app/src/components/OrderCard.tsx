'use client';

import ActionButton from './ActionButton';
import { formatINR, formatRelativeTime, truncate } from '@/lib/format';

interface OrderCardProps {
  orderId: string;
  items: string;
  total: string;
  buyerCity: string;
  timestamp: string | null;
  status: string;
  locale: string;
  translations: {
    accept: string;
    reject: string;
    pack: string;
    ship: string;
    deliver: string;
    cancel: string;
    order_id: string;
    buyer_city: string;
  };
  onAction?: (action: string, orderId: string) => void;
}

function getStatusBadge(status: string): string {
  const map: Record<string, string> = {
    new: 'badge-blue',
    accepted: 'badge-green',
    in_progress: 'badge-yellow',
    completed: 'badge-green',
    cancelled: 'badge-red',
    packed: 'badge-yellow',
    shipped: 'badge-blue',
    delivered: 'badge-green',
  };
  return map[status.toLowerCase()] || 'badge-gray';
}

function getActions(status: string, t: OrderCardProps['translations']): Array<{ label: string; action: string; variant: 'success' | 'danger' | 'warning' | 'primary' }> {
  const s = status.toLowerCase();
  if (s === 'new' || s === 'confirm' || s === 'init' || s === 'select') {
    return [
      { label: t.accept, action: 'accept', variant: 'success' },
      { label: t.reject, action: 'reject', variant: 'danger' },
    ];
  }
  if (s === 'accepted' || s === 'on_confirm') {
    return [{ label: t.pack, action: 'pack', variant: 'primary' }];
  }
  if (s === 'packed') {
    return [{ label: t.ship, action: 'ship', variant: 'primary' }];
  }
  if (s === 'shipped') {
    return [{ label: t.deliver, action: 'deliver', variant: 'success' }];
  }
  return [];
}

export default function OrderCard({
  orderId,
  items,
  total,
  buyerCity,
  timestamp,
  status,
  locale,
  translations,
  onAction,
}: OrderCardProps) {
  const actions = getActions(status, translations);
  const badge = getStatusBadge(status);

  return (
    <article className="card" aria-label={`${translations.order_id}: ${truncate(orderId, 12)}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-ash-500 font-mono">{truncate(orderId, 16)}</p>
          <p className="text-sm text-white font-medium mt-1">{items}</p>
        </div>
        <span className={badge}>{status}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-ash-400 mb-4">
        <span className="font-semibold text-white">{formatINR(total, locale)}</span>
        <span aria-label={translations.buyer_city}>{buyerCity || '-'}</span>
        <time dateTime={timestamp || undefined}>{formatRelativeTime(timestamp, locale)}</time>
      </div>

      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Order actions">
          {actions.map(({ label, action, variant }) => (
            <ActionButton
              key={action}
              variant={variant}
              onClick={() => onAction?.(action, orderId)}
            >
              {label}
            </ActionButton>
          ))}
          <ActionButton variant="danger" onClick={() => onAction?.('cancel', orderId)}>
            {translations.cancel}
          </ActionButton>
        </div>
      )}
    </article>
  );
}
