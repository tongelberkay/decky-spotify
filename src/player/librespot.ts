import { PlayerError, PlaylistLoadError } from "./types";
import type { PlaylistFailure } from "./types";
import type { PlayerCommand, PlayerService, PlayerSnapshot, PlaylistSummary, Track } from "./types";

export interface LibrespotState extends PlayerSnapshot { revision: number; positionTimestampMs?: number }
export interface LibrespotBridge {
  read(): Promise<LibrespotState>;
  listen(listener: (state: LibrespotState) => void): () => void;
  command(command: PlayerCommand): Promise<{ ok: boolean }>;
  install(): Promise<{ ok: boolean }>;
  authenticate(): Promise<{ ok: boolean }>;
  cancelAuthentication(): Promise<{ ok: boolean }>;
  refreshQueue?(): Promise<{ ok: boolean }>;
  setMusicCache?(enabled: boolean, sizeMB?: number): Promise<{ ok: boolean }>;
  applyMusicCache?(): Promise<{ ok: boolean }>;
  playlists(): Promise<readonly PlaylistSummary[]>;
  tracks(uri: string, refresh?: boolean): Promise<readonly Track[] | { error: PlaylistFailure }>;
  activity(visible: boolean, view: string): Promise<void>;
}
const blank: PlayerSnapshot = { status: "loading", current: null, context: null, playing: false, positionMs: 0, volume: 50, shuffle: false, repeat: "off", queue: [], libraryVersion: 0, availableCommands: [], authentication: { phase: "idle" } };

export class LibrespotPlayerService implements PlayerService {
  readonly mode = "librespot";
  readonly supportsLibrary = true;
  private snapshot: PlayerSnapshot = { ...blank };
  private state: LibrespotState | null = null;
  private listeners = new Set<() => void>();
  private disposed = false;
  private unsubscribe: () => void;
  constructor(private bridge: LibrespotBridge, private now: () => number = Date.now) {
    this.unsubscribe = bridge.listen(this.receive);
    void bridge.read().then(this.receive).catch(() => { if (!this.disposed && !this.state) this.publish({ ...blank, status: "disconnected" }); });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: PlayerSnapshot) { this.snapshot = value; this.listeners.forEach(listener => listener()); }
  private receive = (state: LibrespotState) => {
    if (this.disposed || (this.state && state.revision <= this.state.revision)) return;
    this.state = structuredClone(state);
    const { revision: _revision, positionTimestampMs: _timestamp, ...snapshot } = this.state;
    snapshot.queue = snapshot.queue.slice(0, 80);
    this.publish(snapshot); this.refresh();
  };
  refresh = () => {
    if (this.disposed || !this.state || this.snapshot.status !== "ready") return;
    const elapsed = this.snapshot.playing ? Math.max(0, this.now() - (this.state.positionTimestampMs ?? this.now())) : 0;
    const position = Math.min(this.snapshot.current?.durationMs || Number.MAX_SAFE_INTEGER, Math.max(0, this.state.positionMs + elapsed));
    if (position !== this.snapshot.positionMs) this.publish({ ...this.snapshot, positionMs: position });
  };
  private async action(request: () => Promise<{ ok: boolean }>) {
    if (this.disposed) throw new PlayerError("disposed");
    try { if (!(await request()).ok) throw new PlayerError("actionFailed"); }
    catch (error) { if (error instanceof PlayerError) throw error; throw new PlayerError("actionFailed"); }
  }
  installRuntime = () => this.action(this.bridge.install);
  beginAuthentication = () => this.action(this.bridge.authenticate);
  cancelAuthentication = () => this.action(this.bridge.cancelAuthentication);
  refreshQueue = () => this.bridge.refreshQueue ? this.action(this.bridge.refreshQueue) : Promise.resolve();
  setMusicCache = (enabled: boolean, sizeMB?: number) => this.bridge.setMusicCache ? this.action(() => sizeMB === undefined ? this.bridge.setMusicCache!(enabled) : this.bridge.setMusicCache!(enabled, sizeMB)) : Promise.reject(new PlayerError("unavailable"));
  applyMusicCache = () => this.bridge.applyMusicCache ? this.action(this.bridge.applyMusicCache) : Promise.reject(new PlayerError("unavailable"));
  setViewActivity = (visible: boolean, view: string) => { if (!this.disposed) void this.bridge.activity(visible, view).catch(() => {}); };
  async getPlaylists() {
    if (this.disposed) throw new PlayerError("disposed");
    try { return await this.bridge.playlists(); } catch { throw new PlayerError("unavailable"); }
  }
  async getPlaylistTracks(uri: string, refresh = false) {
    if (this.disposed) throw new PlayerError("disposed");
    try {
      const result = await this.bridge.tracks(uri, refresh);
      if (!Array.isArray(result)) throw new PlaylistLoadError((result as { error: PlaylistFailure }).error);
      return result as readonly Track[];
    } catch (error) { if (error instanceof PlaylistLoadError) throw error; throw new PlayerError("unavailable"); }
  }
  async command(command: PlayerCommand) {
    if (this.disposed) throw new PlayerError("disposed");
    if (!this.snapshot.availableCommands?.includes(command.type)) throw new PlayerError("unavailable");
    await this.action(() => this.bridge.command(command));
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.unsubscribe(); this.listeners.clear(); void this.bridge.activity(false, "player").catch(() => {}); }
}
