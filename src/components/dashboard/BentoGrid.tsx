import { ReactNode } from "react";

interface BentoGridProps {
  children: ReactNode;
  sectionLabel?: string;
}

export default function BentoGrid({ children, sectionLabel }: BentoGridProps) {
  return (
    <div className="mb-6">
      {sectionLabel && (
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4 font-mono-ui">
          {sectionLabel}
        </p>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4">
        {children}
      </div>
    </div>
  );
}
