import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '5433')
    throw new Error('Preview seed only runs on the local preview database (port 5433)');
  const passwordHash = await bcrypt.hash('MidadPreview2026!', 10);
  for (const [email, name, role] of [
    ['teacher@preview.midad.test', 'Preview Teacher', 'TEACHER'],
    ['student@preview.midad.test', 'Preview Student', 'STUDENT'],
    ['parent@preview.midad.test', 'Preview Parent', 'PARENT'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        role,
        passwordHash,
        ...(role === 'TEACHER'
          ? {
              teacherProfile: {
                create: { bio: 'Arabic course teacher', qualifications: [], hourlyRate: 0 },
              },
            }
          : role === 'STUDENT'
            ? { studentProfile: { create: { age: 10 } } }
            : { parentProfile: { create: {} } }),
      },
    });
  }
  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher@preview.midad.test' } },
  });
  const course = await prisma.course.upsert({
    where: { id: 'preview-arabic' },
    update: {},
    create: {
      id: 'preview-arabic',
      teacherId: teacher.id,
      title: 'Arabic Foundations · أساسيات العربية',
      description: 'Practice Arabic letters, words and simple sentences with your teacher.',
      level: 'beginner',
      ageGroup: '8–10',
      price: 0,
    },
  });
  const content = await prisma.courseContent.upsert({
    where: { id: 'preview-exercise' },
    update: { contentUrl: '/lesson-sample' },
    create: {
      id: 'preview-exercise',
      courseId: course.id,
      title: 'First Arabic words',
      description: 'Recognize a greeting and write your first word.',
      type: 'EXERCISE',
      contentUrl: '/lesson-sample',
      order: 0,
      duration: 10,
    },
  });
  await prisma.quiz.upsert({
    where: { courseContentId: content.id },
    update: {},
    create: {
      courseContentId: content.id,
      title: 'First words',
      questions: {
        create: [
          {
            text: 'What does مرحباً mean?',
            questionType: 'MCQ',
            options: ['Hello', 'Goodbye'],
            correctAnswer: 'Hello',
            points: 1,
          },
          { text: 'Write a word you learned in Arabic.', questionType: 'WRITTEN', points: 1 },
        ],
      },
    },
  });
  await prisma.user.upsert({
    where: { email: 'admin@preview.midad.test' },
    update: {},
    create: {
      email: 'admin@preview.midad.test',
      name: 'Preview Admin',
      role: 'ADMIN',
      passwordHash,
    },
  });
  const parent = await prisma.parentProfile.findFirstOrThrow({
    where: { user: { email: 'parent@preview.midad.test' } },
  });
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: { user: { email: 'student@preview.midad.test' } },
  });
  await prisma.studentProfile.update({ where: { id: student.id }, data: { parentId: parent.id } });
  await prisma.enrollment.upsert({
    where: { courseId_studentId: { courseId: course.id, studentId: student.id } },
    update: { status: 'ACTIVE' },
    create: { courseId: course.id, studentId: student.id },
  });
  console.log('Preview accounts and a free course are ready. See README for login details.');
}
main().finally(() => prisma.$disconnect());
