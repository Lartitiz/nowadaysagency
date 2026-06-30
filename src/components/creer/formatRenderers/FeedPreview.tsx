import { useState } from "react";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Globe2, ThumbsUp, Repeat2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useWorkspace } from "@/contexts/WorkspaceContext";

type Photo = { preview?: string; base64?: string; name?: string };

interface Props {
  variant: "instagram" | "linkedin";
  text: string;
  photos?: Photo[];
  hashtags?: string[];
}

function photoSrc(p: Photo): string {
  if (p.preview) return p.preview;
  if (p.base64) return p.base64.startsWith("data:") ? p.base64 : `data:image/jpeg;base64,${p.base64}`;
  return "";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Aperçu réaliste « comme dans le feed » d'un post texte (Instagram ou LinkedIn).
 * But : montrer le rendu publié plutôt qu'un éditeur. Lit l'identité de marque
 * (nom + avatar) depuis le workspace actif, avec repli neutre si absent.
 */
export default function FeedPreview({ variant, text, photos, hashtags }: Props) {
  const { activeWorkspace } = useWorkspace();
  const [expanded, setExpanded] = useState(false);

  const brandName = activeWorkspace?.name?.trim() || "Ta marque";
  const avatarUrl = activeWorkspace?.avatar_url || undefined;
  const handle =
    (activeWorkspace?.slug?.trim() || brandName).toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._]/g, "");
  const firstPhoto = photos && photos.length > 0 ? photoSrc(photos[0]) : "";

  // Seuil de troncature propre à chaque plateforme.
  const limit = variant === "instagram" ? 125 : 210;
  const needsTruncation = text.length > limit;
  const shown = expanded || !needsTruncation ? text : text.slice(0, limit).trimEnd();

  const moreLabel = variant === "instagram" ? "plus" : "voir plus";

  const tagLine =
    hashtags && hashtags.length > 0
      ? " " + hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      : "";

  if (variant === "instagram") {
    return (
      <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={brandName} />}
            <AvatarFallback className="bg-gradient-to-br from-pink-500 to-amber-400 text-2xs font-semibold text-white">
              {initials(brandName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold">{handle}</span>
          <MoreHorizontal className="ml-auto h-4 w-4 text-neutral-700" />
        </div>

        {/* Média (si photo) */}
        {firstPhoto && (
          <div className="aspect-square w-full bg-neutral-100">
            <img loading="lazy" src={firstPhoto} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 px-3 pt-2.5">
          <Heart className="h-6 w-6 text-neutral-900" />
          <MessageCircle className="h-6 w-6 -scale-x-100 text-neutral-900" />
          <Send className="h-6 w-6 text-neutral-900" />
          <Bookmark className="ml-auto h-6 w-6 text-neutral-900" />
        </div>

        {/* Légende */}
        <div className="px-3 pb-3 pt-2 text-sm leading-snug">
          <span className="whitespace-pre-wrap">
            <span className="font-semibold">{handle}</span>{" "}
            {shown}
            {!expanded && needsTruncation && (
              <>
                …{" "}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-neutral-500 hover:underline"
                >
                  {moreLabel}
                </button>
              </>
            )}
            {(expanded || !needsTruncation) && tagLine && (
              <span className="text-info">{tagLine}</span>
            )}
          </span>
        </div>
      </div>
    );
  }

  // LinkedIn
  return (
    <div className="mx-auto w-full max-w-[480px] overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-3">
        <Avatar className="h-12 w-12">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={brandName} />}
          <AvatarFallback className="bg-gradient-to-br from-sky-600 to-sky-400 text-sm font-semibold text-white">
            {initials(brandName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{brandName}</p>
          <p className="truncate text-xs text-neutral-500">Vous · Auteur·e</p>
          <p className="flex items-center gap-1 text-xs text-neutral-500">
            1 h · <Globe2 className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-neutral-500" />
      </div>

      {/* Corps */}
      <div className="px-4 pb-2 pt-2 text-sm leading-relaxed">
        <span className="whitespace-pre-wrap">{shown}</span>
        {!expanded && needsTruncation && (
          <>
            …{" "}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="font-medium text-neutral-500 hover:text-info hover:underline"
            >
              {moreLabel}
            </button>
          </>
        )}
      </div>

      {/* Photos */}
      {photos && photos.length > 0 && (
        <div className={photos.length === 1 ? "" : "grid grid-cols-2 gap-0.5"}>
          {photos.slice(0, 4).map((p, i) => (
            <img loading="lazy" key={i} src={photoSrc(p)} alt="" className="w-full object-cover" style={{ maxHeight: 320 }} />
          ))}
        </div>
      )}

      {/* Barre de réactions */}
      <div className="flex items-center gap-1 px-4 py-1.5 text-xs text-neutral-500">
        <span className="flex -space-x-1">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-info text-2xs text-white">👍</span>
          <span className="grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-2xs text-white">❤️</span>
        </span>
        <span className="ml-1">Vous et votre réseau</span>
      </div>

      <div className="mx-4 border-t border-neutral-200" />

      {/* Actions */}
      <div className="grid grid-cols-4 px-2 py-1 text-sm font-medium text-neutral-600">
        <span className="flex items-center justify-center gap-1.5 rounded py-2">
          <ThumbsUp className="h-4 w-4" /> J'aime
        </span>
        <span className="flex items-center justify-center gap-1.5 rounded py-2">
          <MessageCircle className="h-4 w-4" /> Commenter
        </span>
        <span className="flex items-center justify-center gap-1.5 rounded py-2">
          <Repeat2 className="h-4 w-4" /> Republier
        </span>
        <span className="flex items-center justify-center gap-1.5 rounded py-2">
          <Send className="h-4 w-4" /> Envoyer
        </span>
      </div>
    </div>
  );
}
