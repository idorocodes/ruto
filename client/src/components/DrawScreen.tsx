import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Bus,
  Camera,
  Check,
  Footprints,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  RutoLanguage,
  TransitMode,
  TurnDirection,
  UnplacedStep,
  Waypoint,
} from '../types';
import { RouteMap } from './RouteMap';
import { FooterLine } from './TopBarAndNav';
import {
  compressImageFile,
  describeLandmarkPhotoWithGemma,
  parseTextToRouteWithGemma,
} from '../api';
import { computeRouteGeometry, estimateDurationMinutes } from '../utils/geo';
import {
  BrowserSpeechRecognition,
  createSpeechRecognition,
  friendlySpeechErrorMessage,
  isSpeechRecognitionSupported,
  speechLocaleForLanguage,
} from '../utils/speech';

interface DrawScreenProps {
  routeName: string;
  onChangeRouteName: (name: string) => void;
  mode: TransitMode;
  onChangeMode: (mode: TransitMode) => void;
  language: RutoLanguage;
  onChangeLanguage: (lang: RutoLanguage) => void;
  waypoints: Waypoint[];
  onChangeWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  pendingSteps: UnplacedStep[];
  onChangePendingSteps: React.Dispatch<React.SetStateAction<UnplacedStep[]>>;
  initialPromptText?: string;
  isGeneratingDirections: boolean;
  directionsError: string | null;
  onGetDirections: () => void;
}

const SAMPLE_PROMPTS: Array<{ label: string; lang: RutoLanguage; text: string }> = [
  {
    label: 'Pidgin Sample',
    lang: 'Pidgin',
    text: 'Comot for main gate, waka straight pass the library, turn left after the food canopy, na there Mary hostel dey.',
  },
  {
    label: 'Yorùbá Sample',
    lang: 'Yoruba',
    text: 'Jáde láti Main Gate, rìn tààrà kọjá ilé-ìkàwé University Library, yà sí òsì lẹ́yìn food canopy, ibẹ̀ ni Mary Hostel wà.',
  },
  {
    label: 'English Sample',
    lang: 'English',
    text: 'Start at Phase 2 Gate, walk straight past Faculty of Arts, turn right by the yellow transformer to reach Twin Lecture Theatre.',
  },
];

