import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { useTranslation } from "react-i18next";
import { formatDuration } from "../i18n";
import type { PlayerSnapshot } from "../player/types";
import { useAdapter } from "./primitives";

export function pairingCode(url: string): { path: string; size: number } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["spotify.com", "www.spotify.com", "accounts.spotify.com"].includes(parsed.hostname) || parsed.pathname.replace(/\/$/, "") !== "/pair" || parsed.username || parsed.password || parsed.port) return null;
    const code = qrcode(0, "M"); code.addData(url); code.make();
    const size = code.getModuleCount();
    const pixels: string[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (code.isDark(y, x)) pixels.push(`M${x + 4},${y + 4}h1v1h-1z`);
    return { path: pixels.join(""), size: size + 8 };
  } catch { return null; }
}
export function Pairing({ authentication, visible, cancel, retry }: { authentication: NonNullable<PlayerSnapshot["authentication"]>; visible: boolean; cancel: () => void; retry: () => void }) {
  const { t } = useTranslation(); const { Action } = useAdapter();
  const [now, setNow] = useState(Date.now);
  const qr = useMemo(() => pairingCode(authentication.url ?? ""), [authentication.url]);
  const deadline = authentication.expiresAt ?? 0;
  const expired = authentication.phase === "expired" || (authentication.phase === "waiting" && deadline <= now);
  const startupFailed = authentication.phase === "failed" && authentication.error === "startupFailed";
  useEffect(() => {
    if (!visible || authentication.phase !== "waiting") return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, authentication.phase, deadline]);
  if (authentication.phase === "failed" || expired || (authentication.phase === "waiting" && !qr)) return <div className="ds-pairing"><h2 className="ds-title">{t(expired ? "auth.expired" : startupFailed ? "auth.startupFailed" : "auth.failed")}</h2><p className="ds-subtitle">{t(expired ? "auth.expiredDescription" : startupFailed ? "auth.startupFailedDescription" : "auth.failedDescription")}</p><Action label={t(startupFailed ? "auth.retryStartup" : "auth.newCode")} focusKey="new-auth-code" className="ds-link" onClick={retry}>{t(startupFailed ? "auth.retryStartup" : "auth.newCode")}</Action></div>;
  if (authentication.phase === "starting") return <div className="ds-pairing" role="status"><p>{t("auth.starting")}</p><Action label={t("auth.cancel")} focusKey="cancel-auth" className="ds-link" onClick={cancel}>{t("auth.cancel")}</Action></div>;
  if (authentication.phase !== "waiting" || !qr) return null;
  return <div className="ds-pairing"><h2 className="ds-title">{t("auth.scan")}</h2><p className="ds-subtitle">{t("auth.instructions")}</p>
    <svg className="ds-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={t("auth.qrLabel")} shapeRendering="crispEdges"><rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.path} fill="#000" /></svg>
    <p className="ds-auth-code"><bdi>{authentication.code}</bdi></p><p className="ds-subtitle">{t("auth.codeAlternative")}</p>
    <p className="ds-subtitle">{t("auth.expires", { time: formatDuration(Math.max(0, deadline - now)) })}</p>
    <Action label={t("auth.cancel")} focusKey="cancel-auth" className="ds-link" onClick={cancel}>{t("auth.cancel")}</Action>
  </div>;
}
