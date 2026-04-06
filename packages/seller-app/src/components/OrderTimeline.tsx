import { formatDate } from '@/lib/format';

interface TimelineEvent {
  action: string;
  status: string | null;
  timestamp: string | null;
}

interface OrderTimelineProps {
  events: TimelineEvent[];
  locale: string;
  title: string;
}

function actionColor(action: string): string {
  if (action.includes('cancel')) return 'bg-ember-500';
  if (action.includes('confirm') || action === 'on_confirm') return 'bg-teal-500';
  if (action.includes('status') || action.includes('track')) return 'bg-saffron-500';
  return 'bg-ash-500';
}

export default function OrderTimeline({ events, locale, title }: OrderTimelineProps) {
  const sorted = [...events].sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  return (
    <section className="card" aria-label={title}>
      <h3 className="card-header">{title}</h3>
      <ol className="relative border-l-2 border-surface-border ml-4 space-y-6" role="list">
        {sorted.map((event, i) => (
          <li key={i} className="ml-6" role="listitem">
            <span
              className={`absolute -left-[9px] w-4 h-4 rounded-full ${actionColor(event.action)} border-2 border-abyss`}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-white capitalize">{event.action.replace(/_/g, ' ')}</p>
              <p className="text-xs text-ash-500 mt-0.5">
                {event.status && <span className="badge-gray mr-2">{event.status}</span>}
                <time dateTime={event.timestamp || undefined}>{formatDate(event.timestamp, locale)}</time>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
