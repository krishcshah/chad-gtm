"use client";

import { useEffect, useRef, type ElementType, type ComponentPropsWithoutRef } from "react";

type RevealProps<T extends ElementType> = {
  as?: T;
  /** Delay in ms, for staggering siblings. */
  delay?: number;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Fades and lifts its content in the first time it scrolls into view.
 * Content is visible without JavaScript (the attribute is only added on the
 * client) and with reduced motion (see globals.css).
 */
export function Reveal<T extends ElementType = "div">({ as, delay = 0, style, ...props }: RevealProps<T>) {
  const ref = useRef<HTMLElement>(null);
  const Tag = (as ?? "div") as ElementType;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-reveal", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.setAttribute("data-shown", "true");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <Tag ref={ref} style={{ ...style, ["--reveal-delay" as string]: `${delay}ms` }} {...props} />;
}
