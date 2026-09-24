import React from 'react';

/**
 * High-precision isometric SVG illustration for the Meeting Details hero card.
 * Depicts a modern workspace meeting desk with participants, laptop, and floating telemetry cards.
 */
export default function MeetingHeroArt() {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        {/* Desk top gradient */}
        <linearGradient id="deskTopGrad" x1="40" y1="90" x2="120" y2="135" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DBEAFE" />
          <stop offset="100%" stopColor="#BFDBFE" />
        </linearGradient>

        {/* Desk side gradient */}
        <linearGradient id="deskSideGrad" x1="40" y1="110" x2="40" y2="125" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>

        {/* Screen gradient */}
        <linearGradient id="screenGrad" x1="70" y1="65" x2="105" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>

        {/* Floating card 1 */}
        <linearGradient id="cardGrad1" x1="95" y1="40" x2="135" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#EFF6FF" stopOpacity="0.8" />
        </linearGradient>

        {/* Avatar gradient */}
        <linearGradient id="avatarGrad" x1="65" y1="70" x2="85" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/* Soft Ambient Base Shadow */}
      <ellipse cx="80" cy="130" rx="46" ry="18" fill="#E2E8F0" fillOpacity="0.7" />

      {/* Isometric Desk Top */}
      <polygon
        points="80,88 132,112 80,136 28,112"
        fill="url(#deskTopGrad)"
        stroke="#93C5FD"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Desk Front Left Edge */}
      <polygon
        points="28,112 80,136 80,142 28,118"
        fill="url(#deskSideGrad)"
        stroke="#60A5FA"
        strokeWidth="0.5"
      />

      {/* Desk Front Right Edge */}
      <polygon
        points="80,136 132,112 132,118 80,142"
        fill="#3B82F6"
        fillOpacity="0.85"
        stroke="#2563EB"
        strokeWidth="0.5"
      />

      {/* Central Screen / Laptop Base */}
      <polygon
        points="80,105 96,113 80,121 64,113"
        fill="#94A3B8"
        stroke="#64748B"
        strokeWidth="0.5"
      />

      {/* Laptop Screen Vertical */}
      <polygon
        points="64,113 96,113 96,93 64,93"
        fill="url(#screenGrad)"
        stroke="#1D4ED8"
        strokeWidth="0.75"
        rx="2"
      />

      {/* Screen Content Line */}
      <line x1="70" y1="99" x2="90" y2="99" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="72" y1="104" x2="88" y2="104" stroke="#60A5FA" strokeWidth="1" strokeLinecap="round" />

      {/* Participant Avatar (Seated behind desk) */}
      {/* Head */}
      <circle cx="80" cy="74" r="7" fill="#64748B" />
      {/* Hair / Head Accent */}
      <path d="M74,73 C74,68 86,68 86,73" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
      {/* Torso */}
      <path
        d="M71,85 C71,81 75,80 80,80 C85,80 89,81 89,85 L87,92 L73,92 Z"
        fill="url(#avatarGrad)"
      />

      {/* Floating Hologram Metric Card (Right) */}
      <g transform="translate(102, 48)">
        <polygon
          points="0,6 26,0 34,18 8,24"
          fill="url(#cardGrad1)"
          stroke="#93C5FD"
          strokeWidth="0.75"
        />
        <line x1="6" y1="9" x2="20" y2="6" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="14" x2="22" y2="11" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />
      </g>

      {/* Floating Audio Waveform Card (Left) */}
      <g transform="translate(24, 62)">
        <polygon
          points="0,4 24,0 30,16 6,20"
          fill="#FFFFFF"
          fillOpacity="0.85"
          stroke="#CBD5E1"
          strokeWidth="0.75"
        />
        <circle cx="9" cy="11" r="2.5" fill="#10B981" />
        <line x1="14" y1="10" x2="24" y2="8" stroke="#64748B" strokeWidth="1" strokeLinecap="round" />
      </g>

      {/* Connected Nodes / Sparks */}
      <circle cx="80" cy="54" r="1.5" fill="#3B82F6" />
      <circle cx="118" cy="80" r="1.5" fill="#8B5CF6" />
      <circle cx="44" cy="95" r="1.5" fill="#10B981" />
    </svg>
  );
}
