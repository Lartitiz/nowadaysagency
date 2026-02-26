import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import ContentRecycling from "@/components/ContentRecycling";
import CrosspostFlow from "@/components/CrosspostFlow";

type TransformMode = "recycle" | "crosspost" | "inspire" | null;

export default function TransformContentPage() {
  const [mode, setMode] = useState<TransformMode>(null);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <SubPageHeader parentLabel="Dashboard" parentTo="/dashboard" currentLabel="Transformer" useFromParam />

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">🔄 Transformer un contenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu as déjà un contenu ? Transforme-le en nouveaux formats, adapte-le pour un autre canal, ou inspire-toi d'un contenu qui t'a plu.
          </p>
        </div>

        {!mode && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {([
              {
                id: "recycle" as TransformMode,
                emoji: "♻️",
                title: "Recycler",
                desc: "Transforme un contenu en plusieurs formats (carrousel, reel, stories, LinkedIn, newsletter).",
                tag: "Multi-format",
              },
              {
                id: "crosspost" as TransformMode,
                emoji: "🔄",
                title: "Adapter pour un canal",
                desc: "Adapte un contenu d'un canal à un autre avec un angle spécifique.",
                tag: "Cross-canal",
              },
              {
                id: "inspire" as TransformMode,
                emoji: "✨",
                title: "M'inspirer",
                desc: "Analyse un contenu qui t'a plu et crée une version à toi, adaptée à ton branding.",
                tag: "Inspiration",
              },
            ]).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="group text-left rounded-2xl border-2 border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
              >
                <span className="text-2xl mb-3 block">{m.emoji}</span>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {m.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold text-primary bg-rose-pale px-2.5 py-0.5 rounded-pill">
                  {m.tag}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode && (
          <button
            onClick={() => setMode(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6"
          >
            ← Changer de mode
          </button>
        )}

        {mode === "recycle" && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">♻️ Recycler un contenu</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Colle un contenu existant ou importe des fichiers : newsletter, post, article, PDF... L'IA le transforme en plusieurs formats.
              </p>
            </div>
            <ContentRecycling />
          </div>
        )}

        {mode === "crosspost" && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">🔄 Adapter pour un canal</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Un contenu source → adapté pour chaque canal. Pas du copier-coller : chaque version apporte un angle spécifique.
              </p>
            </div>
            <CrosspostFlow />
          </div>
        )}
      </main>
    </div>
  );
}
