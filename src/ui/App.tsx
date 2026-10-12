import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import { formatDuration, formatNumber, formatRetryTime, resolveLocale } from "../i18n";
import { groupQueue } from "../player/queue";
import { PlayerError, PlaylistLoadError } from "../player/types";
import type { PlaylistFailure } from "../player/types";
import type { PlayerCommand, PlayerErrorCode, PlayerService, PlaylistSummary, Track } from "../player/types";
import { Icon } from "./icons";
import { Pairing } from "./Pairing";
import { SlidingName } from "./SlidingName";
import type { SettingsNavigation } from "./settingsNavigation";
import type { IconName } from "./icons";
import { usePanelVisible, usePlaybackProgress, usePlayer } from "./hooks";
import { AdapterContext, useAdapter } from "./primitives";
import type { UIAdapter } from "./primitives";
import { playerStyles } from "./styles";

type View = "player" | "playlists" | "tracks" | "queue" | "setup";
const PAGE_SIZE = 20;

export function PlayerApp({ service, adapter, i18n, expanded = false, settingsNavigation }: { service: PlayerService; adapter: UIAdapter; i18n: i18n; expanded?: boolean; settingsNavigation?: SettingsNavigation }) {
  return <I18nextProvider i18n={i18n}><AdapterContext.Provider value={adapter}><PlayerContent service={service} expanded={expanded} settingsNavigation={settingsNavigation} /></AdapterContext.Provider></I18nextProvider>;
}

