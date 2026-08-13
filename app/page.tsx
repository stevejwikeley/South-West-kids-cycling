import CalendarPage from "@/components/CalendarPage";
import { getEvents } from "@/lib/data";
import { eventsToJsonLd } from "@/lib/structured-data";
import { getCurrentProfile, isAdminRole } from "@/lib/auth";

export const revalidate = 60;

export default async function Page() {
  const [events, profile] = await Promise.all([getEvents(), getCurrentProfile()]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": eventsToJsonLd(events),
  };

  return (
    <>
      {/* Escape </script> so no event title (or future user-submitted
          content) can prematurely close this tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <CalendarPage events={events} isAdmin={isAdminRole(profile)} />
    </>
  );
}
