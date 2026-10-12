import { createContext, useContext } from "react";
import type { ComponentType, ReactNode, RefObject } from "react";

export interface ActionProps {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  focusKey: string;
}
export interface RangeProps { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (value: number) => void; valueText?: string; focusKey: string; className?: string }
export interface ContainerProps { children: ReactNode; onBack: () => boolean; rootRef: RefObject<HTMLDivElement> }
export interface GroupProps { children: ReactNode; className: string; flow: "row" | "column" }
export interface ReadOnlyRowProps { children: ReactNode; className: string; label: string; focusKey: string }
export interface UIAdapter { openExternal(url: string): void; theme: "decky" | "browser"; Action: ComponentType<ActionProps>; Range: ComponentType<RangeProps>; Container: ComponentType<ContainerProps>; Group: ComponentType<GroupProps>; ReadOnlyRow: ComponentType<ReadOnlyRowProps> }
export const AdapterContext = createContext<UIAdapter | null>(null);
export function useAdapter(): UIAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error("Missing UI adapter");
  return adapter;
}
