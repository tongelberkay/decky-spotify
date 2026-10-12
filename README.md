# Decky Spotify

A compact Spotify Connect player for Steam Deck's Decky Loader, designed for the SteamOS Quick Access menu. Control music while gaming, browse playlists, and view the upcoming queue. Sign in on your phone using a QR code.

**Experimental — version 0.4.20.** Spotify Premium is required. This is an independent, unofficial project with no affiliation with Spotify, Valve, or Decky Loader. It is not yet published in the Decky Plugin Store. Playback has been tried on a user's Deck, but playlist failures remain under investigation and compatibility, resource use, and sleep/wake behavior need further hardware testing.

## Features

- Now Playing with artwork, track information, seeking, play/pause, previous/next, shuffle, and repeat.
- Music volume separate from Steam Deck's system and game volume.
- Playlist browsing and track selection, with compact rows and muted artist names. Lists render 20 entries per page; long playlist names scroll slowly.
- Read-only upcoming queue that preserves playback order and duplicate songs. Manage the queue and playback from Spotify on your phone.
- Settings gear beside the title, controller focus, touch controls, and Back navigation. SteamOS provides the footer hints.
- Managed download and startup of [go-librespot v0.10.3](https://github.com/devgianlu/go-librespot/tree/v0.10.3), with pinned checksum verification. No Spotify developer-portal app, Soloist key, or manual player startup is required.
- Phone QR authentication and restored credentials on subsequent plugin loads.
- Configurable encrypted audio disk cache and a separate short-lived playlist metadata cache.
- English UI with a typed localization foundation for future Steam Deck system languages.

Search, queue editing within Decky, lyrics, offline downloads, device switching, and pinned overlays are outside the current scope.

## Install and sign in

The managed player supports Linux x86_64, including Steam Deck. Install Decky Loader first; the plugin does not request root privileges.

1. Build the plugin ZIP using the commands below and copy it to the Deck.
2. In Decky Loader's developer settings, use **Install Plugin from ZIP** and select `decky-spotify-v0.4.20.zip`.
3. Open **Decky Spotify** and use Setup to download the player. An existing installation can be repaired from the same screen.
4. Select **Sign in on phone**, scan the QR code, and complete Spotify's authorization page on your phone.
5. Start playback and select **Steam Deck** in the phone's Spotify device menu when needed.

The title settings gear opens Setup later. See [the backend guide](docs/backend.md) for troubleshooting, storage details, and the hardware acceptance tests.

## Caching and background behavior

**Audio cache:** enabled at 1 GB when no preference has been saved. Existing explicit On/Off choices are preserved. Settings offers 100–1,000 MB in 100 MB steps, then 1,500 and 2,000 MB. These are decimal MB. Older encrypted audio files are evicted by the native player's LRU cache. Use **Apply and restart player** after changing the preference or size; restarting interrupts playback and may require resuming from your phone. Turning caching off retains existing files. A Spotify connection and audio keys are still required, so this does not provide offline playback.

**Playlist metadata cache:** successful lists are stored privately on disk for five minutes, with a 4 MiB total budget, at most eight entries, and a 2 MiB limit per entry. Reopening uses that cache; expired entries are fetched on the next open. The cache object retains no track arrays in Python memory, and a new player session invalidates older entries. This cache is separate from the audio-cache toggle. There is no manual Refresh track details button. If updating a list already shown in the UI fails, the last successfully loaded tracks remain usable with a warning.

Closing the Quick Access menu leaves the native player running so music and Spotify Connect can continue. UI progress timers stop when hidden or unmounted. Queue polling is scoped to visible Now Playing/Queue screens and runs no more frequently than every 30 seconds, with rate-limit backoff. Unloading the plugin stops the managed player; paired installations start it again on a later backend load.

Credentials, player configuration, preferences, and caches live under `~/.local/share/decky-spotify/`. The native API binds to localhost. Credentials and access tokens are not sent to the frontend; only the public pairing URL, code, expiry, and classified diagnostic messages are exposed. Uninstalling preserves user-owned runtime files and credentials.

## Current limitations

- Browsing reads at most 1,000 playlists and 500 entries per playlist. The 500-entry limit is our native metadata configuration; it does not explain failures in smaller playlists. Playlist playback can continue beyond the browsing limit.
- Initial playlist enumeration can take up to two minutes. Temporary transport/server failures have bounded retries. Unresolved track metadata appears as placeholders, preserving order and duplicates. Some initial loads and updates still fail; safe error messages and temporary Setup logs distinguish available failure details.
- The pinned native context endpoint has no page-offset parameter. Low-memory browsing beyond 500 tracks needs a paged native endpoint and a bounded RAM page cache backed by disk. Saving a copy to disk does not release the native player's own metadata cache.
- Real queue access uses Spotify's Web API through the native session token. HTTP 429 and account/access errors can prevent updates. The plugin honors backoff and retains the last known queue. Spotify does not supply per-entry queue source information here, so the real queue uses **Up next**.
- Resource measurements, cache eviction/replay, controller focus across Steam/Decky versions, audio coexistence with games, and sleep/wake still need systematic Deck testing. The browser preview cannot validate these.

## Develop and preview

Requires Node.js 22.12+ and pnpm 11. The lockfile records dependencies. Python backend checks require Python 3.11+; Decky supplies the runtime dependencies on the Deck.

```sh
pnpm install
pnpm dev
```

Open the localhost URL printed by Vite, normally `http://127.0.0.1:5173`. The preview approximates a 1280 × 800 SteamOS screen with a 360 px content panel. It shares screens and state logic with the Decky plugin through a small UI adapter; Steam supplies the native controls and font on hardware.

The browser preview is simulated, produces no audio, and needs no Spotify credentials. Its demonstration QR code cannot sign you in. Use the scenario controls for loading, offline, empty lists, missing artwork, long text, and action failures. Simulated phone controls exercise queue changes and duplicates. Expanded English checks layout resilience without adding another language.

Use arrow keys to move focus, Enter/Space to activate, Escape to go back, and Left/Right on sliders. Touch and Tab navigation also work in the preview.

## Checks and packaging

```sh
pnpm typecheck
pnpm test
pnpm test:backend
pnpm build
pnpm build:preview
pnpm package
pnpm package:frontend
```

`pnpm check` runs type checking, frontend/service tests, backend tests, and both builds. Optional backend HTTP fixture tests require `aiohttp`; without it, those tests are skipped. To run them in a development environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install aiohttp==3.10.11 certifi
.venv/bin/python -m unittest discover -s tests/backend -v
```

The native build produces `dist/index.js`; React and Decky UI are supplied by the host. Vite writes the browser build to `preview-dist/`. Packaging requires the standard `zip` command and creates `release/decky-spotify-v0.4.20.zip`. The separate `-frontend.zip` simulates playback and omits the Python backend. Generated bundles, ZIPs, dependencies, and Python bytecode are ignored by Git. The downloaded player binary and user credentials are not included in the repository or plugin ZIP.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/player/` | Typed player contract, native bridge, queue logic, fixtures, and mock service |
| `src/ui/` | Shared screens, native/browser adapters, focus, visibility, styles, and icons |
| `main.py`, `py_modules/decky_spotify/` | Decky RPC/events, runtime management, installer, and disk metadata cache |
| `src/i18n/`, `src/locales/en.json` | Plugin-owned translation instance, locale resolution, and formatting |
| `preview/` | Browser scenario tools and simulated phone/setup behavior |
| `tests/` | UI, service, localization, protocol, process, and cache tests |
| `scripts/package.mjs` | Native and frontend-only ZIP packaging with dependency notices |
| `scripts/measure-player.py` | Native-player resource measurement on the Deck |

## Localization

English is the only shipped language. The plugin owns its `i18next`/`react-i18next` instance and does not modify Decky's translator. Labels, errors, tooltips, accessibility text, and controller hints use typed catalog keys. Spotify metadata and user playlist names remain unchanged.

`resolveLocale` currently falls back to English for every requested locale. Formatting is centralized, sentences use named interpolation, and counts support pluralization. Logical CSS properties and direction boundaries prepare the screens for future translations. There is no language picker or non-English catalog.

To add languages later, register reviewed catalogs in the resource loader, extend locale resolution and direction, preserve interpolation names, and validate key/plural coverage against English. Test expanded text, mixed-direction metadata, and controller focus on hardware. Future coverage follows [Steam client UI languages](https://partner.steamgames.com/doc/store/localization/languages).

## Public repository and Decky Store

This source tree is being prepared for a public GitHub repository. Store submission is a separate review step: Decky's [plugin database](https://github.com/SteamDeckHomebrew/decky-plugin-database#submit-your-plugin) accepts pull requests adding a plugin repository as a submodule and links the current submission requirements. Publishing this repository or a ZIP does not by itself add the plugin to the store. Playlist reliability and the remaining hardware checks should be resolved before claiming a stable release.

## License

Project code and original fixture artwork are MIT-licensed; see [LICENSE](LICENSE). Dependency terms are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The separately downloaded go-librespot runtime is GPL-3.0; its upstream source and license are preserved alongside the installed player.
