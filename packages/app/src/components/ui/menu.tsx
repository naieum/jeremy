import { Menu as ArkMenu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import type { ReactNode } from "react";

interface MenuItem {
  label: string;
  value: string;
  onSelect?: () => void;
  destructive?: boolean;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
}

export function Menu({ trigger, items }: MenuProps) {
  return (
    <ArkMenu.Root>
      <ArkMenu.Trigger asChild>{trigger}</ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner>
          <ArkMenu.Content className="z-50 min-w-[160px] rounded-lg border border-border bg-surface p-1 shadow-lg font-mono">
            {items.map((item) => (
              <ArkMenu.Item
                key={item.value}
                value={item.value}
                className={`flex cursor-pointer items-center rounded px-3 py-2 text-sm transition-colors data-[highlighted]:bg-hover ${
                  item.destructive
                    ? "text-danger data-[highlighted]:text-danger"
                    : "text-text"
                }`}
                onClick={item.onSelect}
              >
                {item.label}
              </ArkMenu.Item>
            ))}
          </ArkMenu.Content>
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
}
