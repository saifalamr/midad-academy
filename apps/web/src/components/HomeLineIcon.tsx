import type { ReactNode } from 'react';

const drawings = {
  arrow: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  book: (
    <>
      <path d="M12 6.5c-2.7-1.8-5.7-2.1-9-1.3v13.3c3.3-.8 6.3-.5 9 1.3 2.7-1.8 5.7-2.1 9-1.3V5.2c-3.3-.8-6.3-.5-9 1.3Z" />
      <path d="M12 6.5v13.3" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M7.2 5V3.5m9.6 1.5V3.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5m0 14h16" />
      <path d="m7.5 14 4-4 3 2 4-5" />
      <path d="M18.5 7H16m2.5 0v2.5" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  moon: <path d="M20.5 14.8A8.5 8.5 0 0 1 9.2 3.5 8.5 8.5 0 1 0 20.5 14.8Z" />,
  pen: (
    <>
      <path d="m4 20 4.8-1 10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10L4 20Z" />
      <path d="m13.6 7.4 3.4 3.4M4 20h5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M5.2 20v-2.2a6.8 6.8 0 0 1 13.6 0V20" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type HomeLineIconName = keyof typeof drawings;

export default function HomeLineIcon({
  name,
  size = 22,
}: {
  name: HomeLineIconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {drawings[name]}
    </svg>
  );
}
