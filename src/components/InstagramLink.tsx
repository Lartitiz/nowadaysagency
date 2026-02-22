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

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "📋 Lien copié !",
        description: "Colle-le dans ton navigateur → " + url,
      });
    }).catch(() => {
      window.prompt("Copie ce lien :", url);
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    onClick?.();
    // Don't prevent default — let the <a> try to open natively.
    // Also copy as fallback in case Instagram blocks.
    copyUrl();
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className={className}
        onClick={handleClick}
      >
        {children}
      </a>
      {showCopy && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyUrl();
          }}
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
