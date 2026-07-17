import { AlertTriangle } from "lucide-react";
import * as m from "motion/react-m";
import { Button } from "@/components/ui/button";
import { emptyStateIcon, sectionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Une erreur est survenue",
  description = "Le chargement des données a échoué. Vérifiez votre connexion et réessayez.",
  onRetry,
  retryLabel = "Réessayer",
  className,
}: ErrorStateProps) {
  return (
    <m.div
      role="alert"
      variants={sectionVariants}
      initial="initial"
      animate="animate"
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border border-destructive/20 bg-destructive/5 py-12 text-center",
        className,
      )}
    >
      <m.div
        variants={emptyStateIcon}
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <AlertTriangle className="h-6 w-6" />
      </m.div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </m.div>
  );
}
