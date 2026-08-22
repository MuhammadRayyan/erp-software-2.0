import { LoaderCircle } from "lucide-react";
export default function LoadingPage() { return <div className="page-container flex min-h-[50vh] items-center justify-center"><div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /><span>Loading business...</span></div></div>; }
