import Link from 'next/link';

export function AuthIdentity() {
  return (
    <Link href="/" className="auth-identity" aria-label="مداد أكاديمي — الرئيسية">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/midad-logo-transparent.png" alt="مداد أكاديمي" width={120} height={100} />
      <span>رحلة صغيرة، معرفة كبيرة</span>
    </Link>
  );
}

export function AuthBackdrop() {
  return (
    <svg className="auth-art" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M70 90l22-38 22 38 38 22-38 22-22 38-22-38-38-22zM650 760l22-38 22 38 38 22-38 22-22 38-22-38-38-22z" />
        <path d="M40 650q40-20 80 0v60q-40-20-80 0zm80 0q40-20 80 0v60q-40-20-80 0M600 180q35-18 70 0v55q-35-18-70 0zm70 0q35-18 70 0v55q-35-18-70 0" />
        <circle cx="700" cy="80" r="100" /><circle cx="700" cy="80" r="118" />
        <circle cx="10" cy="910" r="130" /><circle cx="10" cy="910" r="148" />
        <path d="M300 45h40m-20-20v40M650 540h28m-14-14v28M90 390h24m-12-12v24" />
      </g>
      <g fill="currentColor" fontFamily="serif" fontSize="64">
        <text x="55" y="330" transform="rotate(-14 55 330)">أ</text>
        <text x="710" y="440" transform="rotate(12 710 440)">ب</text>
        <text x="260" y="930" transform="rotate(-8 260 930)">ض</text>
      </g>
    </svg>
  );
}
