import {
  CampusRequest,
  RouteCard,
  SharedPathDetail,
  UserProfile,
} from '../types';
import { computeRouteSha256 } from './crypto';
import { computePolylineMeters } from './geo';

export const INITIAL_USERS: UserProfile[] = [
  {
    handle: 'mary_hostel',
    displayName: 'Adaeze Okonkwo',
    subtitle: 'CS Dept • Year 3',
    avatarId: 'ankara-gold',
    txSignature: '0x91a4f02bc8e144028d10b72ce91f3802a71d9e04',
  },
  {
    handle: 'tobi_fuoye',
    displayName: 'Tobi Adeyemi',
    subtitle: "Class Rep • Computer Science '25",
    avatarId: 'mint-hoodie',
    txSignature: '0x74b2e19ca3f08812d45a60c182fe9901b33c4a12',
  },
  {
    handle: 'kemi_art',
    displayName: 'Kemi Balogun',
    subtitle: 'Theatre & Media Arts • Year 4',
    avatarId: 'coral-studio',
    txSignature: '0x52c8d30fa1e97723b04d18e293af8812c44d5b23',
  },
  {
    handle: 'chidi_eng',
    displayName: 'Chidi Nwachukwu',
    subtitle: 'Mechatronics Eng • Ikole Hub',
    avatarId: 'indigo-cap',
    txSignature: '0x38e1f42ab9c06634d15e29f304ba7723d55e6c34',
  },
  {
    handle: 'segun_sci',
    displayName: 'Segun Ojo',
    subtitle: 'Microbiology • Year 2',
    avatarId: 'emerald-rep',
    txSignature: '0x19f3a54bc8d15545e26f30a415cb6634e66f7d45',
  },
  {
    handle: 'amina_law',
    displayName: 'Amina Bello',
    subtitle: 'Law Faculty • Year 3',
    avatarId: 'amber-law',
    txSignature: '0x84d2c65ed7a24456f37a41b526dc5545f77a8e56',
  },
];

export const INITIAL_REQUESTS: CampusRequest[] = [
  {
    id: 'req-1',
    handle: 'chidi_eng',
    avatarId: 'indigo-cap',
    createdAt: Date.now() - 8 * 60 * 1000,
    question:
      'Best dry footpath to Faculty of Agric after heavy rain? Main tarred road is completely flooded.',
    tag: 'Agric / Farm Gate',
    routesOffered: 3,
    suggestedTitle: 'Main Gate → Faculty of Agric',
    suggestedPrompt:
      'Comot from Main Gate, follow the paved walkway behind Science block straight, turn right by Agro Farm tree line to reach Faculty of Agric dry.',
  },
  {
    id: 'req-2',
    handle: 'amina_law',
    avatarId: 'amber-law',
    createdAt: Date.now() - 19 * 60 * 1000,
    question:
      'Safe, well-lit walk from New Hostel block D to Law Library around 8:30pm?',
    tag: 'Night Transit',
    routesOffered: 1,
    suggestedTitle: 'New Hostel D → Law Library',
    suggestedPrompt:
      'Start at New Hostel Block D security post, walk straight under the solar streetlights past ETF Hall, turn left into Law Library entrance.',
  },
];

export const DEFAULT_CAMPUS_CENTER: [number, number] = [7.7796, 5.3152];

