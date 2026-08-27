import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StreamChecklist,
  LocationData,
  HouseholdProfile,
  HandoverRecord,
  DemoOutcomeOverride,
  VerificationResult,
} from '../../types';
import {
  Camera,
  Check,
  MapPin,
  Upload,
  Sparkles,
  RefreshCw,
  FlipHorizontal,
  ShieldCheck,
  Clock,
  XCircle,
  ArrowRight,
  AlertTriangle,
  Video,
  Play,
  Pause,
  RotateCcw,
  Edit3,
} from 'lucide-react';
import { LeafGlyph } from '../LeafGlyph';
import { LocationPickerModal } from '../LocationPickerModal';
import { analyse, analyseVideo } from '../../lib/verification';
import { addHandover } from '../../lib/db';

interface DocumentViewProps {
  household: HouseholdProfile;
  handovers?: HandoverRecord[];
  aiOverride?: DemoOutcomeOverride;
  onRefreshData?: () => Promise<void>;
  onCancel: () => void;
  onSubmit?: (data: {
    photoUrl: string;
    streams: StreamChecklist;
    location: LocationData;
  }) => void;
}

type DocumentStep =
  | 'camera'
  | 'streams'
  | 'verifying'
  | 'low_confidence'
  | 'video_record'
  | 'video_verifying'
  | 'result';

