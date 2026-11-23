import Image from 'next/image';

export default function AcademyLoading({ message = 'جارٍ فتح الأكاديمية…' }: { message?: string }) {
  return (
    <main
      className="midad academy-loading"
      role="status"
      aria-label={message}
      aria-live="polite"
      dir="rtl"
    >
      <div className="academy-loading-card">
        <div className="academy-loading-mark" aria-hidden="true">
          <span className="academy-loading-orbit" />
          <Image src="/midad-logo-transparent.png" width={108} height={88} alt="" priority />
        </div>
        <h1>{message}</h1>
        <p>نجهّز لك مساحة التعلّم</p>
        <div className="academy-loading-track" aria-hidden="true">
          <span />
        </div>
      </div>
    </main>
  );
}
