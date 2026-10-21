'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { academyApi as api } from '@/lib/academy-workflow';
import { PopupNotice, showPopup } from '@/components/FeedbackProvider';
import WritingBoard from '@/components/WritingBoard';
import WritingGuidance from '@/components/WritingGuidance';
import type {
  WritingTemplate,
  WritingTask,
  WritingStrokes,
  WritingGuideResult,
} from '@/lib/writing';
import '@/components/writing.css';
type Data = {
  session: { id: string; title: string; status: string; courseTitle: string };
  staff: boolean;
  tasks: WritingTask[];
};
export default function WritingSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const embedded = useSearchParams().get('embedded') === '1';
  const [data, setData] = useState<Data | null>(null),
    [library, setLibrary] = useState<WritingTemplate[]>([]);
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [word, setWord] = useState('مَطَر'),
    [fontSize, setFontSize] = useState(160),
    [mode, setMode] = useState<'SIMPLE' | 'GUIDED'>('SIMPLE');
  const [guides, setGuides] = useState<WritingStrokes>([]),
    [trial, setTrial] = useState<WritingStrokes>([]),
    [tested, setTested] = useState(false);
  const [checked, setChecked] = useState(false),
    [result, setResult] = useState<WritingGuideResult | null>(null);
  const [selected, setSelected] = useState(''),
    [useAs, setUseAs] = useState('ACTIVITY');
  useEffect(() => {
    let active = true;
    api<Data>('/writing/sessions/' + id)
      .then(async (d) => {
        if (!active) return;
        setData(d);
        if (d.staff) {
          const l = await api<WritingTemplate[]>('/writing/library');
          if (active) setLibrary(l);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  function invalidate() {
    setTested(false);
    setChecked(false);
    setResult(null);
    setTrial([]);
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="writing-page" dir="rtl" data-writing-embedded={embedded}>
      {!embedded && <Link href={'/sessions/' + id}>العودة إلى الحصة</Link>}
      <h1>نتدرّب على الكتابة</h1>
      <button className="btn btn-outline" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
        تحديث تمارين الحصة
      </button>
      {error && (
        <PopupNotice>
          {error}
          <button
            className="btn btn-outline"
            onClick={() => {
              setError('');
              setRevision((v) => v + 1);
            }}
          >
            تحديث البيانات
          </button>
        </PopupNotice>
      )}
      {!data ? (
        <p role="status">جارٍ فتح أنشطة الكتابة…</p>
      ) : (
        <>
          <p>
            {data.session.courseTitle} · {data.session.title}
          </p>
          {data.staff && data.session.status !== 'CANCELLED' && (
            <>
              <section className="card pad">
                <h2>إنشاء كلمة في مكتبتي</h2>
                <p>
                  اكتب كلمة عربية، ثم اختر تتبّعًا بمراجعتك أو جهّز مسارات تساعد الطالب أثناء
                  التدريب.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      if (mode === 'GUIDED' && (!tested || !checked))
                        throw new Error('جرّب المسارات وأكد مراجعتها قبل الحفظ');
                      const template = await api<WritingTemplate>('/writing/library', 'POST', {
                        word,
                        fontSize,
                        mode,
                        guides,
                        pathsReviewed: checked,
                      });
                      setSelected(template.id);
                      showPopup('حُفظت الكلمة في مكتبتك؛ اختر إضافتها للحصة أدناه');
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <div className="writing-row">
                      <label className="field">
                        الكلمة المطلوبة
                        <input
                          className="input"
                          value={word}
                          required
                          maxLength={40}
                          onChange={(e) => {
                            const value = e.target.value;
                            setWord(value);
                            setFontSize(
                              Math.max(
                                32,
                                Math.min(
                                  160,
                                  Math.floor(
                                    1400 /
                                      Math.max(
                                        1,
                                        value.replace(/[\u064B-\u0652\u0670]/g, '').length
                                      )
                                  )
                                )
                              )
                            );
                            setGuides([]);
                            invalidate();
                          }}
                        />
                      </label>
                      <label className="field">
                        حجم نموذج الكتابة
                        <input
                          className="input"
                          type="number"
                          min={32}
                          max={180}
                          required
                          value={fontSize}
                          onChange={(e) => {
                            setFontSize(Number(e.target.value));
                            setGuides([]);
                            invalidate();
                          }}
                        />
                      </label>
                      <label className="field">
                        طريقة التدريب
                        <select
                          className="input"
                          value={mode}
                          onChange={(e) => {
                            setMode(e.target.value as 'SIMPLE' | 'GUIDED');
                            setGuides([]);
                            invalidate();
                          }}
                        >
                          <option value="SIMPLE">تتبّع بسيط — أصححه بنفسي</option>
                          <option value="GUIDED">مسارات مجهزة — مساعدة آلية</option>
                        </select>
                      </label>
                    </div>
                    {mode === 'SIMPLE' ? (
                      <WritingBoard
                        word={word}
                        fontSize={fontSize}
                        strokes={[]}
                        readOnly
                        label="معاينة الكلمة"
                      />
                    ) : (
                      <>
                        <p>
                          <b>ارسم الحركات بالترتيب الصحيح فوق الكلمة.</b> ارفع القلم بين الحركات،
                          والمس الشاشة مرة لكل نقطة. تُرقّم البداية تلقائيًا. المسارات تعتمد على
                          مراجعتك.
                        </p>
                        <WritingBoard
                          key={word + fontSize}
                          word={word}
                          fontSize={fontSize}
                          strokes={guides}
                          guides={guides}
                          onChange={(s) => {
                            setGuides(s);
                            invalidate();
                          }}
                          label="تجهيز مسارات الكلمة"
                          demonstrate
                        />
                        <p>{guides.length} حركة أو نقطة مجهّزة.</p>
                        {guides.length > 0 && (
                          <details open>
                            <summary>جرّب التمرين مثل الطالب</summary>
                            <WritingBoard
                              word={word}
                              fontSize={fontSize}
                              strokes={trial}
                              guides={guides}
                              onChange={(s) => {
                                setTrial(s);
                                setTested(false);
                                setChecked(false);
                                setResult(null);
                              }}
                              label="تجربة مسارات الكلمة"
                              demonstrate
                            />
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={!trial.length}
                              onClick={() =>
                                void action(async () => {
                                  const r = await api<WritingGuideResult>(
                                    '/writing/preview',
                                    'POST',
                                    { guides, strokes: trial }
                                  );
                                  setResult(r);
                                  setTested(r.status === 'ON_TRACK');
                                })
                              }
                            >
                              تحقق من تجربة المسارات
                            </button>
                            {result && <WritingGuidance result={result} />}
                            <label className="writing-checkbox">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!tested}
                                onChange={(e) => setChecked(e.target.checked)}
                              />
                              جرّبت التتبّع وراجعت اتجاه الحركات والنقاط وترتيبها
                            </label>
                          </details>
                        )}
                      </>
                    )}
                    <button
                      className="btn btn-gold"
                      disabled={mode === 'GUIDED' && (!tested || !checked)}
                    >
                      حفظ الكلمة في مكتبتي
                    </button>
                  </fieldset>
                </form>
              </section>
              <section className="card pad">
                <h2>إضافة تمرين للحصة أو الواجب</h2>
                {!library.length ? (
                  <p>احفظ كلمتك الأولى في المكتبة أعلاه.</p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await api('/writing/sessions/' + id, 'POST', {
                          templateId: selected,
                          useAs,
                          title: 'كتابة «' + library.find((t) => t.id === selected)?.word + '»',
                        });
                        showPopup('أُضيف التمرين؛ النشاط يتاح عند بدء الحصة والواجب بعد انتهائها');
                      });
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label className="field">
                        كلمة من مكتبتي
                        <select
                          className="input"
                          value={selected}
                          required
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          <option value="">اختر الكلمة</option>
                          {library.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.word} · {t.mode === 'GUIDED' ? 'مسارات مجهزة' : 'مراجعة المعلم'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        استخدام التمرين
                        <select
                          className="input"
                          value={useAs}
                          onChange={(e) => setUseAs(e.target.value)}
                        >
                          <option value="ACTIVITY">نشاط أثناء الحصة</option>
                          <option value="HOMEWORK">واجب بعد انتهاء الحصة</option>
                        </select>
                      </label>
                      {library.find((t) => t.id === selected) &&
                        (() => {
                          const t = library.find((t) => t.id === selected)!;
                          return (
                            <WritingBoard
                              word={t.word}
                              fontSize={t.fontSize}
                              strokes={[]}
                              guides={t.guides}
                              readOnly
                              demonstrate
                              label="معاينة الكلمة المختارة"
                            />
                          );
                        })()}
                      <button className="btn btn-gold">إضافة التمرين</button>
                    </fieldset>
                  </form>
                )}
              </section>
            </>
          )}
          <section aria-label="تمارين الحصة">
            <h2>تمارين هذه الحصة</h2>
            {!data.tasks.length && (
              <p>
                {data.staff
                  ? 'لم تضف تمارين لهذه الحصة بعد.'
                  : 'تظهر الأنشطة عند بدء الحصة والواجبات بعد انتهائها.'}
              </p>
            )}
            {data.tasks.map((t) => (
              <article className="card pad" key={t.id}>
                <span className="tag">{t.useAs === 'HOMEWORK' ? 'واجب كتابة' : 'نشاط الحصة'}</span>
                <h3>{t.title}</h3>
                <p>
                  {t.mode === 'GUIDED'
                    ? 'تتبّع بمسارات مرقمة ومساعدة تقريبية'
                    : 'تتبّع بمراجعة المعلم'}
                </p>
                <div className="writing-row">
                  <Link
                    className="btn btn-gold"
                    href={'/writing/' + t.id + (embedded ? '?embedded=1' : '')}
                  >
                    {data.staff ? 'معاينة ومراجعة المحاولات' : 'فتح تمرين الكتابة'}
                  </Link>
                  {data.staff && (
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api('/writing/tasks/' + t.id, 'DELETE');
                          showPopup('أزيل التمرين الذي لم تُسلّم فيه محاولات');
                        })
                      }
                    >
                      إزالة تمرين لم يبدأ تسليمه
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
