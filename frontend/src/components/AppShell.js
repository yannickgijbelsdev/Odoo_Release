import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Settings, History, LogOut, Sun, Moon, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/activiteit", label: "Activiteit", icon: History, testid: "nav-activity" },
  { to: "/instellingen", label: "Instellingen", icon: Settings, testid: "nav-settings" },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = React.useState(!document.documentElement.classList.contains("dark") ? false : true);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    setDark(isDark);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/40 p-4 gap-2">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-extrabold tracking-tight leading-none">Odoo Reminders</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Debiteurenbeheer</p>
          </div>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={n.testid}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}>
            <n.icon className="h-4 w-4" /> {n.label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-2">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start" data-testid="theme-toggle">
            {dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {dark ? "Lichte modus" : "Donkere modus"}
          </Button>
          <div className="px-3 py-2 rounded-lg bg-accent/50">
            <p className="text-xs font-medium truncate" data-testid="current-user-email">{user?.email}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{user?.role}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="w-full justify-start" data-testid="logout-button">
            <LogOut className="h-4 w-4 mr-2" /> Uitloggen
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <span className="font-extrabold">Odoo Reminders</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
