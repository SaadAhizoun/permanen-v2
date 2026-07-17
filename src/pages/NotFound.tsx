import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/motion";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PageTransition className="flex min-h-screen items-center justify-center bg-background px-4">
      <StaggerContainer className="flex flex-col items-center text-center gap-4">
        <StaggerItem>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Compass className="h-7 w-7" />
          </div>
        </StaggerItem>
        <StaggerItem>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Page introuvable</h1>
            <p className="mt-2 text-muted-foreground">
              Cette page n'existe pas ou a été déplacée.
            </p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <Button asChild>
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </PageTransition>
  );
};

export default NotFound;
