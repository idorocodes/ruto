import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  FlaskConical,
  Loader2,
  RefreshCw,
  RotateCcw,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { createProfile, normalizeApiError } from '../api';
import { ApiErrorShape, UserProfile } from '../types';
import { AVATAR_OPTIONS, StudentAvatar } from './Avatars';
import { FooterLine } from './TopBarAndNav';
import { validateHandle } from '../utils/seedData';

interface ProfileScreenProps {
  currentUser: UserProfile;
  users: UserProfile[];
  onSwitchUser: (handle: string) => void;
  onProfileCreated: (handle: string) => void;
  onUpdateAvatar: (avatarId: string) => void;
  onOpenDemoMenu: () => void;
  onResetDemoData: () => void;
}

export function ProfileScreen({
  currentUser,
  users,
  onSwitchUser,
  onProfileCreated,
  onUpdateAvatar,
  onOpenDemoMenu,
  onResetDemoData,
}: ProfileScreenProps) {
  const [newHandle, setNewHandle] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('FUOYE Student');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0].id);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiErrorShape | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const validation = validateHandle(newHandle);

  const submitCreateProfile = async () => {
    if (!validation.valid) return;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await createProfile({
        handle: validation.normalized,
        avatarId: selectedAvatar,
        displayName: newDisplayName.trim() || `@${validation.normalized}`,
        subtitle: newSubtitle.trim() || 'Campus Student',
      });

      setNewHandle('');
      setNewDisplayName('');
      setSavedNotice(
        `Created & switched to @${res.handle} (tx: ${res.txSignature.slice(0, 12)}…)`
      );
      onProfileCreated(res.handle);
      setTimeout(() => setSavedNotice(null), 4000);
    } catch (err: unknown) {
      setCreateError(normalizeApiError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    submitCreateProfile();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-24 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#F6F4EE]">
          Campus Handle &amp; Switcher
        </h1>
        <p className="text-sm text-[#B9C2CC] mt-0.5">
          No wallet, no login. Create a handle via{' '}
          <span className="font-mono text-[#3DDC97]">POST /profiles</span> or
          switch handles to demo sending and verifying route cards on one phone.
        </p>
      </div>

      {/* Active User Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#3DDC97]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <StudentAvatar
            avatarId={currentUser.avatarId}
            handle={currentUser.handle}
            size={54}
            showOnline
          />
          <div>
            <div className="font-mono text-xs text-[#3DDC97] font-semibold">
              ACTIVE HANDLE
            </div>
            <div className="font-display font-bold text-xl text-[#F6F4EE]">
              @{currentUser.handle}
            </div>
            <div className="text-xs text-[#B9C2CC]">
              {currentUser.displayName} · {currentUser.subtitle}
            </div>
          </div>
        </div>

        {/* Change current avatar quickly */}
        <div className="flex items-center gap-1.5">
          {AVATAR_OPTIONS.map((av) => {
            const active = currentUser.avatarId === av.id;
            return (
              <button
                key={av.id}
                type="button"
                onClick={() => onUpdateAvatar(av.id)}
                title={`Select ${av.label} avatar`}
                className={`rounded-full p-0.5 transition-transform cursor-pointer ${
                  active
                    ? 'ring-2 ring-[#3DDC97] scale-105'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <StudentAvatar avatarId={av.id} size={32} />
              </button>
            );
          })}
        </div>
      </div>

      {savedNotice && (
        <div className="p-3.5 rounded-xl bg-[#3DDC97]/15 border border-[#3DDC97] text-xs font-mono text-[#3DDC97]">
          {savedNotice}
        </div>
      )}

      {/* Switch User Control */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#3DDC97]" />
            <h2 className="font-display font-bold text-base text-[#F6F4EE]">
              Switch Active User (One-Phone Demo)
            </h2>
          </div>
          <span className="font-mono text-xs text-[#859489]">
            {users.length} handles
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {users.map((u) => {
            const active = u.handle === currentUser.handle;
            return (
              <button
                key={u.handle}
                type="button"
                onClick={() => onSwitchUser(u.handle)}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-[#3DDC97]/15 border-[#3DDC97]'
                    : 'bg-[#11161C] border-[#2A3541] hover:border-[#859489]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StudentAvatar
                    avatarId={u.avatarId}
                    handle={u.handle}
                    size={38}
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-[#F6F4EE] truncate">
                      @{u.handle}
                    </div>
                    <div className="text-xs text-[#B9C2CC] truncate">
                      {u.displayName}
                    </div>
                  </div>
                </div>

                {active ? (
                  <span className="w-6 h-6 rounded-full bg-[#3DDC97] text-[#002112] flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span className="font-mono text-xs text-[#3DDC97] shrink-0">
                    Use →
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Create New Handle & Pick Avatar via createProfile() */}
      <form
        onSubmit={handleCreate}
        className="p-4 sm:p-5 rounded-2xl bg-[#1A222B] border border-[#2A3541] space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#3DDC97]" />
          <h2 className="font-display font-bold text-base text-[#F6F4EE]">
            Create a Handle &amp; Avatar
          </h2>
        </div>

        {createError && (
          <div className="p-3.5 rounded-xl bg-[#93000a]/30 border border-[#FF5A5F] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-[#ffdad6]">
              <AlertCircle className="w-4 h-4 text-[#FF5A5F] shrink-0 mt-0.5" />
              <div>
                <span className="font-mono uppercase text-[10px] text-[#ffb4ab] block">
                  {createError.error}
                </span>
                <span>{createError.message}</span>
              </div>
            </div>

            {createError.error === 'network_error' && (
              <button
                type="button"
                onClick={submitCreateProfile}
                className="px-3 py-1.5 rounded-lg bg-[#FF5A5F] text-[#0f141a] font-mono text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block font-mono text-xs text-[#B9C2CC]">
            Handle (3–20 chars: lowercase a–z, 0–9, underscore)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-[#3DDC97]">
              @
            </span>
            <input
              type="text"
              value={newHandle}
              onChange={(e) => {
                setNewHandle(e.target.value.toLowerCase());
                setCreateError(null);
              }}
              placeholder="e.g. dayo_ikole"
              maxLength={20}
              className="w-full h-12 pl-8 pr-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none font-mono text-sm text-[#F6F4EE]"
            />
          </div>
          {newHandle.length > 0 && !validation.valid && (
            <p className="text-xs text-[#FF5A5F]">{validation.error}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
              Display Name (Optional)
            </label>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Dayo Adeleke"
              className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-[#B9C2CC] mb-1">
              Faculty / Hostel Tag
            </label>
            <input
              type="text"
              value={newSubtitle}
              onChange={(e) => setNewSubtitle(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-[#11161C] border border-[#2A3541] focus:border-[#3DDC97] focus:outline-none text-sm text-[#F6F4EE]"
            />
          </div>
        </div>

        <div>
          <label className="block font-mono text-xs text-[#B9C2CC] mb-2">
            Pick an Avatar
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {AVATAR_OPTIONS.map((av) => {
              const selected = selectedAvatar === av.id;
              return (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => setSelectedAvatar(av.id)}
                  className={`p-1.5 rounded-2xl border flex items-center gap-2 pr-3 cursor-pointer ${
                    selected
                      ? 'bg-[#3DDC97]/15 border-[#3DDC97]'
                      : 'bg-[#11161C] border-[#2A3541]'
                  }`}
                >
                  <StudentAvatar avatarId={av.id} size={34} />
                  <span className="font-mono text-xs text-[#F6F4EE]">
                    {av.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!validation.valid || creating}
          className="w-full h-12 rounded-xl bg-[#3DDC97] hover:bg-[#52f0ab] disabled:opacity-45 text-[#002112] font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating Profile...</span>
            </>
          ) : (
            <span>Create &amp; Switch to Handle</span>
          )}
        </button>
      </form>

      {/* Stage Demo Utilities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onOpenDemoMenu}
          className="h-12 px-4 rounded-xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] text-[#F6F4EE] font-mono text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <FlaskConical className="w-4 h-4 text-[#3DDC97]" />
          <span>Open Stage Demo Menu</span>
        </button>

        <button
          type="button"
          onClick={onResetDemoData}
          className="h-12 px-4 rounded-xl bg-[#1A222B] hover:bg-[#222C37] border border-[#2A3541] text-[#B9C2CC] hover:text-[#FF5A5F] font-mono text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Demo Storage</span>
        </button>
      </div>

      <FooterLine />
    </div>
  );
}
