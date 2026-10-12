import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'py_modules'))
from decky_spotify.playlist_cache import PlaylistCache


class PlaylistCacheTests(unittest.TestCase):
    def test_disk_cache_preserves_duplicates_and_expires(self):
        with tempfile.TemporaryDirectory() as root:
            cache = PlaylistCache(root)
            item = {'id': 'spotify:track:one', 'title': 'Song', 'artist': 'Artist', 'album': '', 'durationMs': 10}
            cache.put('spotify:playlist:mix', [item, item])
            self.assertEqual(cache.get('spotify:playlist:mix'), [item, item])
            path = cache.path('spotify:playlist:mix')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            data = json.loads(path.read_text()); data['savedAt'] = time.time() - 301
            path.write_text(json.dumps(data))
            self.assertIsNone(cache.get('spotify:playlist:mix'))

    def test_session_reset_and_disk_budget(self):
        with tempfile.TemporaryDirectory() as root:
            cache = PlaylistCache(root)
            cache.TOTAL_LIMIT = 1000
            item = {'id': 'spotify:track:one', 'title': 'x' * 400, 'artist': '', 'album': '', 'durationMs': 0}
            for index in range(5):
                cache.put(f'spotify:playlist:{index}', [item])
            self.assertLessEqual(sum(p.stat().st_size for p in cache.root.glob('*.json')), 1000)
            self.assertIsNotNone(cache.get('spotify:playlist:4'))
            cache.reset()
            self.assertIsNone(cache.get('spotify:playlist:4'))

    def test_unwritable_cache_and_corrupt_entry_do_not_raise(self):
        with tempfile.TemporaryDirectory() as root:
            cache = PlaylistCache(root)
            cache.root.write_text('not a directory')
            cache.put('spotify:playlist:mix', [])
            self.assertIsNone(cache.get('spotify:playlist:mix'))
