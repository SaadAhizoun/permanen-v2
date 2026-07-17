import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, PublicRoute } from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import { LoadingState } from "@/components/shared";
import { MotionProvider } from "@/components/motion";
import { lazy, Suspense } from "react";
import Auth from "@/pages/Auth";
import AwaitingApproval from "@/pages/AwaitingApproval";
import Dashboard from "@/pages/Dashboard";
import Planning from "@/pages/Planning";
import AddDuty from "@/pages/AddDuty";
import Team from "@/pages/Team";
import Holidays from "@/pages/Holidays";
import Maintenance from "@/pages/Maintenance";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import Profile from '@/pages/Profile';

const Import = lazy(() => import("@/pages/Import"));
const Insights = lazy(() => import("@/pages/Insights"));
const History = lazy(() => import("@/pages/History"));

const routeFallback = <LoadingState variant="cards" rows={4} />;

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <MotionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/awaiting-approval" element={<AwaitingApproval />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/add-duty" element={<AddDuty />} />
                <Route path="/team" element={<Team />} />
                <Route path="/holidays" element={<Holidays />} />
                <Route path="/import" element={<Suspense fallback={routeFallback}><Import /></Suspense>} />
                <Route path="/insights" element={<Suspense fallback={routeFallback}><Insights /></Suspense>} />
                <Route path="/history" element={<Suspense fallback={routeFallback}><History /></Suspense>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/maintenance" element={<ProtectedRoute requireAdmin><Maintenance /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </MotionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
