"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createCoalescedSaveQueue,
  type CoalescedSaveQueue,
  type CoalescedSaveStatus
} from "@/lib/client/coalesced-save-queue";

type UseCoalescedAutosaveOptions<T> = {
  fallbackError: string;
  initialValue: T;
  isEqual?: (left: T, right: T) => boolean;
  save: (value: T) => Promise<void>;
};

function jsonEqual<T>(left: T, right: T) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useCoalescedAutosave<T>({
  fallbackError,
  initialValue,
  isEqual = jsonEqual,
  save
}: UseCoalescedAutosaveOptions<T>) {
  const [, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<CoalescedSaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const saveRef = useRef(save);
  const saveStatusTimerRef = useRef<number | null>(null);
  const queueRef = useRef<CoalescedSaveQueue<T> | null>(null);

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

  const queueSave = useCallback((value: T) => {
    queueRef.current?.request(value);
  }, []);

  const resetSavedValue = useCallback(
    (value: T) => {
      clearSavedReset();
      queueRef.current?.reset(value);
    },
    [clearSavedReset]
  );

  useEffect(() => () => clearSavedReset(), [clearSavedReset]);

  return {
    errorMessage,
    queueSave,
    resetSavedValue,
    saveStatus
  };
}
