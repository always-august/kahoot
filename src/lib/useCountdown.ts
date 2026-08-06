"use client";

import { useEffect, useState } from "react";

/** deadline(epoch ms)까지 남은 밀리초를 100ms 간격으로 반환한다. */
export function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}
