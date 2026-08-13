import ClubsPage from "@/components/ClubsPage";
import { getClubs } from "@/lib/data";

export const revalidate = 60;

export const metadata = {
  title: "Youth Cycling Clubs in Devon & Cornwall",
  description: "Go-Ride clubs, junior academies and youth sections across Devon and Cornwall, including Exeter, Plymouth, Truro and Falmouth — road, XC mountain biking, cyclocross and triathlon coaching for ages 8–16.",
};

export default async function Page() {
  const clubs = await getClubs();
  return <ClubsPage clubs={clubs} />;
}
