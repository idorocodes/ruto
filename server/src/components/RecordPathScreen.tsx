import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bike,
  Bus,
  Check,
  Footprints,
  Loader2,
  LocateFixed,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { normalizeApiError, savePath } from '../api';
import {
  ApiErrorShape,
  LiveUserPosition,
  PathVisibility,
  SharedPathMode,
  SharedPathPoint,
  Waypoint,
} from '../types';
import { RouteMap } from './RouteMap';
import { FooterLine } from './TopBarAndNav';
import {
  computePolylineMeters,
  formatDistanceLabel,
  haversineMeters,
  modeToTransitMode,
  sharedPointsToWaypoints,
  simplifyTrackDouglasPeucker,
} from '../utils/geo';
import { DEFAULT_CAMPUS_CENTER } from '../utils/seedData';

interface RecordPathScreenProps {
  currentUserHandle: string;
  onSavedPathOpen: (pathId: string) => void;
  onSendRecordedAsCard: (params: {
    title: string;
    mode: 'Walk' | 'Keke' | 'Okada';
    waypoints: Waypoint[];
  }) => void;
}

const SAMPLE_INTERVAL_MS = 5000;
const SAMPLE_DISTANCE_METERS = 5;
const MAX_ALLOWED_ACCURACY_METERS = 50;