export function buildInitialSharedPaths(): SharedPathDetail[] {
  const now = Date.now();

  const p1Points = [
    {
      lat: 7.776812,
      lng: 5.311945,
      accuracy: 8,
      label: 'FUOYE Main Gate',
      note: 'Start right outside the security post turnstile',
    },
    {
      lat: 7.778924,
      lng: 5.314218,
      accuracy: 10,
      label: 'University Library Walkway',
      note: 'Continue straight along the covered library corridor',
    },
    {
      lat: 7.780641,
      lng: 5.316105,
      accuracy: 9,
      label: 'Food Canopy Junction',
      note: 'Turn left just past Mama Put food canopy',
    },
    {
      lat: 7.782415,
      lng: 5.315082,
      accuracy: 7,
      label: "Mary's Hostel Main Entrance",
      note: 'Public green hostel gate opposite the kiosk',
    },
  ];

  const p2Points = [
    {
      lat: 7.77945,
      lng: 5.31505,
      accuracy: 9,
      label: 'Senate Building Forecourt',
      note: 'Start by the Senate flagpole walkway',
    },
    {
      lat: 7.77902,
      lng: 5.31562,
      accuracy: 11,
      label: 'Faculty of Arts Courtyard',
      note: 'Take the paved path beside the Arts noticeboard',
    },
    {
      lat: 7.77874,
      lng: 5.31602,
      accuracy: 8,
      label: 'Twin Lecture Theatre (TLT)',
      note: 'Arrive at TLT main stairs',
    },
  ];

  const p3Points = [
    {
      lat: 7.77892,
      lng: 5.31421,
      accuracy: 10,
      label: 'University Library Front Steps',
      note: 'Leave from the main library entrance',
    },
    {
      lat: 7.77815,
      lng: 5.31585,
      accuracy: 12,
      label: 'Faculty of Science Transformer',
      note: 'Pass the yellow transformer box under the trees',
    },
    {
      lat: 7.77712,
      lng: 5.31808,
      accuracy: 9,
      label: 'Engineering Workshop Gate',
      note: 'Blue metal bay entrance',
    },
  ];

  const p4Points = [
    {
      lat: 7.78015,
      lng: 5.31465,
      accuracy: 14,
      label: 'ETF Hall Back Culvert',
      note: 'Start behind ETF lecture hall',
    },
    {
      lat: 7.78095,
      lng: 5.31375,
      accuracy: 16,
      label: 'Old Farm Footbridge',
      note: 'Wooden plank crossing over drainage channel',
    },
    {
      lat: 7.78172,
      lng: 5.31295,
      accuracy: 12,
      label: 'Faculty of Agric Gate',
      note: 'Main faculty entrance arch',
    },
  ];

  return [
    {
      id: 'PATH-101',
      title: "Main Gate → Mary's Hostel",
      startName: 'FUOYE Main Gate',
      endName: "Mary's Hostel Main Entrance",
      mode: 'walk',
      visibility: 'public',
      points: p1Points,
      recordedBy: 'tobi_fuoye',
      distanceMeters: computePolylineMeters(p1Points),
      confirmations: 28,
      flags: 0,
      createdAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: 'PATH-102',
      title: 'Senate Forecourt → Twin Lecture Theatre',
      startName: 'Senate Building Forecourt',
      endName: 'Twin Lecture Theatre (TLT)',
      mode: 'walk',
      visibility: 'public',
      points: p2Points,
      recordedBy: 'kemi_art',
      distanceMeters: computePolylineMeters(p2Points),
      confirmations: 41,
      flags: 0,
      createdAt: now - 5 * 60 * 60 * 1000,
    },
    {
      id: 'PATH-103',
      title: 'Uni Library → Engineering Workshop',
      startName: 'University Library Front Steps',
      endName: 'Engineering Workshop Gate',
      mode: 'walk',
      visibility: 'public',
      points: p3Points,
      recordedBy: 'segun_sci',
      distanceMeters: computePolylineMeters(p3Points),
      confirmations: 19,
      flags: 0,
      createdAt: now - 14 * 60 * 60 * 1000,
    },
    {
      id: 'PATH-104',
      title: 'ETF Culvert → Faculty of Agric Footbridge',
      startName: 'ETF Hall Back Culvert',
      endName: 'Faculty of Agric Gate',
      mode: 'walk',
      visibility: 'public',
      points: p4Points,
      recordedBy: 'chidi_eng',
      distanceMeters: computePolylineMeters(p4Points),
      confirmations: 4,
      flags: 3, // Flagged as "may be outdated" due to heavy rain culvert blockage
      createdAt: now - 36 * 60 * 60 * 1000,
      feedbackNotes: [
        {
          worked: false,
          note: 'Plank bridge flooded after rain yesterday',
          createdAt: now - 4 * 60 * 60 * 1000,
        },
      ],
    },
  ];
}

