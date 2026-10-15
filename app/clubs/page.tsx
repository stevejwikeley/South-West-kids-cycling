import ClubsPage from "@/components/ClubsPage";
import { getClubs, getUpcomingTraining } from "@/lib/data";

export const revalidate = 60;

export const metadata = {
  title: "Youth Cycling Clubs in Devon, Cornwall, Somerset & Bristol",
  description: "Go-Ride clubs, junior academies and youth sections across Devon, Cornwall, Somerset and Bristol, including Exeter, Plymouth, Truro and Falmouth — road, XC mountain biking, cyclocross and triathlon coaching for ages 8–16.",
};

export default async function Page() {
  const [clubs, training] = await Promise.all([getClubs(), getUpcomingTraining()]);
  return <ClubsPage clubs={clubs} training={training} />;
}
