import { Container, LayoutDashboard, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Containers", href: "/containers", icon: Container },
];
