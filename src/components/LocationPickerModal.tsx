import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Search, Crosshair, Check } from 'lucide-react';
import { LocationData } from '../types';
import { calculateDistanceKm, getNearestAhmedabadPlace } from '../lib/ahmedabadGeo';
import { searchPlaces, reverseGeocode, coordLabel, GeoHit } from '../lib/geocode';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: LocationData;
  onLocationSelected: (newLocation: LocationData) => void;
}

// Default map framing: whole of India is reachable (minZoom 4), opens fitted to Gujarat.
const GUJARAT_BOUNDS = L.latLngBounds([20.05, 68.1], [24.72, 74.48]);
const INDIA_MAX_BOUNDS = L.latLngBounds([5.5, 66.5], [37.5, 99.5]);
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; OpenStreetMap contributors';

const pinIcon = L.divIcon({
  className: '',
  html:
    '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15 41C15 41 28 25.5 28 14A13 13 0 1 0 2 14C2 25.5 15 41 15 41Z" ' +
    'fill="#10b981" stroke="#ffffff" stroke-width="2.5"/>' +
    '<circle cx="15" cy="14" r="5" fill="#ffffff"/></svg>',
  iconSize: [30, 42],
  iconAnchor: [15, 41],
});

function hasRealPoint(loc: LocationData): boolean {
  return (
    typeof loc.lat === 'number' &&
    typeof loc.lng === 'number' &&
    Math.abs(loc.lat) > 0.01 &&
    Math.abs(loc.lng) > 0.01 &&
    !loc.isFallback
  );
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onLocationSelected,
}) => {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<LocationData['source']>('manual_pin');
  const [address, setAddress] = useState<string>('');
  const [addressEdited, setAddressEdited] = useState<boolean>(false);
  const [resolving, setResolving] = useState<boolean>(false);

  const [gpsBusy, setGpsBusy] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<GeoHit[]>([]);
  const [searchBusy, setSearchBusy] = useState<boolean>(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const revSeq = useRef(0);

  // ---- point setter: moves marker, pans, and (unless user typed) reverse-geocodes ----
  const setPoint = useCallback(
    (nlat: number, nlng: number, opts: { acc?: number; src?: LocationData['source']; recenterZoom?: number } = {}) => {
      setLat(nlat);
      setLng(nlng);
      setAccuracy(opts.acc);
      if (opts.src) setSource(opts.src);

      const map = mapRef.current;
      if (map) {
        if (!markerRef.current) {
          markerRef.current = L.marker([nlat, nlng], { icon: pinIcon, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const p = markerRef.current!.getLatLng();
            setPoint(p.lat, p.lng, { src: 'manual_pin' });
          });
        } else {
          markerRef.current.setLatLng([nlat, nlng]);
        }
        if (circleRef.current) {
          circleRef.current.remove();
          circleRef.current = null;
        }
        if (opts.acc && opts.acc > 0) {
          circleRef.current = L.circle([nlat, nlng], {
            radius: opts.acc,
            color: '#10b981',
            weight: 1,
            fillColor: '#10b981',
            fillOpacity: 0.12,
          }).addTo(map);
        }
        if (opts.recenterZoom) map.setView([nlat, nlng], opts.recenterZoom);
        else map.panTo([nlat, nlng]);
      }

      if (!addressEdited) {
        const seq = ++revSeq.current;
        setResolving(true);
        setAddress(coordLabel(nlat, nlng));
        reverseGeocode(nlat, nlng).then((addr) => {
          if (seq === revSeq.current) {
            setAddress(addr);
            setResolving(false);
          }
        });
      }
    },
    [addressEdited]
  );

  // ---- init / teardown map with the modal ----
  useEffect(() => {
    if (!isOpen || !mapDivRef.current) return;

    const start = hasRealPoint(currentLocation);
    const map = L.map(mapDivRef.current, {
      minZoom: 4,
      maxBounds: INDIA_MAX_BOUNDS,
      maxBoundsViscosity: 0.6,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
    mapRef.current = map;

    // seed state from props
    setAddressEdited(false);
    setGpsError(null);
    setQuery('');
    setResults([]);

    if (start) {
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
      setAccuracy(currentLocation.accuracyMeters);
      setSource(currentLocation.source ?? 'manual_pin');
      setAddress(currentLocation.address || coordLabel(currentLocation.lat, currentLocation.lng));
      map.setView([currentLocation.lat, currentLocation.lng], 16);
      markerRef.current = L.marker([currentLocation.lat, currentLocation.lng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLatLng();
        setPoint(p.lat, p.lng, { src: 'manual_pin' });
      });
    } else {
      setLat(null);
      setLng(null);
      setAddress('');
      map.fitBounds(GUJARAT_BOUNDS);
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      setPoint(e.latlng.lat, e.latlng.lng, { src: 'manual_pin' });
    });

    const t = setTimeout(() => map.invalidateSize(), 60);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // re-run only when the modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---- debounced forward search ----
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearchBusy(true);
    const h = setTimeout(async () => {
      const hits = await searchPlaces(q);
      setResults(hits);
      setSearchBusy(false);
    }, 450);
    return () => clearTimeout(h);
  }, [query]);

  if (!isOpen) return null;

  const detectGps = () => {
    setGpsBusy(true);
    setGpsError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Location is not available in this browser.');
      setGpsBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        setAddressEdited(false);
        setPoint(pos.coords.latitude, pos.coords.longitude, {
          acc: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
          src: 'gps',
          recenterZoom: 17,
        });
      },
      (err) => {
        setGpsBusy(false);
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it for this site, or set the pin on the map.'
            : 'Could not get a location fix. Set the pin on the map instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const pickResult = (hit: GeoHit) => {
    setQuery('');
    setResults([]);
    setAddressEdited(false);
    setPoint(hit.lat, hit.lng, { src: 'manual_search', recenterZoom: 15 });
  };

  const near = lat != null && lng != null ? getNearestAhmedabadPlace(lat, lng) : null;
  const nearAhmedabad =
    lat != null && lng != null && calculateDistanceKm(lat, lng, 23.0225, 72.5714) < 40;

  const confirm = () => {
    if (lat == null || lng == null) return;
    onLocationSelected({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address: address.trim() || coordLabel(lat, lng),
      isFallback: false,
      accuracyMeters: accuracy,
      landmark: nearAhmedabad ? near?.place.popularLandmarks[0] : undefined,
      ward: nearAhmedabad ? near?.place.ward : undefined,
      zone: nearAhmedabad ? near?.place.zone : undefined,
      source: source ?? 'manual_pin',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md select-none font-sans overflow-y-auto">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-xl p-4 sm:p-5 text-left text-zinc-200 relative shadow-2xl my-auto max-h-[92vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close location picker"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-3 pr-6">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded-xs border border-emerald-500/30 font-bold uppercase tracking-wider">
              <MapPin size={10} />
              <span>Handover Location</span>
            </span>
            {accuracy != null && (
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded-xs border border-emerald-500/20">
                ±{accuracy}m GPS
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white">Set your handover location</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Search a place, use your live location, or tap the map. The map covers all of India;
            it opens on Gujarat.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address or landmark (e.g. CG Road Ahmedabad)"
              className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-1"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {query.trim().length >= 3 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-[1200] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-h-52 overflow-y-auto divide-y divide-zinc-800/80">
              {searchBusy && <div className="p-3 text-center text-xs text-zinc-400">Searching…</div>}
              {!searchBusy && results.length === 0 && (
                <div className="p-3 text-center text-xs text-zinc-400">
                  No match. Try a broader term, or tap the map.
                </div>
              )}
              {!searchBusy &&
                results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full p-2.5 text-left hover:bg-zinc-800/80 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-white truncate">
                      {r.label.split(',').slice(0, 2).join(', ')}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">{r.label}</div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
          {/* The map */}
          <div
            ref={mapDivRef}
            className="w-full h-64 rounded-lg border border-zinc-700/80 overflow-hidden z-0"
          />

          <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400">
            <span className="text-emerald-400">
              {lat != null && lng != null ? coordLabel(lat, lng) : 'No point set — tap the map'}
            </span>
            <span>Tap map / drag pin to adjust</span>
          </div>

          {/* Live GPS */}
          <button
            type="button"
            onClick={detectGps}
            disabled={gpsBusy}
            className="w-full bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Crosshair
              size={14}
              className={gpsBusy ? 'animate-spin text-emerald-400' : 'text-emerald-400'}
            />
            <span>{gpsBusy ? 'Getting your location…' : 'Use my current location'}</span>
          </button>
          {gpsError && (
            <div className="text-[10px] text-amber-400 font-mono text-center">{gpsError}</div>
          )}

          {/* Address */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white">Address for this handover</label>
              <span className="text-[10px] font-mono text-zinc-500">
                {resolving ? 'looking up…' : 'editable'}
              </span>
            </div>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressEdited(true);
              }}
              placeholder="Flat / house, street, area"
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Summary */}
          {nearAhmedabad && near && (
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 space-y-1 text-[11px] font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Nearest known area:</span>
                <span className="text-emerald-400 font-bold">{near.place.ward}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Zone · Pincode:</span>
                <span className="text-zinc-200">
                  {near.place.zone} Zone · {near.place.pincode}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-800 flex gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-300 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={lat == null || lng == null}
            className="w-2/3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Check size={14} strokeWidth={3} />
            <span>Confirm location</span>
          </button>
        </div>
      </div>
    </div>
  );
};
