import { describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { pairingCode } from "../src/ui/Pairing";
import { LibrespotPlayerService } from "../src/player/librespot";
import type { LibrespotBridge, LibrespotState } from "../src/player/librespot";

function state(revision = 1): LibrespotState {
  const track = { id: "spotify:track:one", title: "Track", artist: "Artist", album: "", durationMs: 200000 };
  return { revision, status: "ready", current: track, context: null, playing: true, positionMs: 20000, positionTimestampMs: 100000, volume: 40, shuffle: false, repeat: "off", queue: [{ id: "a", track }, { id: "b", track }], libraryVersion: 0, authentication: { phase: "connected" }, availableCommands: ["togglePlayback", "next", "setVolume", "seek", "playPlaylist"] };
}
function setup(initial: Promise<LibrespotState> = Promise.resolve(state())) {
  let listener = (_state: LibrespotState) => {};
  const unsubscribe = vi.fn();
  const command = vi.fn(async () => ({ ok: true }));
  const bridge: LibrespotBridge = { read: () => initial, listen: cb => { listener = cb; return unsubscribe; }, command, install: async () => ({ ok: true }), authenticate: async () => ({ ok: true }), cancelAuthentication: async () => ({ ok: true }), playlists: async () => [], tracks: async () => [], activity: vi.fn(async () => {}) };
  let time = 101000;
  const service = new LibrespotPlayerService(bridge, () => time);
  return { service, emit: (value: LibrespotState) => listener(value), unsubscribe, bridge, advance: (ms: number) => { time += ms; } };
}
describe("librespot service", () => {
  it("preserves safe playlist HTTP failures and forwards explicit refresh", async () => {
    const { service, bridge } = setup();
    bridge.tracks = vi.fn(async () => ({ error: { kind: "http" as const, status: 403 } }));
    await expect(service.getPlaylistTracks("spotify:playlist:mix", true)).rejects.toMatchObject({ failure: { kind: "http", status: 403 } });
    expect(bridge.tracks).toHaveBeenCalledWith("spotify:playlist:mix", true);
    service.dispose();
  });
  it("keeps newer phone events when the initial RPC arrives late and preserves duplicate order", async () => {
    let resolve!: (value: LibrespotState) => void;
    const { service, emit } = setup(new Promise(cb => { resolve = cb; }));
    emit({ ...state(4), volume: 12 }); resolve(state()); await Promise.resolve();
    expect(service.getSnapshot().volume).toBe(12); expect(service.getSnapshot().queue.map(e => e.id)).toEqual(["a", "b"]); service.dispose();
  });
  it("interpolates locally and stops on loss of connection", async () => {
    const { service, emit, advance } = setup(); await Promise.resolve();
    expect(service.getSnapshot().positionMs).toBe(21000); advance(10000); service.refresh(); expect(service.getSnapshot().positionMs).toBe(31000);
    emit({ ...state(2), status: "offline" }); advance(10000); service.refresh(); expect(service.getSnapshot().positionMs).toBe(20000); service.dispose();
  });
  it("bounds rendering, forwards playlist selection, and rejects unavailable controls", async () => {
    const initial = state(); initial.queue = Array.from({ length: 200 }, (_, i) => ({ id: String(i), track: initial.current! }));
    const { service, bridge } = setup(Promise.resolve(initial)); await Promise.resolve();
    expect(service.getSnapshot().queue).toHaveLength(80);
    await service.command({ type: "playPlaylist", playlistId: "spotify:playlist:mix", trackId: "spotify:track:one" });
    expect(bridge.command).toHaveBeenCalledWith({ type: "playPlaylist", playlistId: "spotify:playlist:mix", trackId: "spotify:track:one" });
    await expect(service.command({ type: "cycleRepeat" })).rejects.toMatchObject({ code: "unavailable" }); service.dispose();
  });
  it("reports failures and releases events/activity without accepting late snapshots", async () => {
    const { service, bridge, emit, unsubscribe } = setup(); await Promise.resolve();
    vi.mocked(bridge.command).mockResolvedValueOnce({ ok: false });
    await expect(service.command({ type: "next" })).rejects.toMatchObject({ code: "actionFailed" });
    const before = service.getSnapshot(); service.dispose(); service.dispose(); emit(state(2));
    expect(service.getSnapshot()).toBe(before); expect(unsubscribe).toHaveBeenCalledTimes(1); expect(bridge.activity).toHaveBeenCalledWith(false, "player");
    await expect(service.beginAuthentication()).rejects.toMatchObject({ code: "disposed" });
  });
});
describe("Spotify pairing QR", () => {
  it("decodes the displayed SVG modules into the exact pairing URL", () => {
    const url = "https://spotify.com/pair?code=ABCDEF";
    const qr = pairingCode(url)!; const scale = 8, size = qr.size * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (const match of qr.path.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
      const x = Number(match[1]), y = Number(match[2]);
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const offset = ((y * scale + dy) * size + x * scale + dx) * 4; pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0; }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(url);
  });
  it.each(["http://spotify.com/pair", "https://evil.example/pair", "https://spotify.com/other", "https://user:pass@spotify.com/pair"])("rejects an invalid pairing link %s", url => { expect(pairingCode(url)).toBeNull(); });
});
