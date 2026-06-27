"use client";

import { SWRConfig } from "swr";
import { ToastProvider } from "@/components/Toast";
import { swrFetcher } from "@/lib/fetcher";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        dedupingInterval: 30_000,
        revalidateOnFocus: true,
        keepPreviousData: true,
      }}
    >
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
