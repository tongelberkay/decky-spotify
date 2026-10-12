import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'py_modules'))
from decky_spotify.installer import LibrespotInstaller, valid_download_url
from decky_spotify.librespot import LibrespotRuntime, initial_state, valid_pairing, merge_status, command_requests, web_track, retry_delay


def status():
    return {'username': 'private user', 'track': {'uri': 'spotify:track:one', 'name': 'Song', 'artist_names': ['Artist'], 'album_name': 'Album', 'duration': 200000, 'position': 10000}, 'context_uri': 'spotify:playlist:mix', 'context_name': 'My Mix', 'volume': 32768, 'volume_steps': 65535, 'paused': False, 'stopped': False, 'buffering': False, 'repeat_context': False, 'repeat_track': False, 'shuffle_context': False}


class ProtocolTests(unittest.TestCase):
    def test_retry_delay_honors_long_server_waits_and_backs_off_without_a_header(self):
        self.assertEqual(retry_delay('86400', 1), 86400)
        self.assertEqual(retry_delay(None, 1), 60)
        self.assertEqual(retry_delay('invalid', 2), 120)
        self.assertEqual(retry_delay(None, 20), 900)
        self.assertEqual(retry_delay('0', 1), 60)

    def test_pairing_exposes_only_public_code_url_expiry_and_rejects_unsafe_links(self):
        data = {'url': 'https://spotify.com/pair?code=ABCDEF', 'code': 'ABCDEF', 'expires_at': '2030-01-01T00:00:00Z', 'device_code': 'secret', 'access_token': 'secret'}
        result = valid_pairing(data, now=0)
        self.assertEqual(set(result), {'phase', 'url', 'code', 'expiresAt'})
        self.assertEqual(result['phase'], 'waiting')
        self.assertEqual(valid_pairing(data, now=2000000000000), {'phase': 'expired'})
        for url in ('http://spotify.com/pair', 'https://evil.example/pair', 'https://spotify.com/pair?code=WRONG', 'https://spotify.com/pair?token=secret', 'https://user:pass@spotify.com/pair', 'https://spotify.com:443/pair'):
            with self.assertRaises(ValueError):
                valid_pairing({**data, 'url': url}, now=0)

    def test_normalizes_native_status_volume_and_selected_playlist_track(self):
        state = initial_state(); merge_status(state, status(), now=1000)
        self.assertEqual(state['authentication'], {'phase': 'connected'})
        self.assertEqual(state['current']['artist'], 'Artist')
        self.assertAlmostEqual(state['volume'], 50, delta=.01)
        self.assertEqual(state['positionTimestampMs'], 1000)
        self.assertNotIn('private user', json.dumps(state))
        self.assertEqual(command_requests({'type': 'playPlaylist', 'playlistId': 'spotify:playlist:mix', 'trackId': 'spotify:track:one'}, state), [('/player/play', {'uri': 'spotify:playlist:mix', 'skip_to_uri': 'spotify:track:one'})])

    def test_restricted_commands_and_uri_inputs_are_rejected(self):
        state = initial_state(); merge_status(state, status())
        for kind in ('activate', 'download', 'add_to_queue', 'systemVolume', 'arbitrary'):
            with self.assertRaises(ValueError):
                command_requests({'type': kind}, state)
        for value in (float('nan'), True, -1, '50'):
            with self.assertRaises(ValueError):
                command_requests({'type': 'setVolume', 'volume': value}, state)
        self.assertEqual(command_requests({'type': 'setVolume', 'volume': 300}, state), [('/player/volume', {'volume': 100})])
        self.assertEqual(command_requests({'type': 'seek', 'positionMs': 300000}, state), [('/player/seek', {'position': 200000})])
        with self.assertRaises(ValueError):
            command_requests({'type': 'playPlaylist', 'playlistId': 'http://evil.example'}, state)

    def test_repeat_flags_and_metadata_fallback(self):
        state = initial_state(); merge_status(state, status())
        self.assertEqual(command_requests({'type': 'cycleRepeat'}, state), [('/player/repeat_track', {'repeat_track': False}), ('/player/repeat_context', {'repeat_context': True})])
        state['repeat'] = 'context'
        self.assertEqual(command_requests({'type': 'cycleRepeat'}, state)[-1], ('/player/repeat_track', {'repeat_track': True}))
        item = web_track({'uri': 'spotify:track:a', 'name': 'Name', 'artists': [{'name': 'Artist'}], 'duration_ms': 123})
        self.assertEqual(item['title'], 'Name'); self.assertIsNone(item['artwork'])

    def test_downloader_only_accepts_trusted_https_release_hosts(self):
        self.assertTrue(valid_download_url('https://github.com/devgianlu/go-librespot/releases/download/v0.10.3/file'))
        self.assertTrue(valid_download_url('https://release-assets.githubusercontent.com/file'))
        for url in ('http://github.com/file', 'https://github.com.evil.example/file', 'https://user:pass@github.com/file', 'file:///bin/thing'):
            self.assertFalse(valid_download_url(url))


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.emit = AsyncMock()
        self.installer = LibrespotInstaller(self.directory.name, self.emit, supported=True)
        self.runtime = LibrespotRuntime(self.directory.name, self.installer, self.emit)

    async def asyncTearDown(self):
        await self.runtime.close(); self.directory.cleanup()

    async def test_missing_runtime_does_not_spawn_or_ask_for_login(self):
        self.assertFalse((await self.runtime.start())['ok'])
        self.assertIsNone(self.runtime.process)

    async def test_spawn_has_device_auth_loopback_and_independent_volume_config(self):
        self.installer.binary.parent.mkdir(); self.installer.binary.write_bytes(b'fixture')
        process = AsyncMock(); process.returncode = None; process.pid = 4321; process.stderr = None
        process.terminate = lambda: setattr(process, 'returncode', 0)
        with patch('decky_spotify.librespot.asyncio.create_subprocess_exec', AsyncMock(return_value=process)) as spawn, patch.object(self.runtime, 'run', AsyncMock()), patch('decky_spotify.librespot.available_port', return_value=43210):
            self.assertTrue((await self.runtime.start())['ok'])
            self.assertEqual(spawn.call_args.args, (str(self.installer.binary), '--config_dir', str(Path(self.directory.name, 'librespot'))))
            await asyncio.sleep(0)
            config = json.loads(Path(self.directory.name, 'librespot/config.yml').read_text())
            self.assertEqual(config['credentials']['type'], 'device_auth')
            self.assertEqual(config['server']['address'], '127.0.0.1')
            self.assertEqual(config['mixer_device'], '')
            self.assertFalse(config['external_volume'])
            self.assertTrue(config['cache']['enabled'])
            self.assertFalse(config['zeroconf_enabled'])
            self.assertEqual(config['metadata']['max_tracks'], 500)
            self.assertNotIn('api-key', str(spawn.call_args))

    async def test_music_cache_is_persisted_bounded_and_applied_only_on_explicit_restart(self):
        self.installer.binary.parent.mkdir(); self.installer.binary.write_bytes(b'fixture')
        process = AsyncMock(); process.returncode = None; process.pid = 4321; process.stderr = None
        process.terminate = lambda: setattr(process, 'returncode', 0)
        new_process = AsyncMock(); new_process.returncode = None; new_process.pid = 4322; new_process.stderr = None
        new_process.terminate = lambda: setattr(new_process, 'returncode', 0)
        with patch('decky_spotify.librespot.asyncio.create_subprocess_exec', AsyncMock(side_effect=[process, new_process])) as spawn, patch.object(self.runtime, 'run', AsyncMock()), patch('decky_spotify.librespot.available_port', return_value=43210):
            await self.runtime.start()
            self.runtime.state['authentication'] = {'phase': 'connected'}
            self.assertTrue((await self.runtime.set_music_cache(True, 1500))['ok'])
            self.assertTrue(self.runtime.state['musicCache']['restartRequired'])
            self.assertEqual(spawn.await_count, 1)
            restored = LibrespotRuntime(self.directory.name, self.installer, self.emit)
            self.assertTrue(restored.state['musicCache']['enabled'])
            self.assertEqual(restored.state['musicCache']['limitBytes'], 1500000000)
            self.assertEqual(Path(self.directory.name, 'settings.json').stat().st_mode & 0o777, 0o600)
            credentials = Path(self.directory.name, 'librespot/credentials.json'); credentials.write_text('private fixture')
            self.assertTrue((await self.runtime.apply_music_cache())['ok'])
            self.assertEqual(spawn.await_count, 2)
            config = json.loads(Path(self.directory.name, 'librespot/config.yml').read_text())
            self.assertEqual(config['cache'], {'enabled': True, 'dir': str(Path(self.directory.name, 'audio-cache')), 'size_limit': '1500000000B'})
            self.assertEqual(credentials.read_text(), 'private fixture')
            cache = Path(self.directory.name, 'audio-cache'); (cache / 'encrypted-fixture').write_bytes(b'fixture')
            self.assertTrue((await self.runtime.set_music_cache(False))['ok'])
            self.assertTrue((cache / 'encrypted-fixture').exists())
            self.assertFalse((await self.runtime.set_music_cache('true'))['ok'])

    async def test_cache_sizes_are_validated_and_explicit_off_survives_reload(self):
        self.assertTrue(self.runtime.state['musicCache']['enabled'])
        self.assertEqual(self.runtime.state['musicCache']['limitBytes'], 1000000000)
        for size in [100, 200, 900, 1000, 1500, 2000]:
            self.assertTrue((await self.runtime.set_music_cache(False, size))['ok'])
            self.assertEqual(self.runtime.state['musicCache']['limitBytes'], size * 1000000)
        for invalid in [0, 150, 2500, 4000, True, 100.0, '100']:
            self.assertFalse((await self.runtime.set_music_cache(True, invalid))['ok'])
        restored = LibrespotRuntime(self.directory.name, self.installer, self.emit)
        self.assertFalse(restored.state['musicCache']['enabled'])
        self.assertEqual(restored.state['musicCache']['limitBytes'], 2000000000)
        await restored.close()


    async def test_pairing_cancellation_does_not_delete_cached_credentials(self):
        cached = Path(self.directory.name, 'librespot'); cached.mkdir()
        (cached / 'credentials.json').write_text('{"private":"stored"}')
        self.runtime.state['authentication'] = {'phase': 'waiting'}
        self.assertTrue((await self.runtime.cancel_auth())['ok'])
        self.assertTrue((cached / 'credentials.json').exists())
        self.runtime.state['authentication'] = {'phase': 'connected'}
        self.assertFalse((await self.runtime.cancel_auth())['ok'])

    async def test_new_sign_in_after_cached_login_failure_keeps_a_recoverable_copy(self):
        self.installer.binary.parent.mkdir(); self.installer.binary.write_bytes(b'fixture')
        directory = Path(self.directory.name, 'librespot'); directory.mkdir()
        (directory / 'credentials.json').write_text('{"private":"old"}')
        self.runtime.state['authentication'] = {'phase': 'failed'}
        process = AsyncMock(); process.returncode = None; process.pid = 4321; process.stderr = None
        process.terminate = lambda: setattr(process, 'returncode', 0)
        with patch('decky_spotify.librespot.asyncio.create_subprocess_exec', AsyncMock(return_value=process)), patch.object(self.runtime, 'run', AsyncMock()), patch('decky_spotify.librespot.available_port', return_value=43210):
            self.assertTrue((await self.runtime.start())['ok'])
            self.assertFalse((directory / 'credentials.json').exists())
            self.assertEqual((directory / 'credentials.previous.json').read_text(), '{"private":"old"}')
            self.assertEqual(self.runtime.state['authentication']['phase'], 'starting')

    async def test_activity_polling_is_scoped_and_state_snapshots_are_isolated(self):
        await self.runtime.set_activity(True, 'queue'); self.assertEqual(self.runtime.active_view, 'queue')
        await self.runtime.set_activity(True, 'playlists'); self.assertIsNone(self.runtime.active_view)
        await self.runtime.set_activity(False, 'queue'); self.assertIsNone(self.runtime.active_view)
        snapshot = self.runtime.snapshot(); snapshot['authentication']['phase'] = 'failed'
        self.assertEqual(self.runtime.state['authentication']['phase'], 'idle')

    async def test_cooldown_is_restored_and_manual_and_event_requests_cannot_bypass_it(self):
        self.runtime.queue_rate_failures = 1
        self.runtime.save_queue_cooldown(86400)
        restored = LibrespotRuntime(self.directory.name, self.installer, self.emit)
        self.assertGreater(restored.queue_retry_after, time.monotonic() + 86390)
        self.assertEqual(restored.state['queueError']['status'], 429)
        restored._refresh_queue = AsyncMock()
        await restored.set_activity(True, 'queue')
        restored.next_queue = 0
        await restored.refresh_queue()
        restored._refresh_queue.assert_not_awaited()
        await restored.close()

    async def test_rapid_refresh_requests_are_coalesced(self):
        self.runtime._refresh_queue = AsyncMock()
        await self.runtime.refresh_queue()
        self.runtime.next_queue = 0
        await self.runtime.refresh_queue()
        self.runtime._refresh_queue.assert_awaited_once()

    async def test_ready_state_and_qr_completion_never_emit_tokens(self):
        code = {'url': 'https://spotify.com/pair?code=ABCDEF', 'code': 'ABCDEF', 'expires_at': '2030-01-01T00:00:00Z'}
        self.runtime.request = AsyncMock(return_value=code)
        await self.runtime.refresh_status(); self.assertEqual(self.runtime.state['authentication']['phase'], 'waiting')
        self.runtime.request.assert_awaited_once_with('GET', '/auth/code')
        self.runtime.request = AsyncMock(side_effect=[None, status()])
        await self.runtime.refresh_status(); self.assertEqual(self.runtime.state['authentication'], {'phase': 'connected'})
        self.assertNotIn('ABCDEF', json.dumps(self.runtime.snapshot()))

    async def test_native_errors_are_classified_without_exposing_tokens_and_logs_are_bounded(self):
        stream = AsyncMock()
        stream.read.side_effect = [b'failed requesting device code: access_token=PRIVATE https://secret.example/token\n', b'']
        await self.runtime.read_stderr(stream)
        self.assertEqual(self.runtime.state['diagnostics'][-1]['code'], 'nativeDeviceCodeFailed')
        self.assertNotIn('PRIVATE', json.dumps(self.runtime.snapshot()))
        self.assertNotIn('secret.example', json.dumps(self.runtime.snapshot()))
        for index in range(100):
            self.runtime.log('exited', index)
        self.assertEqual(len(self.runtime.state['diagnostics']), 24)

    async def test_monitor_failure_is_visible_instead_of_an_infinite_starting_state(self):
        self.runtime.state['authentication'] = {'phase': 'starting'}
        with patch.object(self.runtime, 'watch_api', AsyncMock(side_effect=ImportError('private path'))):
            await self.runtime.run(1)
        self.assertEqual(self.runtime.state['authentication']['phase'], 'failed')
        self.assertEqual(self.runtime.state['diagnostics'][-1]['code'], 'bridgeFailed')

    async def test_native_library_and_playlist_track_selection(self):
        self.runtime.request = AsyncMock(return_value={'total': 1, 'items': [{'uri': 'spotify:playlist:mix', 'name': 'My Mix', 'length': 1}]})
        self.assertEqual((await self.runtime.playlists())[0]['title'], 'My Mix')
        self.runtime.request = AsyncMock(return_value={'ready': True, 'cached': 1, 'length': 1, 'tracks': [{'uri': 'spotify:track:one', 'track': status()['track']}]})
        self.assertEqual((await self.runtime.playlist_tracks('spotify:playlist:mix'))[0]['title'], 'Song')

    async def test_reopening_256_tracks_uses_disk_and_refresh_bypasses_it(self):
        ready = {'ready': True, 'cached': 256, 'length': 256, 'tracks': [{'uri': 'spotify:track:one', 'track': status()['track']}] * 256}
        self.runtime.request = AsyncMock(return_value=ready)
        first = await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.runtime.request = AsyncMock(side_effect=OSError(503, 'private'))
        second = await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.assertEqual(first, second)
        self.assertEqual(len(second), 256)
        self.runtime.request.assert_not_awaited()
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock):
            with self.assertRaises(OSError):
                await self.runtime.playlist_tracks('spotify:playlist:mix', refresh=True)
        self.assertEqual(self.runtime.request.await_count, 3)

    async def test_incomplete_metadata_keeps_track_positions_and_duplicates(self):
        self.runtime.request = AsyncMock(return_value={'ready': True, 'cached': 1, 'length': 3, 'tracks': [
            {'uri': 'spotify:track:missing', 'track': None},
            {'uri': 'spotify:track:one', 'track': status()['track']},
            {'uri': 'spotify:track:missing', 'track': None},
        ]})
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock):
            tracks = await self.runtime.playlist_tracks('spotify:playlist:5Jm63LQHocyXae6iXWR7kq')
        self.assertEqual([item['id'] for item in tracks], ['spotify:track:missing', 'spotify:track:one', 'spotify:track:missing'])
        self.assertTrue(tracks[0]['metadataPending'])
        self.assertEqual(tracks[1]['title'], 'Song')
        self.assertEqual(self.runtime.request.await_count, 30)
        self.assertEqual(self.runtime.state['diagnostics'][-1]['code'], 'playlistMetadataPending')

    async def test_failed_enumeration_is_not_presented_as_an_empty_playlist(self):
        self.runtime.request = AsyncMock(return_value={'ready': False, 'cached': 0, 'length': 0, 'tracks': []})
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock):
            with self.assertRaises(OSError):
                await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.assertEqual(self.runtime.state['diagnostics'][-1]['code'], 'playlistEnumerationTimeout')

    async def test_long_playlist_can_enumerate_after_the_old_fifteen_second_deadline(self):
        pending = {'ready': False, 'cached': 0, 'length': 0, 'tracks': []}
        ready = {'ready': True, 'cached': 1, 'length': 1, 'tracks': [{'uri': 'spotify:track:one', 'track': status()['track']}]}
        self.runtime.request = AsyncMock(side_effect=[pending] * 10 + [ready])
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock) as sleep:
            result = await self.runtime.playlist_tracks('spotify:playlist:1WgWlelTW7cai0RlAUUZsy')
        self.assertEqual(result[0]['title'], 'Song')
        self.assertEqual(sleep.await_count, 10)
        sleep.assert_awaited_with(2)
        self.assertEqual(self.runtime.state['diagnostics'][-1]['code'], 'playlistListingReady')

    async def test_native_playlist_failure_is_classified_without_raw_log_data(self):
        stream = AsyncMock()
        stream.read.side_effect = [b'failed resolving context for listing: spotify:playlist:PRIVATE error="invalid status code from playlist: 403"\n', b'failed enumerating context error="context deadline exceeded"\n', b'']
        await self.runtime.read_stderr(stream)
        entries = self.runtime.state['diagnostics']
        self.assertEqual((entries[-2]['code'], entries[-2]['value']), ('nativePlaylistFailed', 403))
        self.assertEqual(entries[-1]['code'], 'nativePlaylistTimeout')
        self.assertNotIn('PRIVATE', json.dumps(self.runtime.snapshot()))

    async def test_playlist_http_failure_exposes_only_status_in_diagnostics(self):
        self.runtime.request = AsyncMock(side_effect=OSError(403, 'private response'))
        with self.assertRaises(OSError):
            await self.runtime.playlist_tracks('spotify:playlist:mix')
        entry = self.runtime.state['diagnostics'][-1]
        self.assertEqual((entry['code'], entry['value']), ('playlistRequestFailed', 403))
        self.assertNotIn('private response', json.dumps(self.runtime.snapshot()))
        self.assertEqual(self.runtime.request.await_count, 1)

    async def test_transient_playlist_failure_recovers_with_bounded_backoff(self):
        ready = {'ready': True, 'cached': 1, 'length': 1, 'tracks': [{'uri': 'spotify:track:one', 'track': status()['track']}]}
        self.runtime.request = AsyncMock(side_effect=[OSError(503, 'private'), asyncio.TimeoutError(), ready])
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock) as sleep:
            result = await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.assertEqual(result[0]['title'], 'Song')
        self.assertEqual([call.args[0] for call in sleep.await_args_list], [1, 2])
        self.assertEqual(self.runtime.request.await_count, 3)

    async def test_repeated_server_failure_stops_after_three_attempts(self):
        self.runtime.request = AsyncMock(side_effect=OSError(502, 'private'))
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock):
            with self.assertRaises(OSError):
                await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.assertEqual(self.runtime.request.await_count, 3)

    async def test_metadata_request_failure_retains_the_enumerated_list(self):
        listing = {'ready': True, 'cached': 1, 'length': 2, 'tracks': [
            {'uri': 'spotify:track:one', 'track': status()['track']},
            {'uri': 'spotify:track:missing', 'track': None},
        ]}
        self.runtime.request = AsyncMock(side_effect=[listing, OSError(403, 'private')])
        with patch('decky_spotify.librespot.asyncio.sleep', new_callable=AsyncMock):
            result = await self.runtime.playlist_tracks('spotify:playlist:mix')
        self.assertEqual([t['id'] for t in result], ['spotify:track:one', 'spotify:track:missing'])
        self.assertTrue(result[1]['metadataPending'])

    async def test_concurrent_playlist_opens_share_a_fetch_and_isolate_results(self):
        started, release = asyncio.Event(), asyncio.Event()
        async def fetch(*args, **kwargs):
            started.set()
            await release.wait()
            return {'ready': True, 'cached': 1, 'length': 1, 'tracks': [{'uri': 'spotify:track:one', 'track': status()['track']}]}
        self.runtime.request = AsyncMock(side_effect=fetch)
        first = asyncio.create_task(self.runtime.playlist_tracks('spotify:playlist:mix'))
        await started.wait()
        second = asyncio.create_task(self.runtime.playlist_tracks('spotify:playlist:mix'))
        await asyncio.sleep(0)
        release.set()
        results = await asyncio.gather(first, second)
        self.assertEqual(self.runtime.request.await_count, 1)
        results[0][0]['title'] = 'Changed'
        self.assertEqual(results[1][0]['title'], 'Song')
        self.assertFalse(self.runtime.playlist_loads)

    async def test_shutdown_cancels_inflight_playlist_load(self):
        started = asyncio.Event()
        async def fetch(*args, **kwargs):
            started.set()
            await asyncio.Event().wait()
        self.runtime.request = AsyncMock(side_effect=fetch)
        load = asyncio.create_task(self.runtime.playlist_tracks('spotify:playlist:mix'))
        await started.wait()
        await self.runtime.stop_process()
        with self.assertRaises(asyncio.CancelledError):
            await load
        self.assertFalse(self.runtime.playlist_loads)


