"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createBoundedSaveScheduler,
  createCoalescedSaveQueue,
  type BoundedSaveScheduler,
  type CoalescedSaveQueue,
  type CoalescedSaveStatus
} from "@/lib/client/coalesced-save-queue";

type UseCoalescedAutosaveOptions<T> = {
  debounceMs?: number;
  fallbackError: string;
  initialValue: T;
  isEqual?: (left: T, right: T) => boolean;
  maxWaitMs?: number;
  save: (value: T) => Promise<void>;
};

function jsonEqual<T>(left: T, right: T) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useCoalescedAutosave<T>({
  debounceMs = 500,
  fallbackError,
  initialValue,
  isEqual = jsonEqual,
  maxWaitMs = 2000,
  save
}: UseCoalescedAutosaveOptions<T>) {
  const [, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<CoalescedSaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const saveRef = useRef(save);
  const mountedRef = useRef(true);
  const saveStatusTimerRef = useRef<number | null>(null);
  const queueRef = useRef<CoalescedSaveQueue<T> | null>(null);
  const schedulerRef = useRef<BoundedSaveScheduler<T> | null>(null);

  saveRef.current = save;

  const clearSavedReset = useCallback(() => {
    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }
  }, []);

  if (queueRef.current === null) {
    queueRef.current = createCoalescedSaveQueue({
      initialValue,
      isEqual,
      onStatusChange(status, error) {
        clearSavedReset();
        if (!mountedRef.current) {
          return;
        }
        setSaveStatus(status);
        setErrorMessage(
          status === "error"
            ? error instanceof Error
              ? error.message
              : fallbackError
            : ""
        );

        if (status === "saved") {
          saveStatusTimerRef.current = window.setTimeout(() => {
            setSaveStatus("idle");
          }, 1400);
        }
      },
      save: (value) =>
        new Promise<void>((resolve, reject) => {
          startTransition(async () => {
            try {
              await saveRef.current(value);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        })
    });
  }

  if (schedulerRef.current === null) {
    schedulerRef.current = createBoundedSaveScheduler({
      delayMs: debounceMs,
      maxWaitMs,
      request: (value) => queueRef.current?.request(value)
    });
  }

  const queueSave = useCallback((value: T) => {
    schedulerRef.current?.cancel();
    queueRef.current?.request(value);
  }, []);

  const scheduleSave = useCallback((value: T) => {
    schedulerRef.current?.schedule(value);
  }, []);

  const resetSavedValue = useCallback(
    (value: T) => {
      clearSavedReset();
      schedulerRef.current?.cancel();
      queueRef.current?.reset(value);
    },
    [clearSavedReset]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      schedulerRef.current?.flush();
      clearSavedReset();
    };
  }, [clearSavedReset]);

  return {
    errorMessage,
    queueSave,
    resetSavedValue,
    scheduleSave,
    saveStatus
  };
}
