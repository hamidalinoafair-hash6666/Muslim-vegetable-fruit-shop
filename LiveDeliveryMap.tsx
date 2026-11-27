import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SHOP_COORDINATES } from '../utils/calculations';

export interface LiveDeliveryMapProps {
  shopLocation?: { lat: number; lng: number; label?: string; name?: string };
  customerLocation?: { lat: number; lng: number; label?: string } | null;
  riderLocation?: { lat: number; lng: number; label?: string; updatedAt?: string } | null;
  extraRiders?: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    updatedAt?: string;
    isLive?: boolean;
  }>;
  extraStops?: Array<{
    id: string;
    label: string;
    lat: number;
    lng: number;
    status?: string;
  }>;
  routeGeometry?: Array<[number, number]> | null;
  heightClass?: string;
  onCustomerPinChange?: (lat: number, lng: number) => void;
}

function makeDivIcon(bg: string, emoji: string, pulse = false, labelText?: string) {
  const pulseRing = pulse
    ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${bg};opacity:0.35;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>`
    : '';
  const tag = labelText
    ? `<div style="margin-top:2px;background:#0f172a;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">${labelText}</div>`
    : '';
  return L.divIcon({
    className: 'mvfs-leaflet-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
      <div style="position:relative;width:34px;height:34px;border-radius:9999px;background:${bg};border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;font-size:16px;">
        ${pulseRing}
        <span style="position:relative;z-index:2;">${emoji}</span>
      </div>
      ${tag}
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export const LiveDeliveryMap: React.FC<LiveDeliveryMapProps> = ({
  shopLocation = { lat: SHOP_COORDINATES.lat, lng: SHOP_COORDINATES.lng, label: SHOP_COORDINATES.name },
  customerLocation,
  riderLocation,
  extraRiders = [],
  extraStops = [],
  routeGeometry,
  heightClass = 'h-64 sm:h-72',
  onCustomerPinChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shopMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const extrasLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string>('');
  const pinChangeRef = useRef(onCustomerPinChange);
  pinChangeRef.current = onCustomerPinChange;

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [shopLocation.lat, shopLocation.lng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    extrasLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (ev: L.LeafletMouseEvent) => {
      if (pinChangeRef.current) {
        pinChangeRef.current(ev.latlng.lat, ev.latlng.lng);
      }
    });
    mapRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      shopMarkerRef.current = null;
      customerMarkerRef.current = null;
      riderMarkerRef.current = null;
      routeLineRef.current = null;
      extrasLayerRef.current = null;
    };
  }, []);

  // Update markers & polylines smoothly whenever props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const boundsPoints: L.LatLngExpression[] = [];

    // 1. Shop Pin (Camp Chowk, Khanewal)
    if (Number.isFinite(shopLocation.lat) && Number.isFinite(shopLocation.lng)) {
      const pos: L.LatLngExpression = [shopLocation.lat, shopLocation.lng];
      boundsPoints.push(pos);
      const shopPopupText = shopLocation.label || shopLocation.name || 'Camp Chowk, Khanewal';
      if (!shopMarkerRef.current) {
        shopMarkerRef.current = L.marker(pos, {
          icon: makeDivIcon('#166534', '🏪', false, 'Shop'),
        })
          .addTo(map)
          .bindPopup(
            `<strong>Muslim Vegetable & Fruit Shop</strong><br/>${shopPopupText}`
          );
      } else {
        shopMarkerRef.current.setLatLng(pos);
      }
    }

    // 2. Customer Pin
    if (customerLocation && Number.isFinite(customerLocation.lat) && Number.isFinite(customerLocation.lng)) {
      const pos: L.LatLngExpression = [customerLocation.lat, customerLocation.lng];
      boundsPoints.push(pos);
      if (!customerMarkerRef.current) {
        const draggable = Boolean(pinChangeRef.current);
        customerMarkerRef.current = L.marker(pos, {
          icon: makeDivIcon('#b45309', '📍', false, 'Destination'),
          draggable,
        })
          .addTo(map)
          .bindPopup(`<strong>Delivery Destination</strong><br/>${customerLocation.label || 'Khanewal'}`);
        if (draggable) {
          customerMarkerRef.current.on('dragend', () => {
            const ll = customerMarkerRef.current?.getLatLng();
            if (ll && pinChangeRef.current) {
              pinChangeRef.current(ll.lat, ll.lng);
            }
          });
        }
      } else {
        customerMarkerRef.current.setLatLng(pos);
      }
    } else if (customerMarkerRef.current) {
      customerMarkerRef.current.remove();
      customerMarkerRef.current = null;
    }

    // 3. Single Active Rider Pin (Smooth move without destroying marker)
    if (riderLocation && Number.isFinite(riderLocation.lat) && Number.isFinite(riderLocation.lng)) {
      const pos: L.LatLngExpression = [riderLocation.lat, riderLocation.lng];
      boundsPoints.push(pos);
      const timeStr = riderLocation.updatedAt
        ? new Date(riderLocation.updatedAt).toLocaleTimeString('en-PK')
        : 'Live';
      if (!riderMarkerRef.current) {
        riderMarkerRef.current = L.marker(pos, {
          icon: makeDivIcon('#0284c7', '🛵', true, riderLocation.label || 'Rider LIVE'),
          zIndexOffset: 500,
        })
          .addTo(map)
          .bindPopup(`<strong>${riderLocation.label || 'Delivery Rider'}</strong><br/>Live GPS: ${timeStr}`);
      } else {
        riderMarkerRef.current.setLatLng(pos);
        riderMarkerRef.current.setPopupContent(
          `<strong>${riderLocation.label || 'Delivery Rider'}</strong><br/>Live GPS: ${timeStr}`
        );
      }
    } else if (riderMarkerRef.current) {
      riderMarkerRef.current.remove();
      riderMarkerRef.current = null;
    }

    // 4. Extra Fleet Riders & Stops (Admin Fleet Map)
    if (extrasLayerRef.current) {
      extrasLayerRef.current.clearLayers();
      for (const r of extraRiders) {
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
        boundsPoints.push([r.lat, r.lng]);
        L.marker([r.lat, r.lng], {
          icon: makeDivIcon(r.isLive ? '#0284c7' : '#475569', '🛵', Boolean(r.isLive), r.id),
        })
          .bindPopup(
            `<strong>${r.name}</strong> (${r.id})<br/>${
              r.updatedAt ? `Updated: ${new Date(r.updatedAt).toLocaleTimeString('en-PK')}` : 'Base Location'
            }`
          )
          .addTo(extrasLayerRef.current);
      }
      for (const s of extraStops) {
        if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
        boundsPoints.push([s.lat, s.lng]);
        L.marker([s.lat, s.lng], {
          icon: makeDivIcon('#d97706', '📦', false, `#${s.id}`),
        })
          .bindPopup(`<strong>Order #${s.id}</strong><br/>${s.label}<br/>Status: ${s.status || ''}`)
          .addTo(extrasLayerRef.current);
      }
    }

    // 5. Route Polyline (OSRM Road Geometry when available, or dashed direct guide)
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (Array.isArray(routeGeometry) && routeGeometry.length >= 2) {
      routeLineRef.current = L.polyline(routeGeometry, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
      }).addTo(map);
    } else if (riderLocation && customerLocation) {
      routeLineRef.current = L.polyline(
        [
          [riderLocation.lat, riderLocation.lng],
          [customerLocation.lat, customerLocation.lng],
        ],
        {
          color: '#0284c7',
          weight: 3,
          dashArray: '6, 8',
          opacity: 0.75,
        }
      ).addTo(map);
    }

    // Fit map bounds once when endpoints change cleanly
    const fitKey = `${customerLocation?.lat || ''},${customerLocation?.lng || ''}|${riderLocation ? 'R' : 'N'}|${extraStops.length}|${extraRiders.length}`;
    if (boundsPoints.length >= 2 && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], maxZoom: 15 });
    } else if (boundsPoints.length === 1 && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      map.setView(boundsPoints[0], 15);
    }
  }, [shopLocation, customerLocation, riderLocation, extraRiders, extraStops, routeGeometry]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-xs">
      <div ref={containerRef} className={`w-full ${heightClass} z-0`} />
      <div className="bg-white/95 backdrop-blur-xs border-t border-slate-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span>🏪 Shop (Camp Chowk)</span>
          {customerLocation && <span>📍 Customer Destination</span>}
          {onCustomerPinChange && (
            <span className="text-emerald-800">👆 Tap map or drag 📍 pin</span>
          )}
          {(riderLocation || extraRiders.length > 0) && <span className="text-sky-700">🛵 Live Rider GPS</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const pts: L.LatLngExpression[] = [[shopLocation.lat, shopLocation.lng]];
            if (customerLocation) pts.push([customerLocation.lat, customerLocation.lng]);
            if (riderLocation) pts.push([riderLocation.lat, riderLocation.lng]);
            extraRiders.forEach((r) => pts.push([r.lat, r.lng]));
            extraStops.forEach((s) => pts.push([s.lat, s.lng]));
            if (pts.length >= 2) {
              map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
            } else {
              map.setView(pts[0], 15);
            }
          }}
          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
        >
          Re-Center Map
        </button>
      </div>
    </div>
  );
};
