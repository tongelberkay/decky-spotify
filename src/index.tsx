import { addEventListener, call, definePlugin, removeEventListener } from "@decky/api";
import { createPluginI18n } from "./i18n";
import { LibrespotPlayerService } from "./player/librespot";
import type { LibrespotState } from "./player/librespot";
import type { PlayerCommand } from "./player/types";
import { PlayerApp } from "./ui/App";
import { deckyAdapter } from "./ui/decky";
import { Icon } from "./ui/icons";
import { PluginHeading } from "./ui/PluginHeading";
import { createSettingsNavigation } from "./ui/settingsNavigation";

export default definePlugin(() => {
  const service = new LibrespotPlayerService({
    install: () => call<[], { ok: boolean; error?: string }>("install_player"),
    authenticate: () => call<[], { ok: boolean }>("begin_authentication"),
    cancelAuthentication: () => call<[], { ok: boolean }>("cancel_authentication"),
    refreshQueue: () => call<[], { ok: boolean }>("refresh_queue"),
    setMusicCache: (enabled, sizeMB) => call<[boolean, number | null], { ok: boolean }>("set_music_cache", enabled, sizeMB ?? null),
    applyMusicCache: () => call<[], { ok: boolean }>("apply_music_cache"),
    activity: (visible, view) => call<[boolean, string], void>("set_view_activity", visible, view),
    playlists: () => call<[], readonly import("./player/types").PlaylistSummary[]>("get_playlists"),
    tracks: (uri, refresh) => call<[string, boolean], readonly import("./player/types").Track[] | { error: import("./player/types").PlaylistFailure }>("get_playlist_tracks", uri, refresh ?? false),
    read: () => call<[], LibrespotState>("get_player_state"),
    listen(listener) {
      const handle = addEventListener<[LibrespotState]>("player_state", listener);
      return () => removeEventListener("player_state", handle);
    },
    command: command => call<[PlayerCommand], { ok: boolean; error?: string }>("player_command", command),
  });
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
