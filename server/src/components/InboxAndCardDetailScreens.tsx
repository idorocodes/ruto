import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Eye,
  Footprints,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  getCard,
  isConnectedMode,
  normalizeApiError,
  respondCard,
  verifyCard,
} from '../api';
import {
  ApiErrorShape,
  CardStatus,
  InboxItem,
  RouteCard,
  RouteData,
  RutoLanguage,
  UserProfile,
  VerifyCardResult,
} from '../types';
import { useLiveNavigation } from '../hooks/useLiveNavigation';
import { LiveNavigationBar } from './LiveNavigationBar';
import { StudentAvatar } from './Avatars';
import { RouteMap } from './RouteMap';
import { FooterLine } from './TopBarAndNav';
import { formatShortHash } from '../utils/crypto';
import {
  computeRouteGeometry,
  estimateDurationMinutes,
  formatRelativeTime,
  haversineMeters,
} from '../utils/geo';

interface InboxScreenProps {
  currentUser: UserProfile;
  users: UserProfile[];
  inboxItems: InboxItem[];
  allCards: RouteCard[];
  loadingInbox: boolean;
  inboxError: ApiErrorShape | null;
  onRefreshInbox: () => void;
  onInspectCard: (cardId: string) => void;
  onCardResponded: () => void;
  onOpenSwitchUser: () => void;
}

function formatStatusLabel(status: CardStatus): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  return 'Pending';
}

