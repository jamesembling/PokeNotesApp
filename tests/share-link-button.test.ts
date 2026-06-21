import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("native share payload does not include the share URL twice", () => {
  const source = readFileSync(
    join(process.cwd(), "components/ui/CopyShareLinkButton.tsx"),
    "utf8"
  );

  assert.equal(
    /text:\s*shareUrl,\s*url:\s*shareUrl/.test(source),
    false,
    "native share targets can duplicate links when text and url both contain the same URL"
  );
  assert.equal(
    /text:\s*["']/.test(source),
    false,
    "native share copy targets should receive only the URL, not extra prefixed text"
  );
  assert.match(source, /url:\s*shareUrl/);
});
