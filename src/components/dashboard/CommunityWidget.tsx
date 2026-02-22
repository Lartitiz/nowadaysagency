import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function CommunityWidget() {
  const [latestPost, setLatestPost] = useState<{ content: string } | null>(null);

  useEffect(() => {
    supabase
      .from("community_posts")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setLatestPost(data);
      });
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">👥</span>
        <h3 className="font-display text-lg font-bold text-foreground">Communauté</h3>
      </div>

      {latestPost ? (
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
          "{latestPost.content}"
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">La communauté arrive bientôt ! 🔜</p>
      )}

      <Link
        to="/communaute"
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Voir la communauté <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
