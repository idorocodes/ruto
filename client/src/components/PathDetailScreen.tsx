import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUp,
  Check,
  CornerUpLeft,
  CornerUpRight,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react';
import {
  confirmPath,
  generateRouteDirectionsWithGemma,
  getPath,
  normalizeApiError,
} from '../api';
import { ApiErrorShape, RutoLanguage, SharedPathDetail, Waypoint } from '../types';
import { useLiveNavigation } from '../hooks/useLiveNavigation';
import { LiveNavigationBar } from './LiveNavigationBar';
import { RouteMap } from './RouteMap';
import { FooterLine } from './TopBarAndNav';
import {
  computeRouteGeometry,
  estimateDurationMinutes,
  formatDistanceLabel,
  haversineMeters,
  modeToTransitMode,
  reverseWaypointsAndRecomputeTurns,
  sharedPointsToWaypoints,
} from '../utils/geo';

interface PathDetailScreenProps {
  pathId: string;
  onSendAsCard: (params: {
    title: string;
    mode: 'Walk' | 'Keke' | 'Okada';
    language: RutoLanguage;
    waypoints: Waypoint[];
    directions: string[];
  }) => void;
}

export function PathDetailScreen({
  pathId,
  onSendAsCard,
}: PathDetailScreenProps) {
  const [path, setPath] = useState<SharedPathDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiErrorShape | null>(null);

  const [isReversed, setIsReversed] = useState(false);
  const [language, setLanguage] = useState<RutoLanguage>('Pidgin');

  // Cache directions keyed by `${isReversed ? 'rev' : 'fwd'}-${language}`
  const [dirsCache, setDirsCache] = useState<Record<string, string[]>>({});
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [dirsError, setDirsError] = useState<string | null>(null);

  // Crowd confirmation ("Did this route work?")
  const [confirmWorked, setConfirmWorked] = useState<boolean | null>(null);
  const [confirmNote, setConfirmNote] = useState('');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState<ApiErrorShape | null>(null);
  const [confirmSubmitted, setConfirmSubmitted] = useState(false);

  const fetchPathDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getPath(pathId);
      setPath(data);
    } catch (err: unknown) {
      setLoadError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [pathId]);

  useEffect(() => {
    fetchPathDetail();
    setIsReversed(false);
    setDirsCache({});
    setConfirmWorked(null);
    setConfirmNote('');
    setConfirmSubmitted(false);
  }, [fetchPathDetail]);

  const activeWaypoints = useMemo(() => {
    if (!path) return [];
    const forward = sharedPointsToWaypoints(path.points);
    return isReversed ? reverseWaypointsAndRecomputeTurns(forward) : forward;
  }, [path, isReversed]);

  const nav = useLiveNavigation(activeWaypoints);
  const geo = useMemo(
    () => computeRouteGeometry(activeWaypoints),
    [activeWaypoints]
  );

  const cacheKey = `${isReversed ? 'rev' : 'fwd'}-${language}`;
  const currentDirections = dirsCache[cacheKey] || [];

  const generateDirections = useCallback(
    async (force = false) => {
      if (!path || activeWaypoints.length < 2) return;
      const key = `${isReversed ? 'rev' : 'fwd'}-${language}`;
      if (!force && dirsCache[key]?.length) return;

      setLoadingDirs(true);
      setDirsError(null);
      try {
        const computed = computeRouteGeometry(activeWaypoints);
        const res = await generateRouteDirectionsWithGemma({
          language,
          mode: modeToTransitMode(path.mode),
          steps: computed.steps,
        });
        setDirsCache((prev) => ({
          ...prev,
          [key]: res.directions.map((d) => d.instruction),
        }));
      } catch (err: unknown) {
        setDirsError(
          err instanceof Error
            ? err.message
            : 'Gemma 4 could not write directions right now. Tap Retry.'
        );
      } finally {
        setLoadingDirs(false);
      }
    },
    [path, activeWaypoints, isReversed, language, dirsCache]
  );

  useEffect(() => {
    if (path && activeWaypoints.length >= 2) {
      generateDirections(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path?.id, isReversed, language]);

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path || confirmWorked === null) return;

    setSubmittingConfirm(true);
    setConfirmError(null);
    try {
      const updated = await confirmPath(path.id, {
        worked: confirmWorked,
        note: confirmNote.trim() || undefined,
      });
      setPath((prev) =>
        prev
          ? {
              ...prev,
              confirmations: updated.confirmations,
              flags: updated.flags,
            }
          : prev
      );
      setConfirmSubmitted(true);
    } catch (err: unknown) {
      setConfirmError(normalizeApiError(err));
    } finally {
      setSubmittingConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#3DDC97] animate-spin mx-auto" />
        <p className="font-display font-semibold text-base text-[#F6F4EE]">
          Loading campus path...
        </p>
      </div>
    );
  }

  if (loadError || !path) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-[#FF5A5F] mx-auto" />
        <h1 className="font-display font-bold text-xl text-[#F6F4EE]">
          Could not load path
        </h1>
        <p className="text-sm text-[#B9C2CC]">
          {loadError?.message || 'Path was not found.'}
        </p>
        <button
          type="button"
          onClick={fetchPathDetail}
          className="h-11 px-5 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const displayStart = isReversed ? path.endName : path.startName;
  const displayEnd = isReversed ? path.startName : path.endName;
  const displayTitle = isReversed
    ? `${path.endName} → ${path.startName}`
    : path.title;
  const mayBeOutdated = path.flags >= 2;
  const estMinutes = estimateDurationMinutes(geo.totalMeters, path.mode);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 space-y-5">
      {/* Header Summary Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-[#3DDC97]/15 border border-[#3DDC97]/40 font-mono text-xs font-semibold text-[#3DDC97]">
              Worked for {path.confirmations}{' '}
              {path.confirmations === 1 ? 'person' : 'people'}
            </span>

            {mayBeOutdated && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFB368]/20 border border-[#FFB368] font-mono text-xs font-semibold text-[#FFB368]">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>May be outdated ({path.flags} reports)</span>
              </span>
            )}
          </div>

          <span className="font-mono text-xs text-[#859489] tabular-nums">
            {formatDistanceLabel(geo.totalMeters)} · ~{estMinutes} min {path.mode}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-[#F6F4EE]">
              {displayTitle}
            </h1>
            <p className="text-xs text-[#B9C2CC] mt-0.5">
              {displayStart} → {displayEnd} · Recorded by @{path.recordedBy}
            </p>
          </div>

          {/* Reverse Direction Switch */}
          <button
            type="button"
            onClick={() => {
              nav.stopNavigating();
              setIsReversed((r) => !r);
            }}
            className={`h-11 px-4 rounded-xl border font-mono text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer ${
              isReversed
                ? 'bg-[#3DDC97] border-[#3DDC97] text-[#002112]'
                : 'bg-[#11161C] border-[#2A3541] hover:border-[#3DDC97] text-[#F6F4EE]'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>{isReversed ? 'Walking Reversed' : 'Reverse direction'}</span>
          </button>
        </div>
      </div>

      {/* Map + Live Navigation HUD */}
      <div className="rounded-2xl overflow-hidden border border-[#2A3541]">
        <RouteMap
          waypoints={activeWaypoints}
          interactive={false}
          theme="mint"
          heightClass="h-[260px] sm:h-[320px]"
          liveUserPos={nav.userPos}
          activeStepIndex={nav.isNavigating ? nav.activeStepIndex : null}
          arrived={nav.arrived}
          allowManualPositionTap={nav.isNavigating && nav.permissionFallback}
          onManualPositionTap={nav.setManualUserPosition}
        />
      </div>

      <LiveNavigationBar
        nav={nav}
        waypoints={activeWaypoints}
        directions={currentDirections}
        language={language}
      />

      {/* Crowd Confirmation Prompt ("Did this route work?") — prominent after arriving! */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 transition-all ${
          nav.arrived
            ? 'bg-[#0b291c] border-[#3DDC97] shadow-[0_0_24px_rgba(61,220,151,0.2)]'
            : 'bg-[#1A222B] border-[#2A3541]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#3DDC97]" />
            <h2 className="font-display font-bold text-base text-[#F6F4EE]">
              {nav.arrived
                ? "You've arrived — did this route work?"
                : 'Did this route work?'}
            </h2>
          </div>
          <span className="font-mono text-xs text-[#3DDC97] tabular-nums">
            {path.confirmations} Yes · {path.flags} No
          </span>
        </div>

        {confirmSubmitted ? (
          <div className="p-3 rounded-xl bg-[#11161C] border border-[#3DDC97]/40 text-xs text-[#61f9b1] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>
              Thanks! Crowd feedback updated ({path.confirmations} confirmed).
            </span>
          </div>
        ) : (
          <form onSubmit={handleConfirmSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmWorked(true)}
                className={`h-11 rounded-xl border font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                  confirmWorked === true
                    ? 'bg-[#3DDC97] border-[#3DDC97] text-[#002112]'
                    : 'bg-[#11161C] border-[#2A3541] text-[#F6F4EE] hover:border-[#3DDC97]'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span>Yes, worked</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmWorked(false)}
                className={`h-11 rounded-xl border font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                  confirmWorked === false
                    ? 'bg-[#FF5A5F] border-[#FF5A5F] text-[#0f141a]'
                    : 'bg-[#11161C] border-[#2A3541] text-[#F6F4EE] hover:border-[#FF5A5F]'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                <span>No, blocked / outdated</span>
              </button>
            </div>

            {confirmWorked !== null && (
              <>
                <input
                  type="text"
                  value={confirmNote}
                  onChange={(e) => setConfirmNote(e.target.value)}
                  placeholder="Optional note (e.g. Gate locked after 8pm, or dry & clear)"
                  className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                />

                {confirmError && (
                  <div className="p-2.5 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between text-xs text-[#ffdad6]">
                    <span>{confirmError.message}</span>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded bg-[#FF5A5F] text-[#0f141a] font-mono font-bold cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingConfirm}
                  className="w-full h-11 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submittingConfirm ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting feedback...</span>
                    </>
                  ) : (
                    <span>Submit Confirmation</span>
                  )}
                </button>
              </>
            )}
          </form>
        )}
      </div>

      {/* Gemma 4 Grounded Step-by-Step Directions */}
      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3DDC97]/15 border border-[#3DDC97]/30 font-mono text-xs text-[#3DDC97]">
            <Sparkles className="w-3.5 h-3.5" />
            Gemma 4 Directions {isReversed ? '(Reversed)' : ''}
          </span>

          <div className="flex items-center gap-1.5">
            {(['English', 'Pidgin', 'Yoruba'] as RutoLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                disabled={loadingDirs}
                onClick={() => setLanguage(lang)}
                className={`px-3 py-1 rounded-full font-mono text-xs font-semibold transition-colors cursor-pointer ${
                  language === lang
                    ? 'bg-[#3DDC97] text-[#002112]'
                    : 'bg-[#11161C] text-[#B9C2CC] hover:text-[#F6F4EE]'
                }`}
              >
                {lang === 'Yoruba' ? 'Yorùbá' : lang}
              </button>
            ))}
          </div>
        </div>

        {dirsError && (
          <div className="p-3 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-2 text-xs text-[#ffdad6]">
            <span>{dirsError}</span>
            <button
              type="button"
              onClick={() => generateDirections(true)}
              className="px-2.5 py-1 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {loadingDirs ? (
          <div className="py-8 text-center space-y-2">
            <Loader2 className="w-6 h-6 text-[#3DDC97] animate-spin mx-auto" />
            <p className="text-xs font-mono text-[#B9C2CC]">
              Gemma 4 is writing {language} directions from the{' '}
              {isReversed ? 'reversed' : 'stored'} points...
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeWaypoints.map((wp, idx) => {
              const stepGeo = geo.steps[idx];
              const isLast = idx === activeWaypoints.length - 1;
              const turn = stepGeo?.computedTurn || wp.turn;
              const isStepDone =
                nav.isNavigating && (nav.arrived || idx < nav.activeStepIndex);
              const isCurrentStep =
                nav.isNavigating && !nav.arrived && idx === nav.activeStepIndex;

              const liveDist =
                isCurrentStep && nav.userPos
                  ? Math.round(
                      haversineMeters(
                        nav.userPos.lat,
                        nav.userPos.lng,
                        wp.lat,
                        wp.lng
                      )
                    )
                  : null;

              const TurnIcon = isLast
                ? MapPin
                : turn === 'left' || turn === 'slight left'
                ? CornerUpLeft
                : turn === 'right' || turn === 'slight right'
                ? CornerUpRight
                : ArrowUp;

              return (
                <div
                  key={wp.id}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    isCurrentStep
                      ? 'bg-[#3DDC97]/12 border-[#3DDC97] ring-1 ring-[#3DDC97]/40'
                      : isStepDone
                      ? 'bg-[#11161C]/60 border-[#2A3541] opacity-75'
                      : 'bg-[#11161C] border-[#2A3541]'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                      isStepDone || isCurrentStep
                        ? 'bg-[#3DDC97] text-[#002112]'
                        : 'bg-[#3DDC97]/15 text-[#3DDC97]'
                    }`}
                  >
                    {isStepDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {isCurrentStep && (
                      <div className="font-mono text-[11px] font-semibold text-[#3DDC97]">
                        CURRENT STEP
                        {liveDist !== null ? ` · ${liveDist} m away` : ''}
                      </div>
                    )}
                    <p className="font-display font-semibold text-sm text-[#F6F4EE]">
                      {currentDirections[idx] ||
                        `${wp.name}${wp.note ? ` — ${wp.note}` : ''}.`}
                    </p>
                    {wp.note && (
                      <p className="text-xs text-[#B9C2CC]">
                        {wp.name} · {wp.note}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 font-mono text-xs text-[#859489] tabular-nums">
                      <TurnIcon className="w-3.5 h-3.5 text-[#3DDC97]" />
                      <span>
                        {isLast
                          ? 'Destination'
                          : `${formatDistanceLabel(
                              stepGeo?.distanceMetersToNext || 0
                            )} · ${turn}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Send this Shared Path as a Signed Route Card */}
      <button
        type="button"
        onClick={() =>
          onSendAsCard({
            title: displayTitle,
            mode: modeToTransitMode(path.mode),
            language,
            waypoints: activeWaypoints,
            directions: currentDirections,
          })
        }
        className="w-full h-14 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
      >
        <Send className="w-4 h-4" />
        <span>Send as Signed Route Card</span>
      </button>

      <FooterLine />
    </div>
  );
}
