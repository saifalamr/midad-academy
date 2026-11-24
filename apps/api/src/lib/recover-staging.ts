import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const hash = z.string().regex(/^\$2[aby]\$\d{2}\$.{53}$/);

export async function recoverStaging(db: PrismaClient) {
  const value = process.env.STAGING_ACCOUNT_RECOVERY;
  if (!value) return;

  const database = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.RENDER_SERVICE_ID !== 'srv-dbvgv23rjlhs73btn340' ||
    database.hostname !== 'aws-1-eu-west-1.pooler.supabase.com' ||
    database.pathname !== '/postgres'
  )
    throw new Error('Staging account recovery is restricted to the Medad test service.');

  const input = z
    .object({
      adminEmail: z.string().email().endsWith('@midad.test'),
      adminHash: hash,
      teacherEmail: z.string().email().endsWith('@midad.test'),
      teacherHash: hash,
      disabledHash: hash,
    })
    .parse(JSON.parse(value));
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const month = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
  const title = `دورة تجربة مداد ${month}`;

  await db.$transaction(async (tx) => {
    let admin = await tx.user.findUnique({ where: { email: input.adminEmail } });
    if (admin && admin.role !== 'ADMIN') throw new Error('Recovery admin email has another role.');
    admin ??= await tx.user.create({
      data: {
        email: input.adminEmail,
        name: 'إدارة تجربة مداد',
        passwordHash: input.adminHash,
        role: 'ADMIN',
      },
    });
    const previousAdmins = await tx.user.findMany({
      where: { role: 'ADMIN', id: { not: admin.id } },
      select: { id: true },
    });
    await tx.user.updateMany({
      where: { role: 'ADMIN', id: { not: admin.id } },
      data: { passwordHash: input.disabledHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordReset.deleteMany({
      where: { userId: { in: previousAdmins.map(({ id }) => id) } },
    });

    let teacher = await tx.user.findUnique({
      where: { email: input.teacherEmail },
      include: { teacherProfile: true },
    });
    if (teacher && (teacher.role !== 'TEACHER' || !teacher.teacherProfile))
      throw new Error('Recovery teacher email is not a teacher account.');
    teacher ??= await tx.user.create({
      data: {
        email: input.teacherEmail,
        name: 'معلم تجربة مداد',
        passwordHash: input.teacherHash,
        role: 'TEACHER',
        teacherProfile: {
          create: { bio: 'معلم دورة التست', qualifications: [], hourlyRate: 0 },
        },
      },
      include: { teacherProfile: true },
    });
    const teacherId = teacher.teacherProfile!.id;
    const existing = await tx.course.findFirst({ where: { title, teacherId } });
    if (!existing)
      await tx.course.create({
        data: {
          title,
          teacherId,
          description: 'دورة تجريبية لمسار ولي الأمر والطفل والمعلم ببيانات وهمية.',
          level: 'beginner',
          ageGroup: '8–10',
          month,
          timeZone: 'Europe/Istanbul',
          price: 0,
          maxStudents: 20,
        },
      });
  });
  console.log('Staging recovery prepared one administrator, teacher, and free course.');
}
