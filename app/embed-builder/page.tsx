import EmbedBuilderPage from "@/components/EmbedBuilderPage";
import { getClubs } from "@/lib/data";

export default async function Page() {
  const clubs = await getClubs();
  return <EmbedBuilderPage clubs={clubs} />;
}
