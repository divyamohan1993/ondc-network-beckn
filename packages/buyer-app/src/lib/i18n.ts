import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import ta from "@/i18n/ta.json";
import te from "@/i18n/te.json";
import kn from "@/i18n/kn.json";
import bn from "@/i18n/bn.json";

export type Locale = "en" | "hi" | "ta" | "te" | "kn" | "bn";

const messages: Record<Locale, Record<string, unknown>> = { en, hi, ta, te, kn, bn };

export function getMessages(locale: Locale) {
  return messages[locale] || messages.en;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const msgs = getMessages(locale);
  let value = getNestedValue(msgs as Record<string, unknown>, key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}
