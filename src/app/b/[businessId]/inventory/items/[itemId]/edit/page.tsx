import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { getAssetAccountOptions, getExpenseAccountOptions, getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { InventoryItemForm } from "@/modules/inventory/inventory-item-form";
import { getInventoryItem, inventoryItemToInput } from "@/modules/inventory/inventory-item-service";
import { BackLink } from "@/components/back-link";

export default async function EditInventoryItemPage({ params }: { params: Promise<{ businessId: string; itemId: string }> }) { const { businessId, itemId } = await params; const { user } = await requireModule(businessId, "inventory"); const record = getInventoryItem(businessId, user.id, itemId); if (!record) notFound(); return <div className="page-container"><BackLink href={`/b/${businessId}/inventory/items/${itemId}`}>{String(record.item.name)}</BackLink><div className="mb-7"><h1 className="page-title">Edit Inventory Item</h1><p className="page-description">Existing movements remain immutable; changes apply to future documents.</p></div><InventoryItemForm businessId={businessId} itemId={itemId} salesAccounts={getSalesAccountOptions(businessId, user.id)} assetAccounts={getAssetAccountOptions(businessId, user.id)} expenseAccounts={getExpenseAccountOptions(businessId, user.id)} initial={inventoryItemToInput(record.item)} /></div>; }
