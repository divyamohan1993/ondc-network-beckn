"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import { OrderSkeleton } from "@/components/LoadingSkeleton";
import { formatDateShort } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface OrderRecord {
  transaction_id: string;
  status: string;
  latest_action: string;
  created_at?: string;
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch("/api/orders");
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">
          {t(locale, "orders.title")}
        </h1>

        {loading ? (
          <div className="space-y-4">
            <OrderSkeleton />
            <OrderSkeleton />
            <OrderSkeleton />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              {t(locale, "orders.empty")}
            </p>
            <p className="text-[var(--color-text-muted)] mb-6">
              {t(locale, "orders.empty_message")}
            </p>
            <Link href={`/?lang=${locale}`} className="btn btn-primary">
              {t(locale, "cart.start_shopping")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4" role="list">
            {orders.map((order) => (
              <div key={order.transaction_id} className="card" role="listitem">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--color-text-muted)]">{t(locale, "orders.order_id")}</p>
                    <p className="font-semibold text-[var(--color-text-primary)] font-mono text-sm">
                      {order.transaction_id}
                    </p>
                    {order.created_at && (
                      <p className="text-sm text-[var(--color-text-muted)] mt-1">
                        {t(locale, "orders.placed_on")}: {formatDateShort(order.created_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${
                      order.status === "COMPLETED" ? "badge-success" :
                      order.status === "CANCELLED" ? "badge-error" : "badge-info"
                    }`}>
                      {order.status}
                    </span>
                    <Link href={`/orders/${order.transaction_id}?lang=${locale}`} className="btn btn-secondary btn-sm">
                      {t(locale, "orders.details")}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  );
}
