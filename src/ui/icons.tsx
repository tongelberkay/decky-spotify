export type IconName = "play" | "pause" | "previous" | "next" | "shuffle" | "repeat" | "volume" | "queue" | "list" | "back" | "music" | "headphones" | "alert" | "check" | "close" | "bell" | "users" | "settings" | "battery" | "help" | "plug";
const paths: Record<IconName, string> = {
  play: "M8 5v14l11-7Z", pause: "M8 5v14M16 5v14", previous: "M6 5v14M18 5l-9 7 9 7Z", next: "M18 5v14M6 5l9 7-9 7Z",
  shuffle: "M3 6h3c5 0 7 12 12 12h3M18 15l3 3-3 3M3 18h3c2 0 4-3 6-6s4-6 6-6h3M18 3l3 3-3 3",
  repeat: "M18 3l3 3-3 3M21 6H7a4 4 0 0 0-4 4M6 21l-3-3 3-3M3 18h14a4 4 0 0 0 4-4",
  volume: "M3 9v6h4l5 4V5L7 9ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14",
  queue: "M3 5h13M3 10h13M3 15h7M16 14v7l5-3.5Z", list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  back: "M15 5l-7 7 7 7", music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3ZM20 16a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z",
  headphones: "M4 14v-2a8 8 0 0 1 16 0v2M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z",
  alert: "M12 3l10 18H2ZM12 9v5M12 17h.01", check: "M5 12l4 4L19 6", close: "M6 6l12 12M18 6L6 18",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4",
  users: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-3a7 7 0 0 1 14 0v3ZM17 5a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 5",
  settings: "M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1ZM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z",
  battery: "M3 6h16v12H3ZM22 10v4M6 9h8v6H6Z",
  help: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01",
  plug: "M8 2v5M16 2v5M5 7h14M7 7v5a5 5 0 0 0 10 0V7M12 17v5",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const solid = name === "play";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? "currentColor" : "none"} stroke={solid ? "none" : "currentColor"} strokeWidth={name === "pause" ? 3.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
