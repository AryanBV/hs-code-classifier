"use client";

import * as React from "react";

/**
 * Global error boundary. Replaces the root layout when the layout itself throws,
 * so it must render its own <html> and <body>. Kept intentionally minimal and
 * self-contained: no imports of theme-dependent components, a plain reload action.
 *
 * It renders OUTSIDE <body>, so CSS custom properties are unavailable and the
 * palette must be inlined as literal hex. The values below are the exact
 * Foundation LIGHT-theme token snapshot used by lib/pdf.tsx and
 * app/r/[id]/opengraph-image.tsx, so the crash screen stays on-brand.
 */
const C = {
  bg: "#e3dfd7", // --bg (desk)
  ink: "#27221d", // --ink
  inkMuted: "#5f5952", // --ink-muted
  accent: "#893624", // --accent (oxblood)
  accentContrast: "#fbfaf7", // --accent-contrast (text on accent fills)
} as const;

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surface the boundary error to the console so the crash is diagnosable; the
  // visible copy stays calm and generic.
  React.useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.bg,
          color: C.ink,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main
          style={{
            maxWidth: "28rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong.
          </h1>
          <p style={{ margin: 0, lineHeight: 1.6, color: C.inkMuted }}>
            The page could not be loaded. Please reload to try again.
          </p>
          <div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                appearance: "none",
                cursor: "pointer",
                borderRadius: "0.375rem",
                border: "1px solid transparent",
                backgroundColor: C.accent,
                color: C.accentContrast,
                padding: "0.7rem 1.25rem",
                fontSize: "0.95rem",
                fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
