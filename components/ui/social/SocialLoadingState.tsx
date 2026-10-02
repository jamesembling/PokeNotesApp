import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./social.module.css";

export function SocialLoadingState({ title }: { title: string }) {
  return <div aria-busy="true" className={styles.page} role="status"><span className="sr-only">Loading {title}</span><PageHeader breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: title }]} title={title} /><div aria-hidden="true" className={styles.skeletonRows}>{Array.from({ length: 4 }, (_, index) => <div className={styles.row} key={index}><div className={styles.identity}><Skeleton className="size-10 rounded-full" /><div><Skeleton className="h-5 w-40" /><Skeleton className="mt-2 h-4 w-52 max-w-full" /></div></div><Skeleton className="h-10 w-28" /></div>)}</div></div>;
}
