import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge does not know this project's custom @theme font sizes
 * (text-eyebrow ... text-code from globals.css). Without this, it mistakes a
 * size class like `text-body` for a text COLOR and, when a primary button
 * carries both `text-accent-contrast` (the cream ink) and `text-body` (its
 * size), it assumes they conflict and silently drops the colour. That left
 * every primary button's label falling back to a dark inherited colour, about
 * 1.16:1 on the oxblood fill (unreadable). Registering the custom font-size
 * names keeps sizes and colours in separate groups so both survive the merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "eyebrow",
            "meta",
            "body",
            "label",
            "section",
            "title",
            "display",
            "code",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