export function RecordPathScreen({
  currentUserHandle,
  onSavedPathOpen,
  onSendRecordedAsCard,
}: RecordPathScreenProps) {
  const [buildMethod, setBuildMethod] = useState<'walk' | 'tap'>('walk');
  const [isRecording, setIsRecording] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const [rawPoints, setRawPoints] = useState<SharedPathPoint[]>([]);
  const [reviewPoints, setReviewPoints] = useState<SharedPathPoint[]>([]);
  const [rawSampleCount, setRawSampleCount] = useState(0);

  const [livePos, setLivePos] = useState<LiveUserPosition | null>(null);
  const [skippedInaccurateCount, setSkippedInaccurateCount] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  // Add landmark modal while walking or editing tapped point
  const [landmarkModalOpen, setLandmarkModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [landmarkLabel, setLandmarkLabel] = useState('');
  const [landmarkNote, setLandmarkNote] = useState('');

  // Review metadata form
  const [title, setTitle] = useState('');
  const [startName, setStartName] = useState('');
  const [endName, setEndName] = useState('');
  const [mode, setMode] = useState<SharedPathMode>('walk');
  const [visibility, setVisibility] = useState<PathVisibility>('card_only');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiErrorShape | null>(null);
  const [savedPathId, setSavedPathId] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number>(0);
  const lastSampleCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const clearWatcher = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearWatcher();
  }, [clearWatcher]);

  const handleStartWalkingRecord = () => {
    clearWatcher();
    setIsRecording(true);
    setIsReviewing(false);
    setSavedPathId(null);
    setSaveError(null);
    setSkippedInaccurateCount(0);
    setPermissionDenied(false);
    setGeoMessage(null);
    lastSampleTimeRef.current = 0;
    lastSampleCoordsRef.current = null;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionDenied(true);
      setGeoMessage(
        'Location services are unavailable in this browser. Tap anywhere on the map to plot your walk points instead.'
      );
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy || 15);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));

        setLivePos({ lat, lng, accuracy: acc, isManual: false });

        // Rule: ignore any GPS reading with accuracy worse than 50 m
        if (acc > MAX_ALLOWED_ACCURACY_METERS) {
          setSkippedInaccurateCount((c) => c + 1);
          return;
        }

        const now = Date.now();
        const prev = lastSampleCoordsRef.current;
        const elapsed = now - lastSampleTimeRef.current;
        const movedMeters = prev
          ? haversineMeters(prev.lat, prev.lng, lat, lng)
          : Infinity;

        // Sample about every 5 seconds OR 5 metres
        if (!prev || elapsed >= SAMPLE_INTERVAL_MS || movedMeters >= SAMPLE_DISTANCE_METERS) {
          lastSampleTimeRef.current = now;
          lastSampleCoordsRef.current = { lat, lng };
          setRawPoints((pts) => [
            ...pts,
            {
              lat,
              lng,
              accuracy: acc,
              label: pts.length === 0 ? 'Start Point' : '',
              note: '',
            },
          ]);
        }
      },
      () => {
        setPermissionDenied(true);
        setGeoMessage(
          'Location permission was denied or unavailable. You can tap directly on the map above to step along your path.'
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 9000,
      }
    );
  };

  const enterReviewStage = (sourcePoints: SharedPathPoint[]) => {
    clearWatcher();
    setIsRecording(false);
    if (sourcePoints.length < 2) {
      setGeoMessage('Record or tap at least 2 points before finishing your path.');
      return;
    }

    setRawSampleCount(sourcePoints.length);
    // Simplify track to at most 30 points using Douglas-Peucker
    const simplified = simplifyTrackDouglasPeucker(sourcePoints, 30);

    // Ensure first & last have friendly labels if blank
    const hydrated = simplified.map((pt, idx) => {
      if (idx === 0 && !pt.label) return { ...pt, label: 'Start Gate' };
      if (idx === simplified.length - 1 && !pt.label)
        return { ...pt, label: 'Destination Entrance' };
      return pt;
    });

    setReviewPoints(hydrated);
    const defaultStart = hydrated[0]?.label || 'Start Gate';
    const defaultEnd =
      hydrated[hydrated.length - 1]?.label || 'Destination Entrance';
    setStartName((prev) => prev || defaultStart);
    setEndName((prev) => prev || defaultEnd);
    setTitle((prev) => prev || `${defaultStart} → ${defaultEnd}`);
    setIsReviewing(true);
  };

  const handleMapTap = (lat: number, lng: number) => {
    if (isReviewing) return;

    // Allow map taps in Tap mode OR while Recording if permission was denied / indoor testing
    if (buildMethod === 'tap' || (isRecording && permissionDenied)) {
      const targetList = rawPoints;
      const idx = targetList.length;
      const newPt: SharedPathPoint = {
        lat,
        lng,
        accuracy: 6,
        label: idx === 0 ? 'Start Point' : `Point ${idx + 1}`,
        note: '',
      };
      setLivePos({ lat, lng, accuracy: 6, isManual: true });
      setRawPoints((prev) => [...prev, newPt]);
    }
  };

  const handleOpenAddLandmarkHere = () => {
    setEditingIndex(null);
    setLandmarkLabel('');
    setLandmarkNote('');
    setLandmarkModalOpen(true);
  };

  const handleSaveLandmarkModal = (e: React.FormEvent) => {
    e.preventDefault();
    const activeSet = isReviewing ? reviewPoints : rawPoints;
    const setFn = isReviewing ? setReviewPoints : setRawPoints;

    if (editingIndex !== null && activeSet[editingIndex]) {
      setFn((prev) =>
        prev.map((p, i) =>
          i === editingIndex
            ? { ...p, label: landmarkLabel.trim(), note: landmarkNote.trim() }
            : p
        )
      );
    } else {
      // Drop named point at current live position (or last recorded point / campus center)
      const anchor =
        livePos ||
        activeSet[activeSet.length - 1] || {
          lat: DEFAULT_CAMPUS_CENTER[0],
          lng: DEFAULT_CAMPUS_CENTER[1],
          accuracy: 8,
        };
      const dropped: SharedPathPoint = {
        lat: Number(anchor.lat.toFixed(6)),
        lng: Number(anchor.lng.toFixed(6)),
        accuracy: Math.min(50, Math.round(anchor.accuracy || 8)),
        label: landmarkLabel.trim() || 'Campus Landmark',
        note: landmarkNote.trim(),
      };
      setFn((prev) => [...prev, dropped]);
    }
    setLandmarkModalOpen(false);
  };

  const handleConfirmSavePath = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (reviewPoints.length < 2) return;

    setSaving(true);
    setSaveError(null);

    try {
      // Sync start/end labels onto first & last points
      const syncedPoints = reviewPoints.map((pt, idx) => {
        if (idx === 0 && startName.trim()) {
          return { ...pt, label: pt.label || startName.trim() };
        }
        if (idx === reviewPoints.length - 1 && endName.trim()) {
          return { ...pt, label: pt.label || endName.trim() };
        }
        return pt;
      });

      const res = await savePath({
        title: title.trim() || `${startName || 'Start'} → ${endName || 'End'}`,
        startName: startName.trim() || 'Start',
        endName: endName.trim() || 'Destination',
        mode,
        visibility,
        points: syncedPoints,
        recordedBy: currentUserHandle,
      });

      setSavedPathId(res.id);
    } catch (err: unknown) {
      setSaveError(normalizeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const displayedPoints = isReviewing ? reviewPoints : rawPoints;
  const mapWaypoints = sharedPointsToWaypoints(displayedPoints);
  const currentMeters = computePolylineMeters(displayedPoints);

  if (savedPathId) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-24 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#3DDC97]/20 border border-[#3DDC97] text-[#3DDC97] flex items-center justify-center mx-auto">
          <Check className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display font-bold text-2xl text-[#F6F4EE]">
            Path Saved ({savedPathId})
          </h1>
          <p className="text-sm text-[#B9C2CC]">
            {visibility === 'public'
              ? 'Published to the shared campus route library so other students can search and confirm it.'
              : 'Saved privately as Card Only — ready to send directly to a coursemate.'}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onSavedPathOpen(savedPathId)}
            className="w-full h-13 rounded-2xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm cursor-pointer"
          >
            Open Path &amp; Directions →
          </button>

          <button
            type="button"
            onClick={() =>
              onSendRecordedAsCard({
                title: title.trim() || 'Recorded Path',
                mode: modeToTransitMode(mode),
                waypoints: sharedPointsToWaypoints(reviewPoints),
              })
            }
            className="w-full h-12 rounded-2xl bg-[#1A222B] border border-[#2A3541] text-[#F6F4EE] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4 text-[#3DDC97]" />
            <span>Send as Route Card</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-6 lg:px-4 lg:pt-4">
        {/* Map Column */}
        <div className="lg:col-span-7">
          <div className="lg:rounded-2xl lg:overflow-hidden lg:border lg:border-[#2A3541]">
            <RouteMap
              waypoints={mapWaypoints}
              interactive={!isReviewing}
              theme="dark"
              liveUserPos={livePos}
              bannerText={
                isReviewing
                  ? `Simplified review: ${reviewPoints.length} points (max 30)`
                  : buildMethod === 'walk'
                  ? isRecording
                    ? permissionDenied
                      ? 'GPS unavailable — tap map to drop walk points'
                      : 'Recording walk (every 5s / 5m, ≤50m accuracy)'
                    : 'Press Start below to record your walk'
                  : 'Tap map to place path points · Tap pin to label'
              }
              heightClass="h-[330px] sm:h-[390px] lg:h-[600px]"
              onMapTap={handleMapTap}
              onSelectWaypoint={(wpId) => {
                const idx = Number(wpId.replace('path-pt-', ''));
                const list = isReviewing ? reviewPoints : rawPoints;
                if (!Number.isNaN(idx) && list[idx]) {
                  setEditingIndex(idx);
                  setLandmarkLabel(list[idx].label || '');
                  setLandmarkNote(list[idx].note || '');
                  setLandmarkModalOpen(true);
                }
              }}
              onResetWaypoints={
                !isReviewing
                  ? () => {
                      setRawPoints([]);
                      setGeoMessage(null);
                    }
                  : undefined
              }
            />
          </div>
        </div>

        {/* Control & Review Sheet */}
        <div className="lg:col-span-5 -mt-3 lg:mt-0 relative z-10 rounded-t-3xl lg:rounded-2xl bg-[#0f141a] lg:bg-[#171c22] border-t lg:border border-[#2A3541] px-4 pt-4 pb-6 space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="font-display font-bold text-xl sm:text-2xl text-[#F6F4EE]">
                {isReviewing ? 'Review & Save Path' : 'Record a Path'}
              </h1>
              <p className="text-xs text-[#B9C2CC] mt-0.5 tabular-nums">
                {displayedPoints.length} point
                {displayedPoints.length === 1 ? '' : 's'} ·{' '}
                {formatDistanceLabel(currentMeters)}
              </p>
            </div>

            {livePos && !isReviewing && (
              <span
                className={`px-2.5 py-1 rounded-full font-mono text-xs border tabular-nums ${
                  livePos.accuracy > 50
                    ? 'bg-[#FFB368]/15 border-[#FFB368] text-[#FFB368]'
                    : 'bg-[#1A222B] border-[#2A3541] text-[#3DDC97]'
                }`}
              >
                ±{Math.round(livePos.accuracy)} m
              </span>
            )}
          </div>

          {!isReviewing ? (
            <>
              {/* Mode Switcher: (a) Record by walking vs (b) Tap on map */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1A222B] border border-[#2A3541]">
                <button
                  type="button"
                  onClick={() => {
                    clearWatcher();
                    setIsRecording(false);
                    setBuildMethod('walk');
                  }}
                  className={`h-10 rounded-xl font-display font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    buildMethod === 'walk'
                      ? 'bg-[#3DDC97] text-[#002112]'
                      : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
                  }`}
                >
                  <Footprints className="w-4 h-4" />
                  <span>Record by walking</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearWatcher();
                    setIsRecording(false);
                    setBuildMethod('tap');
                  }}
                  className={`h-10 rounded-xl font-display font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    buildMethod === 'tap'
                      ? 'bg-[#3DDC97] text-[#002112]'
                      : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Tap on map</span>
                </button>
              </div>

              {geoMessage && (
                <div className="p-3 rounded-xl bg-[#1A222B] border border-[#3B82F6]/50 flex items-start gap-2.5 text-xs text-[#dee3eb]">
                  <LocateFixed className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
                  <span>{geoMessage}</span>
                </div>
              )}

              {skippedInaccurateCount > 0 && (
                <div className="p-2.5 rounded-xl bg-[#FFB368]/15 border border-[#FFB368]/50 flex items-center gap-2 text-xs text-[#FFD8B6]">
                  <AlertTriangle className="w-4 h-4 text-[#FFB368] shrink-0" />
                  <span>
                    Ignored {skippedInaccurateCount} noisy GPS reading
                    {skippedInaccurateCount === 1 ? '' : 's'} worse than 50 m.
                  </span>
                </div>
              )}

              {buildMethod === 'walk' ? (
                <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
                  <p className="text-xs text-[#B9C2CC] leading-relaxed">
                    Samples your high-accuracy GPS every <strong>5 seconds</strong>{' '}
                    or <strong>5 metres</strong> and automatically discards readings
                    worse than <strong>50 m</strong>. On Stop, Ruto simplifies the
                    track to at most 30 points.
                  </p>

                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={handleStartWalkingRecord}
                      className="w-full h-13 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Walking Recording</span>
                    </button>
                  ) : (
                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={handleOpenAddLandmarkHere}
                        className="w-full h-12 rounded-xl bg-[#11161C] hover:bg-[#252a31] border border-[#3DDC97] text-[#3DDC97] font-display font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add landmark here</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => enterReviewStage(rawPoints)}
                        className="w-full h-13 rounded-2xl bg-[#FF5A5F] hover:bg-[#ff7478] text-[#0f141a] font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span>Stop &amp; Review Track</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3">
                  <p className="text-xs text-[#B9C2CC]">
                    Tap directly on the campus OpenStreetMap to plot points in order.
                    Tap any point below or on the map to add a landmark label and note.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddLandmarkHere}
                    className="w-full h-11 rounded-xl bg-[#11161C] border border-[#2A3541] hover:border-[#3DDC97] text-[#3DDC97] font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add landmark at map center</span>
                  </button>
                </div>
              )}

              {/* Recorded Points List */}
              {rawPoints.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs text-[#859489]">
                    <span>CAPTURED POINTS ({rawPoints.length})</span>
                    <span>Tap to edit label/note</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {rawPoints.map((pt, idx) => (
                      <div
                        key={`${pt.lat}-${pt.lng}-${idx}`}
                        onClick={() => {
                          setEditingIndex(idx);
                          setLandmarkLabel(pt.label || '');
                          setLandmarkNote(pt.note || '');
                          setLandmarkModalOpen(true);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingIndex(idx);
                            setLandmarkLabel(pt.label || '');
                            setLandmarkNote(pt.note || '');
                            setLandmarkModalOpen(true);
                          }
                        }}
                        className="p-2.5 rounded-xl bg-[#1A222B] border border-[#2A3541] hover:border-[#3DDC97]/60 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#F6F4EE] truncate">
                            {idx + 1}. {pt.label || 'Track point'}
                          </div>
                          {pt.note && (
                            <div className="text-[11px] text-[#B9C2CC] truncate">
                              {pt.note}
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-[#859489] shrink-0 tabular-nums">
                          ±{pt.accuracy}m
                        </span>
                      </div>
                    ))}
                  </div>

                  {!isRecording && rawPoints.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => enterReviewStage(rawPoints)}
                      className="w-full h-13 mt-2 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-base cursor-pointer"
                    >
                      Review &amp; Save Path →
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* REVIEW & SAVE FORM */
            <form onSubmit={handleConfirmSavePath} className="space-y-4">
              <div className="p-3 rounded-xl bg-[#3DDC97]/12 border border-[#3DDC97]/40 font-mono text-xs text-[#3DDC97] flex items-center justify-between">
                <span>
                  Simplified {rawSampleCount} raw pts → {reviewPoints.length} pts
                  (Douglas-Peucker ≤30)
                </span>
                <button
                  type="button"
                  onClick={() => setIsReviewing(false)}
                  className="underline text-[#F6F4EE] cursor-pointer"
                >
                  Edit track
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                    Path Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Main Gate → Science Complex"
                    className="w-full h-11 px-3 rounded-xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                      Start Name
                    </label>
                    <input
                      type="text"
                      required
                      value={startName}
                      onChange={(e) => setStartName(e.target.value)}
                      placeholder="Main Gate"
                      className="w-full h-11 px-3 rounded-xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                      End Name
                    </label>
                    <input
                      type="text"
                      required
                      value={endName}
                      onChange={(e) => setEndName(e.target.value)}
                      placeholder="Science Complex"
                      className="w-full h-11 px-3 rounded-xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                    />
                  </div>
                </div>

                {/* Mode: walk / keke / okada */}
                <div>
                  <label className="block font-mono text-xs text-[#B9C2CC] mb-1.5">
                    Transit Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'walk', label: 'Walk', icon: Footprints },
                        { id: 'keke', label: 'Keke', icon: Bus },
                        { id: 'okada', label: 'Okada', icon: Bike },
                      ] as const
                    ).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMode(id)}
                        className={`h-10 rounded-xl border font-display font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                          mode === id
                            ? 'bg-[#3DDC97] border-[#3DDC97] text-[#002112]'
                            : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibility: Card only (default) vs Share with everyone + Public Privacy Warning */}
                <div className="space-y-2">
                  <label className="block font-mono text-xs text-[#B9C2CC]">
                    Visibility
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('card_only')}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        visibility === 'card_only'
                          ? 'bg-[#3DDC97]/15 border-[#3DDC97] text-[#F6F4EE]'
                          : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC]'
                      }`}
                    >
                      <div className="font-display font-bold text-xs">
                        Card only (Default)
                      </div>
                      <div className="text-[11px] text-[#859489] mt-0.5">
                        Private until sent as a card
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        visibility === 'public'
                          ? 'bg-[#3DDC97]/15 border-[#3DDC97] text-[#F6F4EE]'
                          : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC]'
                      }`}
                    >
                      <div className="font-display font-bold text-xs">
                        Share with everyone
                      </div>
                      <div className="text-[11px] text-[#859489] mt-0.5">
                        Listed in Campus Library
                      </div>
                    </button>
                  </div>

                  {/* Mandatory Public Places Safety Warning */}
                  <div className="p-3 rounded-xl bg-[#FFB368]/12 border border-[#FFB368]/45 flex items-start gap-2 text-xs text-[#FFD8B6]">
                    <ShieldAlert className="w-4 h-4 text-[#FFB368] shrink-0 mt-0.5" />
                    <span>
                      <strong>Share with everyone safety rule:</strong> Only share
                      public places like gates, faculties and hostels&apos; main
                      entrances — never a private room or home.
                    </span>
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-2">
                  <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
                    <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
                    <span>{saveError.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleConfirmSavePath()}
                    className="px-2.5 py-1 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:opacity-50 text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving Path...</span>
                  </>
                ) : (
                  <span>Save Path</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Add / Edit Landmark Modal */}
      {landmarkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveLandmarkModal}
            className="w-full sm:max-w-md bg-[#1A222B] border-t sm:border border-[#2A3541] rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#F6F4EE]">
                {editingIndex !== null
                  ? `Edit Point #${editingIndex + 1}`
                  : 'Add Landmark Here'}
              </h3>
              <button
                type="button"
                onClick={() => setLandmarkModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#11161C] text-[#B9C2CC] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                  Landmark Label
                </label>
                <input
                  type="text"
                  required
                  value={landmarkLabel}
                  onChange={(e) => setLandmarkLabel(e.target.value)}
                  placeholder="e.g. Yellow Transformer / Food Canopy"
                  className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                  Short Note
                </label>
                <input
                  type="text"
                  value={landmarkNote}
                  onChange={(e) => setLandmarkNote(e.target.value)}
                  placeholder="e.g. Turn left right after the kiosk"
                  className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {editingIndex !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const setFn = isReviewing ? setReviewPoints : setRawPoints;
                    setFn((prev) => prev.filter((_, i) => i !== editingIndex));
                    setLandmarkModalOpen(false);
                  }}
                  className="h-11 px-3.5 rounded-xl bg-[#11161C] border border-[#FF5A5F]/60 text-[#FF5A5F] font-mono text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}

              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm cursor-pointer"
              >
                Save Landmark
              </button>
            </div>
          </form>
        </div>
      )}

      <FooterLine />
    </div>
  );
}
