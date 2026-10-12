import type { i18n } from "i18next";
import type { UIAdapter } from "./primitives";
import { Icon } from "./icons";

export function PluginHeading({ adapter, i18n, openSettings, className = "" }: { adapter: UIAdapter; i18n: i18n; openSettings: () => void; className?: string }) {
  const { Action } = adapter;
  return <div className={`ds-heading ${className}`} style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 0", width: "auto", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", paddingInlineStart: adapter.theme === "decky" ? 8 : 0 }}>
    <style>{`.ds-heading .ds-heading-settings { width:28px !important; min-width:28px !important; height:28px !important; min-height:28px !important; padding:4px !important; flex:none; display:flex; align-items:center; justify-content:center; border-radius:2px; } .ds-heading .ds-heading-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }`}</style>
    <span className="ds-heading-name">{i18n.t("app.name")}</span>
    <Action label={i18n.t("installer.openSettings")} focusKey="title-settings" className="ds-heading-settings" onClick={openSettings}><Icon name="settings" size={17} /></Action>
  </div>;
}
