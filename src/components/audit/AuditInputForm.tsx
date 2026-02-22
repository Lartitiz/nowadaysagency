import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, X, Sparkles, Loader2 } from "lucide-react";

const FREQUENCY_OPTIONS = ["Tous les jours", "3-4x/semaine", "1-2x/semaine", "Moins d'1x/semaine", "Irrégulier"];

export interface AuditFormData {
  displayName: string;
  username: string;
  bio: string;
  bioLink: string;
  photoDescription: string;
  highlights: string;
  highlightsCount: string;
  hasPinned: boolean | null;
  pinnedPost1: string;
  pinnedPost2: string;
  pinnedPost3: string;
  feedDescription: string;
  followers: string;
  postsPerMonth: string;
  frequency: string;
  pillars: string;
  // Screenshots (optional, complement text)
  profileScreenshots: File[];
  feedScreenshot: File | null;
  highlightsScreenshot: File | null;
}

interface AuditInputFormProps {
  initial?: Partial<AuditFormData>;
  onSubmit: (data: AuditFormData) => void;
  loading: boolean;
}

export default function AuditInputForm({ initial, onSubmit, loading }: AuditInputFormProps) {
  const [form, setForm] = useState<AuditFormData>({
    displayName: initial?.displayName || "",
    username: initial?.username || "",
    bio: initial?.bio || "",
    bioLink: initial?.bioLink || "",
    photoDescription: initial?.photoDescription || "",
    highlights: initial?.highlights || "",
    highlightsCount: initial?.highlightsCount || "",
    hasPinned: initial?.hasPinned ?? null,
    pinnedPost1: initial?.pinnedPost1 || "",
    pinnedPost2: initial?.pinnedPost2 || "",
    pinnedPost3: initial?.pinnedPost3 || "",
    feedDescription: initial?.feedDescription || "",
    followers: initial?.followers || "",
    postsPerMonth: initial?.postsPerMonth || "",
    frequency: initial?.frequency || "",
    pillars: initial?.pillars || "",
    profileScreenshots: [],
    feedScreenshot: null,
    highlightsScreenshot: null,
  });

  const profileRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLInputElement>(null);
  const hlRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof AuditFormData, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const handleProfileFiles = (fl: FileList | null) => {
    if (!fl) return;
    const arr = Array.from(fl).filter((f) => f.size <= 10 * 1024 * 1024).slice(0, 5);
    set("profileScreenshots", [...form.profileScreenshots, ...arr]);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground mb-1">
          Remplis les infos de ton profil. Plus c'est précis, plus l'audit sera pertinent.
          <br />
          <strong>Ces infos alimentent TOUT l'outil</strong> (bio, contenu, stratégie).
        </p>
      </div>

      {/* ── Nom ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">👤 TON NOM</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Nom d'affichage</label>
          <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Laetitia | Nowadays Agency" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Nom d'utilisateur (@)</label>
          <Input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="@nowadaysagency" />
        </div>
      </section>

      {/* ── Bio ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📝 TA BIO</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Copie-colle ta bio Instagram ici :</label>
          <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Communication éthique pour créatrices engagées ✨&#10;Fondatrice @nowadaysagency&#10;Prof de com' ENSAD + Sup de Pub&#10;↓ Mini-formation gratuite" className="min-h-[100px]" />
          <p className="text-xs text-muted-foreground mt-1 italic">💡 Tu la trouves dans Instagram › Modifier le profil</p>
        </div>
      </section>

      {/* ── Lien ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">🔗 TON LIEN</h3>
        <Input value={form.bioLink} onChange={(e) => set("bioLink", e.target.value)} placeholder="https://linktr.ee/toncompte" />
      </section>

      {/* ── Photo de profil ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📸 TA PHOTO DE PROFIL</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Décris-la en 1 phrase :</label>
          <Input value={form.photoDescription} onChange={(e) => set("photoDescription", e.target.value)} placeholder="Photo souriante, fond rose, cheveux détachés" />
        </div>
        <p className="text-xs text-muted-foreground italic">OU uploade un screenshot ci-dessous avec les autres.</p>
      </section>

      {/* ── Stories à la une ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📱 TES STORIES À LA UNE</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Liste les noms de tes highlights (séparés par des virgules) :</label>
          <Input value={form.highlights} onChange={(e) => set("highlights", e.target.value)} placeholder="Avis, FAQ, Perso, Academy, Coulisses" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Combien de highlights :</label>
          <Input type="number" value={form.highlightsCount} onChange={(e) => set("highlightsCount", e.target.value)} placeholder="5" className="w-24" />
        </div>
        <div>
          <button onClick={() => hlRef.current?.click()} className="text-xs text-primary hover:underline">📷 OU uploader un screenshot de tes highlights</button>
          <input ref={hlRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) set("highlightsScreenshot", e.target.files[0]); }} />
          {form.highlightsScreenshot && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-foreground">{form.highlightsScreenshot.name}</span>
              <button onClick={() => set("highlightsScreenshot", null)}><X className="h-3 w-3" /></button>
            </div>
          )}
        </div>
      </section>

      {/* ── Posts épinglés ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📌 TES POSTS ÉPINGLÉS</h3>
        <div className="flex gap-3">
          <Button variant={form.hasPinned === true ? "default" : "outline"} size="sm" onClick={() => set("hasPinned", true)} className="rounded-pill">Oui</Button>
          <Button variant={form.hasPinned === false ? "default" : "outline"} size="sm" onClick={() => set("hasPinned", false)} className="rounded-pill">Non</Button>
        </div>
        {form.hasPinned === true && (
          <div className="space-y-2">
            <Input value={form.pinnedPost1} onChange={(e) => set("pinnedPost1", e.target.value)} placeholder='Post épinglé 1 : ex. Carrousel "5 erreurs en com"' />
            <Input value={form.pinnedPost2} onChange={(e) => set("pinnedPost2", e.target.value)} placeholder="Post épinglé 2 : ex. Témoignage cliente" />
            <Input value={form.pinnedPost3} onChange={(e) => set("pinnedPost3", e.target.value)} placeholder="Post épinglé 3 : ex. Reel storytelling" />
          </div>
        )}
      </section>

      {/* ── Feed ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">🎨 TON FEED</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Décris ton feed en quelques mots :</label>
          <Textarea value={form.feedDescription} onChange={(e) => set("feedDescription", e.target.value)} placeholder="Palette rose + blanc, carrousels éducatifs, quelques Reels face cam, pas beaucoup de photos perso" className="min-h-[80px]" />
        </div>
        <div>
          <button onClick={() => feedRef.current?.click()} className="text-xs text-primary hover:underline">📷 OU uploader un screenshot de ton feed (les 9 derniers)</button>
          <input ref={feedRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) set("feedScreenshot", e.target.files[0]); }} />
          {form.feedScreenshot && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-foreground">{form.feedScreenshot.name}</span>
              <button onClick={() => set("feedScreenshot", null)}><X className="h-3 w-3" /></button>
            </div>
          )}
        </div>
      </section>

      {/* ── Chiffres ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📊 QUELQUES CHIFFRES</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre d'abonné·es</label>
            <Input type="number" value={form.followers} onChange={(e) => set("followers", e.target.value)} placeholder="6 292" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Posts publiés ce mois</label>
            <Input type="number" value={form.postsPerMonth} onChange={(e) => set("postsPerMonth", e.target.value)} placeholder="4" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Fréquence de publication :</label>
          <div className="flex flex-wrap gap-2">
            {FREQUENCY_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => set("frequency", f)}
                className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${form.frequency === f ? "border-primary bg-rose-pale text-primary" : "border-border bg-card text-foreground hover:border-primary/40"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ligne éditoriale ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📝 TA LIGNE ÉDITORIALE</h3>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Tes piliers de contenu (séparés par des virgules) :</label>
          <Input value={form.pillars} onChange={(e) => set("pillars", e.target.value)} placeholder="Éducation, Storytelling, Engagement, Inspiration" />
          <p className="text-xs text-muted-foreground mt-1 italic">Laisse vide si pas encore définis.</p>
        </div>
      </section>

      {/* ── Screenshots optionnels ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">📸 SCREENSHOTS (optionnel, pour enrichir l'audit)</h3>
        <div
          onClick={() => profileRef.current?.click()}
          className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
        >
          <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Screenshots de ton profil, feed, highlights...</p>
        </div>
        <input ref={profileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleProfileFiles(e.target.files)} />
        {form.profileScreenshots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.profileScreenshots.map((f, i) => (
              <div key={i} className="flex items-center gap-1 text-xs bg-muted rounded-pill px-2 py-1">
                <span>{f.name.substring(0, 15)}...</span>
                <button onClick={() => set("profileScreenshots", form.profileScreenshots.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Button onClick={() => onSubmit(form)} disabled={loading || (!form.bio && !form.displayName && form.profileScreenshots.length === 0)} className="w-full rounded-pill gap-2 h-12 text-base">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Analyse en cours..." : "🔍 Lancer l'audit"}
      </Button>
    </div>
  );
}
