import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
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
    <div className="page-container max-w-4xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Units of Measure</h1>
          <p className="page-description">
            Maintain standard packaging and quantity units (pcs, hrs, kg, boxes) for products and commercial documents.
          </p>
        </div>
      </div>
      <UomManager businessId={businessId} units={units} />
    </div>
  );
}
