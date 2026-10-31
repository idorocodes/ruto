import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveUserPosition, Waypoint } from '../types';
import { haversineMeters } from '../utils/geo';

const ARRIVAL_THRESHOLD_METERS = 25;
const WALKING_METERS_PER_MIN = 80;

export interface LiveNavigationState {
  isNavigating: boolean;
  userPos: LiveUserPosition | null;
  activeStepIndex: number;
  arrived: boolean;
  permissionFallback: boolean;
  fallbackMessage: string | null;
  distanceToNextMeters: number | null;
  totalRemainingMeters: number | null;
  walkingMinutesLeft: number | null;
  accuracyMeters: number | null;
  isWeakAccuracy: boolean;
  startNavigating: () => void;
  stopNavigating: () => void;
  enableManualTapMode: () => void;
  setManualUserPosition: (lat: number, lng: number) => void;
}

/**
 * Pure on-device geolocation + Haversine live navigation hook.
 * Live coordinates NEVER leave browser memory (never sent to any server or Gemma).
 */
export function useLiveNavigation(waypoints: Waypoint[]): LiveNavigationState {
  const [isNavigating, setIsNavigating] = useState(false);
  const [userPos, setUserPos] = useState<LiveUserPosition | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [permissionFallback, setPermissionFallback] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const stopNavigating = useCallback(() => {
    clearWatch();
    setIsNavigating(false);
    setUserPos(null);
    setActiveStepIndex(0);
    setArrived(false);
    setPermissionFallback(false);
    setFallbackMessage(null);
  }, [clearWatch]);

  const startNavigating = useCallback(() => {
    clearWatch();
    setIsNavigating(true);
    setActiveStepIndex(0);
    setArrived(false);
    setPermissionFallback(false);
    setFallbackMessage(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionFallback(true);
      setFallbackMessage(
        'Live GPS is unavailable on this browser. Tap anywhere on the map to set your starting point instead.'
      );
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissionFallback(false);
        setFallbackMessage(null);
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.max(1, pos.coords.accuracy || 15),
          isManual: false,
        });
      },
      () => {
        setPermissionFallback(true);
        setFallbackMessage(
          'Location permission was denied or unavailable. Tap anywhere on the map to set your starting point instead.'
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2500,
        timeout: 9000,
      }
    );
  }, [clearWatch]);

  const enableManualTapMode = useCallback(() => {
    clearWatch();
    setPermissionFallback(true);
    setFallbackMessage(
      'Tap anywhere on the map to place or move your blue "you are here" dot.'
    );
  }, [clearWatch]);

  const setManualUserPosition = useCallback((lat: number, lng: number) => {
    setUserPos({
      lat,
      lng,
      accuracy: 8,
      isManual: true,
    });
  }, []);

  // Reset if waypoint set changes dramatically
  useEffect(() => {
    if (activeStepIndex >= waypoints.length && waypoints.length > 0) {
      setActiveStepIndex(0);
    }
  }, [waypoints.length, activeStepIndex]);

  // Cleanup geolocation watcher on unmount
  useEffect(() => {
    return () => {
      clearWatch();
    };
  }, [clearWatch]);

  // Check proximity <= 25m to advance step or mark "You've arrived"
  useEffect(() => {
    if (!isNavigating || !userPos || arrived || waypoints.length === 0) return;

    let nextIdx = activeStepIndex;
    let reachedEnd = false;

    while (nextIdx < waypoints.length) {
      const target = waypoints[nextIdx];
      const dist = haversineMeters(
        userPos.lat,
        userPos.lng,
        target.lat,
        target.lng
      );
      if (dist <= ARRIVAL_THRESHOLD_METERS) {
        if (nextIdx === waypoints.length - 1) {
          reachedEnd = true;
          break;
        }
        nextIdx += 1;
      } else {
        break;
      }
    }

    if (reachedEnd) {
      setActiveStepIndex(waypoints.length - 1);
      setArrived(true);
    } else if (nextIdx !== activeStepIndex) {
      setActiveStepIndex(nextIdx);
    }
  }, [isNavigating, userPos, arrived, activeStepIndex, waypoints]);

  const metrics = useMemo(() => {
    if (!isNavigating || !userPos || waypoints.length === 0) {
      return {
        distanceToNextMeters: null,
        totalRemainingMeters: null,
        walkingMinutesLeft: null,
      };
    }

    if (arrived) {
      return {
        distanceToNextMeters: 0,
        totalRemainingMeters: 0,
        walkingMinutesLeft: 0,
      };
    }

    const safeIdx = Math.min(activeStepIndex, waypoints.length - 1);
    const target = waypoints[safeIdx];
    const distToNext = haversineMeters(
      userPos.lat,
      userPos.lng,
      target.lat,
      target.lng
    );

    let remainingSegments = 0;
    for (let i = safeIdx; i < waypoints.length - 1; i++) {
      remainingSegments += haversineMeters(
        waypoints[i].lat,
        waypoints[i].lng,
        waypoints[i + 1].lat,
        waypoints[i + 1].lng
      );
    }

    const totalRemaining = Math.round(distToNext + remainingSegments);
    const minutesLeft = Math.max(
      1,
      Math.round(totalRemaining / WALKING_METERS_PER_MIN)
    );

    return {
      distanceToNextMeters: Math.round(distToNext),
      totalRemainingMeters: totalRemaining,
      walkingMinutesLeft: minutesLeft,
    };
  }, [isNavigating, userPos, arrived, activeStepIndex, waypoints]);

  const accuracyMeters = userPos ? Math.round(userPos.accuracy) : null;
  const isWeakAccuracy =
    accuracyMeters !== null && !userPos?.isManual && accuracyMeters > 50;

  return {
    isNavigating,
    userPos,
    activeStepIndex,
    arrived,
    permissionFallback,
    fallbackMessage,
    distanceToNextMeters: metrics.distanceToNextMeters,
    totalRemainingMeters: metrics.totalRemainingMeters,
    walkingMinutesLeft: metrics.walkingMinutesLeft,
    accuracyMeters,
    isWeakAccuracy,
    startNavigating,
    stopNavigating,
    enableManualTapMode,
    setManualUserPosition,
  };
}
