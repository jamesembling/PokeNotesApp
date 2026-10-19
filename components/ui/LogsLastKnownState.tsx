"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { LogsStats } from "@/components/ui/LogsStats";
import { LogsStatsSkeleton, LogsWorkspaceSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";
import { ItemTitle } from "@/components/ui/Typography";
import { CUSTOM_SPRITE_URLS } from "@/lib/pokemon/sprites";

// React never hydrates or diffs the children of an element that sets
// dangerouslySetInnerHTML, so the parser-time script below can fill these
// mounts before hydration without a mismatch. A stable object keeps React from
// resetting the injected content on later renders.
const OPAQUE_MOUNT_HTML = { __html: "" };

// Hides the skeleton after a mount once the snapshot has filled it.
const FALLBACK_CLASS_NAME = "[[data-last-known-mount]:not(:empty)~&]:hidden";

const FILL_LAST_KNOWN_LOGS_SCRIPT = String.raw`(()=>{
const readUserId=()=>{
  const sessions=new Map();
  for(const part of document.cookie.split(";")){
    const separator=part.indexOf("=");
    const name=part.slice(0,separator).trim();
    const match=separator>0?/^sb-.+-auth-token(?:\.(\d+))?$/.exec(name):null;
    if(!match){continue}
    const baseName=match[1]===undefined?name:name.slice(0,name.lastIndexOf("."));
    const chunks=sessions.get(baseName)||[];
    chunks[match[1]===undefined?0:Number(match[1])]=part.slice(separator+1).trim();
    sessions.set(baseName,chunks);
  }
  for(const chunks of sessions.values()){
    try{
      const value=chunks.join("");
      const json=value.startsWith("base64-")?new TextDecoder().decode(Uint8Array.from(atob(value.slice(7).replace(/-/g,"+").replace(/_/g,"/")),(character)=>character.charCodeAt(0))):decodeURIComponent(value);
      const id=JSON.parse(json)?.user?.id;
      if(typeof id==="string"&&id&&id.length<=200){return id}
    }catch{}
  }
  return null;
};
const readSnapshot=()=>{
  try {
    const userId=readUserId();
    if(!userId){return null}
    const value=localStorage.getItem("poke-notes:logs:last-known:v1");
    const snapshot=value?JSON.parse(value):null;
    const now=Date.now();
    if(!snapshot||snapshot.version!==2||snapshot.userId!==userId||!Number.isFinite(snapshot.savedAt)||snapshot.savedAt>now+60000||now-snapshot.savedAt>604800000||!snapshot.stats||!Array.isArray(snapshot.logs)||snapshot.logs.length>8){return null}
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
const customSpriteUrls=${JSON.stringify(CUSTOM_SPRITE_URLS)};
const headingTemplate=document.querySelector("[data-last-known-heading-template]")?.firstElementChild;
const make=(tag,className,text)=>{const element=document.createElement(tag);if(className){element.className=className}if(text!==undefined){element.textContent=String(text)}return element};
const formatter=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric"});
const formatDate=(date)=>{try{return formatter.format(new Date(date+"T00:00:00"))}catch{return date}};
const prettify=(slug)=>{const parts=slug.split("-").filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1));return parts.includes("Mega")?["Mega",...parts.filter((part)=>part!=="Mega")].join(" "):parts.join(" ")};
const opponentName=(log)=>{
  const sprites=Array.isArray(log.opponentDeckSprites)?[...new Set(log.opponentDeckSprites.map((sprite)=>String(sprite||"").trim()).filter(Boolean))]:[];
  if(sprites.length>0){return sprites.map(prettify).join("/")}
  const name=log.opponentDeckName.trim();
  return name&&name.toLowerCase()!=="unknown deck"?name:"Unknown Deck";
};
const chevron=(className)=>{
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("aria-hidden","true");
  svg.setAttribute("class",className);
  svg.setAttribute("viewBox","0 0 20 20");
  svg.setAttribute("width","20");
  svg.setAttribute("height","20");
  svg.setAttribute("fill","none");
  svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-linecap","round");
  svg.setAttribute("stroke-linejoin","round");
  svg.setAttribute("stroke-width","2");
  const path=document.createElementNS("http://www.w3.org/2000/svg","path");
  path.setAttribute("d","m5.5 7.5 4.5 4.5 4.5-4.5");
  svg.append(path);
  return svg;
};
const addSprites=(parent,sprites,side,size)=>{
  const sizeClass=size==="lg"?"h-10 w-10 sm:h-12 sm:w-12":"h-5 w-5";
  const wrapper=make("div",(size==="lg"?"hidden min-w-0 items-center sm:flex ":"flex min-w-0 items-center sm:hidden ")+(side==="end"?"justify-end":"justify-start"));
  const strip=make("div","flex items-center gap-0.5 gap-0 "+(size==="lg"?"-space-x-2":"-space-x-1"));
  const visible=Array.isArray(sprites)?sprites.filter((slug)=>typeof slug==="string"&&slug.length<=180).slice(0,2):[];
  if(visible.length===0){strip.append(make("div","flex shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground "+sizeClass,"-"))}
  for(const slug of visible){
    const item=make("span","relative block shrink-0 "+sizeClass);
    const image=document.createElement("img");
    const normalized=slug.trim().toLowerCase();
    image.alt="";
    image.className="h-full w-full object-contain";
    image.decoding="async";
    image.height=size==="lg"?48:20;
    image.width=size==="lg"?48:20;
    image.style.cssText="color:transparent;height:100%;width:100%";
    image.addEventListener("error",()=>{item.replaceWith(make("div","flex shrink-0 items-center justify-center rounded-full bg-muted px-1 text-center font-semibold leading-tight text-muted-foreground "+(size==="lg"?"text-[9px] ":"text-[7px] ")+sizeClass,prettify(slug).slice(0,3)))},{once:true});
    image.src=customSpriteUrls[normalized]||"https://r2.limitlesstcg.net/pokemon/gen9/"+encodeURIComponent(normalized)+".png";
    item.append(image);
    strip.append(item);
  }
  wrapper.append(strip);
  parent.append(wrapper);
};
const lastViewed=()=>{
  const badge=make("span","inline-flex w-fit shrink-0 items-center rounded-full border border-border bg-secondary px-2 py-px text-[0.72rem] font-semibold leading-4 tracking-[0.04em] text-secondary-foreground","Last viewed");
  badge.setAttribute("aria-hidden","true");
  return badge;
};
const root=make("div","flex flex-col");
const content=make("div","flex flex-col gap-6 p-4 sm:p-5");
root.append(content);
const notice=make("p","sr-only","Showing your last viewed results while current logs load.");
notice.setAttribute("aria-live","polite");
content.append(notice);
content.append(make("div","flex flex-col gap-3 sm:hidden"));
const groups=new Map();
for(const log of snapshot.logs){
  if(!log||typeof log.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(log.date)||!(log.result==="Win"||log.result==="Loss")||typeof log.opponentDeckName!=="string"){continue}
  const group=groups.get(log.date)||{logs:[],wins:0,losses:0};
  group.logs.push(log);
  group[log.result==="Win"?"wins":"losses"]+=1;
  groups.set(log.date,group);
}
if(groups.size===0){
  const empty=make("div","flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground");
  empty.append(make("span","","No battle logs were in your last viewed window."));
  empty.append(lastViewed());
  content.append(empty);
}else{
  const list=make("div","space-y-3");
  list.inert=true;
  let first=true;
  for(const [date,group] of groups){
    const details=make("details","group border-b border-border open:border-b-0");
    details.open=first;
    details.style.cssText="content-visibility:auto;contain-intrinsic-size:128px";
    const summary=make("summary","cursor-pointer list-none py-3 [&::-webkit-details-marker]:hidden");
    const layout=make("div","grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center");
    const titleGrid=make("div","grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center");
    const titleWrapper=make("div");
    const titleRow=make("div","flex items-start justify-between gap-3 sm:block");
    const titleCell=make("div",first?"flex items-center gap-2":"");
    const title=headingTemplate?headingTemplate.cloneNode(false):make("h3");
    title.textContent=formatDate(date);
    titleCell.append(title);
    if(first){titleCell.append(lastViewed())}
    titleRow.append(titleCell);
    const score=group.wins+"-"+group.losses;
    const scoreClass="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.04em] text-card-foreground";
    const chevronClass="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180";
    const mobileScore=make("div","flex items-center justify-end gap-2 text-right sm:hidden");
    mobileScore.append(make("p",scoreClass,score),chevron(chevronClass));
    titleRow.append(mobileScore);
    titleWrapper.append(titleRow);
    titleGrid.append(titleWrapper);
    layout.append(titleGrid);
    const desktopScore=make("div","hidden items-center self-center lg:flex lg:gap-2.5");
    const desktopScoreText=make("div","text-right");
    desktopScoreText.append(make("p",scoreClass,score));
    desktopScore.append(desktopScoreText,chevron(chevronClass));
    layout.append(desktopScore);
    summary.append(layout);
    details.append(summary);
    if(first){
      const rows=make("div","flex flex-col gap-2");
      for(const log of group.logs){
        const tone=log.result==="Win"?"bg-win-bg":"bg-loss-bg";
        const row=make("div","group relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5 overflow-hidden rounded-[10px] border border-border p-3 text-left sm:grid-cols-[4.25rem_minmax(0,1fr)_3.5rem_4.25rem_1.25rem] sm:gap-3 sm:px-4 sm:py-4 lg:grid-cols-[5rem_minmax(0,1fr)_4rem_5rem_1.25rem] lg:gap-4 lg:px-5 "+tone);
        row.setAttribute("aria-disabled","true");
        row.style.cssText="content-visibility:auto;contain-intrinsic-size:96px";
        addSprites(row,log.selfDeckSprites,"start","xs");
        addSprites(row,log.selfDeckSprites,"start","lg");
        const copy=make("div","min-w-0 text-center sm:text-left");
        copy.append(make("p","block truncate text-[0.86rem] font-semibold leading-[1.15] tracking-[-0.015em] text-card-foreground sm:whitespace-normal sm:text-[1.06rem] sm:leading-[1.25] sm:truncate",log.result+" vs "+opponentName(log)));
        copy.append(make("p","mt-0.5 truncate text-[0.8rem] leading-4 text-muted-foreground sm:mt-1 sm:text-base sm:leading-6",formatDate(log.date)));
        row.append(copy);
        row.append(make("div","hidden w-full text-center text-[0.95rem] font-semibold text-muted-foreground sm:block sm:text-[1rem]",log.goOrder==="First"?"1st":log.goOrder==="Second"?"2nd":""));
        addSprites(row,log.opponentDeckSprites,"end","xs");
        addSprites(row,log.opponentDeckSprites,"end","lg");
        row.append(chevron("hidden size-4 -rotate-90 justify-self-end text-muted-foreground sm:block"));
        rows.append(row);
      }
      details.append(rows);
    }
    list.append(details);
    first=false;
  }
  content.append(list);
}
mount.append(root);
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
      <div data-last-known-heading-template hidden>
        <ItemTitle>{null}</ItemTitle>
      </div>
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
