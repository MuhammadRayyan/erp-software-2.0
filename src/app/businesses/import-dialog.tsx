"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

type ImportResult = { businessId?: string; error?: string };

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    let result: ImportResult;
    try {
      const response = await fetch("/api/businesses/import", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      result = (await response.json()) as ImportResult;
    } catch {
      setPending(false);
      setError("The backup upload was interrupted. Check the development server and try again.");
      return;
    }
    setPending(false);
    if (result.error) return setError(result.error);
    setOpen(false);
    formRef.current?.reset();
    toast.success("Business imported as a separate copy.");
    if (result.businessId) router.push(`/b/${result.businessId}/overview`);
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary"><Upload className="size-4" /> Import</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Import business backup</DialogTitle>
        <DialogDescription>The backup is restored with a new internal identity. It will not overwrite an existing business.</DialogDescription>
        <form ref={formRef} onSubmit={submit} className="mt-5 space-y-4">
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-4">
            <FileArchive className="mb-3 size-6 text-primary" />
            <Label htmlFor="backup">Backup file</Label>
            <Input id="backup" name="backup" type="file" accept=".erpbackup,application/zip,application/octet-stream" className="mt-1.5 h-auto py-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm" required />
            <p className="mt-2 text-xs text-muted-foreground">Maximum 50 MB · manifest and checksum are validated before import.</p>
          </div>
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Import copy</Button></div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
