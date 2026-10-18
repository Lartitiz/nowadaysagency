// Chantier AB (18/10/2026) : « Ajouter une icône » en mode simple. Une petite
// série d'icônes simples (bibliothèque lucide, déjà utilisée par l'app), avec
// une recherche en mots français. L'icône choisie est posée au centre de la
// slide, aux couleurs de la charte (editor-icons.ts).
import { useState, type ComponentType } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Bell, BookOpen, Bookmark, Calendar, Camera, Check, Clock, Coffee,
  Euro, Eye, Flower2, Gift, Globe, Heart, HelpCircle, Home, Info, Leaf, Lightbulb, Link, Lock, Mail, MapPin, MessageCircle, Moon, Music,
  Palette, Pencil, Phone, Play, Rocket, Search, Share2, ShoppingBag, Smile, Sparkles, Star, Sun, Tag, Target, ThumbsUp, TrendingUp, User,
  Users, X, Zap, type LucideProps,
} from "lucide-react";

type Icon = { name: string; words: string; Icon: ComponentType<LucideProps> };
/** Nom affiché, puis les mots qui la trouvent dans la recherche. */
export const EDITOR_ICONS: Icon[] = [
  { name: "Flèche vers la droite", words: "suite suivant glisse swipe", Icon: ArrowRight },
  { name: "Flèche vers le bas", words: "descendre lire", Icon: ArrowDown },
  { name: "Flèche vers la gauche", words: "retour avant", Icon: ArrowLeft },
  { name: "Flèche vers le haut", words: "monter hausse", Icon: ArrowUp },
  { name: "Cœur", words: "coeur amour aimer like", Icon: Heart },
  { name: "Étoile", words: "etoile favori avis note", Icon: Star },
  { name: "Idée", words: "ampoule astuce conseil", Icon: Lightbulb },
  { name: "Calendrier", words: "date agenda rendez-vous", Icon: Calendar },
  { name: "Cadeau", words: "offre bonus surprise", Icon: Gift },
  { name: "Coche", words: "oui valide fait vrai", Icon: Check },
  { name: "Croix", words: "non faux erreur", Icon: X },
  { name: "Maison", words: "accueil chez soi", Icon: Home },
  { name: "Téléphone", words: "telephone appel contact", Icon: Phone },
  { name: "Message", words: "bulle commentaire discussion dm", Icon: MessageCircle },
  { name: "E-mail", words: "mail courriel lettre newsletter", Icon: Mail },
  { name: "Appareil photo", words: "photo image", Icon: Camera },
  { name: "Lieu", words: "adresse carte localisation", Icon: MapPin },
  { name: "Horloge", words: "heure temps minute", Icon: Clock },
  { name: "Sourire", words: "content joie heureux", Icon: Smile },
  { name: "Étincelles", words: "etincelles magie nouveau brille", Icon: Sparkles },
  { name: "Fleur", words: "nature printemps", Icon: Flower2 },
  { name: "Soleil", words: "ete lumiere matin", Icon: Sun },
  { name: "Lune", words: "nuit soir", Icon: Moon },
  { name: "Feuille", words: "nature ecologie plante", Icon: Leaf },
  { name: "Sac", words: "boutique achat shopping panier", Icon: ShoppingBag },
  { name: "Étiquette", words: "etiquette prix promo", Icon: Tag },
  { name: "Euro", words: "prix argent tarif", Icon: Euro },
  { name: "Courbe qui monte", words: "graphique croissance progres", Icon: TrendingUp },
  { name: "Cible", words: "objectif but", Icon: Target },
  { name: "Fusée", words: "fusee lancement", Icon: Rocket },
  { name: "Livre", words: "lecture guide formation", Icon: BookOpen },
  { name: "Crayon", words: "ecrire stylo modifier", Icon: Pencil },
  { name: "Palette", words: "couleur art creation", Icon: Palette },
  { name: "Musique", words: "note son", Icon: Music },
  { name: "Café", words: "cafe pause tasse", Icon: Coffee },
  { name: "Personne", words: "moi profil cliente", Icon: User },
  { name: "Groupe", words: "equipe communaute personnes", Icon: Users },
  { name: "Pouce levé", words: "pouce bravo ok", Icon: ThumbsUp },
  { name: "Question", words: "aide pourquoi", Icon: HelpCircle },
  { name: "Attention", words: "alerte danger erreur", Icon: AlertTriangle },
  { name: "Info", words: "information", Icon: Info },
  { name: "Cadenas", words: "securite prive ferme", Icon: Lock },
  { name: "Lien", words: "url site", Icon: Link },
  { name: "Partager", words: "envoyer", Icon: Share2 },
  { name: "Enregistrer", words: "signet sauvegarder garder", Icon: Bookmark },
  { name: "Cloche", words: "notification rappel", Icon: Bell },
  { name: "Œil", words: "oeil voir regarder", Icon: Eye },
  { name: "Éclair", words: "eclair energie rapide", Icon: Zap },
  { name: "Médaille", words: "medaille prix reussite", Icon: Award },
  { name: "Loupe", words: "chercher recherche", Icon: Search },
  { name: "Lecture", words: "video play", Icon: Play },
  { name: "Monde", words: "web internet international", Icon: Globe },
];

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");

export function IconPicker({ disabled, onPick }: { disabled?: boolean; onPick: (name: string, svg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = EDITOR_ICONS.filter((i) => words.every((w) => fold(`${i.name} ${i.words}`).includes(w)));
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="px-1 text-xs" disabled={disabled}>
          <Star size={14} className="mr-1" aria-hidden="true" /> Ajouter une icône
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" aria-label="Choisir une icône">
        <input
          aria-label="Chercher une icône"
          placeholder="Chercher : cœur, cadeau, idée…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:border-primary"
        />
        <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto" role="group" aria-label="Icônes">
          {shown.map(({ name, Icon }) => (
            <button
              key={name}
              type="button"
              aria-label={`Icône ${name}`}
              title={name}
              className="flex h-10 items-center justify-center rounded-md hover:bg-muted"
              onClick={(e) => {
                const svg = e.currentTarget.querySelector("svg")?.outerHTML;
                setOpen(false);
                setQuery("");
                if (svg) onPick(name, svg);
              }}
            >
              <Icon size={22} aria-hidden="true" />
            </button>
          ))}
        </div>
        {!shown.length && <p className="px-1 py-3 text-xs text-muted-foreground">Aucune icône pour « {query} ». Essaie « flèche » ou « cœur ».</p>}
      </PopoverContent>
    </Popover>
  );
}
