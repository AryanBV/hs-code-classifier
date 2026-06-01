"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile widget (invisible/managed bot check).
 *
 * Degrades gracefully: renders `null` unless `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * is set (the current state). When set, it loads the Turnstile script once,
 * renders the widget, and calls `onVerify(token)` on success. Never throws
 * when unconfigured.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const isTurnstileEnabled = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      appearance?: "always" | "execute" | "interaction-only";
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  remove: (widgetId: string) => void;
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

  // Keep latest callbacks without re-rendering the widget.
  const onVerifyRef = React.useRef(onVerify);
  const onErrorRef = React.useRef(onError);
  const onExpireRef = React.useRef(onExpire);
  onVerifyRef.current = onVerify;
  onErrorRef.current = onError;
  onExpireRef.current = onExpire;

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
