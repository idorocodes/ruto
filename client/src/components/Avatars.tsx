import React from 'react';

export interface AvatarOption {
  id: string;
  label: string;
  bg: string;
  accent: string;
  skin: string;
  shirt: string;
  hair: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'ankara-gold',
    label: 'Adaeze',
    bg: '#1c2b36',
    accent: '#FFB368',
    skin: '#8D5524',
    shirt: '#E07A22',
    hair: '#141418',
  },
  {
    id: 'mint-hoodie',
    label: 'Tobi',
    bg: '#142923',
    accent: '#3DDC97',
    skin: '#6B3E26',
    shirt: '#1E8E63',
    hair: '#111317',
  },
  {
    id: 'indigo-cap',
    label: 'Chidi',
    bg: '#1c2338',
    accent: '#7AA2F7',
    skin: '#7A482A',
    shirt: '#324B8A',
    hair: '#15151A',
  },
  {
    id: 'coral-studio',
    label: 'Kemi',
    bg: '#2c1e26',
    accent: '#FF7A85',
    skin: '#996236',
    shirt: '#C94A5A',
    hair: '#1A1518',
  },
  {
    id: 'emerald-rep',
    label: 'Segun',
    bg: '#192a28',
    accent: '#61F9B1',
    skin: '#5C3317',
    shirt: '#2A6F68',
    hair: '#101214',
  },
  {
    id: 'amber-law',
    label: 'Amina',
    bg: '#2b2419',
    accent: '#FFD8B6',
    skin: '#85522B',
    shirt: '#9E6B2B',
    hair: '#181411',
  },
];

export function StudentAvatar({
  avatarId,
  handle,
  size = 36,
  showOnline = false,
}: {
  avatarId?: string;
  handle?: string;
  size?: number;
  showOnline?: boolean;
}) {
  const preset =
    AVATAR_OPTIONS.find((a) => a.id === avatarId) ||
    AVATAR_OPTIONS[
      Math.abs(
        (handle || 'ruto')
          .split('')
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      ) % AVATAR_OPTIONS.length
    ];

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-[#2A3541] overflow-hidden select-none"
      style={{ width: size, height: size, backgroundColor: preset.bg }}
      aria-label={handle ? `@${handle} avatar` : 'User avatar'}
    >
      <svg
        viewBox="0 0 48 48"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="24" cy="24" r="24" fill={preset.bg} />
        <circle cx="38" cy="10" r="10" fill={preset.accent} fillOpacity="0.14" />
        {/* Shoulders / Ankara collar */}
        <path
          d="M8 46C9.5 36.5 15.5 33 24 33C32.5 33 38.5 36.5 40 46H8Z"
          fill={preset.shirt}
        />
        <path
          d="M18 33.5L24 39L30 33.5"
          stroke={preset.accent}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Neck & Head */}
        <rect x="20.5" y="26" width="7" height="8" rx="3" fill={preset.skin} />
        <circle cx="24" cy="20" r="8.5" fill={preset.skin} />
        {/* Hair */}
        <path
          d="M15.2 19C15.2 13.2 19 10 24 10C29 10 32.8 13.2 32.8 19C31.2 16.5 28.2 15.2 24 15.2C19.8 15.2 16.8 16.5 15.2 19Z"
          fill={preset.hair}
        />
        {/* Eyes & warm smile */}
        <circle cx="21" cy="20" r="1.1" fill="#11161C" />
        <circle cx="27" cy="20" r="1.1" fill="#11161C" />
        <path
          d="M21.2 23.5C22.2 24.7 25.8 24.7 26.8 23.5"
          stroke="#11161C"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      {showOnline && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#3DDC97] ring-2 ring-[#11161C]" />
      )}
    </div>
  );
}

export function RutoLogoMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-lg bg-[#3DDC97]/15 border border-[#3DDC97]/40 shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={Math.round(size * 0.65)}
        height={Math.round(size * 0.65)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="6" cy="18" r="3" fill="#3DDC97" />
        <circle cx="18" cy="6" r="3" stroke="#61F9B1" strokeWidth="2.2" />
        <path
          d="M8.5 16.5C11.5 14.5 10.5 9.5 15.5 7.5"
          stroke="#3DDC97"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function WaypointSpotVisual({
  name,
  index,
  photoDataUrl,
}: {
  name: string;
  index: number;
  photoDataUrl?: string;
}) {
  if (photoDataUrl) {
    return (
      <img
        src={photoDataUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className="w-full h-24 object-cover"
      />
    );
  }

  const palettes = [
    { sky: '#182834', ground: '#24382f', accent: '#3DDC97', roof: '#E09F3E' },
    { sky: '#1f2436', ground: '#2b2633', accent: '#FFB368', roof: '#3DDC97' },
    { sky: '#172b2a', ground: '#223328', accent: '#61F9B1', roof: '#5688C7' },
  ];
  const p = palettes[index % palettes.length];

  return (
    <svg
      viewBox="0 0 200 100"
      className="w-full h-24 block"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="200" height="100" fill={p.sky} />
      <circle cx="165" cy="24" r="14" fill={p.accent} fillOpacity="0.18" />
      <path d="M0 68L200 62V100H0V68Z" fill={p.ground} />
      {/* Footpath */}
      <path
        d="M72 100L96 64H112L138 100H72Z"
        fill="#C98A5B"
        fillOpacity="0.45"
      />
      {/* Campus building / canopy silhouette */}
      <rect x="34" y="36" width="58" height="32" rx="3" fill="#253341" stroke="#36485A" />
      <path d="M30 38L63 22L96 38H30Z" fill={p.roof} fillOpacity="0.8" />
      <rect x="44" y="45" width="10" height="10" rx="1" fill={p.accent} fillOpacity="0.45" />
      <rect x="60" y="45" width="10" height="10" rx="1" fill={p.accent} fillOpacity="0.45" />
      <rect x="76" y="45" width="8" height="23" rx="1" fill="#11161C" />
      {/* Trees */}
      <circle cx="145" cy="48" r="14" fill="#2A6F4E" />
      <rect x="143" y="58" width="4" height="10" fill="#5C3D2E" />
    </svg>
  );
}
