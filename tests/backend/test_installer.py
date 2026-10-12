import asyncio
import errno
import io
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import ssl
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'py_modules'))
from decky_spotify.installer import InstallError, LibrespotInstaller, prepare_archive, failure_fields
from decky_spotify.tls import verified_context


def elf(machine=62):
    content = bytearray(128)
    content[:7] = b'\x7fELF\x02\x01\x01'
    content[16:18] = (3).to_bytes(2, 'little')
    content[18:20] = machine.to_bytes(2, 'little')
    return bytes(content)


def archive_bytes(entries=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, content, kind in entries or [('build/go-librespot', elf(), tarfile.REGTYPE), ('build/LICENSE.txt', b'vendor notice', tarfile.REGTYPE)]:
            info = tarfile.TarInfo(name); info.type = kind; info.size = len(content) if kind == tarfile.REGTYPE else 0
            info.linkname = '/outside'
            archive.addfile(info, io.BytesIO(content) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class ArchiveTests(unittest.TestCase):
    def test_frozen_runtime_loads_bundled_ca_with_certificate_verification(self):
        with patch.dict(sys.modules, {'certifi': SimpleNamespace(where=lambda: '/bundled/cacert.pem')}), patch('decky_spotify.tls.ssl.create_default_context') as context:
            self.assertIs(verified_context(), context.return_value)
            context.assert_called_once_with(cafile='/bundled/cacert.pem')

    def test_install_failures_are_specific_and_do_not_expose_raw_details(self):
        for error, code in [(ssl.SSLCertVerificationError('private signed URL'), 'tlsFailed'), (PermissionError('private path'), 'permissionDenied'), (OSError(errno.ENOSPC, 'private path'), 'storageFull'), (TimeoutError('private URL'), 'downloadTimeout'), (ImportError('private path'), 'dependencyMissing')]:
            with self.subTest(code=code):
                self.assertEqual(failure_fields(error), {'error': code, 'httpStatus': None})
        self.assertEqual(failure_fields(InstallError('httpFailed', 503)), {'error': 'httpFailed', 'httpStatus': 503})

    def test_valid_linux_binary_and_vendor_notices_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary)
            source = stage / 'archive.tar.gz'; source.write_bytes(archive_bytes())
            checksum = prepare_archive(source, stage)
            self.assertEqual((stage / 'go-librespot').read_bytes(), elf())
            self.assertEqual((stage / 'notices/build/LICENSE.txt').read_text(), 'vendor notice')
            self.assertEqual(len(checksum), 64)
            self.assertEqual((stage / 'go-librespot').stat().st_mode & 0o777, 0o700)

    def test_unsafe_paths_links_devices_duplicate_binaries_and_wrong_architecture_fail(self):
        malicious = [
            [('go-librespot', elf(), tarfile.REGTYPE), ('../../escaped', b'bad', tarfile.REGTYPE)],
            [('/go-librespot', elf(), tarfile.REGTYPE)],
            [('go-librespot', b'', tarfile.SYMTYPE)],
            [('go-librespot', b'', tarfile.LNKTYPE)],
            [('go-librespot', b'', tarfile.CHRTYPE)],
            [('go-librespot', elf(183), tarfile.REGTYPE)],
            [('go-librespot', elf(), tarfile.REGTYPE), ('nested/go-librespot', elf(), tarfile.REGTYPE)],
            [('README', b'No executable', tarfile.REGTYPE)],
        ]
        for entries in malicious:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as temporary:
                stage = Path(temporary); source = stage / 'archive.tar.gz'; source.write_bytes(archive_bytes(entries))
                with self.assertRaises(InstallError):
                    prepare_archive(source, stage)

    def test_declared_sizes_are_bounded_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary); source = stage / 'archive.tar.gz'; source.write_bytes(archive_bytes())
            with patch('decky_spotify.installer.MAX_BINARY', 64), self.assertRaises(InstallError):
                prepare_archive(source, stage)


