"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import { useCart } from "@/lib/cart-store";
import { formatINR, padTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const PAYMENT_TIMEOUT_SECONDS = 600;

function PaymentContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const router = useRouter();
  const { clearCart } = useCart();

  const txnId = searchParams.get("txn") || "";
  const bppId = searchParams.get("bpp") || "";
  const bppUri = searchParams.get("bppUri") || "";
  const method = searchParams.get("method") || "cod";
  const amount = parseFloat(searchParams.get("amount") || "0");

  const [timeLeft, setTimeLeft] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [status, setStatus] = useState<"pending" | "processing" | "success" | "failed">("pending");

  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStatus("failed");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const confirmPayment = useCallback(async () => {
    setStatus("processing");
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: txnId,
          bpp_id: bppId,
          bpp_uri: bppUri,
          payment_method: method,
          amount: String(amount),
        }),
      });
      const data = await res.json();
      if (data?.context?.transaction_id || res.ok) {
        setStatus("success");
        clearCart();
        setTimeout(() => {
          router.push(`/orders/${txnId}?lang=${locale}`);
        }, 2000);
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  }, [txnId, bppId, bppUri, method, amount, clearCart, router, locale]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 text-center">
          {t(locale, "payment.title")}
        </h1>

        <div className="card text-center space-y-6">
          <p className="text-3xl font-bold text-[var(--color-text-primary)]">
            {formatINR(amount)}
          </p>

          {status === "pending" && (
            <p className="text-[var(--color-warning)] font-semibold" role="timer" aria-live="polite" aria-atomic="true">
              {t(locale, "payment.timer_expires", { minutes: padTime(minutes), seconds: padTime(seconds) })}
            </p>
          )}

          {method === "upi" && status === "pending" && (
            <div>
              <div className="w-48 h-48 mx-auto bg-[var(--color-bg-secondary)] rounded-xl flex items-center justify-center mb-4" aria-label="UPI QR Code placeholder">
                <svg aria-hidden="true" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="0.5">
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                  <rect x="14" y="2" width="8" height="8" rx="1" />
                  <rect x="2" y="14" width="8" height="8" rx="1" />
                  <rect x="14" y="14" width="4" height="4" rx="0.5" />
                  <rect x="18" y="18" width="4" height="4" rx="0.5" />
                </svg>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">{t(locale, "payment.upi_instruction")}</p>
            </div>
          )}

          {method === "cod" && status === "pending" && (
            <p className="text-[var(--color-text-secondary)]">{t(locale, "payment.cod_instruction")}</p>
          )}

          {method === "card" && status === "pending" && (
            <div className="text-left space-y-4">
              <div>
                <label htmlFor="card-number" className="form-label">Card Number</label>
                <input id="card-number" type="text" inputMode="numeric" placeholder="XXXX XXXX XXXX XXXX" className="form-input" autoComplete="cc-number" maxLength={19} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="card-expiry" className="form-label">Expiry</label>
                  <input id="card-expiry" type="text" placeholder="MM/YY" className="form-input" autoComplete="cc-exp" maxLength={5} />
                </div>
                <div>
                  <label htmlFor="card-cvv" className="form-label">CVV</label>
                  <input id="card-cvv" type="password" placeholder="***" className="form-input" autoComplete="cc-csc" maxLength={4} />
                </div>
              </div>
            </div>
          )}

          {status === "processing" && (
            <p className="text-[var(--color-info)] font-semibold" role="status" aria-live="polite">
              {t(locale, "payment.processing")}
            </p>
          )}
          {status === "success" && (
            <p className="text-[var(--color-success)] font-bold text-lg" role="status" aria-live="assertive">
              {t(locale, "payment.success")}
            </p>
          )}
          {status === "failed" && (
            <div role="alert">
              <p className="text-[var(--color-error)] font-semibold mb-4">{t(locale, "payment.failed")}</p>
              <button onClick={() => { setStatus("pending"); setTimeLeft(PAYMENT_TIMEOUT_SECONDS); }} className="btn btn-secondary" type="button">
                {t(locale, "common.retry")}
              </button>
            </div>
          )}

          {status === "pending" && (
            <button onClick={confirmPayment} className="btn btn-primary w-full" type="button">
              {method === "cod" ? t(locale, "checkout.place_order") : t(locale, "payment.pay_now")}
            </button>
          )}
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentContent />
    </Suspense>
  );
}
