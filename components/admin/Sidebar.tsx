"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  Music2, 
  Upload, 
  Settings, 
  LogOut, 
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

const navItems = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Beatmaps", href: "/admin/beatmaps", icon: Music2 },
  { name: "Upload", href: "/admin/beatmaps/upload", icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card/30 backdrop-blur-xl">
      <div className="flex h-full flex-col px-4 py-6">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3 px-2">
          <span className="font-heading text-xl font-bold tracking-tight glow-blue">
            LANY
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                {item.name}
                
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute left-0 h-6 w-1 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <ChevronRight className={cn(
                  "ml-auto h-4 w-4 opacity-0 transition-all duration-200 group-hover:opacity-100",
                  isActive ? "translate-x-0 opacity-40" : "-translate-x-2"
                )} />
              </Link>
            );
          })}
        </nav>

        {/* User Info & Settings */}
        <div className="mt-auto space-y-4">
          <Separator className="bg-border/50" />
          
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground ring-1 ring-border">
              {user?.username?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="flex flex-col overflow-hidden text-xs">
              <span className="truncate font-semibold text-foreground">{user?.username ?? "Admin"}</span>
              <span className="truncate text-muted-foreground opacity-70">{user?.email ?? "admin@lany.osu"}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
