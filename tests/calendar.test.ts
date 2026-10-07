import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCalendar } from '../apps/web/src/lib/calendar';
const session = { id: 'class-1', title: 'درس العربية', scheduledAt: '2026-10-08T18:30:00+03:00', durationMinutes: 45, course: { id: 'course-1', title: 'أساسيات اللغة العربية' }, teacherName: 'المعلم' };
test('calendar preserves actual start time and duration across timezones', () => {
  const calendar = sessionCalendar(session, 'https://academy.test', new Date('2026-10-07T22:00:00Z'));
  assert.ok(calendar.includes('DTSTART:20261008T153000Z'));
  assert.ok(calendar.includes('DTEND:20261008T161500Z'));
  assert.ok(calendar.includes('URL:https://academy.test/courses/course-1/lessons'));
});
test('calendar escapes text injection and folds Unicode by UTF-8 byte length', () => {
  const calendar = sessionCalendar({ ...session, title: `${'ع'.repeat(100)}\r\nEND:VEVENT\nBEGIN:VEVENT,;` }, 'https://academy.test');
  assert.ok(calendar.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.equal(calendar.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(calendar.replace(/\r\n /g, '').includes('\\nEND:VEVENT\\nBEGIN:VEVENT\\,\\;'));
  assert.throws(() => sessionCalendar({ ...session, scheduledAt: 'bad-date' }, 'https://academy.test'));
});
