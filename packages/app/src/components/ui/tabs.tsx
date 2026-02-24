import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import type { ReactNode } from "react";

interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
}

export function Tabs({ items, defaultValue, className = "" }: TabsProps) {
  return (
    <ArkTabs.Root
      defaultValue={defaultValue ?? items[0]?.value}
      className={className}
    >
      <ArkTabs.List className="flex border-b border-border">
        {items.map((item) => (
          <ArkTabs.Trigger
            key={item.value}
            value={item.value}
            className="px-4 py-2 text-sm text-muted hover:text-text transition-colors border-b-2 border-transparent data-[selected]:border-accent data-[selected]:text-text font-mono"
          >
            {item.label}
          </ArkTabs.Trigger>
        ))}
      </ArkTabs.List>
      {items.map((item) => (
        <ArkTabs.Content
          key={item.value}
          value={item.value}
          className="pt-4 font-mono"
        >
          {item.content}
        </ArkTabs.Content>
      ))}
    </ArkTabs.Root>
  );
}
