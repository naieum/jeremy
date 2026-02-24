import { Select as ArkSelect, createListCollection } from "@ark-ui/react/select";
import { Portal } from "@ark-ui/react/portal";

interface SelectItem {
  label: string;
  value: string;
}

interface SelectProps {
  items: SelectItem[];
  value?: string[];
  onValueChange?: (details: { value: string[] }) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function Select({
  items,
  value,
  onValueChange,
  placeholder = "Select...",
  label,
  className = "",
}: SelectProps) {
  const collection = createListCollection({ items });

  return (
    <ArkSelect.Root
      collection={collection}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      {label && (
        <ArkSelect.Label className="block text-sm font-medium text-text mb-1">
          {label}
        </ArkSelect.Label>
      )}
      <ArkSelect.Control>
        <ArkSelect.Trigger className="flex w-full items-center justify-between rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text hover:border-muted transition-colors font-mono">
          <ArkSelect.ValueText placeholder={placeholder} />
          <ArkSelect.Indicator className="text-muted">
            <ChevronDown />
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content className="z-50 rounded-lg border border-border bg-surface p-1 shadow-lg font-mono">
            {items.map((item) => (
              <ArkSelect.Item
                key={item.value}
                item={item}
                className="flex cursor-pointer items-center rounded px-3 py-2 text-sm text-text hover:bg-hover transition-colors data-[highlighted]:bg-hover"
              >
                <ArkSelect.ItemText>{item.label}</ArkSelect.ItemText>
                <ArkSelect.ItemIndicator className="ml-auto text-accent">
                  &#10003;
                </ArkSelect.ItemIndicator>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
      <ArkSelect.HiddenSelect />
    </ArkSelect.Root>
  );
}

function ChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
