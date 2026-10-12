# Managed librespot and phone QR sign-in

The v0.4 package replaces Soloist with **go-librespot v0.10.3**, the Go implementation of a headless Spotify Connect player. The plugin installs and starts it, shows a QR code for Spotify's device authorization flow, and restores stored credentials on later loads. There is no Soloist API key, developer-dashboard setup, localhost browser callback, or command-line startup step.

Spotify Premium is required. This is an unofficial integration; Spotify may change the protocol. Real account login, audio coexistence, sleep/wake and RAM/CPU have not been verified on a Steam Deck. The browser is a simulation and its demonstration QR code is not a usable login session.

## First run

1. Install `decky-spotify-v0.4.20.zip` in Decky Loader using its ZIP install option.
2. Open **Decky Spotify → Setup → Install player**. The plugin downloads the pinned Linux x86_64 runtime from its upstream GitHub release. It checks the archive's SHA-256 against the pinned upstream asset digest, rejects unsafe archive paths/links, checks the executable's ELF architecture, and installs it privately under `~/.local/share/decky-spotify/bin/go-librespot`.
3. Select **Sign in on phone**. Scan the displayed QR code with your phone camera. It links to Spotify's own HTTPS pairing page, usually with the short code already filled in. If prompted, enter the code displayed on the Deck and approve access. You can also type `spotify.com/pair` on your phone and enter the code.
4. The Deck observes completion through the running player's local pairing/status API. Approval never redirects the phone to a Deck localhost address. The QR disappears after login. Expired codes can be replaced; Cancel stops a pending login.
5. Choose a playlist in Decky, or choose **Steam Deck** as the output device in your phone's Spotify app. Audio plays on the Deck. Search and queue editing stay in the phone app.

The player uses Spotify's device authorization flow as implemented by upstream. This flow is not part of the generally available public Spotify developer-app API. The upstream client identity and permission set may be presented as Spotify's desktop client on the approval page; Decky Spotify is an independent unofficial project. Review the permissions on Spotify's page before approving. We do not collect your password or imitate Spotify's login page.

