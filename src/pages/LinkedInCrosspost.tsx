import AppHeader from '@/components/AppHeader';
import SubPageHeader from '@/components/SubPageHeader';
import CrosspostFlow from '@/components/CrosspostFlow';
import { RefreshCw } from 'lucide-react';

/** Keep the existing URL and LinkedIn navigation, with the same crosspost engine. */
export default function LinkedInCrosspost() {
  return <div className="min-h-screen bg-background">
    <AppHeader />
    <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
      <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Crossposting" />
      <h1 className="font-display text-2xl font-bold text-foreground mb-1 flex items-center gap-2"><RefreshCw className="h-6 w-6 text-primary" aria-hidden="true" /> Crossposting intelligent</h1>
      <p className="text-sm text-muted-foreground mb-6">Un contenu source → adapté pour chaque canal. Chaque version apporte un angle spécifique.</p>
      <CrosspostFlow />
    </main>
  </div>;
}
