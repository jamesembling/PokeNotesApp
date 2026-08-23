const CLEAR_PRIVATE_BROWSER_CACHE_SCRIPT = `try{localStorage.removeItem("poke-notes:logs:last-known:v1")}catch{}`;

export function ClearPrivateBrowserCache() {
  return <script dangerouslySetInnerHTML={{ __html: CLEAR_PRIVATE_BROWSER_CACHE_SCRIPT }} />;
}