class InstallerTests(unittest.IsolatedAsyncioTestCase):
    async def test_download_install_update_and_duplicate_requests(self):
        with tempfile.TemporaryDirectory() as temporary:
            events = []; downloads = []
            async def emit(status):
                events.append(status)
            installer = LibrespotInstaller(temporary, emit, supported=True)
            async def download(destination):
                downloads.append(destination)
                await asyncio.sleep(.01)
                destination.write_bytes(archive_bytes())
                await installer.publish(downloadedBytes=123, totalBytes=123)
            installer.download = download
            results = await asyncio.gather(installer.begin(), installer.begin())
            self.assertTrue(all(result['ok'] for result in results))
            await installer.task
            self.assertEqual(len(downloads), 1)
            self.assertEqual(installer.status['phase'], 'installed')
            self.assertEqual(installer.binary.read_bytes(), elf())
            self.assertFalse(list(Path(temporary).glob('.librespot-install-*')))
            self.assertIn('installing', [event['phase'] for event in events])
            self.assertEqual(LibrespotInstaller(temporary, emit, supported=True).status['phase'], 'installed')
            await installer.begin(); await installer.task
            self.assertEqual(len(downloads), 2)
            await installer.close()

    async def test_failed_archive_keeps_existing_executable(self):
        with tempfile.TemporaryDirectory() as temporary:
            async def emit(_status):
                pass
            installer = LibrespotInstaller(temporary, emit, supported=True)
            installer.binary.parent.mkdir(); installer.binary.write_bytes(b'previous working build'); installer.binary.chmod(0o700)
            async def download(destination):
                destination.write_bytes(archive_bytes([('go-librespot', elf(183), tarfile.REGTYPE)]))
            installer.download = download
            await installer.begin(); await installer.task
            self.assertEqual(installer.status['phase'], 'failed')
            self.assertEqual(installer.status['error'], 'invalidArchive')
            self.assertTrue(installer.status['hasInstalled'])
            self.assertEqual(installer.binary.read_bytes(), b'previous working build')
            self.assertFalse(list(Path(temporary).glob('.librespot-install-*')))

    async def test_cancellation_cleans_partial_download_and_unsupported_does_not_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            async def emit(_status):
                pass
            installer = LibrespotInstaller(temporary, emit, supported=True)
            started = asyncio.Event()
            async def download(destination):
                destination.write_bytes(b'partial download'); started.set()
                await asyncio.Event().wait()
            installer.download = download
            await installer.begin(); await started.wait(); await installer.close()
            self.assertFalse(installer.binary.exists())
            self.assertFalse(list(Path(temporary).glob('.librespot-install-*')))
            unsupported = LibrespotInstaller(temporary, emit, supported=False)
            self.assertEqual(await unsupported.begin(), {'ok': False, 'error': 'unsupported'})
            self.assertIsNone(unsupported.task)


try:
    import aiohttp
    from aiohttp import web
except ImportError:
    aiohttp = None


@unittest.skipUnless(aiohttp, 'Optional wire test requires aiohttp')
class DownloadWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_streaming_download_and_http_failure_preserve_installed_binary(self):
        payload = archive_bytes()
        async def serve(_request):
            return web.Response(body=payload, content_type='application/gzip')
        async def fail(_request):
            raise web.HTTPServiceUnavailable()
        app = web.Application(); app.router.add_get('/archive', serve); app.router.add_get('/failure', fail)
        runner = web.AppRunner(app); await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0); await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            with tempfile.TemporaryDirectory() as temporary:
                events = []
                async def emit(status):
                    events.append(status)
                installer = LibrespotInstaller(temporary, emit, supported=True)
                with patch('decky_spotify.installer.OFFICIAL_ARCHIVE', f'http://127.0.0.1:{port}/archive'), patch('decky_spotify.installer.valid_download_url', return_value=True), patch('decky_spotify.installer.ARCHIVE_SHA256', __import__('hashlib').sha256(payload).hexdigest()):
                    await installer.begin(); await installer.task
                self.assertEqual(installer.status['phase'], 'installed')
                self.assertEqual(installer.status['downloadedBytes'], len(payload))
                self.assertEqual(installer.status['totalBytes'], len(payload))
                with patch('decky_spotify.installer.OFFICIAL_ARCHIVE', f'http://127.0.0.1:{port}/failure'), patch('decky_spotify.installer.valid_download_url', return_value=True):
                    await installer.begin(); await installer.task
                self.assertEqual(installer.status['phase'], 'failed')
                self.assertEqual(installer.binary.read_bytes(), elf())
                self.assertFalse(list(Path(temporary).glob('.librespot-install-*')))
                self.assertEqual(installer.status['error'], 'httpFailed')
                self.assertEqual(installer.status['httpStatus'], 503)
                await installer.close()
        finally:
            await runner.cleanup()
