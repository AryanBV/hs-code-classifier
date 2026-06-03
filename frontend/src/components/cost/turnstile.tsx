"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile — invisible/managed bot check, wired for programmatic
 * execution at submit time.
 *
 * THE NO-OP INVARIANT (verified hard by review):
 * When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is UNSET (the current production state)
 * this module is a 100% no-op: `isTurnstileEnabled()` is false, the `<Turnstile>`
 * mount renders `null`, and `useTurnstile().getToken()` resolves to `null`, so the
 * classify request body is byte-for-byte unchanged. Nothing loads, nothing
 * renders, nothing blocks. Only when the site key IS set does a hidden widget
 * mount and issue a token on demand.
 *
 * Degrades gracefully: if the script fails to load or the widget errors / times
 * out while ENABLED, `getToken()` rejects with `TurnstileError` so the caller can
 * surface a friendly retry rather than crash.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** How long we wait for `execute()` to deliver a token before giving up. */
const EXECUTE_TIMEOUT_MS = 20_000;

export const isTurnstileEnabled = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/** Thrown when an ENABLED widget cannot produce a token (load/exec/timeout). */
export class TurnstileError extends Error {
  constructor(message = "Verification could not be completed.") {
    super(message);
    this.name = "TurnstileError";
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  theme?: "auto" | "light" | "dark";
}

interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  execute: (el: HTMLElement | string, options?: TurnstileRenderOptions) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId: string) => string | undefined;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject());
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject());
    document.head.appendChild(script);
  });

  return scriptPromise;
}

// ----------------------------------------------------------------------------
// Imperative submit-time token API (invisible/managed).
// ----------------------------------------------------------------------------

export interface UseTurnstile {
  /** True only when a site key is configured. */
  enabled: boolean;
  /**
   * Resolve to a single-use Turnstile token, or `null` when DISABLED (no key).
   * Rejects with `TurnstileError` when enabled but the widget cannot deliver a
   * token (script blocked, widget error, or timeout) so callers can retry.
   */
  getToken: () => Promise<string | null>;
  /** Mount this where the (invisible) widget should live. Renders null when disabled. */
  widget: React.ReactNode;
}

/**
 * Hook giving submit-time access to an invisible Turnstile token. The returned
 * `widget` node must be rendered for the token machinery to exist; when the site
 * key is unset it is `null` and `getToken()` resolves to `null` (pure no-op).
 */
export function useTurnstile(): UseTurnstile {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);
  // The single in-flight execute() resolver/rejecter pair, if any.
  const pendingRef = React.useRef<{
    resolve: (token: string) => void;
    reject: (err: TurnstileError) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const settle = React.useCallback(
    (outcome: { token: string } | { error: TurnstileError }) => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      clearTimeout(pending.timer);
      if ("token" in outcome) {
        pending.resolve(outcome.token);
      } else {
        pending.reject(outcome.error);
      }
    },
    [],
  );

  // Mount the widget once (enabled only). `execution: "execute"` keeps it dormant
  // until we call turnstile.execute() at submit time — no token is issued, no
  // user friction appears, until then.
  React.useEffect(() => {
    if (!SITE_KEY) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        const el = containerRef.current;
        const api = window.turnstile;
        if (!el || !api) return;
        widgetIdRef.current = api.render(el, {
          sitekey: SITE_KEY,
          appearance: "execute",
          execution: "execute",
          theme: "auto",
          callback: (token: string) => settle({ token }),
          "error-callback": () => settle({ error: new TurnstileError() }),
          "expired-callback": () => settle({ error: new TurnstileError() }),
          "timeout-callback": () => settle({ error: new TurnstileError() }),
        });
      })
      .catch(() => {
        // Script blocked/offline: any pending execute() must reject so the UI
        // can offer a retry rather than hang.
        if (!cancelled) settle({ error: new TurnstileError() });
      });

    return () => {
      cancelled = true;
      settle({ error: new TurnstileError("Verification was interrupted.") });
      const api = window.turnstile;
      if (api && widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // best-effort cleanup
        }
        widgetIdRef.current = null;
      }
    };
  }, [settle]);

  const getToken = React.useCallback((): Promise<string | null> => {
    // DISABLED: the pure no-op path — no token, body unchanged.
    if (!SITE_KEY) return Promise.resolve(null);

    return new Promise<string | null>((resolve, reject) => {
      const api = typeof window !== "undefined" ? window.turnstile : undefined;
      const el = containerRef.current;
      if (!api || !el || !widgetIdRef.current) {
        reject(new TurnstileError());
        return;
      }

      // Only one execute() may be in flight; supersede any stale one.
      settle({ error: new TurnstileError("Superseded by a newer request.") });

      const timer = setTimeout(
        () => settle({ error: new TurnstileError("Verification timed out.") }),
        EXECUTE_TIMEOUT_MS,
      );
      pendingRef.current = {
        resolve: (token: string) => resolve(token),
        reject,
        timer,
      };

      try {
        // Fresh token each time: reset clears any consumed single-use token,
        // then execute() runs the (invisible) challenge and fires `callback`.
        api.reset(widgetIdRef.current);
        api.execute(el);
      } catch {
        settle({ error: new TurnstileError() });
      }
    });
  }, [settle]);

  const widget = SITE_KEY ? (
    <div
      ref={containerRef}
      aria-hidden="true"
      // Invisible/managed: kept out of layout and the a11y tree. The managed
      // challenge only surfaces interactive UI if Cloudflare deems it necessary.
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    />
  ) : null;

  return { enabled: Boolean(SITE_KEY), getToken, widget };
}

// ----------------------------------------------------------------------------
// Declarative widget (retained, additive). Renders null when unconfigured.
// ----------------------------------------------------------------------------

export interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
}

export function Turnstile({
  onVerify,
  onError,
  onExpire,
  className,
}: TurnstileProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);

  // Keep latest callbacks without re-rendering the widget. Syncing the refs in
  // an effect (not during render) keeps render pure: the rendered output never
  // depends on these refs, so an effect is the correct, lint-clean place.
  const onVerifyRef = React.useRef(onVerify);
  const onErrorRef = React.useRef(onError);
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => {
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  }, [onVerify, onError, onExpire]);

  React.useEffect(() => {
    if (!SITE_KEY) {
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        const el = containerRef.current;
        const api = window.turnstile;
        if (!el || !api) return;

        widgetIdRef.current = api.render(el, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token: string) => onVerifyRef.current(token),
          "error-callback": () => onErrorRef.current?.(),
          "expired-callback": () => onExpireRef.current?.(),
        });
      })
      .catch(() => {
        // Script failed to load (offline/blocked): stay silent, do not throw.
        onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      const api = window.turnstile;
      if (api && widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // best-effort cleanup
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) {
    return null;
  }

  return <div ref={containerRef} className={className} />;
}
