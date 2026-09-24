'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, X, Plus } from 'lucide-react';

export default function CalendarConnectPage() {
  return (
    <div className="calendar-connect-viewport">
      {/* Top Floating Navigation Bar */}
      <div className="calendar-connect-header">
        <Link href="/calendar" className="calendar-connect-back-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Calendar</span>
        </Link>

        <Link href="/calendar" className="calendar-connect-close-btn" aria-label="Close" title="Return to Calendar">
          <X size={18} aria-hidden="true" />
        </Link>
      </div>

      {/* Main Visual Card - Pixel-by-Pixel Reference Match */}
      <div className="calendar-connect-card-outer">
        <div className="calendar-connect-card">
          {/* Main Visual Image */}
          <div className="calendar-connect-img-wrap">
            <Image
              src="/calendar-out-of-budget-2x.webp"
              alt="Developer is out of budget — Calendar integration temporarily unavailable"
              width={1024}
              height={682}
              priority
              className="calendar-connect-img"
            />

            {/* Interactive Hotspot 1: Recap Logo -> Dashboard */}
            <Link
              href="/dashboard"
              className="calendar-hotspot-logo"
              title="recap — Go to Dashboard"
              aria-label="recap Dashboard"
            />

            {/* Interactive Hotspot 2: Google Calendar Unavailable */}
            <div
              className="calendar-hotspot-service"
              style={{ left: '61%', top: '53%', width: '10.5%', height: '15%' }}
              title="Google Calendar integration temporarily unavailable"
            />

            {/* Interactive Hotspot 3: Outlook Unavailable */}
            <div
              className="calendar-hotspot-service"
              style={{ left: '72.5%', top: '53%', width: '10.5%', height: '15%' }}
              title="Outlook Calendar integration temporarily unavailable"
            />

            {/* Interactive Hotspot 4: Apple Calendar Unavailable */}
            <div
              className="calendar-hotspot-service"
              style={{ left: '84%', top: '53%', width: '10.5%', height: '15%' }}
              title="Apple Calendar integration temporarily unavailable"
            />

            {/* Interactive Hotspot 5: 'Add meetings manually!' -> Opens Add Meeting Modal */}
            <Link
              href="/calendar?add=true"
              className="calendar-hotspot-manual"
              title="Click to add a meeting manually now"
              aria-label="Add meeting manually"
            >
              <span className="sr-only">Add meetings manually</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Helpful Subtle Bottom Helper */}
      <div className="calendar-connect-footer">
        <Link href="/calendar?add=true" className="calendar-connect-action-pill">
          <Plus size={14} aria-hidden="true" />
          <span>Add Meeting Manually</span>
        </Link>
      </div>
    </div>
  );
}
