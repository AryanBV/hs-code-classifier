"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Returns false during SSR and the first client render, then true once
 * hydrated. Uses useSyncExternalStore (a never-changing subscription) so there
 * is no setState-in-effect: the server snapshot is false, the client snapshot
 * is true, and React reconciles them on hydration without a cascading render.
 */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * ThemeToggle — flips between the light (aged paper) and warm-dark (lamplit
 * ledger) themes. Guards against a hydration mismatch with a mounted check,
 * since the resolved theme is only known on the client.
 *
 * Carries `aria-pressed` so the control honestly reports state (dark = pressed),
 * and crossfades the sun/moon on a calm, compositor-only transition that
 * reduced-motion neutralizes globally.
 */
function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      // Reflect state for AT. Until mounted, the resolved theme is unknown.
      aria-pressed={mounted ? isDark : undefined}
      aria-label={
        mounted
          ? isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
          : "Toggle theme"
      }
    >
      {/* Both icons share the cell and crossfade; one stable glyph pre-mount. */}
      <span aria-hidden="true" className="relative grid size-5 place-items-center">
        <Sun
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,transform] duration-200 ease-[var(--ease-ledger)]",
            isDark ? "scale-100 opacity-100" : "scale-90 opacity-0",
          )}
        />
        <Moon
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,transform] duration-200 ease-[var(--ease-ledger)]",
            isDark ? "scale-90 opacity-0" : "scale-100 opacity-100",
          )}
        />
      </span>
    </Button>
  );
}

export { ThemeToggle };
