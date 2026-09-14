import EmbedBuilderPage from "@/components/EmbedBuilderPage";
import { getClubs, getEvents } from "@/lib/data";
import { subscribableDisciplinesFor } from "@/lib/subscribable-disciplines";

export default async function Page() {
  const [clubs, events] = await Promise.all([getClubs(), getEvents()]);

  // Deliberately NOT the calendar's visibleDisciplinesFor (lib/visible-
  // disciplines.ts) — see the long comment in app/subscribe/page.tsx for why
  // the two builders differ from the calendar here (commit 3237578 made them
  // match the calendar's data-driven chips and that was a regression: this
  // builder produces an embeddable snippet a club pastes into their own site
  // and keeps indefinitely, so a discipline with no event live today must
  // still be offerable). subscribableDisciplinesFor gives the full curated
  // list regardless of what's scheduled this week, plus any discipline
  // genuinely present in the data that the curated list doesn't know about
  // yet. "training" is deliberately excluded — it's per-club, with its own
  // dedicated SESSIONS control on this builder, not a discipline chip; see
  // components/EmbedBuilderPage.tsx.
  const disciplines = subscribableDisciplinesFor(events.map((e) => e.discipline)).filter((d) => d.id !== "training");

  return <EmbedBuilderPage clubs={clubs} disciplines={disciplines} />;
}
