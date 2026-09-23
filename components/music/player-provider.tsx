"use client";

import * as React from "react";

interface PlayerContextValue {
  /** Track id that currently holds playback, or null when nothing plays. */
  activeId: string | null;
  /** Claim playback for a track. Every other player pauses itself. */
  claim: (id: string) => void;
  /** Release playback if this track still holds it. */
  release: (id: string) => void;
}

const PlayerContext = React.createContext<PlayerContextValue>({
  activeId: null,
  claim: () => {},
  release: () => {},
});

/**
 * Keeps two snippets from ever playing over each other. Players claim
 * playback on play and watch `activeId` to pause when another one takes over.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const claim = React.useCallback((id: string) => setActiveId(id), []);
  const release = React.useCallback(
    (id: string) => setActiveId((current) => (current === id ? null : current)),
    []
  );

  const value = React.useMemo(
    () => ({ activeId, claim, release }),
    [activeId, claim, release]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  return React.useContext(PlayerContext);
}
