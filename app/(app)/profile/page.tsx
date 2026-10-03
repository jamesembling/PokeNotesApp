import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "@/components/ui/ProfileForm";
import styles from "@/components/ui/account/profile.module.css";
import { getCurrentProfile } from "@/lib/db/profile";
import { ShowcaseForm } from "@/components/ui/social/ShowcaseForm";
import { getCurrentShowcaseIfAvailable } from "@/lib/db/social";

export default async function ProfilePage() {
  const [profile, showcase] = await Promise.all([getCurrentProfile(), getCurrentShowcaseIfAvailable()]);
  return (
    <div className={styles.page}>
      <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]} variant="collection" />
      <ProfileForm profile={profile} profileHref={showcase ? `/players/${profile.id}` : undefined} />
      {showcase ? <ShowcaseForm profile={showcase} /> : <p className={styles.unavailable}>Player profiles are temporarily unavailable. Reload this page to try again.</p>}
    </div>
  );
}
