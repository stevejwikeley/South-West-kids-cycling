import ClubsPage from "@/components/ClubsPage";
import { getClubs } from "@/lib/data";

export const revalidate = 60;

export default async function Page() {
  const clubs = await getClubs();
  return <ClubsPage clubs={clubs} />;
}
