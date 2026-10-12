import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockPlayerService } from "../src/player/mock";
import { groupQueue } from "../src/player/queue";

describe("mock playback session", () => {
  let time: number;
  let service: MockPlayerService;
  beforeEach(() => { time = 1000000; service = new MockPlayerService({ now: () => time, latency: 0 }); });
  afterEach(() => service.dispose());
  it("pauses without accumulating time, then resumes", async () => {
    time += 2000;
    await service.command({ type: "togglePlayback" });
    expect(service.getSnapshot().positionMs).toBe(84000);
    time += 10000; service.refresh();
    expect(service.getSnapshot().positionMs).toBe(84000);
    await service.command({ type: "togglePlayback" });
    time += 1000; service.refresh();
    expect(service.getSnapshot().positionMs).toBe(85000);
  });
  it("consumes manual queue entries before playlist continuation", async () => {
    expect(service.getSnapshot().queue[0].source?.kind).toBe("manual");
    await service.command({ type: "next" });
    expect(service.getSnapshot().current?.id).toBe("sunroom");
    await service.command({ type: "next" });
    expect(service.getSnapshot().current?.id).toBe("distant-lights");
    expect(service.getSnapshot().context?.id).toBe("after-hours");
  });
  it("preserves duplicate phone additions and their unique queue identities", () => {
    service.simulatePhoneAdd(2);
    const manual = service.getSnapshot().queue.filter(e => e.source?.kind === "manual");
    expect(manual.map(e => e.track.id)).toEqual(["sunroom", "soft-focus", "soft-focus"]);
    expect(new Set(manual.map(e => e.id)).size).toBe(3);
    expect(service.getSnapshot().queue[3].source?.kind).toBe("playlist");
  });
  it("reflects phone reordering and track changes through subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.simulatePhoneAdd(); service.simulatePhoneReorder();
    expect(service.getSnapshot().queue[0].track.id).toBe("soft-focus");
    service.simulatePhoneNext();
    expect(service.getSnapshot().current?.id).toBe("soft-focus");
    expect(listener).toHaveBeenCalled();
    unsubscribe(); listener.mockClear(); service.simulatePhoneAdd();
    expect(listener).not.toHaveBeenCalled();
  });
  it("reconciles elapsed time after a hidden panel without a background timer", () => {
    time += (224000 - 82000) + 186000 + 15000;
    service.refresh();
    expect(service.getSnapshot().current?.id).toBe("distant-lights");
    expect(service.getSnapshot().positionMs).toBe(15000);
  });
  it("stops cleanly at the end of the queue", () => {
    service.setScenario("emptyQueue"); time += 300000; service.refresh();
    expect(service.getSnapshot().playing).toBe(false);
    expect(service.getSnapshot().positionMs).toBe(service.getSnapshot().current?.durationMs);
  });
  it("repeats the track automatically but lets Next consume the queue", async () => {
    await service.command({ type: "cycleRepeat" }); await service.command({ type: "cycleRepeat" });
    time += 500000; service.refresh();
    expect(service.getSnapshot().current?.id).toBe("night-drive");
    expect(service.getSnapshot().positionMs).toBe((82000 + 500000) % 224000);
    await service.command({ type: "next" });
    expect(service.getSnapshot().current?.id).toBe("sunroom");
  });
  it("restarts the playlist when context repeat reaches the end", async () => {
    await service.command({ type: "playPlaylist", playlistId: "golden-days", trackId: "night-drive" });
    await service.command({ type: "cycleRepeat" });
    time += 224000 + 4000; service.refresh();
    expect(service.getSnapshot().current?.id).toBe("sunroom");
    expect(service.getSnapshot().positionMs).toBe(4000);
  });
  it("starts a selected playlist track and creates its continuation", async () => {
    await service.command({ type: "playPlaylist", playlistId: "open-skies", trackId: "new-world" });
    expect(service.getSnapshot().current?.id).toBe("new-world");
    expect(service.getSnapshot().queue.map(e => e.track.id)).toEqual(["distant-lights", "soft-focus"]);
    expect(service.getSnapshot().playing).toBe(true);
    expect(service.getSnapshot().positionMs).toBe(0);
  });
  it("restarts the current song on Previous, then returns through history", async () => {
    await service.command({ type: "next" });
    time += 5000; service.refresh();
    await service.command({ type: "previous" });
    expect(service.getSnapshot().current?.id).toBe("sunroom");
    expect(service.getSnapshot().positionMs).toBe(0);
    await service.command({ type: "previous" });
    expect(service.getSnapshot().current?.id).toBe("night-drive");
    expect(service.getSnapshot().queue[0].track.id).toBe("sunroom");
  });
  it("shuffles only playlist entries and restores their original order", async () => {
    service.simulatePhoneAdd(2);
    const before = service.getSnapshot().queue.map(e => e.id);
    await service.command({ type: "toggleShuffle" });
    expect(service.getSnapshot().queue.slice(0, 3).map(e => e.id)).toEqual(before.slice(0, 3));
    expect(service.getSnapshot().queue.map(e => e.id)).not.toEqual(before);
    await service.command({ type: "toggleShuffle" });
    expect(service.getSnapshot().queue.map(e => e.id)).toEqual(before);
  });
  it("clamps seek/volume and rejects invalid input", async () => {
    await service.command({ type: "seek", positionMs: -1 });
    expect(service.getSnapshot().positionMs).toBe(0);
    await service.command({ type: "setVolume", volume: 120 });
    expect(service.getSnapshot().volume).toBe(100);
    await expect(service.command({ type: "setVolume", volume: NaN })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("retains offline snapshots and blocks unavailable actions", async () => {
    service.setScenario("offline"); const snapshot = service.getSnapshot();
    time += 10000; service.refresh();
    expect(service.getSnapshot()).toBe(snapshot);
    await expect(service.command({ type: "next" })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("fails an action without changing playback and allows retry", async () => {
    service.armFailure(); const before = service.getSnapshot();
    await expect(service.command({ type: "next" })).rejects.toMatchObject({ code: "actionFailed" });
    expect(service.getSnapshot()).toBe(before);
    await service.command({ type: "next" });
    expect(service.getSnapshot().current?.id).toBe("sunroom");
  });
  it("handles missing playlists, empty playlists and empty libraries", async () => {
    await expect(service.command({ type: "playPlaylist", playlistId: "missing" })).rejects.toMatchObject({ code: "notFound" });
    service.setScenario("emptyPlaylist");
    expect(await service.getPlaylistTracks("golden-days")).toEqual([]);
    await expect(service.command({ type: "playPlaylist", playlistId: "golden-days" })).rejects.toMatchObject({ code: "notFound" });
    service.setScenario("emptyLibrary");
    expect(await service.getPlaylists()).toEqual([]);
    expect(service.getSnapshot().current).toBeNull();
  });
  it("cancels pending work on disposal without leaving callbacks", async () => {
    service.dispose();
    const delayed = new MockPlayerService({ latency: 1000 });
    const promise = delayed.command({ type: "next" });
    delayed.dispose();
    await expect(promise).rejects.toMatchObject({ code: "disposed" });
    await expect(delayed.getPlaylists()).rejects.toMatchObject({ code: "disposed" });
  });
  it("does not apply pending commands to a reset session", async () => {
    service.dispose();
    const delayed = new MockPlayerService({ latency: 1 });
    const promise = delayed.command({ type: "next" });
    delayed.reset();
    await expect(promise).rejects.toMatchObject({ code: "actionFailed" });
    expect(delayed.getSnapshot().current?.id).toBe("night-drive");
    delayed.dispose();
  });
});

describe("queue presentation", () => {
  it("groups known sources without changing entry order", () => {
    const service = new MockPlayerService();
    const queue = service.getSnapshot().queue;
    const groups = groupQueue(queue);
    expect(groups.map(g => g.source?.kind)).toEqual(["manual", "playlist"]);
    expect(groups.flatMap(g => g.entries)).toEqual(queue);
    service.dispose();
  });
  it("never guesses manual grouping when any source is unknown", () => {
    const service = new MockPlayerService();
    const queue = service.getSnapshot().queue.map((entry, i) => i === 1 ? { ...entry, source: undefined } : entry);
    expect(groupQueue(queue)).toEqual([{ id: "up-next", entries: queue }]);
    expect(groupQueue([])).toEqual([]);
    service.dispose();
  });
});
