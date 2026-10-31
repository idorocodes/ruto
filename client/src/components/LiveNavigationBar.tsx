import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LocateFixed,
  MapPin,
  Navigation,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LiveNavigationState } from '../hooks/useLiveNavigation';
import { RutoLanguage, Waypoint } from '../types';
import { formatDistanceLabel } from '../utils/geo';
import {
  buildStepSpeechLine,
  isSpeechSynthesisSupported,
  speakRouteText,
  stopSpeaking,
} from '../utils/speech';

interface LiveNavigationBarProps {
  nav: LiveNavigationState;
  waypoints: Waypoint[];
  directions?: string[];
  language?: RutoLanguage;
}

export function LiveNavigationBar({
  nav,
  waypoints,
  directions = [],
  language = 'English',
}: LiveNavigationBarProps) {
  const ttsSupported = isSpeechSynthesisSupported();
  const [readAloud, setReadAloud] = useState<boolean>(true);
  const [isSpeakingNow, setIsSpeakingNow] = useState<boolean>(false);

  // Track which step/approach/arrival announcements were already spoken during this walk
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const prevStepRef = useRef<number>(-1);

  const speakAnnouncement = useCallback(
    (text: string) => {
      if (!ttsSupported || !text.trim()) return;
      speakRouteText(text, language, {
        onStart: () => setIsSpeakingNow(true),
        onEnd: () => setIsSpeakingNow(false),
        onError: () => setIsSpeakingNow(false),
      });
    },
    [ttsSupported, language]
  );

  const speakCurrentStepNow = useCallback(
    (customPrefix?: string) => {
      const idx = Math.min(nav.activeStepIndex, waypoints.length - 1);
      const wp = waypoints[idx];
      if (!wp) return;

      if (nav.arrived) {
        speakAnnouncement(
          `You have arrived at ${wp.name}.${wp.note ? ` ${wp.note}` : ''}`
        );
        return;
      }

      const line = buildStepSpeechLine({
        stepIndex: idx,
        totalSteps: waypoints.length,
        waypoint: wp,
        directionSentence: directions[idx],
        prefix: customPrefix,
      });
      speakAnnouncement(line);
    },
    [nav.activeStepIndex, nav.arrived, waypoints, directions, speakAnnouncement]
  );

  // Reset spoken tracker and stop speech when navigation stops or route changes
  useEffect(() => {
    if (!nav.isNavigating) {
      spokenKeysRef.current.clear();
      prevStepRef.current = -1;
      stopSpeaking();
      setIsSpeakingNow(false);
    }
  }, [nav.isNavigating, waypoints]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Hands-Free Auto-Readout on Start, 25m Step Progression, Approaching Turn, and Arrival
  useEffect(() => {
    if (!nav.isNavigating || !readAloud || !ttsSupported || waypoints.length === 0) {
      return;
    }

    // 1. Final arrival within 25 m
    if (nav.arrived) {
      const arriveKey = 'arrived-final';
      if (!spokenKeysRef.current.has(arriveKey)) {
        spokenKeysRef.current.add(arriveKey);
        const dest = waypoints[waypoints.length - 1];
        speakAnnouncement(
          `You have arrived at ${dest?.name || 'your destination'}!`
        );
      }
      return;
    }

    // 2. Step started or auto-advanced because walker came within <= 25 m of previous pin
    const idx = Math.min(nav.activeStepIndex, waypoints.length - 1);
    const stepKey = `step-${idx}`;
    if (!spokenKeysRef.current.has(stepKey)) {
      spokenKeysRef.current.add(stepKey);
      const reachedPrev =
        prevStepRef.current >= 0 && idx > prevStepRef.current
          ? `Reached ${waypoints[prevStepRef.current]?.name || 'checkpoint'}. Next,`
          : undefined;
      prevStepRef.current = idx;

      const line = buildStepSpeechLine({
        stepIndex: idx,
        totalSteps: waypoints.length,
        waypoint: waypoints[idx],
        directionSentence: directions[idx],
        prefix: reachedPrev,
      });
      speakAnnouncement(line);
      return;
    }

    // 3. Approaching turn callout when entering <= 35 m (before the 25 m auto-advance)
    if (
      nav.distanceToNextMeters !== null &&
      nav.distanceToNextMeters <= 35 &&
      nav.distanceToNextMeters > 25 &&
      idx < waypoints.length - 1
    ) {
      const approachKey = `approach-${idx}`;
      if (!spokenKeysRef.current.has(approachKey)) {
        spokenKeysRef.current.add(approachKey);
        const target = waypoints[idx];
        const nextWp = waypoints[idx + 1];
        const turnPhrase =
          target.turn && target.turn !== 'straight'
            ? `turn ${target.turn}`
            : 'continue straight';
        speakAnnouncement(
          `In ${nav.distanceToNextMeters} meters at ${target.name}, ${turnPhrase} toward ${nextWp.name}.`
        );
      }
    }
  }, [
    nav.isNavigating,
    nav.arrived,
    nav.activeStepIndex,
    nav.distanceToNextMeters,
    readAloud,
    ttsSupported,
    waypoints,
    directions,
    speakAnnouncement,
  ]);

  const handleToggleReadAloud = () => {
    if (readAloud) {
      setReadAloud(false);
      stopSpeaking();
      setIsSpeakingNow(false);
    } else {
      setReadAloud(true);
      if (nav.isNavigating) {
        speakCurrentStepNow();
      }
    }
  };

  if (!nav.isNavigating) {
    return (
      <div className="p-3.5 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-display font-bold text-sm text-[#F6F4EE] flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#3DDC97]" />
            <span>Live Campus Turn-by-Turn</span>
          </div>
          <p className="text-xs text-[#B9C2CC]">
            On-device GPS distance &amp; hands-free voice guidance within 25 m of
            each turn.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ttsSupported && (
            <button
              type="button"
              onClick={handleToggleReadAloud}
              title={
                readAloud
                  ? 'Hands-free voice readout is ON'
                  : 'Hands-free voice readout is muted'
              }
              className={`h-11 px-3 rounded-xl border font-mono text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                readAloud
                  ? 'bg-[#3DDC97]/15 border-[#3DDC97]/50 text-[#3DDC97]'
                  : 'bg-[#11161C] border-[#2A3541] text-[#859489] hover:text-[#F6F4EE]'
              }`}
            >
              {readAloud ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
              <span>{readAloud ? 'Read Aloud ON' : 'Muted'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={nav.startNavigating}
            className="h-11 px-4 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            <span>Start navigating</span>
          </button>
        </div>
      </div>
    );
  }

  const currentTarget =
    waypoints[Math.min(nav.activeStepIndex, waypoints.length - 1)];

  return (
    <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#3DDC97]/60 space-y-3.5 shadow-[0_0_24px_rgba(61,220,151,0.12)]">
      {/* Header Row: Live Status + Accuracy Pill + Read Aloud Toggle + Stop */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] ring-4 ring-[#3B82F6]/25" />
          <span className="font-mono text-xs font-semibold text-[#F6F4EE]">
            {nav.userPos?.isManual ? 'MANUAL MAP PIN' : 'LIVE GPS ACTIVE'}
          </span>

          {nav.accuracyMeters !== null && (
            <span
              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold tabular-nums ${
                nav.isWeakAccuracy
                  ? 'bg-[#FFB368]/20 border border-[#FFB368] text-[#FFB368]'
                  : 'bg-[#11161C] border border-[#2A3541] text-[#3DDC97]'
              }`}
            >
              ±{nav.accuracyMeters} m
            </span>
          )}

          {isSpeakingNow && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#3DDC97]/20 text-[#3DDC97] font-mono text-[10px] font-semibold animate-pulse">
              <Volume2 className="w-3 h-3" />
              Speaking…
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {ttsSupported && (
            <>
              <button
                type="button"
                onClick={handleToggleReadAloud}
                title="Toggle hands-free voice readout as you walk"
                className={`h-8 px-2.5 rounded-lg border font-mono text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  readAloud
                    ? 'bg-[#3DDC97]/15 border-[#3DDC97]/60 text-[#3DDC97]'
                    : 'bg-[#11161C] border-[#2A3541] text-[#859489] hover:text-[#F6F4EE]'
                }`}
              >
                {readAloud ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span>{readAloud ? 'Read Aloud' : 'Muted'}</span>
              </button>

              {readAloud && (
                <button
                  type="button"
                  onClick={() => speakCurrentStepNow()}
                  title="Speak current step aloud now"
                  className="h-8 px-2.5 rounded-lg bg-[#11161C] hover:bg-[#252a31] border border-[#2A3541] font-mono text-[11px] text-[#F6F4EE] cursor-pointer"
                >
                  Repeat
                </button>
              )}
            </>
          )}

          {!nav.permissionFallback && (
            <button
              type="button"
              onClick={nav.enableManualTapMode}
              className="h-8 px-2.5 rounded-lg bg-[#11161C] hover:bg-[#252a31] border border-[#2A3541] font-mono text-[11px] text-[#B9C2CC] inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-[#3B82F6]" />
              <span>Tap map</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              nav.stopNavigating();
            }}
            className="h-8 px-2.5 rounded-lg bg-[#93000a]/30 hover:bg-[#93000a]/50 border border-[#FF5A5F]/60 font-mono text-[11px] font-semibold text-[#ffb4ab] inline-flex items-center gap-1 cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Weak GPS Accuracy Warning (> 50m) */}
      {nav.isWeakAccuracy && (
        <div className="p-2.5 rounded-xl bg-[#FFB368]/15 border border-[#FFB368]/60 flex items-center gap-2 text-xs text-[#FFD8B6]">
          <AlertTriangle className="w-4 h-4 text-[#FFB368] shrink-0" />
          <span>
            GPS accuracy is weak (±{nav.accuracyMeters} m &gt; 50 m). Step outdoors
            or tap the map to pin your exact spot.
          </span>
        </div>
      )}

      {/* Denied / Unavailable Geolocation Friendly Fallback */}
      {nav.fallbackMessage && (
        <div className="p-3 rounded-xl bg-[#11161C] border border-[#3B82F6]/50 flex items-start gap-2.5 text-xs text-[#dee3eb]">
          <LocateFixed className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-[#F6F4EE]">{nav.fallbackMessage}</p>
            <p className="text-[#859489] mt-0.5">
              Tap along the route pins on the map above to simulate walking — when
              you tap within 25 m of a pin, Ruto advances and speaks the next turn!
            </p>
          </div>
        </div>
      )}

      {/* Arrived Banner vs Live Distance Readout */}
      {nav.arrived ? (
        <div className="p-4 rounded-xl bg-[#0b291c] border border-[#3DDC97] flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#3DDC97] text-[#002112] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="font-display font-bold text-base text-[#61f9b1]">
              You&apos;ve arrived!
            </div>
            <p className="text-xs text-[#bbcabe]">
              Within 25 m of {currentTarget?.name || 'your destination'}.
            </p>
          </div>
        </div>
      ) : nav.userPos ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#B9C2CC]">
              Heading to Step {nav.activeStepIndex + 1} of {waypoints.length}:{' '}
              <strong className="text-[#F6F4EE]">{currentTarget?.name}</strong>
            </span>
            <span className="font-mono text-[11px] text-[#3DDC97]">
              &le;25m speaks next turn
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-[#11161C] border border-[#2A3541]">
              <div className="font-mono text-[10px] text-[#859489] uppercase">
                Next Point
              </div>
              <div className="font-display font-bold text-base text-[#3DDC97] tabular-nums mt-0.5">
                {nav.distanceToNextMeters !== null
                  ? formatDistanceLabel(nav.distanceToNextMeters)
                  : '—'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#11161C] border border-[#2A3541]">
              <div className="font-mono text-[10px] text-[#859489] uppercase">
                Remaining
              </div>
              <div className="font-display font-bold text-base text-[#F6F4EE] tabular-nums mt-0.5">
                {nav.totalRemainingMeters !== null
                  ? formatDistanceLabel(nav.totalRemainingMeters)
                  : '—'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#11161C] border border-[#2A3541]">
              <div className="font-mono text-[10px] text-[#859489] uppercase">
                Time Left
              </div>
              <div className="font-display font-bold text-base text-[#FFB368] tabular-nums mt-0.5">
                {nav.walkingMinutesLeft !== null
                  ? `~${nav.walkingMinutesLeft} min`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs font-mono text-[#859489]">
          Acquiring GPS fix — or tap the map to place your starting position…
        </div>
      )}
    </div>
  );
}
