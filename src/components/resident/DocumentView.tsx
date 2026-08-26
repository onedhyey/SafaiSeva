import React, { useState, useEffect, useRef } from 'react';
import { StreamChecklist, LocationData, HouseholdProfile } from '../../types';
import { Camera, Check, MapPin, Upload, Image as ImageIcon, Sparkles } from 'lucide-react';
import { createBinPhotoSvg } from '../../lib/seed';

interface DocumentViewProps {
  household: HouseholdProfile;
  onSubmit: (data: {
    photoUrl: string;
    streams: StreamChecklist;
    location: LocationData;
  }) => void;
  onCancel: () => void;
}

export const DocumentView: React.FC<DocumentViewProps> = ({
  household,
  onSubmit,
  onCancel,
}) => {
  const [streams, setStreams] = useState<StreamChecklist>({
    wet: true,
    dry: true,
    sanitary: false,
    special_care: false,
  });

  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isCapturingLocation, setIsCapturingLocation] = useState<boolean>(true);
  const [location, setLocation] = useState<LocationData>({
    lat: 23.0384,
    lng: 72.5592,
    address: household.address,
    isFallback: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize GPS or fallback
  useEffect(() => {
    let mounted = true;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted) return;
          setLocation({
            lat: Number(pos.coords.latitude.toFixed(4)),
            lng: Number(pos.coords.longitude.toFixed(4)),
            address: `${household.address} (GPS Lock: ${pos.coords.latitude.toFixed(3)}°N, ${pos.coords.longitude.toFixed(3)}°E)`,
            isFallback: false,
          });
          setIsCapturingLocation(false);
        },
        () => {
          if (!mounted) return;
          // Graceful fallback to registered address
          setLocation({
            lat: 23.0384,
            lng: 72.5592,
            address: `${household.address} (AMC Registered Polygon Fallback)`,
            isFallback: true,
          });
          setIsCapturingLocation(false);
        },
        { timeout: 3500, enableHighAccuracy: false }
      );
    } else {
      setIsCapturingLocation(false);
    }

    // Set default demo capture photo if none set
    if (!photoUrl) {
      setPhotoUrl(createBinPhotoSvg(`${household.id} / Morning Handover`, true, '#19A85B'));
    }

    return () => {
      mounted = false;
    };
  }, [household]);

  // Handle image upload and resize to max 800px on long edge
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxEdge = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxEdge || h > maxEdge) {
          if (w > h) {
            h = Math.round((h * maxEdge) / w);
            w = maxEdge;
          } else {
            w = Math.round((w * maxEdge) / h);
            h = maxEdge;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setPhotoUrl(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          setPhotoUrl(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const toggleStream = (key: keyof StreamChecklist) => {
    setStreams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl) return;
    onSubmit({
      photoUrl,
      streams,
      location,
    });
  };

  return (
    <div className="space-y-4 pb-20 pt-1 text-left">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-sm font-semibold text-white">Document Handover</h1>
          <p className="text-xs text-muted-l">AMC 4-stream source segregation protocol</p>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-muted-l hover:text-white px-2 py-1"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Stream Checklist */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-l px-1">
            Confirmed Separated Streams
          </label>

          <div className="grid grid-cols-2 gap-2">
            {/* Wet */}
            <button
              type="button"
              onClick={() => toggleStream('wet')}
              className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between ${
                streams.wet
                  ? 'bg-ink-soft border-green text-white'
                  : 'bg-ink border-muted/30 text-muted-l'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-green" />
                  <span className="text-xs font-semibold text-tint">Wet Stream</span>
                </div>
                <div className="text-[11px] text-muted-l mt-0.5">લીલો કચરો (Organic/Food)</div>
              </div>
              <div
                className={`w-4 h-4 rounded-xs border flex items-center justify-center ${
                  streams.wet ? 'bg-green border-green text-ink' : 'border-muted/40'
                }`}
              >
                {streams.wet && <Check size={12} strokeWidth={3} />}
              </div>
            </button>

            {/* Dry */}
            <button
              type="button"
              onClick={() => toggleStream('dry')}
              className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between ${
                streams.dry
                  ? 'bg-ink-soft border-muted-l text-white'
                  : 'bg-ink border-muted/30 text-muted-l'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-muted-l" />
                  <span className="text-xs font-semibold text-tint">Dry Stream</span>
                </div>
                <div className="text-[11px] text-muted-l mt-0.5">સૂકો કચરો (Paper/Plastic)</div>
              </div>
              <div
                className={`w-4 h-4 rounded-xs border flex items-center justify-center ${
                  streams.dry ? 'bg-muted-l border-muted-l text-ink' : 'border-muted/40'
                }`}
              >
                {streams.dry && <Check size={12} strokeWidth={3} />}
              </div>
            </button>

            {/* Sanitary */}
            <button
              type="button"
              onClick={() => toggleStream('sanitary')}
              className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between ${
                streams.sanitary
                  ? 'bg-ink-soft border-amber text-white'
                  : 'bg-ink border-muted/30 text-muted-l'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-amber" />
                  <span className="text-xs font-semibold text-tint">Sanitary</span>
                </div>
                <div className="text-[11px] text-muted-l mt-0.5">સેનિટરી (Wrapped & Marked)</div>
              </div>
              <div
                className={`w-4 h-4 rounded-xs border flex items-center justify-center ${
                  streams.sanitary ? 'bg-amber border-amber text-ink' : 'border-muted/40'
                }`}
              >
                {streams.sanitary && <Check size={12} strokeWidth={3} />}
              </div>
            </button>

            {/* Special Care */}
            <button
              type="button"
              onClick={() => toggleStream('special_care')}
              className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between ${
                streams.special_care
                  ? 'bg-ink-soft border-red text-white'
                  : 'bg-ink border-muted/30 text-muted-l'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-xs bg-red" />
                  <span className="text-xs font-semibold text-tint">Special Care</span>
                </div>
                <div className="text-[11px] text-muted-l mt-0.5">વિશેષ કચરો (Hazard/E-waste)</div>
              </div>
              <div
                className={`w-4 h-4 rounded-xs border flex items-center justify-center ${
                  streams.special_care ? 'bg-red border-red text-ink' : 'border-muted/40'
                }`}
              >
                {streams.special_care && <Check size={12} strokeWidth={3} />}
              </div>
            </button>
          </div>
        </div>

        {/* Photo Capture Section */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-l px-1">
            Photo Verification
          </label>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="bg-ink-soft border border-muted/30 rounded-lg p-3 text-center space-y-3">
            {photoUrl ? (
              <div className="relative rounded-md overflow-hidden bg-ink aspect-[4/3] flex items-center justify-center border border-muted/20">
                <img
                  src={photoUrl}
                  alt="Waste segregation capture"
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2 bg-ink/90 text-white text-xs font-medium px-2.5 py-1.5 rounded-md border border-muted/40 flex items-center gap-1.5 transition-colors"
                >
                  <Camera size={13} />
                  <span>Retake Photo</span>
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-muted/40 rounded-md p-6 text-center hover:border-green transition-colors"
              >
                <Camera size={28} className="mx-auto text-muted-l mb-2" />
                <div className="text-xs font-medium text-tint">Take or select photo of 4 streams</div>
                <div className="text-[11px] text-muted-l mt-1">
                  Ensure all bins are visible in clear morning light
                </div>
              </div>
            )}

            {/* Quick Demo Presets for Jury without live bins */}
            <div className="pt-2 border-t border-muted/20 flex items-center justify-between text-[11px] text-muted-l">
              <span className="font-mono">Demo Presets:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPhotoUrl(createBinPhotoSvg('Clean 4-Stream Bins', true, '#19A85B'))}
                  className="bg-ink hover:bg-muted/20 px-2 py-1 rounded-sm border border-muted/30 text-tint"
                >
                  Clean Bins
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoUrl(createBinPhotoSvg('Dim Morning Light', false, '#F0A83C'))}
                  className="bg-ink hover:bg-muted/20 px-2 py-1 rounded-sm border border-muted/30 text-tint"
                >
                  Dim Light
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-ink hover:bg-muted/20 px-2 py-1 rounded-sm border border-muted/30 text-green inline-flex items-center gap-1"
                >
                  <Upload size={11} />
                  <span>Upload File</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Auto-Capture Card */}
        <div className="bg-ink-soft p-3 rounded-md border border-muted/20 space-y-1.5 text-xs text-muted-l">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MapPin size={13} className="text-green" />
              <span>Location GPS</span>
            </span>
            <span className="font-mono text-tint text-[11px] truncate max-w-[200px]">
              {isCapturingLocation ? 'Acquiring GPS...' : location.address}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-muted/10">
            <span>Route Collection Window</span>
            <span className="font-mono text-tint text-[11px]">
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} (Active)
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-green hover:bg-[#16934f] text-ink font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[48px]"
        >
          <Sparkles size={16} />
          <span>Verify with AI Analysis</span>
        </button>
      </form>
    </div>
  );
};
