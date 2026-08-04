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
