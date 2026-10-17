export type CoalescedSaveStatus = "idle" | "saving" | "saved" | "error";

type CoalescedSaveQueueOptions<T> = {
  initialValue: T;
  isEqual: (left: T, right: T) => boolean;
  onStatusChange?: (status: CoalescedSaveStatus, error?: unknown) => void;
  save: (value: T) => Promise<void>;
};

export type CoalescedSaveQueue<T> = {
  request(value: T): void;
  reset(value: T): void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type BoundedSaveSchedulerOptions<T> = {
  delayMs: number;
  maxWaitMs: number;
  request: (value: T) => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export type BoundedSaveScheduler<T> = {
  cancel(): void;
  flush(): void;
  schedule(value: T): void;
};

export function createBoundedSaveScheduler<T>({
  clearTimer = clearTimeout,
  delayMs,
  maxWaitMs,
  request,
  setTimer = setTimeout
}: BoundedSaveSchedulerOptions<T>): BoundedSaveScheduler<T> {
  let latestValue: T | null = null;
  let maxWaitTimer: TimerHandle | null = null;
  let trailingTimer: TimerHandle | null = null;

  function clearTimers() {
    if (trailingTimer !== null) {
      clearTimer(trailingTimer);
      trailingTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimer(maxWaitTimer);
      maxWaitTimer = null;
    }
  }

  function flush() {
    clearTimers();
    if (latestValue === null) {
      return;
    }

    const value = latestValue;
    latestValue = null;
    request(value);
  }

  return {
    cancel() {
      clearTimers();
      latestValue = null;
    },
    flush,
    schedule(value) {
      latestValue = value;
      if (trailingTimer !== null) {
        clearTimer(trailingTimer);
      }
      trailingTimer = setTimer(flush, delayMs);

      if (maxWaitTimer === null) {
        maxWaitTimer = setTimer(flush, maxWaitMs);
      }
    }
  };
}

export function createCoalescedSaveQueue<T>({
  initialValue,
  isEqual,
  onStatusChange,
  save
}: CoalescedSaveQueueOptions<T>): CoalescedSaveQueue<T> {
  let committedValue = initialValue;
  let queuedValue: T | null = null;
  let isSaving = false;
  let generation = 0;

  async function drain(firstValue: T, startedGeneration: number) {
    let value = firstValue;
    isSaving = true;
    onStatusChange?.("saving");

    while (startedGeneration === generation) {
      try {
        await save(value);
      } catch (error) {
        if (startedGeneration !== generation) {
          return;
        }

        if (queuedValue !== null) {
          value = queuedValue;
          queuedValue = null;
          continue;
        }

        isSaving = false;
        onStatusChange?.("error", error);
        return;
      }

      if (startedGeneration !== generation) {
        return;
      }

      committedValue = value;
      if (queuedValue !== null && !isEqual(queuedValue, committedValue)) {
        value = queuedValue;
        queuedValue = null;
        continue;
      }

      queuedValue = null;
      isSaving = false;
      onStatusChange?.("saved");
      return;
    }
  }

  return {
    request(value) {
      if (isSaving) {
        queuedValue = value;
        return;
      }

      if (isEqual(value, committedValue)) {
        return;
      }

      void drain(value, generation);
    },

    reset(value) {
      generation += 1;
      committedValue = value;
      queuedValue = null;
      isSaving = false;
      onStatusChange?.("idle");
    }
  };
}

/** A versioned write receives the version it must match and resolves to the version it committed. */
export type VersionedWrite = (expectedVersion: string) => Promise<string>;

export type SerialVersionChannel = {
  commit(write: VersionedWrite): Promise<void>;
  version: { current: string };
};

/** Editors sharing one record version commit one at a time, each against the latest committed version. */
export function createSerialVersionChannel(initialVersion: string): SerialVersionChannel {
  const version = { current: initialVersion };
  let pendingWrite: Promise<void> = Promise.resolve();

  return {
    commit(write) {
      const commit = pendingWrite.then(async () => {
        version.current = await write(version.current);
      });
      pendingWrite = commit.catch(() => undefined);
      return commit;
    },
    version
  };
}
