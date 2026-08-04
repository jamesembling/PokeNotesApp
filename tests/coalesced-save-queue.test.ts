import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoalescedSaveQueue,
  type CoalescedSaveStatus
} from "@/lib/client/coalesced-save-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("serializes saves and coalesces queued revisions to the newest snapshot", async () => {
  const firstSave = deferred();
  const secondSave = deferred();
  const saves: string[] = [];
  const statuses: CoalescedSaveStatus[] = [];
  const queue = createCoalescedSaveQueue({
    initialValue: "revision-a",
    isEqual: (left, right) => left === right,
    onStatusChange: (status) => statuses.push(status),
    save: async (value) => {
      saves.push(value);
      await (saves.length === 1 ? firstSave.promise : secondSave.promise);
    }
  });

  queue.request("revision-b");
  queue.request("revision-c");
  queue.request("revision-d");

  assert.deepEqual(saves, ["revision-b"]);
  firstSave.resolve();
  await flushPromises();
  assert.deepEqual(saves, ["revision-b", "revision-d"]);

  secondSave.resolve();
  await flushPromises();
  assert.deepEqual(statuses, ["saving", "saved"]);
});

test("queues a corrective save when the user reverts during an in-flight revision", async () => {
  const firstSave = deferred();
  const saves: string[] = [];
  const queue = createCoalescedSaveQueue({
    initialValue: "original",
    isEqual: (left, right) => left === right,
    save: async (value) => {
      saves.push(value);
      if (saves.length === 1) {
        await firstSave.promise;
      }
    }
  });

  queue.request("edited");
  queue.request("original");
  firstSave.resolve();
  await flushPromises();

  assert.deepEqual(saves, ["edited", "original"]);
});

test("continues with a newer queued revision when an obsolete save fails", async () => {
  const firstSave = deferred();
  const saves: string[] = [];
  const statuses: CoalescedSaveStatus[] = [];
  const queue = createCoalescedSaveQueue({
    initialValue: "revision-a",
    isEqual: (left, right) => left === right,
    onStatusChange: (status) => statuses.push(status),
    save: async (value) => {
      saves.push(value);
      if (saves.length === 1) {
        await firstSave.promise;
      }
    }
  });

  queue.request("revision-b");
  queue.request("revision-c");
  firstSave.reject(new Error("obsolete request failed"));
  await flushPromises();

  assert.deepEqual(saves, ["revision-b", "revision-c"]);
  assert.deepEqual(statuses, ["saving", "saved"]);
});
