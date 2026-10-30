"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";

type Theme = "light" | "dark" | "system";
const order: Theme[] = ["system", "light", "dark"];

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { setTheme((localStorage.getItem("zent-theme") as Theme) || "system"); } catch { /* storage blocked */ }
  }, []);
  const next = () => {
    const t = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(t);
    try { localStorage.setItem("zent-theme", t); } catch { /* storage blocked */ }
    apply(t);
  };
  const Icon = { light: Sun, dark: Moon, system: Monitor }[theme];
  return (
    <Button variant="ghost" size="icon" onClick={next} aria-label={`Theme: ${theme}. Click to change`} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
