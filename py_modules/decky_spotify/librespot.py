"""Managed go-librespot runtime and Decky bridge; credentials remain native-side."""
import asyncio
import copy
from datetime import datetime
from email.utils import parsedate_to_datetime
import json
import math
import os
from pathlib import Path
import re
import socket
import time
from urllib.parse import urlparse, parse_qs
from .tls import verified_context
from .playlist_cache import PlaylistCache

SPOTIFY_QUEUE = 'https://api.spotify.com/v1/me/player/queue'
URI = re.compile(r'^spotify:(playlist|track):[A-Za-z0-9]+$')
QUEUE_INTERVAL = 30
QUEUE_MIN_INTERVAL = 30
CACHE_SIZES_MB = tuple(range(100, 1001, 100)) + (1500, 2000)
CACHE_DEFAULT_MB = 1000
PLAYLIST_LIMIT = 500


class PlaylistListingError(OSError):
    def __init__(self, kind):
        super().__init__('unavailable')
        self.kind = kind


def retry_delay(header, failures, now=None):
    """Never shorten Spotify's wait; use exponential backoff without a header."""
    fallback = min(900, 60 * 2 ** min(max(0, failures - 1), 4))
    try:
        seconds = int(header)
        if seconds < 0 or seconds > 10 ** 10:
            raise ValueError('invalid retry delay')
    except (TypeError, ValueError):
        try:
            seconds = parsedate_to_datetime(header).timestamp() - (time.time() if now is None else now)
        except (TypeError, ValueError, OverflowError):
            seconds = fallback
    return max(60, seconds)


def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def initial_state():
    return {'revision': 0, 'status': 'disconnected', 'current': None, 'context': None, 'playing': False,
            'positionMs': 0, 'positionTimestampMs': 0, 'volume': 50, 'shuffle': False, 'repeat': 'off',
            'queue': [], 'queueUnavailable': False, 'libraryVersion': 0, 'availableCommands': [],
            'queueStatus': 'idle', 'queueError': None,
            'diagnostics': [],
            'authentication': {'phase': 'idle'}}


