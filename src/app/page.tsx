import { redirect } from "next/navigation";
import { getCurrentSession } from "@/core/auth/session";

export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session ? "/businesses" : "/login");
}
