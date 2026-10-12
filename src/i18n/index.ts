import { createInstance } from "i18next";
import en from "../locales/en.json";

export const resources = { en: { translation: en } } as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: typeof resources.en;
    returnNull: false;
    strictKeyChecks: true;
  }
}

export interface LocaleResolution { requested: string; language: "en"; direction: "ltr" }

// This seam will grow when translated catalogs are added. Do not use Decky's global instance.
export function resolveLocale(requested = "en"): LocaleResolution {
  let normalized = "en";
  try { normalized = Intl.getCanonicalLocales(requested.replaceAll("_", "-"))[0] ?? "en"; } catch { /* Unsupported Steam token/locale: English. */ }
  return { requested: normalized, language: "en", direction: "ltr" };
}

export function createPluginI18n(requested = "en") {
  const locale = resolveLocale(requested);
  const instance = createInstance();
  void instance.init({ resources: structuredClone(resources), lng: locale.language, fallbackLng: "en", initImmediate: false, returnNull: false, returnEmptyString: false, showSupportNotice: false, interpolation: { escapeValue: false } });
  instance.services.formatter?.add("number", (value, language) => formatNumber(Number(value), language));
  return instance;
}

export function formatNumber(value: number, locale = "en", options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(resolveLocale(locale).language, { maximumFractionDigits: 0, ...options }).format(value);
}

export function formatDuration(milliseconds: number, locale = "en"): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  const formatter = new Intl.NumberFormat(resolveLocale(locale).language, { useGrouping: false, minimumIntegerDigits: 2 });
  return `${formatNumber(minutes, locale)}:${formatter.format(seconds % 60)}`;
}

export function formatRetryTime(milliseconds: number, locale = "en"): string {
  return new Intl.DateTimeFormat(resolveLocale(locale).language, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(milliseconds));
}
