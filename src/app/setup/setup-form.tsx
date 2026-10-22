"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { setupSuperAdminAction, type SetupActionResult } from "./actions";

export function SetupForm({ initialKey = "" }: { initialKey?: string }) {
  const [state, formAction, pending] = useActionState(setupSuperAdminAction, null as SetupActionResult | null);
  const [showPassword, setShowPassword] = useState(false);
  const [setupKey, setSetupKey] = useState(initialKey);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error && <FormError message={state.error} />}

      <div className="space-y-1.5">
        <Label htmlFor="setupKey" className="flex items-center gap-1.5 font-medium">
          <KeyRound className="size-3.5 text-primary" /> Setup Key
        </Label>
        <Input
          id="setupKey"
          name="setupKey"
          type="text"
          value={setupKey}
          onChange={(e) => setSetupKey(e.target.value)}
          placeholder="Paste server SETUP_KEY"
          className="font-mono text-xs"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          Configured in the host server environment to verify administrative authorization.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name" className="flex items-center gap-1.5 font-medium">
          <UserRound className="size-3.5 text-muted-foreground" /> Super-Admin Full Name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="e.g. Master Administrator"
          autoComplete="name"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="flex items-center gap-1.5 font-medium">
          <Mail className="size-3.5 text-muted-foreground" /> Super-Admin Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="admin@yourcompany.com"
          autoComplete="email"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          This account will hold platform-level root credentials and cannot be deleted.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="font-medium">Password (Min. 8 characters)</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••••••"
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" size="lg" className="w-full gap-2" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" /> Initializing Super-Admin...
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" /> Initialize Platform Super-Admin <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
