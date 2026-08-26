import React from 'react';

interface SafaiSevaLogoProps {
  className?: string;
  size?: number | string;
  variant?: 'mark' | 'badge' | 'full';
  color?: string;
  bgColor?: string;
  showText?: boolean;
}

export const SafaiSevaLogo: React.FC<SafaiSevaLogoProps> = ({
  className = '',
  size = 28,
  variant = 'mark',
  color,
  bgColor,
  showText = false,
}) => {
  // SVG vector geometry faithfully replicating the official SafaiSeva "SS" monogram
  const iconMark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block shrink-0 align-middle select-none"
      aria-label="SafaiSeva Logo"
    >
      <defs>
        <mask id="safai-seva-mask">
          {/* Base rounded square */}
          <rect width="100" height="100" rx="22" fill="#FFFFFF" />
          
          {/* Stripe 1: Top-Left to Bottom-Center / Right diagonal channel */}
          <path
            d="M 33 0 
               L 43 0 
               L 43 32 
               C 43 36 46 40 50 44
               L 68 62 
               C 72 66 74 70 74 76
               L 74 100 
               L 64 100 
               L 64 76 
               C 64 72 62 68 58 64
               L 40 46 
               C 35 41 33 37 33 32 
               Z"
            fill="#000000"
          />

          {/* Stripe 2: Top-Right to Right-Edge diagonal channel */}
          <path
            d="M 58 0 
               L 68 0 
               L 68 32 
               C 68 36 71 40 75 44
               L 92 61
               C 97 66 100 71 100 78
               L 100 88
               C 100 88 95 78 88 71
               L 78 61
               C 75 58 73 54 73 50
               L 73 32
               C 73 24 67 18 58 0
               Z"
            fill="#000000"
          />

          {/* Stripe 3: Left-Edge to Bottom-Left diagonal channel */}
          <path
            d="M 0 22
               C 0 22 5 32 12 39
               L 22 49
               C 25 52 27 56 27 60
               L 27 76
               C 27 84 33 90 42 100
               L 32 100
               L 32 76
               C 32 72 29 68 25 64
               L 8 47
               C 3 42 0 37 0 30
               Z"
            fill="#000000"
          />
        </mask>
      </defs>

      {/* Main emblem rendered with mask for crisp scaling at any resolution */}
      <rect
        width="100"
        height="100"
        rx="22"
        fill={color || "currentColor"}
        mask="url(#safai-seva-mask)"
      />
    </svg>
  );

  if (variant === 'badge') {
    return (
      <div className={`inline-flex items-center justify-center p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-sm ${className}`}>
        {iconMark}
      </div>
    );
  }

  if (variant === 'full' || showText) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        <div className="flex items-center justify-center shrink-0">
          {iconMark}
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-sm font-bold tracking-wider text-white">
            SafaiSeva
          </span>
          <span className="text-[9px] font-mono text-emerald-400 font-semibold tracking-tight">
            AMC CIVIC EDGE
          </span>
        </div>
      </div>
    );
  }

  return <span className={className}>{iconMark}</span>;
};

export default SafaiSevaLogo;
