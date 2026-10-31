import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Disc,
  Edit3,
  Footprints,
  Languages,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  MessageSquarePlus,
  Navigation,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsUp,
  X,
} from 'lucide-react';
import {
  getNearPaths,
  normalizeApiError,
  searchPaths,
  verifyCard,
} from '../api';
import {
  ApiErrorShape,
  CampusRequest,
  LiveUserPosition,
  NearPathSummary,
  RouteCard,
  RutoLanguage,
  SharedPathSummary,
} from '../types';
import { StudentAvatar } from './Avatars';
import { RouteMap } from './RouteMap';
import { FooterLine } from './TopBarAndNav';
import { formatShortHash } from '../utils/crypto';
import {
  computeRouteGeometry,
  estimateDurationMinutes,
  formatDistanceLabel,
  formatRelativeTime,
} from '../utils/geo';
import { DEFAULT_CAMPUS_CENTER } from '../utils/seedData';

interface HomeScreenProps {
  featuredCard?: RouteCard;
  onStartDraw: () => void;
  onStartRecord: () => void;
  onExplore: () => void;
  onOpenPath: (pathId: string) => void;
  onOpenCardDirections: (card: RouteCard) => void;
}

const HERO_VOICE_SAMPLES: Record<RutoLanguage, string> = {
  Pidgin:
    '“Commot for main gate, waka pass Science block straight. Once you spot Mama Put canopy, branch left, follow the red sand track go Mary’s.”',
  Yoruba:
    '“Jáde láti Main Gate, rìn tààrà kọjá Science block. Tí o bá ti rí àtíbàbà Mama Put, yà sí òsì kí o tẹ̀lé ọ̀nà erùpẹ̀ pupa dé Mary’s.”',
  English:
    '“Step out from Main Gate and walk straight past the Science block. Right after the Mama Put food canopy, turn left onto the red sand path to Mary’s.”',
};

const TRY_LOCAL_VOICES: Record<RutoLanguage, string> = {
  Pidgin:
    '“Oya make you follow the track wey dey behind Faculty of Science. When you see the yellow transformer, bend right straight to hostel.”',
  Yoruba:
    '“Gba ojú ọ̀nà tó wà lẹ́yìn Faculty of Science. Tí o bá rí transformer pupa-ofeefee náà, yà sí ọ̀tún tààrà sí hostel.”',
  English:
    '“Follow the footpath behind the Faculty of Science. Once you pass the yellow transformer box, turn right straight toward the hostel gate.”',
};

