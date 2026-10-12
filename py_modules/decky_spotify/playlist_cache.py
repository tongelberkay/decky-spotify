"""Short-lived playlist metadata on disk; no retained in-memory track lists."""
import hashlib
import json
import os
from pathlib import Path
import time
import threading
import uuid


class PlaylistCache:
    TTL = 300
    ENTRY_LIMIT = 2 * 1024 * 1024
    TOTAL_LIMIT = 4 * 1024 * 1024

    def __init__(self, root):
        self.root = Path(root) / 'playlist-cache'
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        # A new player/auth session never reads a previous account's metadata.
        with self.lock:
            self.session = uuid.uuid4().hex

    def path(self, uri):
        name = hashlib.sha256(f'{self.session}:{uri}'.encode()).hexdigest()
        return self.root / f'{name}.json'

    def get(self, uri):
        with self.lock:
            return self._get(uri)

    def _get(self, uri):
        path = self.path(uri)
        try:
            if path.stat().st_size > self.ENTRY_LIMIT:
                return None
            data = json.loads(path.read_text())
            age = time.time() - data['savedAt']
            tracks = data['tracks']
            if data['uri'] != uri or not 0 <= age < self.TTL or not isinstance(tracks, list) or len(tracks) > 500:
                return None
            if any(not isinstance(item, dict) or not all(isinstance(item.get(key), str) for key in ('id', 'title', 'artist', 'album')) or not isinstance(item.get('durationMs'), int) for item in tracks):
                return None
            path.touch()
            return tracks
        except (OSError, ValueError, TypeError, KeyError):
            return None

    def put(self, uri, tracks, session=None):
        with self.lock:
            if session is not None and session != self.session:
                return
            self._put(uri, tracks)

    def _put(self, uri, tracks):
        if len(tracks) > 500:
            return
        temporary = None
        try:
            payload = json.dumps({'uri': uri, 'savedAt': time.time(), 'tracks': tracks}).encode()
            if len(payload) > self.ENTRY_LIMIT:
                return
            self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
            self.root.chmod(0o700)
            path = self.path(uri)
            temporary = path.with_suffix(f'.{uuid.uuid4().hex}.tmp')
            temporary.write_bytes(payload)
            temporary.chmod(0o600)
            os.replace(temporary, path)
            files = sorted(self.root.glob('*.json'), key=lambda file: file.stat().st_mtime, reverse=True)
            total = 0
            for index, file in enumerate(files):
                total += file.stat().st_size
                if index >= 8 or total > self.TOTAL_LIMIT or time.time() - file.stat().st_mtime > self.TTL:
                    file.unlink(missing_ok=True)
        except OSError:
            pass  # Cache storage must never turn a successful load into a failure.
        finally:
            if temporary:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass
