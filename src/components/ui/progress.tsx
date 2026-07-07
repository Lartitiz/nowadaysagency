import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    // role="progressbar" (Radix) exige un nom accessible ; défaut générique surchargeable par aria-label / aria-labelledby.
    aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Progression"}
    aria-labelledby={ariaLabelledBy}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
