"""Fetch the official x86_64 librespot archive directly on the user's Deck."""
import asyncio
import errno
import hashlib
import os
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
import platform
import shutil
import ssl
import tarfile
import tempfile
from .tls import verified_context

OFFICIAL_PAGE = 'https://github.com/devgianlu/go-librespot/releases/tag/v0.10.3'
OFFICIAL_ARCHIVE = 'https://github.com/devgianlu/go-librespot/releases/download/v0.10.3/go-librespot_linux_x86_64.tar.gz'
ARCHIVE_SHA256 = '8006f7f967704955c7e4f5f19bdd3cbf68c14d1ce100d9248a7db28884d61bd4'
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_BINARY = 256 * 1024 * 1024
MAX_NOTICES = 16 * 1024 * 1024


def valid_download_url(url):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in ('github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com') and not parsed.username and not parsed.password


class InstallError(Exception):
    def __init__(self, code, http_status=None):
        self.code = code
        self.http_status = http_status


def failure_fields(error):
    """Stable diagnostics only; never expose exception messages or signed URLs."""
    if isinstance(error, InstallError):
        return {'error': error.code, 'httpStatus': error.http_status}
    if isinstance(error, (ssl.SSLError, ssl.CertificateError)):
        code = 'tlsFailed'
    elif isinstance(error, PermissionError):
        code = 'permissionDenied'
    elif isinstance(error, OSError) and error.errno in (errno.ENOSPC, errno.EDQUOT):
        code = 'storageFull'
    elif isinstance(error, (TimeoutError, asyncio.TimeoutError)):
        code = 'downloadTimeout'
    elif isinstance(error, ImportError):
        code = 'dependencyMissing'
    elif isinstance(error, (tarfile.TarError, EOFError)):
        code = 'invalidArchive'
    else:
        # aiohttp certificate errors wrap ssl errors rather than inherit them.
        try:
            import aiohttp
            code = 'tlsFailed' if isinstance(error, (aiohttp.ClientConnectorCertificateError, aiohttp.ClientSSLError)) else 'downloadFailed'
        except ImportError:
            code = 'downloadFailed'
    return {'error': code, 'httpStatus': None}


def prepare_archive(archive_path, stage):
    """Read selected regular files; never use tar.extract/all or trust archive paths."""
    stage = Path(stage)
    digest = hashlib.sha256()
    with tarfile.open(archive_path, 'r:gz') as archive:
        binary = None
        notices = []
        notice_size = 0
        count = 0
        for member in archive:
            count += 1
            path = PurePosixPath(member.name)
            if count > 4096 or path.is_absolute() or '..' in path.parts or not (member.isdir() or member.isfile()):
                raise InstallError('invalidArchive')
            if member.isfile() and path.name == 'go-librespot':
                if binary is not None or not 64 <= member.size <= MAX_BINARY:
                    raise InstallError('invalidArchive')
                binary = member
            elif member.isfile() and (path.name.lower() == 'readme.md' or any(word in member.name.lower() for word in ('license', 'copying', 'notice'))):
                notice_size += member.size
                if notice_size > MAX_NOTICES:
                    raise InstallError('invalidArchive')
                notices.append(member)
        if binary is None:
            raise InstallError('invalidArchive')
        output = stage / 'go-librespot'
        source = archive.extractfile(binary)
        if source is None:
            raise InstallError('invalidArchive')
        with source, output.open('xb') as target:
            header = source.read(64)
            # ELF64, little endian, x86_64; no executing an unverified archive file.
            if header[:7] != b'\x7fELF\x02\x01\x01' or int.from_bytes(header[18:20], 'little') != 62 or int.from_bytes(header[16:18], 'little') not in (2, 3):
                raise InstallError('invalidArchive')
            target.write(header); digest.update(header)
            copied = len(header)
            while chunk := source.read(65536):
                copied += len(chunk)
                if copied > MAX_BINARY:
                    raise InstallError('invalidArchive')
                target.write(chunk); digest.update(chunk)
            if copied != binary.size:
                raise InstallError('invalidArchive')
            target.flush(); os.fsync(target.fileno())
        output.chmod(0o700)
        # Keep vendor notices locally alongside the downloaded executable.
        for member in notices:
            destination = stage / 'notices' / member.name
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            source = archive.extractfile(member)
            if source is None:
                raise InstallError('invalidArchive')
            with source, destination.open('xb') as target:
                shutil.copyfileobj(source, target, length=65536)
    return digest.hexdigest()


