import { definePlugin } from "@decky/api";
import { createPluginI18n } from "./i18n";
import { MockPlayerService } from "./player/mock";
import { PlayerApp } from "./ui/App";
import { deckyAdapter } from "./ui/decky";
import { Icon } from "./ui/icons";
import { PluginHeading } from "./ui/PluginHeading";
import { createSettingsNavigation } from "./ui/settingsNavigation";

export default definePlugin(() => {
  const service = new MockPlayerService();
  const i18n = createPluginI18n(navigator.language);
  const settingsNavigation = createSettingsNavigation();
  return {
    name: "Decky Spotify",
    titleView: <PluginHeading adapter={deckyAdapter} i18n={i18n} openSettings={settingsNavigation.open} />,
    icon: <Icon name="music" />,
    content: <PlayerApp service={service} adapter={deckyAdapter} i18n={i18n} settingsNavigation={settingsNavigation} />,
    onDismount() { service.dispose(); },
  };
});
