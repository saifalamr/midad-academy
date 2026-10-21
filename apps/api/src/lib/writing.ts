import { z } from 'zod';
export const pointSchema = z
  .object({ x: z.number().finite().min(0).max(1000), y: z.number().finite().min(0).max(400) })
  .strict();
export const strokesSchema = z
  .array(z.array(pointSchema).min(1).max(256))
  .max(64)
  .refine(
    (s) => s.reduce((n, a) => n + a.length, 0) <= 8000,
    'المحاولة كبيرة جدًا؛ امسح الحركات الزائدة'
  );
export type Point = z.infer<typeof pointSchema>;
export type Strokes = z.infer<typeof strokesSchema>;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function length(s: Point[]) {
  return s.slice(1).reduce((n, p, i) => n + distance(s[i], p), 0);
}
// Equal arc-length samples avoid giving dense pointer events a higher score.
function sample(s: Point[], count = 48) {
  const total = length(s);
  if (!total) return [s[0]];
  const out: Point[] = [];
  let segment = 1,
    accumulated = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (segment < s.length - 1 && accumulated + distance(s[segment - 1], s[segment]) < target) {
      accumulated += distance(s[segment - 1], s[segment]);
      segment++;
    }
    const a = s[segment - 1],
      b = s[segment];
    const t = Math.min(1, Math.max(0, (target - accumulated) / (distance(a, b) || 1)));
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return out;
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))
  );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
function near(p: Point, s: Point[]) {
  return s.length === 1
    ? distance(p, s[0])
    : Math.min(...s.slice(1).map((b, i) => segmentDistance(p, s[i], b)));
}
export function assessWriting(guides: Strokes, strokes: Strokes) {
  const steps = guides.map((guide, index) => {
    const stroke = strokes[index];
    if (!stroke) return { index, passed: false, message: 'باقي هذه الحركة أو النقطة' };
    const gl = length(guide),
      sl = length(stroke);
    if (gl < 20) {
      const passed = sl <= 60 && sample(stroke).every((p) => distance(p, guide[0]) <= 30);
      return {
        index,
        passed,
        message: passed ? 'النقطة قريبة من النموذج' : 'ضع النقطة قرب علامة البداية',
      };
    }
    if (
      distance(guide[0], stroke[0]) > 45 ||
      distance(guide[guide.length - 1], stroke[stroke.length - 1]) > 45
    )
      return { index, passed: false, message: 'راجع نقطة البداية واتجاه الحركة ونهايتها' };
    const reference = sample(guide),
      drawn = sample(stroke);
    const coverage = reference.filter((p) => near(p, stroke) <= 24).length / reference.length;
    const precision = drawn.filter((p) => near(p, guide) <= 24).length / drawn.length;
    // Arc-length alignment also catches a reversed closed loop whose start and
    // end coincide, which endpoint checks and geometric coverage alone miss.
    const aligned =
      reference.filter((p, i) => distance(p, drawn[Math.min(i, drawn.length - 1)]) <= 45).length /
      reference.length;
    const passed =
      coverage >= 0.92 && precision >= 0.88 && aligned >= 0.8 && sl >= gl * 0.6 && sl <= gl * 1.7;
    return {
      index,
      passed,
      message: passed ? 'الحركة قريبة من المسار' : 'أكمل المسار بهدوء وقلّل الخطوط الخارجة عنه',
    };
  });
  const extra = Math.max(0, strokes.length - guides.length);
  return {
    status: steps.every((s) => s.passed) && !extra ? 'ON_TRACK' : 'PRACTICE',
    steps,
    extra,
    note: 'مساعدة تقريبية على التتبّع بحسب مسارات المعلم؛ ليست درجة ولا حكمًا على صحة الكلمة أو جمال الخط.',
  };
}
