import EmbedBuilderPage from "@/components/EmbedBuilderPage";
import { getClubs, getEvents } from "@/lib/data";
import { visibleDisciplinesFor } from "@/lib/visible-disciplines";

export default async function Page() {
  const [clubs, events] = await Promise.all([getClubs(), getEvents()]);

  // Same fix as the calendar's own filter chips (lib/visible-disciplines.ts)
  // and the subscribe builder (app/subscribe/page.tsx): chips here must
  // reflect what's actually in the data, not the hardcoded EVENT_DISCIPLINES
  // list. "training" is deliberately excluded — it's per-club, with its own
  // dedicated SESSIONS control on this builder, not a discipline chip; see
  // components/EmbedBuilderPage.tsx.
  const disciplines = visibleDisciplinesFor(events.map((e) => e.discipline)).filter((d) => d.id !== "training");

  return <EmbedBuilderPage clubs={clubs} disciplines={disciplines} />;
}
