"use client";

import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type TabsVariant = "segmented" | "underline";
export type TabsActivationMode = "automatic" | "manual";

type TabsContextValue = {
  baseId: string;
  activeValue: string | undefined;
  selectTab: (value: string) => void;
  variant: TabsVariant;
  activationMode: TabsActivationMode;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(componentName: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${componentName} must be used inside <Tabs>`);
  }
  return ctx;
}

export type TabsProps = Omit<ComponentProps<"div">, "defaultValue"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
  activationMode?: TabsActivationMode;
};

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  variant = "segmented",
  activationMode = "automatic",
  className,
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const activeValue = isControlled ? value : internalValue;

  function selectTab(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    if (nextValue !== activeValue) {
      onValueChange?.(nextValue);
    }
  }

  return (
    <TabsContext.Provider value={{ baseId, activeValue, selectTab, variant, activationMode }}>
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

const listVariants: Record<TabsVariant, string> = {
  segmented:
    "inline-flex w-fit max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-border-subtle bg-surface-elevated p-1",
  underline:
    "flex max-w-full overflow-x-auto whitespace-nowrap gap-4 border-b border-border-subtle",
};

export type TabsListProps = ComponentProps<"div">;

export function TabsList({ className, ...props }: TabsListProps) {
  const { variant } = useTabsContext("TabsList");

  return (
    <div
      role="tablist"
      className={cn(listVariants[variant], className)}
      {...props}
    />
  );
}

const triggerBase =
  "inline-flex items-center gap-2 whitespace-nowrap font-heading text-label-caps uppercase transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt disabled:pointer-events-none disabled:opacity-50";

const triggerVariants: Record<TabsVariant, { active: string; inactive: string }> = {
  segmented: {
    active: "rounded px-5 py-2 bg-volt font-bold text-surface-base",
    inactive: "rounded px-5 py-2 text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
  },
  underline: {
    active: "-mb-px border-b-2 border-volt px-1 py-3 text-volt",
    inactive: "-mb-px border-b-2 border-transparent px-1 py-3 text-text-secondary hover:text-text-primary",
  },
};

export type TabsTriggerProps = Omit<ComponentProps<"button">, "type" | "value"> & {
  value: string;
  icon?: IconName;
  badge?: ReactNode;
};

export function TabsTrigger({
  value,
  icon,
  badge,
  className,
  children,
  onClick,
  onKeyDown,
  ...props
}: TabsTriggerProps) {
  const { baseId, activeValue, selectTab, variant, activationMode } = useTabsContext("TabsTrigger");
  const isActive = activeValue === value;
  const variantStyles = triggerVariants[variant];

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const tablist = event.currentTarget.closest('[role="tablist"]');
    if (!tablist) return;

    const enabledTabs = Array.from(
      tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
    );
    const currentIndex = enabledTabs.indexOf(event.currentTarget);
    if (currentIndex === -1 || enabledTabs.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledTabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();

    const nextTab = enabledTabs[nextIndex];
    nextTab.focus();
    if (activationMode === "automatic") {
      const nextValue = nextTab.dataset.tabValue;
      if (nextValue !== undefined) selectTab(nextValue);
    }
  }

  return (
    <button
      {...props}
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      data-tab-value={value}
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) selectTab(value);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        triggerBase,
        isActive ? variantStyles.active : variantStyles.inactive,
        className
      )}
    >
      {icon && <Icon name={icon} size={14} className="shrink-0" />}
      {children}
      {badge}
    </button>
  );
}

export type TabsContentProps = ComponentProps<"div"> & {
  value: string;
  keepMounted?: boolean;
};

export function TabsContent({
  value,
  keepMounted = false,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { baseId, activeValue } = useTabsContext("TabsContent");
  const isActive = activeValue === value;

  if (!isActive && !keepMounted) {
    return null;
  }

  return (
    <div
      {...props}
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      hidden={!isActive}
      className={cn(!isActive && "hidden", className)}
    >
      {children}
    </div>
  );
}