export async function buildSeedCards(): Promise<RouteCard[]> {
  const now = Date.now();

  const rawCards: Omit<RouteCard, 'hash'>[] = [
    {
      id: 'RT-8842',
      from: 'tobi_fuoye',
      to: 'mary_hostel',
      salt: '9f4a7c1b209e88d4fe3a61b091cc42e8',
      language: 'Pidgin',
      status: 'pending',
      txSignature: '0x8f9b3c219a04e77d21b603fc4920a18be4723c21',
      createdAt: now - 12 * 60 * 1000,
      route: {
        title: "Main Gate → Mary's Hostel",
        mode: 'Walk',
        personalNote:
          'I dey wait for you for gate, tap this route make you no miss road!',
        summaryNote:
          "Straight pass Library block, branch left after Mama Put food canopy to reach Mary's Hostel.",
        category: 'Hostels',
        rating: 4.9,
        usesCount: 32,
        waypoints: [
          {
            id: 'wp-seed-1',
            name: 'FUOYE Main Gate',
            landmark: 'Main Gate Security Post',
            turn: 'straight',
            note: 'Meet right outside the security post',
            lat: 7.776812,
            lng: 5.311945,
          },
          {
            id: 'wp-seed-2',
            name: 'University Library Walk',
            landmark: 'Science & Library Walkway',
            turn: 'straight',
            note: 'Walk straight past the library paved corridor',
            lat: 7.778924,
            lng: 5.314218,
          },
          {
            id: 'wp-seed-3',
            name: 'Food Canopy Junction',
            landmark: 'Mama Put Food Canopy',
            turn: 'left',
            note: 'Turn left after the food canopy beside retail kiosk',
            lat: 7.780641,
            lng: 5.316105,
          },
          {
            id: 'wp-seed-4',
            name: "Mary's Hostel Gate",
            landmark: 'Green Metal Hostel Gate',
            turn: 'straight',
            note: 'Arrive at the green gate opposite canteen',
            lat: 7.782415,
            lng: 5.315082,
          },
        ],
        directionsByLang: {
          Pidgin: [
            'Comot from FUOYE Main Gate security post and waka straight up the campus road.',
            'Pass the University Library walkway straight without branching.',
            'Once you reach Food Canopy junction, turn left just after Mama Put canopy.',
            "Follow the red sand path straight until you see Mary's Hostel green gate.",
          ],
          English: [
            'Start outside the FUOYE Main Gate security post and head straight along the walkway.',
            'Continue straight past the University Library corridor.',
            'Turn left at Food Canopy Junction right after the kiosk.',
            "Walk straight ahead to arrive at Mary's Hostel green gate.",
          ],
          Yoruba: [
            'Bẹ̀rẹ̀ láti ẹnu-ọ̀nà àbáwọlé FUOYE Main Gate kí o sì rìn tààrà síwájú.',
            'Kọjá lẹ́gbẹ̀ẹ́ University Library láì yà sí ọ̀nà míì.',
            'Yà sí apá òsì ní Food Canopy Junction lẹ́yìn àtíbàbà oúnjẹ náà.',
            "Tẹ̀síwájú tààrà títí tí o fi dé ẹnu-ọ̀nà Mary's Hostel.",
          ],
        },
      },
      directions: [
        'Comot from FUOYE Main Gate security post and waka straight up the campus road.',
        'Pass the University Library walkway straight without branching.',
        'Once you reach Food Canopy junction, turn left just after Mama Put canopy.',
        "Follow the red sand path straight until you see Mary's Hostel green gate.",
      ],
    },
    {
      id: 'RT-7419',
      from: 'kemi_art',
      to: 'mary_hostel',
      salt: '4b1c8d9271fe03a6c812aa0931dd7012',
      language: 'English',
      status: 'pending',
      txSignature: '0x4b1c8d9271fe03a6c812aa0931dd701299e18d92',
      createdAt: now - 58 * 60 * 1000,
      route: {
        title: 'Phase 2 Gate → Twin Lecture Theatre',
        mode: 'Walk',
        personalNote: 'Use this paved sidewalk to skip the Senate roundabout queue.',
        summaryNote:
          'Take the paved sidewalk past Faculty of Arts to enter TLT back staircase directly.',
        category: 'Lecture Halls',
        rating: 4.8,
        usesCount: 56,
        waypoints: [
          {
            id: 'wp-kemi-1',
            name: 'Phase 2 Gate',
            landmark: 'Phase 2 Security Post',
            turn: 'straight',
            note: 'Enter through pedestrian turnstile',
            lat: 7.78112,
            lng: 5.31842,
          },
          {
            id: 'wp-kemi-2',
            name: 'Faculty of Arts Sidewalk',
            landmark: 'Arts Courtyard',
            turn: 'right',
            note: 'Take the shaded walkway beside Faculty of Arts',
            lat: 7.77985,
            lng: 5.31711,
          },
          {
            id: 'wp-kemi-3',
            name: 'Twin Lecture Theatre (TLT)',
            landmark: 'TLT Back Staircase',
            turn: 'straight',
            note: 'Enter directly via the back staircase',
            lat: 7.77874,
            lng: 5.31602,
          },
        ],
      },
      directions: [
        'Enter through the Phase 2 Gate pedestrian turnstile and walk straight ahead.',
        'Turn right onto the shaded sidewalk running beside Faculty of Arts.',
        'Continue straight to the Twin Lecture Theatre back staircase entrance.',
      ],
    },
    {
      id: 'RT-6104',
      from: 'segun_sci',
      to: 'mary_hostel',
      salt: '7e2a9f10b4c8d301fe82a174629c55b1',
      language: 'Yoruba',
      status: 'accepted',
      txSignature: '0x7e2a9f10b4c8d301fe82a174629c55b1cc849f10',
      createdAt: now - 22 * 60 * 60 * 1000,
      route: {
        title: 'Uni Library → Eng Workshop',
        mode: 'Walk',
        personalNote: 'Shaded tree alley shortcut for afternoon lab.',
        summaryNote:
          'Gba ojú ọ̀nà tí ó wà lẹ́yìn ilé-ìkàwé, tẹ̀síwájú lábẹ́ àwọn igi ìrókò dé Engineering Workshop.',
        category: 'Shortcuts',
        rating: 4.7,
        usesCount: 19,
        waypoints: [
          {
            id: 'wp-seg-1',
            name: 'University Library',
            landmark: 'Library Front Steps',
            turn: 'straight',
            note: 'Start behind the main reading hall',
            lat: 7.77892,
            lng: 5.31421,
          },
          {
            id: 'wp-seg-2',
            name: 'Iroko Tree Alley',
            landmark: 'Tall Iroko Trees',
            turn: 'left',
            note: 'Turn left under the shaded tree line',
            lat: 7.77795,
            lng: 5.31645,
          },
          {
            id: 'wp-seg-3',
            name: 'Engineering Workshop',
            landmark: 'Blue Metal Bay Door',
            turn: 'straight',
            note: 'Workshop entrance is on your right',
            lat: 7.77712,
            lng: 5.31808,
          },
        ],
      },
      directions: [
        'Bẹ̀rẹ̀ lẹ́yìn University Library kí o sì gba ojú ọ̀nà àtẹ̀rin náà.',
        'Yà sí apá òsì lábẹ́ àwọn igi ìrókò tó ní ibòji.',
        'Rìn tààrà títí tí o fi dé iwájú Engineering Workshop.',
      ],
    },
  ];

  const signedCards: RouteCard[] = [];
  for (const raw of rawCards) {
    const { hash } = await computeRouteSha256(raw);
    signedCards.push({ ...raw, hash });
  }
  return signedCards;
}

