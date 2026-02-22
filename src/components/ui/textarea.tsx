import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onChange, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const autoResize = React.useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  React.useEffect(() => {
    if (innerRef.current) autoResize(innerRef.current);
  }, [props.value, props.defaultValue, autoResize]);

  return (
    <textarea
      className={cn(
        "flex min-h-[200px] w-full rounded-[10px] border-2 border-input bg-card px-4 py-3 text-[15px] font-body ring-offset-background placeholder:text-placeholder placeholder:italic focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-[250ms] resize-vertical",
        className,
      )}
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        if (node) autoResize(node);
      }}
      onChange={(e) => {
        autoResize(e.target);
        onChange?.(e);
      }}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
