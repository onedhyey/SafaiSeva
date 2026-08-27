import React, { useState } from 'react';
import { SafaiSevaLogo } from '../SafaiSevaLogo';
import { LeafGlyph } from '../LeafGlyph';
import { useAuth } from '../../lib/authContext';
import { usePwaInstall } from '../../lib/usePwaInstall';
import {
  LogIn,
  ShieldCheck,
  QrCode,
  Bus,
  Sparkles,
  ArrowRight,
  User,
  KeyRound,
  Lock,
  Download,
  Smartphone,
  Check,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { signIn, hasClerkKey, openSignInModal } = useAuth();
  const { isInstalled, triggerInstall } = usePwaInstall();
  const [customName, setCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleQuickLogin = (name?: string, roleHint?: string) => {
    if (hasClerkKey) {
      openSignInModal();
    } else {
      signIn({
        fullName: name || customName || 'Aarav Patel',
        primaryEmail: (name || customName || 'aarav').toLowerCase().replace(/\s+/g, '.') + '@amc-resident.in',
      });
    }
  };

  return (
    <div className="w-full min-h-[82vh] flex flex-col justify-between py-4 px-2">
      {/* Hero Branding Section */}
      <div className="flex flex-col items-center text-center pt-2">
        {/* Animated Brand Emblem */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-emerald-500/20 to-emerald-950/40 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.2)]">
            <SafaiSevaLogo size={36} className="text-emerald-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-zinc-950 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
            <ShieldCheck size={10} />
            <span>AMC</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium font-mono mb-2">
          <Sparkles size={12} className="text-emerald-400" />
          <span>AHMEDABAD CIVIC WASTE EDGE</span>
        </div>

        <h1 className="text-xl font-bold text-white tracking-tight">
          SafaiSeva Citizen Portal
        </h1>
        <p className="text-xs text-zinc-400 max-w-xs mt-1 leading-relaxed">
          Daily waste segregation verification, Green Leaf civic credits, and BRTS / Metro transit rewards.
        </p>

        {/* Dedicated "Download as an App" action banner on login page (only on website, hidden when installed/standalone) */}
        {!isInstalled && (
          <button
            id="login-view-download-app-btn"
            onClick={triggerInstall}
            className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/40 text-xs text-zinc-200 transition-all shadow-md hover:scale-[1.02] cursor-pointer"
          >
            <div className="w-5 h-5 rounded-md bg-emerald-950 flex items-center justify-center text-emerald-400 shrink-0">
              <Download size={12} />
            </div>
            <span className="font-semibold text-emerald-400">
              Download SafaiSeva as an App
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              (Offline PWA)
            </span>
          </button>
        )}
      </div>

      {/* Feature Highlights Grid */}
      <div className="my-5 space-y-2.5">
        <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 shrink-0 mt-0.5">
            <LeafGlyph size={18} />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-zinc-200">
              Verified 4-Stream Handovers
            </div>
            <div className="text-[11px] text-zinc-400 leading-snug">
              Earn +2 Green Leaves every morning for separating Wet, Dry, Sanitary & Domestic Hazard waste.
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-400 shrink-0 mt-0.5">
            <Bus size={18} />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-zinc-200">
              Free Janmarg BRTS & Metro Passes
            </div>
            <div className="text-[11px] text-zinc-400 leading-snug">
              Exchange your civic credits for real dynamic QR travel tickets across Ahmedabad transit routes.
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/50 text-purple-400 shrink-0 mt-0.5">
            <QrCode size={18} />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-zinc-200">
              Karmachari Verification
            </div>
            <div className="text-[11px] text-zinc-400 leading-snug">
              Sanitation workers verify collections via doorstep QR scans & spot-check overrides.
            </div>
          </div>
        </div>
      </div>

      {/* Login Action Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200">Clerk Authentication</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
            SSL SECURE
          </span>
        </div>

        {showCustomInput ? (
          <div className="space-y-2 mb-3">
            <input
              id="custom-name-login-input"
              type="text"
              placeholder="Enter your name (e.g. Aarav Patel)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                id="custom-name-continue-btn"
                onClick={() => handleQuickLogin(customName)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
              >
                Continue to Role Select
              </button>
              <button
                id="custom-name-cancel-btn"
                onClick={() => setShowCustomInput(false)}
                className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            id="login-view-primary-login-btn"
            onClick={() => handleQuickLogin()}
            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 !text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer group"
          >
            <LogIn size={15} className="!text-white text-white shrink-0 group-hover:translate-x-0.5 transition-transform" />
            <span className="!text-white text-white">Log in / Sign up to SafaiSeva</span>
            <ArrowRight size={14} className="!text-white text-white shrink-0" />
          </button>
        )}

        <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Testing different users?</span>
          <button
            id="custom-name-signin-btn"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="text-emerald-400 hover:text-emerald-300 font-medium underline cursor-pointer"
          >
            Custom Name Sign-in
          </button>
        </div>
      </div>
    </div>
  );
};
