import { createToaster, Toaster as ArkToaster } from "@ark-ui/react/toast";

export const toaster = createToaster({
  placement: "bottom-end",
  overlap: true,
  gap: 16,
});

export function ToastProvider() {
  return (
    <ArkToaster
      toaster={toaster}
      className="font-mono"
    >
      {(toast) => (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-lg min-w-[280px]">
          <p className="text-sm font-medium text-text">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-xs text-muted">{toast.description}</p>
          )}
        </div>
      )}
    </ArkToaster>
  );
}
