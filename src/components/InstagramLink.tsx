import { type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

interface InstagramLinkProps {
  username: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  showCopy?: boolean;
}

function cleanPseudo(input: string): string {
  let clean = input.trim().replace(/^@/, '');
  if (clean.startsWith('http')) {
    try {
      const url = new URL(clean);
      clean = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch {
      // fallback: strip protocol + domain manually
      clean = clean
        .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
        .replace(/\/$/, '');
    }
  }
  // Remove any remaining slashes or query params
  clean = clean.split('?')[0].split('#')[0].replace(/\/$/, '');
  return clean;
}

function buildUrl(username: string): string {
  const clean = cleanPseudo(username);
  // No trailing slash, no query params
  return `https://www.instagram.com/${clean}`;
}

function InstagramLinkInner({ username, children, className, onClick, showCopy = false }: InstagramLinkProps) {
  const { toast } = useToast();
  const url = buildUrl(username);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "✅ Lien copié", description: url });
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className={className}
        onClick={onClick}
      >
        {children}
      </a>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-primary text-xs shrink-0"
          title="Copier le lien Instagram"
          type="button"
        >
          📋
        </button>
      )}
    </span>
  );
}

export default InstagramLinkInner;
export { cleanPseudo, buildUrl };
