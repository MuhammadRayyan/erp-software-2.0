"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Send,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BusinessEmailSettings } from "@/modules/email/email-types";
import {
  saveEmailSettingsAction,
  sendTestEmailAction,
} from "@/modules/email/email-settings-actions";

const PRESETS = [
  {
    name: "Hostinger",
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
  },
  {
    name: "Google Workspace / Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
  },
  {
    name: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
  },
  {
    name: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: 587,
    secure: false,
  },
];

export function EmailSettingsClient({
  businessId,
  initialSettings,
}: {
  businessId: string;
  initialSettings: BusinessEmailSettings;
}) {
  const [settings, setSettings] = useState<BusinessEmailSettings>(initialSettings);
  const [senderName, setSenderName] = useState(initialSettings.senderName || "");
  const [senderEmail, setSenderEmail] = useState(initialSettings.senderEmail || "");
  const [replyToEmail, setReplyToEmail] = useState(initialSettings.replyToEmail || "");
  const [smtpHost, setSmtpHost] = useState(initialSettings.smtpHost || "");
  const [smtpPort, setSmtpPort] = useState(initialSettings.smtpPort ? String(initialSettings.smtpPort) : "587");
  const [smtpSecure, setSmtpSecure] = useState(initialSettings.smtpSecure);
  const [smtpUser, setSmtpUser] = useState(initialSettings.smtpUser || "");
  const [smtpPass, setSmtpPass] = useState("");
  const [isActive, setIsActive] = useState(initialSettings.isActive);
  const [showPassword, setShowPassword] = useState(false);

  // Test email state
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(initialSettings.lastTestError);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const handleApplyPreset = (preset: (typeof PRESETS)[number]) => {
    setSmtpHost(preset.host);
    setSmtpPort(String(preset.port));
    setSmtpSecure(preset.secure);
    toast.info(`Applied ${preset.name} configuration presets.`);
  };

  const handleSave = () => {
    startSaving(async () => {
      const res = await saveEmailSettingsAction(businessId, {
        senderName: senderName.trim() || null,
        senderEmail: senderEmail.trim() || null,
        replyToEmail: replyToEmail.trim() || null,
        smtpHost: smtpHost.trim() || null,
        smtpPort: smtpPort ? Number(smtpPort) : null,
        smtpSecure,
        smtpUser: smtpUser.trim() || null,
        smtpPass: smtpPass.trim() ? smtpPass : undefined,
        isActive,
      });

      if (res.ok && res.settings) {
        setSettings(res.settings);
        setSmtpPass("");
        toast.success("Email & SMTP configuration updated successfully.");
      } else {
        toast.error("Failed to save settings", {
          description: res.error,
        });
      }
    });
  };

  const handleSendTest = () => {
    if (!testRecipient.trim() || !testRecipient.includes("@")) {
      toast.error("Enter a valid recipient email address for testing.");
      return;
    }

    setTestMessage(null);
    setTestError(null);

    startTesting(async () => {
      const res = await sendTestEmailAction(businessId, {
        recipient: testRecipient.trim(),
        senderName: senderName.trim() || null,
        senderEmail: senderEmail.trim() || null,
        smtpHost: smtpHost.trim() || null,
        smtpPort: smtpPort ? Number(smtpPort) : null,
        smtpSecure,
        smtpUser: smtpUser.trim() || null,
        smtpPass: smtpPass.trim() ? smtpPass : undefined,
      });

      if (res.ok) {
        setTestMessage(res.message || "Test email delivered successfully!");
        setTestError(null);
        if (res.settings) {
          setSettings(res.settings);
        } else {
          setSettings((prev) => ({
            ...prev,
            lastTestStatus: "success",
            lastTestedAt: new Date().toISOString(),
            lastTestError: null,
          }));
        }
        toast.success("Outbound SMTP test succeeded!", {
          description: res.message,
        });
      } else {
        setTestError(res.error || "SMTP delivery test failed.");
        setTestMessage(null);
        if (res.settings) {
          setSettings(res.settings);
        } else {
          setSettings((prev) => ({
            ...prev,
            lastTestStatus: "failed",
            lastTestedAt: new Date().toISOString(),
            lastTestError: res.error || "SMTP delivery test failed.",
          }));
        }
        toast.error("Outbound SMTP test failed", {
          description: res.error,
        });
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Overview Status Banner */}
      <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Outbound Email Service
                </h2>
                <Badge tone={isActive ? "success" : "neutral"} className="text-xs font-semibold">
                  {isActive ? "Active (Custom SMTP)" : "Inactive (Local Simulation)"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Send sales invoices, quotations, order confirmations, and customer statements from your business domain.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {settings.lastTestStatus === "success" && (
              <Badge tone="success" className="text-xs font-medium gap-1 px-2.5 py-1">
                <CheckCircle2 className="size-3.5" />
                Verified Delivery
              </Badge>
            )}
            {settings.lastTestStatus === "failed" && (
              <Badge tone="danger" className="text-xs font-medium gap-1 px-2.5 py-1">
                <AlertCircle className="size-3.5" />
                Connection Failed
              </Badge>
            )}
            {settings.lastTestedAt && (
              <span className="text-xs text-muted-foreground">
                Last checked: {new Date(settings.lastTestedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Diagnostic banner if last test failed */}
        {testError && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-start gap-3">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-danger">SMTP Diagnostic Alert</p>
              <p className="text-danger/90 leading-relaxed font-mono">{testError}</p>
            </div>
          </div>
        )}

        {testMessage && (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-success flex items-start gap-3">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-success">Delivery Succeeded</p>
              <p className="text-success/90 leading-relaxed">{testMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* Preset Fast-Config Buttons */}
      <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Zap className="size-4 text-primary" />
          <span>Quick Provider Presets</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a provider below to automatically populate the recommended SMTP host, standard port, and security encryption options.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => handleApplyPreset(p)}
              className="flex flex-col items-start p-3 rounded-xl border border-border/70 bg-surface hover:border-primary/50 hover:bg-surface-muted/50 transition-all text-left"
            >
              <span className="text-xs font-bold text-foreground">{p.name}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5 font-mono">{p.host}:{p.port}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column: Sender Identity & Activation */}
        <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-xs space-y-6">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="size-4.5 text-primary" />
              Sender Identity & Activation
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Configure how outbound emails appear in your customers&apos; inboxes.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface">
              <div className="space-y-0.5">
                <Label htmlFor="active-toggle" className="text-sm font-semibold text-foreground cursor-pointer">
                  Enable Custom SMTP Dispatch
                </Label>
                <p className="text-xs text-muted-foreground">
                  Route all quotes, invoices, and receipts through this mail server.
                </p>
              </div>
              <input
                id="active-toggle"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-5 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sender-name" className="text-xs font-semibold text-muted-foreground">
                Sender Display Name
              </Label>
              <Input
                id="sender-name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g. Acme Corporation - Billing"
                className="h-10 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                The business name shown next to the From email address.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sender-email" className="text-xs font-semibold text-muted-foreground">
                From Email Address
              </Label>
              <Input
                id="sender-email"
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="e.g. billing@example.com"
                className="h-10 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                The authentic sending address associated with your SMTP credentials.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reply-to" className="text-xs font-semibold text-muted-foreground">
                Reply-To Email Address (Optional)
              </Label>
              <Input
                id="reply-to"
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="e.g. support@example.com"
                className="h-10 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                If different from sender, customer replies will be routed to this inbox.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: SMTP Server & Authentication */}
        <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-xs space-y-6">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Server className="size-4.5 text-primary" />
              SMTP Server Details
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your mail server connection host, authentication, and TLS parameters.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="smtp-host" className="text-xs font-semibold text-muted-foreground">
                  SMTP Server Host
                </Label>
                <Input
                  id="smtp-host"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.hostinger.com"
                  className="h-10 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-port" className="text-xs font-semibold text-muted-foreground">
                  Port
                </Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="465"
                  className="h-10 text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                Security & Encryption Protocol
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSmtpSecure(true);
                    if (smtpPort === "587") setSmtpPort("465");
                  }}
                  className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    smtpSecure
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  SSL / TLS (Port 465)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSmtpSecure(false);
                    if (smtpPort === "465") setSmtpPort("587");
                  }}
                  className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    !smtpSecure
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  STARTTLS (Port 587)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-user" className="text-xs font-semibold text-muted-foreground">
                SMTP Username / Login
              </Label>
              <Input
                id="smtp-user"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="billing@example.com"
                className="h-10 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-pass" className="text-xs font-semibold text-muted-foreground">
                SMTP Password {(settings.hasPassword || settings.smtpPass) && "(Saved in secure storage)"}
              </Label>
              <div className="relative">
                <Input
                  id="smtp-pass"
                  type={showPassword ? "text" : "password"}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={
                    settings.hasPassword || settings.smtpPass
                      ? "•••••••••••••••• (Leave blank to keep existing)"
                      : "Enter SMTP password or App key"
                  }
                  className="h-10 text-sm font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Action Bar */}
      <div className="flex justify-end border-t border-border pt-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="min-w-32 font-semibold shadow-xs"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving Settings…
            </>
          ) : (
            "Save Email Settings"
          )}
        </Button>
      </div>

      {/* Test Email Verification Box */}
      <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Send className="size-4 text-primary" />
            Send Live Diagnostic Test Email
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Test SMTP handshake, authentication credentials, and inbox delivery before sending customer documents.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="Enter recipient email (e.g. yourname@company.com)"
            className="h-10 text-sm flex-1"
          />
          <Button
            onClick={handleSendTest}
            disabled={isTesting || !testRecipient.trim()}
            variant="secondary"
            className="min-w-40 font-semibold shrink-0"
          >
            {isTesting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Testing SMTP…
              </>
            ) : (
              <>
                <Send className="size-3.5 mr-1.5" />
                Send Test Email
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
