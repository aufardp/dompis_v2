'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MiniMapProps {
  lat: number;
  lng: number;
  draggable: boolean;
  accuracy?: number | null;
  className?: string;
  onPositionChange?: (lat: number, lng: number) => void;
}

const DEFAULT_ZOOM = 17;

function createIcon(drag: boolean) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 22px; height: 22px; border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${drag ? '#2563eb' : '#059669'};
        border: 2.5px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      "></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

export default function MiniMap({
  lat,
  lng,
  draggable,
  accuracy,
  className = '',
  onPositionChange,
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyLayerRef = useRef<L.Circle | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);

  onPositionChangeRef.current = onPositionChange;

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView([lat, lng], DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      icon: createIcon(draggable),
      draggable,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onPositionChangeRef.current?.(pos.lat, pos.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker position/icon when props change
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) > 1e-7 || Math.abs(current.lng - lng) > 1e-7) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng]);
    }

    marker.setIcon(createIcon(draggable));
    marker.options.draggable = draggable;
  }, [lat, lng, draggable]);

  // Accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (accuracyLayerRef.current) {
      map.removeLayer(accuracyLayerRef.current);
      accuracyLayerRef.current = null;
    }

    if (accuracy && accuracy > 0) {
      const circle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#2563eb',
        weight: 1,
        fillColor: '#2563eb',
        fillOpacity: 0.12,
      });
      circle.addTo(map);
      accuracyLayerRef.current = circle;
    }
  }, [lat, lng, accuracy]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-[14px] border border-(--border) ${className}`}
      style={{ height: 180, zIndex: 0 }}
    />
  );
}