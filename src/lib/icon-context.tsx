"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { defaultIcons, type IconComponent, type IconName } from "./icon-definitions";

const IconContext = createContext<Record<IconName, IconComponent> | null>(null);

function useIcon(name: IconName): IconComponent {
  const icons = useContext(IconContext);
  return (icons ?? defaultIcons)[name];
}

function useIcons(): Record<IconName, IconComponent> {
  const icons = useContext(IconContext);
  return icons ?? defaultIcons;
}

function IconProvider({ children, icons }: {
  children: ReactNode;
  icons?: Partial<Record<IconName, IconComponent>>;
}) {
  const value = useMemo(() => ({ ...defaultIcons, ...icons }), [icons]);
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

export { IconProvider, useIcon, useIcons };
export type { IconComponent, IconComponentProps, IconName } from "./icon-definitions";
