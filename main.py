"""Decky entry point: managed librespot, phone QR pairing, local controls."""
from pathlib import Path
import decky
from decky_spotify.installer import LibrespotInstaller
from decky_spotify.librespot import LibrespotRuntime, PlaylistListingError, initial_state


class Plugin:
    async def _main(self):
        root = Path(decky.DECKY_USER_HOME) / '.local/share/decky-spotify'
        self.installer = LibrespotInstaller(root, self._runtime_changed)
        self.runtime = LibrespotRuntime(root, self.installer, self._emit_state)
        self.runtime.state['runtime'] = dict(self.installer.status)
        # Restore a paired player, but first login starts only from Sign in.
        if self.installer.supported and self.installer.binary.is_file() and (root / 'librespot/credentials.json').is_file():
            await self.runtime.start()

    async def _emit_state(self, state):
        await decky.emit('player_state', state)

    async def _runtime_changed(self, status):
        await self.runtime.runtime_changed(status)

    async def get_player_state(self):
        runtime = getattr(self, 'runtime', None)
        return runtime.snapshot() if runtime else initial_state()

    async def install_player(self):
        installer = getattr(self, 'installer', None)
        return await installer.begin() if installer else {'ok': False, 'error': 'unavailable'}

    async def begin_authentication(self):
        runtime = getattr(self, 'runtime', None)
        return await runtime.start() if runtime else {'ok': False, 'error': 'unavailable'}

    async def cancel_authentication(self):
        runtime = getattr(self, 'runtime', None)
        return await runtime.cancel_auth() if runtime else {'ok': False, 'error': 'unavailable'}

    async def set_view_activity(self, visible, view):
        runtime = getattr(self, 'runtime', None)
        if runtime:
            await runtime.set_activity(visible is True, view)

    async def player_command(self, command):
        runtime = getattr(self, 'runtime', None)
        return await runtime.command(command) if runtime else {'ok': False, 'error': 'unavailable'}

    async def get_playlists(self):
        return await self.runtime.playlists()

    async def get_playlist_tracks(self, uri, refresh=False):
        try:
            return await self.runtime.playlist_tracks(uri, refresh is True)
        except PlaylistListingError as error:
            return {'error': {'kind': error.kind, 'status': None}}
        except OSError as error:
            status = error.errno
            return {'error': {'kind': 'http' if isinstance(status, int) and 400 <= status <= 599 else 'network', 'status': status if isinstance(status, int) and 400 <= status <= 599 else None}}
        except (ValueError, TypeError):
            return {'error': {'kind': 'invalidResponse', 'status': None}}
        except Exception:
            return {'error': {'kind': 'unavailable', 'status': None}}

    async def refresh_queue(self):
        runtime = getattr(self, 'runtime', None)
        return await runtime.manual_queue_refresh() if runtime else {'ok': False}

    async def set_music_cache(self, enabled, size_mb=None):
        return await self.runtime.set_music_cache(enabled, size_mb)

    async def apply_music_cache(self):
        return await self.runtime.apply_music_cache()

    async def _unload(self):
        installer = getattr(self, 'installer', None)
        if installer:
            await installer.close()
        runtime = getattr(self, 'runtime', None)
        if runtime:
            await runtime.close()

    async def _uninstall(self):
        pass  # Keep user-owned downloads and stored Spotify credentials.
