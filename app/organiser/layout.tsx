import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export default async function OrganiserLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/organiser");
  return <>{children}</>;
}
