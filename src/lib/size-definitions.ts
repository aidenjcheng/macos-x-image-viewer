export type SizeVariant = "default" | "compact";

export interface SizeClasses {
  variant: SizeVariant;
  control: string;
  controlHeight: number;
  segmentItem: string;
  segmentPad: string;
  text: string;
  px: string;
  itemPx: string;
  gap: string;
  icon: number;
}

export const sizeMap: Record<SizeVariant, SizeClasses> = {
  default: {
    variant: "default", control: "h-9", controlHeight: 36, segmentItem: "h-7",
    segmentPad: "p-1", text: "text-[13px]", px: "px-3", itemPx: "px-2",
    gap: "gap-2", icon: 16,
  },
  compact: {
    variant: "compact", control: "h-7", controlHeight: 28, segmentItem: "h-6",
    segmentPad: "p-0.5", text: "text-[12px]", px: "px-2.5", itemPx: "px-1.5",
    gap: "gap-1", icon: 14,
  },
};

export interface TypeScaleStep {
  default: number;
  compact: number;
}

export const typeScale = {
  display: { default: 28, compact: 24 },
  title: { default: 16, compact: 15 },
  subtitle: { default: 14, compact: 13 },
  body: { default: 13, compact: 12 },
  caption: { default: 12, compact: 11 },
} as const satisfies Record<string, TypeScaleStep>;

export type TypeScaleRole = keyof typeof typeScale;
