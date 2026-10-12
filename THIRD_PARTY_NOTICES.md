# Third-party notices

The project code and original fixture artwork use the MIT license in `LICENSE`.

The packaged Decky bundle includes `@decky/api` (LGPL-2.1), i18next (MIT), react-i18next (MIT), qrcode-generator (MIT), and their bundled runtime helpers. The browser preview additionally bundles React/React DOM (MIT). The Decky build obtains React and `@decky/ui` from the host.

Packaging copies the installed dependency license texts into `third-party/` and includes the unmodified `@decky/api` source and distribution files. qrcode-generator ships its copyright and MIT reference in its source header; packaging preserves that source and supplies the full MIT text. Dependency versions are recorded in each notice and in the project's lockfile. `dist/index.js.map` includes the source content used to produce the plugin bundle.

The plugin has not modified the upstream Decky API library. Its upstream project is <https://github.com/SteamDeckHomebrew/loader-api>. Dependency license texts govern those libraries; the project's MIT license does not replace them.

The Python bridge uses aiohttp and certifi from Decky Loader’s runtime; they are not copied into the ZIP. The plugin separately downloads go-librespot v0.10.3 (GPL-3.0) from its upstream release and preserves its README and GPL license alongside the binary. The runtime source is at https://github.com/devgianlu/go-librespot/tree/v0.10.3. No player binary, Spotify credential, access token or private API key is distributed in the plugin ZIP. The QR decoder jsQR is a development test dependency and is not bundled.
