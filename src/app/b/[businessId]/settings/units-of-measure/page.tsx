import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { listUnitsOfMeasure } from "@/modules/units-of-measure/uom-service";
import { UomManager } from "@/modules/units-of-measure/components/uom-manager";

export const metadata = {
  title: "Units of Measure",
};

export default async function UnitsOfMeasurePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const units = listUnitsOfMeasure(businessId, user.id);

  return (
    <SettingsShell
      businessId={businessId}
      title="Units of Measure"
      description="Maintain standard packaging and quantity units (pcs, hrs, kg, boxes) for products and commercial documents."
    >
      <UomManager businessId={businessId} units={units} />
    </SettingsShell>
  );
}

