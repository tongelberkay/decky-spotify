export type ConnectionStatus = "ready" | "loading" | "disconnected" | "offline";
export type RepeatMode = "off" | "context" | "track";
export interface Track { id: string; title: string; artist: string; album: string; durationMs: number; artwork?: string; metadataPending?: boolean }
export interface PlaylistSummary { id: string; title: string; description: string; artwork?: string; trackCount: number }
export interface Playlist extends PlaylistSummary { tracks: readonly Track[] }
export type QueueSource = { kind: "manual" } | { kind: "playlist"; playlistId: string; playlistName: string };
export interface QueueEntry { id: string; track: Track; source?: QueueSource }
export interface RuntimeInstallation {
  phase: "missing" | "downloading" | "installing" | "installed" | "failed" | "unsupported";
  downloadedBytes: number;
  totalBytes: number | null;
  hasInstalled: boolean;
  error?: "downloadFailed" | "invalidArchive" | "unsupported" | "tlsFailed" | "permissionDenied" | "storageFull" | "downloadTimeout" | "dependencyMissing" | "httpFailed" | null;
  httpStatus?: number | null;
}
export interface PlayerSnapshot {
  musicCache?: { enabled: boolean; limitBytes: number; restartRequired: boolean };
  diagnostics?: readonly { code: "starting" | "spawned" | "spawnFailed" | "readingCode" | "codePending" | "codeReceived" | "invalidCode" | "connected" | "apiTimeout" | "apiUnavailable" | "startupTimeout" | "exited" | "bridgeFailed" | "nativeConfigFailed" | "nativeLockFailed" | "nativeDependencyFailed" | "nativeTlsFailed" | "nativeDnsFailed" | "nativeDeviceCodeFailed" | "nativeClientTokenFailed" | "nativeNetworkFailed" | "nativeDiscoveryFailed" | "nativeAuthenticationFailed" | "nativeAudioFailed" | "nativeError" | "playlistRequestFailed" | "playlistEnumerationTimeout" | "playlistMetadataPending" | "nativePlaylistFailed" | "nativePlaylistTimeout" | "playlistEnumerating" | "playlistListingReady" | "playlistRetrying" | "playlistCacheHit"; elapsedMs: number; value?: number }[];
  runtime?: RuntimeInstallation;
  authentication?: { phase: "idle" | "starting" | "waiting" | "connected" | "expired" | "failed"; url?: string; code?: string; expiresAt?: number; error?: "startupFailed" | "authenticationFailed" };
  queueUnavailable?: boolean;
  queueStatus?: "idle" | "loading" | "ready" | "error";
  queueRetryAt?: number | null;
  queueError?: { kind: "http" | "differentDevice" | "token" | "network" | "inactive"; status?: number } | null;
  /** Real backends can restrict actions, for example during ads or inactive Connect sessions. */
  availableCommands?: readonly PlayerCommand["type"][];
  status: ConnectionStatus;
  current: Track | null;
  context: { id: string; title: string } | null;
  playing: boolean;
  positionMs: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: readonly QueueEntry[];
  libraryVersion: number;
}
export type PlayerCommand =
  | { type: "togglePlayback" | "next" | "previous" | "toggleShuffle" | "cycleRepeat" }
  | { type: "seek"; positionMs: number }
  | { type: "setVolume"; volume: number }
  | { type: "playPlaylist"; playlistId: string; trackId?: string };
export type PlayerErrorCode = "actionFailed" | "unavailable" | "notFound" | "disposed";
export class PlayerError extends Error {
  constructor(public readonly code: PlayerErrorCode) { super(code); this.name = "PlayerError"; }
}
export interface PlaylistFailure { kind: "http" | "unavailable" | "enumerationTimeout" | "network" | "invalidResponse"; status?: number | null }
export class PlaylistLoadError extends PlayerError {
  constructor(public readonly failure: PlaylistFailure) { super("unavailable"); }
}
export interface PlayerService {
  readonly mode?: "mock" | "librespot";
  readonly supportsLibrary?: boolean;
  installRuntime?(): Promise<void>;
  beginAuthentication?(): Promise<void>;
  cancelAuthentication?(): Promise<void>;
  refreshQueue?(): Promise<void>;
  setMusicCache?(enabled: boolean, sizeMB?: number): Promise<void>;
  applyMusicCache?(): Promise<void>;
  setViewActivity?(visible: boolean, view: string): void;
  getSnapshot(): PlayerSnapshot;
  subscribe(listener: () => void): () => void;
  getPlaylists(): Promise<readonly PlaylistSummary[]>;
  getPlaylistTracks(playlistId: string, refresh?: boolean): Promise<readonly Track[]>;
  command(command: PlayerCommand): Promise<void>;
  /** Reconcile timestamps / external state when a view becomes visible; no background UI timer. */
  refresh(): void;
  dispose(): void;
}
