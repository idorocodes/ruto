import {
  SharedPathMode,
  SharedPathPoint,
  TransitMode,
  TurnDirection,
  Waypoint,
} from '../types';

const EARTH_RADIUS_METERS = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Computes exact surface distance in meters between two coordinates using Haversine.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes total path distance in meters across an ordered array of lat/lng points.
 */
export function computePolylineMeters(
  points: Array<{ lat: number; lng: number }>
): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
  }
  return Math.round(total);
}

/**
 * Computes initial compass bearing (0..360) from point 1 to point 2.
 */
export function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function compassDirectionLabel(waypoints: Waypoint[]): string {
  if (waypoints.length < 2) return 'North-East';
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  const deg = bearingDegrees(first.lat, first.lng, last.lat, last.lng);
  const dirs = [
    'North',
    'North-East',
    'East',
    'South-East',
    'South',
    'South-West',
    'West',
    'North-West',
  ];
  return dirs[Math.round(deg / 45) % 8];
}

export interface ComputedStepGeometry {
  stepNumber: number;
  placeName: string;
  landmark: string;
  note: string;
  distanceMetersToNext: number;
  computedTurn: TurnDirection;
}

export function computeTurnBetweenPoints(
  prev: { lat: number; lng: number } | undefined,
  curr: { lat: number; lng: number },
  next: { lat: number; lng: number } | undefined,
  fallbackTurn: TurnDirection = 'straight'
): TurnDirection {
  if (!prev || !next) return fallbackTurn;
  const incomingBearing = bearingDegrees(prev.lat, prev.lng, curr.lat, curr.lng);
  const outgoingBearing = bearingDegrees(curr.lat, curr.lng, next.lat, next.lng);
  const delta = ((outgoingBearing - incomingBearing + 540) % 360) - 180;

  if (Math.abs(delta) < 25) return 'straight';
  if (delta >= 25 && delta < 55) return 'slight right';
  if (delta >= 55) return 'right';
  if (delta <= -25 && delta > -55) return 'slight left';
  return 'left';
}

/**
 * Computes distances and geometric turns directly in code from placed map coordinates.
 */
export function computeRouteGeometry(waypoints: Waypoint[]): {
  totalMeters: number;
  totalKmText: string;
  turnsCount: number;
  steps: ComputedStepGeometry[];
} {
  let totalMeters = 0;
  let turnsCount = 0;

  const steps: ComputedStepGeometry[] = waypoints.map((wp, idx) => {
    const next = waypoints[idx + 1];
    const prev = waypoints[idx - 1];

    const segMeters = next
      ? Math.round(haversineMeters(wp.lat, wp.lng, next.lat, next.lng))
      : 0;
    totalMeters += segMeters;

    const computedTurn = computeTurnBetweenPoints(
      prev,
      wp,
      next,
      wp.turn || 'straight'
    );

    if (prev && next && computedTurn !== 'straight') {
      turnsCount += 1;
    } else if (!prev && (wp.turn === 'left' || wp.turn === 'right')) {
      turnsCount += 1;
    }

    return {
      stepNumber: idx + 1,
      placeName: wp.name,
      landmark: wp.landmark || wp.name,
      note: wp.note,
      distanceMetersToNext: segMeters,
      computedTurn,
    };
  });

  const km = totalMeters / 1000;
  const totalKmText =
    totalMeters === 0
      ? '0.0 km'
      : km < 0.1
      ? `${totalMeters} m`
      : `${km.toFixed(1)} km`;

  return {
    totalMeters,
    totalKmText,
    turnsCount: Math.max(turnsCount, waypoints.length > 2 ? 1 : 0),
    steps,
  };
}

/**
 * Reverses a list of points/waypoints to walk a path backwards and recomputes
 * all left/right turns in code from the reversed coordinate sequence.
 */
export function reverseWaypointsAndRecomputeTurns(
  waypoints: Waypoint[]
): Waypoint[] {
  const reversed = [...waypoints].reverse();
  return reversed.map((wp, idx) => {
    const prev = reversed[idx - 1];
    const next = reversed[idx + 1];
    const invertedFallback: TurnDirection =
      wp.turn === 'left'
        ? 'right'
        : wp.turn === 'right'
        ? 'left'
        : wp.turn === 'slight left'
        ? 'slight right'
        : wp.turn === 'slight right'
        ? 'slight left'
        : 'straight';

    const recomputedTurn =
      prev && next
        ? computeTurnBetweenPoints(prev, wp, next, 'straight')
        : idx === 0 || idx === reversed.length - 1
        ? 'straight'
        : invertedFallback;

    return {
      ...wp,
      id: `${wp.id}-rev-${idx}`,
      turn: recomputedTurn,
    };
  });
}

