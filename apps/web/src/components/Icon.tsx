import type { CSSProperties } from 'react';

const paths = {
  refresh: 'M20 7V3l-4 4 M20 7a8 8 0 0 0-14-2 M4 17v4l4-4 M4 17a8 8 0 0 0 14 2',
  academy: 'M3 21h18 M5 21V10l7-7 7 7v11 M9 21v-6h6v6 M10 10h4',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  flame: 'M12 3c1 5 6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 4-7-1 4 1 4 2 5 2-3 1-6 0-9z',
  book: 'M12 5v16 M12 5C9 3 6 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 1z',
  graduate: 'm2 8 10-5 10 5-10 5z M6 10v6q6 5 12 0v-6 M22 8v8',
  calendar:
    'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 10h18 M8 14h2 M14 14h2 M8 17h2',
  family:
    'M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M17 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M2 21v-4a6 6 0 0 1 12 0v4 M14 13a5 5 0 0 1 8 4v4',
  edit: 'm4 16 12-12 4 4L8 20H4z M13 7l4 4',
  file: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',
  mic: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',
  video: 'M3 5h18v14H3z m7 4 6 3-6 3z',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  logout: 'M10 3H4v18h6 M9 12h12 M17 8l4 4-4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  hand: 'M8 12V5a2 2 0 0 1 4 0v6 M12 11V4a2 2 0 0 1 4 0v7 M16 11V7a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2',
  thumbsUp: 'M8 10l4-7c2 0 2 2 1 6h6c2 0 2 2 1 5l-2 7H8z M3 10h5v11H3z',
  heart: 'M12 21 3 12C-2 5 7 0 12 6c5-6 14-1 9 6z',
  applause: 'M4 14l3-6 3 2 3-6 3 2-1 5 4 2-3 7H9z M5 3l2 2 M13 1v2 M20 4l-2 2',
  celebration: 'm3 21 4-14 10 10z M7 7l10 10 M13 4l2-2 M18 8l3-1 M18 3l2 2 M21 13l1 2',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2',
  warning: 'm12 3 10 18H2z M12 9v5 M12 17h.01',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12 M18 6 6 18',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  left: 'm14 5-7 7 7 7',
  right: 'm10 5 7 7-7 7',
  undo: 'M9 4 4 9l5 5 M4 9h10a6 6 0 0 1 0 12',
  redo: 'm15 4 5 5-5 5 M20 9H10a6 6 0 0 0 0 12',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M8 9h.01 M16 9h.01 M8 14q4 5 8 0',
} as const;
export type IconName = keyof typeof paths;

/** Decorative by default; provide a label only when the icon conveys meaning alone. */
export default function Icon({
  name,
  size = 20,
  label,
  className = '',
  style,
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`midad-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