Sources: [pinned upstream configuration/API](https://github.com/devgianlu/go-librespot/tree/v0.10.3), [device-auth implementation](https://github.com/devgianlu/go-librespot/blob/v0.10.3/session/oauth2.go), [librespot device-flow documentation](https://github.com/librespot-org/librespot/blob/dev/docs/device-authorization.md).

## Sign-in startup fix

Version 0.4.2 corrects the native launch argument to `--config_dir`. Upstream uses pflag, where `-config_dir` is parsed as the `-c` configuration override with value `onfig_dir`; startup exits before requesting a pairing code. Updating the plugin preserves the installed runtime and cached credentials. Reopen Setup and select Sign in on phone after updating; downloading the runtime again is unnecessary for this fix. Startup failures now display Retry starting player rather than asking for a code that was never issued.

## Simplified playlist updates (v0.4.20)

The manual Refresh track details button has been removed. Reopening uses the five-minute disk cache; expired entries are fetched on the next open. If a list already shown in the UI cannot be updated, its songs remain usable with a warning. Lists are identified by playlist URI so another playlist's tracks cannot appear as fallback. Initial failures retain Retry. Safe failure messages distinguish HTTP errors, enumeration timeouts, connection failures, and invalid responses. The browsing cap is not shown as a loading error.

## Reopening playlist lists (v0.4.19)

Successful lists are cached on disk for five minutes, with a 4 MiB total budget and 2 MiB per entry. No track arrays are retained in the Python cache object. Reopening a fresh list avoids native refetches; Refresh track details and Retry bypass the cache. Cache entries preserve order, duplicates and unresolved placeholders. Files are private and keyed by a hash of a per-runtime/player-session namespace and playlist URI; restarting or reauthenticating the player invalidates reads from older sessions. Storage failure does not fail a successful list. This metadata cache is separate from audio-cache settings and does not release go-librespot’s own memory. Failure responses expose a safe HTTP status on-screen. Loading descriptions no longer mention the browsing cap; a 256-track list is below that limit.

## Native title width (v0.4.18)

The plugin title now flexes into the space remaining beside Decky’s own Back button. It no longer requests 100% of the header width or duplicates Steam’s Title class inside Decky’s Title container. The name truncates while the settings gear retains its compact size. Native Deck verification is still needed.

## Adjustable disk audio cache (v0.4.17)

Without a saved preference, caching defaults to enabled at 1 GB. Existing explicit On/Off settings are preserved. Sizes are decimal MB: 100–1000 in 100 MB steps, then 1500 and 2000. Settings are validated and persisted privately; the exact byte limit is passed to native LRU eviction. Changes apply with an explicit restart, preserving credentials. Reducing the limit allows native eviction when the cache is reopened; disabling retains files.

The native metadata limit remains 500 to preserve RAM use. The pinned context listing endpoint has no offset/limit parameters and its own in-memory metadata cache grows with max_tracks. Increasing max_tracks to 5000 would allocate a larger native cache; writing the same metadata to disk would not release native RAM. True low-memory browsing beyond 500 requires a paged native endpoint, then a bounded RAM page cache backed by disk. Audio caching does not fix playlist enumeration.

## Playlist request recovery (v0.4.16)

Temporary transport failures and HTTP 408/500/502/503/504 now receive at most two automatic retries with 1- and 2-second backoff, within the existing enumeration deadline. Access errors and rate limits fail without automatic retries. Reopening a playlist joins an existing load for the same URI; runtime shutdown cancels these loads. Metadata fill is limited to 15 seconds and retains the enumerated list even when a later request fails. Known names and unresolved URI placeholders keep their positions and duplicates. New retry diagnostics distinguish recovery attempts from persistent failures. Actual failing Deck playlists still require log evidence to confirm their cause.

## Long playlists, diagnostics and Back clearance (v0.4.15)

Enumeration now has a separate two-minute deadline matching upstream, with two-second local polling. Metadata receives its own short fill period. The existing 500-track browsing cap is explicit in the loading screen and capped lists; playlist playback is not shortened. Starting and completing enumeration emits fresh diagnostic entries. Back now has a padded wrapper providing 12 px clearance before playlist artwork and other screen content. Failed track lists retain a Back action and direct live users to the temporary log view. Native playlist resolution/enumeration failures now expose classified messages and a numeric HTTP status where available, without raw logs, URIs or tokens. This diagnoses failures that occur before metadata is available; it does not claim to fix upstream playlist access.

## Incomplete playlist metadata (v0.4.14)

After the bounded 15-second metadata wait, an enumerated playlist opens even if some song details remain unavailable. Unresolved track URIs keep their original positions, including duplicates, with localized placeholders and no invented duration. Refresh track details retries on demand. Playlist artwork loading remains independent. Enumeration and HTTP failures still report a failure; no real account reproduction of the reported playlist has been performed.

## Compact track rows (v0.4.13)

Playlist track buttons are 28 px tall. Song title and artist share one line with a decorative bullet separator and a subdued gray artist color. Long metadata truncates visually while the full text remains in the DOM and hover titles. Row gaps and playlist play button clearance remain unchanged.

## Action separation (v0.4.12)

Repair/install and phone sign-in actions now share a vertical layout with a 12 px gap. The playlist play action has a padded wrapper providing 12 px clearance above the first track. Spacing comes from the surrounding layout so Steam button margin defaults cannot collapse it.

## Button spacing (v0.4.11)

Playlist and track rows have 8 px gaps, tabs and playback controls have 6 px gaps, and adjacent setup actions have 8 px separation. Playlist buttons remain 28 px tall.

## Native overlay layout repair (v0.4.10)

Button contents have an explicit inner flex row because Steam DialogButton wraps its label. Playlist rows now use a flat background, small artwork, left-aligned names and a right-aligned track count, with visible controller focus and slow scrolling for long names. Blank names use an English Untitled playlist display fallback without changing Spotify metadata. Native content no longer imposes a viewport-derived height or a nested scrolling area; SteamOS owns the panel scroll, so the plugin does not reserve a separate footer area.

## Optional music cache (v0.4.9)

Open the title settings gear and toggle Music cache. It defaults to On at 1 GB if no setting has been saved, preserves existing explicit On/Off choices, and persists the selected size in the private settings.json file. When the player is already running, Apply and restart player activates the saved change; playback is interrupted and may need to be resumed from the phone. Before first startup, the saved choice applies immediately on the next launch. Cached Spotify credentials are preserved during the restart.

Enabled caching stores still-encrypted audio under ~/.local/share/decky-spotify/audio-cache with upstream LRU eviction configured to the selected byte limit. It caches played/downloaded audio files for reuse, rather than downloading your entire library. Disabling it stops cache use after restart and retains existing files. A valid Spotify session and retrieval of an audio key are still needed for each playback, so it does not provide offline downloads. Cache writes, eviction and replay still need a real Deck test; the browser toggle only simulates preferences.

Source: https://github.com/devgianlu/go-librespot/blob/v0.10.3/README.md#audio-cache

## Queue rate limits (v0.4.8)

Spotify HTTP 429 pauses queue access. Queue requests are now spaced at least 30 seconds apart, including manual refreshes and reads triggered by playback events or controls. The full Retry-After value is respected, including waits longer than an hour. Missing or invalid headers use increasing waits from one minute to fifteen minutes. A private queue-cooldown.json file stores only the retry deadline and backoff count so reloading Decky does not restart requests early. The Queue screen displays the local retry date/time and disables Refresh during that pause; the last known queue remains visible. This cannot remove a server-imposed limit. Spotify applies some limits at the client-app level, so reduced polling may not immediately restore access.

Reference: https://developer.spotify.com/documentation/web-api/concepts/rate-limits

## Slim playlists and queue diagnostics (v0.4.6)

Playlist rows use a single line, 20 px artwork and a 28 px minimum height. Names that overflow slide slowly, pause at either end, and stop when hidden. Reduced-motion preferences disable scrolling. Full playlist names remain in controller/accessibility labels.

Queue now distinguishes unread/loading, successfully fetched empty data and failed access. Refresh queue performs an explicit read even if visibility-based polling has not run. Errors show the Spotify HTTP status, unusable token, inactive player or a mismatch with the Deck’s current track. Last-known songs and duplicates are retained on a failed refresh. Refresh obeys Spotify’s rate-limit backoff. If phone songs still do not appear, report the new Queue message; a native playback session does not guarantee the separate Web API queue request is authorized.

## Compact overlay UI (v0.4.5)

Buttons use compact 28–30 px heights, smaller artwork and tighter spacing. Native slider fields use a stacked layout with no duplicate description or separator. The plugin footer, including duplicate Select/Back hints and the Setup button, is removed; setup remains available from the disconnected screen and opens automatically during authentication failures. Playback behavior is unchanged by this UI release.

## Temporary sign-in diagnostics (v0.4.3)

Setup includes a controller-focusable diagnostic view with up to 24 events and elapsed times. It is reset for each sign-in attempt and kept only in memory. Native stderr is drained in bounded chunks and classified into fixed messages; raw logs, pairing URLs/codes, usernames and credentials are never included in the diagnostic list. Report the displayed event messages if QR pairing still fails.

The bridge now reads `/auth/code` before `/status`: with upstream discovery enabled, the status channel may not be serviced until device authentication completes. Local Zeroconf discovery is disabled; the authenticated Spotify Connect session still supports phone control. Native subprocesses restore the original system library path instead of inheriting frozen Decky libraries. The API monitor reports failures and ends a startup attempt after 90 seconds without a code or session.

## Download troubleshooting

Version 0.4.1 explicitly loads Decky Loader's bundled certifi CA store for HTTPS, following Decky's own downloader. Server identity verification and the pinned archive checksum remain required. The Setup screen distinguishes certificate failures, timeouts, HTTP status codes, missing Python dependencies, storage exhaustion and folder permission failures; it never displays raw exception messages or signed download URLs. If installation still fails immediately, report the exact new message. For a certificate failure, check the Deck's date/time and Decky version; for a permission failure, inspect ownership of `~/.local/share/decky-spotify`. Player installation still runs entirely from the plugin.

## Playback and queue

- Now Playing, pause/resume, seek, previous/next, shuffle, repeat, and music volume use the runtime's local API.
- PulseAudio output works through SteamOS's PipeWire compatibility server. `mixer_device` stays empty and `external_volume` is false, so the runtime applies music volume within its own audio pipeline instead of controlling the master mixer. Actual game-volume isolation needs a hardware check.
- Playlist browsing and track selection use upstream's native library/context endpoints. Lists render 20 rows per UI page; the prototype reads at most 1,000 playlists and 500 tracks per playlist. Native metadata caching is bounded at 500 tracks and does not sweep every playing playlist automatically.
- The pinned runtime has no full ordered-queue REST endpoint. The bridge therefore reads Spotify's queue through the active session's token, held only in Python memory. Queue order and duplicates are preserved; the Web API supplies no manual/context source field, so the real queue uses **Up next** without guessing labels.
- Queue polling runs about every thirty seconds only while a visible Now Playing or Queue view needs it. It respects rate-limit backoff. Phone additions can appear on the next successful poll. Playback events and local progress interpolation remain independent of queue polling.
- Queue access with upstream's session token still needs verification against a real account. If Spotify rejects it or the current queue belongs to another device, the UI marks the queue unavailable and retains the last known entries. It never replaces your queue with fixtures or reconstructs a fake order from a playlist.
- Search, queue writes, downloads, lyrics, device switching, and overlays remain excluded. The audio disk cache defaults to enabled unless a saved preference disables it; it is not an offline player.

Sources: [runtime API](https://github.com/devgianlu/go-librespot/blob/v0.10.3/api-spec.yml), [Spotify queue API](https://developer.spotify.com/documentation/web-api/reference/get-queue).

## Lifecycle, storage and updates

The plugin owns the runtime process. Paired installations start when the Decky backend loads. Unloading/reloading Decky stops it; a later load restores cached credentials and starts it again. Installation and browser UI do not start a login without selecting Sign in. Closing the QAM panel leaves music playing. Native crash/startup failures produce a retry state. Selecting a new sign-in after a failed cached login moves its credentials to a private recovery file before beginning fresh pairing. Uninstalling preserves user-owned downloads and credentials.

Runtime configuration and credentials live in `~/.local/share/decky-spotify/librespot`, inside a private directory. Native logs are not forwarded, and tokens, usernames, stored credentials and OAuth device-code secrets are never emitted to React. Only the public pairing URL, user code and expiry are exposed. There is no LAN HTTP callback or hosted authentication relay. The player API binds only to `127.0.0.1`; the frontend uses Decky's RPC/events. Other local processes can still access that loopback API, so this integration is intended for a trusted personal Deck.

The runtime is pinned with a fixed release URL and digest. **Repair player** reinstalls that same tested version. New supported runtime versions will be shipped through plugin updates after API compatibility checks; there is no Soloist-style 90-day build expiry. Previous Soloist files are not deleted or reused. Vendor README/license texts are preserved beside the downloaded executable. The runtime is GPL-3.0; its source is available at the pinned upstream tag. The plugin ZIP contains license notices, not the runtime binary.

## Hardware acceptance test

Record SteamOS/Decky/runtime versions and audio output used.

1. Complete the real QR login from a phone. Verify expiry/retry, cancellation, plugin reload, and automatic restoration without another code.
2. Test playlists, selected tracks and playback controls with both touch and controller. Check Back, focus, scrolling and close/reopen at 1280×800.
3. Play alongside a game. Change Music volume from Decky and the phone; confirm the master-volume indicator and game loudness remain unchanged.
4. Add the same song twice on the phone, reorder/add/skip, and confirm ordered queue synchronization. Check the queue-unavailable state if the account/session token cannot access Spotify's queue API.
5. Test switching away from Steam Deck in the phone app, network loss, player crashes, and Deck sleep/wake. These behaviors are not validated by browser fixtures.
6. Measure idle, playing with QAM closed/open, and playing alongside a game. Repeat after 15 minutes:

   ```sh
   python3 "$HOME/homebrew/plugins/Decky Spotify/scripts/measure-player.py" --seconds 60
   ```

   The JSON reports the runtime's RSS/PSS and CPU relative to one core, without collecting commands, credentials or track metadata. Also compare whole-system memory and frame timing with the plugin enabled/disabled; the script does not include Decky's Python or React memory.

## Local checks

`pnpm check` runs TypeScript, service/UI/QR decoder tests, Python protocol/process tests and both builds. Wire tests use temporary HTTP fixture servers with aiohttp: create a development venv, install `aiohttp==3.10.11`, and run `python -m unittest discover -s tests/backend -v`. Decky supplies aiohttp in its own runtime. Fixture tests do not authenticate a real Spotify account or produce audio.
