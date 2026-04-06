import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import ta from "@/i18n/ta.json";
import te from "@/i18n/te.json";
import kn from "@/i18n/kn.json";
import bn from "@/i18n/bn.json";

export type Locale = "en" | "hi" | "ta" | "te" | "kn" | "bn";

const messages: Record<string, typeof en> = { en, hi, ta, te, kn, bn };

export function getMessages(locale: string): typeof en {
  return messages[locale] || messages.en;
}
