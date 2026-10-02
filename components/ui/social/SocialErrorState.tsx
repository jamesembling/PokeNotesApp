"use client";

import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./social.module.css";

export function SocialErrorState({ title, retry }: { title: string; retry: () => void }) {
  return <div className={styles.page}><PageHeader breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: title }]} title={title} /><p className={`${styles.status} ${styles.error}`} role="alert">We couldn’t load this {title === "Friends" ? "friends page" : "player profile"}. Try again.</p><div className={`${styles.actions} mt-4`}><Button onClick={retry} variant="outline">Retry</Button><Button asChild variant="ghost"><Link href="/profile">Go to Profile</Link></Button></div></div>;
}
