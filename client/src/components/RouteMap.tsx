import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, RotateCcw } from 'lucide-react';
import { LiveUserPosition, Waypoint } from '../types';
import { DEFAULT_CAMPUS_CENTER } from '../utils/seedData';

interface RouteMapProps {
  waypoints: Waypoint[];
  interactive?: boolean;
  theme?: 'dark' | 'mint';
  bannerText?: string;
  isTampered?: boolean;
  heightClass?: string;
  liveUserPos?: LiveUserPosition | null;
  activeStepIndex?: number | null;
  arrived?: boolean;
  allowManualPositionTap?: boolean;
  onManualPositionTap?: (lat: number, lng: number) => void;
  onMapTap?: (lat: number, lng: number) => void;
  onSelectWaypoint?: (waypointId: string) => void;
  onResetWaypoints?: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function RouteMap({
  waypoints,
  interactive = false,
  theme = 'dark',
  bannerText,
  isTampered = false,
  heightClass = 'h-[360px]',
  liveUserPos = null,
  activeStepIndex = null,
  arrived = false,
  allowManualPositionTap = false,
  onManualPositionTap,
  onMapTap,
  onSelectWaypoint,
  onResetWaypoints,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const liveUserLayerRef = useRef<L.LayerGroup | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  const onMapTapRef = useRef(onMapTap);
  const onSelectWaypointRef = useRef(onSelectWaypoint);
  const allowManualTapRef = useRef(allowManualPositionTap);
  const onManualTapRef = useRef(onManualPositionTap);

  onMapTapRef.current = onMapTap;
  onSelectWaypointRef.current = onSelectWaypoint;
  allowManualTapRef.current = allowManualPositionTap;
  onManualTapRef.current = onManualPositionTap;

  const [locating, setLocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      waypoints.length > 0
        ? [waypoints[0].lat, waypoints[0].lng]
        : DEFAULT_CAMPUS_CENTER;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    liveUserLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));

      if (allowManualTapRef.current && onManualTapRef.current) {
        onManualTapRef.current(lat, lng);
        return;
      }

      if (onMapTapRef.current) {
        onMapTapRef.current(lat, lng);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync route pins and polyline
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }

    if (waypoints.length >= 2) {
      const latlngs: [number, number][] = waypoints.map((wp) => [wp.lat, wp.lng]);
      const strokeColor = isTampered ? '#FF5A5F' : '#3DDC97';

      L.polyline(latlngs, {
        color: strokeColor,
        weight: 10,
        opacity: 0.24,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(markersLayer);

      lineRef.current = L.polyline(latlngs, {
        color: strokeColor,
        weight: 4,
        opacity: 0.96,
        dashArray: isTampered ? '8, 8' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(markersLayer);
    }

    waypoints.forEach((wp, idx) => {
      const isStepDone =
        activeStepIndex !== null && (arrived || idx < activeStepIndex);
      const isCurrentTarget =
        activeStepIndex !== null && !arrived && idx === activeStepIndex;

      const pinBg = isTampered
        ? '#FF5A5F'
        : isStepDone
        ? '#252a31'
        : isCurrentTarget
        ? '#61F9B1'
        : '#3DDC97';
      const pinFg = isStepDone ? '#3DDC97' : '#002112';
      const badgeLabel = isStepDone ? '✓' : String(idx + 1);
      const safeName = escapeHtml(
        wp.name.length > 18 ? `${wp.name.slice(0, 17)}…` : wp.name
      );

      const icon = L.divIcon({
        className: 'ruto-custom-pin',
        iconSize: [120, 58],
        iconAnchor: [60, 18],
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
            <div style="
              width:${isCurrentTarget ? '38px' : '34px'};
              height:${isCurrentTarget ? '38px' : '34px'};
              border-radius:9999px;
              background:${pinBg};color:${pinFg};
              font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 0 ${isCurrentTarget ? '24px' : '16px'} ${
          isTampered
            ? 'rgba(255,90,95,0.55)'
            : isCurrentTarget
            ? 'rgba(97,249,177,0.85)'
            : 'rgba(61,220,151,0.45)'
        };
              border:${isCurrentTarget ? '3px solid #F6F4EE' : '2px solid #0f141a'};
            ">${badgeLabel}</div>
            <div style="
              margin-top:4px;padding:2px 8px;border-radius:9999px;
              background:rgba(15,20,26,0.92);color:#F6F4EE;
              border:1px solid ${isCurrentTarget ? '#3DDC97' : '#2A3541'};
              font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;
              white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.45);
            ">${safeName}</div>
          </div>
        `,
      });

      const marker = L.marker([wp.lat, wp.lng], { icon }).addTo(markersLayer);
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (allowManualTapRef.current && onManualTapRef.current) {
          onManualTapRef.current(wp.lat, wp.lng);
          return;
        }
        if (onSelectWaypointRef.current) {
          onSelectWaypointRef.current(wp.id);
        }
      });
    });

    if (!interactive && !liveUserPos && waypoints.length > 0) {
      if (waypoints.length === 1) {
        map.setView([waypoints[0].lat, waypoints[0].lng], 16);
      } else {
        const bounds = L.latLngBounds(waypoints.map((w) => [w.lat, w.lng]));
        map.fitBounds(bounds, { padding: [38, 38], maxZoom: 17 });
      }
    }
  }, [waypoints, interactive, isTampered, activeStepIndex, arrived, liveUserPos]);

  // Render blue "you are here" dot following liveUserPos (on-device only)
  useEffect(() => {
    const map = mapRef.current;
    const liveLayer = liveUserLayerRef.current;
    if (!map || !liveLayer) return;

    liveLayer.clearLayers();
    if (!liveUserPos) return;

    // Accuracy halo circle
    L.circle([liveUserPos.lat, liveUserPos.lng], {
      radius: Math.max(8, Math.min(liveUserPos.accuracy, 200)),
      color: '#3B82F6',
      weight: 1.5,
      opacity: 0.45,
      fillColor: '#3B82F6',
      fillOpacity: 0.14,
    }).addTo(liveLayer);

    // Blue "You are here" dot
    const blueDotIcon = L.divIcon({
      className: 'ruto-you-are-here',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `
        <div style="
          width:28px;height:28px;border-radius:9999px;
          background:rgba(59,130,246,0.28);
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="
            width:16px;height:16px;border-radius:9999px;
            background:#2563EB;border:3px solid #FFFFFF;
            box-shadow:0 0 12px rgba(37,99,235,0.85);
          "></div>
        </div>
      `,
    });

    L.marker([liveUserPos.lat, liveUserPos.lng], {
      icon: blueDotIcon,
      zIndexOffset: 1000,
    })
      .bindTooltip('You are here', { direction: 'top', offset: [0, -10] })
      .addTo(liveLayer);

    map.panTo([liveUserPos.lat, liveUserPos.lng], { animate: true });
  }, [liveUserPos]);

  const handleUseMyLocation = () => {
    const map = mapRef.current;
    if (!map) return;

    if (!navigator.geolocation) {
      setGeoNotice('Geolocation is not supported in this browser.');
      setTimeout(() => setGeoNotice(null), 3500);
      return;
    }

    setLocating(true);
    setGeoNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], 17, { duration: 0.8 });

        if (liveUserLayerRef.current && !liveUserPos) {
          liveUserLayerRef.current.clearLayers();
          L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#FFFFFF',
            weight: 2.5,
            fillColor: '#2563EB',
            fillOpacity: 1,
          })
            .bindTooltip('You are here', { direction: 'top' })
            .addTo(liveUserLayerRef.current);
        }
      },
      () => {
        setLocating(false);
        map.flyTo(DEFAULT_CAMPUS_CENTER, 16, { duration: 0.6 });
        setGeoNotice('Location permission unavailable — centered on FUOYE Campus.');
        setTimeout(() => setGeoNotice(null), 3500);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const activeBanner = allowManualPositionTap
    ? 'Tap map to place blue "You are here" dot'
    : bannerText;

  return (
    <div
      className={`relative w-full overflow-hidden ${heightClass} ${
        theme === 'dark' ? 'ruto-map-dark' : 'ruto-map-mint'
      }`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      {activeBanner && (
        <div className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-[400] max-w-[90%]">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#11161C]/90 backdrop-blur-md border border-[#2A3541] shadow-lg">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                allowManualPositionTap ? 'bg-[#3B82F6]' : 'bg-[#3DDC97]'
              }`}
            />
            <span className="font-mono text-xs text-[#F6F4EE] truncate">
              {activeBanner}
            </span>
          </div>
        </div>
      )}

      {geoNotice && (
        <div className="pointer-events-none absolute bottom-14 left-3 right-16 z-[400]">
          <div className="px-3 py-2 rounded-xl bg-[#1A222B]/95 border border-[#3DDC97]/40 text-xs text-[#F6F4EE] shadow-lg">
            {geoNotice}
          </div>
        </div>
      )}

      <div className="absolute bottom-5 right-3.5 z-[400] flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          title="Use my location"
          aria-label="Use my location"
          className="w-11 h-11 rounded-full bg-[#1A222B]/95 hover:bg-[#222C37] active:scale-95 transition-all border border-[#2A3541] hover:border-[#3DDC97] text-[#F6F4EE] flex items-center justify-center shadow-lg cursor-pointer"
        >
          <Crosshair
            className={`w-5 h-5 ${
              locating ? 'text-[#3DDC97] animate-spin' : 'text-[#F6F4EE]'
            }`}
          />
        </button>

        {interactive && onResetWaypoints && waypoints.length > 0 && (
          <button
            type="button"
            onClick={onResetWaypoints}
            title="Clear pins"
            aria-label="Clear pins"
            className="w-11 h-11 rounded-full bg-[#1A222B]/95 hover:bg-[#222C37] active:scale-95 transition-all border border-[#2A3541] hover:border-[#FF5A5F] text-[#B9C2CC] hover:text-[#FF5A5F] flex items-center justify-center shadow-lg cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
