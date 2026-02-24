import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
}: DialogProps) {
  return (
    <ArkDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <ArkDialog.Trigger asChild>{trigger}</ArkDialog.Trigger>}
      <Portal>
        <ArkDialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <ArkDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ArkDialog.Content className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl font-mono">
            {title && (
              <ArkDialog.Title className="text-lg font-semibold text-text">
                {title}
              </ArkDialog.Title>
            )}
            {description && (
              <ArkDialog.Description className="mt-1 text-sm text-muted">
                {description}
              </ArkDialog.Description>
            )}
            <div className="mt-4">{children}</div>
            <ArkDialog.CloseTrigger className="absolute top-4 right-4 text-muted hover:text-text transition-colors">
              &#10005;
            </ArkDialog.CloseTrigger>
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}