def valid_pairing(data, now=None):
    """Only expose the public Spotify pairing URL/code, never device/access tokens."""
    url, code = data.get('url', ''), data.get('code', '')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('spotify.com', 'www.spotify.com', 'accounts.spotify.com') or parsed.path.rstrip('/') != '/pair' or parsed.username or parsed.password or parsed.port:
        raise ValueError('invalid pairing link')
    if not re.fullmatch(r'[A-Za-z0-9-]{4,16}', code):
        raise ValueError('invalid pairing code')
    query = parse_qs(parsed.query)
    if set(query) - {'code'} or ('code' in query and query['code'] != [code]):
        raise ValueError('invalid pairing link')
    expiry = int(datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00')).timestamp() * 1000)
    if expiry <= (now if now is not None else int(time.time() * 1000)):
        return {'phase': 'expired'}
    return {'phase': 'waiting', 'url': url, 'code': code, 'expiresAt': expiry}


def track(data):
    if not isinstance(data, dict) or not data.get('uri'):
        return None
    return {'id': data['uri'], 'title': data.get('name') or data['uri'], 'artist': ', '.join(data.get('artist_names') or []),
            'album': data.get('album_name') or '', 'durationMs': max(0, int(data.get('duration') or 0)),
            'artwork': data.get('album_cover_url') if str(data.get('album_cover_url') or '').startswith('https://') else None}


def web_track(data):
    if not isinstance(data, dict) or not data.get('uri'):
        return None
    album = data.get('album') or data.get('show') or {}
    artists = data.get('artists') or []
    images = album.get('images') or data.get('images') or []
    return track({'uri': data['uri'], 'name': data.get('name'), 'artist_names': [a.get('name', '') for a in artists],
                  'album_name': album.get('name', ''), 'duration': data.get('duration_ms', 0),
                  'album_cover_url': images[-1].get('url') if images else None})


def merge_status(state, status, now=None):
    now = now if now is not None else int(time.time() * 1000)
    state['status'] = 'ready'
    state['authentication'] = {'phase': 'connected'}
    state['current'] = track(status.get('track'))
    uri = status.get('context_uri')
    state['context'] = {'id': uri, 'title': status['context_name']} if isinstance(uri, str) and uri.startswith('spotify:playlist:') and status.get('context_name') else None
    state['playing'] = bool(state['current']) and not any(status.get(key, False) for key in ('paused', 'stopped', 'buffering'))
    state['positionMs'] = max(0, int((status.get('track') or {}).get('position', 0)))
    state['positionTimestampMs'] = now
    maximum = max(1, status.get('volume_steps') or 100)
    state['volume'] = min(100, max(0, status.get('volume', 0) / maximum * 100))
    state['shuffle'] = bool(status.get('shuffle_context'))
    state['repeat'] = 'track' if status.get('repeat_track') else 'context' if status.get('repeat_context') else 'off'
    actions = ['setVolume', 'playPlaylist']
    if state['current']:
        actions += ['togglePlayback', 'next', 'previous', 'toggleShuffle', 'cycleRepeat']
        if state['current']['durationMs'] > 0:
            actions += ['seek']
    state['availableCommands'] = actions


def command_requests(command, state):
    if not isinstance(command, dict) or command.get('type') not in state['availableCommands'] or state['status'] != 'ready':
        raise ValueError('unavailable')
    kind = command['type']
    if kind in ('setVolume', 'seek'):
        key = 'volume' if kind == 'setVolume' else 'positionMs'
        value = command.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError('invalid value')
        maximum = 100 if kind == 'setVolume' else (state['current'] or {}).get('durationMs', 0)
        return [('/player/volume', {'volume': round(min(maximum, value))})] if kind == 'setVolume' else [('/player/seek', {'position': round(min(maximum, value))})]
    if kind == 'playPlaylist':
        playlist = command.get('playlistId', '')
        selected = command.get('trackId')
        if not URI.fullmatch(playlist) or not playlist.startswith('spotify:playlist:') or (selected is not None and (not URI.fullmatch(selected) or not selected.startswith('spotify:track:'))):
            raise ValueError('invalid URI')
        return [('/player/play', {'uri': playlist, **({'skip_to_uri': selected} if selected else {})})]
    if kind == 'toggleShuffle':
        return [('/player/shuffle_context', {'shuffle_context': not state['shuffle']})]
    if kind == 'cycleRepeat':
        mode = {'off': 'context', 'context': 'track', 'track': 'off'}[state['repeat']]
        return [('/player/repeat_track', {'repeat_track': False}), ('/player/repeat_context', {'repeat_context': mode == 'context'})] if mode != 'track' else [('/player/repeat_context', {'repeat_context': False}), ('/player/repeat_track', {'repeat_track': True})]
    return [({'togglePlayback': '/player/playpause', 'next': '/player/next', 'previous': '/player/prev'}[kind], {})]


class LibrespotRuntime:
    def __init__(self, root, installer, emit):
        self.root = Path(root)
        self.installer = installer
        self.emit = emit
        self.state = initial_state()
        self.process = None
        self.task = None
        self.session = None
        self.port = None
        self.active_view = None
        self.next_queue = 0
        self.queue_token = None
        self.queue_token_until = 0
        self.queue_retry_after = 0
        self.queue_request_after = 0
        self.queue_rate_failures = 0
        self.lock = asyncio.Lock()
        self.queue_lock = asyncio.Lock()
        self.playlist_loads = {}
        self.playlist_cache = PlaylistCache(self.root)
        self.stopped = False
        self.process_generation = 0
        self.stderr_task = None
        self.started_at = time.monotonic()
        self.cache_enabled = True
        self.cache_applied = False
        self.cache_size_mb = CACHE_DEFAULT_MB
        self.cache_size_applied = CACHE_DEFAULT_MB
        try:
            path = self.root / 'settings.json'
            if path.stat().st_size <= 4096:
                settings = json.loads(path.read_text())
                if isinstance(settings.get('musicCacheEnabled'), bool):
                    self.cache_enabled = settings['musicCacheEnabled']
                size = settings.get('musicCacheSizeMB', CACHE_DEFAULT_MB)
                if type(size) is int and size in CACHE_SIZES_MB:
                    self.cache_size_mb = size
        except (OSError, ValueError, TypeError, AttributeError):
            pass
        self.state['musicCache'] = {'enabled': self.cache_enabled, 'limitBytes': self.cache_size_mb * 1000000, 'restartRequired': False}
        self.restore_queue_cooldown()

    async def set_music_cache(self, enabled, size_mb=None):
        if not isinstance(enabled, bool) or (size_mb is not None and (type(size_mb) is not int or size_mb not in CACHE_SIZES_MB)):
            return {'ok': False}
        async with self.lock:
            try:
                self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
                self.root.chmod(0o700)
                path = self.root / 'settings.json'
                temporary = path.with_suffix('.tmp')
                size = self.cache_size_mb if size_mb is None else size_mb
                temporary.write_text(json.dumps({'musicCacheEnabled': enabled, 'musicCacheSizeMB': size}))
                temporary.chmod(0o600)
                os.replace(temporary, path)
            except OSError:
                return {'ok': False}
            self.cache_enabled = enabled
            self.cache_size_mb = size
            active = self.process is not None and self.process.returncode is None
            self.state['musicCache'] = {'enabled': enabled, 'limitBytes': self.cache_size_mb * 1000000, 'restartRequired': active and (enabled != self.cache_applied or (enabled and size != self.cache_size_applied))}
            await self.publish()
            return {'ok': True}

    async def apply_music_cache(self):
        async with self.lock:
            if self.state['authentication']['phase'] in ('starting', 'waiting'):
                return {'ok': False}
            await self.stop_process()
            return await self._start()

    def restore_queue_cooldown(self):
        try:
            path = self.root / 'queue-cooldown.json'
            if path.stat().st_size > 4096:
                return
            data = json.loads(path.read_text())
            deadline = data['retryUntil']
            if not isinstance(deadline, (int, float)) or not math.isfinite(deadline) or deadline <= time.time() * 1000 or deadline > (time.time() + 10 ** 10) * 1000:
                return
            self.queue_retry_after = time.monotonic() + (deadline / 1000 - time.time())
            self.queue_rate_failures = min(16, max(1, int(data.get('failures', 1))))
            self.state.update(queueRetryAt=deadline, queueStatus='error', queueUnavailable=True, queueError={'kind': 'http', 'status': 429})
        except (OSError, ValueError, TypeError, KeyError):
            pass

    def save_queue_cooldown(self, delay):
        deadline = round((time.time() + delay) * 1000)
        self.state['queueRetryAt'] = deadline
        try:
            path = self.root / 'queue-cooldown.json'
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps({'retryUntil': deadline, 'failures': self.queue_rate_failures}))
            temporary.chmod(0o600)
            os.replace(temporary, path)
        except OSError:
            pass  # In-memory backoff still applies if storage is unavailable.

    def log(self, code, value=None):
        entries = self.state['diagnostics']
        if entries and entries[-1]['code'] == code and entries[-1].get('value') == value:
            return
        entries.append({'code': code, 'elapsedMs': round((time.monotonic() - self.started_at) * 1000), **({'value': value} if isinstance(value, int) else {})})
        del entries[:-24]

    async def read_stderr(self, stream):
        # Classify bounded chunks in memory. Raw native logs can contain tokens;
        # only fixed diagnostic codes reach React, never the original text.
        pending = b''
        while chunk := await stream.read(4096):
            pending = (pending + chunk)[-8192:]
            text = pending.decode('utf-8', errors='replace').lower()
            rules = [('failed loading config', 'nativeConfigFailed'), ('already running', 'nativeLockFailed'),
                     ('error while loading shared libraries', 'nativeDependencyFailed'), ('glibc_', 'nativeDependencyFailed'),
                     ('certificate', 'nativeTlsFailed'), ('no such host', 'nativeDnsFailed'),
                     ('failed requesting device code', 'nativeDeviceCodeFailed'), ('failed obtaining client token', 'nativeClientTokenFailed'),
                     ('failed getting', 'nativeNetworkFailed'), ('failed initializing zeroconf', 'nativeDiscoveryFailed'),
                     ('failed exchanging device code', 'nativeAuthenticationFailed'), ('pulseaudio', 'nativeAudioFailed')]
            matched = next((code for needle, code in rules if needle in text), 'nativeError')
            value = None
            if 'failed resolving context for listing' in text or 'failed enumerating context' in text:
                matched = 'nativePlaylistFailed'
                status_match = re.search(r'invalid status code from playlist: (\d{3})\b', text)
                value = int(status_match.group(1)) if status_match else None
                if 'context deadline exceeded' in text:
                    matched = 'nativePlaylistTimeout'
            self.log(matched, value)
            await self.publish()
            if b'\n' in pending:
                pending = pending.rsplit(b'\n', 1)[-1]

    def snapshot(self):
        return copy.deepcopy(self.state)

    async def publish(self):
        self.state['revision'] += 1
        await self.emit(self.snapshot())

    async def runtime_changed(self, runtime):
        self.state['runtime'] = runtime
        await self.publish()

    async def set_activity(self, visible, view):
        self.active_view = view if visible and view in ('player', 'queue') else None
        if (self.state.get('queueError') or {}).get('status') != 429:
            self.next_queue = 0

    async def start(self):
        async with self.lock:
            return await self._start()

    async def _start(self):
        if self.stopped or not self.installer.supported or not self.installer.binary.is_file():
            return {'ok': False, 'error': 'unavailable'}
        if self.process and self.process.returncode is None:
            if self.state['authentication']['phase'] in ('expired', 'failed'):
                await self.stop_process()
            else:
                return {'ok': True}
        if self.task:
            self.task.cancel(); await asyncio.gather(self.task, return_exceptions=True)
        if self.stderr_task:
            self.stderr_task.cancel(); await asyncio.gather(self.stderr_task, return_exceptions=True); self.stderr_task = None
        config_dir = self.root / 'librespot'
        config_dir.mkdir(parents=True, exist_ok=True, mode=0o700); config_dir.chmod(0o700)
        self.port = available_port()
        if self.state['authentication']['phase'] == 'failed':
            cached = config_dir / 'credentials.json'
            if cached.exists():
                os.replace(cached, config_dir / 'credentials.previous.json')
        config = {'device_name': 'Steam Deck', 'device_type': 'computer', 'audio_backend': 'pulseaudio',
                  'audio_backend_runtime_socket': f'unix:/run/user/{os.getuid()}/pulse/native',
                  'mixer_device': '', 'external_volume': False, 'volume_steps': 100, 'initial_volume': 50,
                  'server': {'enabled': True, 'address': '127.0.0.1', 'port': self.port, 'allow_origin': ''},
                  'credentials': {'type': 'device_auth'}, 'zeroconf_enabled': False, 'mpris_enabled': False,
                  'prefer_firewall_friendly_ports': True,
                  'log_level': 'error', 'cache': {'enabled': self.cache_enabled, 'dir': str(self.root / 'audio-cache'), 'size_limit': f'{self.cache_size_mb * 1000000}B'},
                  'metadata': {'enabled': True, 'context_sweep': False, 'max_tracks': PLAYLIST_LIMIT}}
        if self.cache_enabled:
            cache_dir = self.root / 'audio-cache'
            cache_dir.mkdir(mode=0o700, exist_ok=True); cache_dir.chmod(0o700)
        self.cache_applied = self.cache_enabled
        self.cache_size_applied = self.cache_size_mb
        self.state['musicCache']['restartRequired'] = False
        path = config_dir / 'config.yml'
        path.write_text(json.dumps(config)); path.chmod(0o600)
        self.state['authentication'] = {'phase': 'starting'}
        self.started_at = time.monotonic()
        self.state['diagnostics'] = []
        self.log('starting')
        self.state['status'] = 'loading'
        await self.publish()
        try:
            env = os.environ.copy()
            # Frozen Decky library paths belong to Python, not the native
            # player's system audio libraries. Restore the pre-freeze path.
            if 'LD_LIBRARY_PATH_ORIG' in env:
                env['LD_LIBRARY_PATH'] = env['LD_LIBRARY_PATH_ORIG']
            else:
                env.pop('LD_LIBRARY_PATH', None)
            self.process = await asyncio.create_subprocess_exec(str(self.installer.binary), '--config_dir', str(config_dir),
                                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE, env=env)
            self.log('spawned')
            if self.process.stderr:
                self.stderr_task = asyncio.create_task(self.read_stderr(self.process.stderr))
        except OSError as error:
            self.log('spawnFailed', error.errno)
            self.state['authentication'] = {'phase': 'failed', 'error': 'startupFailed'}; self.state['status'] = 'disconnected'
            await self.publish(); return {'ok': False, 'error': 'actionFailed'}
        pidfile = self.root / 'librespot.pid'
        pidfile.write_text(str(self.process.pid)); pidfile.chmod(0o600)
        self.process_generation += 1
        self.task = asyncio.create_task(self.run(self.process_generation))
        return {'ok': True}

    async def cancel_auth(self):
        if self.state['authentication']['phase'] == 'connected':
            return {'ok': False, 'error': 'unavailable'}
        await self.stop_process()
        self.state['authentication'] = {'phase': 'idle'}
        self.state['status'] = 'disconnected'
        await self.publish()
        return {'ok': True}

    async def request(self, method, path, body=None, params=None):
        if self.session is None or self.port is None:
            raise OSError('unavailable')
        async with self.session.request(method, f'http://127.0.0.1:{self.port}{path}', json=body, params=params) as response:
            if response.status == 204:
                return None
            if response.status != 200:
                raise OSError(response.status, 'unavailable')
            maximum = 2 * 1024 * 1024
            raw = await response.content.read(maximum + 1)
            if len(raw) > maximum:
                raise ValueError('response too large')
            return json.loads(raw) if raw.strip() else {}

    async def refresh_status(self):
        if self.state['authentication']['phase'] != 'connected':
            # This endpoint bypasses the player's session request channel.
            # Never park /status ahead of a pending device authorization.
            self.log('readingCode')
            pairing = await self.request('GET', '/auth/code')
            if pairing:
                try:
                    self.state['authentication'] = valid_pairing(pairing)
                except (ValueError, KeyError, TypeError):
                    self.log('invalidCode')
                    raise
                self.log('codeReceived')
                self.state['status'] = 'disconnected'
                await self.publish()
                return
            self.log('codePending')
        data = await self.request('GET', '/status')
        if data is not None:
            merge_status(self.state, data)
            self.log('connected')
        else:
            if self.state['authentication']['phase'] == 'waiting' and self.state['authentication'].get('expiresAt', 0) <= time.time() * 1000:
                self.state['authentication'] = {'phase': 'expired'}
            self.state['status'] = 'disconnected'
            self.state['current'] = None; self.state['queue'] = []; self.state['availableCommands'] = []
        await self.publish()

    async def refresh_queue(self):
        async with self.queue_lock:
            earliest = max(self.queue_retry_after, self.queue_request_after)
            if time.monotonic() < earliest:
                self.next_queue = max(self.next_queue, earliest)
                return
            self.queue_request_after = time.monotonic() + QUEUE_MIN_INTERVAL
            await self._refresh_queue()

    async def manual_queue_refresh(self):
        if self.session is None or self.state['authentication']['phase'] != 'connected':
            return {'ok': False}
        await self.refresh_status()
        if not self.state['current']:
            self.state.update(queueStatus='error', queueUnavailable=True, queueError={'kind': 'inactive'})
            await self.publish()
            return {'ok': True}
        await self.refresh_queue()
        return {'ok': True}

    async def _refresh_queue(self):
        import aiohttp
        self.next_queue = time.monotonic() + QUEUE_INTERVAL
        self.state.update(queueStatus='loading', queueError=None)
        await self.publish()
        failure = {'kind': 'network'}
        try:
            if self.queue_token is None or time.monotonic() >= self.queue_token_until:
                failure = {'kind': 'token'}
                token = await self.request('POST', '/token')
                if not token or not isinstance(token.get('token'), str):
                    failure = {'kind': 'token'}
                    raise ValueError('unavailable')
                self.queue_token = token['token']
                self.queue_token_until = time.monotonic() + 300
            failure = {'kind': 'network'}
            async with self.session.get(SPOTIFY_QUEUE, headers={'Authorization': 'Bearer ' + self.queue_token}, allow_redirects=False) as response:
                if response.status == 429:
                    self.queue_rate_failures += 1
                    retry = retry_delay(response.headers.get('Retry-After'), self.queue_rate_failures)
                    failure = {'kind': 'http', 'status': 429}
                    self.next_queue = time.monotonic() + retry
                    self.queue_retry_after = self.next_queue
                    self.save_queue_cooldown(retry)
                    raise ValueError('rate limited')
                if response.status == 401:
                    self.queue_token = None
                if response.status != 200:
                    failure = {'kind': 'http', 'status': response.status}
                    raise ValueError('unavailable')
                raw = await response.content.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise ValueError('response too large')
                data = json.loads(raw)
            current = (data.get('currently_playing') or {}).get('uri')
            if self.state['current'] and current != self.state['current']['id']:
                failure = {'kind': 'differentDevice'}
                raise ValueError('queue belongs to another device')
            counts, entries = {}, []
            for item in data.get('queue', [])[:80]:
                mapped = web_track(item)
                if mapped:
                    occurrence = counts.get(mapped['id'], 0); counts[mapped['id']] = occurrence + 1
                    entries.append({'id': json.dumps([mapped['id'], occurrence]), 'track': mapped})
            self.state['queue'] = entries
            self.state['queueUnavailable'] = False
            self.state.update(queueStatus='ready', queueError=None)
            self.queue_rate_failures = 0
            self.queue_retry_after = 0
            self.state['queueRetryAt'] = None
            try:
                (self.root / 'queue-cooldown.json').unlink(missing_ok=True)
            except OSError:
                pass
        except (OSError, ValueError, KeyError, TypeError, aiohttp.ClientError, asyncio.TimeoutError):
            self.state['queueUnavailable'] = True
            self.state.update(queueStatus='error', queueError=failure)
            self.next_queue = max(self.next_queue, time.monotonic() + 15)
        await self.publish()

    async def run(self, generation):
        try:
            await self.watch_api(generation)
        except asyncio.CancelledError:
            raise
        except Exception:
            self.log('bridgeFailed')
            self.state['authentication'] = {'phase': 'failed', 'error': 'startupFailed'}
            self.state['status'] = 'disconnected'
            await self.publish()

    async def watch_api(self, generation):
        import aiohttp
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10), connector=aiohttp.TCPConnector(ssl=verified_context())) as session:
            self.session = session
            try:
                while not self.stopped and generation == self.process_generation and self.process.returncode is None:
                    if self.state['authentication']['phase'] == 'starting' and time.monotonic() - self.started_at >= 90:
                        self.log('startupTimeout')
                        self.process.terminate()
                        try:
                            await asyncio.wait_for(self.process.wait(), 5)
                        except asyncio.TimeoutError:
                            self.process.kill(); await self.process.wait()
                        break
                    try:
                        await self.refresh_status()
                        if self.state['authentication']['phase'] != 'connected':
                            await asyncio.sleep(2); continue
                        async with session.ws_connect(f'http://127.0.0.1:{self.port}/events', heartbeat=30, max_msg_size=2 * 1024 * 1024) as ws:
                            while self.process.returncode is None:
                                if self.active_view and time.monotonic() >= self.next_queue and self.state['current']:
                                    await self.refresh_queue()
                                try:
                                    message = await asyncio.wait_for(ws.receive(), 2)
                                except asyncio.TimeoutError:
                                    continue
                                if message.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.ERROR):
                                    break
                                if message.type == aiohttp.WSMsgType.TEXT:
                                    event = json.loads(message.data)
                                    if event.get('type') == 'inactive':
                                        self.state['queue'] = []; self.state['current'] = None; self.state['playing'] = False
                                    await self.refresh_status()
                                    if event.get('type') in ('metadata', 'playing', 'stopped'):
                                        self.next_queue = 0
                    except (OSError, ValueError, TypeError, aiohttp.ClientError, asyncio.TimeoutError) as error:
                        self.log('apiTimeout' if isinstance(error, asyncio.TimeoutError) else 'apiUnavailable')
                        await self.publish()
                        if self.state['current']:
                            self.state['status'] = 'offline'; self.state['availableCommands'] = []
                            await self.publish()
                        await asyncio.sleep(2)
                if not self.stopped and generation == self.process_generation:
                    self.log('exited', self.process.returncode)
                    phase = self.state['authentication']['phase']
                    expired = phase == 'waiting' and self.state['authentication'].get('expiresAt', 0) <= time.time() * 1000
                    self.state['authentication'] = {'phase': 'expired'} if expired else {'phase': 'failed', 'error': 'startupFailed' if phase == 'starting' else 'authenticationFailed'}
                    self.state['status'] = 'offline' if self.state['current'] else 'disconnected'; self.state['availableCommands'] = []
                    await self.publish()
            finally:
                self.session = None

    async def command(self, command):
        async with self.lock:
            try:
                for path, body in command_requests(command, self.state):
                    await self.request('POST', path, body)
                await self.refresh_status()
                self.next_queue = 0
                return {'ok': True}
            except Exception:
                return {'ok': False, 'error': 'actionFailed'}

    async def playlists(self):
        items = []
        for offset in range(0, 1000, 100):
            page = await self.request('GET', '/library/playlists', params={'offset': offset, 'limit': 100})
            if page is None:
                raise OSError('unavailable')
            items += [{'id': p['uri'], 'title': p['name'], 'description': p.get('description', ''), 'trackCount': p.get('length', 0), 'artwork': p.get('image_url')} for p in page.get('items', [])]
            if len(items) >= page.get('total', 0) or not page.get('items'):
                break
        return items

    async def playlist_tracks(self, uri, refresh=False):
        if not isinstance(uri, str) or not URI.fullmatch(uri) or not uri.startswith('spotify:playlist:'):
            raise ValueError('unavailable')
        if not refresh:
            cached_session = self.playlist_cache.session
            cached = await asyncio.to_thread(self.playlist_cache.get, uri)
            if cached is not None and self.playlist_cache.session == cached_session:
                self.log('playlistCacheHit', len(cached))
                await self.publish()
                return cached
        # Reopening or retrying must join the existing fetch instead of
        # creating overlapping enumeration/metadata sweeps for the same list.
        task = self.playlist_loads.get(uri)
        if task is None:
            task = asyncio.create_task(self._playlist_tracks(uri))
            self.playlist_loads[uri] = task
            def finished(completed):
                if self.playlist_loads.get(uri) is completed:
                    self.playlist_loads.pop(uri, None)
                if not completed.cancelled():
                    completed.exception()  # A closed UI may have no waiter left.
            task.add_done_callback(finished)
        session = self.playlist_cache.session
        result = copy.deepcopy(await asyncio.shield(task))
        if self.playlist_cache.session == session:
            await asyncio.to_thread(self.playlist_cache.put, uri, result, session)
        return result

    async def _playlist_tracks(self, uri):
        async def read_listing():
            for attempt in range(3):
                try:
                    return await self.request('GET', '/context/tracks', params={'uri': uri})
                except (OSError, asyncio.TimeoutError) as error:
                    status = getattr(error, 'errno', None)
                    # Retry short-lived transport and server failures. Access
                    # rejection and rate limits need their own resolution.
                    transient = status is None or not 400 <= status <= 599 or status in (408, 500, 502, 503, 504)
                    if not transient or attempt == 2:
                        self.log('playlistRequestFailed', status)
                        await self.publish()
                        if status is None or not 400 <= status <= 599:
                            raise PlaylistListingError('network') from None
                        raise
                    self.log('playlistRetrying', attempt + 1)
                    await self.publish()
                    await asyncio.sleep(2 ** attempt)

        self.log('playlistEnumerating')
        await self.publish()
        listing = None
        try:
            # Upstream gives enumeration up to two minutes. The old combined
            # 15-second enumeration/metadata wait rejected slow, long playlists.
            async with asyncio.timeout(120):
                for _ in range(60):
                    data = await read_listing()
                    if data and data.get('ready'):
                        listing = data
                        break
                    await asyncio.sleep(2)
        except asyncio.TimeoutError:
            self.log('playlistEnumerationTimeout')
            await self.publish()
            raise PlaylistListingError('enumerationTimeout') from None
        if listing is None:
            self.log('playlistEnumerationTimeout')
            await self.publish()
            raise PlaylistListingError('enumerationTimeout')
        self.log('playlistListingReady', min(listing.get('length', 0), PLAYLIST_LIMIT))
        await self.publish()
        # Allow a separate, short metadata fill; unresolved entries stay usable.
        try:
            async with asyncio.timeout(15):
                for _ in range(29):
                    if listing.get('cached', 0) >= min(listing.get('length', 0), PLAYLIST_LIMIT):
                        break
                    await asyncio.sleep(.5)
                    data = await read_listing()
                    if data and data.get('ready'):
                        listing = data
        except (OSError, asyncio.TimeoutError):
            # An already-enumerated list remains usable if filling metadata
            # fails. Keep the known names and unresolved URI placeholders.
            pass
        # Metadata is best effort upstream. A missing entry must not hide the
        # entire playlist or change its order; its URI is still playable.
        items = []
        for item in listing.get('tracks', [])[:PLAYLIST_LIMIT]:
            mapped = track(item.get('track'))
            if mapped is None:
                item_uri = item.get('uri', '')
                if not isinstance(item_uri, str) or not URI.fullmatch(item_uri) or not item_uri.startswith('spotify:track:'):
                    continue
                mapped = {'id': item_uri, 'title': '', 'artist': '', 'album': '', 'durationMs': 0, 'metadataPending': True}
            items.append(mapped)
        pending = sum(item.get('metadataPending', False) for item in items)
        if pending:
            self.log('playlistMetadataPending', pending)
            await self.publish()
        return items

    async def stop_process(self):
        self.process_generation += 1
        self.playlist_cache.reset()
        loads = list(self.playlist_loads.values())
        self.playlist_loads.clear()
        for load in loads:
            load.cancel()
        await asyncio.gather(*loads, return_exceptions=True)
        self.queue_token = None
        self.queue_token_until = 0
        if self.task:
            self.task.cancel(); await asyncio.gather(self.task, return_exceptions=True); self.task = None
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 5)
            except asyncio.TimeoutError:
                self.process.kill(); await self.process.wait()
        self.process = None
        if self.stderr_task:
            self.stderr_task.cancel(); await asyncio.gather(self.stderr_task, return_exceptions=True); self.stderr_task = None
        (self.root / 'librespot.pid').unlink(missing_ok=True)

    async def close(self):
        self.stopped = True
        await self.stop_process()