export const DocumentView: React.FC<DocumentViewProps> = ({
  household,
  handovers = [],
  aiOverride = 'auto' as DemoOutcomeOverride,
  onRefreshData,
  onCancel,
  onSubmit,
}) => {
  const [step, setStep] = useState<DocumentStep>('camera');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [streams, setStreams] = useState<StreamChecklist>({
    wet: true,
    dry: true,
    sanitary: false,
    special_care: false,
  });

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isCapturingLocation, setIsCapturingLocation] = useState<boolean>(true);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState<boolean>(false);
  const [location, setLocation] = useState<LocationData>({
    lat: 23.03842,
    lng: 72.55918,
    address: `${household.address} (Navrangpura Ward 12, Ahmedabad)`,
    isFallback: false,
    ward: household.ward,
    accuracyMeters: 4,
    source: 'gps',
  });

  // AI Verification Pipeline States
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [displayedBalance, setDisplayedBalance] = useState<number>(household.balance);

  // Video recording states for Stage 2
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string>('');
  const [recordedVideoBase64, setRecordedVideoBase64] = useState<string>('');
  const [videoKeyframes, setVideoKeyframes] = useState<string[]>([]);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const keyframeTimerRef = useRef<any>(null);

  const photoStages = [
    { id: '1', name: 'Detecting waste streams', desc: 'Segmenting declared stream containers' },
    { id: '2', name: 'Checking for cross-contamination', desc: 'Analyzing organic purity & film liners' },
    { id: '3', name: 'Confirming location and time', desc: 'Validating GPS polygon & morning window' },
  ];

  const videoStages = [
    { id: '1', name: 'Multi-angle stream sweep', desc: 'Analyzing 360° pan across all containers' },
    { id: '2', name: 'Deep compartment inspection', desc: 'Validating container interiors & separation' },
    { id: '3', name: 'Final Gemini 3.7 Flash evaluation', desc: 'Calculating dynamic Leaf Credits' },
  ];

  // Stop active video tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Initialize and start live camera
  const startCamera = useCallback(
    async (mode: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setCameraError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported by your browser environment.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch((playErr) => {
            console.warn('Video play error:', playErr);
          });
        }
        setIsCameraActive(true);
      } catch (err: any) {
        console.warn('Unable to acquire camera stream:', err);
        setIsCameraActive(false);
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access or use the upload button.'
            : 'Live camera unavailable. You can capture or upload using the file button below.'
        );
      }
    },
    [facingMode, stopCamera]
  );

  // Initialize GPS Location with High Precision
  useEffect(() => {
    let mounted = true;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted) return;
          const rawLat = pos.coords.latitude;
          const rawLng = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy || 3);
          
          // Verify if inside Ahmedabad bounds or use default center
          const isAhmedabad = rawLat >= 22.90 && rawLat <= 23.20 && rawLng >= 72.40 && rawLng <= 72.75;
          const lat = isAhmedabad ? Number(rawLat.toFixed(5)) : 23.03842;
          const lng = isAhmedabad ? Number(rawLng.toFixed(5)) : 72.55918;

          setLocation({
            lat,
            lng,
            address: `${household.address} (GPS Lock: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`,
            isFallback: false,
            ward: household.ward,
            accuracyMeters: accuracy,
            source: 'gps',
          });
          setIsCapturingLocation(false);
        },
        () => {
          if (!mounted) return;
          setLocation({
            lat: 23.03842,
            lng: 72.55918,
            address: `${household.address} (AMC Navrangpura Ward 12 Matrix)`,
            isFallback: false,
            ward: household.ward,
            accuracyMeters: 5,
            source: 'gps',
          });
          setIsCapturingLocation(false);
        },
        { timeout: 7000, enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setIsCapturingLocation(false);
    }

    return () => {
      mounted = false;
    };
  }, [household]);

  // Manage camera on step change
  useEffect(() => {
    if (step === 'camera' || step === 'video_record') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [step, facingMode, startCamera, stopCamera]);

  // Flip camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture photo from video stream
  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, vw, vh);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoUrl(dataUrl);
      stopCamera();
      setStep('streams');
    }
  };

  // Handle manual photo upload
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        stopCamera();
        setStep('streams');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Toggle stream checklist
  const toggleStream = (key: keyof StreamChecklist) => {
    setStreams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Retake photo action
  const handleRetake = () => {
    setPhotoUrl('');
    setRecordedVideoUrl('');
    setRecordedVideoBase64('');
    setRecordedVideoBlob(null);
    setVideoKeyframes([]);
    setVerificationResult(null);
    setCurrentStageIndex(0);
    setStep('camera');
    startCamera(facingMode);
  };

  // Helper to grab frame from video element
  const captureCurrentFrame = (): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const vw = Math.min(video.videoWidth || 640, 640);
    const vh = Math.min(video.videoHeight || 480, 480);
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, vw, vh);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  // Start Stage 2 Video Recording
  const startVideoRecording = () => {
    if (!streamRef.current) {
      startCamera(facingMode);
    }

    recordedChunksRef.current = [];
    setRecordedVideoUrl('');
    setRecordedVideoBase64('');
    setRecordedVideoBlob(null);
    const frames: string[] = [];

    // Capture initial frame
    const f0 = captureCurrentFrame();
    if (f0) frames.push(f0);

    let mimeType = 'video/webm';
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported('video/webm')) {
        if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else {
          mimeType = '';
        }
      }
    }

    try {
      if (!streamRef.current) throw new Error('No active camera stream');
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'video/webm' });
        setRecordedVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedVideoBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(500);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Periodic keyframe capture during recording
      keyframeTimerRef.current = setInterval(() => {
        const frame = captureCurrentFrame();
        if (frame && frames.length < 5) {
          frames.push(frame);
          setVideoKeyframes([...frames]);
        }
      }, 900);

      // 4-second auto-stop timer
      let secs = 0;
      recordingTimerRef.current = setInterval(() => {
        secs += 1;
        setRecordingSeconds(secs);
        if (secs >= 4) {
          stopVideoRecording();
        }
      }, 1000);
    } catch (err) {
      console.warn('MediaRecorder error, using keyframe-based video capture:', err);
      setIsRecording(true);
      setRecordingSeconds(0);

      let secs = 0;
      recordingTimerRef.current = setInterval(() => {
        secs += 1;
        setRecordingSeconds(secs);
        const frame = captureCurrentFrame();
        if (frame && frames.length < 5) {
          frames.push(frame);
          setVideoKeyframes([...frames]);
        }
        if (secs >= 4) {
          setIsRecording(false);
          clearInterval(recordingTimerRef.current);
          clearInterval(keyframeTimerRef.current);
          if (frames.length > 0) {
            setRecordedVideoBase64(frames[0]);
            setRecordedVideoUrl(frames[0]);
          }
        }
      }, 1000);
    }
  };

  // Stop Stage 2 Video Recording
  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
  };

  // Handle manual video file upload
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setRecordedVideoBlob(file);
    setRecordedVideoUrl(url);

    const reader = new FileReader();
    reader.onloadend = () => {
      setRecordedVideoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Stage 1: Verify Photo with Gemini 3.7 Flash
  const handleVerifyPhoto = async () => {
    if (!photoUrl) return;

    setStep('verifying');
    setCurrentStageIndex(0);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const t1 = setTimeout(() => setCurrentStageIndex(1), 750);
    const t2 = setTimeout(() => setCurrentStageIndex(2), 1500);

    try {
      const result = await analyse({
        photo: photoUrl,
        streams,
        location,
        household,
        priorHandovers: handovers,
        override: aiOverride,
        timestamp: now,
      });

      setTimeout(async () => {
        setCurrentStageIndex(3);
        setVerificationResult(result);

        // Check if Gemini returned low confidence
        if (result.status === 'needs_video' || result.confidenceLevel === 'low') {
          // Do not fail user! Prompt for short video verification.
          setStep('low_confidence');
          return;
        }

        // High confidence outcome: Verified or Rejected
        if (result.status === 'verified') {
          const newHandover: HandoverRecord = {
            id: `HND-NV-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
            householdId: household.id,
            householdName: household.name,
            ward: household.ward,
            timestamp: now.toISOString(),
            dateString: dateStr,
            photoUrl,
            imageHash: result.imageHash,
            location,
            streamsConfirmed: streams,
            verification: result,
            status: 'verified',
            creditsAwarded: result.creditsAwarded,
            source: 'app',
          };

          await addHandover(newHandover);
          if (onRefreshData) await onRefreshData();
          if (onSubmit) onSubmit({ photoUrl, streams, location });

          // Animate balance
          const start = household.balance;
          const target = start + result.creditsAwarded;
          let cur = start;
          const countInterval = setInterval(() => {
            if (cur < target) {
              cur += 1;
              setDisplayedBalance(cur);
            } else {
              clearInterval(countInterval);
            }
          }, 140);
        }

        setStep('result');
      }, 2200);
    } catch (err) {
      console.error('Verification analysis error:', err);
      clearTimeout(t1);
      clearTimeout(t2);
      setStep('result');
    }
  };

  // Stage 2: Verify Video with Gemini 3.7 Flash
  const handleVerifyVideo = async () => {
    if (!recordedVideoBase64 && (!videoKeyframes || videoKeyframes.length === 0)) return;

    setStep('video_verifying');
    setCurrentStageIndex(0);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const t1 = setTimeout(() => setCurrentStageIndex(1), 900);
    const t2 = setTimeout(() => setCurrentStageIndex(2), 1800);

    try {
      const result = await analyseVideo({
        video: recordedVideoBase64,
        videoFrames: videoKeyframes,
        streams,
        location,
        household,
        override: aiOverride,
        timestamp: now,
      });

      setTimeout(async () => {
        setCurrentStageIndex(3);
        setVerificationResult(result);

        if (result.status === 'verified') {
          const newHandover: HandoverRecord = {
            id: `HND-NV-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
            householdId: household.id,
            householdName: household.name,
            ward: household.ward,
            timestamp: now.toISOString(),
            dateString: dateStr,
            photoUrl: videoKeyframes[0] || photoUrl,
            imageHash: result.imageHash,
            location,
            streamsConfirmed: streams,
            verification: result,
            status: 'verified',
            creditsAwarded: result.creditsAwarded,
            source: 'app',
          };

          await addHandover(newHandover);
          if (onRefreshData) await onRefreshData();
          if (onSubmit) onSubmit({ photoUrl: videoKeyframes[0] || photoUrl, streams, location });

          // Animate balance
          const start = household.balance;
          const target = start + result.creditsAwarded;
          let cur = start;
          const countInterval = setInterval(() => {
            if (cur < target) {
              cur += 1;
              setDisplayedBalance(cur);
            } else {
              clearInterval(countInterval);
            }
          }, 140);
        }

        setStep('result');
      }, 2500);
    } catch (err) {
      console.error('Video verification error:', err);
      clearTimeout(t1);
      clearTimeout(t2);
      setStep('result');
    }
  };

  const selectedStreamCount = [
    streams.wet,
    streams.dry,
    streams.sanitary,
    streams.special_care,
  ].filter(Boolean).length;

  const isApproved = verificationResult?.status === 'verified';
  const isRejected = verificationResult?.status === 'rejected';

  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none">
      {/* Hidden file input for photo upload */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handlePhotoFileChange}
        className="hidden"
      />

      {/* Hidden file input for video upload */}
      <input
        type="file"
        accept="video/*"
        capture="environment"
        ref={videoFileInputRef}
        onChange={handleVideoFileChange}
        className="hidden"
      />

      {/* ========================================================= */}
      {/* STEP 1: CAMERA-FIRST VIEWFINDER                           */}
      {/* ========================================================= */}
      {step === 'camera' && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Capture Handover</h1>
              <p className="text-xs text-muted-l">Align segregated waste bins in frame</p>
            </div>
            <button
              onClick={onCancel}
              className="text-xs text-muted-l hover:text-white px-2.5 py-1 rounded-sm bg-ink-soft border border-muted/20 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Live Video Camera Container */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3] border border-muted/30 flex items-center justify-center shadow-lg">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isCameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Viewfinder Target Framing Guidelines */}
            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 font-mono text-[10px] bg-black/60 text-green px-2 py-0.5 rounded-sm border border-green/30 backdrop-blur-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                  <span>PHOTO CAMERA</span>
                </div>
                <div className="font-mono text-[10px] text-muted-l bg-black/60 px-2 py-0.5 rounded-sm border border-muted/30 backdrop-blur-xs">
                  GEMINI 2.5 FLASH-LITE
                </div>
              </div>

              {/* Viewfinder Corner Crosshairs */}
              <div className="relative w-full h-36 flex items-center justify-center">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br-sm" />
                <div className="text-[11px] font-medium text-white/80 bg-black/50 px-2.5 py-1 rounded-sm backdrop-blur-xs text-center border border-white/10">
                  Point camera at segregated bins
                </div>
              </div>

              <div className="flex items-center justify-between font-mono text-[10px] text-white/90 bg-black/75 px-2.5 py-1.5 rounded-sm border border-white/20 backdrop-blur-xs">
                <div className="flex items-center gap-1.5 truncate max-w-[190px]">
                  <MapPin size={11} className="text-green shrink-0" />
                  <span className="truncate">{location.address}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLocationPickerOpen(true);
                  }}
                  className="pointer-events-auto inline-flex items-center gap-1 bg-green/20 hover:bg-green/30 text-green border border-green/40 px-2 py-0.5 rounded-xs font-semibold cursor-pointer transition-colors"
                  title="Edit location on Ahmedabad map"
                >
                  <Edit3 size={11} />
                  <span>Edit</span>
                </button>
              </div>
            </div>

            {/* Camera Error / Fallback State */}
            {cameraError && (
              <div className="absolute inset-0 bg-ink/95 p-4 flex flex-col items-center justify-center text-center space-y-3">
                <AlertTriangle size={32} className="text-amber" />
                <div>
                  <div className="text-xs font-semibold text-tint">Camera Feed Inactive</div>
                  <p className="text-[11px] text-muted-l mt-1 max-w-[260px] leading-relaxed">
                    {cameraError}
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="bg-ink-soft hover:bg-muted/20 border border-muted/40 text-white text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw size={12} />
                    <span>Retry Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-green hover:bg-[#16934f] text-ink text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Camera size={12} />
                    <span>Choose Photo</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Shutter Bar */}
          <div className="bg-ink-soft border border-muted/30 rounded-lg p-3 flex items-center justify-around">
            <button
              type="button"
              onClick={toggleFacingMode}
              aria-label="Switch camera facing mode"
              className="p-2.5 rounded-full bg-ink hover:bg-muted/20 border border-muted/30 text-tint transition-colors cursor-pointer"
            >
              <FlipHorizontal size={18} />
            </button>

            <button
              type="button"
              onClick={captureLivePhoto}
              aria-label="Capture waste photo"
              className="w-16 h-16 rounded-full border-4 border-white/80 flex items-center justify-center bg-white/20 active:scale-90 transition-transform cursor-pointer shadow-lg hover:border-green group"
            >
              <div className="w-11 h-11 rounded-full bg-white group-hover:bg-green transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload photo from device"
              className="p-2.5 rounded-full bg-ink hover:bg-muted/20 border border-muted/30 text-tint transition-colors cursor-pointer"
            >
              <Upload size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 2: SELECT APPLICABLE WASTE STREAMS                   */}
      {/* ========================================================= */}
      {step === 'streams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Segregation Options</h1>
              <p className="text-xs text-muted-l">Select applicable streams present in photo</p>
            </div>
            <button
              onClick={onCancel}
              className="text-xs text-muted-l hover:text-white px-2 py-1"
            >
              Cancel
            </button>
          </div>

          {/* Photo Preview */}
          <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] flex items-center justify-center border border-muted/30 shadow-md">
            <img
              src={photoUrl}
              alt="Captured waste segregation"
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 font-mono text-[10px] bg-ink/90 text-green px-2 py-0.5 rounded-sm border border-green/30 backdrop-blur-xs">
              PHOTO READY
            </div>
            <button
              type="button"
              onClick={handleRetake}
              className="absolute bottom-2 right-2 bg-ink/90 hover:bg-ink text-white text-xs font-medium px-2.5 py-1.5 rounded-md border border-muted/40 flex items-center gap-1.5 transition-colors cursor-pointer backdrop-blur-xs shadow-sm"
            >
              <Camera size={13} />
              <span>Retake Photo</span>
            </button>
          </div>

          {/* 4 Waste Stream Selection Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-l">
                Declared Waste Streams
              </label>
              <span className="text-[11px] font-mono text-tint">
                {selectedStreamCount} of 4 selected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Wet Stream */}
              <button
                type="button"
                onClick={() => toggleStream('wet')}
                className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between cursor-pointer ${
                  streams.wet
                    ? 'bg-ink-soft border-green text-white'
                    : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
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
                  className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                    streams.wet ? 'bg-green border-green text-ink' : 'border-muted/40'
                  }`}
                >
                  {streams.wet && <Check size={12} strokeWidth={3} />}
                </div>
              </button>

              {/* Dry Stream */}
              <button
                type="button"
                onClick={() => toggleStream('dry')}
                className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between cursor-pointer ${
                  streams.dry
                    ? 'bg-ink-soft border-muted-l text-white'
                    : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
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
                  className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                    streams.dry ? 'bg-muted-l border-muted-l text-ink' : 'border-muted/40'
                  }`}
                >
                  {streams.dry && <Check size={12} strokeWidth={3} />}
                </div>
              </button>

              {/* Sanitary Stream */}
              <button
                type="button"
                onClick={() => toggleStream('sanitary')}
                className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between cursor-pointer ${
                  streams.sanitary
                    ? 'bg-ink-soft border-amber text-white'
                    : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
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
                  className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                    streams.sanitary ? 'bg-amber border-amber text-ink' : 'border-muted/40'
                  }`}
                >
                  {streams.sanitary && <Check size={12} strokeWidth={3} />}
                </div>
              </button>

              {/* Special Care Stream */}
              <button
                type="button"
                onClick={() => toggleStream('special_care')}
                className={`p-3 rounded-md border text-left transition-colors flex items-start justify-between cursor-pointer ${
                  streams.special_care
                    ? 'bg-ink-soft border-red text-white'
                    : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
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
                  className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                    streams.special_care ? 'bg-red border-red text-ink' : 'border-muted/40'
                  }`}
                >
                  {streams.special_care && <Check size={12} strokeWidth={3} />}
                </div>
              </button>
            </div>
          </div>

          {/* Location & AI Reward Note with Pen Icon */}
          <div className="bg-ink-soft p-3 rounded-md border border-muted/20 space-y-2 text-xs text-muted-l">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-1.5 flex-1 min-w-0">
                <MapPin size={14} className="text-green shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-l font-semibold flex items-center gap-1.5">
                    <span>Handover Location</span>
                    {location.accuracyMeters ? (
                      <span className="text-green text-[9px] bg-green/10 border border-green/30 px-1 py-0.2 rounded-xs">
                        ±{location.accuracyMeters}m GPS
                      </span>
                    ) : (
                      <span className="text-tint text-[9px] bg-ink border border-muted/40 px-1 py-0.2 rounded-xs">
                        {location.source === 'manual_pin' ? 'Map Pin' : location.source === 'manual_search' ? 'Manual' : 'Precise'}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-tint text-xs truncate mt-0.5 font-medium">
                    {isCapturingLocation ? 'Acquiring high-accuracy GPS...' : location.address}
                  </div>
                  <div className="text-[10px] font-mono text-muted-l mt-0.5">
                    {location.lat.toFixed(5)}° N, {location.lng.toFixed(5)}° E {location.ward ? `• ${location.ward}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLocationPickerOpen(true)}
                className="px-2 py-1 rounded-sm bg-ink hover:bg-muted/20 border border-muted/40 text-green hover:text-white transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[11px] font-mono font-medium"
                title="Edit location on Ahmedabad map"
              >
                <Edit3 size={12} />
                <span>Edit Map</span>
              </button>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-muted/15 text-[11px]">
              <span className="text-muted-l">Reward Rate:</span>
              <span className="text-green font-mono font-medium">Variable 1–5 Leaf Credits by AI</span>
            </div>
          </div>

          {/* Verify with AI Button */}
          <button
            type="button"
            onClick={handleVerifyPhoto}
            disabled={selectedStreamCount === 0}
            className={`w-full font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-xs min-h-[48px] ${
              selectedStreamCount === 0
                ? 'bg-ink-soft text-muted border border-muted/30 cursor-not-allowed'
                : 'bg-green hover:bg-[#16934f] text-ink cursor-pointer'
            }`}
          >
            <Sparkles size={16} />
            <span>Verify with Gemini 3.7 Flash</span>
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 3: PHOTO VERIFYING ANIMATION                         */}
      {/* ========================================================= */}
      {step === 'verifying' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">AI Vision Verification</h1>
              <p className="text-xs text-muted-l">Gemini 3.7 Flash Multimodal Inspection</p>
            </div>
            <div className="font-mono text-[11px] text-green bg-green/10 px-2 py-0.5 rounded-sm border border-green/30 animate-pulse">
              ANALYSING
            </div>
          </div>

          {/* Scanning Sweep Image */}
          <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] border border-muted/30 shadow-lg">
            <img
              src={photoUrl}
              alt="Segregation capture for verification"
              className="w-full h-full object-contain opacity-75 filter contrast-125"
            />
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="w-full h-1 bg-green shadow-[0_0_12px_#19A85B] animate-[scan_2s_ease-in-out_infinite]" />
              <div className="absolute top-2 left-2 font-mono text-[10px] bg-ink/85 text-green px-2 py-0.5 rounded-sm border border-green/30">
                GEMINI 3.7 FLASH // STREAM MATRIX
              </div>
              <div className="absolute bottom-2 right-2 font-mono text-[10px] bg-ink/85 text-tint px-2 py-0.5 rounded-sm border border-muted/40">
                CHECKING SEGREGATION...
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l mb-1">
              Inspection Pipeline
            </div>

            <div className="space-y-2">
              {photoStages.map((stage, idx) => {
                const isDone = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;

                return (
                  <div key={stage.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded-xs flex items-center justify-center border text-[10px] font-mono shrink-0 transition-colors ${
                          isDone
                            ? 'bg-green/20 border-green text-green'
                            : isCurrent
                            ? 'border-green text-green animate-pulse'
                            : 'border-muted/40 text-muted-l'
                        }`}
                      >
                        {isDone ? <Check size={11} strokeWidth={3} /> : idx + 1}
                      </div>
                      <div>
                        <span
                          className={`font-medium ${
                            isDone || isCurrent ? 'text-tint' : 'text-muted'
                          }`}
                        >
                          {stage.name}
                        </span>
                        <div className="text-[10px] text-muted-l leading-none mt-0.5">
                          {stage.desc}
                        </div>
                      </div>
                    </div>

                    <div className="font-mono text-[11px]">
                      {isDone ? (
                        <span className="text-green">OK</span>
                      ) : isCurrent ? (
                        <span className="text-green animate-pulse">Checking...</span>
                      ) : (
                        <span className="text-muted">Wait</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 4: LOW CONFIDENCE PROMPT (UNLOCKS STAGE 2 VIDEO)     */}
      {/* ========================================================= */}
      {step === 'low_confidence' && verificationResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Additional Verification Needed</h1>
              <p className="text-xs text-muted-l">AI confidence is low due to angle or lighting</p>
            </div>
            <div className="font-mono text-[11px] text-amber bg-amber/10 px-2 py-0.5 rounded-sm border border-amber/30">
              LOW CONFIDENCE
            </div>
          </div>

          {/* Photo Preview with Amber Outline */}
          <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] border border-amber/40 shadow-md">
            <img
              src={photoUrl}
              alt="Photo with low confidence"
              className="w-full h-full object-contain opacity-80"
            />
            <div className="absolute top-2 left-2 font-mono text-[10px] bg-amber/90 text-ink px-2 py-0.5 rounded-sm font-bold">
              AMBIGUOUS VIEW
            </div>
          </div>

          {/* Low Confidence Guidance Card */}
          <div className="bg-amber/10 border border-amber/40 rounded-lg p-4 text-tint space-y-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={20} className="text-amber shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber uppercase tracking-wide">
                  Gemini Uncertainty Notice
                </div>
                <p className="text-xs text-zinc-200 mt-1 leading-relaxed">
                  {verificationResult.decisionReason}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-l border-t border-amber/20 pt-2 leading-relaxed">
              Your submission has <strong>not failed</strong>. To verify the segregation and calculate your variable Leaf Credits, please record a quick 4-second video sweep of your bins, or retake a photo.
            </p>
          </div>

          {/* Action Choices: Record Short Video (Primary) OR Retake Photo */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('video_record');
                startCamera(facingMode);
              }}
              className="w-full bg-green hover:bg-[#16934f] text-ink font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md min-h-[48px]"
            >
              <Video size={18} strokeWidth={2.2} />
              <span>Record Short Video for Verification</span>
            </button>

            <button
              type="button"
              onClick={handleRetake}
              className="w-full bg-ink-soft hover:bg-muted/20 border border-muted/30 text-white font-medium text-xs py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
            >
              <Camera size={14} />
              <span>Retake Photo Instead</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 5: STAGE 2 VIDEO CAMERA (ONLY UNLOCKED AFTER UNCERTAIN PHOTO) */}
      {/* ========================================================= */}
      {step === 'video_record' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Stage 2: Video Verification</h1>
              <p className="text-xs text-muted-l">Pan camera across all segregated compartments</p>
            </div>
            <button
              onClick={handleRetake}
              className="text-xs text-muted-l hover:text-white px-2 py-1 rounded-sm bg-ink-soft border border-muted/20"
            >
              Back to Photo
            </button>
          </div>

          {/* Live Video Camera / Playback Preview Container */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3] border border-green/40 flex items-center justify-center shadow-lg">
            {!recordedVideoUrl ? (
              // Live camera viewfinder
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Overlays */}
                <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 font-mono text-[10px] bg-black/60 text-green px-2 py-0.5 rounded-sm border border-green/30 backdrop-blur-xs">
                      {isRecording ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-red animate-ping" />
                          <span className="text-red font-bold">RECORDING (0:0{recordingSeconds} / 0:04)</span>
                        </>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                          <span>VIDEO CAMERA ACTIVE</span>
                        </>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded-sm border border-white/20">
                      STAGE 2
                    </div>
                  </div>

                  {/* Sweep instruction */}
                  <div className="relative w-full h-24 flex items-center justify-center">
                    <div className="text-[11px] font-medium text-white/90 bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-xs text-center border border-white/20 shadow-md">
                      {isRecording
                        ? 'Slowly pan over wet, dry, and sanitary bins...'
                        : 'Tap Record below to start 4-second video clip'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between font-mono text-[10px] text-white/70 bg-black/60 px-2 py-1 rounded-sm border border-white/10 backdrop-blur-xs">
                    <span>4-STREAM MOTION SWEEP</span>
                    <span className="text-green">READY</span>
                  </div>
                </div>
              </>
            ) : (
              // Recorded Video Playback Preview
              <div className="relative w-full h-full bg-black flex items-center justify-center">
                {recordedVideoBlob ? (
                  <video
                    ref={playbackVideoRef}
                    src={recordedVideoUrl}
                    playsInline
                    loop
                    className="w-full h-full object-contain"
                    onPlay={() => setIsVideoPlaying(true)}
                    onPause={() => setIsVideoPlaying(false)}
                  />
                ) : (
                  <img
                    src={recordedVideoUrl}
                    alt="Video Keyframe"
                    className="w-full h-full object-contain"
                  />
                )}

                <div className="absolute top-2 left-2 font-mono text-[10px] bg-green text-ink font-bold px-2 py-0.5 rounded-sm">
                  VIDEO RECORDED (4s)
                </div>

                {recordedVideoBlob && (
                  <button
                    type="button"
                    onClick={() => {
                      if (playbackVideoRef.current) {
                        if (playbackVideoRef.current.paused) {
                          playbackVideoRef.current.play();
                        } else {
                          playbackVideoRef.current.pause();
                        }
                      }
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/60 border border-white/40 flex items-center justify-center text-white backdrop-blur-xs">
                      {isVideoPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls Bar */}
          {!recordedVideoUrl ? (
            <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 flex items-center justify-around">
              <button
                type="button"
                onClick={toggleFacingMode}
                disabled={isRecording}
                className="p-2.5 rounded-full bg-ink hover:bg-muted/20 border border-muted/30 text-tint transition-colors cursor-pointer disabled:opacity-40"
              >
                <FlipHorizontal size={18} />
              </button>

              {/* Record Shutter */}
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startVideoRecording}
                  className="w-16 h-16 rounded-full border-4 border-red/80 flex items-center justify-center bg-red/20 active:scale-90 transition-transform cursor-pointer shadow-lg hover:border-red group"
                >
                  <div className="w-11 h-11 rounded-full bg-red group-hover:scale-95 transition-transform flex items-center justify-center text-white">
                    <Video size={18} />
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopVideoRecording}
                  className="w-16 h-16 rounded-full border-4 border-red flex items-center justify-center bg-red/30 active:scale-90 transition-transform cursor-pointer shadow-lg animate-pulse"
                >
                  <div className="w-6 h-6 rounded-xs bg-red" />
                </button>
              )}

              <button
                type="button"
                onClick={() => videoFileInputRef.current?.click()}
                disabled={isRecording}
                className="p-2.5 rounded-full bg-ink hover:bg-muted/20 border border-muted/30 text-tint transition-colors cursor-pointer disabled:opacity-40"
              >
                <Upload size={18} />
              </button>
            </div>
          ) : (
            // Recorded Video Action Bar
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleVerifyVideo}
                className="w-full bg-green hover:bg-[#16934f] text-ink font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md min-h-[48px]"
              >
                <Sparkles size={18} />
                <span>Submit Video for Gemini Verification</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecordedVideoUrl('');
                  setRecordedVideoBase64('');
                  setRecordedVideoBlob(null);
                  startCamera(facingMode);
                }}
                className="w-full bg-ink-soft hover:bg-muted/20 border border-muted/30 text-white font-medium text-xs py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Re-record Video</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 6: VIDEO VERIFYING ANIMATION                         */}
      {/* ========================================================= */}
      {step === 'video_verifying' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Video Multi-Angle Verification</h1>
              <p className="text-xs text-muted-l">Gemini 3.7 Flash Video Sweep Analysis</p>
            </div>
            <div className="font-mono text-[11px] text-green bg-green/10 px-2 py-0.5 rounded-sm border border-green/30 animate-pulse">
              ANALYSING VIDEO
            </div>
          </div>

          {/* Scanning Sweep */}
          <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] border border-muted/30 shadow-lg">
            {recordedVideoBlob ? (
              <video
                src={recordedVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-contain opacity-75 filter contrast-125"
              />
            ) : (
              <img
                src={photoUrl}
                alt="Video frames"
                className="w-full h-full object-contain opacity-75 filter contrast-125"
              />
            )}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="w-full h-1 bg-green shadow-[0_0_12px_#19A85B] animate-[scan_1.5s_ease-in-out_infinite]" />
              <div className="absolute top-2 left-2 font-mono text-[10px] bg-ink/85 text-green px-2 py-0.5 rounded-sm border border-green/30">
                GEMINI 3.7 FLASH // VIDEO MULTIMODAL
              </div>
              <div className="absolute bottom-2 right-2 font-mono text-[10px] bg-ink/85 text-tint px-2 py-0.5 rounded-sm border border-muted/40">
                CALCULATING REWARDS...
              </div>
            </div>
          </div>

          {/* Progress stages */}
          <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l mb-1">
              Video Analysis Pipeline
            </div>

            <div className="space-y-2">
              {videoStages.map((stage, idx) => {
                const isDone = currentStageIndex > idx;
                const isCurrent = currentStageIndex === idx;

                return (
                  <div key={stage.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded-xs flex items-center justify-center border text-[10px] font-mono shrink-0 transition-colors ${
                          isDone
                            ? 'bg-green/20 border-green text-green'
                            : isCurrent
                            ? 'border-green text-green animate-pulse'
                            : 'border-muted/40 text-muted-l'
                        }`}
                      >
                        {isDone ? <Check size={11} strokeWidth={3} /> : idx + 1}
                      </div>
                      <div>
                        <span
                          className={`font-medium ${
                            isDone || isCurrent ? 'text-tint' : 'text-muted'
                          }`}
                        >
                          {stage.name}
                        </span>
                        <div className="text-[10px] text-muted-l leading-none mt-0.5">
                          {stage.desc}
                        </div>
                      </div>
                    </div>

                    <div className="font-mono text-[11px]">
                      {isDone ? (
                        <span className="text-green">OK</span>
                      ) : isCurrent ? (
                        <span className="text-green animate-pulse">Evaluating...</span>
                      ) : (
                        <span className="text-muted">Wait</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 7: FINAL VERIFICATION RESULT (SUCCESS / FAILED)       */}
      {/* ========================================================= */}
      {step === 'result' && verificationResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h1 className="text-sm font-semibold text-white">Verification Status</h1>
              <p className="text-xs text-muted-l">
                {verificationResult.mediaType === 'video'
                  ? 'Video sweep evaluation complete'
                  : 'AI photo analysis evaluation complete'}
              </p>
            </div>
            <div className="font-mono text-[11px] text-muted-l bg-ink-soft px-2 py-0.5 rounded-sm border border-muted/20">
              COMPLETE
            </div>
          </div>

          {/* Photo / Video Preview */}
          <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] border border-muted/30 shadow-md">
            <img
              src={photoUrl || recordedVideoUrl}
              alt="Verification result capture"
              className="w-full h-full object-contain opacity-90"
            />
            <div className="absolute inset-0 pointer-events-none p-3">
              <div
                className={`w-full h-full border-2 rounded-md transition-colors ${
                  isApproved
                    ? 'border-green/80 bg-green/5'
                    : 'border-red/80 bg-red/5'
                }`}
              />
            </div>
          </div>

          {/* Result Banner with Variable Leaf Credits Display */}
          <div
            className={`rounded-lg p-4 border text-left space-y-2.5 shadow-sm ${
              isApproved
                ? 'bg-green/10 border-green/40 text-tint'
                : 'bg-red/10 border-red/40 text-tint'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isApproved && <ShieldCheck size={22} className="text-green shrink-0" />}
                {isRejected && <XCircle size={22} className="text-red shrink-0" />}
                <div>
                  <span
                    className={`text-sm font-bold uppercase tracking-wide block ${
                      isApproved ? 'text-green' : 'text-red'
                    }`}
                  >
                    {isApproved
                      ? `Segregation Verified +${verificationResult.creditsAwarded} Leaf Credits`
                      : 'Verification Failed'}
                  </span>
                  <span className="text-[10px] text-muted-l font-mono">
                    {verificationResult.mediaType === 'video'
                      ? 'Verified via Multi-Angle Video Sweep'
                      : 'Verified via High-Confidence Photo'}
                  </span>
                </div>
              </div>

              {/* Awarded Variable Credits Pill */}
              {isApproved && (
                <div className="inline-flex items-center gap-1.5 bg-green/20 px-3 py-1.5 rounded-sm border border-green/40 font-mono text-sm font-bold text-green shadow-xs">
                  <LeafGlyph size={16} color="#19A85B" />
                  <span>+{verificationResult.creditsAwarded}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-l leading-relaxed pt-1">
              {verificationResult.decisionReason}
            </p>

            {/* Updated Balance Display */}
            {isApproved && (
              <div className="pt-2 border-t border-green/20 flex items-center justify-between text-xs text-tint">
                <span>Updated Wallet Balance:</span>
                <span className="font-mono font-bold text-white tabular-nums flex items-center gap-1">
                  <LeafGlyph size={13} color="#19A85B" />
                  <span>{displayedBalance} leaves</span>
                </span>
              </div>
            )}
          </div>

          {/* Itemised Readout Table */}
          <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 space-y-2 text-left">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l mb-1">
              Itemised Stream Readout
            </div>

            <div className="divide-y divide-muted/15 text-xs">
              {/* Wet */}
              <div className="py-1.5 flex items-center justify-between">
                <span className="font-medium text-white w-24">Wet (લીલો)</span>
                <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                  {verificationResult.streams.wet.note}
                </span>
                <span
                  className={`font-mono font-bold ${
                    verificationResult.streams.wet.verdict === 'clean'
                      ? 'text-green'
                      : verificationResult.streams.wet.verdict === 'none'
                      ? 'text-muted'
                      : 'text-red'
                  }`}
                >
                  {verificationResult.streams.wet.verdict === 'clean'
                    ? '✓'
                    : verificationResult.streams.wet.verdict === 'none'
                    ? '—'
                    : '✗'}
                </span>
              </div>

              {/* Dry */}
              <div className="py-1.5 flex items-center justify-between">
                <span className="font-medium text-white w-24">Dry (સૂકો)</span>
                <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                  {verificationResult.streams.dry.note}
                </span>
                <span
                  className={`font-mono font-bold ${
                    verificationResult.streams.dry.verdict === 'clean'
                      ? 'text-green'
                      : verificationResult.streams.dry.verdict === 'none'
                      ? 'text-muted'
                      : 'text-red'
                  }`}
                >
                  {verificationResult.streams.dry.verdict === 'clean'
                    ? '✓'
                    : verificationResult.streams.dry.verdict === 'none'
                    ? '—'
                    : '✗'}
                </span>
              </div>

              {/* Sanitary */}
              <div className="py-1.5 flex items-center justify-between">
                <span className="font-medium text-white w-24">Sanitary</span>
                <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                  {verificationResult.streams.sanitary.note}
                </span>
                <span
                  className={`font-mono font-bold ${
                    verificationResult.streams.sanitary.verdict === 'wrapped'
                      ? 'text-green'
                      : verificationResult.streams.sanitary.verdict === 'none'
                      ? 'text-muted'
                      : 'text-red'
                  }`}
                >
                  {verificationResult.streams.sanitary.verdict === 'wrapped'
                    ? '✓'
                    : verificationResult.streams.sanitary.verdict === 'none'
                    ? '—'
                    : '✗'}
                </span>
              </div>

              {/* Special Care */}
              <div className="py-1.5 flex items-center justify-between">
                <span className="font-medium text-white w-24">Special Care</span>
                <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                  {verificationResult.streams.special_care.note}
                </span>
                <span
                  className={`font-mono font-bold ${
                    verificationResult.streams.special_care.verdict === 'safe'
                      ? 'text-amber'
                      : verificationResult.streams.special_care.verdict === 'none'
                      ? 'text-muted'
                      : 'text-red'
                  }`}
                >
                  {verificationResult.streams.special_care.verdict === 'safe'
                    ? '⚠'
                    : verificationResult.streams.special_care.verdict === 'none'
                    ? '—'
                    : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          {isRejected ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleRetake}
                className="w-full bg-green hover:bg-[#16934f] text-ink font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs min-h-[48px]"
              >
                <Camera size={16} />
                <span>Retry with New Photo</span>
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full bg-ink-soft hover:bg-muted/20 border border-muted/30 text-muted-l hover:text-white font-medium text-xs py-2.5 px-4 rounded-md transition-colors flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="w-full bg-ink-soft hover:bg-muted/20 border border-muted/40 text-white font-semibold text-xs py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
            >
              <span>Return to Wallet Activity</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Ahmedabad Map Location Picker Modal */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        currentLocation={location}
        onLocationSelected={(newLocation) => {
          setLocation(newLocation);
          setIsCapturingLocation(false);
        }}
      />
    </div>
  );
};
