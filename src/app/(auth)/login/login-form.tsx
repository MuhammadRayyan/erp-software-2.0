"use client";
import { FormError } from "@/components/form-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/core/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);

    // Rate limiting is enforced server-side by the auth handler
    // (better-auth hooks + built-in rate limits); error messages surface here.
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    if (result.error) {
      setError(result.error.message ?? "Sign in failed. Check your details and try again.");
      setPending(false);
      return;
    }

    // Use router.push + refresh so Next.js re-fetches server state cleanly.
    router.push("/businesses");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-[25px] font-semibold tracking-[-0.03em]">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to continue to your businesses.</p>
      </div>
      {error && (
        <FormError message={error} />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={process.env.NODE_ENV === "development" ? "admin@demo.local" : ""}
          required
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {process.env.NODE_ENV === "development" && (
            <span className="text-xs text-muted-foreground">Demo: demo12345</span>
          )}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue={process.env.NODE_ENV === "development" ? "demo12345" : ""}
          required
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
      </Button>
    </form>
  );
}
