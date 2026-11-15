"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

const emptySubscribe = () => () => {};

export function ThemeMenu() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
        <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
