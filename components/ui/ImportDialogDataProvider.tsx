"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { DeckListSelectionOption, DeckSelectionOption } from "@/types/index";

type DeckSelectionOptionsResponse = {
  deckLists?: DeckListSelectionOption[];
  userDecks?: DeckSelectionOption[];
};

type ImportDialogDataContextValue = {
  ensureUserDecks: () => Promise<DeckSelectionOption[]>;
  isLoadingUserDecks: boolean;
  seedUserDeckLists: (deckLists: DeckListSelectionOption[]) => void;
  seedUserDecks: (userDecks: DeckSelectionOption[]) => void;
  userDeckLists: DeckListSelectionOption[];
  userDecks: DeckSelectionOption[] | null;
  userDecksError: string;
};

const ImportDialogDataContext = createContext<ImportDialogDataContextValue | null>(null);

export function ImportDialogDataProvider({ children }: { children: ReactNode }) {
  const [userDecks, setUserDecks] = useState<DeckSelectionOption[] | null>(null);
  const [userDeckLists, setUserDeckLists] = useState<DeckListSelectionOption[]>([]);
  const [isLoadingUserDecks, setIsLoadingUserDecks] = useState(false);
  const [userDecksError, setUserDecksError] = useState("");
  const pendingUserDecksRef = useRef<Promise<DeckSelectionOption[]> | null>(null);

  const seedUserDecks = useCallback((nextUserDecks: DeckSelectionOption[]) => {
    setUserDecks(nextUserDecks);
    setUserDecksError("");
  }, []);

  const seedUserDeckLists = useCallback((nextUserDeckLists: DeckListSelectionOption[]) => {
    setUserDeckLists(nextUserDeckLists);
  }, []);

  const ensureUserDecks = useCallback(async () => {
    if (userDecks !== null) {
      return userDecks;
    }

    if (pendingUserDecksRef.current) {
      return pendingUserDecksRef.current;
    }

    setIsLoadingUserDecks(true);
    setUserDecksError("");

    const request = fetch("/api/deck-selection-options", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load deck options.");
        }

        const payload = (await response.json()) as DeckSelectionOptionsResponse;
        const nextUserDecks = Array.isArray(payload.userDecks) ? payload.userDecks : [];
        setUserDeckLists(Array.isArray(payload.deckLists) ? payload.deckLists : []);
        setUserDecks(nextUserDecks);
        return nextUserDecks;
      })
      .catch((error) => {
        setUserDecksError("Could not load deck options. Check your connection and retry.");
        throw error;
      })
      .finally(() => {
        pendingUserDecksRef.current = null;
        setIsLoadingUserDecks(false);
      });

    pendingUserDecksRef.current = request;
    return request;
  }, [userDecks]);

  const value = useMemo(
    () => ({
      ensureUserDecks,
      isLoadingUserDecks,
      seedUserDeckLists,
      seedUserDecks,
      userDeckLists,
      userDecks,
      userDecksError
    }),
    [
      ensureUserDecks,
      isLoadingUserDecks,
      seedUserDeckLists,
      seedUserDecks,
      userDeckLists,
      userDecks,
      userDecksError
    ]
  );

  return (
    <ImportDialogDataContext.Provider value={value}>
      {children}
    </ImportDialogDataContext.Provider>
  );
}

export function useImportDialogData() {
  const context = useContext(ImportDialogDataContext);
  if (!context) {
    throw new Error("useImportDialogData must be used within an ImportDialogDataProvider");
  }

  return context;
}
