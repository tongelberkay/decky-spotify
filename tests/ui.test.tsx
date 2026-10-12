// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginI18n } from "../src/i18n";
import { MockPlayerService } from "../src/player/mock";
import { LibrespotPlayerService } from "../src/player/librespot";
import type { LibrespotBridge, LibrespotState } from "../src/player/librespot";
import { PlayerApp } from "../src/ui/App";
import { browserAdapter } from "../src/ui/browser";

describe("shared player UI", () => {
  let service: MockPlayerService;
  beforeEach(() => {
    service = new MockPlayerService({ latency: 0 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); service.dispose(); vi.useRealTimers(); });
  function mount() { return render(<PlayerApp service={service} adapter={browserAdapter} i18n={createPluginI18n()} />); }
  function tab(name: string) { return within(screen.getByRole("navigation")).getByRole("button", { name }); }

  it("reflects external queue additions and preserves duplicates", () => {
    mount(); fireEvent.click(tab("Queue"));
    act(() => service.simulatePhoneAdd(2));
    expect(screen.getAllByRole("listitem", { name: "Soft Focus by Daybreak" })).toHaveLength(2);
    expect(screen.getByText("6 songs coming up")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next in queue" })).toBeTruthy();
    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(6);
    expect(entries.every(element => element.tabIndex === 0)).toBe(true);
  });
  it("shows only Up next when queue source information is missing", () => {
    service.setScenario("unknownSources"); mount(); fireEvent.click(tab("Queue"));
    expect(screen.getByRole("heading", { name: "Up next" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Next in queue" })).toBeNull();
  });
  it("restores playlist row focus when going back with Escape", async () => {
    mount(); fireEvent.click(tab("Playlists"));
    const row = await screen.findByRole("button", { name: "Open Golden Days" });
    row.focus(); fireEvent.click(row);
    const back = await screen.findByRole("button", { name: "Back" });
    fireEvent.keyDown(back, { key: "Escape" });
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Open Golden Days"));
  });
  it("keeps the previously shown tracks when reopening cannot update them", async () => {
    const tracks = await service.getPlaylistTracks("golden-days");
    vi.spyOn(service, "getPlaylistTracks").mockResolvedValueOnce(tracks).mockRejectedValue(new Error("unavailable"));
    mount(); fireEvent.click(tab("Playlists"));
    fireEvent.click(await screen.findByRole("button", { name: "Open Golden Days" }));
    expect(await screen.findByRole("button", { name: "Play Soft Focus" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Golden Days" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not update this playlist. Showing the last successfully loaded list.");
    expect(screen.getByRole("button", { name: "Play Soft Focus" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh track details" })).toBeNull();
  });
  it("starts a selected track and returns to Now Playing", async () => {
    mount(); fireEvent.click(tab("Playlists"));
    fireEvent.click(await screen.findByRole("button", { name: "Open Golden Days" }));
    fireEvent.click(await screen.findByRole("button", { name: "Play Soft Focus" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Soft Focus" })).toBeTruthy());
    expect(service.getSnapshot().context?.id).toBe("golden-days");
  });
  it("keeps the track-list screen when starting playback fails", async () => {
    mount(); fireEvent.click(tab("Playlists"));
    fireEvent.click(await screen.findByRole("button", { name: "Open After Hours" }));
    const play = await screen.findByRole("button", { name: "Play playlist" });
    service.armFailure(); fireEvent.click(play);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "After Hours", level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" })); fireEvent.click(play);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Night Drive", level: 1 })).toBeTruthy());
  });
  it("keeps the latest seek and volume values while commands are pending", async () => {
    service.dispose(); service = new MockPlayerService({ latency: 10 }); mount();
    const volume = screen.getByRole("slider", { name: "Music volume" });
    const seek = screen.getByRole("slider", { name: "Playback position" });
    fireEvent.change(volume, { target: { value: "60" } });
    fireEvent.change(seek, { target: { value: "100000" } });
    fireEvent.change(volume, { target: { value: "80" } });
    fireEvent.change(seek, { target: { value: "120000" } });
    await waitFor(() => expect(service.getSnapshot().volume).toBe(80));
    await waitFor(() => expect(service.getSnapshot().positionMs).toBeGreaterThanOrEqual(120000));
    expect(screen.queryByText("Updating playback…")).toBeNull();
  });
  it("disables playback while offline but retains the queue", () => {
    service.setScenario("offline"); mount();
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You’re offline")).toBeTruthy();
    fireEvent.click(tab("Queue"));
    expect(screen.getByRole("listitem", { name: "Sunroom by Juniper" })).toBeTruthy();
  });
  it("renders the missing-artwork fallback without a broken image", () => {
    service.setScenario("missingArtwork"); mount();
    expect(screen.getAllByRole("img", { name: "Artwork unavailable" })).toHaveLength(2);
    expect(document.querySelector(".ds-app img")).toBeNull();
  });
  it("opens a playlist after its custom cover fails without a manual refresh control", async () => {
    vi.spyOn(service, "getPlaylists").mockResolvedValue([{ id: "spotify:playlist:5Jm63LQHocyXae6iXWR7kq", title: "Custom cover mix", description: "", trackCount: 1, artwork: "https://example.com/custom-cover.jpg" }]);
    const load = vi.spyOn(service, "getPlaylistTracks").mockResolvedValueOnce([{ id: "spotify:track:pending", title: "", artist: "", album: "", durationMs: 0, metadataPending: true }]).mockResolvedValue([{ id: "spotify:track:pending", title: "Resolved song", artist: "Artist", album: "", durationMs: 60000 }]);
    mount(); fireEvent.click(tab("Playlists"));
    const playlist = await screen.findByRole("button", { name: "Open Custom cover mix" });
    fireEvent.error(within(playlist).getByRole("img", { name: "Playlist artwork for Custom cover mix" }));
    expect(within(playlist).getByRole("img", { name: "Artwork unavailable" })).toBeTruthy();
    fireEvent.click(playlist);
    expect(await screen.findByRole("button", { name: "Play Track details unavailable" })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Refresh track details" })).toBeNull();
  });
  it("bounds queue rendering and pages without deduplicating", () => {
    service.simulatePhoneAdd(30); mount(); fireEvent.click(tab("Queue"));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });
  it("has no progress interval after unmounting or while viewing playlists", async () => {
    service.dispose(); vi.useFakeTimers(); service = new MockPlayerService({ latency: 0 });
    const { unmount } = mount();
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(service.getSnapshot().positionMs).toBe(84000);
    await act(async () => { fireEvent.click(tab("Playlists")); });
    expect(vi.getTimerCount()).toBe(0);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("uses an isolated English catalog for expanded-text review", () => {
    const i18n = createPluginI18n();
    i18n.addResource("en", "translation", "navigation.playlists", "Playlists with extra English text");
    render(<PlayerApp service={service} adapter={browserAdapter} i18n={i18n} expanded />);
    expect(screen.getByRole("button", { name: "Playlists with extra English text" })).toBeTruthy();
    expect(createPluginI18n().t("navigation.playlists")).toBe("Playlists");
  });
});


function liveState(): LibrespotState {
  return { revision: 1, status: "disconnected", current: null, context: null, playing: false, positionMs: 0, volume: 50, shuffle: false, repeat: "off", queue: [], libraryVersion: 0, availableCommands: [], runtime: { phase: "missing", downloadedBytes: 0, totalBytes: null, hasInstalled: false }, authentication: { phase: "idle" } };
}
function live(initial = liveState()) {
  let emit: (state: LibrespotState) => void = () => {};
  const bridge: LibrespotBridge = { read: async () => initial, listen: callback => { emit = callback; return () => {}; }, command: vi.fn(async () => ({ ok: true })), install: vi.fn(async () => ({ ok: true })), authenticate: vi.fn(async () => ({ ok: true })), cancelAuthentication: vi.fn(async () => ({ ok: true })), playlists: vi.fn(async () => []), tracks: vi.fn(async () => []), activity: vi.fn(async () => {}) };
  const service = new LibrespotPlayerService(bridge);
  render(<PlayerApp service={service} adapter={browserAdapter} i18n={createPluginI18n()} />);
  return { service, bridge, emit: (state: LibrespotState) => emit(state) };
}
describe("managed player and phone sign-in UI", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it("shows a specific certificate failure and keeps retry available", async () => {
    const initial = liveState(); initial.runtime = { ...initial.runtime!, phase: "failed", error: "tlsFailed" };
    const { service, bridge } = live(initial);
    await screen.findByText(/Install the player in Setup/);
    fireEvent.click(screen.getAllByRole("button", { name: "Setup" })[0]);
    expect(screen.getByRole("alert").textContent).toContain("certificate");
    fireEvent.click(screen.getByRole("button", { name: "Retry download" }));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledTimes(1)); service.dispose();
  });
  it("distinguishes player startup failure from an expired sign-in code", async () => {
    const initial = liveState(); initial.authentication = { phase: "failed", error: "startupFailed" };
    const { service, bridge } = live(initial);
    expect(await screen.findByRole("heading", { name: "Player could not start" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Get a new code" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry starting player" }));
    await waitFor(() => expect(bridge.authenticate).toHaveBeenCalledTimes(1)); service.dispose();
  });
  it("shows translated temporary startup logs with elapsed time in Setup", async () => {
    const initial = liveState(); initial.authentication = { phase: "starting" }; initial.diagnostics = [{ code: "spawned", elapsedMs: 1000 }, { code: "apiTimeout", elapsedMs: 12000 }];
    const { service } = live(initial);
    expect(await screen.findByRole("region", { name: "Temporary sign-in log" })).toBeTruthy();
    expect(screen.getByText("Player process started.")).toBeTruthy();
    expect(screen.getByText("Local player API request timed out.")).toBeTruthy();
    expect(screen.getByText("0:12")).toBeTruthy(); service.dispose();
  });
  it("starts installation and displays progress, then exposes phone sign-in", async () => {
    const { service, bridge, emit } = live();
    await screen.findByText(/Install the player in Setup/);
    fireEvent.click(screen.getAllByRole("button", { name: "Setup" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Install player" }));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledTimes(1));
    act(() => emit({ ...liveState(), revision: 2, runtime: { phase: "downloading", downloadedBytes: 5000000, totalBytes: 10000000, hasInstalled: false } }));
    expect(screen.getByText("Downloading: 50% · 5 MB")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Install player" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => emit({ ...liveState(), revision: 3, runtime: { phase: "installed", downloadedBytes: 10000000, totalBytes: 10000000, hasInstalled: true } }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in on phone" }));
    await waitFor(() => expect(bridge.authenticate).toHaveBeenCalledTimes(1)); service.dispose();
  });
  it("shows the QR code, pairing code and expiry; approval removes the QR", async () => {
    const initial = liveState(); initial.authentication = { phase: "waiting", url: "https://spotify.com/pair?code=ABCDEF", code: "ABCDEF", expiresAt: Date.now() + 300000 }; initial.runtime!.hasInstalled = true; initial.runtime!.phase = "installed";
    const { service, emit } = live(initial);
    expect(await screen.findByRole("img", { name: "QR code for Spotify phone sign-in" })).toBeTruthy();
    expect(screen.getByText("ABCDEF")).toBeTruthy();
    expect(screen.getByText(/Code expires in/)).toBeTruthy();
    act(() => emit({ ...initial, revision: 2, status: "ready", authentication: { phase: "connected" } }));
    expect(screen.queryByRole("img", { name: "QR code for Spotify phone sign-in" })).toBeNull(); service.dispose();
  });
  it("cancels sign-in and requests a fresh code after expiry", async () => {
    const initial = liveState(); initial.authentication = { phase: "waiting", url: "https://spotify.com/pair?code=ABCDEF", code: "ABCDEF", expiresAt: Date.now() + 300000 };
    const { service, bridge, emit } = live(initial);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel sign-in" }));
    await waitFor(() => expect(bridge.cancelAuthentication).toHaveBeenCalledTimes(1));
    act(() => emit({ ...initial, revision: 2, authentication: { phase: "expired" } }));
    expect(screen.queryByRole("img", { name: "QR code for Spotify phone sign-in" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    await waitFor(() => expect(bridge.authenticate).toHaveBeenCalledTimes(1)); service.dispose();
  });
  it("does not generate a QR for a non-Spotify URL", async () => {
    const initial = liveState(); initial.authentication = { phase: "waiting", url: "https://evil.example/pair?code=ABCDEF", code: "ABCDEF", expiresAt: Date.now() + 300000 };
    const { service } = live(initial);
    expect(await screen.findByRole("heading", { name: "Sign-in could not finish" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "QR code for Spotify phone sign-in" })).toBeNull(); service.dispose();
  });
  it("cleans up the visible QR expiry timer and view subscription on unmount", async () => {
    vi.useFakeTimers();
    const initial = liveState(); initial.authentication = { phase: "waiting", url: "https://spotify.com/pair?code=ABCDEF", code: "ABCDEF", expiresAt: Date.now() + 300000 };
    const { service, bridge } = live(initial); await act(async () => {});
    expect(vi.getTimerCount()).toBe(1); cleanup();
    expect(vi.getTimerCount()).toBe(0); expect(bridge.activity).toHaveBeenCalledWith(false, "player"); service.dispose();
  });
  it("explains queue failures and honors controls supplied by the real backend", async () => {
    const initial = liveState(); initial.status = "ready"; initial.authentication = { phase: "connected" }; initial.current = { id: "spotify:track:test", title: "Phone-selected song", artist: "Artist", album: "", durationMs: 200000 }; initial.queueUnavailable = true; initial.availableCommands = ["togglePlayback"];
    const { service } = live(initial);
    expect(await screen.findByRole("heading", { name: "Phone-selected song" })).toBeTruthy();
    expect((screen.getByRole("slider", { name: "Playback position" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Queue" }));
    expect(screen.getByText(/Queue updates are unavailable/)).toBeTruthy(); service.dispose();
  });
  it("shows queue HTTP errors instead of claiming that the queue is empty", async () => {
    const initial = liveState(); initial.status = "ready"; initial.authentication = { phase: "connected" }; initial.queueUnavailable = true; initial.queueStatus = "error"; initial.queueError = { kind: "http", status: 403 };
    const { service } = live(initial);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Queue" }));
    expect(await screen.findByRole("heading", { name: "Could not read the queue" })).toBeTruthy();
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
    expect(screen.queryByText("Your queue is clear")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh queue" })).toBeTruthy(); service.dispose();
  });
  it("shows a Spotify cooldown time and disables refresh while rate-limited", async () => {
    const initial = liveState(); initial.status = "ready"; initial.authentication = { phase: "connected" }; initial.queueUnavailable = true; initial.queueStatus = "error"; initial.queueError = { kind: "http", status: 429 }; initial.queueRetryAt = Date.now() + 86400000;
    const { service } = live(initial);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Queue" }));
    expect(await screen.findByText(/Requests are paused until/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh queue" }) as HTMLButtonElement).disabled).toBe(true); service.dispose();
  });
  it("toggles the music cache and asks for explicit restart before applying", async () => {
    const initial = liveState(); initial.musicCache = { enabled: false, limitBytes: 1073741824, restartRequired: false };
    const { service, bridge, emit } = live(initial);
    bridge.setMusicCache = vi.fn(async () => ({ ok: true })); bridge.applyMusicCache = vi.fn(async () => ({ ok: true }));
    await screen.findByText(/Install the player in Setup/);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Music cache: Off" }));
    await waitFor(() => expect(bridge.setMusicCache).toHaveBeenCalledWith(true));
    expect(bridge.applyMusicCache).not.toHaveBeenCalled();
    act(() => emit({ ...initial, revision: 2, musicCache: { enabled: true, limitBytes: 1073741824, restartRequired: true } }));
    expect(screen.getByText(/Restarting interrupts playback/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply and restart player" }));
    await waitFor(() => expect(bridge.applyMusicCache).toHaveBeenCalledTimes(1)); service.dispose();
  });
  it("uses 100 MB steps below 1 GB and 500 MB steps above it", async () => {
    const initial = liveState(); initial.musicCache = { enabled: true, limitBytes: 1000000000, restartRequired: false };
    const { service, bridge, emit } = live(initial);
    bridge.setMusicCache = vi.fn(async () => ({ ok: true }));
    await screen.findByText(/Install the player in Setup/);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase disk cache limit" }));
    await waitFor(() => expect(bridge.setMusicCache).toHaveBeenCalledWith(true, 1500));
    act(() => emit({ ...initial, revision: 2, musicCache: { enabled: true, limitBytes: 1000000000, restartRequired: false } }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease disk cache limit" }));
    await waitFor(() => expect(bridge.setMusicCache).toHaveBeenCalledWith(true, 900));
    act(() => emit({ ...initial, revision: 3, musicCache: { enabled: true, limitBytes: 2000000000, restartRequired: false } }));
    expect((screen.getByRole("button", { name: "Increase disk cache limit" }) as HTMLButtonElement).disabled).toBe(true);
    service.dispose();
  });
});
