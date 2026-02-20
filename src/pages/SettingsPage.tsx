import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, KeyRound, Trash2, Bell, Mail, Sparkles, Shield } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences (local state — no DB table yet, stored in localStorage)
  const [notifEmail, setNotifEmail] = useState(() => localStorage.getItem("pref_notif_email") !== "false");
  const [notifTips, setNotifTips] = useState(() => localStorage.getItem("pref_notif_tips") !== "false");
  const [notifReminders, setNotifReminders] = useState(() => localStorage.getItem("pref_notif_reminders") !== "false");

  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Mot de passe trop court", description: "6 caractères minimum.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mot de passe mis à jour ✓" });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const togglePref = (key: string, value: boolean, setter: (v: boolean) => void) => {
    localStorage.setItem(key, String(value));
    setter(value);
    toast({ title: "Préférence enregistrée ✓" });
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    // Delete user data first
    if (user) {
      await Promise.all([
        supabase.from("profiles").delete().eq("user_id", user.id),
        supabase.from("brand_profile").delete().eq("user_id", user.id),
        supabase.from("storytelling").delete().eq("user_id", user.id),
        supabase.from("saved_ideas").delete().eq("user_id", user.id),
        supabase.from("calendar_posts").delete().eq("user_id", user.id),
        supabase.from("content_drafts").delete().eq("user_id", user.id),
        supabase.from("tasks").delete().eq("user_id", user.id),
        supabase.from("routine_completions").delete().eq("user_id", user.id),
        supabase.from("plan_tasks").delete().eq("user_id", user.id),
        supabase.from("generated_posts").delete().eq("user_id", user.id),
        supabase.from("highlight_categories").delete().eq("user_id", user.id),
        supabase.from("inspiration_accounts").delete().eq("user_id", user.id),
        supabase.from("inspiration_notes").delete().eq("user_id", user.id),
        supabase.from("launches").delete().eq("user_id", user.id),
      ]);
    }
    await signOut();
    setDeleting(false);
    toast({ title: "Compte supprimé. À bientôt peut-être 💛" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-pale flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Paramètres</h1>
            <p className="text-sm text-muted-foreground">Gère ton compte et tes préférences.</p>
          </div>
        </div>

        {/* ─── Account info ─── */}
        <Section icon={<Shield className="h-4 w-4" />} title="Mon compte">
          <div>
            <label className="text-xs font-mono-ui text-muted-foreground uppercase tracking-wide">Email</label>
            <p className="text-sm text-foreground mt-1">{user?.email}</p>
          </div>
        </Section>

        {/* ─── Change password ─── */}
        <Section icon={<KeyRound className="h-4 w-4" />} title="Changer de mot de passe">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nouveau mot de passe</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="rounded-[10px] h-11"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Confirmer</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répète ton nouveau mot de passe"
                className="rounded-[10px] h-11"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword}
              className="rounded-full bg-primary text-primary-foreground hover:bg-bordeaux"
            >
              {changingPassword ? "Modification..." : "Mettre à jour"}
            </Button>
          </div>
        </Section>

        {/* ─── Notification preferences ─── */}
        <Section icon={<Bell className="h-4 w-4" />} title="Préférences de notification">
          <div className="space-y-4">
            <PrefRow
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              label="Emails de suivi"
              description="Reçois un récap hebdomadaire de ta progression."
              checked={notifEmail}
              onCheckedChange={(v) => togglePref("pref_notif_email", v, setNotifEmail)}
            />
            <PrefRow
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              label="Conseils & astuces"
              description="Reçois des conseils com' personnalisés par email."
              checked={notifTips}
              onCheckedChange={(v) => togglePref("pref_notif_tips", v, setNotifTips)}
            />
            <PrefRow
              icon={<Bell className="h-4 w-4 text-muted-foreground" />}
              label="Rappels de routines"
              description="Un petit rappel quand tu oublies tes routines."
              checked={notifReminders}
              onCheckedChange={(v) => togglePref("pref_notif_reminders", v, setNotifReminders)}
            />
          </div>
        </Section>

        {/* ─── Danger zone ─── */}
        <div className="mt-8 rounded-2xl border-2 border-destructive/20 bg-card p-6">
          <h2 className="font-display text-lg font-bold text-destructive mb-2 flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Zone dangereuse
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            La suppression de ton compte est irréversible. Toutes tes données seront effacées.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="rounded-full">
                Supprimer mon compte
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tu es sûre ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Toutes tes données (profil, branding, storytelling, idées, calendrier, routines) seront supprimées définitivement. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Suppression..." : "Oui, supprimer mon compte"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 mb-4">
      <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

/* ─── Preference row ─── */
function PrefRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
