import logoAsset from "@/assets/logo-assistant-com.png.asset.json";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
}

/** Logo officiel de L'Assistant Com' (wordmark). */
export default function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src={logoAsset.url}
      alt="L'Assistant Com'"
      className={cn("w-auto object-contain", className)}
      decoding="async"
    />
  );
}
