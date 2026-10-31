import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Check,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Footprints,
  Loader2,
  Lock,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { normalizeApiError, savePath, sendCard } from '../api';
import {
  ApiErrorShape,
  RutoLanguage,
  TransitMode,
  UserProfile,
  Waypoint,
} from '../types';
import { useLiveNavigation } from '../hooks/useLiveNavigation';
import { LiveNavigationBar } from './LiveNavigationBar';
import { RouteMap } from './RouteMap';
import { StudentAvatar, WaypointSpotVisual } from './Avatars';
import { FooterLine } from './TopBarAndNav';
import {
  compassDirectionLabel,
  computeRouteGeometry,
  estimateDurationMinutes,
  formatDistanceLabel,
  haversineMeters,
  transitModeToSharedMode,
} from '../utils/geo';
import {
  computeRouteSha256,
  formatShortHash,
  generateRandomSalt,
} from '../utils/crypto';
import { validateHandle } from '../utils/seedData';
import {
  isSpeechSynthesisSupported,
  speakRouteText,
  stopSpeaking,
} from '../utils/speech';

interface DirectionsScreenProps {
  routeName: string;
  mode: TransitMode;
  language: RutoLanguage;
  waypoints: Waypoint[];
  directions: string[];
  summaryNote: string;
  isLoadingLanguage: boolean;
  languageError: string | null;
  onSwitchLanguage: (lang: RutoLanguage, forceRegenerate?: boolean) => void;
  onSendAsCard: () => void;
  onEditRoute: () => void;
}

