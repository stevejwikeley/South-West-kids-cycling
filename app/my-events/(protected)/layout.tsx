import { redirect } from "next/navigation";
import { getCurrentAttendee } from "@/lib/auth";

export default async function MyEventsLayout({ children }: { children: React.ReactNode }) {
  const attendee = await getCurrentAttendee();
  if (!attendee) redirect("/my-events/login");
  return <>{children}</>;
}
