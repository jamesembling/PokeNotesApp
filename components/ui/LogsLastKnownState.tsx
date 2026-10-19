"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { LogsStats } from "@/components/ui/LogsStats";
import { LogsStatsSkeleton, LogsWorkspaceSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";

// React never hydrates or diffs the children of an element that sets
// dangerouslySetInnerHTML, so the parser-time script below can fill these
// mounts before hydration without a mismatch. A stable object keeps React from
// resetting the injected content on later renders.
const OPAQUE_MOUNT_HTML = { __html: "" };

// Hides the skeleton after a mount once the snapshot has filled it.
const FALLBACK_CLASS_NAME = "[[data-last-known-mount]:not(:empty)~&]:hidden";

const FILL_LAST_KNOWN_LOGS_SCRIPT = String.raw`(()=>{
const readSnapshot=()=>{
  try {
    const value=localStorage.getItem("poke-notes:logs:last-known:v1");
    const snapshot=value?JSON.parse(value):null;
    const now=Date.now();
    if(!snapshot||snapshot.version!==1||!Number.isFinite(snapshot.savedAt)||snapshot.savedAt>now+60000||now-snapshot.savedAt>604800000||!snapshot.stats||!Array.isArray(snapshot.logs)||snapshot.logs.length>8){return null}
    const counts=[snapshot.stats.total,snapshot.stats.wins,snapshot.stats.losses];
    if(!counts.every((count)=>Number.isInteger(count)&&count>=0)||snapshot.stats.wins+snapshot.stats.losses>snapshot.stats.total){return null}
    return snapshot;
  } catch {
    return null;
  }
};
const fillStats=(mount,snapshot)=>{
const template=document.querySelector("[data-last-known-stats-template]")?.firstElementChild;
if(!template){return}
const content=template.cloneNode(true);
const values={total:snapshot.stats.total,wins:snapshot.stats.wins,losses:snapshot.stats.losses};
for(const [name,value] of Object.entries(values)){
  const target=content.querySelector('[data-log-stat="'+name+'"]');
  if(target){target.textContent=String(value)}
}
content.setAttribute("aria-label",snapshot.stats.total+" total battle logs, "+snapshot.stats.wins+" wins, "+snapshot.stats.losses+" losses");
mount.append(content);
};
const fillLogs=(mount,snapshot)=>{
const make=(tag,className,text)=>{const element=document.createElement(tag);if(className){element.className=className}if(text!==undefined){element.textContent=String(text)}return element};
const formatDate=(date)=>{try{return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",weekday:"long",year:"numeric",timeZone:"Europe/London"}).format(new Date(date+"T12:00:00Z"))}catch{return date}};
const addSprites=(parent,sprites,side)=>{
  const strip=make("div","flex min-w-0 items-center "+(side==="end"?"justify-end":"justify-start"));
  const visible=Array.isArray(sprites)?sprites.slice(0,2):[];
  if(visible.length===0){strip.append(make("span","flex size-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground","-"))}
  for(const slug of visible){
    if(typeof slug!=="string"||slug.length>180){continue}
    const image=document.createElement("img");
    image.alt="";
    image.className="size-5 shrink-0 object-contain -ml-1 first:ml-0";
    image.height=20;
    image.width=20;
    image.src="https://r2.limitlesstcg.net/pokemon/gen9/"+encodeURIComponent(slug.toLowerCase())+".png";
    strip.append(image);
  }
  parent.append(strip);
};
const content=make("div","flex flex-col gap-4 p-4 sm:p-5");
const notice=make("div","flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4 text-sm text-muted-foreground");
notice.setAttribute("aria-live","polite");
notice.append(make("p","","Showing your last viewed results while current logs load."));
notice.append(make("span","inline-flex w-fit items-center rounded-full border border-border bg-secondary px-3 py-1 text-[0.72rem] font-semibold tracking-[0.04em] text-secondary-foreground","Last viewed"));
content.append(notice);
if(snapshot.logs.length===0){
  content.append(make("div","rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground","No battle logs were in your last viewed window."));
}else{
  const groups=new Map();
  for(const log of snapshot.logs){
    if(!log||typeof log.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(log.date)||!(log.result==="Win"||log.result==="Loss")||typeof log.opponentDeckName!=="string"){continue}
    const group=groups.get(log.date)||{logs:[],wins:0,losses:0};
    group.logs.push(log);
    group[log.result==="Win"?"wins":"losses"]+=1;
    groups.set(log.date,group);
  }
  const list=make("div","space-y-5");
  list.inert=true;
  for(const [date,group] of groups){
    const section=make("section","space-y-3");
    const heading=make("div","flex items-center justify-between gap-3 py-1");
    heading.append(make("h3","font-display text-base font-semibold leading-tight tracking-[-0.025em] text-card-foreground",formatDate(date)));
    heading.append(make("p","font-display text-[1.02rem] font-semibold leading-tight tracking-[-0.025em] text-card-foreground [font-variant-numeric:tabular-nums]",group.wins+"-"+group.losses));
    section.append(heading);
    const rows=make("div","space-y-2");
    for(const log of group.logs){
      const tone=log.result==="Win"?"bg-win-bg":"bg-loss-bg";
      const row=make("div","grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 rounded-[10px] border border-border p-3 text-left "+tone+" sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem] lg:gap-4 lg:px-5");
      row.setAttribute("aria-disabled","true");
      addSprites(row,log.selfDeckSprites,"start");
      const copy=make("div","min-w-0 text-center sm:text-left");
      copy.append(make("p","truncate text-[0.86rem] font-semibold leading-[1.15] tracking-[-0.015em] text-card-foreground sm:text-[1.06rem] sm:leading-[1.25]",log.result+" vs "+log.opponentDeckName));
      copy.append(make("p","mt-0.5 truncate text-[0.8rem] leading-4 text-muted-foreground sm:mt-1 sm:text-base sm:leading-6",formatDate(log.date)));
      row.append(copy);
      row.append(make("div","hidden w-full text-center text-[0.95rem] font-semibold text-muted-foreground sm:block",log.goOrder==="First"?"1st":log.goOrder==="Second"?"2nd":""));
      addSprites(row,log.opponentDeckSprites,"end");
      rows.append(row);
    }
    section.append(rows);
    list.append(section);
  }
  content.append(list);
}
mount.append(content);
};
const snapshot=readSnapshot();
if(!snapshot){return}
const statsMount=document.querySelector('[data-last-known-mount="stats"]');
if(statsMount&&!statsMount.hasChildNodes()){fillStats(statsMount,snapshot)}
const logsMount=document.querySelector('[data-last-known-mount="logs"]');
if(logsMount&&!logsMount.hasChildNodes()){fillLogs(logsMount,snapshot)}
})()`;

const subscribeToNothing = () => () => undefined;

// True for client-only renders; false on the server and while hydrating.
function useIsClientRender() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

export function LogsLastKnownStats() {
  return (
    <div>
      <div
        dangerouslySetInnerHTML={OPAQUE_MOUNT_HTML}
        data-last-known-mount="stats"
        suppressHydrationWarning
      />
      <div className={FALLBACK_CLASS_NAME}>
        <LogsStatsSkeleton />
      </div>
      <div data-last-known-stats-template hidden>
        <LogsStats losses={0} total={0} wins={0} />
      </div>
    </div>
  );
}

// Render after LogsLastKnownStats so the stats mount is parsed before the
// script runs. On a hard load the inline script paints the snapshot before
// JavaScript loads; client renders never execute it, so they fill the mounts
// from a layout effect instead.
export function LogsLastKnownContent() {
  const mountRef = useRef<HTMLDivElement>(null);
  const isClientRender = useIsClientRender();

  useLayoutEffect(() => {
    if (mountRef.current?.hasChildNodes()) {
      return;
    }

    const script = document.createElement("script");
    script.text = FILL_LAST_KNOWN_LOGS_SCRIPT;
    document.head.append(script);
    script.remove();
  }, []);

  return (
    <div>
      <div
        dangerouslySetInnerHTML={OPAQUE_MOUNT_HTML}
        data-last-known-mount="logs"
        ref={mountRef}
        suppressHydrationWarning
      />
      {isClientRender ? null : (
        <script dangerouslySetInnerHTML={{ __html: FILL_LAST_KNOWN_LOGS_SCRIPT }} />
      )}
      <div className={FALLBACK_CLASS_NAME}>
        <LogsWorkspaceSkeleton />
      </div>
    </div>
  );
}
