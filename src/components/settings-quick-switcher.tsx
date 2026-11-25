"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { usePermissions } from "@/components/permissions-provider";
import { getFlatSettingsItems } from "@/modules/settings/settings-registry";

export function SettingsQuickSwitcher({ businessId }: { businessId: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { isAdministrator, isSuperAdmin, hasSettingsModule } = usePermissions();

  const items = useMemo(
    () =>
      getFlatSettingsItems({
        businessId,
        isAdmin: isAdministrator,
        isSuperAdmin,
        hasSettingsModule,
      }),
    [businessId, isAdministrator, isSuperAdmin, hasSettingsModule],
  );

  const options = useMemo<ComboboxOption[]>(
    () =>
      items.map((item) => ({
        value: item.href,
        label: item.title,
        description: item.subtitle,
        badge: item.groupShortLabel,
        keywords: item.keywords.split(/\s+/).filter(Boolean),
      })),
    [items],
  );

  const activeValue = useMemo(() => {
    const match = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return match?.href ?? "";
  }, [items, pathname]);

  if (options.length === 0) return null;

  return (
    <div className="w-56 sm:w-64">
      <Combobox
        options={options}
        value={activeValue}
        onValueChange={(nextHref) => {
          if (nextHref && nextHref !== activeValue) {
            router.push(nextHref);
          }
        }}
        size="sm"
        align="end"
        ariaLabel="Jump to setting"
        placeholder="Jump to setting…"
        searchPlaceholder="Search settings…"
        emptyText="No matching settings."
        contentClassName="w-[320px]"
      />
    </div>
  );
}
