export type CalendarSession = { id: string; title: string; scheduledAt: string; durationMinutes: number; course: { id: string; title: string }; teacherName: string };

const text = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const date = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line: string) {
  const encoder = new TextEncoder();
  let output = '', size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) { output += '\r\n '; size = 1; }
    output += character; size += bytes;
  }
  return output;
}
export function sessionCalendar(session: CalendarSession, origin: string, now = new Date()) {
  const start = new Date(session.scheduledAt);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(session.durationMinutes) || session.durationMinutes < 1 || session.durationMinutes > 240) throw new Error('Invalid class schedule');
  const end = new Date(start.getTime() + session.durationMinutes * 60000);
  const url = new URL(`/courses/${encodeURIComponent(session.course.id)}/lessons`, origin).href;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Midad Academy//Class Schedule//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(session.id)}@midad-academy`, `DTSTAMP:${date(now)}`, `DTSTART:${date(start)}`, `DTEND:${date(end)}`,
    `SUMMARY:${text(session.title)}`, `DESCRIPTION:${text(`${session.course.title}\nTeacher: ${session.teacherName}\n${url}`)}`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR'];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
