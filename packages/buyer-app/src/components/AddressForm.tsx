"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export interface AddressData {
  name: string;
  phone: string;
  email: string;
  door: string;
  street: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
}

interface AddressFormProps {
  locale: Locale;
  onSubmit: (data: AddressData) => void;
  initialData?: Partial<AddressData>;
  submitLabel?: string;
}

export default function AddressForm({
  locale,
  onSubmit,
  initialData,
  submitLabel,
}: AddressFormProps) {
  const [data, setData] = useState<AddressData>({
    name: initialData?.name || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    door: initialData?.door || "",
    street: initialData?.street || "",
    locality: initialData?.locality || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    pincode: initialData?.pincode || "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AddressData, string>>>({});

  function validate(): boolean {
    const errs: Partial<Record<keyof AddressData, string>> = {};
    if (!data.name.trim()) errs.name = t(locale, "checkout.name_required");
    if (!data.phone.trim()) errs.phone = t(locale, "checkout.phone_required");
    if (!data.pincode.trim()) errs.pincode = t(locale, "checkout.pincode_required");
    if (!data.city.trim()) errs.city = t(locale, "checkout.city_required");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(data);
  }

  function field(key: keyof AddressData, required = false) {
    const label = t(locale, `checkout.${key}`);
    const errorId = `${key}-error`;
    return (
      <div>
        <label htmlFor={key} className="form-label">
          {label}
          {required && <span className="text-[var(--color-error)]" aria-hidden="true"> *</span>}
          {required && <span className="sr-only"> ({t(locale, `checkout.${key}_required`)})</span>}
        </label>
        <input
          id={key}
          name={key}
          type={key === "email" ? "email" : key === "phone" ? "tel" : key === "pincode" ? "text" : "text"}
          inputMode={key === "phone" || key === "pincode" ? "numeric" : undefined}
          value={data[key]}
          onChange={(e) => {
            setData((prev) => ({ ...prev, [key]: e.target.value }));
            if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
          }}
          className={`form-input ${errors[key] ? "border-[var(--color-error)]" : ""}`}
          required={required}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? errorId : undefined}
          autoComplete={
            key === "name" ? "name"
            : key === "phone" ? "tel"
            : key === "email" ? "email"
            : key === "pincode" ? "postal-code"
            : key === "city" ? "address-level2"
            : key === "state" ? "address-level1"
            : key === "street" ? "street-address"
            : undefined
          }
        />
        {errors[key] && (
          <p className="form-error" id={errorId} role="alert">
            {errors[key]}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
          {t(locale, "checkout.address")}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("name", true)}
          {field("phone", true)}
          {field("email")}
          {field("door")}
          {field("street")}
          {field("locality")}
          {field("city", true)}
          {field("state")}
          {field("pincode", true)}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary w-full mt-6">
        {submitLabel || t(locale, "checkout.place_order")}
      </button>
    </form>
  );
}
