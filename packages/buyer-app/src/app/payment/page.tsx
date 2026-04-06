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

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

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
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay checkout script
  useEffect(() => {
    if (method !== "card" && method !== "razorpay") return;
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      setRazorpayLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => setRazorpayLoaded(true);
    document.body.appendChild(script);
  }, [method]);

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

  const openRazorpay = useCallback(async () => {
    if (!razorpayLoaded || !window.Razorpay) {
      setStatus("failed");
      return;
    }
    setStatus("processing");

    try {
      // Create a Razorpay order via our backend
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: txnId,
          bpp_id: bppId,
          bpp_uri: bppUri,
          payment_method: "card",
          amount: String(amount),
          create_gateway_order: true,
        }),
      });
      const data = await res.json();
      const gatewayOrderId = data?.gateway_order_id || data?.context?.transaction_id;

      const phone = localStorage.getItem("auth_phone") || "";

      const options: Record<string, unknown> = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(amount * 100),
        currency: "INR",
        name: "ONDC",
        description: `Order ${txnId}`,
        order_id: gatewayOrderId,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await fetch("/api/payment", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                transaction_id: txnId,
                bpp_id: bppId,
                bpp_uri: bppUri,
              }),
            });
            setStatus("success");
            clearCart();
            setTimeout(() => {
              router.push(`/orders/${txnId}?lang=${locale}`);
            }, 2000);
          } catch {
            setStatus("failed");
          }
        },
        modal: {
          ondismiss: () => {
            setStatus("pending");
          },
        },
        prefill: {
          contact: phone ? `+91${phone}` : "",
        },
        theme: {
          color: "#F97316",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setStatus("failed");
    }
  }, [razorpayLoaded, txnId, bppId, bppUri, amount, clearCart, router, locale]);

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

          {(method === "card" || method === "razorpay") && status === "pending" && (
            <div className="space-y-3">
              <p className="text-[var(--color-text-secondary)] text-sm">
                {locale === "hi"
                  ? "कार्ड, UPI, नेटबैंकिंग से भुगतान करें"
                  : "Pay securely via Card, UPI, or Netbanking"}
              </p>
              <button
                onClick={openRazorpay}
                disabled={!razorpayLoaded}
                className="btn btn-primary w-full"
                type="button"
              >
                {razorpayLoaded
                  ? (locale === "hi" ? "भुगतान करें" : "Pay Now")
                  : (locale === "hi" ? "लोड हो रहा है..." : "Loading...")}
              </button>
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

          {status === "pending" && method !== "card" && method !== "razorpay" && (
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
