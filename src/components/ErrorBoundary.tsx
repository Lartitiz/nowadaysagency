import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="text-5xl">😵</div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Oups, quelque chose a planté
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pas de panique ! Tes données sont sauvegardées. Tu peux réessayer ou revenir au tableau de bord.
            </p>
            {this.state.error && (
              <details className="text-left rounded-xl border border-border bg-muted/30 p-3">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Détails techniques
                </summary>
                <pre className="mt-2 text-[11px] text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleReset} variant="outline" className="rounded-full">
                🔄 Réessayer
              </Button>
              <Button onClick={this.handleGoHome} className="rounded-full">
                🏠 Tableau de bord
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
