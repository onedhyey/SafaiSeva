import React from 'react';

interface LeafGlyphProps {
  className?: string;
  size?: number | string;
  color?: string;
  filled?: boolean;
}

export const LeafGlyph: React.FC<LeafGlyphProps> = ({
  className = '',
  size = 16,
  color = 'currentColor',
  filled = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-hidden="true"
    >
      <path
        d="M 4.5 19.5 C 3.2 12.8 7.8 4.8 19.5 4.5 C 19.2 16.2 11.2 20.8 4.5 19.5 Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M 6.2 17.8 C 10.2 13.8 13.8 10.2 17.8 6.2"
        stroke={filled ? (color === '#19A85B' || color === 'currentColor' ? '#0F1F17' : '#FFFFFF') : color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M 11.5 12.5 C 13.5 13 15 14.5 15.5 15.5"
        stroke={filled ? (color === '#19A85B' || color === 'currentColor' ? '#0F1F17' : '#FFFFFF') : color}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
};
