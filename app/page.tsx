import CalendarPage from "@/components/CalendarPage";
import { getEvents } from "@/lib/data";

export const revalidate = 60;

export default async function Page() {
  const events = await getEvents();
  return <CalendarPage events={events} />;
}
