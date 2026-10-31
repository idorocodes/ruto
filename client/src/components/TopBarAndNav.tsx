import React from 'react';
import {
  BellRing,
  ChevronLeft,
  Compass,
  Disc,
  FlaskConical,
  Home,
  Inbox,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { isConnectedMode } from '../api';
import { RouteCard, ScreenName, UserProfile } from '../types';
import { RutoLogoMark, StudentAvatar } from './Avatars';
import { formatShortHash } from '../utils/crypto';

interface TopAppBarProps {
  screen: ScreenName;
  currentUser: UserProfile;
  isReconnecting?: boolean;
  onRetryConnection?: () => void;
  onBack?: () => void;
  onGoHome: () => void;
  onOpenUserModal: () => void;
  onOpenDemoModal: () => void;
  hasTamperedCards: boolean;
}

export function TopAppBar({
  screen,
  currentUser,
  isReconnecting = false,
  onRetryConnection,
  onBack,
  onGoHome,
  onOpenUserModal,
  onOpenDemoModal,
  hasTamperedCards,
}: TopAppBarProps) {
  const isSubScreen =
    screen === 'directions' ||
    screen === 'send' ||
    screen === 'card-detail' ||
    screen === 'path-detail';

  const subTitle =
    screen === 'directions'
      ? 'Directions'
      : screen === 'send'
      ? 'Send'
      : screen === 'card-detail'
      ? 'Card Detail'
      : screen === 'path-detail'
      ? 'Campus Path'
      : 'Ruto';

  return (
    <header className="sticky top-0 z-40 h-14 bg-[#0f141a]/92 backdrop-blur-md border-b border-[#2A3541]/80 px-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {isSubScreen && onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="w-9 h-9 -ml-1.5 rounded-xl flex items-center justify-center text-[#F6F4EE] hover:bg-[#1A222B] active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2 min-w-0 cursor-pointer text-left"
        >
          <RutoLogoMark size={28} />
          <span className="font-display font-bold text-lg tracking-tight text-[#F6F4EE] truncate">
            {isSubScreen ? subTitle : 'Ruto'}
          </span>
        </button>

        {!isSubScreen && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A222B]/90 border border-[#2A3541] font-mono text-[11px] font-semibold text-[#B9C2CC] shrink-0">
            <Sparkles className="w-3 h-3 text-[#3DDC97]" />
            <span>Powered by Gemma</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isReconnecting && (
          <button
            type="button"
            onClick={onRetryConnection}
            title="Reconnecting to inbox — tap to retry now"
            className="h-9 px-2.5 rounded-xl bg-[#FFB368]/15 border border-[#FFB368]/50 text-[#FFB368] font-mono text-[11px] flex items-center gap-1.5 cursor-pointer"
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reconnecting…</span>
            <RefreshCw className="w-3 h-3" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenDemoModal}
          title="Demo Menu: Mode Status, Simulate Tampering & Switch User"
          className={`h-9 px-2.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            hasTamperedCards
              ? 'bg-[#93000a]/40 border-[#FF5A5F] text-[#ffb4ab]'
              : 'bg-[#1A222B] border-[#2A3541] hover:border-[#3DDC97] text-[#B9C2CC]'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-[#3DDC97]" />
          <span className="hidden sm:inline">Demo</span>
        </button>

        <button
          type="button"
          onClick={onOpenUserModal}
          title={`Signed in as @${currentUser.handle} — tap to switch user`}
          className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-[#1A222B] border border-[#2A3541] hover:border-[#3DDC97] transition-colors cursor-pointer"
        >
          <StudentAvatar
            avatarId={currentUser.avatarId}
            handle={currentUser.handle}
            size={28}
            showOnline
          />
          <span className="font-mono text-xs text-[#F6F4EE] max-w-[92px] truncate">
            @{currentUser.handle}
          </span>
        </button>
      </div>
    </header>
  );
}

export function IncomingCardToast({
  toast,
  onOpenCard,
  onDismiss,
}: {
  toast: { id: string; from: string; title: string } | null;
  onOpenCard: (cardId: string) => void;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="p-3.5 rounded-2xl bg-[#1A222B] border border-[#3DDC97] shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#3DDC97]/20 text-[#3DDC97] flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-[#F6F4EE] truncate">
              New route from @{toast.from}
            </div>
            <div className="text-xs text-[#B9C2CC] truncate">{toast.title}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenCard(toast.id)}
            className="h-8 px-3 rounded-lg bg-[#3DDC97] text-[#002112] font-display font-bold text-xs cursor-pointer"
          >
            View
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="w-8 h-8 rounded-lg bg-[#11161C] text-[#859489] hover:text-[#F6F4EE] flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface BottomTabBarProps {
  screen: ScreenName;
  badgeCount: number;
  onNavigate: (target: ScreenName) => void;
}

export function BottomTabBar({
  screen,
  badgeCount,
  onNavigate,
}: BottomTabBarProps) {
  const tabs: Array<{
    id: ScreenName;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'record', label: 'Record', icon: Disc },
    { id: 'draw', label: 'Draw', icon: Route },
    { id: 'inbox', label: 'Inbox', icon: Inbox, badge: badgeCount },
    { id: 'profile', label: 'Profile', icon: UserCheck },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0f141a]/95 backdrop-blur-md border-t border-[#2A3541]"
    >
      <div className="max-w-5xl mx-auto grid grid-cols-6 h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            screen === tab.id ||
            (tab.id === 'home' && screen === 'path-detail') ||
            (tab.id === 'draw' && (screen === 'directions' || screen === 'send')) ||
            (tab.id === 'inbox' && screen === 'card-detail');

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors cursor-pointer ${
                active ? 'text-[#3DDC97]' : 'text-[#859489] hover:text-[#F6F4EE]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#3DDC97] text-[#002112] font-mono text-[10px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] sm:text-[11px] font-medium tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function FooterLine() {
  return (
    <footer className="py-6 px-4 text-center border-t border-[#2A3541]/50 mt-6">
      <p className="font-mono text-xs text-[#859489]">
        Open source. Built with Gemma 4.
      </p>
    </footer>
  );
}

interface DemoMenuModalProps {
  open: boolean;
  onClose: () => void;
  users: UserProfile[];
  currentUser: UserProfile;
  onSwitchUser: (handle: string) => void;
  onGoCreateUser: () => void;
  cards: RouteCard[];
  onToggleTamperCard: (cardId: string) => void;
  onSimulateIncomingCard: () => void;
  onInspectCard: (cardId: string) => void;
}

export function DemoMenuModal({
  open,
  onClose,
  users,
  currentUser,
  onSwitchUser,
  onGoCreateUser,
  cards,
  onToggleTamperCard,
  onSimulateIncomingCard,
  onInspectCard,
}: DemoMenuModalProps) {
  if (!open) return null;

  const connected = isConnectedMode();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-[#1A222B] border-t sm:border border-[#2A3541] rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#2A3541] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <FlaskConical className="w-5 h-5 text-[#3DDC97] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-bold text-base text-[#F6F4EE]">
                  Stage Demo Controls
                </h2>
                {/* Required mode label: "mock mode" when API_BASE_URL is empty, "connected" when set */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border ${
                    connected
                      ? 'bg-[#3DDC97]/15 border-[#3DDC97]/50 text-[#3DDC97]'
                      : 'bg-[#11161C] border-[#2A3541] text-[#FFB368]'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  <span>{connected ? 'connected' : 'mock mode'}</span>
                </span>
              </div>
              <p className="text-xs text-[#B9C2CC] mt-0.5">
                Switch handles, test 5s inbox polling, or simulate route tampering
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo menu"
            className="w-9 h-9 rounded-xl bg-[#11161C] border border-[#2A3541] flex items-center justify-center text-[#B9C2CC] hover:text-[#F6F4EE] shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Quick Switch User Section */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]">
                Quick Switch Handle
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoCreateUser();
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#3DDC97] hover:underline cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New handle</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {users.map((u) => {
                const isActive = u.handle === currentUser.handle;
                return (
                  <button
                    key={u.handle}
                    type="button"
                    onClick={() => onSwitchUser(u.handle)}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#3DDC97]/15 border-[#3DDC97] text-[#F6F4EE]'
                        : 'bg-[#11161C] border-[#2A3541] hover:border-[#859489] text-[#B9C2CC]'
                    }`}
                  >
                    <StudentAvatar avatarId={u.avatarId} handle={u.handle} size={32} />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-[#F6F4EE] truncate">
                        @{u.handle}
                      </div>
                      <div className="text-[11px] text-[#859489] truncate">
                        {isActive ? 'Active now' : u.displayName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulate Incoming Card for 5s Poller Toast Demo */}
          {!connected && (
            <div className="p-3.5 rounded-xl bg-[#11161C] border border-[#2A3541] flex items-center justify-between gap-3">
              <div>
                <div className="font-display font-semibold text-xs text-[#F6F4EE]">
                  Test 5-Second Inbox Polling Toast
                </div>
                <p className="text-[11px] text-[#859489] mt-0.5">
                  Drops a new route card to @{currentUser.handle} so the next poll triggers a toast &amp; badge.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSimulateIncomingCard();
                  onClose();
                }}
                className="h-9 px-3 rounded-lg bg-[#3DDC97]/15 hover:bg-[#3DDC97]/25 border border-[#3DDC97]/50 text-[#3DDC97] font-mono text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Demo Card</span>
              </button>
            </div>
          )}

          {/* Simulate Tampering Section */}
          <div>
            <div className="mb-2.5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#B9C2CC]">
                Simulate Route Tampering
              </span>
              <p className="text-xs text-[#859489] mt-0.5">
                Edits a stored route without updating its SHA-256 hash so verifyCard
                flags it red and disables Accept.
              </p>
            </div>

            <div className="space-y-2.5">
              {cards.map((c) => {
                const isTampered = Boolean(c._untamperedBackup);
                return (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border ${
                      isTampered
                        ? 'bg-[#93000a]/20 border-[#FF5A5F]/70'
                        : 'bg-[#11161C] border-[#2A3541]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display font-semibold text-sm text-[#F6F4EE] truncate">
                          {c.route.title}
                        </div>
                        <div className="font-mono text-[11px] text-[#859489] mt-0.5">
                          @{c.from} → @{c.to} · Hash {formatShortHash(c.hash)}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md shrink-0 ${
                          isTampered
                            ? 'bg-[#FF5A5F]/20 text-[#ffb4ab]'
                            : 'bg-[#3DDC97]/15 text-[#3DDC97]'
                        }`}
                      >
                        {isTampered ? (
                          <>
                            <ShieldAlert className="w-3 h-3" /> Tampered
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3" /> Intact
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        disabled={connected}
                        onClick={() => onToggleTamperCard(c.id)}
                        className={`flex-1 h-9 px-3 rounded-lg font-mono text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
                          isTampered
                            ? 'bg-[#1A222B] border-[#3DDC97] text-[#3DDC97] hover:bg-[#3DDC97]/10'
                            : 'bg-[#1A222B] border-[#FF5A5F] text-[#FF5A5F] hover:bg-[#FF5A5F]/10'
                        }`}
                      >
                        {isTampered ? 'Restore Original Route' : 'Simulate Tampering'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onInspectCard(c.id);
                        }}
                        className="h-9 px-3 rounded-lg bg-[#252a31] hover:bg-[#30353c] text-xs font-medium text-[#F6F4EE] cursor-pointer"
                      >
                        Open Card
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
