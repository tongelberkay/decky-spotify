import type { Playlist, Track } from "./types";

// Original local fixture art is embedded so the Decky bundle requires no asset server.
function cover(background: string, accent: string, variant: number): string {
  const motif = variant === 0
    ? `<circle cx="100" cy="105" r="57" fill="none" stroke="${accent}" stroke-width="1.5"/><circle cx="100" cy="105" r="39" fill="none" stroke="${accent}" stroke-width="1"/><path d="M15 145Q100 55 185 145M15 155Q100 65 185 155" fill="none" stroke="${accent}" stroke-width="2"/>`
    : variant === 1
      ? `<path d="M0 150L75 35L120 130L160 65L200 150V200H0Z" fill="${accent}" opacity=".8"/><circle cx="153" cy="42" r="17" fill="#ffe2ac"/>`
      : `<path d="M-15 100Q30 5 80 100T180 100T280 100M-15 123Q30 28 80 123T180 123T280 123M-15 146Q30 51 80 146T180 146T280 146" fill="none" stroke="${accent}" stroke-width="14"/><circle cx="100" cy="70" r="12" fill="#faf4dc"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><radialGradient id="g"><stop stop-color="${background}"/><stop offset="1" stop-color="#091118"/></radialGradient></defs><rect width="200" height="200" fill="url(#g)"/>${motif}<path d="M16 16H35M16 16V35M184 184H165M184 184V165" stroke="#ffffff" opacity=".25" fill="none"/></svg>`)}`;
}

export const artwork = [cover("#27575a", "#9fcabc", 0), cover("#5d393b", "#d58963", 1), cover("#333e70", "#879ccf", 2)];
export const fixtureTracks: readonly Track[] = [
  { id: "night-drive", title: "Night Drive", artist: "Coastline", album: "After Hours", durationMs: 224000, artwork: artwork[0] },
  { id: "weightless", title: "Weightless", artist: "Aster", album: "Open Skies", durationMs: 198000, artwork: artwork[2] },
  { id: "distant-lights", title: "Distant Lights", artist: "Slow Signal", album: "After Hours", durationMs: 247000, artwork: artwork[0] },
  { id: "sunroom", title: "Sunroom", artist: "Juniper", album: "Golden Days", durationMs: 186000, artwork: artwork[1] },
  { id: "new-world", title: "A New World", artist: "Northbound", album: "Open Skies", durationMs: 261000, artwork: artwork[2] },
  { id: "soft-focus", title: "Soft Focus", artist: "Daybreak", album: "Golden Days", durationMs: 205000, artwork: artwork[1] },
];
export function createFixtures(): Playlist[] {
  return [
    { id: "after-hours", title: "After Hours", description: "Late nights, open roads.", artwork: artwork[0], tracks: [fixtureTracks[0], fixtureTracks[2], fixtureTracks[1], fixtureTracks[4]], trackCount: 4 },
    { id: "golden-days", title: "Golden Days", description: "A little warmth for the journey.", artwork: artwork[1], tracks: [fixtureTracks[3], fixtureTracks[5], fixtureTracks[0]], trackCount: 3 },
    { id: "open-skies", title: "Open Skies", description: "Room to breathe.", artwork: artwork[2], tracks: [fixtureTracks[1], fixtureTracks[4], fixtureTracks[2], fixtureTracks[5]], trackCount: 4 },
  ].map(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t })) }));
}
