#!/usr/bin/env python3
"""Measure librespot on Linux without collecting command lines, keys, or track data."""
import argparse
import json
import os
from pathlib import Path
import statistics
import time


def sample(pid):
    root = Path('/proc') / str(pid)
    fields = (root / 'stat').read_text().rsplit(')', 1)[1].split()
    ticks = int(fields[11]) + int(fields[12])
    start = int(fields[19])
    rss = int((root / 'statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE') / 1048576
    pss = None
    try:
        for line in (root / 'smaps_rollup').read_text().splitlines():
            if line.startswith('Pss:'):
                pss = int(line.split()[1]) / 1024
    except PermissionError:
        pass
    return start, ticks, rss, pss


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int)
    parser.add_argument('--seconds', type=int, default=60)
    parser.add_argument('--interval', type=float, default=2)
    args = parser.parse_args()
    if not Path('/proc').is_dir() or not 1 <= args.seconds <= 3600 or not 0.5 <= args.interval <= 30:
        parser.error('Run on Linux with seconds 1–3600 and interval 0.5–30.')
    try:
        pid = args.pid or int((Path.home() / '.local/share/decky-spotify/librespot.pid').read_text().strip())
        previous = sample(pid)
        if pid <= 0:
            raise ValueError()
        started = time.monotonic()
        last_time = started
        samples = []
        while time.monotonic() - started < args.seconds:
            time.sleep(min(args.interval, args.seconds - (time.monotonic() - started)))
            now = time.monotonic()
            current = sample(pid)
            if current[0] != previous[0]:
                parser.error('Process restarted during measurement; repeat the test.')
            cpu = (current[1] - previous[1]) / os.sysconf('SC_CLK_TCK') / (now - last_time) * 100
            samples.append({'rss_mib': current[2], 'pss_mib': current[3], 'cpu_percent_one_core': cpu})
            previous, last_time = current, now
        def summary(key):
            values = [entry[key] for entry in samples if entry[key] is not None]
            return {'mean': round(statistics.mean(values), 2), 'peak': round(max(values), 2)} if values else None
        print(json.dumps({'elapsed_seconds': round(time.monotonic() - started, 1), 'sample_count': len(samples), 'rss_mib': summary('rss_mib'), 'pss_mib': summary('pss_mib'), 'cpu_percent_one_core': summary('cpu_percent_one_core')}, indent=2))
    except (OSError, ValueError):
        parser.error('Could not read librespot process metrics. Start librespot as your user and retry.')


if __name__ == '__main__':
    main()
