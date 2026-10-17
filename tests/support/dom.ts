import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Rendered component tests import this first so React Testing Library finds a document.
if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost:3000/" });
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
