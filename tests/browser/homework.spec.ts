import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('admin prepares homework, pupil recovers a draft and retries one submission, teacher approves privately for the family', async ({
  page,
  browser,
  request,
}) => {
  const database = new URL(process.env.DATABASE_URL!);
  expect(['127.0.0.1', 'localhost']).toContain(database.hostname);
  expect(database.port).toBe('5433');
  const prisma = new PrismaClient();
  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher@preview.midad.test' } },
  });
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: { user: { email: 'student@preview.midad.test' } },
  });
  const parent = await prisma.parentProfile.findFirstOrThrow({
    where: { user: { email: 'parent@preview.midad.test' } },
  });
  await prisma.studentProfile.update({ where: { id: student.id }, data: { parentId: parent.id } });
  const course = await prisma.course.create({
    data: {
      title: 'دورة اختبار الواجب',
      description: 'Local homework fixture',
      teacherId: teacher.id,
      ageGroup: '8–10',
      level: 'beginner',
      price: 0,
      month: '2099-02',
    },
  });
  await prisma.enrollment.create({
    data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' },
  });
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      title: 'حصة اختبار الواجب',
      scheduledAt: new Date('2099-02-05T10:00:00Z'),
    },
  });
  const contexts = [];
  const as = async (email: string) => {
    const res = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(res.ok()).toBeTruthy();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(context);
    await context.addInitScript(
      (token) => localStorage.setItem('token', token),
      (await res.json()).data.token
    );
    return context.newPage();
  };
  try {
    const login = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email: 'admin@preview.midad.test', password: 'MidadPreview2026!' },
    });
    await page.addInitScript(
      (token) => localStorage.setItem('token', token),
      (await login.json()).data.token
    );
    await page.goto(`/admin/sessions/${session.id}/homework`);
    const editor = page.getByRole('region', { name: 'إعداد واجب الحصة' });
    await editor.getByLabel('عنوان الواجب').fill('واجب الحروف');
    await editor.getByRole('button', { name: 'إضافة سؤال', exact: true }).click();
    const first = editor.getByRole('article', { name: 'سؤال 1', exact: true });
    await first.getByLabel('نص السؤال').fill('اختر أول حرف');
    await first.getByLabel('الخيارات').fill('ألف\nباء');
    await first.getByLabel('الإجابة الصحيحة').selectOption('ألف');
    await editor.getByRole('button', { name: 'إضافة سؤال', exact: true }).click();
    const second = editor.getByRole('article', { name: 'سؤال 2', exact: true });
    await second.getByLabel('نوع السؤال').selectOption('TRUE_FALSE');
    await second.getByLabel('نص السؤال').fill('الألف حرف');
    await editor.getByRole('button', { name: 'إضافة سؤال', exact: true }).click();
    const third = editor.getByRole('article', { name: 'سؤال 3', exact: true });
    await third.getByLabel('نوع السؤال').selectOption('MATCHING');
    await third.getByLabel('نص السؤال').fill('صل الحروف');
    await third.getByLabel('الأزواج الصحيحة').fill('ألف = أ\nباء = ب');
    await editor.getByRole('button', { name: 'إضافة سؤال', exact: true }).click();
    const fourth = editor.getByRole('article', { name: 'سؤال 4', exact: true });
    await fourth.getByLabel('نوع السؤال').selectOption('AUDIO');
    await fourth.getByLabel('نص السؤال').fill('اقرأ الحروف');
    await fourth.getByLabel('الحد الأقصى للتسجيل بالثواني').fill('30');
    await editor.getByRole('button', { name: 'حفظ الواجب', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('حُفظ');
    await page.reload();
    await expect(third.getByLabel('الأزواج الصحيحة')).toHaveValue('ألف = أ\nباء = ب');
    for (const width of [320, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
    }
    // Local lifecycle fixture avoids requiring a remote media provider in this UI test.
    await prisma.classSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED' },
    });
    const pupil = await as('student@preview.midad.test');
    await pupil.goto(`/student/homework/${session.id}`);
    const solver = pupil.getByRole('region', { name: 'حل واجب الحصة' });
    await solver.getByRole('radio', { name: 'ألف', exact: true }).check();
    await pupil.reload();
    await expect(solver.getByRole('radio', { name: 'ألف', exact: true })).toBeChecked();
    await solver.getByRole('radio', { name: 'صح', exact: true }).check();
    await solver.getByLabel('صل الحروف: ألف', { exact: true }).selectOption('أ');
    await solver.getByLabel('صل الحروف: باء', { exact: true }).selectOption('ب');
    await pupil.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw Error('لا توجد صلاحية للميكروفون');
      };
    });
    await pupil.reload();
    await solver.getByRole('button', { name: 'بدء التسجيل', exact: true }).click();
    await expect(pupil.getByRole('alertdialog').getByRole('alert')).toContainText('صلاحية');
  await pupil.getByRole('alertdialog').getByRole('button', { name: 'إغلاق التنبيه' }).click();
    await solver
      .getByLabel('رفع ملف صوتي')
      .setInputFiles({
        name: 'answer.wav',
        mimeType: 'audio/wav',
        buffer: Buffer.from('test audio'),
      });
    await expect(solver.getByRole('button', { name: 'تسليم الواجب', exact: true })).toBeDisabled();
    const audioQuestion = (
      await prisma.sessionHomework.findUniqueOrThrow({ where: { sessionId: session.id } })
    ).questions as any[];
    const audioQ = audioQuestion.find((q) => q.type === 'AUDIO');
    // Storage is mocked in the browser; the server upload validation is tested independently.
    await pupil.route(`**/api/homework-audio/${session.id}/${audioQ.id}`, async (route) => {
      const audio = await prisma.homeworkAudio.create({
        data: {
          sessionId: session.id,
          studentId: student.id,
          questionId: audioQ.id,
          publicId: 'browser-local-audio',
          format: 'mp3',
          duration: 12,
          bytes: 1024,
        },
      });
      await route.fulfill({ status: 201, json: { data: { id: audio.id, duration: 12 } } });
    });
    await solver.getByRole('button', { name: 'حفظ التسجيل الصوتي', exact: true }).click();
    await expect(solver.getByText('التسجيل محفوظ.', { exact: true })).toBeVisible();
    await pupil.reload();
    await expect(solver.getByText('التسجيل محفوظ.', { exact: true })).toBeVisible();
    // The server commits but the reply is lost: resubmitting must return the same saved attempt.
    const submitPath = `**/api/homework/${session.id}/submit`;
    await pupil.route(submitPath, async (route) => {
      await route.fetch();
      await route.abort('connectionfailed');
    });
    await solver.getByRole('button', { name: 'تسليم الواجب', exact: true }).click();
    await expect(pupil.getByRole('alertdialog').getByRole('alert')).toBeVisible();
  await pupil.getByRole('alertdialog').getByRole('button', { name: 'إغلاق التنبيه' }).click();
    await expect(solver.getByRole('radio', { name: 'ألف', exact: true })).toBeChecked();
    await pupil.unroute(submitPath);
    await solver.getByRole('button', { name: 'تسليم الواجب', exact: true }).click();
    await expect(solver.getByRole('status')).toContainText('بانتظار');
    expect(await prisma.homeworkSubmission.count({ where: { sessionId: session.id } })).toBe(1);
    await pupil.reload();
    await expect(solver.getByRole('radio', { name: 'ألف', exact: true })).toBeDisabled();
    const family = await as('parent@preview.midad.test');
    await family.goto('/parent/homework');
    const familyCard = family.getByRole('article').filter({ hasText: 'واجب الحروف' });
    await expect(familyCard).toContainText('بانتظار مراجعة المعلم');
    await expect(familyCard).not.toContainText('الدرجة:');
    const tutor = await as('teacher@preview.midad.test');
    await tutor.goto(`/teacher/homework/${session.id}`);
    const grader = tutor.getByRole('article').filter({ hasText: 'بانتظار الاعتماد' });
    await grader.getByLabel('الدرجة — اقرأ الحروف').fill('1');
    await grader.getByRole('checkbox', { name: 'استمعت للتسجيل وراجعت درجته' }).check();
    await grader.getByLabel('ملاحظة للطالب وولي الأمر').fill('أحسنت يا بطل');
    await grader.getByRole('button', { name: 'حفظ مسودة التصحيح' }).click();
    await expect(grader.getByRole('status')).toContainText('مسودة');
    await family.reload();
    await expect(familyCard).not.toContainText('أحسنت يا بطل');
    tutor.once('dialog', (dialog) => dialog.accept());
    await grader.getByRole('button', { name: 'اعتماد النتيجة', exact: true }).click();
    await expect(tutor.getByRole('status')).toContainText('اعتمدت النتيجة');
    await family.reload();
    await expect(familyCard).toContainText('الدرجة: 4 / 4');
    await expect(familyCard).toContainText('أحسنت يا بطل');
    await pupil.reload();
    await expect(solver.getByRole('status')).toContainText('4 / 4');
    await pupil.screenshot({ path: 'test-results/homework-student-mobile.png', fullPage: true });
    await family.screenshot({ path: 'test-results/homework-parent-mobile.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await prisma.classSession.deleteMany({ where: { courseId: course.id } });
    await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.$disconnect();
  }
});