export function InboxScreen({
  currentUser,
  users,
  inboxItems,
  allCards,
  loadingInbox,
  inboxError,
  onRefreshInbox,
  onInspectCard,
  onCardResponded,
  onOpenSwitchUser,
}: InboxScreenProps) {
  const [filter, setFilter] = useState<'all' | CardStatus | 'sent'>('all');
  const [respondingCardId, setRespondingCardId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    cardId: string;
    err: ApiErrorShape;
  } | null>(null);

  const sentCards = allCards.filter(
    (c) => c.from.toLowerCase() === currentUser.handle.toLowerCase()
  );

  const pendingCount = inboxItems.filter((c) => c.status === 'pending').length;
  const acceptedCount = inboxItems.filter((c) => c.status === 'accepted').length;
  const declinedCount = inboxItems.filter((c) => c.status === 'declined').length;

  const displayedInbox =
    filter === 'all'
      ? inboxItems
      : filter === 'sent'
      ? []
      : inboxItems.filter((item) => item.status === filter);

  const handleQuickAccept = async (cardId: string) => {
    setRespondingCardId(cardId);
    setActionError(null);
    try {
      // Verify first before accepting
      const check = await verifyCard(cardId);
      if (!check.verified) {
        setActionError({
          cardId,
          err: {
            error: 'not_verified',
            message:
              'Verification failed — this route was changed after it was sent and cannot be accepted.',
          },
        });
        onRefreshInbox();
        return;
      }
      await respondCard(cardId, true);
      onCardResponded();
    } catch (err: unknown) {
      setActionError({ cardId, err: normalizeApiError(err) });
    } finally {
      setRespondingCardId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#F6F4EE]">
            Route Cards Inbox
          </h1>
          <p className="text-sm text-[#B9C2CC] mt-0.5">
            Live 5s inbox sync, verified SHA-256 hops &amp; navigation for{' '}
            <span className="font-mono text-[#3DDC97]">
              @{currentUser.handle}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefreshInbox}
            disabled={loadingInbox}
            title="Refresh inbox now"
            className="w-9 h-9 rounded-xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] flex items-center justify-center text-[#B9C2CC] hover:text-[#3DDC97] cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingInbox ? 'animate-spin text-[#3DDC97]' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={onOpenSwitchUser}
            className="px-3 py-2 rounded-xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] font-mono text-xs text-[#F6F4EE] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#3DDC97]" />
            <span>Switch user</span>
          </button>
        </div>
      </div>

      {inboxError && (
        <div className="p-3.5 rounded-2xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
            <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-mono uppercase text-[10px] text-[#ffb4ab] block">
                {inboxError.error}
              </span>
              <span>{inboxError.message}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshInbox}
            className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            { id: 'all', label: 'All', count: inboxItems.length },
            { id: 'pending', label: 'Pending', count: pendingCount },
            { id: 'accepted', label: 'Accepted', count: acceptedCount },
            { id: 'declined', label: 'Declined', count: declinedCount },
            { id: 'sent', label: 'Sent by me', count: sentCards.length },
          ] as const
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`h-9 px-3.5 rounded-full font-mono text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#3DDC97]/15 border-[#3DDC97] text-[#3DDC97]'
                  : 'bg-[#1A222B] border-[#2A3541] text-[#B9C2CC] hover:text-[#F6F4EE]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                  active
                    ? 'bg-[#3DDC97] text-[#002112] font-bold'
                    : 'bg-[#252a31] text-[#B9C2CC]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loading State on First Fetch */}
      {loadingInbox && inboxItems.length === 0 ? (
        <div className="p-10 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="w-7 h-7 text-[#3DDC97] animate-spin" />
          <p className="font-display font-semibold text-sm text-[#F6F4EE]">
            Loading @{currentUser.handle}&apos;s inbox...
          </p>
        </div>
      ) : filter === 'sent' ? (
        sentCards.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#1A222B] border border-[#2A3541] text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#3DDC97] mx-auto" />
            <h2 className="font-display font-semibold text-base text-[#F6F4EE]">
              No cards sent by @{currentUser.handle} yet
            </h2>
            <p className="text-xs text-[#B9C2CC] max-w-sm mx-auto">
              Draw a campus route or record a path and send it as a signed card.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {sentCards.map((card) => {
              const geo = computeRouteGeometry(card.route.waypoints);
              const mins = estimateDurationMinutes(
                geo.totalMeters,
                card.route.mode
              );
              const recipientProfile = users.find((u) => u.handle === card.to);

              return (
                <div
                  key={card.id}
                  className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <StudentAvatar
                        avatarId={recipientProfile?.avatarId}
                        handle={card.to}
                        size={38}
                      />
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold text-[#F6F4EE] truncate">
                          To @{card.to}
                        </div>
                        <div className="font-mono text-xs text-[#859489]">
                          {formatRelativeTime(card.createdAt)} · {card.language}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full border border-[#2A3541] bg-[#11161C] font-mono text-xs text-[#3DDC97]">
                      {formatStatusLabel(card.status)}
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display font-bold text-lg text-[#F6F4EE]">
                      {card.route.title}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-[#B9C2CC] mt-1 tabular-nums">
                      <Footprints className="w-3.5 h-3.5 text-[#3DDC97]" />
                      <span>
                        {geo.totalKmText} · {mins} mins{' '}
                        {card.route.mode.toLowerCase()}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectCard(card.id)}
                    className="w-full h-11 rounded-xl bg-[#252a31] hover:bg-[#30353c] border border-[#2A3541] text-[#F6F4EE] font-display font-semibold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-[#B9C2CC]" />
                    <span>Inspect Sent Card</span>
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : displayedInbox.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#1A222B] border border-[#2A3541] text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-[#3DDC97] mx-auto" />
          <h2 className="font-display font-semibold text-base text-[#F6F4EE]">
            No route cards in this view
          </h2>
          <p className="text-xs text-[#B9C2CC] max-w-sm mx-auto">
            Draw a campus route and send it to @{currentUser.handle}, or tap
            &ldquo;Switch user&rdquo; above to check another handle&apos;s inbox.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayedInbox.map((item) => {
            const fullCard = allCards.find((c) => c.id === item.id);
            const geo = fullCard
              ? computeRouteGeometry(fullCard.route.waypoints)
              : null;
            const mins =
              fullCard && geo
                ? estimateDurationMinutes(geo.totalMeters, fullCard.route.mode)
                : null;
            const senderProfile = users.find((u) => u.handle === item.from);
            const isValid = item.verified !== false;
            const isBusy = respondingCardId === item.id;
            const rowErr =
              actionError?.cardId === item.id ? actionError.err : null;

            const statusBadgeStyles =
              item.status === 'accepted'
                ? 'bg-[#3DDC97]/15 border-[#3DDC97]/40 text-[#3DDC97]'
                : item.status === 'declined'
                ? 'bg-[#252a31] border-[#2A3541] text-[#859489]'
                : 'bg-[#3DDC97]/15 border-[#3DDC97]/40 text-[#61f9b1]';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl bg-[#1A222B] border transition-colors space-y-3.5 ${
                  !isValid
                    ? 'border-[#FF5A5F]/80'
                    : item.status === 'pending'
                    ? 'border-[#3DDC97]/40'
                    : 'border-[#2A3541]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StudentAvatar
                      avatarId={senderProfile?.avatarId}
                      handle={item.from}
                      size={38}
                      showOnline={item.status === 'pending'}
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-[#F6F4EE] truncate">
                        @{item.from}
                      </div>
                      <div className="font-mono text-xs text-[#859489]">
                        {formatRelativeTime(item.createdAt)}
                        {fullCard ? ` · ${fullCard.language}` : ''}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full border font-mono text-xs font-semibold shrink-0 ${statusBadgeStyles}`}
                  >
                    {formatStatusLabel(item.status)}
                  </span>
                </div>

                <div>
                  <h2
                    className={`font-display font-bold text-lg ${
                      item.status === 'declined'
                        ? 'line-through text-[#859489]'
                        : 'text-[#F6F4EE]'
                    }`}
                  >
                    {item.title}
                  </h2>
                  {fullCard && geo && mins !== null && (
                    <div className="flex items-center gap-2 text-xs text-[#B9C2CC] mt-1 tabular-nums">
                      <Footprints className="w-3.5 h-3.5 text-[#3DDC97]" />
                      <span>
                        {geo.totalKmText} · {mins} mins{' '}
                        {fullCard.route.mode.toLowerCase()}
                      </span>
                      <span className="text-[#859489]">·</span>
                      <span className="text-[#FFB368]">
                        {fullCard.route.waypoints.length} pins
                      </span>
                    </div>
                  )}
                </div>

                {/* Integrity Preview Row */}
                <div
                  className={`px-3.5 py-2.5 rounded-xl border font-mono text-xs flex items-center justify-between gap-2 ${
                    isValid
                      ? 'bg-[#0f141a] border-[#2A3541] text-[#F6F4EE]'
                      : 'bg-[#93000a]/30 border-[#FF5A5F] text-[#ffdad6]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {isValid ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-[#3DDC97] shrink-0" />
                        <span>
                          ✓{' '}
                          {fullCard
                            ? `Hash: ${formatShortHash(fullCard.hash)} (Intact)`
                            : `Card #${item.id} · Verified`}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-[#FF5A5F] shrink-0" />
                        <span>Changed after it was sent!</span>
                      </>
                    )}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#1A222B] text-[10px] text-[#B9C2CC] shrink-0">
                    {isValid ? 'VERIFIED' : 'MISMATCH'}
                  </span>
                </div>

                {rowErr && (
                  <div className="p-3 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-2 text-xs text-[#ffdad6]">
                    <span>{rowErr.message}</span>
                    {rowErr.error === 'network_error' && (
                      <button
                        type="button"
                        onClick={() => handleQuickAccept(item.id)}
                        className="px-2.5 py-1 rounded bg-[#FF5A5F] text-[#0f141a] font-mono font-bold text-[11px] shrink-0 cursor-pointer"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onInspectCard(item.id)}
                    className="h-11 rounded-xl bg-[#252a31] hover:bg-[#30353c] border border-[#2A3541] text-[#F6F4EE] font-display font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-[#B9C2CC]" />
                    <span>View Route</span>
                  </button>

                  {item.status === 'pending' ? (
                    <button
                      type="button"
                      disabled={!isValid || isBusy}
                      onClick={() => handleQuickAccept(item.id)}
                      className="h-11 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:bg-[#252a31] disabled:text-[#859489] disabled:border disabled:border-[#2A3541] disabled:cursor-not-allowed text-[#002112] font-display font-bold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Accepting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isValid ? 'Accept' : 'Blocked'}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInspectCard(item.id)}
                      className="h-11 rounded-xl bg-[#11161C] hover:bg-[#252a31] border border-[#2A3541] text-[#3DDC97] font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Navigate &amp; Verify →</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FooterLine />
    </div>
  );
}

interface CardDetailScreenProps {
  cardId: string;
  users: UserProfile[];
  tamperVersion: number;
  onToggleTamper: (cardId: string) => void;
  onCardUpdated: () => void;
}

export function CardDetailScreen({
  cardId,
  users,
  tamperVersion,
  onToggleTamper,
  onCardUpdated,
}: CardDetailScreenProps) {
  const [card, setCard] = useState<{
    id: string;
    from: string;
    to: string;
    route: RouteData;
    directions: string[];
    language: RutoLanguage;
    status: CardStatus;
    hash: string;
    txSignature: string;
    createdAt: number;
    isSimulatedTamper?: boolean;
  } | null>(null);

  const [verifyResult, setVerifyResult] = useState<VerifyCardResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiErrorShape | null>(null);

  const [responding, setResponding] = useState(false);
  const [respondError, setRespondError] = useState<ApiErrorShape | null>(null);
  const [lastRespondAttempt, setLastRespondAttempt] = useState<boolean | null>(
    null
  );
  const [showCanonical, setShowCanonical] = useState(false);

  const connected = isConnectedMode();

  // Rule: Card detail screen ALWAYS calls getCard AND verifyCard before enabling Accept
  const loadAndVerify = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setVerifyResult(null);
    try {
      const [fetchedCard, verification] = await Promise.all([
        getCard(cardId),
        verifyCard(cardId),
      ]);
      setCard(fetchedCard);
      setVerifyResult(verification);
    } catch (err: unknown) {
      setLoadError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [cardId, tamperVersion]);

  useEffect(() => {
    loadAndVerify();
  }, [loadAndVerify]);

  const nav = useLiveNavigation(card?.route.waypoints || []);

  const handleRespond = async (accept: boolean) => {
    if (!card) return;
    setResponding(true);
    setRespondError(null);
    setLastRespondAttempt(accept);

    try {
      const res = await respondCard(card.id, accept);
      setCard((prev) =>
        prev
          ? { ...prev, status: res.status, txSignature: res.txSignature }
          : prev
      );
      onCardUpdated();
    } catch (err: unknown) {
      setRespondError(normalizeApiError(err));
    } finally {
      setResponding(false);
    }
  };

  if (loading && !card) {
    return (
      <div className="max-w-4xl mx-auto px-4 pt-12 pb-24 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-[#3DDC97] animate-spin" />
        <p className="font-display font-semibold text-base text-[#F6F4EE]">
          Fetching route card &amp; running SHA-256 verification...
        </p>
      </div>
    );
  }

  if (loadError && !card) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-10 pb-24">
        <div className="p-5 rounded-2xl bg-[#1A222B] border border-[#FF5A5F] space-y-3 text-center">
          <AlertCircle className="w-8 h-8 text-[#FF5A5F] mx-auto" />
          <h2 className="font-display font-bold text-lg text-[#F6F4EE]">
            Could not open route card
          </h2>
          <p className="text-xs text-[#B9C2CC]">{loadError.message}</p>
          <button
            type="button"
            onClick={loadAndVerify}
            className="h-11 px-5 rounded-xl bg-[#3DDC97] text-[#002112] font-display font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const isVerified = verifyResult ? verifyResult.verified : false;
  const isCheckingVerify = loading || verifyResult === null;
  const isSimulatedTamper = Boolean(card.isSimulatedTamper);
  const geo = computeRouteGeometry(card.route.waypoints);
  const mins = estimateDurationMinutes(geo.totalMeters, card.route.mode);
  const senderProfile = users.find((u) => u.handle === card.from);

  // Accept is strictly disabled until verifyCard finishes with verified === true and status === 'pending'
  const canAccept =
    !isCheckingVerify &&
    isVerified &&
    card.status === 'pending' &&
    !responding;
  const canDecline = card.status === 'pending' && !responding;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-28 space-y-4">
      {/* Stage Demo Toggle Bar (Mock mode only) */}
      {!connected && (
        <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1A222B] border border-[#2A3541]">
          <button
            type="button"
            onClick={() => {
              if (isSimulatedTamper) onToggleTamper(card.id);
            }}
            className={`h-10 rounded-xl font-display font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isVerified && !isCheckingVerify
                ? 'bg-[#3DDC97] text-[#002112]'
                : 'text-[#B9C2CC] hover:text-[#F6F4EE]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Intact</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isSimulatedTamper) onToggleTamper(card.id);
            }}
            className={`h-10 rounded-xl font-display font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              !isCheckingVerify && !isVerified
                ? 'bg-[#FF5A5F] text-[#0f141a]'
                : 'text-[#B9C2CC] hover:text-[#FF5A5F]'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Simulate Tampering</span>
          </button>
        </div>
      )}

      {/* Card Title Header */}
      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-2">
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#3DDC97]/15 text-[#3DDC97] font-semibold">
              #{card.id}
            </span>
            <span className="text-[#B9C2CC]">
              Status: {formatStatusLabel(card.status)}
            </span>
          </div>
          <span className="text-[#B9C2CC] tabular-nums">
            {geo.totalKmText} · {mins} min
          </span>
        </div>

        <h1 className="font-display font-bold text-2xl text-[#F6F4EE]">
          {card.route.title}
        </h1>

        {card.route.personalNote && (
          <p className="text-xs italic text-[#B9C2CC]">
            Note from @{card.from}: “{card.route.personalNote}”
          </p>
        )}
      </div>

      {/* Live Location & Distance Navigation HUD ("Start navigating") + Hands-Free Voice */}
      <LiveNavigationBar
        nav={nav}
        waypoints={card.route.waypoints}
        directions={card.directions}
        language={card.language}
      />

      {/* Leaflet Route Map with Live Blue "You are here" Dot */}
      <div className="relative rounded-2xl overflow-hidden border border-[#2A3541]">
        <RouteMap
          waypoints={card.route.waypoints}
          interactive={false}
          isTampered={!isCheckingVerify && !isVerified}
          theme="mint"
          heightClass="h-[240px] sm:h-[290px]"
          liveUserPos={nav.userPos}
          activeStepIndex={nav.isNavigating ? nav.activeStepIndex : null}
          arrived={nav.arrived}
          allowManualPositionTap={nav.isNavigating && nav.permissionFallback}
          onManualPositionTap={nav.setManualUserPosition}
        />

        {card.route.waypoints[0] && !nav.isNavigating && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[400] p-3 rounded-xl bg-[#1A222B]/95 backdrop-blur-md border border-[#2A3541] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-3 h-3 rounded-full shrink-0 ${
                  isVerified ? 'bg-[#3DDC97]' : 'bg-[#FF5A5F]'
                }`}
              />
              <div className="min-w-0">
                <div className="font-display font-semibold text-xs text-[#F6F4EE] truncate">
                  {card.route.waypoints[0].name}
                </div>
                <div className="font-mono text-[11px] text-[#B9C2CC]">
                  Waypoint 1 of {card.route.waypoints.length} · Departure
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold shrink-0 ${
                isVerified
                  ? 'bg-[#3DDC97]/15 text-[#3DDC97]'
                  : 'bg-[#FF5A5F]/20 text-[#ffb4ab]'
              }`}
            >
              {isCheckingVerify
                ? 'CHECKING'
                : isVerified
                ? 'GPS LOCK'
                : 'ALTERED'}
            </span>
          </div>
        )}
      </div>

      {/* CRYPTOGRAPHIC VERIFICATION BANNER (Always from verifyCard) */}
      {isCheckingVerify ? (
        <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[#3DDC97] animate-spin shrink-0" />
          <div className="text-xs text-[#B9C2CC]">
            Running <span className="font-mono text-[#F6F4EE]">verifyCard</span>{' '}
            hash check before enabling Accept...
          </div>
        </div>
      ) : isVerified && verifyResult ? (
        <div className="p-4 rounded-2xl bg-[#0b291c] border border-[#3DDC97]/60 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#3DDC97]/20 text-[#3DDC97] flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-[#61f9b1]">
                Verified ({formatShortHash(verifyResult.onChainHash)}): this
                route hasn’t changed since it was sent
              </h2>
              <p className="text-xs text-[#bbcabe] mt-0.5 leading-relaxed">
                Recomputed SHA-256 signature matches @{card.from}’s original
                waypoints, 6-decimal coordinates, and notes.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#071810] border border-[#3DDC97]/25 font-mono text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#859489]">
                SHORT HASH: {formatShortHash(verifyResult.onChainHash)}
              </span>
              <span className="text-[#3DDC97] font-semibold">PASS: VALID</span>
            </div>
            <div className="text-[#F6F4EE] break-all text-[11px]">
              {verifyResult.onChainHash}
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px] text-[#859489]">
              <span>
                Signed by <strong className="text-[#3DDC97]">@{card.from}</strong>{' '}
                → @{card.to}
              </span>
              {verifyResult.canonicalJson && (
                <button
                  type="button"
                  onClick={() => setShowCanonical((s) => !s)}
                  className="inline-flex items-center gap-1 text-[#3DDC97] hover:underline cursor-pointer"
                >
                  <Code2 className="w-3 h-3" />
                  <span>{showCanonical ? 'Hide JSON' : 'Canonical JSON'}</span>
                </button>
              )}
            </div>
          </div>

          {showCanonical && verifyResult.canonicalJson && (
            <pre className="p-3 rounded-xl bg-[#071810] border border-[#2A3541] font-mono text-[10px] text-[#B9C2CC] overflow-x-auto">
              {JSON.stringify(JSON.parse(verifyResult.canonicalJson), null, 2)}
            </pre>
          )}
        </div>
      ) : (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-[#3b0d11] border-2 border-[#FF5A5F] space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#FF5A5F]/20 text-[#FF5A5F] flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-[#ffb4ab]">
                Warning: this route was changed after it was sent
              </h2>
              <p className="text-xs text-[#ffdad6] mt-0.5 leading-relaxed">
                Stored waypoints or notes no longer match the SHA-256 hash
                created when @{card.from} sent this card. Accepting is disabled
                for your safety.
              </p>
            </div>
          </div>

          {verifyResult && (
            <div className="p-3 rounded-xl bg-[#1f0608] border border-[#FF5A5F]/40 font-mono text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[#ffb4ab]">SHA-256 CHECK</span>
                <span className="text-[#FF5A5F] font-bold">FAIL: MISMATCH</span>
              </div>
              <div className="text-[#B9C2CC] break-all">
                <span className="text-[#859489]">On-Chain: </span>
                {verifyResult.onChainHash}
              </div>
              <div className="text-[#ffb4ab] break-all">
                <span className="text-[#FF5A5F]">Local: </span>
                {verifyResult.localHash}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Respond API Error Banner (e.g. 409 already_resolved / not_verified / network_error) */}
      {respondError && (
        <div className="p-3.5 rounded-2xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
            <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-mono uppercase text-[10px] text-[#ffb4ab] block">
                {respondError.error}
              </span>
              <span>{respondError.message}</span>
            </div>
          </div>

          {respondError.error === 'network_error' &&
            lastRespondAttempt !== null && (
              <button
                type="button"
                onClick={() => handleRespond(lastRespondAttempt)}
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
        </div>
      )}

      {/* AI Navigation Notes with Live Step Highlight */}
      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#3DDC97]" />
            <h2 className="font-display font-bold text-base text-[#F6F4EE]">
              AI Navigation Notes ({card.language})
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#11161C] border border-[#2A3541] font-mono text-[11px] text-[#3DDC97]">
            Gemma 4
          </span>
        </div>

        <div className="space-y-2.5">
          {card.route.waypoints.map((wp, idx) => {
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

            return (
              <div
                key={wp.id}
                className={`p-3.5 rounded-xl border space-y-1.5 transition-all ${
                  isCurrentStep
                    ? 'bg-[#3DDC97]/12 border-[#3DDC97] ring-1 ring-[#3DDC97]/40'
                    : isStepDone
                    ? 'bg-[#11161C]/60 border-[#2A3541] opacity-75'
                    : 'bg-[#11161C] border-[#2A3541]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                        isStepDone || isCurrentStep
                          ? 'bg-[#3DDC97] text-[#002112]'
                          : 'bg-[#3DDC97]/15 text-[#3DDC97]'
                      }`}
                    >
                      {isStepDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                    </span>
                    <h3 className="font-display font-semibold text-sm text-[#F6F4EE] truncate">
                      {wp.name}
                    </h3>
                  </div>

                  {isCurrentStep && (
                    <span className="font-mono text-[10px] font-semibold text-[#3DDC97] shrink-0">
                      NEXT{liveDistToThis !== null ? ` · ${liveDistToThis}m` : ''}
                    </span>
                  )}
                </div>

                {card.directions[idx] && (
                  <p className="text-xs italic text-[#3DDC97] leading-relaxed pl-8">
                    “{card.directions[idx]}”
                  </p>
                )}
                {wp.note && (
                  <p className="text-xs text-[#B9C2CC] pl-8">{wp.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sender Info Card */}
      <div className="p-4 rounded-2xl bg-[#1A222B] border border-[#2A3541] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StudentAvatar
            avatarId={senderProfile?.avatarId}
            handle={card.from}
            size={44}
          />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-[#F6F4EE] truncate">
              {senderProfile?.displayName || `@${card.from}`}
            </div>
            <div className="text-xs text-[#B9C2CC] truncate">
              @{card.from} · {senderProfile?.subtitle || 'Campus Student'}
            </div>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-lg bg-[#3DDC97]/15 font-mono text-[11px] font-semibold text-[#3DDC97] shrink-0">
          PEER CARD
        </span>
      </div>

      {/* Sticky Action Bar: Decline / Accept Route */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-gradient-to-t from-[#0f141a] via-[#0f141a]/95 to-transparent px-4 py-3">
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!canDecline}
            onClick={() => handleRespond(false)}
            className={`h-13 rounded-2xl border font-display font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
              card.status === 'declined'
                ? 'bg-[#FF5A5F]/20 border-[#FF5A5F] text-[#ffb4ab]'
                : 'bg-[#1A222B] border-[#2A3541] hover:border-[#FF5A5F] text-[#F6F4EE]'
            }`}
          >
            {responding && lastRespondAttempt === false ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Declining...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>
                  {card.status === 'declined' ? 'Declined' : 'Decline'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!canAccept}
            onClick={() => handleRespond(true)}
            className="h-13 rounded-2xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:bg-[#252a31] disabled:text-[#859489] disabled:border disabled:border-[#2A3541] disabled:cursor-not-allowed text-[#002112] font-display font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer"
          >
            {responding && lastRespondAttempt === true ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Accepting...</span>
              </>
            ) : card.status === 'accepted' ? (
              <>
                <Check className="w-4 h-4" />
                <span>Accepted ✓</span>
              </>
            ) : isCheckingVerify ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : isVerified ? (
              <>
                <Check className="w-4 h-4" />
                <span>Accept Route</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>Accept Disabled</span>
              </>
            )}
          </button>
        </div>
      </div>

      <FooterLine />
    </div>
  );
}
