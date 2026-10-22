import { requireSuperAdmin } from "@/core/auth/session";
import { getEngineDiagnosticsAction } from "./actions";
import { EngineHealthView } from "./engine-health-view";

export const metadata = {
  title: "Engine Health & Diagnostics | Admin Control Panel",
};

export const dynamic = "force-dynamic";

export default async function AdminEngineHealthPage() {
  await requireSuperAdmin();
  const initialData = await getEngineDiagnosticsAction();

  return (
    <main className="page-container max-w-7xl py-6 space-y-6">
      <EngineHealthView initialData={initialData} />
    </main>
  );
}
