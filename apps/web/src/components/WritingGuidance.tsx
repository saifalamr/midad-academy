import type { WritingGuideResult } from '@/lib/writing';
export default function WritingGuidance({ result }: { result: WritingGuideResult }) {
  return (
    <section className="writing-check" aria-label="مساعدة التتبّع">
      <h3>
        {result.status === 'ON_TRACK' ? 'المحاولة قريبة من المسارات' : 'نجرّب مرة ثانية بهدوء'}
      </h3>
      <ol>
        {result.steps.map((s) => (
          <li key={s.index}>
            الحركة {s.index + 1}: {s.message}
          </li>
        ))}
      </ol>
      {result.extra > 0 && <p>توجد {result.extra} حركة إضافية؛ راجع ترتيب المسارات.</p>}
      <p className="writing-muted">{result.note}</p>
    </section>
  );
}