class LibrespotInstaller:
    def __init__(self, root, emit, supported=None):
        self.root = Path(root)
        self.emit = emit
        self.supported = supported if supported is not None else platform.system() == 'Linux' and platform.machine() == 'x86_64'
        self.task = None
        self.lock = asyncio.Lock()
        self.stopped = False
        self.status = self.inspect()

    @property
    def binary(self):
        return self.root / 'bin' / 'go-librespot'

    def inspect(self):
        return {'phase': 'unsupported' if not self.supported else 'installed' if self.binary.is_file() and os.access(self.binary, os.X_OK) else 'missing', 'downloadedBytes': 0, 'totalBytes': None, 'hasInstalled': self.binary.is_file()}

    async def publish(self, phase=None, **fields):
        if phase:
            self.status['phase'] = phase
        self.status.update(fields)
        await self.emit(dict(self.status))

    async def begin(self):
        async with self.lock:
            return await self._begin()

    async def _begin(self):
        if self.stopped or not self.supported:
            return {'ok': False, 'error': 'unsupported'}
        if self.task and not self.task.done():
            return {'ok': True}  # Reopening UI or a second click never starts a duplicate download.
        await self.publish('downloading', downloadedBytes=0, totalBytes=None, error=None, httpStatus=None)
        if self.stopped:
            return {"ok": False, "error": "unavailable"}
        self.task = asyncio.create_task(self.install())
        return {'ok': True}

    async def download(self, destination):
        import aiohttp
        timeout = aiohttp.ClientTimeout(total=300, sock_connect=20, sock_read=30)
        connector = aiohttp.TCPConnector(ssl=verified_context())
        async with aiohttp.ClientSession(timeout=timeout, auto_decompress=False, connector=connector) as session:
            url = OFFICIAL_ARCHIVE
            response = None
            for _ in range(5):
                if not valid_download_url(url):
                    raise InstallError('downloadFailed')
                response = await session.get(url, allow_redirects=False)
                if response.status not in (301, 302, 303, 307, 308):
                    break
                url = response.headers.get('Location', '')
                response.release()
            async with response:
                if response.status != 200:
                    raise InstallError('httpFailed', response.status)
                total = response.content_length
                if total is not None and (total <= 0 or total > MAX_ARCHIVE):
                    raise InstallError('invalidArchive')
                await self.publish(totalBytes=total)
                received = 0
                archive_digest = hashlib.sha256()
                last_publish = 0
                loop = asyncio.get_running_loop()
                with Path(destination).open('xb') as output:
                    async for chunk in response.content.iter_chunked(65536):
                        received += len(chunk)
                        if received > MAX_ARCHIVE:
                            raise InstallError('invalidArchive')
                        output.write(chunk)
                        archive_digest.update(chunk)
                        if loop.time() - last_publish >= .25:
                            await self.publish(downloadedBytes=received)
                            last_publish = loop.time()
                    output.flush(); os.fsync(output.fileno())
                if not received or (total is not None and received != total):
                    raise InstallError('downloadFailed')
                if archive_digest.hexdigest() != ARCHIVE_SHA256:
                    raise InstallError('invalidArchive')
                await self.publish(downloadedBytes=received)

    async def install(self):
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.root.chmod(0o700)
            with tempfile.TemporaryDirectory(prefix='.librespot-install-', dir=self.root) as temporary:
                stage = Path(temporary)
                archive = stage / 'archive.tar.gz'
                await self.download(archive)
                await self.publish('installing')
                # Extraction can take time; keep Decky's RPC/event loop responsive.
                extraction = asyncio.create_task(asyncio.to_thread(prepare_archive, archive, stage))
                try:
                    checksum = await asyncio.shield(extraction)
                except asyncio.CancelledError:
                    # A thread cannot be cancelled; wait before removing its files.
                    await asyncio.gather(extraction, return_exceptions=True)
                    raise
                if self.stopped:
                    return
                destination = self.binary.parent
                destination.mkdir(parents=True, exist_ok=True, mode=0o700)
                (stage / 'notices').mkdir(exist_ok=True)
                shutil.copyfile(Path(__file__).with_name('LICENSE-go-librespot.txt'), stage / 'notices/LICENSE-go-librespot.txt')
                if (stage / 'notices').exists():
                    shutil.copytree(stage / 'notices', destination / 'notices', dirs_exist_ok=True)
                # Only commit after the complete archive and ELF have been checked.
                # Existing playback can continue on its old inode until restarted.
                os.replace(stage / 'go-librespot', self.binary)
                await self.publish('installed', hasInstalled=True, error=None, sha256=checksum)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self.publish('failed', **failure_fields(error), hasInstalled=self.binary.is_file())

    async def close(self):
        self.stopped = True
        if self.task and not self.task.done():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
