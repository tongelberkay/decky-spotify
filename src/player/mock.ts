import { createFixtures, fixtureTracks } from "./fixtures";
import { PlayerError } from "./types";
import type { PlayerCommand, PlayerService, PlayerSnapshot, Playlist, QueueEntry, QueueSource, Track } from "./types";

export type MockScenario = "ready" | "loading" | "disconnected" | "offline" | "emptyLibrary" | "emptyPlaylist" | "emptyQueue" | "missingArtwork" | "longText" | "unknownSources";
export const mockScenarios: readonly MockScenario[] = ["ready", "loading", "disconnected", "offline", "emptyLibrary", "emptyPlaylist", "emptyQueue", "missingArtwork", "longText", "unknownSources"];

export class MockPlayerService implements PlayerService {
  private listeners = new Set<() => void>();
  private library: Playlist[] = [];
  private sequence = 0;
  private state!: PlayerSnapshot;
  private currentEntry: QueueEntry | null = null;
  private history: QueueEntry[] = [];
  private anchor = 0;
  private disposed = false;
  private failNext = false;
  private session = 0;
  private pending = new Map<ReturnType<typeof setTimeout>, () => void>();
  private readonly now: () => number;
  private readonly latency: number;

  constructor(options: { now?: () => number; latency?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.latency = options.latency ?? 120;
    this.reset();
  }
  getSnapshot = (): PlayerSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(patch: Partial<PlayerSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private entry(track: Track, source?: QueueSource): QueueEntry {
    return { id: `entry-${++this.sequence}`, track: { ...track }, source };
  }
  private playlistEntries(playlist: Playlist): QueueEntry[] {
    return playlist.tracks.map(track => this.entry(track, { kind: "playlist", playlistId: playlist.id, playlistName: playlist.title }));
  }
  private shuffleEntries(entries: readonly QueueEntry[]): QueueEntry[] {
    // A deterministic rotation keeps mock scenarios reproducible. Manual queue order is untouched.
    const contextual = entries.filter(e => e.source?.kind === "playlist");
    const rotated = contextual.length > 1 ? [...contextual.slice(1), contextual[0]] : contextual;
    let index = 0;
    return entries.map(e => e.source?.kind === "playlist" ? rotated[index++] : e);
  }
  private assertReady() {
    if (this.disposed) throw new PlayerError("disposed");
    if (this.state.status !== "ready") throw new PlayerError("unavailable");
  }
  private wait(): Promise<void> {
    if (!this.latency) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(timer); resolve(); }, this.latency);
      this.pending.set(timer, () => reject(new PlayerError("disposed")));
    });
  }
  getPlaylists = async () => {
    if (this.disposed) throw new PlayerError("disposed");
    return this.library.map(({ tracks: _tracks, ...summary }) => ({ ...summary }));
  };
  getPlaylistTracks = async (playlistId: string) => {
    if (this.disposed) throw new PlayerError("disposed");
    const playlist = this.library.find(p => p.id === playlistId);
    if (!playlist) throw new PlayerError("notFound");
    return playlist.tracks.map(track => ({ ...track }));
  };

  reset = () => {
    if (this.disposed) return;
    this.session++;
    this.library = createFixtures();
    this.history = [];
    this.failNext = false;
    this.anchor = this.now();
    const entries = this.playlistEntries(this.library[0]);
    this.currentEntry = entries[0];
    this.publish({ status: "ready", current: entries[0].track, context: { id: this.library[0].id, title: this.library[0].title }, playing: true, positionMs: 82000, volume: 45, shuffle: false, repeat: "off", queue: [this.entry(fixtureTracks[3], { kind: "manual" }), ...entries.slice(1)], libraryVersion: (this.state?.libraryVersion ?? 0) + 1 });
  };

  setScenario = (scenario: MockScenario) => {
    this.reset();
    if (["loading", "disconnected", "offline"].includes(scenario)) {
      this.publish({ status: scenario as "loading" | "disconnected" | "offline" });
    } else if (scenario === "emptyLibrary") {
      this.library = [];
      this.currentEntry = null;
      this.publish({ current: null, context: null, playing: false, positionMs: 0, queue: [], libraryVersion: this.state.libraryVersion + 1 });
    } else if (scenario === "emptyPlaylist") {
      this.library[1] = { ...this.library[1], tracks: [], trackCount: 0 };
      this.publish({ libraryVersion: this.state.libraryVersion + 1 });
    } else if (scenario === "emptyQueue") {
      this.publish({ queue: [] });
    } else if (scenario === "missingArtwork" || scenario === "longText") {
      const change = (track: Track): Track => scenario === "missingArtwork" ? { ...track, artwork: undefined } : { ...track, title: "A Very Long Journey Through the Quiet Streets of a City That Never Sleeps", artist: "The Orchestra of Distant Signals and New Horizons" };
      this.library = this.library.map(p => ({ ...p, artwork: scenario === "missingArtwork" ? undefined : p.artwork, title: scenario === "longText" ? `${p.title}: Music for the Longest Adventure Across the Stars` : p.title, tracks: p.tracks.map(change) }));
      this.currentEntry = this.currentEntry && { ...this.currentEntry, track: change(this.currentEntry.track) };
      this.publish({ current: this.currentEntry?.track ?? null, context: this.state.context && { ...this.state.context, title: this.library[0].title }, queue: this.state.queue.map(e => ({ ...e, track: change(e.track), source: e.source?.kind === "playlist" ? { ...e.source, playlistName: this.library[0].title } : e.source })), libraryVersion: this.state.libraryVersion + 1 });
    } else if (scenario === "unknownSources") {
      this.publish({ queue: this.state.queue.map(e => ({ ...e, source: undefined })) });
    }
  };
  armFailure = () => { this.failNext = true; };

  command = async (command: PlayerCommand): Promise<void> => {
    this.assertReady();
    const session = this.session;
    await this.wait();
    this.assertReady();
    if (session !== this.session) throw new PlayerError("actionFailed");
    if (this.failNext) { this.failNext = false; throw new PlayerError("actionFailed"); }
    this.refresh();
    switch (command.type) {
      case "togglePlayback":
        if (!this.state.current) throw new PlayerError("unavailable");
        this.anchor = this.now();
        this.publish({ playing: !this.state.playing, positionMs: this.state.positionMs >= this.state.current.durationMs ? 0 : this.state.positionMs });
        break;
      case "next": this.advance(false); this.anchor = this.now(); break;
      case "previous": {
        this.anchor = this.now();
        if (this.state.positionMs > 3000 || !this.history.length) { this.publish({ positionMs: 0 }); break; }
        const previous = this.history.pop()!;
        const queue = this.currentEntry ? [this.currentEntry, ...this.state.queue] : [...this.state.queue];
        this.currentEntry = previous;
        this.publish({ current: previous.track, positionMs: 0, queue });
        break;
      }
      case "seek":
        if (!this.state.current || !Number.isFinite(command.positionMs)) throw new PlayerError("unavailable");
        this.anchor = this.now();
        this.publish({ positionMs: Math.min(this.state.current.durationMs, Math.max(0, command.positionMs)) });
        break;
      case "setVolume":
        if (!Number.isFinite(command.volume)) throw new PlayerError("unavailable");
        this.publish({ volume: Math.round(Math.min(100, Math.max(0, command.volume))) });
        break;
      case "toggleShuffle": {
        const shuffle = !this.state.shuffle;
        let queue = [...this.state.queue];
        if (shuffle) queue = this.shuffleEntries(queue);
        else {
          const playlist = this.library.find(p => p.id === this.state.context?.id);
          const ordered = queue.filter(e => e.source?.kind === "playlist").sort((a, b) => (playlist?.tracks.findIndex(t => t.id === a.track.id) ?? 0) - (playlist?.tracks.findIndex(t => t.id === b.track.id) ?? 0));
          let index = 0;
          queue = queue.map(e => e.source?.kind === "playlist" ? ordered[index++] : e);
        }
        this.publish({ shuffle, queue });
        break;
      }
      case "cycleRepeat": this.publish({ repeat: this.state.repeat === "off" ? "context" : this.state.repeat === "context" ? "track" : "off" }); break;
      case "playPlaylist": {
        const playlist = this.library.find(p => p.id === command.playlistId);
        const index = command.trackId ? playlist?.tracks.findIndex(t => t.id === command.trackId) : 0;
        if (!playlist || index === undefined || index < 0 || !playlist.tracks[index]) throw new PlayerError("notFound");
        const entries = this.playlistEntries(playlist);
        this.currentEntry = entries[index];
        this.history = [];
        this.anchor = this.now();
        const remaining = entries.slice(index + 1);
        this.publish({ current: entries[index].track, context: { id: playlist.id, title: playlist.title }, playing: true, positionMs: 0, queue: this.state.shuffle ? this.shuffleEntries(remaining) : remaining });
        break;
      }
    }
  };

  private advance(automatic: boolean): boolean {
    if (automatic && this.state.repeat === "track" && this.state.current) {
      this.publish({ positionMs: 0 });
      return true;
    }
    let queue = [...this.state.queue];
    if (!queue.length && this.state.repeat === "context") {
      const playlist = this.library.find(p => p.id === this.state.context?.id);
      if (playlist) queue = this.playlistEntries(playlist);
      if (this.state.shuffle) queue = this.shuffleEntries(queue);
    }
    const next = queue.shift();
    if (!next) { this.publish({ playing: false, positionMs: this.state.current?.durationMs ?? 0, queue: [] }); return false; }
    if (this.currentEntry) this.history.push(this.currentEntry);
    this.history = this.history.slice(-50);
    this.currentEntry = next;
    this.publish({ current: next.track, positionMs: 0, queue });
    return true;
  }
  refresh = () => {
    if (this.disposed || this.state.status !== "ready" || !this.state.playing || !this.state.current) return;
    const now = this.now();
    let position = this.state.positionMs + Math.max(0, now - this.anchor);
    this.anchor = now;
    // Repeat-playlist sessions can be suspended for hours. Avoid an unbounded catch-up loop.
    const context = this.library.find(p => p.id === this.state.context?.id);
    if (this.state.repeat === "context" && context && !this.state.queue.some(e => e.source?.kind !== "playlist")) {
      const cycleMs = context.tracks.reduce((sum, t) => sum + t.durationMs, 0);
      if (cycleMs > 0 && position > cycleMs * 2) position = (position % cycleMs) + cycleMs;
    }
    if (this.state.repeat === "track") position %= this.state.current.durationMs;
    else {
      while (this.state.current && position >= this.state.current.durationMs) {
        position -= this.state.current.durationMs;
        if (!this.advance(true)) return;
      }
    }
    this.publish({ positionMs: position });
  };
  simulatePhoneAdd = (duplicates = 1) => {
    if (this.state.status !== "ready" || this.disposed) return;
    this.refresh();
    const queue = [...this.state.queue];
    const firstContext = queue.findIndex(e => e.source?.kind === "playlist");
    queue.splice(firstContext < 0 ? queue.length : firstContext, 0, ...Array.from({ length: duplicates }, () => this.entry(fixtureTracks[5], { kind: "manual" })));
    this.publish({ queue });
  };
  simulatePhoneReorder = () => {
    if (this.state.status !== "ready" || this.disposed) return;
    const queue = [...this.state.queue];
    const indexes = queue.map((e, i) => e.source?.kind === "manual" ? i : -1).filter(i => i >= 0);
    if (indexes.length > 1) [queue[indexes[0]], queue[indexes.at(-1)!]] = [queue[indexes.at(-1)!], queue[indexes[0]]];
    this.publish({ queue });
  };
  simulatePhoneNext = () => { if (this.state.status === "ready" && !this.disposed) { this.refresh(); this.advance(false); this.anchor = this.now(); } };
  simulatePhoneToggle = () => { if (this.state.status === "ready" && this.state.current && !this.disposed) { this.refresh(); this.anchor = this.now(); this.publish({ playing: !this.state.playing }); } };
  dispose = () => {
    this.disposed = true;
    this.listeners.clear();
    for (const [timer, reject] of this.pending) { clearTimeout(timer); reject(); }
    this.pending.clear();
  };
}
