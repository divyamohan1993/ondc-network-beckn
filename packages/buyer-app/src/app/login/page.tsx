"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function LoginContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = useCallback(async () => {
    if (!phone || phone.length < 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setStep("otp");
        // In demo mode (SMS_PROVIDER=mock), the OTP is returned in the response
        if (data?.otp) {
          setDemoOtp(data.otp);
        }
      } else {
        setError(data?.error?.message || data?.error || "Failed to send OTP. Try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const verifyOtp = useCallback(async () => {
    if (!otp || otp.length < 4) {
      setError("Enter a valid OTP");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.token) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_phone", phone);
        router.push(`/?lang=${locale}`);
      } else {
        setError(data?.error?.message || "Invalid OTP. Try again.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [phone, otp, router, locale]);

  return (
    <>
      <SkipNav label={t(locale, "nav.skip_to_content")} />
      <Header locale={locale} />
      <main id="main-content" className="max-w-sm mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 text-center">
          {locale === "hi" ? "लॉग इन" : "Log In"}
        </h1>

        <div className="card space-y-4">
          {step === "phone" && (
            <>
              <div>
                <label htmlFor="phone" className="form-label">
                  {locale === "hi" ? "फ़ोन नंबर" : "Phone Number"}
                </label>
                <div className="flex gap-2">
                  <span className="form-input w-16 text-center flex-shrink-0">+91</span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543210"
                    className="form-input flex-1"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    autoComplete="tel-national"
                    aria-describedby={error ? "login-error" : undefined}
                  />
                </div>
              </div>
              <button
                onClick={sendOtp}
                disabled={loading || phone.length < 10}
                className="btn btn-primary w-full"
                type="button"
              >
                {loading
                  ? (locale === "hi" ? "भेज रहे हैं..." : "Sending...")
                  : (locale === "hi" ? "OTP भेजें" : "Send OTP")}
              </button>
            </>
          )}

          {step === "otp" && (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">
                {locale === "hi"
                  ? `+91 ${phone} पर OTP भेजा गया`
                  : `OTP sent to +91 ${phone}`}
              </p>
              {demoOtp && (
                <div className="bg-[#1a3a1a] border border-[#138808] rounded-lg p-3 text-center" role="alert">
                  <p className="text-xs text-[#4ade80] mb-1">Demo Mode — OTP displayed here</p>
                  <p className="text-2xl font-mono font-bold tracking-[0.3em] text-white">{demoOtp}</p>
                </div>
              )}
              <div>
                <label htmlFor="otp" className="form-label">
                  {locale === "hi" ? "OTP दर्ज करें" : "Enter OTP"}
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  className="form-input text-center text-lg tracking-[0.5em]"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoComplete="one-time-code"
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length < 4}
                className="btn btn-primary w-full"
                type="button"
              >
                {loading
                  ? (locale === "hi" ? "सत्यापित कर रहे हैं..." : "Verifying...")
                  : (locale === "hi" ? "सत्यापित करें" : "Verify OTP")}
              </button>
              <button
                onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
                className="btn btn-secondary w-full"
                type="button"
              >
                {locale === "hi" ? "नंबर बदलें" : "Change Number"}
              </button>
            </>
          )}

          {error && (
            <p id="login-error" className="text-sm text-[var(--color-error)] font-medium" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
