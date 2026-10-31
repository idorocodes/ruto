export type RutoLanguage = 'English' | 'Pidgin' | 'Yoruba';

export type TransitMode = 'Walk' | 'Keke' | 'Okada';

export type SharedPathMode = 'walk' | 'keke' | 'okada';

export type PathVisibility = 'card_only' | 'public';

export type TurnDirection =
  | 'straight'
  | 'left'
  | 'right'
  | 'slight left'
  | 'slight right';

export interface Waypoint {
  id: string;
  name: string;
  landmark: string;
  turn: TurnDirection;
  note: string;
  lat: number;
  lng: number;
  accuracy?: number;
  photoDataUrl?: string;
}

/**
 * Saved point on a Shared Library Path.
 * Every saved point stores lat, lng, accuracy (metres), label and note.
 */
export interface SharedPathPoint {
  lat: number;
  lng: number;
  accuracy: number;
  label: string;
  note: string;
}

export interface SharedPathSummary {
  id: string;
  title: string;
  startName: string;
  endName: string;
  mode: SharedPathMode;
  distanceMeters: number;
  confirmations: number;
  flags: number;
}

export interface NearPathSummary extends SharedPathSummary {
  distanceFromUserMeters: number;
}

export interface PathFeedbackNote {
  worked: boolean;
  note?: string;
  createdAt: number;
}

export interface SharedPathDetail extends SharedPathSummary {
  visibility: PathVisibility;
  points: SharedPathPoint[];
  recordedBy: string;
  createdAt: number;
  feedbackNotes?: PathFeedbackNote[];
}

/**
 * Returned by Gemma 4 Text-to-Route BEFORE the user taps the map.
 * Intentionally has NO coordinates so Gemma never invents GPS points.
 */
export interface UnplacedStep {
  id: string;
  placeName: string;
  landmark: string;
  turn: 'straight' | 'left' | 'right';
  note: string;
}

export type CardStatus = 'pending' | 'accepted' | 'declined';

export interface RouteData {
  title: string;
  mode: TransitMode;
  personalNote: string;
  summaryNote: string;
  waypoints: Waypoint[];
  directionsByLang?: Partial<Record<RutoLanguage, string[]>>;
  summaryByLang?: Partial<Record<RutoLanguage, string>>;
  category?: 'Hostels' | 'Lecture Halls' | 'Night Safe' | 'Shortcuts';
  rating?: number;
  usesCount?: number;
}

export interface TamperedBackup {
  route: RouteData;
  directions: string[];
}

export interface RouteCard {
  id: string;
  from: string;
  to: string;
  salt: string;
  route: RouteData;
  directions: string[];
  language: RutoLanguage;
  status: CardStatus;
  hash: string;
  txSignature: string;
  createdAt: number;
  _untamperedBackup?: TamperedBackup;
}

export interface InboxItem {
  id: string;
  from: string;
  title: string;
  status: CardStatus;
  createdAt: number;
  verified: boolean;
}

export interface VerifyCardResult {
  verified: boolean;
  onChainHash: string;
  localHash: string;
  canonicalJson?: string;
}

export interface ApiErrorShape {
  error: string;
  message?: string;
  status?: number;
}

export interface UserProfile {
  handle: string;
  avatarId: string;
  txSignature?: string;
  displayName: string;
  subtitle: string;
}

export interface CampusRequest {
  id: string;
  handle: string;
  avatarId: string;
  createdAt: number;
  question: string;
  tag: string;
  routesOffered: number;
  suggestedTitle: string;
  suggestedPrompt: string;
}

export interface LiveUserPosition {
  lat: number;
  lng: number;
  accuracy: number;
  isManual?: boolean;
}

export type ScreenName =
  | 'home'
  | 'explore'
  | 'record'
  | 'path-detail'
  | 'draw'
  | 'directions'
  | 'send'
  | 'inbox'
  | 'card-detail'
  | 'profile';
