import { DialogButton, Focusable, Navigation, SliderField, quickAccessControlsClasses } from "@decky/ui";
import type { ActionProps, ContainerProps, GroupProps, RangeProps, ReadOnlyRowProps, UIAdapter } from "./primitives";
import { ButtonContent } from "./ButtonContent";

function Action({ children, label, onClick, disabled, pressed, className = "", focusKey }: ActionProps) {
  const accessibility = { "aria-label": label, "aria-pressed": pressed, "data-focus-key": focusKey, title: label };
  return <DialogButton {...accessibility} style={{ minWidth: 0, minHeight: 28, padding: "4px 6px", fontSize: 12, lineHeight: "18px" }} className={`ds-action ${className}`} onClick={onClick} disabled={disabled} noFocusRing={false}><ButtonContent className={className}>{children}</ButtonContent></DialogButton>;
}
function Range({ label, value, min, max, step = 1, disabled, onChange, valueText, focusKey, className = "" }: RangeProps) {
  return <div className={`ds-native-range ${className}`} data-focus-key={focusKey}>
    <SliderField label={<span className="ds-slider-label">{label}</span>} tooltip={valueText} layout="below" bottomSeparator="none" className="ds-compact-slider" value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} showValue={false} />
  </div>;
}
function Container({ children, onBack, rootRef }: ContainerProps) {
  return <Focusable ref={rootRef} className={`ds-container ${quickAccessControlsClasses.Text}`} flow-children="column" onCancel={event => { if (onBack()) event.stopPropagation(); }}>{children}</Focusable>;
}
function Group({ children, className, flow }: GroupProps) { return <Focusable className={className} flow-children={flow}>{children}</Focusable>; }
function ReadOnlyRow({ children, className, label, focusKey }: ReadOnlyRowProps) {
  return <Focusable role="listitem" className={className} aria-label={label} data-focus-key={focusKey} focusClassName="ds-row-focus" onFocus={event => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}>{children}</Focusable>;
}
export const deckyAdapter: UIAdapter = { openExternal: url => Navigation.NavigateToExternalWeb(url), theme: "decky", Action, Range, Container, Group, ReadOnlyRow };
