import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { fr } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { AppBackground } from '@/components/shared';
import {
  LayoutDashboard,
  Calendar,
  Plus,
  Users,
  Umbrella,
  Upload,
  BarChart3,
  History,
  Settings,
  Wrench,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: fr.nav.dashboard },
  { to: '/planning', icon: Calendar, label: fr.nav.planning },
  { to: '/add-duty', icon: Plus, label: fr.nav.addDuty },
  { to: '/team', icon: Users, label: fr.nav.team },
  { to: '/holidays', icon: Umbrella, label: fr.nav.holidays },
  { to: '/import', icon: Upload, label: fr.nav.import },
  { to: '/insights', icon: BarChart3, label: fr.nav.insights },
  { to: '/history', icon: History, label: fr.nav.history },
];


const adminItems = [
  { to: '/maintenance', icon: Wrench, label: fr.nav.maintenance },
];

export default function AppLayout() {
  const { user, isAdmin, isApproved, signOut } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (email: string) => {
    return email.slice(0, 2).toUpperCase();
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname === to;
    return (
      <m.div
        whileHover={shouldReduceMotion ? undefined : { x: 3 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <NavLink
          to={to}
          onClick={() => setMobileOpen(false)}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl transition-colors duration-component ease-standard text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5',
            isActive && 'text-sidebar-foreground font-medium',
            sidebarCollapsed && 'justify-center px-2'
          )}
        >
          {isActive && (
            <m.span
              layoutId="active-navigation-indicator"
              className="absolute inset-0 rounded-xl border border-sidebar-primary/25 bg-gradient-to-r from-sidebar-primary/20 via-sidebar-primary/10 to-transparent"
              transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          <span
            className={cn(
              'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-component',
              isActive ? 'bg-sidebar-primary/20 text-sidebar-primary' : 'text-sidebar-foreground/55'
            )}
          >
            <Icon className="w-4 h-4" />
          </span>
          {!sidebarCollapsed && <span className="relative z-10 truncate">{label}</span>}
        </NavLink>
      </m.div>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 px-3 py-5 border-b border-sidebar-border/70',
        sidebarCollapsed && 'justify-center px-2'
      )}>
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-sidebar-primary/30 blur-md" aria-hidden="true" />
          <img
            src="/logo.png"
            alt="Permanences"
            className="relative w-11 h-11 rounded-xl ring-1 ring-white/10"
          />
        </div>

        {!sidebarCollapsed && (
          <div className="truncate">
            <h1 className="font-bold leading-tight text-sidebar-foreground">Permanen</h1>
            <p className="text-[11px] font-medium tracking-wide text-sidebar-primary/80">V2+ · Gestion</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <StaggerContainer as="nav" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <StaggerItem key={item.to}>
            <NavItem {...item} />
          </StaggerItem>
        ))}

        {isAdmin && (
          <>
            <div className={cn(
              'mt-4 mb-2 flex items-center gap-2',
              !sidebarCollapsed ? 'px-3' : 'justify-center'
            )}>
              <div className="h-px flex-1 bg-sidebar-border/70" />
              {!sidebarCollapsed && (
                <span className="text-[10px] font-semibold text-sidebar-foreground/45 uppercase tracking-wider">
                  Admin
                </span>
              )}
              <div className="h-px flex-1 bg-sidebar-border/70" />
            </div>
            {adminItems.map((item) => (
              <StaggerItem key={item.to}>
                <NavItem {...item} />
              </StaggerItem>
            ))}
          </>
        )}
      </StaggerContainer>

      {/* Collapse Button (Desktop) */}
      <div className="hidden lg:flex px-3 py-2 border-t border-sidebar-border/70">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/5"
        >
          <ChevronLeft className={cn(
            'w-4 h-4 transition-transform',
            sidebarCollapsed && 'rotate-180'
          )} />
          {!sidebarCollapsed && <span className="ml-2">Réduire</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen flex w-full bg-background">
      <AppBackground variant="shell" />
      {/* Desktop Sidebar */}
      <m.aside
        animate={{ width: sidebarCollapsed ? 64 : 256 }}
        transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden"
      >
        <SidebarContent />
      </m.aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[280px] max-w-[85vw] bg-sidebar border-sidebar-border">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b bg-card/70 backdrop-blur-md flex items-center justify-between gap-3 px-4 lg:px-6 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 min-w-0 sm:gap-4">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-11 w-11 shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu de navigation"
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Page Title */}
            <h2 className="font-semibold text-base sm:text-lg truncate">
              {navItems.find(item => item.to === location.pathname)?.label ||
               adminItems.find(item => item.to === location.pathname)?.label ||
               'Gestion de Permanences'}
            </h2>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Badge
  variant="secondary"
  className={cn(
    "hidden sm:flex border-0",
    isAdmin ? "bg-gradient-primary text-primary-foreground shadow-sm" : "bg-muted text-foreground"
  )}
>
  {isAdmin ? "Admin" : "Utilisateur"}
</Badge>


            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-11 w-11 rounded-full" aria-label="Menu du compte">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.email ? getInitials(user.email) : '?'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.user_metadata?.full_name || 'Utilisateur'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
  <Settings className="mr-2 h-4 w-4" />
  Profil / Mot de passe
</DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {fr.auth.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition transitionKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
