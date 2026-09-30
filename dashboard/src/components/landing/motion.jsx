'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useInView(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in-view');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view');
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

export function Reveal({ children, delay = 0, className = '', style, ...rest }) {
  const ref = useRef(null);
  // Arm the hidden pre-reveal state only after hydration, so SSR/no-JS
  // renders the content fully visible.
  const [armed, setArmed] = useState(false);
  useInView(ref);
  useEffect(() => setArmed(true), []);
  return (
    <div
      ref={ref}
      className={`${armed ? 'l-reveal' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SlidingNav({ tabs, active, onChange }) {
  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [indicator, setIndicator] = useState({ x: 0, w: 0, ready: false });

  const measure = useCallback(() => {
    const btn = btnRefs.current[active];
    if (!btn) return;
    if (btn.offsetWidth === 0) return; // nav hidden (mobile)
    setIndicator({ x: btn.offsetLeft, w: btn.offsetWidth, ready: true });
  }, [active]);

  useEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <nav className="landing-nav-tabs" ref={navRef}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          ref={(el) => {
            btnRefs.current[tab.id] = el;
          }}
          onClick={() => onChange(tab.id)}
          className={`landing-tab-btn ${active === tab.id ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
      <span
        className="l-nav-indicator"
        style={{
          transform: `translateX(${indicator.x}px)`,
          width: `${indicator.w}px`,
          opacity: indicator.ready ? 1 : 0,
        }}
        aria-hidden="true"
      />
    </nav>
  );
}

const BASE_TILT = 'rotateY(-7deg) rotateX(4deg) rotateZ(1deg)';

export function TiltCard({ children, style, className = '' }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const reduced = useReducedMotion();

  const onMouseMove = (e) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `rotateY(${-7 + px * 6}deg) rotateX(${4 - py * 5}deg) rotateZ(1deg)`;
    });
  };

  const onMouseLeave = () => {
    cancelAnimationFrame(raf.current);
    if (ref.current) ref.current.style.transform = BASE_TILT;
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div className="mockup-3d-wrapper">
      <div
        ref={ref}
        className={`mockup-3d-card l-tilt ${className}`}
        style={style}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </div>
  );
}
