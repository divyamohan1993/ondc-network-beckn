"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const ISSUE_TYPES = [
  "item_not_received",
  "wrong_item",
  "damaged_item",
  "quality_issue",
  "refund",
  "other",
] as const;

function SupportContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;

  const [orderId, setOrderId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: orderId.trim(), issue_type: issueType, description, phone, email }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(t(locale, "common.error"));
      }
    } catch {
      setError(t(locale, "common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">
          {t(locale, "support.title")}
        </h1>

        {submitted ? (
          <div className="card text-center py-8" role="status" aria-live="polite">
            <svg aria-hidden="true" className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t(locale, "support.submitted")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="card bg-[var(--color-error-light)] border-[var(--color-error-border)] mb-4 text-[var(--color-error)] font-semibold" role="alert">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="order-id" className="form-label">
                  {t(locale, "support.order_id_label")}
                  <span className="text-[var(--color-error)]" aria-hidden="true"> *</span>
                </label>
                <input id="order-id" type="text" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="form-input" required />
              </div>
              <div>
                <label htmlFor="issue-type" className="form-label">{t(locale, "support.issue_type")}</label>
                <select id="issue-type" value={issueType} onChange={(e) => setIssueType(e.target.value)} className="form-input">
                  <option value="">--</option>
                  {ISSUE_TYPES.map((type) => (
                    <option key={type} value={type}>{t(locale, `support.issue_types.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="description" className="form-label">{t(locale, "support.description")}</label>
                <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input min-h-[120px]" rows={4} />
              </div>
              <div>
                <label htmlFor="support-phone" className="form-label">{t(locale, "support.phone")}</label>
                <input id="support-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className="form-input" autoComplete="tel" />
              </div>
              <div>
                <label htmlFor="support-email" className="form-label">{t(locale, "support.email")}</label>
                <input id="support-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" autoComplete="email" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full mt-6" disabled={submitting}>
              {submitting ? t(locale, "common.loading") : t(locale, "support.submit")}
            </button>
          </form>
        )}
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportContent />
    </Suspense>
  );
}
