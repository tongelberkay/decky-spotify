/** Shared by Decky's separate title/content React trees; scoped to one plugin. */
export function createSettingsNavigation() {
  const listeners = new Set<() => void>();
  let pending = false;
  return {
    open() { if (!listeners.size) pending = true; else listeners.forEach(listener => listener()); },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (pending) { pending = false; listener(); }
      return () => { listeners.delete(listener); };
    },
  };
}
export type SettingsNavigation = ReturnType<typeof createSettingsNavigation>;