try:
    import aiohttp
    from aiohttp import web
except ImportError:
    aiohttp = None


@unittest.skipUnless(aiohttp, 'Optional wire tests require aiohttp')
class WireTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_pairing_status_queue_duplicates_commands_and_rate_limit(self):
        ready = False
        throttled = False
        forbidden = False
        queue_requests = 0
        received = []
        async def native_status(_request):
            self.assertTrue(ready, 'Pending pairing must read /auth/code without waiting on /status')
            return web.json_response(status()) if ready else web.Response(status=204)
        async def code(_request):
            return web.Response(status=204) if ready else web.json_response({'url': 'https://spotify.com/pair?code=ABCDEF', 'code': 'ABCDEF', 'expires_at': '2030-01-01T00:00:00Z'})
        async def token(_request):
            return web.json_response({'token': 'fixture-private-token'})
        async def queue(request):
            nonlocal queue_requests
            queue_requests += 1
            self.assertEqual(request.headers['Authorization'], 'Bearer fixture-private-token')
            if throttled:
                return web.Response(status=429, headers={'Retry-After': '120'})
            if forbidden:
                return web.Response(status=403)
            return web.json_response({'currently_playing': {'uri': 'spotify:track:one'}, 'queue': [{'uri': 'spotify:track:a', 'name': 'Duplicate'}] * 2})
        async def control(request):
            received.append((request.path, await request.json())); return web.Response()
        app = web.Application(); app.router.add_get('/status', native_status); app.router.add_get('/auth/code', code); app.router.add_post('/token', token); app.router.add_get('/queue', queue); app.router.add_post('/player/volume', control)
        runner = web.AppRunner(app); await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0); await site.start(); port = site._server.sockets[0].getsockname()[1]
        try:
            with tempfile.TemporaryDirectory() as directory:
                emit = AsyncMock(); installer = LibrespotInstaller(directory, emit, supported=True); runtime = LibrespotRuntime(directory, installer, emit); runtime.port = port
                async with aiohttp.ClientSession() as session:
                    runtime.session = session
                    await runtime.refresh_status(); self.assertEqual(runtime.state['authentication']['phase'], 'waiting')
                    ready = True; await runtime.refresh_status(); self.assertEqual(runtime.state['authentication']['phase'], 'connected')
                    with patch('decky_spotify.librespot.SPOTIFY_QUEUE', f'http://127.0.0.1:{port}/queue'):
                        await runtime.refresh_queue()
                        self.assertEqual(len(runtime.state['queue']), 2)
                        self.assertNotEqual(runtime.state['queue'][0]['id'], runtime.state['queue'][1]['id'])
                        self.assertTrue(all('source' not in entry for entry in runtime.state['queue']))
                        self.assertEqual(runtime.state['queueStatus'], 'ready')
                        forbidden = True
                        runtime.queue_request_after = 0
                        await runtime.manual_queue_refresh()
                        self.assertEqual(runtime.state['queueError'], {'kind': 'http', 'status': 403})
                        self.assertEqual(runtime.state['queueStatus'], 'error')
                        self.assertEqual(len(runtime.state['queue']), 2)
                        forbidden = False
                        runtime.queue_request_after = 0
                        throttled = True; await runtime.refresh_queue()
                        self.assertTrue(runtime.state['queueUnavailable']); self.assertEqual(len(runtime.state['queue']), 2)
                        self.assertGreater(runtime.next_queue, time.monotonic() + 110)
                        count = queue_requests
                        await runtime.set_activity(True, 'queue')
                        await runtime.manual_queue_refresh()
                        self.assertEqual(queue_requests, count)
                    self.assertTrue((await runtime.command({'type': 'setVolume', 'volume': 22}))['ok'])
                    self.assertEqual(received, [('/player/volume', {'volume': 22})])
                    self.assertNotIn('fixture-private-token', json.dumps(runtime.snapshot()))
                    await runtime.close()
        finally:
            await runner.cleanup()
