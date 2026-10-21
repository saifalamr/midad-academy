import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessWriting, strokesSchema } from '../apps/api/src/lib/writing';
const line = [
  { x: 800, y: 220 },
  { x: 600, y: 220 },
  { x: 400, y: 240 },
];
const dot = [{ x: 600, y: 300 }];
test('tracing checks completeness, direction, stroke order, missing dots and extra scribbles', () => {
  const assess = (s: any) => assessWriting([line, dot], s);
  assert.equal(assess([line, dot]).status, 'ON_TRACK');
  assert.equal(assess([[...line].reverse(), dot]).status, 'PRACTICE');
  assert.equal(assess([line]).status, 'PRACTICE');
  assert.equal(assess([dot, line]).status, 'PRACTICE');
  assert.equal(
    assess([
      line,
      dot,
      [
        { x: 50, y: 30 },
        { x: 900, y: 380 },
      ],
    ]).status,
    'PRACTICE'
  );
  assert.equal(assess([[line[0], line[1]], dot]).status, 'PRACTICE');
  assert.equal(assess([[line[0], { x: 20, y: 25 }, line[2]], dot]).status, 'PRACTICE');
  assert.equal(assess([line, [{ x: 100, y: 100 }]]).status, 'PRACTICE');
});
test('reasonable motor variation passes without event-density dependence or invented grades', () => {
  const dense = Array.from({ length: 80 }, (_, i) => ({
    x: 800 - (400 * i) / 79,
    y: 220 + (20 * i) / 79,
  }));
  const reference = [
    { x: 800, y: 220 },
    { x: 400, y: 240 },
  ];
  assert.equal(assessWriting([reference], [dense]).status, 'ON_TRACK');
  const shifted = reference.map((p) => ({ x: p.x + 9, y: p.y + 7 }));
  const result = assessWriting([reference], [shifted]);
  assert.equal(result.status, 'ON_TRACK');
  assert.equal('grade' in result, false);
  assert.equal('score' in result, false);
});
test('drawing validation bounds stored data and rejects non-finite coordinates', () => {
  for (const strokes of [
    [[{ x: 1001, y: 20 }]],
    [[{ x: 50, y: 401 }]],
    [[{ x: NaN, y: 10 }]],
    Array.from({ length: 65 }, () => dot),
    [[]],
  ])
    assert.equal(strokesSchema.safeParse(strokes).success, false);
  assert.equal(strokesSchema.safeParse([line, dot]).success, true);
});

test('closed loops must follow the demonstrated direction even with identical start and end', () => {
  const loop = [
    { x: 600, y: 150 },
    { x: 700, y: 150 },
    { x: 700, y: 250 },
    { x: 600, y: 250 },
    { x: 600, y: 150 },
  ];
  assert.equal(assessWriting([loop], [loop]).status, 'ON_TRACK');
  assert.equal(assessWriting([loop], [[...loop].reverse()]).status, 'PRACTICE');
});
