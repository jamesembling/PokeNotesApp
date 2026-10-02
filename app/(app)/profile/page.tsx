import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "@/components/ui/ProfileForm";
import { SectionTitle } from "@/components/ui/Typography";
import styles from "@/components/ui/account/profile.module.css";
import { getCurrentProfile } from "@/lib/db/profile";
import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageActions } from "@/components/ui/PageActions";
import { ShowcaseForm } from "@/components/ui/social/ShowcaseForm";
import { getCurrentShowcaseIfAvailable } from "@/lib/db/social";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return DATE_TIME_FORMATTER.format(new Date(value));
  } catch {
    return value;
  }
}

export default async function ProfilePage() {
  const [profile, showcase] = await Promise.all([getCurrentProfile(), getCurrentShowcaseIfAvailable()]);

  return (
    <div className={styles.page}>
      <PageHeader
        action={showcase ? <PageActions><Button asChild variant="outline"><Link href={`/players/${profile.id}`} prefetch={false}>View my profile</Link></Button></PageActions> : undefined}
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]}
        title="Profile"
      />

      <div className={styles.layout}>
        <div>
          <ProfileForm profile={profile} />
          {showcase ? <ShowcaseForm profile={showcase} /> : <p className="mt-8 text-sm text-muted-foreground">Player profiles are temporarily unavailable. Reload this page to try again.</p>}
        </div>

        <aside aria-label="Account information" className={styles.account}>
          <section>
            <SectionTitle size="sm">Account</SectionTitle>
            <dl className={styles.metadata}>
              <div><dt>Email</dt><dd>{profile.email || "Unknown"}</dd></div>
              <div><dt>Role</dt><dd className={styles.capitalize}>{profile.role}</dd></div>
              <div><dt>Avatar colour</dt><dd className={styles.capitalize}>{profile.avatarColor}</dd></div>
            </dl>
          </section>
          <section className={styles.activity}>
            <SectionTitle size="sm">Activity</SectionTitle>
            <dl className={styles.metadata}>
              <div><dt>Account created</dt><dd>{formatDateTime(profile.authAccountCreatedAt || profile.createdAt)}</dd></div>
              <div><dt>Last login</dt><dd>{formatDateTime(profile.lastLoginAt)}</dd></div>
              <div><dt>Last active</dt><dd>{formatDateTime(profile.lastActiveAt)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