export function DirectionsScreen({
  routeName,
  mode,
  language,
  waypoints,
  directions,
  isLoadingLanguage,
  languageError,
  onSwitchLanguage,
  onSendAsCard,
  onEditRoute,
}: DirectionsScreenProps) {
  const geo = computeRouteGeometry(waypoints);
  const estMinutes = estimateDurationMinutes(geo.totalMeters, mode);
  const compass = compassDirectionLabel(waypoints);

  const nav = useLiveNavigation(waypoints);
  const [speakingAll, setSpeakingAll] = useState(false);

  useEffect(() => {
    stopSpeaking();
    setSpeakingAll(false);
    return () => {
      stopSpeaking();
    };
  }, [language, waypoints]);

  const handleToggleSpeakRoute = () => {
    if (speakingAll) {
      stopSpeaking();
      setSpeakingAll(false);
      return;
    }
    const script = waypoints
      .map((wp, idx) => {
        const sentence =
          directions[idx] || `${wp.name}${wp.note ? `. ${wp.note}` : ''}.`;
        return `Step ${idx + 1}: ${sentence}`;
      })
      .join(' ');
    speakRouteText(script, language, {
      onStart: () => setSpeakingAll(true),
      onEnd: () => setSpeakingAll(false),
      onError: () => setSpeakingAll(false),
    });
  };

  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-6 lg:px-4 lg:pt-4">
        {/* Map & Metrics Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative lg:rounded-2xl overflow-hidden lg:border lg:border-[#2A3541]">
            <RouteMap
              waypoints={waypoints}
              interactive={false}
              theme="mint"
              heightClass="h-[240px] sm:h-[280px] lg:h-[360px]"
              liveUserPos={nav.userPos}
              activeStepIndex={nav.isNavigating ? nav.activeStepIndex : null}
              arrived={nav.arrived}
              allowManualPositionTap={nav.isNavigating && nav.permissionFallback}
              onManualPositionTap={nav.setManualUserPosition}
            />

            {!nav.permissionFallback && (
              <div className="pointer-events-none absolute top-3 left-3 z-[400] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#11161C]/90 border border-[#2A3541] font-mono text-[11px] text-[#F6F4EE]">
                <span className="w-2 h-2 rounded-full bg-[#3DDC97]" />
                <span>LIVE PATH PLOTTED</span>
              </div>
            )}

            <div className="pointer-events-none absolute top-3 right-3 z-[400] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#11161C]/90 border border-[#2A3541] font-mono text-[11px] text-[#F6F4EE]">
              <Navigation className="w-3 h-3 text-[#3DDC97]" />
              <span>{compass}</span>
            </div>

            {firstWp && lastWp && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-[400] inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#11161C]/92 border border-[#2A3541] text-xs font-medium text-[#F6F4EE] max-w-[80%]">
                <span className="w-5 h-5 rounded-full bg-[#3DDC97] text-[#002112] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="truncate">{firstWp.name}</span>
                <span className="text-[#859489]">→</span>
                <span className="w-5 h-5 rounded-full bg-[#FFB368] text-[#2d1600] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  {waypoints.length}
                </span>
                <span className="truncate">{lastWp.name}</span>
              </div>
            )}
          </div>

          {/* Distance / Pace / Turns Bar */}
          <div className="mx-4 lg:mx-0 p-3.5 rounded-2xl bg-[#1A222B] border border-[#2A3541] grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#3DDC97]/15 text-[#3DDC97] flex items-center justify-center shrink-0">
                <Footprints className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-bold text-base text-[#F6F4EE] tabular-nums">
                  {geo.totalKmText}
                </div>
                <div className="text-[11px] text-[#859489]">Distance</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-x border-[#2A3541] pl-2.5">
              <div className="w-9 h-9 rounded-full bg-[#FFB368]/15 text-[#FFB368] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-bold text-base text-[#F6F4EE] tabular-nums">
                  {estMinutes} mins
                </div>
                <div className="text-[11px] text-[#859489]">{mode} Pace</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pl-1">
              <div className="w-9 h-9 rounded-full bg-[#252a31] text-[#B9C2CC] flex items-center justify-center shrink-0">
                <CornerUpRight className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-bold text-base text-[#F6F4EE] tabular-nums">
                  {geo.turnsCount} turn{geo.turnsCount === 1 ? '' : 's'}
                </div>
                <div className="text-[11px] text-[#859489]">Computed</div>
              </div>
            </div>
          </div>

          {/* Visual Waypoints Along Path */}
          <div className="px-4 lg:px-0 space-y-2.5">
            <div className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]">
              Visual Waypoints Along Path
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
              {waypoints.map((wp, idx) => (
                <div
                  key={wp.id}
                  className="rounded-xl overflow-hidden bg-[#1A222B] border border-[#2A3541]"
                >
                  <WaypointSpotVisual
                    name={wp.name}
                    index={idx}
                    photoDataUrl={wp.photoDataUrl}
                  />
                  <div className="p-2.5">
                    <div className="font-display font-semibold text-xs text-[#F6F4EE] truncate">
                      {wp.name}
                    </div>
                    <div className="font-mono text-[10px] text-[#859489] mt-0.5 tabular-nums">
                      WP {idx + 1} ·{' '}
                      {formatDistanceLabel(
                        geo.steps[idx]?.distanceMetersToNext || 0
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right / Main Gemma Route Assistant + Live Navigation Column */}
        <div className="lg:col-span-7 px-4 lg:px-0 mt-4 lg:mt-0 space-y-4">
          <div>
            <h1 className="font-display font-bold text-xl sm:text-2xl text-[#F6F4EE]">
              {routeName}
            </h1>
            <p className="text-xs text-[#B9C2CC] mt-0.5">
              Step-by-step directions written by Gemma 4 strictly from your placed pins
              and code-computed geometry.
            </p>
          </div>

          {/* Live Location & Haversine Distance Navigation HUD + Hands-Free Audio */}
          <LiveNavigationBar
            nav={nav}
            waypoints={waypoints}
            directions={directions}
            language={language}
          />

          {/* Language Switcher Pill Bar */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-full bg-[#1A222B] border border-[#2A3541]">
            {(
              [
                { id: 'English', label: 'English' },
                { id: 'Pidgin', label: 'Pidgin' },
                { id: 'Yoruba', label: 'Yorùbá' },
              ] as const
            ).map((item) => {
              const active = language === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isLoadingLanguage}
                  onClick={() => onSwitchLanguage(item.id)}
                  className={`h-10 rounded-full font-display font-semibold text-sm transition-all cursor-pointer ${
                    active
                      ? 'bg-[#3DDC97] text-[#002112]'
                      : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {languageError && (
            <div className="p-3.5 rounded-2xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
                <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
                <span>{languageError}</span>
              </div>
              <button
                type="button"
                onClick={() => onSwitchLanguage(language, true)}
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* Gemma Route Assistant Container with Current Step Highlight */}
          <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3DDC97]/15 border border-[#3DDC97]/30 font-mono text-xs text-[#3DDC97]">
                <Sparkles className="w-3.5 h-3.5" />
                Gemma 4 Route Assistant
              </span>

              <div className="flex items-center gap-3">
                {isSpeechSynthesisSupported() && !isLoadingLanguage && (
                  <button
                    type="button"
                    onClick={handleToggleSpeakRoute}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold transition-colors cursor-pointer ${
                      speakingAll
                        ? 'bg-[#3DDC97] border-[#3DDC97] text-[#002112]'
                        : 'bg-[#11161C] border-[#2A3541] text-[#3DDC97] hover:border-[#3DDC97]'
                    }`}
                  >
                    {speakingAll ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Listen</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isLoadingLanguage}
                  onClick={() => onSwitchLanguage(language, true)}
                  className="inline-flex items-center gap-1 font-mono text-xs text-[#B9C2CC] hover:text-[#3DDC97] cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingLanguage ? 'animate-spin' : ''}`}
                  />
                  <span>Rewrite</span>
                </button>
              </div>
            </div>

            {isLoadingLanguage ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2.5 text-center">
                <Loader2 className="w-7 h-7 text-[#3DDC97] animate-spin" />
                <p className="font-display font-semibold text-sm text-[#F6F4EE]">
                  Gemma 4 is writing {language} directions...
                </p>
                <p className="text-xs text-[#859489]">
                  Using only your {waypoints.length} placed waypoints and computed distances
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {waypoints.map((wp, idx) => {
                  const stepGeo = geo.steps[idx];
                  const dirSentence =
                    directions[idx] ||
                    `${wp.name}${wp.note ? ` — ${wp.note}` : ''}.`;
                  const isLast = idx === waypoints.length - 1;
                  const turn = stepGeo?.computedTurn || wp.turn;

                  const isStepDone =
                    nav.isNavigating && (nav.arrived || idx < nav.activeStepIndex);
                  const isCurrentStep =
                    nav.isNavigating && !nav.arrived && idx === nav.activeStepIndex;

                  const liveDistToThis =
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
                      className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                        isCurrentStep
                          ? 'bg-[#3DDC97]/12 border-[#3DDC97] ring-1 ring-[#3DDC97]/40'
                          : isStepDone
                          ? 'bg-[#11161C]/60 border-[#2A3541] opacity-75'
                          : 'bg-[#11161C] border-[#2A3541]'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                          isStepDone
                            ? 'bg-[#3DDC97] text-[#002112]'
                            : isCurrentStep
                            ? 'bg-[#3DDC97] text-[#002112]'
                            : 'bg-[#3DDC97]/15 text-[#3DDC97]'
                        }`}
                      >
                        {isStepDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-[#3DDC97] font-semibold">
                            {isCurrentStep
                              ? `CURRENT STEP${
                                  liveDistToThis !== null
                                    ? ` · ${liveDistToThis} m away`
                                    : ''
                                }`
                              : isStepDone
                              ? 'STEP DONE'
                              : `STEP ${idx + 1}`}
                          </span>
                        </div>
                        <p className="font-display font-semibold text-[15px] leading-snug text-[#F6F4EE]">
                          {dirSentence}
                        </p>
                        {wp.note && (
                          <p className="text-xs text-[#B9C2CC]">
                            {wp.name} · {wp.note}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 font-mono text-xs text-[#859489] tabular-nums pt-0.5">
                          <TurnIcon className="w-3.5 h-3.5 text-[#3DDC97]" />
                          <span>
                            {isLast
                              ? 'Destination reached'
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

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={onSendAsCard}
              className="w-full h-14 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(61,220,151,0.2)] transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send as card</span>
            </button>

            <button
              type="button"
              onClick={onEditRoute}
              className="w-full h-12 rounded-2xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] text-[#F6F4EE] font-display font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#B9C2CC]" />
              <span>Edit route</span>
            </button>
          </div>
        </div>
      </div>

      <FooterLine />
    </div>
  );
}

interface SendCardScreenProps {
  currentUser: UserProfile;
  users: UserProfile[];
  initialRecipient?: string;
  routeName: string;
  mode: TransitMode;
  language: RutoLanguage;
  waypoints: Waypoint[];
  directions: string[];
  directionsByLang?: Partial<Record<RutoLanguage, string[]>>;
  summaryNote: string;
  onCardSentSuccess: (sent: {
    id: string;
    recipient: string;
    hash: string;
    txSignature: string;
  }) => void;
  onSwitchUserAndOpenInbox: (handle: string) => void;
  onCancel: () => void;
}

export function SendCardScreen({
  currentUser,
  users,
  initialRecipient,
  routeName,
  mode,
  language,
  waypoints,
  directions,
  directionsByLang,
  summaryNote,
  onCardSentSuccess,
  onSwitchUserAndOpenInbox,
  onCancel,
}: SendCardScreenProps) {
  const otherMates = users.filter((u) => u.handle !== currentUser.handle);
  const defaultTarget =
    initialRecipient || otherMates[0]?.handle || 'mary_hostel';

  const [recipientInput, setRecipientInput] = useState(defaultTarget);
  const [personalNote, setPersonalNote] = useState(
    'I dey wait for you for gate, tap this route make you no miss road!'
  );
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [savedLibraryPathId, setSavedLibraryPathId] = useState<string | null>(
    null
  );
  const [previewSalt] = useState(() => generateRandomSalt());
  const [previewCardId] = useState(
    () => `RT-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [previewHash, setPreviewHash] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ApiErrorShape | null>(null);
  const [sentResult, setSentResult] = useState<{
    id: string;
    recipient: string;
    hash: string;
    txSignature: string;
  } | null>(null);

  const validation = validateHandle(recipientInput);
  const geo = computeRouteGeometry(waypoints);
  const estMinutes = estimateDurationMinutes(geo.totalMeters, mode);

  useEffect(() => {
    let cancelled = false;
    computeRouteSha256({
      id: previewCardId,
      from: currentUser.handle,
      to: validation.normalized || 'recipient',
      salt: previewSalt,
      language,
      route: {
        title: routeName,
        mode,
        personalNote,
        summaryNote,
        waypoints,
      },
      directions,
    }).then(({ hash }) => {
      if (!cancelled) setPreviewHash(hash);
    });
    return () => {
      cancelled = true;
    };
  }, [
    previewCardId,
    currentUser.handle,
    validation.normalized,
    previewSalt,
    routeName,
    mode,
    language,
    personalNote,
    summaryNote,
    waypoints,
    directions,
  ]);

  const handleConfirmSend = async () => {
    if (!validation.valid) return;
    setSending(true);
    setSendError(null);

    try {
      const activeDirs =
        directions.length > 0
          ? directions
          : waypoints.map((w) => `${w.name}${w.note ? ` — ${w.note}` : ''}.`);

      const res = await sendCard({
        from: currentUser.handle,
        to: validation.normalized,
        language,
        directions: activeDirs,
        route: {
          title: routeName.trim() || 'Campus Route',
          mode,
          personalNote: personalNote.trim(),
          summaryNote: summaryNote || activeDirs[0] || routeName,
          waypoints,
          directionsByLang,
        },
      });

      if (saveToLibrary && waypoints.length >= 2) {
        const createdPath = await savePath({
          title: routeName.trim() || 'Campus Route',
          startName: waypoints[0]?.name || 'Start',
          endName: waypoints[waypoints.length - 1]?.name || 'Destination',
          mode: transitModeToSharedMode(mode),
          visibility: 'public',
          points: waypoints.map((wp) => ({
            lat: wp.lat,
            lng: wp.lng,
            accuracy: wp.accuracy || 12,
            label: wp.name,
            note: wp.note || '',
          })),
          recordedBy: currentUser.handle,
        });
        setSavedLibraryPathId(createdPath.id);
      }

      const outcome = {
        id: res.id,
        recipient: validation.normalized,
        hash: res.hash,
        txSignature: res.txSignature,
      };
      setSentResult(outcome);
      onCardSentSuccess(outcome);
    } catch (err: unknown) {
      setSendError(normalizeApiError(err));
    } finally {
      setSending(false);
    }
  };

  if (sentResult) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-24 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#3DDC97]/20 border border-[#3DDC97] text-[#3DDC97] flex items-center justify-center mx-auto">
          <Check className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display font-bold text-2xl text-[#F6F4EE]">
            Route Card Dispatched!
          </h1>
          <p className="text-sm text-[#B9C2CC]">
            Card <span className="font-mono text-[#F6F4EE]">#{sentResult.id}</span> signed with SHA-256 (
            <span className="font-mono text-[#3DDC97]">
              {formatShortHash(sentResult.hash)}
            </span>
            ) and sent to{' '}
            <span className="font-mono text-[#F6F4EE]">@{sentResult.recipient}</span>.
          </p>
          {savedLibraryPathId && (
            <p className="text-xs font-mono text-[#3DDC97]">
              ✓ Also published to Shared Campus Library ({savedLibraryPathId})
            </p>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] text-left space-y-2 font-mono text-xs">
          <div className="text-[#859489]">TX SIGNATURE</div>
          <div className="text-[#3DDC97] break-all">{sentResult.txSignature}</div>
          <p className="text-[#dee3eb] font-sans text-xs leading-relaxed pt-1">
            Switch active handle to <strong>@{sentResult.recipient}</strong> right now
            to verify the card in Inbox or test live navigation.
          </p>
          <button
            type="button"
            onClick={() => onSwitchUserAndOpenInbox(sentResult.recipient)}
            className="w-full h-12 mt-2 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm cursor-pointer"
          >
            Switch to @{sentResult.recipient} &amp; View Inbox →
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-mono text-[#859489] hover:text-[#F6F4EE] cursor-pointer"
        >
          Stay as @{currentUser.handle}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display font-bold text-2xl text-[#F6F4EE]">
            Send Route Card
          </h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#3DDC97]/15 border border-[#3DDC97]/40 font-mono text-[11px] font-semibold text-[#3DDC97]">
            P2P PASS
          </span>
        </div>
      </div>

      {/* Recipient Handle Input */}
      <div className="space-y-1.5">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-base text-[#3DDC97]">
            @
          </span>
          <input
            type="text"
            value={recipientInput}
            onChange={(e) => {
              setRecipientInput(e.target.value.toLowerCase());
              setSendError(null);
            }}
            placeholder="mary_hostel"
            aria-label="Recipient handle"
            className="w-full h-13 pl-9 pr-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none font-mono text-sm text-[#F6F4EE]"
          />
        </div>
        {!validation.valid && recipientInput.length > 0 && (
          <p className="text-xs text-[#FF5A5F] pl-1">{validation.error}</p>
        )}
      </div>

      {/* Friendly API Error Banner (e.g. 404 recipient_not_found or network failure + Retry) */}
      {sendError && (
        <div className="p-3.5 rounded-2xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
            <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-mono uppercase text-[10px] text-[#ffb4ab] block">
                {sendError.error}
              </span>
              <span>{sendError.message}</span>
            </div>
          </div>

          {sendError.error === 'network_error' && (
            <button
              type="button"
              onClick={handleConfirmSend}
              className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Frequent Campus Mates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-[#859489] uppercase tracking-wider">
            Frequent Campus Mates
          </span>
          <span className="text-[#3DDC97]">{otherMates.length} Handles</span>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {otherMates.map((mate) => {
            const selected = validation.normalized === mate.handle;
            return (
              <button
                key={mate.handle}
                type="button"
                onClick={() => {
                  setRecipientInput(mate.handle);
                  setSendError(null);
                }}
                className={`p-2.5 pr-4 rounded-full border flex items-center gap-2.5 shrink-0 transition-all cursor-pointer ${
                  selected
                    ? 'bg-[#3DDC97]/15 border-[#3DDC97]'
                    : 'bg-[#1A222B] border-[#2A3541] hover:border-[#859489]'
                }`}
              >
                <StudentAvatar
                  avatarId={mate.avatarId}
                  handle={mate.handle}
                  size={34}
                />
                <div className="text-left">
                  <div className="font-mono text-xs font-semibold text-[#F6F4EE]">
                    @{mate.handle}
                  </div>
                  <div className="text-[11px] text-[#3DDC97] truncate max-w-[120px]">
                    {mate.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview Attached Card */}
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-[#859489] uppercase tracking-wider">
            Preview Attached Card
          </span>
          <span className="text-[#3DDC97]">SHA-256 READY</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] font-semibold text-[#3DDC97] uppercase">
                FUOYE CAMPUS {mode.toUpperCase()}
              </div>
              <h2 className="font-display font-bold text-xl text-[#F6F4EE] mt-0.5">
                {routeName}
              </h2>
              <p className="text-xs text-[#B9C2CC] mt-0.5">
                From @{currentUser.handle} · {waypoints.length} verified pins
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#11161C] border border-[#2A3541] flex items-center justify-center text-[#3DDC97] shrink-0">
              <Footprints className="w-5 h-5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f141a] border border-[#2A3541] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-[#1A222B] font-mono text-[11px] text-[#F6F4EE]">
                Preview {previewCardId}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#1A222B] font-mono text-[11px] text-[#3DDC97]">
                HASH: {formatShortHash(previewHash)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#3DDC97] text-[#002112] font-mono text-xs font-bold flex items-center justify-center">
                  A
                </span>
                <span className="w-10 h-0.5 bg-[#3DDC97]" />
                <span className="w-7 h-7 rounded-full bg-[#252a31] text-[#F6F4EE] font-mono text-xs font-bold flex items-center justify-center">
                  B
                </span>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-display font-bold text-lg text-[#3DDC97]">
                  {estMinutes} min
                </div>
                <div className="text-xs text-[#B9C2CC]">
                  {geo.totalKmText} {mode.toLowerCase()}
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#11161C] border border-[#2A3541] space-y-1">
            <div className="font-mono text-[10px] text-[#859489] uppercase">
              Landmark Instruction
            </div>
            <p className="text-xs italic text-[#dee3eb]">
              “{summaryNote || directions[0]}”
            </p>
          </div>

          <div className="flex items-center justify-between font-mono text-[11px] text-[#859489]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#3DDC97]" />
              Powered by Gemma 4
            </span>
            <span>6-decimal coords</span>
          </div>
        </div>
      </div>

      {/* Personal Quick Note */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor="personal-note"
            className="font-display font-semibold text-[#F6F4EE]"
          >
            Personal Quick Note
          </label>
          <span className="font-mono text-[#859489]">Included in SHA-256</span>
        </div>
        <textarea
          id="personal-note"
          rows={2}
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          className="w-full p-3.5 rounded-2xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
        />
      </div>

      {/* Save to Campus Library Checkbox + Safety Warning */}
      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-2.5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(e) => setSaveToLibrary(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#3DDC97] rounded cursor-pointer"
          />
          <div className="space-y-0.5">
            <span className="font-display font-semibold text-sm text-[#F6F4EE] block">
              Save to campus library (Share with everyone)
            </span>
            <span className="text-xs text-[#B9C2CC] block">
              Your route card still carries its own signed inline route for @
              {validation.normalized || 'recipient'}.
            </span>
          </div>
        </label>

        {saveToLibrary && (
          <div className="p-3 rounded-xl bg-[#FFB368]/12 border border-[#FFB368]/45 flex items-start gap-2.5 text-xs text-[#ffddb8]">
            <ShieldAlert className="w-4 h-4 text-[#FFB368] shrink-0 mt-0.5" />
            <span>
              <strong>Public places only:</strong> Only share public places like
              gates, faculties and hostels&apos; main entrances — never a
              private room or home.
            </span>
          </div>
        )}
      </div>

      {/* Submit CTA with loading state */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={!validation.valid || sending}
          onClick={handleConfirmSend}
          className="w-full h-14 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:opacity-45 text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(61,220,151,0.25)] transition-all cursor-pointer"
        >
          {sending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Signing &amp; Sending Card...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Send Card to @{validation.normalized || '...'}</span>
            </>
          )}
        </button>
        <p className="text-center font-mono text-[11px] text-[#859489] flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3 text-[#3DDC97]" />
          Signed with Web Crypto SHA-256 canonical route digest
        </p>
      </div>

      <FooterLine />
    </div>
  );
}
