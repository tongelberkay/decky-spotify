import { steamThemeDeclarations } from "./theme";

// Scoped CSS works in Steam's existing renderer and in the browser preview without a CSS runtime.
export const playerStyles = `
.ds-app { ${steamThemeDeclarations} --ds-green:var(--steam-accent-success); --ds-muted:var(--steam-text-muted); --ds-line:var(--steam-border); --ds-surface:var(--steam-bg-card); color:var(--steam-text-primary); font-family:var(--steam-font-sans); font-size:var(--steam-font-size-base); line-height:1.4; width:100%; height:100%; min-height:0; background:var(--steam-bg-primary); color-scheme:dark; }
.ds-app[data-ui="decky"] { background:transparent; color:inherit; font-family:inherit; }
.ds-app[data-ui="decky"], .ds-app[data-ui="decky"] .ds-container { height:auto; min-height:0; }
.ds-app[data-ui="decky"] .ds-scroll { flex:none; overflow:visible; }
.ds-app *, .ds-app *::before, .ds-app *::after { box-sizing:border-box; }
.ds-container { display:flex; flex-direction:column; min-height:0; height:100%; }
.ds-app h1,.ds-app h2,.ds-app h3,.ds-app p { margin:0; }
.ds-app button,.ds-app input { font:inherit; }
.ds-app,.ds-container,.ds-container > nav { min-inline-size:0; max-inline-size:100%; }
.ds-tabs { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,.8fr); inline-size:100%; min-inline-size:0; gap:var(--steam-unit); padding:4px 8px 12px; border-block-end:1px solid var(--ds-line); flex:none; }
.ds-app[data-ui="decky"] .ds-tabs { display:grid !important; }
.ds-app .ds-tabs > .ds-tab { inline-size:100% !important; min-inline-size:0 !important; max-inline-size:100% !important; padding:8px 4px !important; white-space:normal !important; font-size:12px !important; }
.ds-tab-label { min-inline-size:0; overflow-wrap:anywhere; text-align:center; }
.ds-diagnostics { margin-block-start:20px; border-block-start:1px solid var(--ds-line); padding-block-start:12px; }
.ds-diagnostics .ds-title { font-size:14px; }
.ds-diagnostic-row { display:flex; gap:8px; padding-block:6px; font-size:11px; overflow-wrap:anywhere; }
.ds-diagnostic-time { flex:none; color:var(--ds-muted); font-variant-numeric:tabular-nums; }
.ds-action { border-radius:var(--steam-base-radius); padding:4px 6px; min-height:28px; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; text-align:start; line-height:1.3; min-width:0; font-size:12px; }
.ds-app[data-ui="browser"] .ds-action { border:0; color:var(--steam-text-primary); background:var(--ds-surface); transition:background .12s; }
.ds-app[data-ui="browser"] .ds-action:hover { background:var(--steam-bg-tertiary); }
.ds-app[data-ui="browser"] .ds-action:focus-visible { background:var(--steam-text-primary); color:var(--steam-bg-primary); outline:2px solid var(--steam-text-primary); outline-offset:2px; }
.ds-range:focus-visible { outline:2px solid var(--steam-accent-primary); outline-offset:3px; }
.ds-action:disabled { opacity:.38; cursor:default; }
.ds-tab { font-size:var(--steam-font-size-base); padding:8px 4px; border-radius:var(--steam-base-radius); }
.ds-app[data-ui="browser"] .ds-tab { background:transparent; color:var(--ds-muted); }
.ds-app[data-ui="browser"] .ds-tab[aria-pressed="true"] { background:var(--steam-bg-tertiary); color:var(--steam-text-primary); }
.ds-app[data-ui="decky"] .ds-tab[aria-pressed="true"] { border-block-end:2px solid currentColor; }
.ds-scroll { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:16px 16px 12px; scrollbar-width:thin; scrollbar-color:var(--steam-bg-tertiary) transparent; }
.ds-scroll::-webkit-scrollbar { width:4px; } .ds-scroll::-webkit-scrollbar-thumb { background:var(--steam-border); border-radius:var(--steam-card-radius); }
.ds-pairing { text-align:center; padding-block:8px; }
.ds-qr { display:block; width:176px; height:176px; margin:16px auto 12px; max-width:100%; }
.ds-auth-code { font-size:var(--steam-font-size-xl); letter-spacing:3px; }
.ds-pairing .ds-link, .ds-auth-start { margin-block-start:16px; }
.ds-install-status { margin-block:16px; color:var(--steam-text-secondary); }
.ds-install-status progress { width:100%; margin-block-start:8px; height:8px; accent-color:var(--steam-accent-primary); }
.ds-session { display:flex; align-items:center; gap:8px; font-size:var(--steam-font-size-sm); color:var(--ds-muted); margin-block-end:16px; }
.ds-session svg { width:16px; height:16px; color:var(--steam-accent-secondary); } .ds-session-paused { color:var(--ds-muted); }
.ds-art { display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--steam-bg-secondary); border-radius:var(--steam-base-radius); flex:none; color:var(--steam-text-muted); }
.ds-art img { width:100%; height:100%; object-fit:contain; display:block; } .ds-art-hero { width:96px; height:96px; }
.ds-art-small { width:40px; height:40px; } .ds-art-medium { width:64px; height:64px; }
.ds-now-playing { display:flex; align-items:center; gap:16px; }
.ds-track-info { min-width:0; flex:1; text-align:start; }
.ds-title { font-size:var(--steam-font-size-xl); line-height:1.25; font-weight:600; overflow-wrap:anywhere; }
.ds-artist { color:var(--steam-text-primary); font-size:var(--steam-font-size-base); margin-block-start:4px !important; overflow-wrap:anywhere; }
.ds-context { color:var(--ds-muted); font-size:var(--steam-font-size-sm); margin-block-start:4px !important; overflow-wrap:anywhere; }
.ds-seek { margin-block:20px 12px; } .ds-times { color:var(--ds-muted); font-size:var(--steam-font-size-sm); display:flex; justify-content:space-between; margin-block-start:8px; font-variant-numeric:tabular-nums; }
.ds-range { -webkit-appearance:none; appearance:none; display:block; width:100%; height:24px; border-radius:var(--steam-base-radius); background:linear-gradient(to right,var(--steam-accent-secondary) var(--progress),var(--steam-bg-tertiary) var(--progress)) center / 100% 6px no-repeat; cursor:pointer; margin:0; }
.ds-range::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%; background:var(--steam-text-primary); }
.ds-range::-moz-range-thumb { border:0; width:20px; height:20px; border-radius:50%; background:var(--steam-text-primary); }
.ds-range:disabled { opacity:.4; cursor:default; }
.ds-native-range { margin-block:4px; } .ds-native-range > * > * { min-width:0; }
.ds-control-row { display:grid; grid-template-columns:repeat(5,minmax(44px,1fr)); align-items:center; gap:8px; margin-block:12px 16px; }
.ds-transport { padding:8px; min-height:44px; }
.ds-app[data-ui="browser"] .ds-transport[aria-pressed="true"] { color:var(--steam-accent-primary); }
.ds-app[data-ui="browser"] .ds-transport-main { background:var(--steam-bg-tertiary); color:var(--steam-text-primary); }
.ds-repeat-one { position:absolute; font-size:var(--steam-font-size-xs); font-weight:700; inset-inline-end:2px; inset-block-start:2px; } .ds-repeat { position:relative; }
.ds-volume { display:flex; align-items:center; gap:12px; padding-block:4px 16px; border-block-end:1px solid var(--ds-line); } .ds-volume svg { color:var(--ds-muted); width:18px; } .ds-volume-slider { flex:1; min-width:0; } .ds-volume-value { color:var(--ds-muted); font-size:var(--steam-font-size-sm); min-width:32px; text-align:end; font-variant-numeric:tabular-nums; }
.ds-section-label { color:var(--ds-muted); font-size:var(--steam-font-size-sm); text-transform:uppercase; letter-spacing:.5px; font-weight:600; margin-block:16px 12px !important; }
.ds-next { display:flex; gap:12px; align-items:center; margin-block-end:12px; } .ds-next-copy { flex:1; min-width:0; } .ds-row-title { font-weight:500; font-size:var(--steam-font-size-base); line-height:1.35; overflow-wrap:anywhere; } .ds-row-subtitle { color:var(--ds-muted); font-size:var(--steam-font-size-sm); margin-block-start:4px !important; overflow-wrap:anywhere; }
.ds-link { padding:8px 12px; min-height:44px; font-size:var(--steam-font-size-base); width:100%; justify-content:space-between; }
.ds-view-header { margin-block-end:16px; } .ds-view-header .ds-title { font-size:var(--steam-font-size-xl); } .ds-subtitle { color:var(--ds-muted); font-size:var(--steam-font-size-sm); margin-block-start:8px !important; }
.ds-eyebrow { color:var(--steam-text-muted); letter-spacing:.5px; font-size:var(--steam-font-size-sm); font-weight:600; margin-block-end:8px !important; }
.ds-list { display:flex; flex-direction:column; gap:8px; }
.ds-list-row { justify-content:flex-start; align-items:center; width:100%; padding:12px; gap:12px; min-height:60px; }
.ds-list-row .ds-row-copy { flex:1; min-width:0; } .ds-list-row > svg { color:var(--steam-text-muted); width:16px; flex:none; } .ds-app[data-ui="browser"] .ds-list-row { background:transparent; border-block-end:1px solid var(--steam-border); } .ds-app[data-ui="browser"] .ds-list-row[aria-pressed="true"] { background:var(--steam-bg-tertiary); } .ds-list-row[aria-pressed="true"] .ds-row-title { color:inherit; }
.ds-app[data-ui="browser"] .ds-list-row:focus-visible .ds-row-subtitle, .ds-app[data-ui="browser"] .ds-list-row:focus-visible .ds-track-length { color:var(--steam-bg-tertiary); }
.ds-back { display:inline-flex; padding:4px 8px; min-height:36px; font-size:var(--steam-font-size-sm); margin-block-end:12px; }
.ds-playlist-heading { display:flex; gap:16px; align-items:center; margin-block-end:16px; } .ds-playlist-heading .ds-title { font-size:var(--steam-font-size-xl); } .ds-playlist-heading > div:last-child { min-width:0; }
.ds-playlist-play { width:100%; font-weight:600; margin-block:16px; }
.ds-app[data-ui="browser"] .ds-playlist-play { background:var(--steam-bg-tertiary); }
.ds-track-number { color:var(--ds-muted); width:17px; flex:none; font-size:var(--steam-font-size-sm); text-align:center; } .ds-track-length { font-size:var(--steam-font-size-sm); color:var(--ds-muted); flex:none; font-variant-numeric:tabular-nums; }
.ds-queue-row { display:flex; gap:12px; padding:12px 0; align-items:center; border-block-end:1px solid var(--ds-line); } .ds-queue-row > div:nth-child(2) { flex:1; min-width:0; } .ds-queue-row-current .ds-row-title { color:var(--steam-text-secondary); }
.ds-queue-row:focus-visible, .ds-queue-row.ds-row-focus { outline:2px solid var(--steam-text-primary); outline-offset:2px; border-radius:var(--steam-base-radius); }
.ds-queue-note { color:var(--ds-muted); font-size:var(--steam-font-size-sm); margin-block:16px 12px !important; }
.ds-notice { display:flex; gap:8px; background:var(--steam-bg-card); border-block-end:1px solid var(--steam-border); padding:12px 16px; font-size:var(--steam-font-size-xs); color:var(--steam-text-secondary); flex:none; } .ds-notice svg { width:16px; flex:none; } .ds-notice p+p { font-size:var(--steam-font-size-xs); opacity:.8; margin-block-start:4px; }
.ds-error { display:flex; align-items:center; gap:8px; background:var(--steam-bg-secondary); border:1px solid var(--steam-accent-secondary); border-radius:var(--steam-card-radius); padding:12px; color:var(--steam-text-primary); font-size:var(--steam-font-size-sm); margin-block-end:16px; } .ds-error p { flex:1; } .ds-error .ds-action { background:transparent; padding:4px; min-height:28px; }
.ds-empty { text-align:center; padding:40px 12px; } .ds-empty-icon { width:64px; height:64px; margin:0 auto 16px; border-radius:50%; background:var(--steam-bg-tertiary); display:flex; align-items:center; justify-content:center; color:var(--steam-text-secondary); } .ds-empty h2 { font-size:var(--steam-font-size-lg); font-weight:600; } .ds-empty p { color:var(--ds-muted); font-size:var(--steam-font-size-sm); margin-block:8px 20px; } .ds-empty .ds-action { width:100%; }
.ds-skeleton { width:96px; height:96px; margin:16px auto; background:var(--steam-bg-card); border-radius:var(--steam-base-radius); } .ds-loading-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--ds-green); animation:ds-pulse 1.5s ease-in-out infinite; }
.ds-page-controls { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-block:16px 4px; color:var(--ds-muted); font-size:var(--steam-font-size-xs); } .ds-page-controls .ds-action { min-height:32px; padding:8px 12px; }
.ds-expanded { font-size:var(--steam-font-size-base); } .ds-expanded .ds-tab { font-size:var(--steam-font-size-xs); white-space:normal; overflow-wrap:anywhere; }
@keyframes ds-pulse { 50% { opacity:.3; } }
@media (prefers-reduced-motion:reduce) { .ds-loading-dot { animation:none; } .ds-action { transition:none; } }
/* Compact QAM sizing, including Steam's native control defaults. */
.ds-app .ds-action { min-block-size:28px !important; min-inline-size:0 !important; }
.ds-app .ds-tabs { padding:2px 6px 8px; gap:6px; }
.ds-app .ds-tabs > .ds-tab { padding:3px 4px !important; font-size:11px !important; }
.ds-scroll { min-inline-size:0; overflow-x:hidden; padding:8px 10px; }
.ds-session { margin-block-end:8px; font-size:11px; }
.ds-now-playing { gap:10px; }
.ds-art-hero { width:64px; height:64px; }
.ds-art-small { width:28px; height:28px; }
.ds-title { font-size:16px; }
.ds-artist,.ds-row-title { font-size:12px; }
.ds-context,.ds-row-subtitle { font-size:11px; }
.ds-seek { margin-block:10px 6px; }
.ds-times { margin-block-start:2px; font-size:10px; }
.ds-control-row { grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; margin-block:6px 8px; }
.ds-app .ds-control-row > .ds-transport { padding:3px !important; inline-size:100% !important; min-block-size:30px !important; }
.ds-volume { gap:6px; padding-block:2px 8px; }
.ds-volume-value { min-width:28px; font-size:10px; }
.ds-section-label { font-size:11px; margin-block:8px 6px !important; }
.ds-next { gap:8px; margin-block-end:6px; }
.ds-link { padding:4px 6px; min-height:28px; font-size:12px; }
.ds-link + .ds-link, .ds-subtitle + .ds-link { margin-block-start:8px; }
.ds-setup-actions { display:flex; flex-direction:column; gap:12px; }
.ds-setup-actions > .ds-action { margin:0 !important; }
.ds-playlist-start { padding-block:12px; }
.ds-playlist-start > .ds-playlist-play { margin:0 !important; }
.ds-list-row { padding:6px; gap:8px; min-height:40px; }
.ds-back { min-height:26px; margin-block-end:6px; }
.ds-back-area { padding-block-end:12px; }
.ds-back-area > .ds-back { margin:0 !important; }
.ds-cache-size { display:grid; grid-template-columns:32px minmax(0,1fr) 32px; align-items:center; gap:8px; margin-block:8px; }
.ds-cache-size > span { text-align:center; font-size:12px; }
.ds-app[data-ui="decky"] .ds-volume { display:block; position:relative; }
.ds-app[data-ui="decky"] .ds-volume > svg { display:none; }
.ds-app[data-ui="decky"] .ds-volume-value { position:absolute; inset-inline-end:0; inset-block-start:4px; }
.ds-native-range { inline-size:100%; min-inline-size:0; margin:0; }
.ds-app[data-ui="decky"] .ds-compact-slider { margin:0 !important; padding:0 !important; min-inline-size:0 !important; inline-size:100% !important; }
.ds-app[data-ui="decky"] .ds-compact-slider > * { min-inline-size:0 !important; max-inline-size:100%; }
.ds-slider-label { font-size:11px; line-height:16px; }
.ds-app .ds-playlist-row { block-size:28px !important; min-block-size:28px !important; max-block-size:28px !important; padding:3px 6px !important; gap:6px; }
.ds-app .ds-playlist-row { background:transparent !important; color:var(--steam-text-primary) !important; border:0 !important; border-block-end:1px solid var(--ds-line) !important; border-radius:0; text-align:start; }
.ds-app[data-ui="decky"] .ds-playlist-row > *, .ds-app[data-ui="decky"] .ds-track-row > * { inline-size:100% !important; min-inline-size:0 !important; max-inline-size:100%; min-block-size:0 !important; block-size:auto !important; margin:0 !important; padding:0 !important; }
.ds-app .ds-button-content { display:flex !important; flex-direction:row !important; min-inline-size:0; }
.ds-app .ds-playlist-row:focus-visible,.ds-app .ds-playlist-row:focus-within,.ds-app .ds-playlist-row.gpfocus { background:var(--steam-text-primary) !important; color:var(--steam-bg-primary) !important; outline:2px solid var(--steam-text-primary); outline-offset:-2px; }
.ds-playlist-row:focus-visible .ds-playlist-count,.ds-playlist-row:focus-within .ds-playlist-count,.ds-playlist-row.gpfocus .ds-playlist-count { color:inherit; }
.ds-app .ds-track-row { block-size:28px !important; min-block-size:28px !important; max-block-size:28px !important; padding:3px 6px !important; }
.ds-track-inline { display:flex; align-items:center; gap:5px; overflow:hidden; white-space:nowrap; font-size:11px; line-height:18px; }
.ds-track-title, .ds-track-artist { min-inline-size:0; overflow:hidden; text-overflow:ellipsis; }
.ds-track-title { flex:0 1 auto; }
.ds-track-artist { flex:0 1 auto; color:#737b85; }
.ds-track-separator { flex:none; color:#737b85; }
.ds-track-row:focus-visible .ds-track-artist, .ds-track-row:focus-within .ds-track-artist, .ds-track-row.gpfocus .ds-track-artist,
.ds-track-row:focus-visible .ds-track-separator, .ds-track-row:focus-within .ds-track-separator, .ds-track-row.gpfocus .ds-track-separator { color:#4c535c; }
.ds-playlist-row .ds-art-small { inline-size:20px; block-size:20px; }
.ds-playlist-count { flex:none; font-size:10px; color:var(--ds-muted); white-space:nowrap; }
.ds-marquee { display:block; inline-size:100%; overflow:hidden; font-size:11px; line-height:18px; }
.ds-marquee-track { display:inline-block; white-space:nowrap; }
.ds-marquee[data-overflow="true"] .ds-marquee-track { animation:ds-name-slide var(--ds-marquee-duration) linear infinite; animation-play-state:paused; }
.ds-marquee[data-overflow="true"][data-visible="true"] .ds-marquee-track { animation-play-state:running; }
@keyframes ds-name-slide { 0%,15% { transform:translateX(0); } 45%,65% { transform:translateX(var(--ds-marquee-end)); } 95%,100% { transform:translateX(0); } }
@media (prefers-reduced-motion:reduce) { .ds-marquee[data-overflow="true"] .ds-marquee-track { animation:none; } .ds-marquee { text-overflow:ellipsis; } }
`;
