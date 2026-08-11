import {
  Banknote,
  BookOpenText,
  ContactRound,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ReceiptText,
  Scale,
  Settings,
  ShoppingCart,
  Truck,
  FileInput,
  FileCode2,
  MapPin,
  Package,
} from "lucide-react";
import type { ModuleKey } from "@/core/permissions/permissions";

export type NavItem = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  module?: ModuleKey;
};

export const primaryNav: { label?: string; items: NavItem[] }[] = [
  { items: [{ label: "Overview", path: "/overview", icon: LayoutDashboard }] },
  {
    label: "Sales",
    items: [
      { label: "Customers", path: "/customers", icon: ContactRound, module: "sales" },
      { label: "Invoices", path: "/sales/invoices", icon: ReceiptText, module: "sales" },
      { label: "Electronic Invoices", path: "/einvoicing", icon: FileCode2, module: "sales" },
    ],
  },
  {
    label: "Purchases",
    items: [
      { label: "Suppliers", path: "/suppliers", icon: Truck, module: "purchases" },
      { label: "Purchase Orders", path: "/purchases/orders", icon: ShoppingCart, module: "purchases" },
      { label: "Purchase Invoices", path: "/purchases/invoices", icon: FileInput, module: "purchases" },
      { label: "Supplier eInvoices", path: "/purchases/einvoices", icon: FileCode2, module: "purchases" },
    ],
  },
  {
    label: "Banking",
    items: [{ label: "Bank Accounts", path: "/banking/accounts", icon: Banknote, module: "banking" }],
  },
  {
    label: "Projects",
    items: [{ label: "Projects", path: "/projects", icon: FolderKanban, module: "projects" }],
  },
  {
    label: "Inventory",
    items: [
      { label: "Items", path: "/inventory/items", icon: Package, module: "inventory" },
      { label: "Locations", path: "/inventory/locations", icon: MapPin, module: "inventory" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Chart of Accounts", path: "/accounting/chart-of-accounts", icon: BookOpenText, module: "accounting" },
      { label: "Journal", path: "/accounting/journal", icon: Scale, module: "accounting" },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Reports", path: "/reports", icon: FileText, module: "reports" }],
  },
];

export const settingsNav: NavItem = { label: "Settings", path: "/settings", icon: Settings, module: "settings" };
