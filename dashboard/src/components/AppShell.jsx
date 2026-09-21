'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Navigation from './Navigation';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  if (isLandingPage) {
    return <div className="landing-root">{children}</div>;
  }

  return (
    <div className="app-container">
      <Navigation />
      <main className="main-content">{children}</main>
    </div>
  );
}
