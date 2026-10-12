import type { KeyboardEvent } from "react";
import type { ActionProps, ContainerProps, GroupProps, RangeProps, ReadOnlyRowProps, UIAdapter } from "./primitives";
import { ButtonContent } from "./ButtonContent";

function Action({ children, label, onClick, disabled, pressed, className = "", focusKey }: ActionProps) {
  return <button type="button" className={`ds-action ${className}`} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} data-focus-key={focusKey}><ButtonContent className={className}>{children}</ButtonContent></button>;
}
function Range({ label, value, min, max, step = 1, disabled, onChange, valueText, focusKey, className = "" }: RangeProps) {
  return <input type="range" className={`ds-range ${className}`} aria-label={label} aria-valuetext={valueText} value={value} min={min} max={max} step={step} disabled={disabled} onChange={event => onChange(Number(event.currentTarget.value))} data-focus-key={focusKey} style={{ "--progress": `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` } as React.CSSProperties} />;
}

function Container({ children, onBack, rootRef }: ContainerProps) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { if (onBack()) { event.preventDefault(); event.stopPropagation(); } return; }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if ((event.target as HTMLElement).tagName === "INPUT" && ["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const candidates = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-focus-key]:not(:disabled)")).filter(el => el.getClientRects().length);
    const active = document.activeElement as HTMLElement | null;
    if (!active || !candidates.includes(active)) { candidates[0]?.focus(); event.preventDefault(); return; }
    const box = active.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const vertical = ["ArrowUp", "ArrowDown"].includes(event.key);
    const sign = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
    const next = candidates.filter(el => el !== active).map(el => {
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
      const distance = vertical ? dy : dx;
      return { el, forward: distance * sign, score: Math.abs(distance) + Math.abs(vertical ? dx : dy) * 2 };
    }).filter(c => c.forward > 4).sort((a, b) => a.score - b.score)[0];
    if (next) { next.el.focus(); next.el.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    event.preventDefault();
  }
  return <div className="ds-container" ref={rootRef} onKeyDown={navigate}>{children}</div>;
}
function Group({ children, className }: GroupProps) { return <div className={className}>{children}</div>; }
function ReadOnlyRow({ children, className, label, focusKey }: ReadOnlyRowProps) { return <div tabIndex={0} role="listitem" className={className} aria-label={label} data-focus-key={focusKey}>{children}</div>; }
export const browserAdapter: UIAdapter = { openExternal: url => { window.open(url, "_blank", "noopener,noreferrer"); }, theme: "browser", Action, Range, Container, Group, ReadOnlyRow };
