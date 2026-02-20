import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import ContentWorkshop from "@/components/ContentWorkshop";
import SidebarPanel from "@/components/SidebarPanel";

export interface UserProfile {
  prenom: string;
  activite: string;
  type_activite: string;
  cible: string;
  probleme_principal: string;
  piliers: string[];
  tons: string[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as UserProfile);
    };
    fetchProfile();
  }, [user]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">
        <div className="mb-8">
          <h1 className="font-display text-[22px] sm:text-3xl md:text-4xl font-bold text-foreground">
            Hey {profile.prenom}, on crée quoi aujourd'hui ?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Ton atelier de contenu est prêt. Choisis un format, donne un sujet, et let's go.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <ContentWorkshop profile={profile} onIdeaGenerated={() => {}} />
          <SidebarPanel />
        </div>
      </main>
    </div>
  );
}
