import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { PlayerService } from "../player/types";

export function usePlayer(service: PlayerService) {
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}

export function usePanelVisible(ref: RefObject<HTMLElement>): boolean {
  const [intersecting, setIntersecting] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(document.visibilityState !== "hidden");
  useEffect(() => {
    const element = ref.current;
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => setIntersecting(entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0)));
    if (element) observer?.observe(element);
    const handleVisibility = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [ref]);
  return intersecting && documentVisible;
}

export function usePlaybackProgress(service: PlayerService, visible: boolean, showProgress: boolean, playing: boolean, ready: boolean) {
  useEffect(() => {
    if (!visible) return;
    service.refresh();
    if (!showProgress || !playing || !ready) return;
    const interval = setInterval(service.refresh, 1000);
    return () => clearInterval(interval);
  }, [service, visible, showProgress, playing, ready]);
}
