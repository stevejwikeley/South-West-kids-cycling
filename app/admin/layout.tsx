import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getPendingChangeRows } from "@/lib/data";
import AdminNav from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login?next=/admin");
  if (profile.role !== "admin") redirect("/");

  const pending = await getPendingChangeRows();

  return (
    <>
      <AdminNav pendingCount={pending.length} />
      {children}
    </>
  );
}
