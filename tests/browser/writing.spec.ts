import { test, expect, type Page, type Locator } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

async function draw(
  page: Page,
  board: Locator,
  strokes: { x: number; y: number }[][],
  type: 'mouse' | 'touch' | 'pen' = 'mouse'
) {
  await board.scrollIntoViewIfNeeded();
  const box = (await board.boundingBox())!;
  const coords = (p: { x: number; y: number }) => ({
    x: box.x + (p.x * box.width) / 1000,
    y: box.y + (p.y * box.height) / 400,
  });
  const cdp = type === 'mouse' ? null : await page.context().newCDPSession(page);
  try {
    for (const stroke of strokes) {
      if (type === 'touch') {
        const first = coords(stroke[0]);
        await cdp!.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...first, id: 1, radiusX: 1, radiusY: 1 }],
        });
        for (const p of stroke.slice(1))
          await cdp!.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...coords(p), id: 1, radiusX: 1, radiusY: 1 }],
          });
        await cdp!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (type === 'pen') {
        const first = coords(stroke[0]);
        await cdp!.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          ...first,
          button: 'left',
          buttons: 1,
          pointerType: 'pen',
          force: 0.5,
        });
        for (const p of stroke.slice(1))
          await cdp!.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            ...coords(p),
            buttons: 1,
            pointerType: 'pen',
            force: 0.5,
          });
        await cdp!.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          ...coords(stroke[stroke.length - 1]),
          button: 'left',
          buttons: 0,
          pointerType: 'pen',
        });
      } else {
        const first = coords(stroke[0]);
        await page.mouse.move(first.x, first.y);
        await page.mouse.down();
        for (const p of stroke.slice(1)) {
          const c = coords(p);
          await page.mouse.move(c.x, c.y, { steps: 4 });
        }
        await page.mouse.up();
      }
    }
  } finally {
    await cdp?.detach();
  }
}

