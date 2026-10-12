import { describe, expect, it } from "vitest";
import { createPluginI18n, formatDuration, formatNumber, resolveLocale, resources } from "../src/i18n";

describe("English-only localization foundation", () => {
  it("contains only an English catalog", () => { expect(Object.keys(resources)).toEqual(["en"]); });
  it.each(["tr-TR", "de-DE", "zh_TW", "pt-BR", "invalid locale", "", "english"])("falls back to English for %s", locale => {
    expect(resolveLocale(locale).language).toBe("en");
    expect(createPluginI18n(locale).t("navigation.queue")).toBe("Queue");
  });
  it("normalizes locale identifiers at the boundary", () => { expect(resolveLocale("pt_br").requested).toBe("pt-BR"); });
  it("supports interpolation and English pluralization", () => {
    const i18n = createPluginI18n();
    expect(i18n.t("library.trackCount", { count: 1 })).toBe("1 track");
    expect(i18n.t("library.trackCount", { count: 2 })).toBe("2 tracks");
    expect(i18n.t("queue.count", { count: 0 })).toBe("0 songs coming up");
    expect(i18n.t("queue.count", { count: 1200 })).toBe("1,200 songs coming up");
    expect(i18n.t("queue.fromPlaylist", { name: "My playlist" })).toBe("Next from My playlist");
  });
  it("does not mutate metadata or share translation state between instances", () => {
    const first = createPluginI18n(); const second = createPluginI18n();
    first.addResource("en", "translation", "navigation.queue", "Expanded Queue");
    expect(second.t("navigation.queue")).toBe("Queue");
    expect(second.t("library.playTrack", { name: "Gece / 夜 / Ночь" })).toBe("Play Gece / 夜 / Ночь");
  });
  it("formats counts and durations consistently", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatDuration(82000)).toBe("1:22");
    expect(formatDuration(3661000)).toBe("61:01");
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
  });
});
