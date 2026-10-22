import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const user = session.user as typeof session.user & { status?: string };
  if (user.status === "suspended") {
    redirect("/login?suspended=1");
  }
  return session.user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    redirect("/businesses");
  }
  return user;
}
