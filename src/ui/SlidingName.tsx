import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { usePanelVisible } from "./hooks";

/** Measure only visible text; CSS does the slow movement without a JS timer. */
export function SlidingName({ name }: { name: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLElement>(null);
  const [distance, setDistance] = useState(0);
  const [rtl, setRtl] = useState(false);
  const visible = usePanelVisible(container);
  useEffect(() => {
    const measure = () => {
      if (!container.current || !text.current) return;
      setDistance(Math.max(0, text.current.scrollWidth - container.current.clientWidth));
      setRtl(getComputedStyle(container.current).direction === "rtl");
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    if (text.current) observer?.observe(text.current);
    return () => observer?.disconnect();
  }, [name]);
  return <span ref={container} className="ds-marquee" data-overflow={distance > 1} data-visible={visible} style={{ "--ds-marquee-end": `${rtl ? distance : -distance}px`, "--ds-marquee-duration": `${Math.max(12, distance / 18 / .3)}s` } as CSSProperties}><bdi ref={text} className="ds-marquee-track">{name}</bdi></span>;
}
