import { createContext, useContext, type ReactNode } from "react";
import {
  useDayNightProfile,
  type DayNightProfile,
  type WorldTimeAnchor,
} from "./dayNight";

const DayNightContext = createContext<DayNightProfile | null>(null);

export function DayNightProvider({
  worldTime,
  overridePhase,
  children,
}: {
  worldTime: WorldTimeAnchor;
  overridePhase: number | null;
  children: ReactNode;
}) {
  const profile = useDayNightProfile(worldTime, overridePhase);
  return <DayNightContext.Provider value={profile}>{children}</DayNightContext.Provider>;
}

export function useDayNight(): DayNightProfile {
  const profile = useContext(DayNightContext);
  if (!profile) throw new Error("useDayNight must be used inside DayNightProvider");
  return profile;
}