function SharedPathResultCard({
  item,
  distanceFromUserMeters,
  onOpenPath,
}: {
  item: SharedPathSummary;
  distanceFromUserMeters?: number;
  onOpenPath: (pathId: string) => void;
}) {
  const isOutdated = item.flags >= 2;
  const estMins = estimateDurationMinutes(item.distanceMeters, item.mode);

  return (
    <button
      type="button"
      onClick={() => onOpenPath(item.id)}
      className="w-full text-left p-4 rounded-2xl bg-[#1A222B] hover:bg-[#202A35] border border-[#2A3541] hover:border-[#3DDC97]/60 transition-all space-y-2.5 cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-[#11161C] border border-[#2A3541] font-mono text-[10px] uppercase text-[#3DDC97]">
              {item.mode} · {estMins} min
            </span>
            {typeof distanceFromUserMeters === 'number' && (
              <span className="px-2 py-0.5 rounded bg-[#3DDC97]/15 font-mono text-[10px] font-semibold text-[#3DDC97]">
                {distanceFromUserMeters} m from you
              </span>
            )}
            {isOutdated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFB368]/15 border border-[#FFB368]/50 font-mono text-[10px] font-semibold text-[#FFB368]">
                <AlertTriangle className="w-3 h-3" />
                May be outdated
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-base sm:text-lg text-[#F6F4EE] mt-1.5 group-hover:text-[#3DDC97] transition-colors">
            {item.title}
          </h3>
          <p className="text-xs text-[#B9C2CC] mt-0.5 truncate">
            {item.startName} <span className="text-[#3DDC97]">→</span>{' '}
            {item.endName}
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-sm text-[#F6F4EE] tabular-nums">
            {formatDistanceLabel(item.distanceMeters)}
          </div>
          <div className="font-mono text-[10px] text-[#859489]">distance</div>
        </div>
      </div>

      <div className="pt-2 border-t border-[#2A3541]/70 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#B9C2CC]">
          <span className="inline-flex items-center gap-1 font-mono text-[#3DDC97] font-semibold">
            <ThumbsUp className="w-3.5 h-3.5" />
            {item.confirmations}
          </span>
          <span>
            Worked for {item.confirmations}{' '}
            {item.confirmations === 1 ? 'person' : 'people'}
          </span>
        </div>

        <span className="font-mono text-xs text-[#3DDC97] inline-flex items-center gap-1 shrink-0">
          <span>Open path</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

export function HomeScreen({
  featuredCard,
  onStartDraw,
  onStartRecord,
  onExplore,
  onOpenPath,
  onOpenCardDirections,
}: HomeScreenProps) {
  const [heroLang, setHeroLang] = useState<RutoLanguage>('Pidgin');
  const [sampleLang, setSampleLang] = useState<RutoLanguage>('Pidgin');

  // Shared Route Library: Search ("Where are you going?")
  const [searchQuery, setSearchQuery] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [showFromToFilters, setShowFromToFilters] = useState(false);

  const [searchResults, setSearchResults] = useState<SharedPathSummary[]>([]);
  const [searchingPaths, setSearchingPaths] = useState(true);
  const [searchError, setSearchError] = useState<ApiErrorShape | null>(null);

  // Shared Route Library: Near Me (500m radius, rounded position only, never stored)
  const [nearPaths, setNearPaths] = useState<NearPathSummary[]>([]);
  const [loadingNear, setLoadingNear] = useState(false);
  const [nearError, setNearError] = useState<ApiErrorShape | null>(null);
  const [nearPos, setNearPos] = useState<LiveUserPosition | null>(null);
  const [nearGeoMessage, setNearGeoMessage] = useState<string | null>(null);
  const [showTapNearMap, setShowTapNearMap] = useState(false);

  const runPathSearch = useCallback(async () => {
    setSearchingPaths(true);
    setSearchError(null);
    try {
      const results = await searchPaths({
        q: searchQuery,
        from: fromFilter,
        to: toFilter,
      });
      setSearchResults(results);
    } catch (err: unknown) {
      setSearchError(normalizeApiError(err));
    } finally {
      setSearchingPaths(false);
    }
  }, [searchQuery, fromFilter, toFilter]);

  useEffect(() => {
    runPathSearch();
  }, [runPathSearch]);

  const fetchNearAtCoords = useCallback(
    async (lat: number, lng: number, accuracy = 15, isManual = false) => {
      setNearPos({ lat, lng, accuracy, isManual });
      setLoadingNear(true);
      setNearError(null);
      try {
        const list = await getNearPaths({ lat, lng, radius: 500 });
        setNearPaths(list);
      } catch (err: unknown) {
        setNearError(normalizeApiError(err));
      } finally {
        setLoadingNear(false);
      }
    },
    []
  );

  const handleLocateNearMe = useCallback(() => {
    setNearGeoMessage(null);
    if (!('geolocation' in navigator)) {
      setNearGeoMessage(
        'Geolocation is not supported in this browser. Tap a spot on the campus map below or use FUOYE Main Gate.'
      );
      setShowTapNearMap(true);
      return;
    }

    setLoadingNear(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setShowTapNearMap(false);
        fetchNearAtCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          Math.round(pos.coords.accuracy || 15),
          false
        );
      },
      (err) => {
        setLoadingNear(false);
        if (err.code === err.PERMISSION_DENIED) {
          setNearGeoMessage(
            'Location permission was denied. Tap the campus map below to pick your spot (never saved) or check paths near FUOYE Main Gate.'
          );
        } else {
          setNearGeoMessage(
            'Could not read GPS signal right now. Tap the campus map below or check paths near FUOYE Main Gate.'
          );
        }
        setShowTapNearMap(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }, [fetchNearAtCoords]);

  // Load initial Near Me around campus center so students immediately see nearby routes,
  // with one-tap "Use my GPS" for live 500m proximity
  useEffect(() => {
    fetchNearAtCoords(
      DEFAULT_CAMPUS_CENTER[0],
      DEFAULT_CAMPUS_CENTER[1],
      15,
      true
    );
  }, [fetchNearAtCoords]);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#B9C2CC]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A222B] border border-[#2A3541]">
              <Sparkles className="w-3 h-3 text-[#3DDC97]" />
              BUILT FOR FUOYE STUDENTS
            </span>
            <span className="text-[#859489]">·</span>
            <span className="text-[#3DDC97]">Oye &amp; Ikole Hub</span>
          </div>

          <h1 className="font-display font-bold text-[30px] sm:text-[38px] leading-[1.14] tracking-tight text-[#F6F4EE] [text-wrap:balance]">
            Never miss road inside campus again.
          </h1>

          <p className="text-[15px] sm:text-base leading-relaxed text-[#B9C2CC] max-w-xl">
            Search the shared campus path library, record a new footpath as you
            walk, or send SHA-256 verified route cards in Pidgin, Yorùbá, or
            English.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={onStartDraw}
              className="h-13 px-5 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] active:bg-[#34BE82] text-[#002112] font-display font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(61,220,151,0.25)] transition-all cursor-pointer"
            >
              <span>Draw a Route</span>
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onStartRecord}
              className="h-13 px-5 rounded-2xl bg-[#1A222B] hover:bg-[#222C37] border border-[#3DDC97]/60 text-[#3DDC97] font-display font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Disc className="w-4 h-4" />
              <span>Record a Path</span>
            </button>

            <button
              type="button"
              onClick={onExplore}
              className="h-13 px-5 rounded-2xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] hover:border-[#3DDC97] text-[#F6F4EE] font-display font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Explore Cards</span>
              <Compass className="w-4 h-4 text-[#B9C2CC]" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="inline-flex items-center gap-1.5 text-[#3DDC97] font-semibold">
                <RouteIcon className="w-3.5 h-3.5" />
                VERIFIED ROUTE CARD
              </span>
              <span className="text-[#859489]">LIVE GPS READY</span>
            </div>

            <div>
              <h2 className="font-display font-bold text-xl text-[#F6F4EE]">
                Main Gate <span className="text-[#3DDC97]">→</span> Mary’s Hostel
              </h2>
              <p className="text-xs text-[#B9C2CC] mt-0.5 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-[#FFB368]" />
                <span>14 mins walk · Red Sand Path Shortcut</span>
              </p>
            </div>

            <div
              onClick={() => featuredCard && onOpenCardDirections(featuredCard)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && featuredCard)
                  onOpenCardDirections(featuredCard);
              }}
              className="relative rounded-xl bg-[#0f141a] border border-[#2A3541] p-3 h-28 overflow-hidden cursor-pointer group"
            >
              <svg
                viewBox="0 0 320 110"
                className="w-full h-full"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 92 Q 90 88, 150 62 T 305 22"
                  stroke="#22303C"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
                <path
                  d="M28 86 Q 105 80, 155 56 T 275 24"
                  stroke="#3DDC97"
                  strokeWidth="3.2"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                />
                <circle cx="32" cy="85" r="5" fill="#3DDC97" />
                <circle cx="155" cy="56" r="5" fill="#FFB368" />
                <circle cx="268" cy="25" r="5" fill="#61F9B1" />
              </svg>

              <span className="absolute bottom-2 left-3 px-2.5 py-0.5 rounded-full bg-[#1A222B]/95 border border-[#2A3541] font-mono text-[10px] text-[#F6F4EE]">
                1 · Gate Arc
              </span>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full bg-[#1A222B]/95 border border-[#2A3541] font-mono text-[10px] text-[#F6F4EE]">
                2 · Mama Put Canopy
              </span>
              <span className="absolute top-2 right-3 px-2.5 py-0.5 rounded-full bg-[#1A222B]/95 border border-[#2A3541] font-mono text-[10px] text-[#F6F4EE]">
                3 · Mary’s Gate
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#11161C] border border-[#2A3541] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#3DDC97]">
                  GEMMA 4 · {heroLang.toUpperCase()}
                </span>
                <div className="flex items-center gap-1">
                  {(['Yoruba', 'Pidgin', 'English'] as RutoLanguage[]).map(
                    (lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setHeroLang(lang)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                          heroLang === lang
                            ? 'bg-[#3DDC97]/20 text-[#3DDC97] font-semibold'
                            : 'text-[#859489] hover:text-[#F6F4EE]'
                        }`}
                      >
                        {lang === 'English'
                          ? 'Eng'
                          : lang === 'Yoruba'
                          ? 'Yorùbá'
                          : 'Pidgin'}
                      </button>
                    )
                  )}
                </div>
              </div>
              <p className="text-xs italic text-[#dee3eb] leading-relaxed">
                {HERO_VOICE_SAMPLES[heroLang]}
              </p>
            </div>

            <div className="flex items-center justify-between pt-0.5 text-xs font-mono">
              <span className="text-[#B9C2CC] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3DDC97]" />
                HASH:{' '}
                {featuredCard
                  ? formatShortHash(featuredCard.hash)
                  : '8f9b...3c21'}{' '}
                · <strong className="text-[#3DDC97]">INTACT</strong>
              </span>
              {featuredCard && (
                <button
                  type="button"
                  onClick={() => onOpenCardDirections(featuredCard)}
                  className="text-[#3DDC97] hover:underline cursor-pointer"
                >
                  Open →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* FIND A PATH: SEARCH ("Where are you going?") + NEAR ME (within 500 m) */}
      {/* ===================================================================== */}
      <section className="mt-8 space-y-6">
        <div className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs font-semibold text-[#3DDC97] uppercase tracking-wider">
                SHARED CAMPUS ROUTE LIBRARY
              </div>
              <h2 className="font-display font-bold text-xl text-[#F6F4EE] mt-0.5">
                Find a student-walked path
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowFromToFilters((s) => !s)}
              className="self-start sm:self-auto h-9 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] hover:border-[#3DDC97] font-mono text-xs text-[#B9C2CC] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#3DDC97]" />
              <span>{showFromToFilters ? 'Hide From/To' : 'From / To filter'}</span>
            </button>
          </div>

          {/* Search Box: "Where are you going?" */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#3DDC97] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Where are you going? (e.g. Mary's Hostel, TLT, Science, Library)"
              aria-label="Where are you going?"
              className="w-full h-13 pl-11 pr-10 rounded-2xl bg-[#0f141a] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE] placeholder:text-[#859489]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear destination search"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#859489] hover:text-[#F6F4EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showFromToFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={fromFilter}
                onChange={(e) => setFromFilter(e.target.value)}
                placeholder="Starting from (e.g. Main Gate)"
                className="h-11 px-3.5 rounded-xl bg-[#0f141a] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-xs text-[#F6F4EE] placeholder:text-[#859489]"
              />
              <input
                type="text"
                value={toFilter}
                onChange={(e) => setToFilter(e.target.value)}
                placeholder="Going to (e.g. TLT, Hostel)"
                className="h-11 px-3.5 rounded-xl bg-[#0f141a] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-xs text-[#F6F4EE] placeholder:text-[#859489]"
              />
            </div>
          )}

          {searchError && (
            <div className="p-3.5 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#ffdad6]">
                <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0" />
                <span>{searchError.message}</span>
              </div>
              <button
                type="button"
                onClick={runPathSearch}
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {searchingPaths ? (
            <div className="py-8 flex items-center justify-center gap-2.5 text-sm text-[#B9C2CC]">
              <Loader2 className="w-5 h-5 text-[#3DDC97] animate-spin" />
              <span>Searching public campus paths...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#11161C] border border-[#2A3541] text-center space-y-2">
              <p className="font-display font-semibold text-sm text-[#F6F4EE]">
                No public path matches that search yet
              </p>
              <p className="text-xs text-[#859489]">
                Be the first walker to record it and share with campus mates.
              </p>
              <button
                type="button"
                onClick={onStartRecord}
                className="mt-1 h-10 px-4 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Record this path</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map((item) => (
                <SharedPathResultCard
                  key={item.id}
                  item={item}
                  onOpenPath={onOpenPath}
                />
              ))}
            </div>
          )}
        </div>

        {/* Near Me (within 500 m) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#3DDC97]" />
                <h2 className="font-display font-bold text-lg text-[#F6F4EE]">
                  Near me (within 500 m)
                </h2>
              </div>
              <p className="text-xs text-[#B9C2CC] mt-0.5">
                Public paths starting within 500 m, sorted by distance. Only a
                rounded coordinate is used for this lookup and never stored.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleLocateNearMe}
                disabled={loadingNear}
                className="h-9 px-3.5 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:opacity-50 text-[#002112] font-mono text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>Use my GPS</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTapNearMap((s) => !s)}
                className="h-9 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] hover:border-[#3DDC97] font-mono text-xs text-[#B9C2CC] cursor-pointer"
              >
                {showTapNearMap ? 'Hide Map Picker' : 'Pick spot on map'}
              </button>
            </div>
          </div>

          {nearGeoMessage && (
            <div className="p-3 rounded-xl bg-[#FFB368]/12 border border-[#FFB368]/40 flex items-center justify-between gap-2 text-xs text-[#ffddb8]">
              <span>{nearGeoMessage}</span>
              <button
                type="button"
                onClick={() =>
                  fetchNearAtCoords(
                    DEFAULT_CAMPUS_CENTER[0],
                    DEFAULT_CAMPUS_CENTER[1],
                    15,
                    true
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-[#1A222B] border border-[#FFB368]/50 font-mono text-[11px] text-[#FFB368] shrink-0 cursor-pointer"
              >
                FUOYE Gate
              </button>
            </div>
          )}

          {showTapNearMap && (
            <div className="rounded-xl overflow-hidden border border-[#2A3541]">
              <RouteMap
                waypoints={[]}
                interactive={false}
                heightClass="h-[190px]"
                liveUserPos={nearPos}
                allowManualPositionTap
                onManualPositionTap={(lat, lng) =>
                  fetchNearAtCoords(lat, lng, 12, true)
                }
              />
            </div>
          )}

          {nearError && (
            <div className="p-3.5 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#ffdad6]">
                <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0" />
                <span>{nearError.message}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  nearPos &&
                  fetchNearAtCoords(
                    nearPos.lat,
                    nearPos.lng,
                    nearPos.accuracy,
                    nearPos.isManual
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {loadingNear ? (
            <div className="py-6 flex items-center justify-center gap-2 text-sm text-[#B9C2CC]">
              <Loader2 className="w-5 h-5 text-[#3DDC97] animate-spin" />
              <span>Finding paths within 500 m...</span>
            </div>
          ) : nearPaths.length === 0 ? (
            <div className="p-5 rounded-xl bg-[#11161C] border border-[#2A3541] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#B9C2CC]">
                No public path starts within 500 m of that spot yet. Tap{' '}
                <strong className="text-[#F6F4EE]">FUOYE Main Gate</strong> to
                preview Oye campus paths or record a new path here.
              </div>
              <button
                type="button"
                onClick={() =>
                  fetchNearAtCoords(
                    DEFAULT_CAMPUS_CENTER[0],
                    DEFAULT_CAMPUS_CENTER[1],
                    15,
                    true
                  )
                }
                className="h-9 px-3 rounded-lg bg-[#252a31] hover:bg-[#30353c] text-xs font-mono text-[#3DDC97] shrink-0 cursor-pointer"
              >
                Check FUOYE Main Gate
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {nearPaths.map((item) => (
                <SharedPathResultCard
                  key={item.id}
                  item={item}
                  distanceFromUserMeters={item.distanceFromUserMeters}
                  onOpenPath={onOpenPath}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-[#F6F4EE]">
            Why Campus Runs on Ruto
          </h2>
          <p className="text-sm text-[#B9C2CC] mt-0.5">
            Engineered for rough campus networks and fast 8:00 AM lectures.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#3DDC97]/15 border border-[#3DDC97]/30 flex items-center justify-center text-[#3DDC97] shrink-0">
              <RouteIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base text-[#F6F4EE]">
                Walk-Record &amp; Navigate
              </h3>
              <p className="text-xs text-[#B9C2CC] leading-relaxed mt-1">
                Record GPS tracks simplified with Douglas-Peucker and follow the
                on-device blue dot with live Haversine distance.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#FFB368]/15 border border-[#FFB368]/30 flex items-center justify-center text-[#FFB368] shrink-0">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base text-[#F6F4EE]">
                Multilingual Gemma 4 AI
              </h3>
              <p className="text-xs text-[#B9C2CC] leading-relaxed mt-1">
                Paste messy text or attach landmark photos. Gemma 4 writes
                grounded directions in Naija Pidgin, Yorùbá, or English without
                inventing turns.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#B9C2CC]/10 border border-[#2A3541] flex items-center justify-center text-[#F6F4EE] shrink-0">
              <Shield className="w-5 h-5 text-[#3DDC97]" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base text-[#F6F4EE]">
                Tamper-Proof Cards
              </h3>
              <p className="text-xs text-[#B9C2CC] leading-relaxed mt-1">
                Every route card gets a canonical SHA-256 signature via Web
                Crypto. Receivers verify nobody altered waypoints before
                accepting.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#3DDC97]" />
            <h2 className="font-display font-semibold text-base text-[#F6F4EE]">
              Try Gemma 4 Local Voices
            </h2>
          </div>
          <span className="font-mono text-xs text-[#859489]">Tap to swap</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0f141a] border border-[#2A3541]">
          {(['Pidgin', 'Yoruba', 'English'] as RutoLanguage[]).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setSampleLang(lang)}
              className={`h-9 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer ${
                sampleLang === lang
                  ? 'bg-[#3DDC97] text-[#002112]'
                  : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
              }`}
            >
              {lang === 'Yoruba' ? 'Yorùbá' : lang}
            </button>
          ))}
        </div>

        <div className="p-3.5 rounded-xl bg-[#11161C] border border-[#2A3541] text-sm text-[#dee3eb] leading-relaxed">
          {TRY_LOCAL_VOICES[sampleLang]}
        </div>
      </section>

      <FooterLine />
    </div>
  );
}

interface ExploreScreenProps {
  cards: RouteCard[];
  requests: CampusRequest[];
  currentUserHandle: string;
  onAddRequest: (question: string, tag: string) => void;
  onAnswerRequest: (req: CampusRequest) => void;
  onOpenCardDirections: (card: RouteCard) => void;
}

export function ExploreScreen({
  cards,
  requests,
  currentUserHandle,
  onAddRequest,
  onAnswerRequest,
  onOpenCardDirections,
}: ExploreScreenProps) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'All' | 'Top Rated' | 'Hostels' | 'Lecture Halls'
  >('All');
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newTag, setNewTag] = useState('Campus Footpath');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      cards.map(async (c) => {
        try {
          const res = await verifyCard(c.id);
          return [c.id, res.verified] as const;
        } catch {
          return [c.id, true] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setVerifiedMap(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cards]);

  const filteredCards = cards.filter((c) => {
    const matchesSearch =
      !query.trim() ||
      c.route.title.toLowerCase().includes(query.toLowerCase()) ||
      c.route.summaryNote.toLowerCase().includes(query.toLowerCase()) ||
      c.from.toLowerCase().includes(query.toLowerCase()) ||
      c.route.waypoints.some((w) =>
        w.name.toLowerCase().includes(query.toLowerCase())
      );

    if (!matchesSearch) return false;
    if (activeFilter === 'Top Rated') return (c.route.rating || 4.8) >= 4.8;
    if (activeFilter === 'Hostels') return c.route.category === 'Hostels';
    if (activeFilter === 'Lecture Halls')
      return c.route.category === 'Lecture Halls';
    return true;
  });

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    onAddRequest(newQuestion.trim(), newTag.trim() || 'Campus Transit');
    setNewQuestion('');
    setAskModalOpen(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-24 space-y-6">
      <div className="space-y-1.5">
        <div className="font-mono text-xs font-semibold text-[#3DDC97] tracking-wider">
          FUOYE MOBILITY NETWORK
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#F6F4EE]">
          Explore Campus Routes
        </h1>
        <p className="text-sm text-[#B9C2CC]">
          Find verified shortcuts shared by students or answer an unmapped path
          request.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-[#859489] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search destination, hostel, faculty, landmark..."
          className="w-full h-13 pl-11 pr-10 rounded-2xl bg-[#1A222B] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE] placeholder:text-[#859489]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#859489] hover:text-[#F6F4EE] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['All', 'Top Rated', 'Hostels', 'Lecture Halls'] as const).map(
          (tab) => {
            const active = activeFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`h-9 px-4 rounded-full font-mono text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#3DDC97]/15 border-[#3DDC97] text-[#3DDC97]'
                    : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC] hover:text-[#F6F4EE]'
                }`}
              >
                {tab === 'All'
                  ? `All (${cards.length})`
                  : tab === 'Top Rated'
                  ? 'Top Rated ★'
                  : tab}
              </button>
            );
          }
        )}
      </div>

      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="font-display font-bold text-base text-[#F6F4EE]">
            Need a path not mapped?
          </div>
          <p className="text-xs text-[#B9C2CC]">
            Post a route request to students currently on Oye or Ikole campus for
            instant footpath directions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAskModalOpen(true)}
          className="h-11 px-4 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ask Mates</span>
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-base text-[#F6F4EE]">
            Active Campus Requests
          </h2>
          <span className="font-mono text-xs text-[#3DDC97]">
            Peer Crowd-Routing
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex flex-col justify-between gap-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StudentAvatar
                      avatarId={req.avatarId}
                      handle={req.handle}
                      size={28}
                    />
                    <span className="font-mono text-xs font-semibold text-[#F6F4EE] truncate">
                      @{req.handle}
                    </span>
                    <span className="text-xs text-[#859489]">
                      · {formatRelativeTime(req.createdAt)}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#859489] shrink-0">
                    {req.routesOffered} offered
                  </span>
                </div>
                <p className="text-sm text-[#dee3eb] leading-snug">
                  “{req.question}”
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#2A3541]/60">
                <span className="text-xs text-[#B9C2CC]">{req.tag}</span>
                <button
                  type="button"
                  onClick={() => onAnswerRequest(req)}
                  className="h-9 px-3 rounded-xl bg-[#3DDC97]/15 hover:bg-[#3DDC97]/25 border border-[#3DDC97]/40 text-[#3DDC97] font-mono text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Answer with Route</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-lg text-[#F6F4EE]">
              Verified Route Cards
            </h2>
            <p className="text-xs text-[#B9C2CC]">
              Community-endorsed with SHA-256 cryptographic integrity
            </p>
          </div>
          <span className="font-mono text-xs text-[#859489] tabular-nums">
            {filteredCards.length} routes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCards.map((card) => {
            const geo = computeRouteGeometry(card.route.waypoints);
            const mins = estimateDurationMinutes(
              geo.totalMeters,
              card.route.mode
            );
            const isIntact = verifiedMap[card.id] !== false;

            return (
              <div
                key={card.id}
                className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex flex-col justify-between gap-3.5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#3DDC97]">
                      {mins} min {card.route.mode.toLowerCase()} ·{' '}
                      {geo.totalKmText}
                    </span>
                    <span className="text-[#B9C2CC] flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-[#FFB368] fill-[#FFB368]" />
                      {(card.route.rating || 4.9).toFixed(1)}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-lg text-[#F6F4EE]">
                    {card.route.title}
                  </h3>

                  <div
                    className={`px-3 py-2 rounded-xl border font-mono text-xs flex items-center justify-between ${
                      isIntact
                        ? 'bg-[#11161C] border-[#2A3541] text-[#3DDC97]'
                        : 'bg-[#93000a]/25 border-[#FF5A5F] text-[#ffb4ab]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isIntact ? (
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {isIntact
                        ? `Hash Intact: ${formatShortHash(card.hash)}`
                        : 'Tampered after send!'}
                    </span>
                    <span className="text-[10px] text-[#859489] shrink-0">
                      SHA-256
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#11161C] border border-[#2A3541]/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#B9C2CC]">
                      <Sparkles className="w-3 h-3 text-[#3DDC97]" />
                      <span>Gemma 4 Note ·</span>
                      <span className="text-[#3DDC97]">{card.language}</span>
                    </div>
                    <p className="text-xs italic text-[#dee3eb] leading-relaxed">
                      “{card.route.summaryNote || card.directions[0]}”
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs text-[#859489]">
                    <div className="flex items-center gap-2">
                      <StudentAvatar handle={card.from} size={24} />
                      <span className="font-mono text-[#B9C2CC]">
                        @{card.from}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums">
                      {card.route.usesCount || 12} uses
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenCardDirections(card)}
                    className="w-full h-12 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] text-[#002112] font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Footprints className="w-4 h-4" />
                    <span>Open Directions</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {askModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleCreateRequest}
            className="w-full sm:max-w-md bg-[#1A222B] border-t sm:border border-[#2A3541] rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="w-5 h-5 text-[#3DDC97]" />
                <h3 className="font-display font-bold text-base text-[#F6F4EE]">
                  Ask Mates for a Route
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAskModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#11161C] text-[#B9C2CC] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#B9C2CC]">
              Posting as{' '}
              <span className="font-mono text-[#3DDC97]">
                @{currentUserHandle}
              </span>
            </p>
            <div className="space-y-2">
              <label className="block text-xs font-mono text-[#B9C2CC]">
                Where are you trying to reach?
              </label>
              <textarea
                rows={3}
                required
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="e.g. Dry shortcut from Science Complex to Phase 2 Gate without crossing muddy field?"
                className="w-full p-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-mono text-[#B9C2CC]">
                Area / Tag
              </label>
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
              />
            </div>
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm cursor-pointer"
            >
              Post Campus Request
            </button>
          </form>
        </div>
      )}

      <FooterLine />
    </div>
  );
}
