"use client";

/**
 * A `template` re-mounts on every navigation (unlike a layout), so this gives
 * each in-app page a smooth enter animation. The sidebar lives in the layout,
 * so it stays put while only the page content transitions.
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-page-in h-full">{children}</div>;
}
