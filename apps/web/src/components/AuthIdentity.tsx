import Link from 'next/link';

export function AuthIdentity() {
  return (
    <Link href="/" className="auth-identity" aria-label="مداد أكاديمي — الرئيسية">
      <svg className="auth-logo" viewBox="0 0 510 420" role="img" aria-label="مداد أكاديمي">
        <image href="/midad-logo-transparent.png" width="729" height="477" />
      </svg>
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
        <path d="M240 160l16-28 16 28 28 16-28 16-16 28-16-28-28-16zM570 880l16-28 16 28 28 16-28 16-16 28-16-28-28-16zM30 500l14-24 14 24 24 14-24 14-14 24-14-24-24-14z" />
        <path d="M570 340l48-70 18 12-48 70-28 17zm48-70l8-12 18 12-8 12M250 770l48-70 18 12-48 70-28 17zm48-70l8-12 18 12-8 12" />
        <path d="M60 200h28m-14-14v28M740 650h28m-14-14v28M480 950h20m-10-10v20M330 400h16m-8-8v16" />
        <circle cx="730" cy="930" r="48" /><circle cx="730" cy="930" r="60" />
        <path d="M350 80l8-8 8 8-8 8zM65 800l8-8 8 8-8 8zM710 310l6-6 6 6-6 6z" />
      </g>
      <g fill="currentColor" fontFamily="inherit" fontSize="64">
        <text x="55" y="330" transform="rotate(-14 55 330)">أ</text>
        <text x="710" y="440" transform="rotate(12 710 440)">ب</text>
        <text x="260" y="930" transform="rotate(-8 260 930)">ض</text>
        <text x="680" y="610" transform="rotate(10 680 610)">م</text>
        <text x="100" y="120" transform="rotate(-8 100 120)">ج</text>
      </g>
    </svg>
  );
}
