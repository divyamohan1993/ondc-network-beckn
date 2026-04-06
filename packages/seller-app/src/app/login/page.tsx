"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("seller_auth_token");
    if (token) {
      router.replace("/");
    }
  }, [router]);

  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || "";
      const res = await fetch(`${BPP_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.token) {
        localStorage.setItem("seller_auth_token", data.token);
        if (data.provider_id) {
          localStorage.setItem("seller_provider_id", data.provider_id);
        }
        router.replace("/");
      } else {
        setError(data?.error?.message || "Invalid credentials");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <html lang="en" dir="ltr" className="dark">
      <body>
        <main className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-1">Seller Dashboard</h1>
              <p className="text-sm text-gray-400">Sign in to manage your shop</p>
            </div>

            <div className="bg-[#111118] border border-[#222233] rounded-xl p-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#333344] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-[#333344] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              {error && (
                <p id="login-error" className="text-sm text-red-400 font-medium" role="alert">
                  {error}
                </p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                type="button"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
