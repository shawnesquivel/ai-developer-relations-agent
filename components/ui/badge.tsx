import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        live: "border-stone bg-transparent font-mono text-[12px] font-normal uppercase tracking-wide text-verdant",
        mock: "border-stone bg-transparent font-mono text-[12px] font-normal uppercase tracking-wide text-ash",
        verified: "border-stone bg-transparent font-normal normal-case text-verdant",
        broken: "border-stone bg-transparent font-normal normal-case text-crimson",
        unverified: "border-stone bg-transparent font-normal normal-case text-ash",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
