import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <ArkTooltip.Root openDelay={200} closeDelay={0}>
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <ArkTooltip.Positioner>
        <ArkTooltip.Content className="z-50 rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-text shadow-lg font-mono">
          {content}
        </ArkTooltip.Content>
      </ArkTooltip.Positioner>
    </ArkTooltip.Root>
  );
}
