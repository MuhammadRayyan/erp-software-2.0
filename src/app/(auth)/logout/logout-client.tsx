"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/core/auth/auth-client";

export function LogoutClient() {
  const router = useRouter();
  useEffect(() => {
    void authClient.signOut({ fetchOptions: { onSuccess: () => { router.replace("/login"); router.refresh(); } } });
  }, [router]);
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Signing out…</div>
    </main>
  );
}