function Artwork({ source, name, size = "small", playlist = false }: { source?: string; name: string; size?: "small" | "medium" | "hero"; playlist?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return <div className={`ds-art ds-art-${size}`}>
    {source && !failed ? <img src={source} alt={t(playlist ? "artwork.playlist" : "artwork.track", { name })} onError={() => setFailed(true)} /> : <span role="img" aria-label={t("artwork.missing")}><Icon name="music" size={size === "hero" ? 46 : size === "small" ? 16 : 22} /></span>}
  </div>;
}
function EmptyState({ title, description, icon = "music", children }: { title: string; description: string; icon?: IconName; children?: ReactNode }) {
  return <div className="ds-empty"><div className="ds-empty-icon"><Icon name={icon} size={26} /></div><h2>{title}</h2><p>{description}</p>{children}</div>;
}
function TrackCopy({ track, inline = false }: { track: Track; inline?: boolean }) {
  const { t } = useTranslation();
  if (track.metadataPending) return <div className="ds-row-copy ds-track-inline"><span className="ds-track-artist">{t("library.metadataPending")}</span></div>;
  if (inline) return <div className="ds-row-copy ds-track-inline"><span className="ds-track-title" title={track.title}><bdi>{track.title}</bdi></span><span className="ds-track-separator" aria-hidden="true">•</span><span className="ds-track-artist" title={track.artist}><bdi>{track.artist}</bdi></span></div>;
  return <div className="ds-row-copy"><p className="ds-row-title"><bdi>{track.title}</bdi></p><p className="ds-row-subtitle"><bdi>{track.artist}</bdi></p></div>;
}
function Pagination({ page, count, setPage }: { page: number; count: number; setPage: (page: number) => void }) {
  const { t } = useTranslation();
  const { Action } = useAdapter();
  const total = Math.ceil(count / PAGE_SIZE);
  if (total <= 1) return null;
  return <div className="ds-page-controls">
    <Action label={t("navigation.previousPage")} focusKey="previous-page" disabled={!page} onClick={() => setPage(page - 1)}><Icon name="back" size={14} /></Action>
    <span>{t("navigation.page", { current: formatNumber(page + 1), total: formatNumber(total) })}</span>
    <Action label={t("navigation.nextPage")} focusKey="next-page" disabled={page >= total - 1} onClick={() => setPage(page + 1)}><span style={{ display: "flex", transform: "rotate(180deg)" }}><Icon name="back" size={14} /></span></Action>
  </div>;
}

function PlayerContent({ service, expanded, settingsNavigation }: { service: PlayerService; expanded: boolean; settingsNavigation?: SettingsNavigation }) {
  const { t, i18n } = useTranslation();
  const { theme, Action, Range, Container, Group, ReadOnlyRow, openExternal } = useAdapter();
  const snapshot = usePlayer(service);
  const [view, setView] = useState<View>("player");
  const [selected, setSelected] = useState<PlaylistSummary | null>(null);
  const [playlists, setPlaylists] = useState<readonly PlaylistSummary[]>([]);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryFailure, setLibraryFailure] = useState<PlaylistFailure | null>(null);
  const forceLibraryRefresh = useRef(false);
  const loadedPlaylistId = useRef<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<PlayerErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [draftSeek, setDraftSeek] = useState<number | null>(null);
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const [playlistPage, setPlaylistPage] = useState(0);
  const [trackPage, setTrackPage] = useState(0);
  const [queuePage, setQueuePage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const memories = useRef(new Map<string, { scrollTop: number; focusKey?: string }>());
  const mounted = useRef(true);
  const processing = useRef(false);
  const queued = useRef(new Map<string, PlayerCommand>());
  const visible = usePanelVisible(root);
  const ready = snapshot.status === "ready";
  const live = service.mode === "librespot";
  const allowed = (type: PlayerCommand["type"]) => !snapshot.availableCommands || snapshot.availableCommands.includes(type);
  useEffect(() => {
    if (live && snapshot.authentication && ["starting", "waiting", "expired", "failed"].includes(snapshot.authentication.phase)) setView("setup");
  }, [live, snapshot.authentication?.phase]);
  const routeKey = view === "tracks" ? `tracks-${selected?.id}` : view;
  useEffect(() => {
    service.setViewActivity?.(visible, view);
    return () => service.setViewActivity?.(false, view);
  }, [service, visible, view, snapshot.authentication?.phase]);
  usePlaybackProgress(service, visible, view === "player" || view === "queue", snapshot.playing, ready);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; queued.current.clear(); }; }, []);
  useEffect(() => {
    let cancelled = false;
    if ((view !== "playlists" && view !== "tracks") || service.supportsLibrary === false) return;
    setLibraryLoading(true);
    setLibraryError(false);
    setLibraryFailure(null);
    const force = forceLibraryRefresh.current;
    forceLibraryRefresh.current = false;
    const request = view === "tracks" && selected ? service.getPlaylistTracks(selected.id, force) : service.getPlaylists();
    void request.then(result => {
      if (cancelled) return;
      if (view === "tracks") {
        loadedPlaylistId.current = selected?.id ?? null;
        setTracks(result as readonly Track[]);
        setTrackPage(page => Math.min(page, Math.max(0, Math.ceil(result.length / PAGE_SIZE) - 1)));
      }
      else setPlaylists(result as readonly PlaylistSummary[]);
    }).catch(error => { if (!cancelled) { setLibraryError(true); setLibraryFailure(error instanceof PlaylistLoadError ? error.failure : null); } }).finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [service, view, selected?.id, snapshot.libraryVersion, reload]);

  // Save DOM scroll/focus at the time of navigation. The adapters supply native or HTML focus targets.
  const scrollElement = useCallback(() => {
    if (theme === "decky") {
      for (let parent = scroll.current?.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
      }
    }
    return scroll.current;
  }, [theme]);
  const remember = useCallback(() => {
    const focused = root.current?.querySelector<HTMLElement>(":focus");
    memories.current.set(routeKey, { scrollTop: scrollElement()?.scrollTop ?? 0, focusKey: focused?.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey });
  }, [routeKey, scrollElement]);
  const navigate = useCallback((next: View) => { remember(); setView(next); setError(null); }, [remember]);
  useEffect(() => settingsNavigation?.subscribe(() => navigate("setup")), [settingsNavigation, navigate]);
  const back = useCallback(() => {
    if (view === "player") return false;
    navigate(view === "tracks" ? "playlists" : "player");
    return true;
  }, [navigate, view]);
  useEffect(() => {
    const memory = memories.current.get(routeKey);
    const element = scrollElement();
    if (element) element.scrollTop = memory?.scrollTop ?? 0;
    const targets = root.current?.querySelectorAll<HTMLElement>("[data-focus-key]");
    const target = Array.from(targets ?? []).find(el => el.dataset.focusKey === memory?.focusKey);
    target?.focus({ preventScroll: true });
  }, [routeKey, libraryLoading, scrollElement]);
  useEffect(() => { setQueuePage(page => Math.min(page, Math.max(0, Math.ceil(snapshot.queue.length / PAGE_SIZE) - 1))); }, [snapshot.queue.length]);
  useEffect(() => { setPlaylistPage(page => Math.min(page, Math.max(0, Math.ceil(playlists.length / PAGE_SIZE) - 1))); }, [playlists.length]);
  useEffect(() => { setTrackPage(page => Math.min(page, Math.max(0, Math.ceil(tracks.length / PAGE_SIZE) - 1))); }, [tracks.length]);

  async function run(command: PlayerCommand): Promise<boolean> {
    if (processing.current) {
      if (command.type === "seek" || command.type === "setVolume") queued.current.set(command.type, command);
      return false;
    }
    processing.current = true;
    setBusy(true); setError(null);
    let next: PlayerCommand | null = command;
    try {
      while (next && mounted.current) {
        await service.command(next);
        next = queued.current.values().next().value ?? null;
        if (next) queued.current.delete(next.type);
      }
      return mounted.current;
    } catch (failure) {
      queued.current.clear();
      if (mounted.current) setError(failure instanceof PlayerError ? failure.code : "actionFailed");
      return false;
    } finally {
      processing.current = false;
      if (mounted.current) { setBusy(false); setDraftSeek(null); setDraftVolume(null); }
    }
  }
  async function startPlaylist(trackId?: string) {
    if (!selected) return;
    const succeeded = await run({ type: "playPlaylist", playlistId: selected.id, trackId });
    if (succeeded && mounted.current) navigate("player");
  }
  const progress = draftSeek ?? snapshot.positionMs;
  const volume = draftVolume ?? snapshot.volume;
  const duration = snapshot.current?.durationMs ?? 0;
  const repeatLabel = t(snapshot.repeat === "off" ? "player.repeatOff" : snapshot.repeat === "track" ? "player.repeatTrack" : "player.repeatContext");
  const button = (name: IconName, label: string, command: PlayerCommand, options: { className?: string; pressed?: boolean; disabled?: boolean } = {}) => <Action label={label} focusKey={name} onClick={() => { void run(command); }} disabled={!ready || busy || !allowed(command.type) || options.disabled} className={`ds-transport ${options.className ?? ""}`} pressed={options.pressed}><Icon name={name} size={name === "play" || name === "pause" ? 19 : 16} />{name === "repeat" && snapshot.repeat === "track" && <span className="ds-repeat-one">{formatNumber(1)}</span>}</Action>;
  const backAction = <div className="ds-back-area"><Action label={t("app.back")} focusKey="back" className="ds-back" onClick={back}><Icon name="back" size={14} />{t("app.back")}</Action></div>;
  const errorNotice = error && <div className="ds-error" role="alert"><Icon name="alert" size={17} /><p>{t(`errors.${error}`)}</p><Action label={t("app.close")} focusKey="dismiss-error" onClick={() => setError(null)}><Icon name="close" size={15} /></Action></div>;

  async function installPlayer() {
    setError(null);
    try { await service.installRuntime?.(); }
    catch { if (mounted.current) setError("actionFailed"); }
  }
  async function authenticate(cancel = false) {
    setError(null);
    try { if (cancel) await service.cancelAuthentication?.(); else await service.beginAuthentication?.(); }
    catch { if (mounted.current) setError("actionFailed"); }
  }
  function renderSetup() {
    const runtime = snapshot.runtime;
    const phase = runtime?.phase;
    const installing = phase === "downloading" || phase === "installing";
    const authentication = snapshot.authentication;
    const pairing = authentication && ["starting", "waiting", "expired", "failed"].includes(authentication.phase);
    const cacheLocked = cacheBusy || authentication?.phase === "starting" || authentication?.phase === "waiting";
    const cacheSizes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    const cacheSize = Math.round((snapshot.musicCache?.limitBytes ?? 1000000000) / 1000000);
    const cacheIndex = Math.max(0, cacheSizes.findIndex(size => size >= cacheSize));
    const changeCacheSize = (size: number) => {
      setCacheBusy(true);
      void service.setMusicCache?.(snapshot.musicCache!.enabled, size).catch(() => setError("actionFailed")).finally(() => { if (mounted.current) setCacheBusy(false); });
    };
    const title = phase === "installed" ? t("installer.installed") : t("installer.title");
    const percent = runtime?.totalBytes ? Math.min(100, Math.round(runtime.downloadedBytes / runtime.totalBytes * 100)) : undefined;
    const downloaded = formatNumber((runtime?.downloadedBytes ?? 0) / 1000000, i18n.language, { maximumFractionDigits: 1 });
    const description = phase === "unsupported" ? t("installer.unsupported") : phase === "installed" ? t("installer.readyDescription") : t("installer.description");
    const installationErrors = {
      tlsFailed: "installer.tlsFailed", permissionDenied: "installer.permissionDenied",
      storageFull: "installer.storageFull", downloadTimeout: "installer.downloadTimeout",
      dependencyMissing: "installer.dependencyMissing", downloadFailed: "installer.downloadFailed",
      unsupported: "installer.unsupported", invalidArchive: runtime?.hasInstalled ? "installer.invalidArchiveExisting" : "installer.invalidArchive",
    } as const;
    const failureMessage = runtime?.error === "httpFailed"
      ? t("installer.httpFailed", { status: formatNumber(runtime.httpStatus ?? 0) })
      : t(installationErrors[runtime?.error ?? "downloadFailed"]);
    return <>{backAction}<div className="ds-view-header"><h1 className="ds-title">{title}</h1><p className="ds-subtitle">{description}</p></div>
      {installing && <div className="ds-install-status" role="status">
        <p>{phase === "installing" ? t("installer.installing") : percent === undefined ? t("installer.downloaded", { size: downloaded }) : t("installer.progress", { percent: formatNumber(percent), size: downloaded })}</p>
        <progress max={100} value={phase === "installing" ? undefined : percent} aria-label={t("installer.progressLabel")} />
      </div>}
      {phase === "failed" && <p className="ds-error" role="alert">{failureMessage}</p>}
      <div className="ds-setup-actions">
      {phase !== "unsupported" && !pairing && <Action label={t(phase === "failed" ? "installer.retry" : runtime?.hasInstalled ? "installer.update" : "installer.install")} focusKey="install-player" className="ds-link" disabled={!runtime || installing} onClick={() => { void installPlayer(); }}>{t(phase === "failed" ? "installer.retry" : runtime?.hasInstalled ? "installer.update" : "installer.install")}</Action>}
      {runtime?.hasInstalled && !installing && authentication?.phase !== "connected" && !pairing && <Action label={t("auth.signIn")} focusKey="sign-in-phone" className="ds-link ds-auth-start" onClick={() => { void authenticate(); }}>{t("auth.signIn")}</Action>}
      </div>
      {authentication?.phase === "connected" && <p className="ds-queue-note" role="status">{t("auth.connected")}</p>}
      {pairing && <Pairing authentication={authentication} visible={visible} cancel={() => { void authenticate(true); }} retry={() => { void authenticate(); }} />}
      {!pairing && <p className="ds-queue-note">{t("installer.sourceDescription")}</p>}
      {!pairing && <Action label={t("installer.source")} focusKey="player-source" className="ds-link" onClick={() => openExternal("https://github.com/devgianlu/go-librespot/releases/tag/v0.10.3")}>{t("installer.source")}</Action>}
      {runtime?.hasInstalled && !pairing && <p className="ds-queue-note">{t("installer.restart")}</p>}
      {snapshot.musicCache && <section className="ds-diagnostics" aria-label={t("cache.title")}><h2 className="ds-title">{t("cache.title")}</h2><p className="ds-subtitle">{t("cache.description")}</p>
        <Action label={t(snapshot.musicCache.enabled ? "cache.on" : "cache.off")} focusKey="music-cache-toggle" className="ds-link" pressed={snapshot.musicCache.enabled} disabled={cacheLocked || !service.setMusicCache} onClick={() => { setCacheBusy(true); void service.setMusicCache?.(!snapshot.musicCache!.enabled).catch(() => setError("actionFailed")).finally(() => { if (mounted.current) setCacheBusy(false); }); }}>{t(snapshot.musicCache.enabled ? "cache.on" : "cache.off")}</Action>
        <p className="ds-subtitle">{t("cache.sizeLabel")}</p>
        <Group className="ds-cache-size" flow="row"><Action label={t("cache.decrease")} focusKey="cache-smaller" disabled={cacheLocked || !service.setMusicCache || cacheIndex === 0} onClick={() => changeCacheSize(cacheSizes[cacheIndex - 1])}>−</Action><span aria-live="polite">{t("cache.sizeMB", { value: formatNumber(cacheSize) })}</span><Action label={t("cache.increase")} focusKey="cache-larger" disabled={cacheLocked || !service.setMusicCache || cacheIndex === cacheSizes.length - 1} onClick={() => changeCacheSize(cacheSizes[cacheIndex + 1])}>+</Action></Group>
        <p className="ds-subtitle">{t("cache.retained")}</p>
        {snapshot.musicCache.restartRequired && <><p className="ds-subtitle" role="status">{t("cache.pending")}</p><Action label={t("cache.apply")} focusKey="apply-music-cache" className="ds-link" disabled={cacheLocked} onClick={() => { setCacheBusy(true); void service.applyMusicCache?.().catch(() => setError("actionFailed")).finally(() => { if (mounted.current) setCacheBusy(false); }); }}>{t("cache.apply")}</Action></>}
      </section>}
      <section className="ds-diagnostics" aria-label={t("diagnostics.title")}><h2 className="ds-title">{t("diagnostics.title")}</h2><p className="ds-subtitle">{t("diagnostics.description")}</p>
        {snapshot.diagnostics?.length ? <div role="list">{snapshot.diagnostics.map((entry, index) => <ReadOnlyRow key={`${entry.elapsedMs}-${index}`} className="ds-diagnostic-row" focusKey={`diagnostic-${index}`} label={t(`diagnostics.${entry.code}`, { value: entry.value ?? -1 })}><span className="ds-diagnostic-time">{formatDuration(entry.elapsedMs)}</span><span>{t(`diagnostics.${entry.code}`, { value: entry.value ?? -1 })}</span></ReadOnlyRow>)}</div> : <p className="ds-subtitle">{t("diagnostics.empty")}</p>}
      </section>
    </>;
  }
  function renderPlayer() {
    const track = snapshot.current;
    if (!track) return <EmptyState title={t("player.noTrack")} description={t(live ? "backend.chooseOnPhone" : "player.noTrackDescription")}>{!live && <Action label={t("navigation.playlists")} focusKey="browse-playlists" onClick={() => navigate("playlists")}><Icon name="list" />{t("navigation.playlists")}</Action>}</EmptyState>;
    const next = snapshot.queue[0]?.track;
    return <>
      <div className={`ds-session ${!snapshot.playing ? "ds-session-paused" : ""}`}><Icon name="headphones" /><span>{t(snapshot.status === "offline" ? "status.stale" : snapshot.playing ? "player.onDeck" : "player.pausedOnDeck")}</span></div>
      <div className="ds-now-playing"><Artwork source={track.artwork} name={track.title} size="hero" /><div className="ds-track-info"><h1 className="ds-title"><bdi>{track.title}</bdi></h1><p className="ds-artist"><bdi>{track.artist}</bdi></p>{snapshot.context && <p className="ds-context">{t("player.fromPlaylist", { name: snapshot.context.title })}</p>}</div></div>
      <div className="ds-seek"><Range label={t("player.seek")} focusKey="seek" value={progress} min={0} max={duration} step={1000} disabled={!ready || !allowed("seek")} valueText={t("player.time", { elapsed: formatDuration(progress), total: formatDuration(duration) })} onChange={positionMs => { setDraftSeek(positionMs); void run({ type: "seek", positionMs }); }} /><div className="ds-times"><span>{formatDuration(progress)}</span><span>{formatDuration(duration)}</span></div></div>
      <Group className="ds-control-row" flow="row">
        {button("shuffle", t(snapshot.shuffle ? "player.shuffleOn" : "player.shuffleOff"), { type: "toggleShuffle" }, { pressed: snapshot.shuffle })}
        {button("previous", t("player.previous"), { type: "previous" })}
        {button(snapshot.playing ? "pause" : "play", t(snapshot.playing ? "player.pause" : "player.play"), { type: "togglePlayback" }, { className: "ds-transport-main" })}
        {button("next", t("player.next"), { type: "next" }, { disabled: !live && !snapshot.queue.length && snapshot.repeat !== "context" })}
        {button("repeat", repeatLabel, { type: "cycleRepeat" }, { pressed: snapshot.repeat !== "off", className: "ds-repeat" })}
      </Group>
      <div className="ds-volume"><Icon name="volume" /><div className="ds-volume-slider"><Range label={t("player.volume")} focusKey="volume" value={volume} min={0} max={100} disabled={!ready || !allowed("setVolume")} valueText={t("player.volumeValue", { value: formatNumber(volume) })} onChange={value => { setDraftVolume(value); void run({ type: "setVolume", volume: value }); }} /></div><span className="ds-volume-value">{t("player.volumeValue", { value: formatNumber(volume) })}</span></div>
      <h2 className="ds-section-label">{t("player.upNext")}</h2>
      {next ? <div className="ds-next"><Artwork source={next.artwork} name={next.title} /><div className="ds-next-copy"><TrackCopy track={next} /></div></div> : <p className="ds-row-subtitle">{live && snapshot.queueUnavailable ? queueFailure() : live && snapshot.queueStatus !== "ready" ? t("queue.pending") : t("player.endOfQueue")}</p>}
      <Action label={t("player.viewQueue")} focusKey="view-queue" className="ds-link" onClick={() => navigate("queue")}><span>{t("player.viewQueue")}</span><Icon name="queue" size={16} /></Action>
    </>;
  }
  function renderLibrary() {
    const hasTrackList = view === "tracks" && !!selected && loadedPlaylistId.current === selected.id;
    const failureDescription = libraryFailure?.kind === "http" ? t("library.httpFailure", { status: libraryFailure.status ?? 0 }) : libraryFailure?.kind === "enumerationTimeout" ? t("library.enumerationTimeout") : libraryFailure?.kind === "network" ? t("library.networkFailure") : libraryFailure?.kind === "invalidResponse" ? t("library.invalidResponse") : live ? t("library.failureDetails") : "";
    if (service.supportsLibrary === false) return <EmptyState title={t("backend.libraryTitle")} description={t("backend.libraryDescription")} icon="list" />;
    if (libraryLoading && !hasTrackList) return <>{view === "tracks" && backAction}<EmptyState title={t("library.loading")} description={live && view === "tracks" ? t("library.longLoading") : ""} icon="list" /></>;
    if (libraryError && !hasTrackList) return <>{view === "tracks" && backAction}<EmptyState title={t("library.loadFailed")} description={failureDescription} icon="alert"><Action label={t("app.retry")} focusKey="retry-library" onClick={() => { forceLibraryRefresh.current = true; setReload(value => value + 1); }}>{t("app.retry")}</Action></EmptyState></>;
    if (view === "playlists") return <>
      <div className="ds-view-header"><p className="ds-eyebrow">{t("library.eyebrow")}</p><h1 className="ds-title">{t("library.title")}</h1><p className="ds-subtitle">{t("library.description")}</p></div>
      {!playlists.length ? <EmptyState title={t("library.empty")} description={t("library.emptyDescription")} icon="list" /> : <div className="ds-list">{playlists.slice(playlistPage * PAGE_SIZE, (playlistPage + 1) * PAGE_SIZE).map(playlist => {
        const name = playlist.title.trim() ? playlist.title : t("library.untitled");
        return <Action key={playlist.id} label={t("library.openPlaylist", { name })} focusKey={`playlist-${playlist.id}`} className="ds-list-row ds-playlist-row" onClick={() => { remember(); setSelected(playlist); setTrackPage(0); setView("tracks"); }}><Artwork source={playlist.artwork} name={name} playlist /><div className="ds-row-copy"><SlidingName name={name} /></div><span className="ds-playlist-count">{t("library.trackCount", { count: playlist.trackCount })}</span></Action>;
      })}</div>}
      <Pagination page={playlistPage} count={playlists.length} setPage={setPlaylistPage} />
    </>;
    if (!selected) return null;
    return <>{backAction}<div className="ds-playlist-heading"><Artwork source={selected.artwork} name={selected.title} size="medium" playlist /><div><h1 className="ds-title"><bdi>{selected.title}</bdi></h1><p className="ds-row-subtitle">{t("library.trackCount", { count: tracks.length })}</p></div></div>
      <p className="ds-subtitle"><bdi>{selected.description}</bdi></p>
      {libraryLoading && <p className="ds-queue-note" role="status">{t("library.refreshing")}</p>}
      {libraryError && <div className="ds-error" role="alert"><div><p>{t("library.refreshFailed")}</p>{failureDescription && <p className="ds-subtitle">{failureDescription}</p>}</div></div>}
      <div className="ds-playlist-start"><Action label={t("library.playPlaylist")} focusKey="play-playlist" className="ds-playlist-play" onClick={() => { void startPlaylist(); }} disabled={!ready || busy || !tracks.length}><Icon name="play" size={17} />{t("library.playPlaylist")}</Action></div>
      {tracks.some(track => track.metadataPending) && <p className="ds-queue-note">{t("library.partialMetadata")}</p>}
      {!tracks.length ? <EmptyState title={t("library.emptyTracks")} description={t("library.emptyTracksDescription")} /> : <div className="ds-list">{tracks.slice(trackPage * PAGE_SIZE, (trackPage + 1) * PAGE_SIZE).map((track, index) => <Action key={`${track.id}-${index}`} label={t("library.playTrack", { name: track.metadataPending ? t("library.metadataPending") : track.title })} focusKey={`track-${index + trackPage * PAGE_SIZE}`} className="ds-list-row ds-track-row" onClick={() => { void startPlaylist(track.id); }} disabled={!ready || busy} pressed={snapshot.current?.id === track.id}><span className="ds-track-number">{formatNumber(index + 1 + trackPage * PAGE_SIZE)}</span><TrackCopy track={track} inline /><span className="ds-track-length">{track.metadataPending ? "" : formatDuration(track.durationMs)}</span></Action>)}</div>}
      {live && tracks.length >= 500 && <p className="ds-queue-note">{t("library.trackLimit", { count: 500 })}</p>}
      <Pagination page={trackPage} count={tracks.length} setPage={setTrackPage} />
    </>;
  }
  function queueFailure() {
    const failure = snapshot.queueError;
    if (failure?.status === 429) return snapshot.queueRetryAt ? t("queue.rateLimitedUntil", { time: formatRetryTime(snapshot.queueRetryAt, i18n.language) }) : t("queue.rateLimited");
    if (failure?.kind === "http") return t("queue.httpFailure", { status: failure.status ?? 0 });
    return t(failure?.kind === "differentDevice" ? "queue.differentDevice" : failure?.kind === "token" ? "queue.tokenFailure" : failure?.kind === "inactive" ? "queue.inactive" : "queue.unavailable");
  }
  function renderQueue() {
    const pageEntries = snapshot.queue.slice(queuePage * PAGE_SIZE, (queuePage + 1) * PAGE_SIZE);
    const groups = groupQueue(snapshot.queue.some(entry => !entry.source) ? pageEntries.map(entry => ({ ...entry, source: undefined })) : pageEntries);
    return <>{backAction}<div className="ds-view-header"><h1 className="ds-title">{t("queue.title")}</h1><p className="ds-subtitle">{t("queue.count", { count: snapshot.queue.length })}</p></div>
      {snapshot.current && <><h2 className="ds-section-label">{t("queue.nowPlaying")}</h2><div className="ds-queue-row ds-queue-row-current"><Artwork source={snapshot.current.artwork} name={snapshot.current.title} /><TrackCopy track={snapshot.current} /><Icon name={snapshot.playing ? "volume" : "pause"} size={15} /></div></>}
      {!snapshot.queue.length ? <EmptyState title={t(snapshot.queueUnavailable ? "queue.failedTitle" : live && snapshot.queueStatus !== "ready" ? "queue.loading" : "queue.empty")} description={snapshot.queueUnavailable ? queueFailure() : live && snapshot.queueStatus !== "ready" ? t("queue.pending") : t("queue.emptyDescription")} icon="queue" /> : groups.map(group => <section key={group.id}><h2 className="ds-section-label">{group.source?.kind === "manual" ? t("queue.manual") : group.source?.kind === "playlist" ? t("queue.fromPlaylist", { name: group.source.playlistName }) : t("queue.upNext")}</h2><div role="list">{group.entries.map(entry => <ReadOnlyRow className="ds-queue-row" key={entry.id} focusKey={`queue-${entry.id}`} label={t("queue.trackLabel", { name: entry.track.title, artist: entry.track.artist })}><Artwork source={entry.track.artwork} name={entry.track.title} /><TrackCopy track={entry.track} /><span className="ds-track-length">{formatDuration(entry.track.durationMs)}</span></ReadOnlyRow>)}</div></section>)}
      <Pagination page={queuePage} count={snapshot.queue.length} setPage={setQueuePage} />
      {snapshot.queueUnavailable && !!snapshot.queue.length && <p className="ds-queue-note" role="status">{queueFailure()}</p>}
      {service.refreshQueue && <Action label={t("queue.refresh")} focusKey="refresh-queue" className="ds-link" disabled={snapshot.queueStatus === "loading" || !!snapshot.queueRetryAt && snapshot.queueRetryAt > Date.now()} onClick={() => { void service.refreshQueue?.().catch(() => setError("actionFailed")); }}>{t("queue.refresh")}</Action>}
      <p className="ds-queue-note">{t("queue.readOnly")}</p>
    </>;
  }
  const tabs: { view: View; label: string; icon: IconName }[] = [{ view: "player", label: t("navigation.player"), icon: "music" }, { view: "playlists", label: t("navigation.playlists"), icon: "list" }, { view: "queue", label: t("navigation.queue"), icon: "queue" }];
  const locale = resolveLocale(i18n.language);
  return <div className={`ds-app ${expanded ? "ds-expanded" : ""}`} data-ui={theme} lang={locale.language} dir={locale.direction} style={{ "--ds-expanded": expanded ? 1 : 0 } as CSSProperties}>
    <style>{playerStyles}</style><Container onBack={back} rootRef={root}>
      <nav aria-label={t("app.name")}><Group className="ds-tabs" flow="row">{tabs.map(tab => <Action key={tab.view} label={tab.label} focusKey={`tab-${tab.view}`} className="ds-tab" pressed={view === tab.view || (view === "tracks" && tab.view === "playlists")} onClick={() => navigate(tab.view)}><span className="ds-tab-label">{tab.label}</span></Action>)}</Group></nav>
      {snapshot.status === "offline" && <div className="ds-notice" role="status"><Icon name="alert" /><div><p>{t("status.offline")}</p><p>{t("status.offlineDescription")}</p></div></div>}
      <main className="ds-scroll" ref={scroll} key={routeKey}>
        {errorNotice}
        {view === "setup" ? renderSetup() : snapshot.status === "loading" ? <><div className="ds-session"><span className="ds-loading-dot" />{t("status.loading")}</div><div className="ds-skeleton" /><EmptyState title={t("status.loading")} description={t("status.loadingDescription")} /></> : snapshot.status === "disconnected" ? <EmptyState title={t("status.disconnected")} description={t(live ? "backend.disconnected" : "status.disconnectedDescription")} icon="headphones">{live && <Action label={t("installer.setup")} focusKey="open-setup" onClick={() => navigate("setup")}>{t("installer.setup")}</Action>}</EmptyState> : view === "player" ? renderPlayer() : view === "queue" ? renderQueue() : renderLibrary()}
      </main>
      <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>{busy ? t("status.pending") : ""}</div>
    </Container>
  </div>;
}
