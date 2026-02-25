import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/error-messages";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, ChevronUp, ChevronDown, Eye, X, Sparkles, Calendar, UserRound, Download } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

interface UserRow {
  user_id: string;
  prenom: string;
  email: string;
  activite: string;
  activite_type: string;
  plan: string;
  plan_status: string;
  ai_usage_count: number;
  last_sign_in: string | null;
  created_at: string;
  branding_score: number;
}

type SortKey = "prenom" | "email" | "plan" | "branding_score" | "ai_usage_count" | "last_sign_in" | "created_at";

const PLAN_FILTERS = ["all", "free", "outil", "pro", "now_pilot"] as const;
const PLAN_LABELS: Record<string, string> = { all: "Toutes", free: "Free", outil: "Outil", pro: "Pro", now_pilot: "Binôme" };

function planBadge(plan: string) {
  switch (plan) {
    case "now_pilot": return <Badge className="bg-pink-500/15 text-pink-600 border-0 text-xs">Binôme</Badge>;
    case "outil": return <Badge className="bg-violet-500/15 text-violet-600 border-0 text-xs">Outil</Badge>;
    case "studio": return <Badge className="bg-amber-500/15 text-amber-600 border-0 text-xs">Binôme</Badge>;
    default: return <Badge variant="secondary" className="text-xs">Free</Badge>;
  }
}

function relativeDate(dateStr: string | null) {
  if (!dateStr) return "jamais";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 86400000) return "aujourd'hui";
  return formatDistanceToNow(d, { addSuffix: true, locale: fr });
}

function formatShortDate(dateStr: string) {
  return format(new Date(dateStr), "d MMM yyyy", { locale: fr });
}

