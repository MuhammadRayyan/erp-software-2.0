"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  ChevronDown,
  Lock,
  Moon,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

type LandingHeroProps = {
  user?: {
    id: string;
    name: string;
    email: string;
    isSuperAdmin?: boolean;
  } | null;
};

export function LandingHero({ user }: LandingHeroProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Track window scroll for smooth multi-layer parallax depth
  useEffect(() => {
    setMounted(true);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Parallax mathematical offsets & scales (pure composite transforms)
  // 1. Hero text zoom-in-from-back effect
  const heroProgress = Math.min(scrollY / 600, 1);
  const heroScale = 0.85 + heroProgress * 0.35; // Grows from 0.85x to 1.2x as you scroll
  const heroTranslateY = scrollY * 0.3; // Gentle downward drift
  const heroOpacity = Math.max(1 - heroProgress * 1.2, 0);

  // 2. Ambient background orbs parallax
  const bgOrb1Y = scrollY * 0.2;
  const bgOrb2Y = scrollY * 0.45;

  // 3. Narrative statements parallax offsets
  const narrative1Y = Math.max((scrollY - 400) * 0.15, 0);
  const narrative2Y = Math.max((scrollY - 900) * 0.15, 0);
  const narrative3Y = Math.max((scrollY - 1400) * 0.15, 0);

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. Glassmorphism Top Navigation Bar */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border/50 bg-background/80 px-4 sm:px-8 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Enterprise Cloud · SSL 443
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme switcher */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Toggle color theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          )}

          {/* User Status / Direct CTA */}
          {user ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="primary" size="sm" className="h-9 gap-1.5 font-medium shadow-xs">
                <Link href="/businesses">
                  <User className="size-3.5" />
                  <span>Workspaces</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <Button asChild variant="primary" size="sm" className="h-9 gap-1.5 font-medium shadow-xs">
              <Link href="/login">
                <span>Sign In</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. Deep Parallax Ambient Canvas (Layer 0) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />

        {/* Ambient Orb 1 (Top Center Glow) */}
        <div
          className="absolute -top-32 left-1/2 size-[650px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-primary/20 via-indigo-500/15 to-transparent blur-3xl will-change-transform"
          style={{
            transform: `translate3d(-50%, ${bgOrb1Y}px, 0)`,
          }}
        />

        {/* Ambient Orb 2 (Lower Right Glow) */}
        <div
          className="absolute top-[800px] right-[-10%] size-[500px] rounded-full bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent blur-3xl will-change-transform"
          style={{
            transform: `translate3d(0, ${bgOrb2Y}px, 0)`,
          }}
        />
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. Monumental Parallax Hero (Layer 1 & 2) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-4 pt-12 pb-24 text-center">
        {/* Top Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-2xs backdrop-blur-md">
          <Sparkles className="size-3.5 text-primary" />
          <span>NEXT-GENERATION ENTERPRISE ACCOUNTING</span>
        </div>

        {/* Big Hero Text: Zooms / Scales forward from the back with parallax */}
        <div
          className="mt-8 max-w-5xl will-change-transform"
          style={{
            transform: `translate3d(0, ${heroTranslateY}px, 0) scale(${heroScale})`,
            opacity: heroOpacity,
          }}
        >
          <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] text-foreground">
            PRECISION ACCOUNTING.
            <br />
            <span className="bg-gradient-to-r from-primary via-indigo-600 to-sky-500 bg-clip-text text-transparent dark:from-sky-400 dark:via-primary dark:to-indigo-300">
              UNCOMPROMISED SPEED.
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground font-normal leading-relaxed">
            Zero-latency multi-entity ledgers, statutory UAE VAT & Corporate Tax, and fully isolated local database
            architecture for modern organizations.
          </p>
        </div>

        {/* Call to Action Container */}
        <div className="mt-12 flex flex-col items-center gap-4 z-10">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground/90 tracking-wide uppercase">
            To continue, please sign in to your workspace
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {user ? (
              <Button asChild size="lg" className="h-13 px-8 text-base font-semibold shadow-md gap-2">
                <Link href="/businesses">
                  <span>Enter My Workspaces</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="h-13 px-8 text-base font-semibold shadow-md gap-2">
                <Link href="/login">
                  <span>Sign In to Continue</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}

            <Button
              variant="secondary"
              size="lg"
              className="h-13 px-6 text-sm font-medium"
              onClick={() => {
                window.scrollTo({ top: window.innerHeight * 0.9, behavior: "smooth" });
              }}
            >
              Learn More
            </Button>
          </div>

          {user && (
            <p className="text-xs text-muted-foreground">
              Signed in as <strong className="text-foreground">{user.name}</strong> ({user.email})
            </p>
          )}
        </div>

        {/* Scroll down indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-xs text-muted-foreground/70 animate-bounce">
          <span>Scroll to explore</span>
          <ChevronDown className="size-4" />
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. Parallax Narrative Statements (Pure Typography & Depth — NO Cards) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-24 space-y-40">
        {/* Narrative Statement 1 */}
        <div
          className="will-change-transform transition-transform duration-75"
          style={{ transform: `translate3d(0, -${narrative1Y}px, 0)` }}
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-primary uppercase">
            <span className="size-1.5 rounded-full bg-primary" />
            01 / True Architecture
          </div>
          <h2 className="mt-3 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]">
            ZERO-LATENCY ISOLATION.
            <br />
            EVERY BUSINESS IN ITS OWN DATABASE.
          </h2>
          <p className="mt-6 max-w-3xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
            Unlike legacy multi-tenant SaaS that pools thousands of companies into one congested SQL database, Ledgerly
            spins up an independent, encrypted SQLite ledger for each legal entity. Zero cross-tenant leakage, zero shared
            table locks, and instant backups.
          </p>
        </div>

        {/* Narrative Statement 2 */}
        <div
          className="will-change-transform transition-transform duration-75"
          style={{ transform: `translate3d(0, -${narrative2Y}px, 0)` }}
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            02 / Compliance
          </div>
          <h2 className="mt-3 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]">
            BUILT-IN STATUTORY UAE VAT,
            <br />
            CORPORATE TAX & PAYROLL.
          </h2>
          <p className="mt-6 max-w-3xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
            Generate FTA-compliant Tax Invoices, automated UAE VAT 201 return worksheets with box-by-box auditing, and
            execute batch monthly employee payroll with statutory End of Service (EOSB) gratuity calculations according to
            UAE Federal Decree Law No. 33.
          </p>
        </div>

        {/* Narrative Statement 3 */}
        <div
          className="will-change-transform transition-transform duration-75"
          style={{ transform: `translate3d(0, -${narrative3Y}px, 0)` }}
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">
            <span className="size-1.5 rounded-full bg-indigo-500" />
            03 / Resilience
          </div>
          <h2 className="mt-3 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]">
            MILITARY-GRADE INTEGRITY.
            <br />
            FULL AUDIT LOGGING & SECURITY.
          </h2>
          <p className="mt-6 max-w-3xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
            Every transaction, modification, void, and permission change is recorded in an immutable audit ledger.
            Enforced with bcrypt/scrypt cryptographic authentication, automated SSL certificate issuance, and isolated
            enterprise hosting.
          </p>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. Bottom Grand Finale Call-to-Action */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-border/60 bg-surface/50 py-24 px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest">
            <Lock className="size-3.5" /> Secure Authentication Portal
          </div>
          <h3 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground">
            READY TO ACCESS YOUR FINANCIAL WORKSPACE?
          </h3>
          <p className="text-base sm:text-lg text-muted-foreground">
            Sign in with your authorized credentials to manage your business ledgers, invoices, and accounting.
          </p>
          <div className="pt-4">
            <Button asChild size="lg" className="h-13 px-8 text-base font-semibold shadow-lg gap-2">
              <Link href="/login">
                <span>Proceed to Sign In</span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 6. Clean Minimal Footer */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-8 text-xs text-muted-foreground">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BrandMark />
            <span>© {new Date().getFullYear()} Ledgerly ERP. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <span>·</span>
            <Link href="/api/health" target="_blank" className="hover:text-foreground transition-colors">
              System Health
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