export function sharedPointsToWaypoints(points: SharedPathPoint[]): Waypoint[] {
  const base: Waypoint[] = points.map((pt, idx) => ({
    id: `path-pt-${idx}`,
    name:
      pt.label?.trim() ||
      (idx === 0
        ? 'Start Point'
        : idx === points.length - 1
        ? 'Destination'
        : `Point ${idx + 1}`),
    landmark: pt.label?.trim() || `Point ${idx + 1}`,
    turn: 'straight',
    note: pt.note?.trim() || '',
    lat: pt.lat,
    lng: pt.lng,
    accuracy: pt.accuracy,
  }));

  return base.map((wp, idx) => ({
    ...wp,
    turn: computeTurnBetweenPoints(base[idx - 1], wp, base[idx + 1], 'straight'),
  }));
}

/**
 * Perpendicular distance in meters from point P to segment AB using local equirectangular projection.
 */
function perpendicularDistanceMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const cosLat = Math.cos(toRad(a.lat));
  const px = (p.lng - a.lng) * cosLat * 111320;
  const py = (p.lat - a.lat) * 110540;
  const bx = (b.lng - a.lng) * cosLat * 111320;
  const by = (b.lat - a.lat) * 110540;

  const segLenSq = bx * bx + by * by;
  if (segLenSq === 0) {
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;
  return Math.hypot(px - projX, py - projY);
}

function rdpIndices(
  points: SharedPathPoint[],
  startIdx: number,
  endIdx: number,
  epsilonMeters: number,
  keep: Set<number>
): void {
  if (endIdx <= startIdx + 1) return;

  let maxDist = -1;
  let splitIdx = -1;

  for (let i = startIdx + 1; i < endIdx; i++) {
    // Always preserve named landmarks with notes dropped explicitly by the walker
    if (keep.has(i)) {
      splitIdx = i;
      maxDist = Infinity;
      break;
    }
    const d = perpendicularDistanceMeters(
      points[i],
      points[startIdx],
      points[endIdx]
    );
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  if (maxDist > epsilonMeters && splitIdx !== -1) {
    keep.add(splitIdx);
    rdpIndices(points, startIdx, splitIdx, epsilonMeters, keep);
    rdpIndices(points, splitIdx, endIdx, epsilonMeters, keep);
  }
}

/**
 * Simplifies a recorded GPS track using Douglas-Peucker to at most maxPoints (default 30),
 * preserving start, end, and user-dropped named landmarks.
 */
export function simplifyTrackDouglasPeucker(
  points: SharedPathPoint[],
  maxPoints = 30
): SharedPathPoint[] {
  if (points.length <= maxPoints) {
    return points.map((p) => ({
      ...p,
      lat: Number(Number(p.lat).toFixed(6)),
      lng: Number(Number(p.lng).toFixed(6)),
      accuracy: Math.round(p.accuracy || 10),
    }));
  }

  const anchorIndices = new Set<number>([0, points.length - 1]);
  points.forEach((pt, idx) => {
    if ((pt.label && pt.label.trim()) || (pt.note && pt.note.trim())) {
      if (anchorIndices.size < maxPoints) {
        anchorIndices.add(idx);
      }
    }
  });

  let epsilon = 2.5; // start at 2.5m tolerance
  let bestKeep = new Set<number>(anchorIndices);

  for (let attempt = 0; attempt < 18; attempt++) {
    const keep = new Set<number>(anchorIndices);
    rdpIndices(points, 0, points.length - 1, epsilon, keep);
    bestKeep = keep;
    if (keep.size <= maxPoints) {
      break;
    }
    epsilon *= 1.6;
  }

  let sortedIndices = Array.from(bestKeep).sort((a, b) => a - b);

  // Hard cap guarantee if anchor count + RDP still exceeded maxPoints
  if (sortedIndices.length > maxPoints) {
    const sampled: number[] = [0];
    const step = (sortedIndices.length - 1) / (maxPoints - 1);
    for (let i = 1; i < maxPoints - 1; i++) {
      sampled.push(sortedIndices[Math.round(i * step)]);
    }
    sampled.push(points.length - 1);
    sortedIndices = Array.from(new Set(sampled)).sort((a, b) => a - b);
  }

  return sortedIndices.map((idx) => ({
    ...points[idx],
    lat: Number(Number(points[idx].lat).toFixed(6)),
    lng: Number(Number(points[idx].lng).toFixed(6)),
    accuracy: Math.round(points[idx].accuracy || 10),
  }));
}

export function modeToTransitMode(mode: SharedPathMode): TransitMode {
  if (mode === 'keke') return 'Keke';
  if (mode === 'okada') return 'Okada';
  return 'Walk';
}

export function transitModeToSharedMode(mode: TransitMode): SharedPathMode {
  if (mode === 'Keke') return 'keke';
  if (mode === 'Okada') return 'okada';
  return 'walk';
}

export function estimateDurationMinutes(
  totalMeters: number,
  mode: TransitMode | SharedPathMode
): number {
  if (totalMeters <= 0) return 1;
  const lower = mode.toLowerCase();
  const metersPerMin =
    lower === 'okada' ? 420 : lower === 'keke' ? 300 : 80;
  return Math.max(1, Math.round(totalMeters / metersPerMin));
}

export function formatDistanceLabel(meters: number): string {
  if (meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
