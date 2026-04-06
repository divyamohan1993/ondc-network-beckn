"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import OrderTimeline from "@/components/OrderTimeline";
import { OrderSkeleton } from "@/components/LoadingSkeleton";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface OrderDetail {
  transaction_id: string;
  status: string;
  latest_action: string;
  callback_received: boolean;
  callback_data: unknown;
  history: Array<{
    action: string;
    status: string;
    created_at: string;
    message_id: string;
  }>;
}

function deriveOrderStatus(detail: OrderDetail): string {
  const action = detail.latest_action?.toLowerCase() || "";
  if (action.includes("cancel")) return "cancelled";
  if (action.includes("deliver") || detail.status === "COMPLETED") return "delivered";
  if (action.includes("ship") || action.includes("track")) return "shipped";
  if (action.includes("pack")) return "packed";
  return "confirmed";
}

function extractTimestamps(detail: OrderDetail): Record<string, string> {
  const timestamps: Record<string, string> = {};
  for (const h of detail.history) {
    if (h.action === "on_confirm" || h.action === "confirm") timestamps.confirmed = h.created_at;
    if (h.action === "on_status") timestamps.shipped = h.created_at;
  }
  return timestamps;
}

function OrderDetailContent({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders?txn=${orderId}`);
        if (res.ok) {
          setOrder(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <OrderSkeleton />
        ) : error || !order ? (
          <div className="text-center py-12" role="alert">
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t(locale, "common.error")}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              {t(locale, "orders.track")}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mb-6 font-mono">
              {t(locale, "orders.order_id")}: {order.transaction_id}
            </p>

            <div className="card mb-6">
              <OrderTimeline
                status={deriveOrderStatus(order)}
                timestamps={extractTimestamps(order)}
                locale={locale}
              />
            </div>

            {order.history.length > 0 && (
              <div className="card">
                <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">Activity</h2>
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b-2 border-[var(--color-surface-border)]">
                      <th scope="col" className="text-left py-2 font-semibold text-[var(--color-text-secondary)]">Action</th>
                      <th scope="col" className="text-left py-2 font-semibold text-[var(--color-text-secondary)]">{t(locale, "orders.status")}</th>
                      <th scope="col" className="text-left py-2 font-semibold text-[var(--color-text-secondary)]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.history.map((h, i) => (
                      <tr key={i} className="border-b border-[var(--color-surface-border)]">
                        <td className="py-2 font-mono">{h.action}</td>
                        <td className="py-2">
                          <span className={`badge ${
                            h.status === "ACK" || h.status === "COMPLETED" ? "badge-success" :
                            h.status === "NACK" || h.status === "ERROR" ? "badge-error" : "badge-info"
                          }`}>
                            {h.status}
                          </span>
                        </td>
                        <td className="py-2 text-[var(--color-text-muted)]">
                          {new Date(h.created_at).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function OrderDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    paramsPromise.then((p) => setOrderId(p.id));
  }, [paramsPromise]);

  if (!orderId) return null;

  return (
    <Suspense>
      <OrderDetailContent orderId={orderId} />
    </Suspense>
  );
}