export function applySimulatedTampering(card: RouteCard): RouteCard {
  if (card._untamperedBackup) {
    return card;
  }

  const backup = {
    route: {
      ...card.route,
      waypoints: card.route.waypoints.map((w) => ({ ...w })),
    },
    directions: [...card.directions],
  };

  const mutatedWaypoints = card.route.waypoints.map((wp, idx) => {
    if (idx === Math.min(1, card.route.waypoints.length - 1)) {
      return {
        ...wp,
        name: `${wp.name} (Unlit Back Alley)`,
        note: 'Detour behind abandoned generator fence',
        lat: Number((wp.lat + 0.0029).toFixed(6)),
        lng: Number((wp.lng - 0.0024).toFixed(6)),
      };
    }
    return { ...wp };
  });

  const mutatedDirections = card.directions.map((d, idx) =>
    idx === Math.min(1, card.directions.length - 1)
      ? 'Branch off into the unlit bush track behind the old generator house.'
      : d
  );

  return {
    ...card,
    route: {
      ...card.route,
      waypoints: mutatedWaypoints,
    },
    directions: mutatedDirections,
    _untamperedBackup: backup,
  };
}

export function restoreTamperedCard(card: RouteCard): RouteCard {
  if (!card._untamperedBackup) return card;
  const { _untamperedBackup, ...rest } = card;
  return {
    ...rest,
    route: _untamperedBackup.route,
    directions: _untamperedBackup.directions,
  };
}

export function validateHandle(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = raw.trim().replace(/^@+/, '').toLowerCase();
  if (normalized.length < 3 || normalized.length > 20) {
    return {
      valid: false,
      normalized,
      error: 'Handle must be 3 to 20 characters long.',
    };
  }
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Use only lowercase letters (a-z), numbers (0-9), and underscores (_).',
    };
  }
  return { valid: true, normalized };
}
