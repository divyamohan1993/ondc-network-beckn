import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

interface TimelineStep {
  key: string;
  labelKey: string;
  timestamp?: string;
  active: boolean;
  completed: boolean;
}

const STEPS = [
  { key: "confirmed", labelKey: "orders.confirmed" },
  { key: "packed", labelKey: "orders.packed" },
  { key: "shipped", labelKey: "orders.shipped" },
  { key: "out_for_delivery", labelKey: "orders.out_for_delivery" },
  { key: "delivered", labelKey: "orders.delivered" },
];

function buildTimeline(
  status: string,
  timestamps?: Record<string, string>
): TimelineStep[] {
  const statusOrder = STEPS.map((s) => s.key);
  const currentIdx = statusOrder.indexOf(status.toLowerCase().replace(/ /g, "_"));

  return STEPS.map((step, idx) => ({
    ...step,
    timestamp: timestamps?.[step.key],
    active: idx === currentIdx,
    completed: idx < currentIdx,
  }));
}

export default function OrderTimeline({
  status,
  timestamps,
  trackingUrl,
  locale,
}: {
  status: string;
  timestamps?: Record<string, string>;
  trackingUrl?: string;
  locale: Locale;
}) {
  const steps = buildTimeline(status, timestamps);

  return (
    <div role="list" aria-label={t(locale, "orders.track")}>
      <ol className="relative border-l-4 border-[var(--color-surface-border)] ml-4 space-y-6">
        {steps.map((step) => (
          <li key={step.key} className="ml-6" role="listitem">
            <span
              className={`absolute -left-[14px] w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step.completed
                  ? "bg-[var(--color-success)] text-[var(--color-text-inverse)]"
                  : step.active
                  ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)] ring-4 ring-[var(--color-brand-light)]"
                  : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
              }`}
              aria-hidden="true"
            >
              {step.completed ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
            </span>
            <p
              className={`font-semibold ${
                step.active || step.completed
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {t(locale, step.labelKey)}
              {step.active && (
                <span className="ml-2 badge badge-info text-[10px]">
                  {t(locale, "orders.status")}
                </span>
              )}
            </p>
            {step.timestamp && (
              <time
                className="text-sm text-[var(--color-text-muted)]"
                dateTime={step.timestamp}
              >
                {formatDate(step.timestamp)}
              </time>
            )}
          </li>
        ))}
      </ol>

      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary mt-6 inline-flex"
        >
          {t(locale, "orders.tracking_url")}
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </div>
  );
}
