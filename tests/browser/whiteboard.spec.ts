import { test, expect, type Page } from '@playwright/test';
test('two participants keep concurrent drawings, undo only their edits, erase and restore a saved board', async ({ browser, request }) => {
  const login = async (email: string) => (await (await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email, password: 'MidadPreview2026!' } })).json()).data;
  const teacherAuth = await login('teacher@preview.midad.test'); const studentAuth = await login('student@preview.midad.test');
  await request.post('http://127.0.0.1:4000/api/payments/create-checkout', { headers: { Authorization: `Bearer ${studentAuth.token}` }, data: { courseId: 'preview-arabic' } });
  const grant = await request.post('http://127.0.0.1:4000/api/sessions/drawing-permission', { headers: { Authorization: `Bearer ${teacherAuth.token}` }, data: { roomName: 'preview-arabic', studentId: studentAuth.user.id, canDraw: true } });
  expect(grant.ok(), await grant.text()).toBeTruthy();
  const teacherContext = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await teacherContext.addInitScript(token => localStorage.setItem('token', token), teacherAuth.token);
  await studentContext.addInitScript(token => localStorage.setItem('token', token), studentAuth.token);
  const teacher = await teacherContext.newPage(); const student = await studentContext.newPage();
  const errors: string[] = []; [teacher,student].forEach(p => p.on('pageerror',e => errors.push(e.message)));
  for (const page of [teacher, student]) { await page.goto('/courses/preview-arabic/board'); await expect(page.getByText('متزامنة', { exact: true })).toBeVisible(); }
  const shape = async (page: Page, name: string, position: number) => {
    await page.getByRole('button', { name, exact: true }).click();
    const box = (await page.locator('canvas.upper-canvas').boundingBox())!;
    await page.mouse.click(box.x+box.width*position,box.y+box.height*.5);
  };
  const ink = (page: Page) => page.locator('canvas.lower-canvas').evaluate((c: HTMLCanvasElement) => {
    const a = c.getContext('2d')!.getImageData(0,0,c.width,c.height).data; let n=0;
    for(let i=0;i<a.length;i+=4) if(a[i]<100&&a[i+1]<120&&a[i+2]>50&&a[i+3]>100)n++; return n;
  });
  await Promise.all([shape(teacher,'مستطيل',.25), shape(student,'دائرة',.75)]);
  await expect.poll(() => ink(teacher)).toBeGreaterThan(100);
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  const withBoth = await ink(teacher);
  await teacher.getByRole('button', { name: 'تراجع', exact: true }).click();
  await expect.poll(() => ink(teacher)).toBeLessThan(withBoth);
  expect(await ink(teacher)).toBeGreaterThan(0); // Student's independent stroke survives teacher undo.
  await teacher.getByRole('button', { name: 'إعادة', exact: true }).click();
  await expect.poll(() => ink(teacher)).toBe(withBoth);
  await student.reload(); await expect(student.getByText('متزامنة',{exact:true})).toBeVisible();
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  teacher.once('dialog', d=>d.accept()); await teacher.getByRole('button',{name:'مسح',exact:true}).click();
  await expect.poll(() => ink(student)).toBe(0);
  await teacher.getByRole('button',{name:'تراجع',exact:true}).click();
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  const beforeErase = await ink(teacher);
  await shape(teacher, 'ممحاة', .25);
  await expect.poll(() => ink(teacher)).toBeLessThan(beforeErase);
  await teacher.getByRole('button',{name:'تراجع',exact:true}).click();
  await expect.poll(() => ink(teacher)).toBe(beforeErase);
  const download = teacher.waitForEvent('download'); await teacher.getByRole('button',{name:'حفظ صورة',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/midad-board.*\.png/);
  expect(errors).toEqual([]);
  await teacherContext.close(); await studentContext.close();
});
