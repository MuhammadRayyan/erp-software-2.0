import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ComponentProps } from "react";

export function BackLink({ href, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      {...props}
    >
      <ArrowLeft className="size-4" /> {children}
    </Link>
  );
}
