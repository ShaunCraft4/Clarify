"use client";

import { ToastProvider } from "@/components/Toast";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
