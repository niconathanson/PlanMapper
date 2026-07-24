// Minimal inline stroke icons (20x20, currentColor). Explicit width/height so
// they render at a sensible size even where no CSS sizes them (e.g. the top bar).
const S = {
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Icon = {
  select: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M4 3l5.5 13 2-5 5-2z" />
    </svg>
  ),
  pan: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M10 2v7M10 9V5.5a1.5 1.5 0 013 0V9m0-2a1.5 1.5 0 013 0v4c0 3-2 5-5 5s-4-1-5.5-3l-2-3a1.5 1.5 0 012.3-1.9L10 11" />
    </svg>
  ),
  origin: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M10 2v16M2 10h16" />
      <circle cx="10" cy="10" r="2.3" />
    </svg>
  ),
  scale: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M3 14L14 3l3 3L6 17z" />
      <path d="M6.5 6.5l1.5 1.5M9 4l1.5 1.5M9.5 11l1.5 1.5M12 8.5L13.5 10" />
    </svg>
  ),
  probe: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M10 18c3-4 5-6.5 5-9a5 5 0 10-10 0c0 2.5 2 5 5 9z" />
      <circle cx="10" cy="9" r="1.7" />
    </svg>
  ),
  polygon: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M10 2l7 5-2.7 8.5H5.7L3 7z" />
      <circle cx="10" cy="2" r="1.3" fill="currentColor" />
      <circle cx="17" cy="7" r="1.3" fill="currentColor" />
      <circle cx="3" cy="7" r="1.3" fill="currentColor" />
    </svg>
  ),
  path: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M3 16l4-9 4 5 5-9" />
      <circle cx="3" cy="16" r="1.4" fill="currentColor" />
      <circle cx="7" cy="7" r="1.4" fill="currentColor" />
      <circle cx="11" cy="12" r="1.4" fill="currentColor" />
      <circle cx="16" cy="3" r="1.4" fill="currentColor" />
    </svg>
  ),
  rect: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <rect x="3" y="6" width="14" height="8" rx="1" />
    </svg>
  ),
  fan: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M7 4h6l3 12H4z" />
    </svg>
  ),
  open: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M2.5 5.5A1.5 1.5 0 014 4h4l2 2h6a1.5 1.5 0 011.5 1.5V14A1.5 1.5 0 0116 15.5H4A1.5 1.5 0 012.5 14z" />
    </svg>
  ),
  save: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M4 3h9l3 3v11H4z" />
      <path d="M7 3v4h6M7 17v-5h6v5" />
    </svg>
  ),
  undo: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M6 9H12a4.5 4.5 0 0 1 0 9H8" />
      <path d="M9 5.5L5 9l4 3.5" />
    </svg>
  ),
  redo: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M14 9H8a4.5 4.5 0 0 0 0 9h4" />
      <path d="M11 5.5L15 9l-4 3.5" />
    </svg>
  ),
  moon: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5z" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" />
    </svg>
  ),
  help: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.9 7.8a2.1 2.1 0 114 .9c-.5.8-1.9 1.1-1.9 2.4" />
      <circle cx="10" cy="14.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  fit: () => (
    <svg viewBox="0 0 20 20" {...S}>
      <path d="M3 7V4h3M17 7V4h-3M3 13v3h3M17 13v3h-3" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;
