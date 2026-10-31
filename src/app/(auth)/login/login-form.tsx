"use client";
import { FormError } from "@/components/form-error";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/core/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import Link from "next/link";

export function LoginForm({
  redirectTo = "/businesses",
  initialEmail = "",
}: {
  redirectTo?: string;
  initialEmail?: string;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("uae_manager_remember_me") ?? localStorage.getItem("ledgerly_remember_me");
      if (saved !== null) {
        setRememberMe(saved === "true");
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      localStorage.setItem("uae_manager_remember_me", String(rememberMe));
    } catch {
      // LocalStorage write ignored
    }

    // Rate limiting is enforced server-side by the auth handler
    // (better-auth hooks + built-in rate limits); error messages surface here.
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
        rememberMe: Boolean(rememberMe),
      });

      if (result.error) {
        setError(result.error.message ?? "Sign in failed. Check your details and try again.");
        setPending(false);
        return;
      }

      // Full document navigation ensures the newly set session cookie is immediately
      // committed and applied across all server components and layouts.
      const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/businesses";
      window.location.href = safeRedirect;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed. Check your network or credentials.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} method="POST" className="space-y-5" noValidate>
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
          defaultValue={initialEmail || (process.env.NODE_ENV === "development" ? "admin@demo.local" : "")}
          required
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <div className="flex items-center gap-2">
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline"
            >
              Forgot password?
            </Link>
            {process.env.NODE_ENV === "development" && (
              <span className="text-xs text-muted-foreground">· Demo: demo12345</span>
            )}
          </div>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            defaultValue={process.env.NODE_ENV === "development" ? "demo12345" : ""}
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
          <input
            id="rememberMe"
            name="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="size-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
          />
          <span>Remember me on this device</span>
        </label>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
      </Button>
    </form>
  );
}
