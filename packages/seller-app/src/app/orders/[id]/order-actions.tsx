"use client";

import { useState, useCallback } from "react";

const BPP_URL = process.env.NEXT_PUBLIC_BPP_URL || "";

interface OrderActionsProps {
  transactionId: string;
  bapId: string;
  latestAction: string;
  domain: string;
  locale: string;
}

const STATUS_FLOW: Record<string, { next: string; label: string; labelHi: string }> = {
  confirm: { next: "Accepted", label: "Accept Order", labelHi: "ऑर्डर स्वीकार करें" },
  on_confirm: { next: "Accepted", label: "Accept Order", labelHi: "ऑर्डर स्वीकार करें" },
  Accepted: { next: "In-progress", label: "Pack Order", labelHi: "ऑर्डर पैक करें" },
  "In-progress": { next: "Order-picked-up", label: "Ship Order", labelHi: "ऑर्डर भेजें" },
  "Order-picked-up": { next: "Order-delivered", label: "Mark Delivered", labelHi: "डिलीवर किया" },
};

export default function OrderActions({
  transactionId,
  bapId,
  latestAction,
  domain,
  locale,
}: OrderActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentAction, setCurrentAction] = useState(latestAction);

  const flowEntry = STATUS_FLOW[currentAction];
  const canCancel = currentAction !== "Order-delivered" && currentAction !== "Cancelled";

  const performAction = useCallback(async (nextStatus: string) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`${BPP_URL}/api/fulfill/${transactionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          bap_id: bapId,
          bap_uri: `https://bap.${typeof window !== "undefined" ? window.location.hostname.replace(/^[^.]+\./, "") : "ondc.dmj.one"}`,
          transaction_id: transactionId,
          domain,
        }),
      });

      if (res.ok) {
        setSuccess(locale === "hi" ? `स्थिति बदलकर "${nextStatus}" हो गई` : `Status updated to "${nextStatus}"`);
        setCurrentAction(nextStatus);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Action failed");
      }
    } catch {
      setError(locale === "hi" ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [transactionId, bapId, domain, locale]);

  const cancelOrder = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`${BPP_URL}/api/fulfill/${transactionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Cancelled",
          bap_id: bapId,
          bap_uri: `https://bap.${typeof window !== "undefined" ? window.location.hostname.replace(/^[^.]+\./, "") : "ondc.dmj.one"}`,
          transaction_id: transactionId,
          domain,
        }),
      });

      if (res.ok) {
        setSuccess(locale === "hi" ? "ऑर्डर रद्द किया गया" : "Order cancelled");
        setCurrentAction("Cancelled");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Cancel failed");
      }
    } catch {
      setError(locale === "hi" ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [transactionId, bapId, domain, locale]);

  if (currentAction === "Order-delivered" || currentAction === "Cancelled") {
    return null;
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ash-500">
        {locale === "hi" ? "कार्रवाई" : "Actions"}
      </h2>

      <div className="flex flex-wrap gap-3">
        {flowEntry && (
          <button
            onClick={() => performAction(flowEntry.next)}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            type="button"
          >
            {loading ? "..." : (locale === "hi" ? flowEntry.labelHi : flowEntry.label)}
          </button>
        )}

        {canCancel && (
          <button
            onClick={cancelOrder}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            type="button"
          >
            {locale === "hi" ? "ऑर्डर रद्द करें" : "Cancel Order"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">{error}</p>
      )}
      {success && (
        <p className="text-sm text-emerald-400" role="status">{success}</p>
      )}
    </div>
  );
}
