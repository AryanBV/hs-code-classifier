"use client";

/**
 * Global error boundary. Replaces the root layout when the layout itself throws,
 * so it must render its own <html> and <body>. Kept intentionally minimal and
 * self-contained: no imports of theme-dependent components, a plain reload action.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f6f1e7",
          color: "#23211c",
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
          <p style={{ margin: 0, lineHeight: 1.6, color: "#6b6457" }}>
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
                backgroundColor: "#8a5a2b",
                color: "#fbf7ef",
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
