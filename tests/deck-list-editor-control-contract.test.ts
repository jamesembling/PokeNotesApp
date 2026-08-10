import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function openingTagForId(source: string, component: string, id: string) {
  const idIndex = source.indexOf(`id="${id}"`);
  assert.ok(idIndex >= 0, `${component}#${id} is present`);

  const tagStart = source.lastIndexOf(`<${component}`, idIndex);
  const tagEnd = source.indexOf("/>", idIndex);
  assert.ok(tagStart >= 0 && tagEnd > idIndex, `${component}#${id} has a complete opening tag`);

  return source.slice(tagStart, tagEnd + 2);
}

const metadataControlContract = /\bh-auto\s+min-h-\[2\.75rem\](?=\s|\")/;

test("deck-list metadata controls share the 44px single-line height contract", () => {
  const editor = readSource("components/ui/DeckListEditorDialog.tsx");
  const appSelect = readSource("components/shadcn/app-select.tsx");
  const datePicker = readSource("components/ui/DatePicker.tsx");
  const formatSelect = readSource("components/ui/FormatSelect.tsx");

  openingTagForId(editor, "FormatSelect", "deck-list-format");
  openingTagForId(editor, "DatePicker", "deck-list-date");
  assert.match(formatSelect, /<AppSelect\b/);

  const controls = [
    openingTagForId(editor, "Input", "deck-list-name"),
    appSelect,
    datePicker,
    openingTagForId(editor, "Input", "deck-list-created-by")
  ];

  for (const control of controls) {
    assert.match(control, metadataControlContract);
  }
});

test("deck-list metadata controls retain labels and editing behavior", () => {
  const editor = readSource("components/ui/DeckListEditorDialog.tsx");
  const fields = [
    ["Input", "deck-list-name", "setListName"],
    ["FormatSelect", "deck-list-format", "setFormat"],
    ["DatePicker", "deck-list-date", "setDate"],
    ["Input", "deck-list-created-by", "setCreatedBy"]
  ] as const;

  for (const [component, id, setter] of fields) {
    assert.ok(editor.includes(`htmlFor="${id}"`), `${id} retains its visible label`);

    const control = openingTagForId(editor, component, id);
    assert.ok(
      control.includes(`onChange={${setter}}`) ||
        control.includes(`onChange={(event) => ${setter}(event.target.value)}`)
    );
    assert.doesNotMatch(control, /\b(?:disabled|readOnly)\b/);
  }

  assert.match(openingTagForId(editor, "Input", "deck-list-name"), /\brequired\b/);
});

test("editable deck-list inputs retain the mobile 16px text safeguard", () => {
  const globalStyles = readSource("app/globals.css");

  assert.match(
    globalStyles,
    /@media \(max-width: 859px\) \{[\s\S]*?input:not\(\[type="hidden"\]\),[\s\S]*?font-size: 1rem !important;/
  );
});
