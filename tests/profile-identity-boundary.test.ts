import assert from "node:assert/strict";
import test from "node:test";
import { shouldLoadSidebarProfile } from "@/lib/sidebar-profile-loading";

test("mobile defers the sidebar profile until navigation opens", () => {
  assert.equal(shouldLoadSidebarProfile({ isDesktop: false, openMobile: false }), false);
  assert.equal(shouldLoadSidebarProfile({ isDesktop: false, openMobile: true }), true);
  assert.equal(shouldLoadSidebarProfile({ isDesktop: true, openMobile: false }), true);
});
