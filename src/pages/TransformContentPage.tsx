import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

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

        {/* Mode selector - will be filled in next prompt */}
        {!mode && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Sélecteur de mode à venir</p>
          </div>
        )}
      </main>
    </div>
  );
}
