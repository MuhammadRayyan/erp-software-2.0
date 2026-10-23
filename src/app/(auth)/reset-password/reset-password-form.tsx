"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { completePasswordResetAction } from "./actions";

export function ResetPasswordForm({
  token,
  email,
  userName,
}: {
  token: string;
  email: string;
  userName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const res = await completePasswordResetAction({
        token,
        password,
        confirmPassword,
      });

      if (res.error) {
        setError(res.error);
        setPending(false);
        return;
      }

      router.push(`/login?reset=1&email=${encodeURIComponent(res.email || email)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-[25px] font-semibold tracking-[-0.03em] text-foreground">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resetting password for {userName ? `${userName} (${email})` : <strong className="text-foreground">{email}</strong>}
        </p>
      </div>

      {error && <FormError message={error} />}

      <div className="space-y-1.5">
        <Label htmlFor="password">New Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="pr-10"
            autoFocus
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your new password"
          required
        />
      </div>

      <div className="pt-2">
        <Button type="submit" size="lg" className="w-full gap-1.5" disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              Update Password & Sign In <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <span>All previous active sessions on other devices will be revoked</span>
      </div>
    </form>
  );
}
