export const classPhases = [
  'مراجعة الدرس السابق',
  'شرح الدرس الحالي',
  'تفاعل مع الطلاب',
  'إعطاء الواجب',
];
export function phaseAt(startedAt: string, minutes: number[], now: number) {
  const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  let boundary = 0;
  for (let index = 0; index < minutes.length; index++) {
    boundary += minutes[index] * 60;
    if (elapsed < boundary) return { index, remaining: boundary - elapsed, elapsed, ended: false };
  }
  return { index: minutes.length - 1, remaining: 0, elapsed, ended: true };
}
