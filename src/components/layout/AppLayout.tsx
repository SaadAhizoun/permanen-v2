import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { fr } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <NavLink
        to={to}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
          isActive && 'bg-sidebar-accent text-sidebar-foreground font-medium',
          sidebarCollapsed && 'justify-center px-2'
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!sidebarCollapsed && <span className="truncate">{label}</span>}
      </NavLink>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-1 px-1 py-6 border-b border-sidebar-border',
        sidebarCollapsed && 'justify-center px-2'
      )}>
        <img
  src="/logo.png"
  alt="Permanences"
  className="w-16 h-16 rounded-xl flex-shrink-0"
/>

        {!sidebarCollapsed && (
          <div className="truncate">
            <h1 className="font-bold text-sidebar-foreground">Permanen</h1>
            <p className="text-xs text-sidebar-foreground/60">V2+</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        
        {isAdmin && (
          <>
            <div className={cn(
              'pt-4 pb-2',
              !sidebarCollapsed && 'px-3'
            )}>
              {!sidebarCollapsed && (
                <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Admin
                </span>
              )}
            </div>
            {adminItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Collapse Button (Desktop) */}
      <div className="hidden lg:flex px-3 py-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
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
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Page Title - could be dynamic */}
            <h2 className="font-semibold text-lg hidden sm:block">
              {navItems.find(item => item.to === location.pathname)?.label || 
               adminItems.find(item => item.to === location.pathname)?.label ||
               'Gestion de Permanences'}
            </h2>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <Badge
  variant="secondary"
  className={cn(
    "hidden sm:flex",
    isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
  )}
>
  {isAdmin ? "Admin" : "Utilisateur"}
</Badge>


            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
