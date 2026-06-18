"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A lightweight top loading bar (NProgress-style) that appears whenever the
 * user navigates between pages, so a slow server render never looks frozen.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (timer.current) clearInterval(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
    setProgress(8);
    timer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        // Ease toward 90% then wait for the route to actually change.
        return p + Math.max(1, (90 - p) * 0.12);
      });
    }, 200);
  }

  function done() {
    if (timer.current) clearInterval(timer.current);
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }

  // Begin the bar when an internal link is clicked.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey)
        return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || target === "_blank" || href.startsWith("#")) return;
      if (!href.startsWith("/")) return;
      // Skip if navigating to the same URL.
      const current = pathname + (searchParams.toString() ? `?${searchParams}` : "");
      if (href === current) return;
      start();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname, searchParams]);

  // Finish whenever the route (path or query) actually changes.
  useEffect(() => {
    done();
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none">
      <div
        className="relative h-full bg-brand-600 transition-all duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
      >
        {/* glowing leading edge */}
        <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-r from-transparent to-brand-400 shadow-[0_0_12px_3px_rgba(51,117,255,0.7)]" />
      </div>
    </div>
  );
}
