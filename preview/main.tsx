import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createPluginI18n } from "../src/i18n";
import en from "../src/locales/en.json";
import { MockPlayerService, mockScenarios } from "../src/player/mock";
import type { MockScenario } from "../src/player/mock";
import { PlayerApp } from "../src/ui/App";
import { browserAdapter } from "../src/ui/browser";
import { Icon } from "../src/ui/icons";
import { usePlayer } from "../src/ui/hooks";
import { steamThemeDeclarations } from "../src/ui/theme";
import { createInstallerPreview } from "./installer";
import { PluginHeading } from "../src/ui/PluginHeading";
import { createSettingsNavigation } from "../src/ui/settingsNavigation";
import "./style.css";

const previewI18n = createPluginI18n(navigator.language);
function expandEnglish(value: unknown): unknown {
  if (typeof value === "string") return `${value} — extra text`;
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnglish(item)]));
  return value;
}

function Preview() {
  const { t } = useTranslation();
  const [service] = useState(() => new MockPlayerService());
  const [installer] = useState(createInstallerPreview);
  const [settingsNavigation] = useState(createSettingsNavigation);
  const [scenario, setScenario] = useState<MockScenario | "playerSetup">("ready");
  const activeService = scenario === "playerSetup" ? installer.service : service;
  const state = usePlayer(activeService);
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);
  const screenViewport = useRef<HTMLDivElement>(null);
  const [screenWidth, setScreenWidth] = useState(1280);
  const panelOnly = screenWidth < 700;
  const screenScale = panelOnly ? 1 : Math.min(1, screenWidth / 1280);
  useEffect(() => {
    const element = screenViewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setScreenWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const playerI18n = useMemo(() => {
    const instance = createPluginI18n(navigator.language);
    if (expanded) instance.addResourceBundle("en", "translation", expandEnglish(en), true, true);
    return instance;
  }, [expanded]);
  useEffect(() => { document.title = `${t("app.name")} — ${t("preview.badge")}`; }, [t]);
  useEffect(() => () => { service.dispose(); installer.dispose(); }, [service, installer]);
  const ready = state.status === "ready";
  function reset(next: MockScenario | "playerSetup" = "ready") { installer.reset(); if (next !== "playerSetup") service.setScenario(next); setScenario(next); setPreviewVersion(version => version + 1); }
  return <div className="preview-page">
    <style>{`:root { ${steamThemeDeclarations} }`}</style>
    <header className="preview-header"><div><p className="preview-eyebrow"><span className="preview-mark"><Icon name="music" size={15} /></span>{t("preview.eyebrow")}</p><h1>{t("preview.title")}</h1><p className="preview-intro">{t("preview.description")}</p></div><span className="preview-badge"><span />{t("preview.badge")}</span></header>
    <section className="preview-tools" aria-label={t("preview.scenario")}>
      <div className="preview-tool-top"><label htmlFor="scenario">{t("preview.scenario")}</label><select id="scenario" value={scenario} onChange={event => reset(event.currentTarget.value as MockScenario | "playerSetup")}>{mockScenarios.map(value => <option key={value} value={value}>{t(`preview.${value}`)}</option>)}<option value="playerSetup">{t("preview.playerSetup")}</option></select><button onClick={() => reset()}>{t("preview.reset")}</button><label className="preview-checkbox"><input type="checkbox" checked={expanded} onChange={event => setExpanded(event.currentTarget.checked)} />{t("preview.expandText")}</label><button className="preview-panel-toggle" onClick={() => setPanelOpen(value => !value)}>{t(panelOpen ? "preview.hidePanel" : "preview.showPanel")}</button></div>
      {scenario === "playerSetup" && <div className="preview-phone-tools"><button disabled={state.authentication?.phase !== "waiting"} onClick={installer.approve}>{t("preview.phoneApprove")}</button><button disabled={state.authentication?.phase !== "waiting"} onClick={installer.expire}>{t("preview.phoneExpire")}</button><button disabled={state.authentication?.phase !== "waiting"} onClick={installer.deny}>{t("preview.phoneDeny")}</button></div>}
      <div className="preview-phone-tools"><span>{t("preview.phoneLabel")}</span><button disabled={!ready} onClick={() => service.simulatePhoneAdd()}>{t("preview.phoneAdd")}</button><button disabled={!ready} onClick={() => service.simulatePhoneAdd(2)}>{t("preview.phoneDuplicate")}</button><button disabled={!ready} onClick={service.simulatePhoneReorder}>{t("preview.phoneReorder")}</button><button disabled={!ready || !state.queue.length} onClick={service.simulatePhoneNext}>{t("preview.phoneNext")}</button><button disabled={!ready || !state.current} onClick={service.simulatePhoneToggle}>{t("preview.phoneToggle")}</button><button disabled={!ready && scenario !== "playerSetup"} onClick={() => scenario === "playerSetup" ? installer.failNext() : service.armFailure()}>{t("preview.failNext")}</button></div>
    </section>
    <div className={`deck-viewport ${panelOnly ? "deck-viewport-panel" : ""}`} ref={screenViewport} style={{ height: panelOnly ? 800 : 800 * screenScale }}>
    <section className="deck-screen" aria-label={t("preview.screenLabel")} style={{ transform: `scale(${screenScale})` }}>
      <div className="game-scene"><div className="scene-stars" /><div className="scene-moon" /><div className="scene-ridge scene-ridge-back" /><div className="scene-ridge scene-ridge-front" /><div className="scene-glow" />
        <div className="game-topbar"><span className="game-mode"><span />{t("preview.gamingMode")}</span><span>{t("preview.time")}</span></div>
        <div className="game-copy"><p>{t("preview.gameTag")}</p><h2>{t("preview.gameTitle")}</h2><span>{t("preview.gameSubtitle")}</span></div>
        <div className="game-bottom"><span className="game-menu-dot">•••</span><span>{t("preview.quickAccess")}</span></div>
      </div>
      {panelOpen && <><div className="qam-rail" aria-hidden="true"><span><Icon name="bell" size={24} /></span><span><Icon name="users" size={24} /></span><span><Icon name="settings" size={24} /></span><span><Icon name="battery" size={24} /></span><span><Icon name="help" size={24} /></span><span className="qam-rail-selected"><Icon name="plug" size={24} /></span></div><aside className="deck-panel"><div className="deck-panel-top"><div className="deck-panel-route"><Icon name="back" size={14} /><span>{t("preview.pluginTab")}</span></div><div className="deck-panel-title"><PluginHeading adapter={browserAdapter} i18n={playerI18n} openSettings={settingsNavigation.open} /></div></div><div className="deck-panel-content"><PlayerApp key={`${previewVersion}-${expanded}`} service={activeService} adapter={browserAdapter} i18n={playerI18n} expanded={expanded} settingsNavigation={settingsNavigation} /></div></aside></>}
    </section></div>
    <footer className="preview-footer"><span><span className="preview-status-dot" />{t("preview.noAudio")}</span><span>{t(panelOnly ? "preview.panelSize" : "preview.displaySize")}</span><span>{t("hints.keyboard")}</span></footer>
    <p className="preview-note">{t(scenario === "playerSetup" ? "preview.installNote" : "preview.note")}</p>
  </div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<I18nextProvider i18n={previewI18n}><Preview /></I18nextProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
