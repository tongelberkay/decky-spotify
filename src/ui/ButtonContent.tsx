import type { ReactNode } from "react";

/** Steam wraps button labels; keep our row layout inside that wrapper. */
export function ButtonContent({ children, className }: { children: ReactNode; className: string }) {
  const justifyContent = className.includes("ds-list-row") ? "flex-start" : className.includes("ds-link") ? "space-between" : "center";
  return <div className="ds-button-content" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent, gap: 6, width: "100%", minWidth: 0, maxWidth: "100%" }}>{children}</div>;
}
