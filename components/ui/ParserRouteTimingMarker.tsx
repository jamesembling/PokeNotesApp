export type ParserTimingPhase = "route-data-parsed" | "route-shell-parsed";

export function ParserRouteTimingMarker({ phase }: { phase: ParserTimingPhase }) {
  const script = `(()=>{const phase=${JSON.stringify(phase)};const now=Math.max(0,Math.round(performance.now()));const current=document.currentScript;if(current instanceof HTMLElement){current.dataset.routeParserTimingMs=String(now)}try{performance.mark("pokenotes:"+phase)}catch{}window.dispatchEvent(new CustomEvent("pokenotes:route-parser-timing",{detail:{phase,at:now}}))})()`;

  return (
    <script
      data-route-parser-timing={phase}
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
