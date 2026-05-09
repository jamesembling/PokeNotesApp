import { Card } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { ProfileForm } from "@/components/ui/ProfileForm";
import { getCurrentProfile } from "@/lib/db/profile";

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function ProfilePage() {
  const profile = await getCurrentProfile();

  return (
    <PageWidth size="narrow">
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]}
        title="Profile"
        subtitle="Manage the trainer identity used across the app, including the PTCGL username needed for battle log imports."
      />

      <div className="grid gap-6">
        <Card className="space-y-6">
          <div className="space-y-2">
            <p className="ui-eyebrow">Trainer Profile</p>
            <h2 className="ui-section-title">Account Details</h2>
            <p className="text-sm text-muted-foreground">
              Your PTCGL username is used to identify your side when importing battle
              logs.
            </p>
          </div>

          <ProfileForm profile={profile} />
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="ui-eyebrow">Signed In</p>
              <h2 className="ui-section-title">Account Snapshot</h2>
            </div>

            <dl className="grid gap-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-right text-card-foreground">{profile.email || "Unknown"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-right text-card-foreground">{profile.role}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Avatar Color</dt>
                <dd className="text-right capitalize text-card-foreground">
                  {profile.avatarColor}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="ui-eyebrow">Activity</p>
              <h2 className="ui-section-title">Profile Metadata</h2>
            </div>

            <dl className="grid gap-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Account Created</dt>
                <dd className="text-right text-card-foreground">
                  {formatDateTime(profile.authAccountCreatedAt || profile.createdAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Last Login</dt>
                <dd className="text-right text-card-foreground">
                  {formatDateTime(profile.lastLoginAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Last Active</dt>
                <dd className="text-right text-card-foreground">
                  {formatDateTime(profile.lastActiveAt)}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </PageWidth>
  );
}