export function DrawScreen({
  routeName,
  onChangeRouteName,
  mode,
  onChangeMode,
  language,
  onChangeLanguage,
  waypoints,
  onChangeWaypoints,
  pendingSteps,
  onChangePendingSteps,
  initialPromptText = '',
  isGeneratingDirections,
  directionsError,
  onGetDirections,
}: DrawScreenProps) {
  const [promptText, setPromptText] = useState(initialPromptText);
  const [parsingText, setParsingText] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Voice-to-Route Web Speech API Dictation State
  const speechSupported = isSpeechRecognitionSupported();
  const [isListening, setIsListening] = useState(false);
  const [interimSpeech, setInterimSpeech] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const basePromptBeforeMicRef = useRef<string>('');
  const latestTranscriptRef = useRef<string>(initialPromptText);
  const extractAfterStopRef = useRef<boolean>(false);

  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null);
  const [photoLoadingId, setPhotoLoadingId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lastPhotoPayload, setLastPhotoPayload] = useState<{
    waypointId: string;
    dataUrl: string;
    mimeType: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);

  const geo = computeRouteGeometry(waypoints);
  const estMinutes = estimateDurationMinutes(geo.totalMeters, mode);

  const nextUnplaced = pendingSteps[0];
  const totalPlannedPins = waypoints.length + pendingSteps.length;

  const mapBannerText = nextUnplaced
    ? `Tap map for Pin ${waypoints.length + 1}/${totalPlannedPins}: ${nextUnplaced.placeName}`
    : waypoints.length === 0
    ? 'Tap map to place Start pin'
    : 'Tap map to place next point · Tap pin to edit';

  const handleMapTap = (lat: number, lng: number) => {
    if (nextUnplaced) {
      const placed: Waypoint = {
        id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: nextUnplaced.placeName,
        landmark: nextUnplaced.landmark,
        turn: nextUnplaced.turn,
        note: nextUnplaced.note,
        lat,
        lng,
      };
      const updated = [...waypoints, placed];
      onChangeWaypoints(updated);
      onChangePendingSteps((prev) => prev.slice(1));

      if (updated.length >= 2 && (!routeName || routeName === 'Oye Campus Trail')) {
        onChangeRouteName(
          `${updated[0].name} → ${updated[updated.length - 1].name}`
        );
      }
      return;
    }

    const index = waypoints.length + 1;
    const defaultName =
      index === 1 ? 'Start Point' : `Waypoint ${index}`;
    const newWp: Waypoint = {
      id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: defaultName,
      landmark: defaultName,
      turn: 'straight',
      note: index === 1 ? 'Starting point on campus' : 'Tap to add landmark note or photo',
      lat,
      lng,
    };
    onChangeWaypoints((prev) => [...prev, newWp]);
    setEditingWaypointId(newWp.id);
  };

  const parsePromptWithGemma = async (textToParse: string) => {
    const clean = textToParse.trim();
    if (!clean) return;
    setParsingText(true);
    setParseError(null);
    try {
      const result = await parseTextToRouteWithGemma(clean);
      // Clear old pins so user taps map cleanly for each extracted step
      onChangeWaypoints([]);
      onChangePendingSteps(result.steps);
      onChangeRouteName(result.routeTitle);
      onChangeLanguage(result.detectedLanguage);
    } catch (err: unknown) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Gemma 4 could not parse that description. Please retry.'
      );
    } finally {
      setParsingText(false);
    }
  };

  const handleParseTextToRoute = async () => {
    if (isListening) {
      stopVoiceDictation(true);
      return;
    }
    await parsePromptWithGemma(promptText);
  };

  const stopVoiceDictation = (shouldAutoExtract = false) => {
    extractAfterStopRef.current = shouldAutoExtract;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore already stopped
      }
    } else {
      setIsListening(false);
      setInterimSpeech('');
    }
  };

  const toggleVoiceDictation = () => {
    if (isListening) {
      stopVoiceDictation(false);
      return;
    }

    setSpeechError(null);
    setParseError(null);

    const recognition = createSpeechRecognition(language);
    if (!recognition) {
      setSpeechError(
        'Voice dictation is supported in Chrome, Edge, and Safari. You can still type or paste your route above.'
      );
      return;
    }

    basePromptBeforeMicRef.current = promptText.trim();
    latestTranscriptRef.current = promptText.trim();
    extractAfterStopRef.current = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimSpeech('');
    };

    recognition.onresult = (event) => {
      let finalizedChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const phrase = res[0]?.transcript || '';
        if (res.isFinal) {
          finalizedChunk += `${phrase} `;
        } else {
          interimChunk += phrase;
        }
      }

      const prefix = basePromptBeforeMicRef.current
        ? `${basePromptBeforeMicRef.current} `
        : '';
      const combinedFinal = `${prefix}${finalizedChunk}`.trim();
      const combinedWithInterim = `${combinedFinal}${
        interimChunk ? ` ${interimChunk}` : ''
      }`.trim();

      latestTranscriptRef.current = combinedWithInterim;
      setInterimSpeech(interimChunk.trim());
      if (combinedFinal) {
        setPromptText(combinedFinal);
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error !== 'aborted') {
        setSpeechError(friendlySpeechErrorMessage(ev.error));
      }
      setIsListening(false);
      setInterimSpeech('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimSpeech('');
      recognitionRef.current = null;

      const finalSpoken = latestTranscriptRef.current.trim();
      if (finalSpoken) {
        setPromptText(finalSpoken);
      }

      if (extractAfterStopRef.current && finalSpoken) {
        extractAfterStopRef.current = false;
        parsePromptWithGemma(finalSpoken);
      }
    };

    try {
      recognition.start();
    } catch {
      setSpeechError('Could not start microphone capture. Please try again.');
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const triggerPhotoPicker = (wpId: string) => {
    setPhotoTargetId(wpId);
    setPhotoError(null);
    fileInputRef.current?.click();
  };

  const runPhotoLandmarkAnalysis = async (
    wpId: string,
    dataUrl: string,
    mimeType: string
  ) => {
    setPhotoLoadingId(wpId);
    setPhotoError(null);
    setLastPhotoPayload({ waypointId: wpId, dataUrl, mimeType });

    // Save photo preview immediately on the waypoint
    onChangeWaypoints((prev) =>
      prev.map((w) => (w.id === wpId ? { ...w, photoDataUrl: dataUrl } : w))
    );

    try {
      const res = await describeLandmarkPhotoWithGemma({
        imageBase64: dataUrl,
        mimeType,
      });

      onChangeWaypoints((prev) =>
        prev.map((w) => {
          if (w.id !== wpId) return w;
          const isGenericName =
            w.name.startsWith('Waypoint ') || w.name === 'Start Point';
          return {
            ...w,
            name: isGenericName ? res.suggestedSpotName : w.name,
            landmark: res.suggestedSpotName || w.landmark,
            note: res.landmarkNote,
            photoDataUrl: dataUrl,
          };
        })
      );
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'Gemma 4 Vision could not read this photo. Tap Retry.'
      );
    } finally {
      setPhotoLoadingId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !photoTargetId) return;

    try {
      const { dataUrl, mimeType } = await compressImageFile(file);
      await runPhotoLandmarkAnalysis(photoTargetId, dataUrl, mimeType);
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error ? err.message : 'Could not load selected photo.'
      );
    }
  };

  const editingWaypoint = waypoints.find((w) => w.id === editingWaypointId) || null;

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Hidden shared file input for Photo-to-Landmark multimodal */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-6 lg:px-4 lg:pt-4">
        {/* Left / Top Map Column */}
        <div className="lg:col-span-7">
          <div className="lg:rounded-2xl lg:overflow-hidden lg:border lg:border-[#2A3541]">
            <RouteMap
              waypoints={waypoints}
              interactive
              theme="dark"
              bannerText={mapBannerText}
              heightClass="h-[340px] sm:h-[400px] lg:h-[620px]"
              onMapTap={handleMapTap}
              onSelectWaypoint={(wpId) => {
                setPhotoError(null);
                setEditingWaypointId(wpId);
              }}
              onResetWaypoints={() => {
                onChangeWaypoints([]);
                onChangePendingSteps([]);
              }}
            />
          </div>

          {/* Pending Text-to-Route Step Placement Callout */}
          {pendingSteps.length > 0 && (
            <div className="mx-4 lg:mx-0 mt-3 p-3.5 rounded-2xl bg-[#3DDC97]/12 border border-[#3DDC97]/50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-xs font-semibold text-[#3DDC97]">
                  STEP {waypoints.length + 1} OF {totalPlannedPins} READY TO PIN
                </div>
                <div className="text-sm font-display font-bold text-[#F6F4EE] truncate">
                  Tap the map where “{nextUnplaced.placeName}” is located
                </div>
                <div className="text-xs text-[#B9C2CC] truncate">
                  Turn: {nextUnplaced.turn} · {nextUnplaced.note}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangePendingSteps([])}
                className="px-2.5 py-1.5 rounded-lg bg-[#1A222B] border border-[#2A3541] text-xs font-mono text-[#B9C2CC] hover:text-[#F6F4EE] shrink-0 cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Bottom Sheet (Mobile) / Control Column (Desktop) matching draw_d226e1cb */}
        <div className="lg:col-span-5 -mt-3 lg:mt-0 relative z-10 rounded-t-3xl lg:rounded-2xl bg-[#0f141a] lg:bg-[#171c22] border-t lg:border border-[#2A3541] px-4 pt-3 pb-6 space-y-5">
          {/* Mobile grab handle */}
          <div className="w-10 h-1 rounded-full bg-[#2A3541] mx-auto lg:hidden" />

          {/* Editable Route Title & Live Distance */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => onChangeRouteName(e.target.value)}
                  placeholder="Oye Campus Trail"
                  aria-label="Route title"
                  className="font-display font-bold text-xl text-[#F6F4EE] bg-transparent border-b border-transparent focus:border-[#3DDC97] focus:outline-none w-full truncate"
                />
                <span className="px-2 py-0.5 rounded-md bg-[#3DDC97]/15 text-[#3DDC97] font-mono text-xs font-semibold shrink-0 tabular-nums">
                  {geo.totalKmText}
                </span>
              </div>
              <p className="text-xs text-[#B9C2CC] mt-1 tabular-nums">
                Estimated {estMinutes} min · {waypoints.length} pin
                {waypoints.length === 1 ? '' : 's'} placed
              </p>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A222B] border border-[#2A3541] font-mono text-[11px] text-[#B9C2CC] shrink-0">
              <Sparkles className="w-3 h-3 text-[#3DDC97]" />
              Gemma 4
            </span>
          </div>

          {/* Transit Mode Selector: Walk / Keke / Okada */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#1A222B] border border-[#2A3541]">
            {(
              [
                { id: 'Walk', icon: Footprints },
                { id: 'Keke', icon: Bus },
                { id: 'Okada', icon: Bike },
              ] as const
            ).map(({ id, icon: Icon }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeMode(id)}
                  className={`h-11 rounded-xl font-display font-semibold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-[#3DDC97] text-[#002112]'
                      : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{id}</span>
                </button>
              );
            })}
          </div>

          {/* AI FEATURE 1: VOICE & TEXT TO ROUTE (Web Speech API + Gemma 4 Structured JSON) */}
          <div
            className={`p-3.5 rounded-2xl bg-[#1A222B] border space-y-2.5 transition-colors ${
              isListening ? 'border-[#3DDC97]' : 'border-[#2A3541]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="text-to-route-input"
                className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]"
              >
                Natural Voice &amp; Text Prompt
              </label>
              <span className="font-mono text-[11px] text-[#3DDC97]">
                {isListening
                  ? `Listening (${speechLocaleForLanguage(language)})…`
                  : 'Voice + Gemma 4'}
              </span>
            </div>

            <div className="relative">
              <textarea
                id="text-to-route-input"
                rows={3}
                value={
                  isListening && interimSpeech
                    ? `${promptText}${promptText ? ' ' : ''}${interimSpeech}`
                    : promptText
                }
                onChange={(e) => {
                  setPromptText(e.target.value);
                  latestTranscriptRef.current = e.target.value;
                }}
                placeholder='Tap the mic and speak — or type e.g. "Comot for main gate, waka straight pass the library, turn left after the food canopy..."'
                className="w-full p-3 pr-14 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE] placeholder:text-[#859489] resize-none"
              />

              {/* Stitch-style Microphone Dictation Button */}
              <button
                type="button"
                onClick={toggleVoiceDictation}
                title={
                  isListening
                    ? 'Stop voice dictation'
                    : speechSupported
                    ? `Speak directions (${speechLocaleForLanguage(language)})`
                    : 'Voice dictation not supported in this browser'
                }
                aria-label={isListening ? 'Stop microphone' : 'Speak route directions'}
                className={`absolute right-2.5 bottom-2.5 w-10 h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                  isListening
                    ? 'bg-[#FF5A5F] border-[#FF5A5F] text-[#0f141a] shadow-[0_0_18px_rgba(255,90,95,0.55)] animate-pulse'
                    : 'bg-[#3DDC97]/15 hover:bg-[#3DDC97]/30 border-[#3DDC97]/50 text-[#3DDC97]'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            {isListening && (
              <div className="p-2.5 rounded-xl bg-[#3DDC97]/12 border border-[#3DDC97]/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A5F] animate-ping shrink-0" />
                  <span className="text-xs text-[#F6F4EE] truncate">
                    Speaking live… describe gates, landmarks &amp; turns
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => stopVoiceDictation(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#3DDC97] text-[#002112] font-display font-bold text-xs shrink-0 cursor-pointer"
                >
                  Done → Gemma 4
                </button>
              </div>
            )}

            {speechError && (
              <div className="p-2.5 rounded-xl bg-[#FFB368]/15 border border-[#FFB368]/50 flex items-start gap-2 text-xs text-[#FFD8B6]">
                <AlertCircle className="w-4 h-4 text-[#FFB368] shrink-0 mt-0.5" />
                <span>{speechError}</span>
              </div>
            )}

            {/* Quick sample chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setPromptText(sample.text);
                    latestTranscriptRef.current = sample.text;
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#11161C] hover:bg-[#252a31] border border-[#2A3541] font-mono text-[11px] text-[#B9C2CC] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>

            {parseError && (
              <div className="p-3 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
                  <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleParseTextToRoute}
                  className="px-2.5 py-1 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={
                parsingText ||
                (!promptText.trim() && !(isListening && interimSpeech.trim()))
              }
              onClick={handleParseTextToRoute}
              className="w-full h-11 rounded-xl bg-[#252a31] hover:bg-[#30353c] disabled:opacity-50 border border-[#3DDC97]/50 text-[#3DDC97] font-display font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {parsingText ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gemma 4 is extracting steps...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>
                    {isListening
                      ? 'Stop Mic & Extract Steps with Gemma 4'
                      : 'Extract Steps with Gemma 4'}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* CUSTOM PATH SEQUENCE */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]">
                Custom Path Sequence
              </span>
              <span className="font-mono text-[11px] text-[#859489]">
                Tap row to edit or attach photo
              </span>
            </div>

            {waypoints.length === 0 && pendingSteps.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#1A222B]/60 border border-dashed border-[#2A3541] text-center space-y-1">
                <MapPin className="w-5 h-5 text-[#3DDC97] mx-auto" />
                <p className="text-sm font-medium text-[#F6F4EE]">
                  No pins on the map yet
                </p>
                <p className="text-xs text-[#859489]">
                  Tap directly on the OpenStreetMap above, or paste a messy route
                  description for Gemma 4 to turn into steps.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {waypoints.map((wp, idx) => {
                  const isFirst = idx === 0;
                  const isLast =
                    idx === waypoints.length - 1 &&
                    pendingSteps.length === 0 &&
                    waypoints.length > 1;
                  const isAnalyzingPhoto = photoLoadingId === wp.id;

                  return (
                    <div
                      key={wp.id}
                      onClick={() => {
                        setPhotoError(null);
                        setEditingWaypointId(wp.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingWaypointId(wp.id);
                      }}
                      className="p-3.5 rounded-2xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] hover:border-[#3DDC97]/60 flex items-start gap-3 transition-colors cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#3DDC97]/20 border border-[#3DDC97]/50 text-[#3DDC97] font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-semibold text-sm text-[#F6F4EE] truncate">
                            {wp.name}
                          </span>
                          {isFirst ? (
                            <span className="font-mono text-[11px] font-semibold text-[#3DDC97] shrink-0">
                              Start
                            </span>
                          ) : isLast ? (
                            <span className="font-mono text-[11px] font-semibold text-[#FFB368] shrink-0">
                              Drop
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-[#859489] shrink-0">
                              {wp.turn}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#B9C2CC] line-clamp-2 mt-0.5">
                          {isAnalyzingPhoto
                            ? 'Gemma 4 Vision is describing spot photo...'
                            : wp.note || wp.landmark}
                        </p>

                        <div className="flex items-center gap-3 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerPhotoPicker(wp.id);
                            }}
                            disabled={isAnalyzingPhoto}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#3DDC97] hover:underline cursor-pointer"
                          >
                            {isAnalyzingPhoto ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Camera className="w-3 h-3" />
                            )}
                            <span>
                              {wp.photoDataUrl ? 'Update spot photo' : 'Photo → landmark'}
                            </span>
                          </button>

                          <span className="font-mono text-[10px] text-[#859489] tabular-nums">
                            {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                          </span>
                        </div>
                      </div>

                      {wp.photoDataUrl && (
                        <img
                          src={wp.photoDataUrl}
                          alt={wp.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-[#2A3541] shrink-0"
                        />
                      )}
                    </div>
                  );
                })}

                {/* Unplaced Steps Queue from Gemma 4 Text-to-Route */}
                {pendingSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className={`p-3.5 rounded-2xl border border-dashed flex items-start gap-3 ${
                      idx === 0
                        ? 'bg-[#3DDC97]/10 border-[#3DDC97]'
                        : 'bg-[#11161C]/70 border-[#2A3541]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-[#1A222B] border border-[#2A3541] text-[#859489] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {waypoints.length + idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-semibold text-sm text-[#F6F4EE] truncate">
                          {step.placeName}
                        </span>
                        <span className="font-mono text-[11px] text-[#3DDC97] shrink-0">
                          {idx === 0 ? 'Tap map now' : 'Waiting for pin'}
                        </span>
                      </div>
                      <p className="text-xs text-[#B9C2CC] mt-0.5">
                        Turn {step.turn} · {step.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Photo Error + Retry Banner */}
            {photoError && (
              <div className="p-3 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-2">
                <span className="text-xs text-[#ffdad6]">{photoError}</span>
                {lastPhotoPayload && (
                  <button
                    type="button"
                    onClick={() =>
                      runPhotoLandmarkAnalysis(
                        lastPhotoPayload.waypointId,
                        lastPhotoPayload.dataUrl,
                        lastPhotoPayload.mimeType
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                // Drop a pin slightly offset from last pin or campus center so user can also add via button
                const last = waypoints[waypoints.length - 1];
                const baseLat = last ? last.lat + 0.0009 : 7.7796;
                const baseLng = last ? last.lng + 0.0009 : 5.3152;
                handleMapTap(
                  Number(baseLat.toFixed(6)),
                  Number(baseLng.toFixed(6))
                );
              }}
              className="w-full h-12 rounded-2xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] text-[#3DDC97] font-display font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Waypoint</span>
            </button>
          </div>

          {/* Direction Language Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]">
                Direction Language
              </span>
              <span className="font-mono text-xs text-[#3DDC97]">
                Gemma 4 Grounded
              </span>
            </div>

            <div className="flex items-center gap-2">
              {(
                [
                  { id: 'English', label: 'English' },
                  { id: 'Pidgin', label: 'Naija Pidgin' },
                  { id: 'Yoruba', label: 'Yorùbá' },
                ] as const
              ).map((item) => {
                const active = language === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeLanguage(item.id)}
                    className={`h-9 px-4 rounded-full font-mono text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#3DDC97] border-[#3DDC97] text-[#002112]'
                        : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC] hover:text-[#F6F4EE]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directions Generation Error + Retry */}
          {directionsError && (
            <div className="p-3.5 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
                <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
                <span>{directionsError}</span>
              </div>
              <button
                type="button"
                onClick={onGetDirections}
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* Primary CTA: Get directions -> */}
          <button
            type="button"
            disabled={
              waypoints.length < 2 ||
              pendingSteps.length > 0 ||
              isGeneratingDirections
            }
            onClick={onGetDirections}
            className="w-full h-14 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:opacity-45 disabled:cursor-not-allowed text-[#002112] font-display font-bold text-base flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(61,220,151,0.2)] transition-all cursor-pointer"
          >
            {isGeneratingDirections ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Gemma 4 is writing {language} directions...</span>
              </>
            ) : pendingSteps.length > 0 ? (
              <span>
                Place {pendingSteps.length} remaining pin
                {pendingSteps.length === 1 ? '' : 's'} on map first
              </span>
            ) : waypoints.length < 2 ? (
              <span>Place at least 2 pins on map</span>
            ) : (
              <>
                <span>Get directions</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Waypoint Edit + Multimodal Photo-to-Landmark Drawer */}
      {editingWaypoint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-[#1A222B] border-t sm:border border-[#2A3541] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#F6F4EE]">
                Edit Waypoint &amp; Landmark Photo
              </h3>
              <button
                type="button"
                onClick={() => setEditingWaypointId(null)}
                className="w-8 h-8 rounded-lg bg-[#11161C] text-[#B9C2CC] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                  Spot Name
                </label>
                <input
                  type="text"
                  value={editingWaypoint.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeWaypoints((prev) =>
                      prev.map((w) =>
                        w.id === editingWaypoint.id ? { ...w, name: val } : w
                      )
                    );
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
                  Turn Direction
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['straight', 'left', 'right'] as TurnDirection[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        onChangeWaypoints((prev) =>
                          prev.map((w) =>
                            w.id === editingWaypoint.id ? { ...w, turn: t } : w
                          )
                        )
                      }
                      className={`h-9 rounded-xl font-mono text-xs capitalize border cursor-pointer ${
                        editingWaypoint.turn === t
                          ? 'bg-[#3DDC97]/20 border-[#3DDC97] text-[#3DDC97]'
                          : 'bg-[#11161C] border-[#2A3541] text-[#B9C2CC]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-mono text-xs text-[#B9C2CC]">
                    Landmark Note
                  </label>
                  <button
                    type="button"
                    onClick={() => triggerPhotoPicker(editingWaypoint.id)}
                    disabled={photoLoadingId === editingWaypoint.id}
                    className="inline-flex items-center gap-1 font-mono text-xs text-[#3DDC97] hover:underline cursor-pointer"
                  >
                    {photoLoadingId === editingWaypoint.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <span>Attach photo (Gemma 4 Vision)</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={editingWaypoint.note}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeWaypoints((prev) =>
                      prev.map((w) =>
                        w.id === editingWaypoint.id ? { ...w, note: val } : w
                      )
                    );
                  }}
                  placeholder="Describe visible landmark (or attach a photo above)..."
                  className="w-full p-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
                />
              </div>

              {editingWaypoint.photoDataUrl && (
                <div className="relative rounded-xl overflow-hidden border border-[#2A3541]">
                  <img
                    src={editingWaypoint.photoDataUrl}
                    alt={editingWaypoint.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover"
                  />
                  {photoLoadingId === editingWaypoint.id && (
                    <div className="absolute inset-0 bg-black/65 flex items-center justify-center gap-2 text-xs font-mono text-[#3DDC97]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gemma 4 describing landmark...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onChangeWaypoints((prev) =>
                    prev.filter((w) => w.id !== editingWaypoint.id)
                  );
                  setEditingWaypointId(null);
                }}
                className="h-11 px-4 rounded-xl bg-[#11161C] border border-[#FF5A5F]/60 text-[#FF5A5F] font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Pin</span>
              </button>

              <button
                type="button"
                onClick={() => setEditingWaypointId(null)}
                className="flex-1 h-11 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Pin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <FooterLine />
    </div>
  );
}
