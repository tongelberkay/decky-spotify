import { LibrespotPlayerService } from "../src/player/librespot";
import type { LibrespotState } from "../src/player/librespot";

/** Browser-only installer and phone pairing. No network or filesystem writes. */
export function createInstallerPreview() {
  let state: LibrespotState = { revision: 1, status: "disconnected", current: null, context: null, playing: false, positionMs: 0, volume: 50, shuffle: false, repeat: "off", queue: [], libraryVersion: 0, availableCommands: [], musicCache: { enabled: true, limitBytes: 1000000000, restartRequired: false }, authentication: { phase: "idle" }, runtime: { phase: "missing", downloadedBytes: 0, totalBytes: null, hasInstalled: false } };
  let listener: (state: LibrespotState) => void = () => {};
  let timer: ReturnType<typeof setInterval> | null = null;
  let fail = false;
  const emit = () => { state = { ...state, revision: state.revision + 1 }; listener(structuredClone(state)); };
  const service = new LibrespotPlayerService({
    read: async () => structuredClone(state),
    listen: callback => { listener = callback; return () => { listener = () => {}; }; },
    command: async () => ({ ok: false }), playlists: async () => [], tracks: async () => [], activity: async () => {},
    refreshQueue: async () => { state.queueStatus = "ready"; emit(); return { ok: true }; },
    setMusicCache: async (enabled, sizeMB) => { state.musicCache = { enabled, limitBytes: sizeMB === undefined ? state.musicCache!.limitBytes : sizeMB * 1000000, restartRequired: state.authentication?.phase === "connected" }; emit(); return { ok: true }; },
    applyMusicCache: async () => { state.musicCache!.restartRequired = false; emit(); return { ok: true }; },
    authenticate: async () => { state.diagnostics = [{ code: "starting", elapsedMs: 0 }, { code: "spawned", elapsedMs: 250 }, { code: "codeReceived", elapsedMs: 1000 }]; state.authentication = { phase: "waiting", url: "https://spotify.com/pair?code=DEMO00", code: "DEMO00", expiresAt: Date.now() + 300000 }; emit(); return { ok: true }; },
    cancelAuthentication: async () => { state.authentication = { phase: "idle" }; emit(); return { ok: true }; },
    install: async () => {
      if (timer) return { ok: true };
      const previous = state.runtime?.hasInstalled ?? false;
      state.runtime = { phase: "downloading", downloadedBytes: 0, totalBytes: 6725989, hasInstalled: previous }; emit();
      timer = setInterval(() => {
        const runtime = state.runtime!;
        const bytes = Math.min(6725989, runtime.downloadedBytes + 2000000);
        state.runtime = fail ? { ...runtime, phase: "failed", error: "downloadFailed" } : { ...runtime, downloadedBytes: bytes, phase: bytes === 6725989 ? "installed" : "downloading", hasInstalled: previous || bytes === 6725989 };
        fail = false; emit();
        if (state.runtime.phase !== "downloading") { clearInterval(timer!); timer = null; }
      }, 500);
      return { ok: true };
    },
  });
  return {
    service,
    failNext() { fail = true; },
    approve() { if (state.authentication?.phase !== "waiting") return; state.authentication = { phase: "connected" }; state.queueStatus = "ready"; state.status = "ready"; emit(); },
    expire() { if (state.authentication?.phase !== "waiting") return; state.authentication = { phase: "expired" }; emit(); },
    deny() { if (state.authentication?.phase !== "waiting") return; state.authentication = { phase: "failed" }; emit(); },
    reset() { if (timer) clearInterval(timer); timer = null; fail = false; state.diagnostics = []; state.runtime = { phase: "missing", downloadedBytes: 0, totalBytes: null, hasInstalled: false }; state.authentication = { phase: "idle" }; state.status = "disconnected"; emit(); },
    dispose() { if (timer) clearInterval(timer); service.dispose(); },
  };
}