test('teacher creates a custom guided word, pupil draws a recoverable draft, retries one submission and family receives teacher review', async ({
  page,
  browser,
  request,
}) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
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
      title: 'دورة كتابة المتصفح',
      description: 'Isolated browser fixture',
      teacherId: teacher.id,
      ageGroup: '8–10',
      level: 'beginner',
      price: 0,
    },
  });
  await prisma.enrollment.create({
    data: { courseId: course.id, studentId: student.id, enrolledAt: new Date('2020-01-01') },
  });
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      title: 'نكتب كلمة يختارها المعلم',
      scheduledAt: new Date(),
      status: 'SCHEDULED',
    },
  });
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  let templateId = '';
  const login = async (email: string) => {
    const r = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).data.token;
  };
  try {
    await page.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('teacher@preview.midad.test')
    );
    await page.goto('/sessions/' + session.id + '/writing');
    await page.getByRole('textbox', { name: 'الكلمة المطلوبة', exact: true }).fill('بَاب');
    await page.getByRole('combobox', { name: 'طريقة التدريب', exact: true }).selectOption('GUIDED');
    const guides = [
      [
        { x: 800, y: 240 },
        { x: 650, y: 255 },
        { x: 430, y: 240 },
      ],
      [{ x: 650, y: 310 }],
    ];
    await draw(page, page.getByRole('img', { name: 'تجهيز مسارات الكلمة', exact: true }), guides);
    await expect(page.getByText('2 حركة أو نقطة مجهّزة.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'حفظ الكلمة في مكتبتي', exact: true })
    ).toBeDisabled();
    await draw(page, page.getByRole('img', { name: 'تجربة مسارات الكلمة', exact: true }), guides);
    await page.getByRole('button', { name: 'تحقق من تجربة المسارات', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'المحاولة قريبة من المسارات' })).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'جرّبت التتبّع وراجعت اتجاه الحركات والنقاط وترتيبها' })
      .check();
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/writing/library') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'حفظ الكلمة في مكتبتي', exact: true }).click();
    templateId = (await (await created).json()).data.id;
    await expect(page.getByRole('alertdialog')).toContainText('حُفظت الكلمة');
    await page.getByRole('button', { name: 'حسنًا', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'استخدام التمرين', exact: true })
      .selectOption('HOMEWORK');
    const assigned = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/writing/sessions/' + session.id) && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'إضافة التمرين', exact: true }).click();
    const task = (await (await assigned).json()).data;
    await expect(page.getByRole('alertdialog')).toContainText('أُضيف التمرين');
    await page.getByRole('button', { name: 'حسنًا', exact: true }).click();
    await prisma.classSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } });
    const pupilContext = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    contexts.push(pupilContext);
    await pupilContext.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('student@preview.midad.test')
    );
    const pupil = await pupilContext.newPage();
    // Exercise the real student page inside a native call-style modal as well as standalone.
    const embeddedTask = await prisma.writingTask.create({
      data: {
        sessionId: session.id,
        title: 'كتابة في نافذة الحصة',
        word: 'مطر',
        mode: 'SIMPLE',
        fontSize: 120,
        guides: [],
        useAs: 'ACTIVITY',
      },
    });
    await pupil.route('**/embedded-writing-check', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          '<!doctype html><meta charset="utf-8"><dialog aria-label="نشاط داخل الحصة" style="width:90vw;height:85vh"><iframe title="كتابة داخل الحصة" src="/writing/' +
          embeddedTask.id +
          '?embedded=1" style="width:100%;height:100%;border:0"></iframe></dialog><script>document.querySelector("dialog").showModal()</script>',
      })
    );
    await pupil.goto('/embedded-writing-check');
    const embeddedBoard = pupil.frameLocator('iframe[title="كتابة داخل الحصة"]');
    try {
      await expect(
        embeddedBoard.getByRole('heading', { name: 'كتابة في نافذة الحصة', exact: true })
      ).toBeVisible();
      await expect(
        embeddedBoard.getByRole('img', { name: 'لوحة تتبّع الكلمة', exact: true })
      ).toBeVisible();
    } catch (error) {
      console.error('Embedded student writing:', await embeddedBoard.locator('body').innerText());
      throw error;
    }
    await pupil.goto('/student/homework');
    await pupil
      .getByRole('region', { name: 'واجبات الكتابة' })
      .getByRole('link', { name: 'فتح واجب الكتابة' })
      .click();
    await expect(pupil).toHaveURL(new RegExp('/writing/' + task.id + '$'));
    const board = pupil.getByRole('img', { name: 'لوحة تتبّع الكلمة', exact: true });
    await draw(pupil, board, [guides[0]], 'pen');
    await draw(pupil, board, [guides[1]], 'touch');
    await expect(board.locator('polyline.writing-ink')).toHaveCount(1);
    await pupil.reload();
    await expect(board.locator('polyline.writing-ink')).toHaveCount(1);
    await expect(board.locator('circle.writing-ink')).toHaveCount(1);
    await pupil.getByRole('button', { name: 'شاهد طريقة الكتابة', exact: true }).click();
    await expect(board.locator('.writing-demo')).toHaveCount(1);
    await pupil.getByRole('button', { name: 'تحقق من التتبّع', exact: true }).click();
    await expect(pupil.getByRole('heading', { name: 'المحاولة قريبة من المسارات' })).toBeVisible();
    for (const width of [320, 768, 1024, 1440]) {
      await pupil.setViewportSize({ width, height: 1000 });
      expect(
        await pupil.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
      await expect(board.locator('polyline.writing-ink')).toHaveCount(1);
    }
    await pupil.screenshot({ path: '/tmp/midad-writing-desktop.png', fullPage: true });
    await pupil.setViewportSize({ width: 390, height: 844 });
    await pupil.screenshot({ path: '/tmp/midad-writing-mobile.png', fullPage: true });
    const submitPath = '**/api/writing/tasks/' + task.id + '/submit';
    let posts = 0;
    await pupil.route(submitPath, async (route) => {
      posts++;
      const response = await route.fetch();
      if (posts === 1)
        await route.fulfill({ status: 503, json: { error: 'انقطع الرد بعد الحفظ؛ أعد المحاولة' } });
      else await route.fulfill({ response });
    });
    await pupil.getByRole('button', { name: 'تسليم محاولة الكتابة', exact: true }).click();
    await expect(pupil.getByRole('alertdialog')).toContainText('انقطع الرد');
    await pupil.getByRole('button', { name: 'إغلاق التنبيه', exact: true }).click();
    await pupil.getByRole('button', { name: 'تسليم محاولة الكتابة', exact: true }).click();
    await expect(pupil.getByRole('alertdialog')).toContainText('حُفظت محاولتك');
    await pupil.getByRole('button', { name: 'حسنًا', exact: true }).click();
    await expect(pupil.getByText('حُفظت المحاولة وسُلّمت للمعلم.', { exact: true })).toBeVisible();
    expect(await prisma.writingAttempt.count({ where: { taskId: task.id } })).toBe(1);
    await page.goto('/writing/' + task.id);
    await page
      .getByRole('combobox', { name: 'تقييم Preview Student', exact: true })
      .selectOption('ACHIEVED');
    await page
      .getByRole('textbox', { name: 'ملاحظة Preview Student', exact: true })
      .fill('أحسنت كتابة الباء؛ حافظ على موضع النقطة.');
    await page.getByRole('button', { name: 'اعتماد تقييم الكتابة', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('نُشر تقييم الكتابة');
    await page.getByRole('button', { name: 'حسنًا', exact: true }).click();
    const familyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(familyContext);
    await familyContext.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('parent@preview.midad.test')
    );
    const family = await familyContext.newPage();
    await family.goto('/writing/' + task.id);
    await expect(family.getByRole('heading', { name: 'أتقن التمرين', exact: true })).toBeVisible();
    await expect(
      family.getByText('أحسنت كتابة الباء؛ حافظ على موضع النقطة.', { exact: true })
    ).toBeVisible();
    await expect(
      family.getByRole('button', { name: 'تسليم محاولة الكتابة', exact: true })
    ).toHaveCount(0);
    await family.goto('/sessions/' + session.id + '/writing?embedded=1');
    await expect(
      family.getByRole('heading', { name: 'تمارين هذه الحصة', exact: true })
    ).toBeVisible();
    await expect(family.getByRole('navigation', { name: 'تنقل مساحة العمل' })).toBeHidden();
    const embeddedLink = family.locator('a[href="/writing/' + task.id + '?embedded=1"]');
    await expect(embeddedLink).toHaveAttribute('href', '/writing/' + task.id + '?embedded=1');
    await embeddedLink.click();
    await expect(family.getByRole('heading', { name: 'أتقن التمرين', exact: true })).toBeVisible();
    await expect(family.getByRole('navigation', { name: 'تنقل مساحة العمل' })).toBeHidden();
  } finally {
    for (const c of contexts) await c.close();
    await prisma.writingAttempt.deleteMany({ where: { task: { sessionId: session.id } } });
    await prisma.writingTask.deleteMany({ where: { sessionId: session.id } });
    if (templateId) await prisma.writingTemplate.delete({ where: { id: templateId } });
    await prisma.classSession.delete({ where: { id: session.id } });
    await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.$disconnect();
  }
});
