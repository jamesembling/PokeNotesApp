import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoundedSaveScheduler,
  createCoalescedSaveQueue,
  createSerialVersionChannel,
  type CoalescedSaveStatus
} from "@/lib/client/coalesced-save-queue";

function createFakeTimers() {
  let currentTime = 0;
  let nextId = 0;
  const timers = new Map<number, { callback: () => void; dueAt: number }>();

  return {
    advance(milliseconds: number) {
      const targetTime = currentTime + milliseconds;
      while (true) {
        const nextTimer = Array.from(timers.entries())
          .filter(([, timer]) => timer.dueAt <= targetTime)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (!nextTimer) {
          break;
        }

        const [id, timer] = nextTimer;
        currentTime = timer.dueAt;
        timers.delete(id);
        timer.callback();
      }
      currentTime = targetTime;
    },
    clearTimer(handle: ReturnType<typeof setTimeout>) {
      timers.delete(handle as unknown as number);
    },
    setTimer(callback: () => void, delayMs: number) {
      nextId += 1;
      timers.set(nextId, { callback, dueAt: currentTime + delayMs });
      return nextId as unknown as ReturnType<typeof setTimeout>;
    }
  };
}

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

test("editors sharing a record version commit in turn against the latest committed version", async () => {
  const channel = createSerialVersionChannel("v1");
  const seen: string[] = [];
  let releaseHeader!: () => void;
  const headerReleased = new Promise<void>((resolve) => {
    releaseHeader = resolve;
  });

  const header = channel.commit(async (expected) => {
    seen.push(`header:${expected}`);
    await headerReleased;
    return "v2";
  });
  const notes = channel.commit(async (expected) => {
    seen.push(`notes:${expected}`);
    throw new Error("notes rejected");
  });
  const retry = channel.commit(async (expected) => {
    seen.push(`retry:${expected}`);
    return "v3";
  });

  await Promise.resolve();
  assert.deepEqual(seen, ["header:v1"]);
  releaseHeader();
  await header;
  await assert.rejects(notes, /notes rejected/);
  await retry;
  assert.deepEqual(seen, ["header:v1", "notes:v2", "retry:v2"]);
  assert.equal(channel.version.current, "v3");
});

test("bounded scheduling saves the latest text after the trailing delay", () => {
  const timers = createFakeTimers();
  const saves: string[] = [];
  const scheduler = createBoundedSaveScheduler({
    clearTimer: timers.clearTimer,
    delayMs: 500,
    maxWaitMs: 2000,
    request: (value: string) => saves.push(value),
    setTimer: timers.setTimer
  });

  scheduler.schedule("draft-a");
  timers.advance(400);
  scheduler.schedule("draft-b");
  timers.advance(499);
  assert.deepEqual(saves, []);
  timers.advance(1);
  assert.deepEqual(saves, ["draft-b"]);
});

test("bounded scheduling persists continuous typing at the maximum wait", () => {
  const timers = createFakeTimers();
  const saves: string[] = [];
  const scheduler = createBoundedSaveScheduler({
    clearTimer: timers.clearTimer,
    delayMs: 500,
    maxWaitMs: 2000,
    request: (value: string) => saves.push(value),
    setTimer: timers.setTimer
  });

  scheduler.schedule("draft-a");
  for (const draft of ["draft-b", "draft-c", "draft-d", "draft-e"]) {
    timers.advance(400);
    scheduler.schedule(draft);
  }
  timers.advance(400);

  assert.deepEqual(saves, ["draft-e"]);
});

test("flushing on route unmount persists focused text without a blur event", () => {
  const timers = createFakeTimers();
  const saves: string[] = [];
  const scheduler = createBoundedSaveScheduler({
    clearTimer: timers.clearTimer,
    delayMs: 500,
    maxWaitMs: 2000,
    request: (value: string) => saves.push(value),
    setTimer: timers.setTimer
  });

  scheduler.schedule("focused route draft");
  scheduler.flush();
  timers.advance(2000);

  assert.deepEqual(saves, ["focused route draft"]);
});