export default function AdminUsersTab() {
  const { user, session } = useAuth();
  const { switchWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    async function fetchUsers() {
      if (!session?.access_token) return;
      setLoading(true);
      try {
        const res = await supabase.functions.invoke("admin-users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: null,
        });
        if (res.data?.users) setUsers(res.data.users);
      } catch (e) {
        console.error("Failed to load users", e);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [session?.access_token]);

  const filtered = useMemo(() => {
    let list = users;
    if (planFilter !== "all") list = list.filter(u => u.plan === planFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.prenom?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    const key = sortKey;
    list = [...list].sort((a, b) => {
      let va: any = a[key], vb: any = b[key];
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [users, planFilter, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="inline w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="inline w-3.5 h-3.5 ml-0.5" />;
  }

  async function openUserWorkspace(u: UserRow) {
    if (!user?.id) return;
    setSwitching(true);
    try {
      // 1. Chercher si l'admin est déjà manager d'un workspace de cette utilisatrice
      const { data: myMemberships } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("role", "manager");

      if (myMemberships && myMemberships.length > 0) {
        for (const m of myMemberships) {
          const { data: clientMember } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", m.workspace_id)
            .eq("user_id", u.user_id)
            .eq("role", "owner")
            .maybeSingle();

          if (clientMember) {
            await switchWorkspace(m.workspace_id);
            navigate("/dashboard");
            return;
          }
        }
      }

      // 2. Pas de workspace existant → en créer un
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({ name: u.prenom || u.email, created_by: user.id } as any)
        .select("id")
        .single();

      if (wsErr || !ws) {
        console.error("Erreur création workspace:", wsErr);
        toast.error("Erreur lors de la création de l'espace");
        return;
      }

      // 3. Ajouter l'admin EN PREMIER (creator can bootstrap)
      const { error: adminErr } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: ws.id, user_id: user.id, role: "manager" } as any);

      if (adminErr) {
        console.error("Erreur ajout admin:", adminErr);
        toast.error("Erreur lors de la configuration de l'espace");
        return;
      }

      // 4. Puis ajouter la cliente comme owner
      const { error: clientErr } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: ws.id, user_id: u.user_id, role: "owner" } as any);

      if (clientErr) {
        console.error("Erreur ajout cliente:", clientErr);
        toast.error("Espace créé mais impossible d'ajouter la cliente");
        return;
      }

      await switchWorkspace(ws.id);
      navigate("/dashboard");
      toast.success("Espace créé et ouvert");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setSwitching(false);
    }
  }

  const thClass = "text-left text-xs font-medium text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PLAN_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPlanFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                planFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {PLAN_LABELS[f]}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} utilisatrice{filtered.length > 1 ? "s" : ""}</span>
        <Button variant="outline" size="sm" onClick={() => {
          const PLAN_CSV: Record<string, string> = { free: "Free", outil: "Outil", studio: "Binôme", now_pilot: "Now Pilot", pro: "Pro" };
          const header = "email;prenom;plan;activite;date_inscription;derniere_connexion";
          const rows = filtered.map((u) => {
            const di = u.created_at ? u.created_at.slice(0, 10) : "";
            const dc = u.last_sign_in ? u.last_sign_in.slice(0, 10) : "";
            return [u.email, u.prenom, PLAN_CSV[u.plan] || u.plan, u.activite || "", di, dc].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(";");
          });
          const csv = "\uFEFF" + header + "\n" + rows.join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `utilisatrices-nowadays-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}>
          <Download className="h-4 w-4 mr-1" />
          Exporter CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucune utilisatrice trouvée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={thClass} onClick={() => toggleSort("prenom")}>Prénom<SortIcon col="prenom" /></th>
                  <th className={thClass} onClick={() => toggleSort("email")}>Email<SortIcon col="email" /></th>
                  <th className={thClass} onClick={() => toggleSort("plan")}>Plan<SortIcon col="plan" /></th>
                  <th className={thClass} onClick={() => toggleSort("branding_score")}>Branding<SortIcon col="branding_score" /></th>
                  <th className={thClass} onClick={() => toggleSort("ai_usage_count")}>Crédits IA<SortIcon col="ai_usage_count" /></th>
                  <th className={thClass} onClick={() => toggleSort("last_sign_in")}>Dernière co.<SortIcon col="last_sign_in" /></th>
                  <th className={thClass} onClick={() => toggleSort("created_at")}>Inscrite le<SortIcon col="created_at" /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.user_id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="py-2.5 px-3 font-medium">{u.prenom || u.email}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs max-w-[180px] truncate">{u.email}</td>
                    <td className="py-2.5 px-3">{planBadge(u.plan)}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <Progress value={u.branding_score} className="w-[60px] h-2" />
                        <span className="text-xs text-muted-foreground">{u.branding_score}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs">{u.ai_usage_count} utilisés</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{relativeDate(u.last_sign_in)}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatShortDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedUser} onOpenChange={open => !open && setSelectedUser(null)}>
        <SheetContent className="overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  {selectedUser.prenom || selectedUser.email}
                  {planBadge(selectedUser.plan)}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </SheetHeader>

              <div className="space-y-6 pt-2">
                {/* Activité */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <UserRound className="w-3.5 h-3.5" /> Activité
                  </h4>
                  <p className="text-sm">{selectedUser.activite || "—"}</p>
                  {selectedUser.activite_type && (
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedUser.activite_type}</p>
                  )}
                </section>

                {/* Branding */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Branding
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">{selectedUser.branding_score}%</span>
                    <Progress value={selectedUser.branding_score} className="flex-1 h-2.5" />
                  </div>
                </section>

                {/* Usage IA */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Usage IA ce mois</h4>
                  <p className="text-lg font-semibold">{selectedUser.ai_usage_count} <span className="text-sm font-normal text-muted-foreground">crédits utilisés</span></p>
                </section>

                {/* Dates */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Dates
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Inscrite le</p>
                      <p>{formatShortDate(selectedUser.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Dernière connexion</p>
                      <p>{relativeDate(selectedUser.last_sign_in)}</p>
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <div className="space-y-2 pt-2">
                  <Button
                    className="w-full"
                    onClick={() => openUserWorkspace(selectedUser)}
                    disabled={switching}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {switching ? "Ouverture..." : "Ouvrir son espace"}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setSelectedUser(null)}>
                    <X className="w-4 h-4 mr-2" /> Fermer
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
