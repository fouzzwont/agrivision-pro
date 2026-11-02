import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ScanSearch,
  Map,
  Activity,
  Bell,
  FileText,
  CreditCard,
  Settings,
  Leaf,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Disease Detection", url: "/detection", icon: ScanSearch },
  { title: "Risk Map", url: "/risk-map", icon: Map },
  { title: "Field Monitoring", url: "/field", icon: Activity },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="glass-strong border-r">
      <SidebarHeader className="border-b glass">
        <Link to="/" className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground glossy">
            <Leaf className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-semibold tracking-tight">AgriVision</span>
            <span className="text-[11px] text-muted-foreground">Crop Intelligence</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="glass">
        <SidebarGroup>
          <SidebarGroupLabel className="glass">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.url === "/" ? path === "/" : path.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        active ? "bg-primary/15 text-primary" : "hover:bg-secondary/50",
                        "glass-transparent",
                      )}
                    >
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.title === "Alerts" && (
                          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] group-data-[collapsible=icon]:hidden">
                            14
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t glass">
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Pilot mode</div>
          Connected to FOMACOP Estate · Marrakech-Safi
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
