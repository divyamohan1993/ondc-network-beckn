"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipNav from "@/components/SkipNav";
import AddressForm from "@/components/AddressForm";
import type { AddressData } from "@/components/AddressForm";
import PaymentSelector from "@/components/PaymentSelector";
import type { PaymentMethod } from "@/components/PaymentSelector";
import CartSummary from "@/components/CartSummary";
import { useCart } from "@/lib/cart-store";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const locale = (searchParams.get("lang") === "hi" ? "hi" : "en") as Locale;
  const router = useRouter();
  const { items, subtotal, setTransactionId } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedTax = Math.round(subtotal * 0.05);

  if (items.length === 0) {
    router.push(`/cart?lang=${locale}`);
    return null;
  }

  async function handleSubmit(address: AddressData) {
    if (!paymentMethod) {
      setError(t(locale, "checkout.payment") + " is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const grouped = new Map<string, typeof items>();
      for (const item of items) {
        const key = `${item.bppId}:${item.providerId}`;
        const group = grouped.get(key) || [];
        group.push(item);
        grouped.set(key, group);
      }

      for (const [, groupItems] of grouped) {
        const first = groupItems[0]!;

        const selectRes = await fetch("/api/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bpp_id: first.bppId,
            bpp_uri: first.bppUri,
            provider_id: first.providerId,
            domain: first.domain || "ONDC:RET10",
            items: groupItems.map((i) => ({
              id: i.itemId,
              quantity: { count: i.quantity },
            })),
          }),
        });
        const selectData = await selectRes.json();
        const txnId = selectData?.context?.transaction_id;
        if (!txnId) throw new Error("Select failed");

        setTransactionId(txnId);

        await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init",
            transaction_id: txnId,
            bpp_id: first.bppId,
            bpp_uri: first.bppUri,
            domain: first.domain || "ONDC:RET10",
            billing: {
              name: address.name,
              phone: address.phone,
              email: address.email,
              address: {
                door: address.door,
                street: address.street,
                locality: address.locality,
                city: address.city,
                state: address.state,
                country: "IND",
                area_code: address.pincode,
              },
            },
            fulfillment: {
              type: "Delivery",
              end: {
                location: {
                  address: {
                    door: address.door,
                    street: address.street,
                    locality: address.locality,
                    city: address.city,
                    state: address.state,
                    country: "IND",
                    area_code: address.pincode,
                  },
                },
                contact: { phone: address.phone, email: address.email },
              },
            },
          }),
        });

        const params = new URLSearchParams({
          txn: txnId,
          bpp: first.bppId,
          bppUri: first.bppUri,
          method: paymentMethod!,
          amount: String(subtotal + estimatedTax),
          lang: locale,
        });
        router.push(`/payment?${params.toString()}`);
        return;
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
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">
          {t(locale, "checkout.title")}
        </h1>

        {error && (
          <div
            className="card bg-[var(--color-error-light)] border-[var(--color-error-border)] mb-6 text-[var(--color-error)] font-semibold"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <AddressForm
              locale={locale}
              onSubmit={handleSubmit}
              submitLabel={
                submitting ? t(locale, "common.loading") : t(locale, "checkout.place_order")
              }
            />
            <PaymentSelector locale={locale} onSelect={setPaymentMethod} />
          </div>
          <div>
            <CartSummary
              subtotal={subtotal}
              deliveryFee={0}
              taxes={estimatedTax}
              locale={locale}
            />
          </div>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}
