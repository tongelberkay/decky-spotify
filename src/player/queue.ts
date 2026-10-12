import type { QueueEntry, QueueSource } from "./types";

export interface QueueGroup { id: string; source?: QueueSource; entries: QueueEntry[] }
export function groupQueue(queue: readonly QueueEntry[]): QueueGroup[] {
  if (queue.some(e => !e.source)) return queue.length ? [{ id: "up-next", entries: [...queue] }] : [];
  const groups: QueueGroup[] = [];
  for (const entry of queue) {
    const previous = groups.at(-1);
    const same = previous?.source?.kind === entry.source?.kind && (entry.source?.kind !== "playlist" || (previous?.source?.kind === "playlist" && previous.source.playlistId === entry.source.playlistId));
    if (same && previous) previous.entries.push(entry);
    else groups.push({ id: entry.id, source: entry.source, entries: [entry] });
  }
  return groups;
}
