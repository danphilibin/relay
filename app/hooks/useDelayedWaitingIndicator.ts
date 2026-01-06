import { useState, useEffect, useRef } from "react";

const WAITING_DELAY_MS = 1000;
const MIN_DISPLAY_MS = 500;

/**
 * Hook to manage a "waiting" indicator that:
 * - Only shows after a delay (to avoid flashing for fast responses)
 * - Once shown, stays visible for a minimum time (to avoid brief flashes)
 */
export function useDelayedWaitingIndicator(isWaiting: boolean) {
  const [showIndicator, setShowIndicator] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (isWaiting) {
      // Start timer to show indicator after delay
      const showTimer = setTimeout(() => {
        setShowIndicator(true);
        visibleSinceRef.current = Date.now();
      }, WAITING_DELAY_MS);

      return () => clearTimeout(showTimer);
    } else {
      // No longer waiting - hide with minimum display time
      if (showIndicator && visibleSinceRef.current !== null) {
        const elapsed = Date.now() - visibleSinceRef.current;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

        if (remaining > 0) {
          const hideTimer = setTimeout(() => {
            setShowIndicator(false);
            visibleSinceRef.current = null;
          }, remaining);
          return () => clearTimeout(hideTimer);
        }
      }

      setShowIndicator(false);
      visibleSinceRef.current = null;
    }
  }, [isWaiting, showIndicator]);

  return showIndicator;
}
