import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { canAccessCourse, httpError } from '../lib/access';
import { awardQuiz } from '../lib/rewards';
import { quizResultData } from '../lib/quiz-results';

const createQuestionSchema = z.object({
  text: z.string().trim().min(1, 'Question text is required').max(5000),
  questionType: z.enum(['MCQ', 'WRITTEN', 'TRUE_FALSE']).optional().default('MCQ'),
  options: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  correctAnswer: z.string().trim().min(1).max(1000).optional(),
  points: z.number().int().min(1).max(1000).optional(),
});

const updateQuizSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
});

const submitQuizSchema = z.object({
  answers: z.record(z.string(), z.string().trim().max(10000)),
  submissionKey: z.string().uuid().optional(),
  quizRevision: z.number().int().min(0).optional(),
});

type ResolvedQuestion =
  | { ok: true; options: string[] | undefined; correctAnswer: string | undefined }
  | { ok: false; error: string };

// Validates and normalises a question's options/correctAnswer for its type.
// Shared by the create and edit endpoints so both enforce the same rules.
function resolveQuestionFields(body: z.infer<typeof createQuestionSchema>): ResolvedQuestion {
  if (body.questionType === 'WRITTEN') {
    // Written answers are free-text and graded manually — no options/correctAnswer.
    return { ok: true, options: undefined, correctAnswer: undefined };
  }
  if (body.questionType === 'TRUE_FALSE') {
    if (body.correctAnswer !== 'True' && body.correctAnswer !== 'False') {
      return { ok: false, error: "correctAnswer must be 'True' or 'False'" };
    }
    return { ok: true, options: ['True', 'False'], correctAnswer: body.correctAnswer };
  }
  // MCQ
  if (!body.options || body.options.length < 2) {
    return { ok: false, error: 'At least two options are required' };
  }
  if (new Set(body.options).size !== body.options.length)
    return { ok: false, error: 'Answer options must be distinct' };
  if (!body.correctAnswer || !body.options.includes(body.correctAnswer)) {
    return { ok: false, error: 'correctAnswer must be one of the provided options' };
  }
  return { ok: true, options: body.options, correctAnswer: body.correctAnswer };
}

// Curriculum editing belongs to the academy administration.
async function findOwnedQuiz(quizId: string) {
  return prisma.quiz.findUnique({
    where: { id: quizId },
    include: { content: { include: { course: true } } },
  });
}

async function mutateQuiz<T>(
  quizId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
    await tx.quiz.update({ where: { id: quizId }, data: { revision: { increment: 1 } } });
    return operation(tx);
  });
}

export async function quizRoutes(app: FastifyInstance) {
  // ── POST /api/quiz/:id/questions ──────────────────────────────────────────
  // Adds a question to a quiz. Only the owning teacher may do this.
  app.post<{ Params: { id: string } }>(
    '/:id/questions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: quizId } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can add questions' });
      }

      const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: { content: { include: { course: true } } },
      });
      if (!quiz) {
        return reply.status(404).send({ error: 'Quiz not found' });
      }

      const body = createQuestionSchema.parse(request.body);

      const resolved = resolveQuestionFields(body);
      if (!resolved.ok) {
        return reply.status(400).send({ error: resolved.error });
      }

      const question = await mutateQuiz(quizId, (tx) =>
        tx.question.create({
          data: {
            quizId,
            text: body.text,
            questionType: body.questionType,
            options: resolved.options,
            correctAnswer: resolved.correctAnswer,
            ...(body.points !== undefined ? { points: body.points } : {}),
          },
        })
      );

      return reply.status(201).send({ data: question });
    }
  );

  // ── PATCH /api/quiz/:id ────────────────────────────────────────────────────
  // Updates a quiz's title and/or passing score. Only the owning teacher may.
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: quizId } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can edit quizzes' });
      }

      const quiz = await findOwnedQuiz(quizId);
      if (!quiz) {
        return reply.status(404).send({ error: 'Quiz not found' });
      }

      const body = updateQuizSchema.parse(request.body);

      const updated = await mutateQuiz(quizId, (tx) =>
        tx.quiz.update({
          where: { id: quizId },
          data: {
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.passingScore !== undefined ? { passingScore: body.passingScore } : {}),
          },
          include: { questions: true, content: { select: { courseId: true } } },
        })
      );

      return reply.send({ data: updated });
    }
  );

  // ── PATCH /api/quiz/:id/questions/:questionId ─────────────────────────────
  // Edits an existing question (text, type, options, correct answer, points).
  // The question must belong to the quiz, which must belong to the teacher.
  app.patch<{ Params: { id: string; questionId: string } }>(
    '/:id/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: quizId, questionId } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can edit questions' });
      }

      const quiz = await findOwnedQuiz(quizId);
      if (!quiz) {
        return reply.status(404).send({ error: 'Quiz not found' });
      }

      const existing = await prisma.question.findUnique({ where: { id: questionId } });
      if (!existing || existing.quizId !== quizId) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      const body = createQuestionSchema.parse(request.body);

      const resolved = resolveQuestionFields(body);
      if (!resolved.ok) {
        return reply.status(400).send({ error: resolved.error });
      }

      const question = await mutateQuiz(quizId, (tx) =>
        tx.question.update({
          where: { id: questionId },
          data: {
            text: body.text,
            questionType: body.questionType,
            // Json column: use Prisma.JsonNull (not JS null/undefined) to clear it,
            // e.g. when a question is switched to the WRITTEN type.
            options: resolved.options === undefined ? Prisma.JsonNull : resolved.options,
            correctAnswer: resolved.correctAnswer ?? null,
            ...(body.points !== undefined ? { points: body.points } : {}),
          },
        })
      );

      return reply.send({ data: question });
    }
  );

  // ── DELETE /api/quiz/:id/questions/:questionId ────────────────────────────
  // Removes a question from a quiz. Only the owning teacher may.
  app.delete<{ Params: { id: string; questionId: string } }>(
    '/:id/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: quizId, questionId } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can delete questions' });
      }

      const quiz = await findOwnedQuiz(quizId);
      if (!quiz) {
        return reply.status(404).send({ error: 'Quiz not found' });
      }

      const existing = await prisma.question.findUnique({ where: { id: questionId } });
      if (!existing || existing.quizId !== quizId) {
        return reply.status(404).send({ error: 'Question not found' });
      }

      await mutateQuiz(quizId, async (tx) => {
        if (await tx.studentAnswer.count({ where: { questionId } }))
          throw httpError(
            409,
            'لا يمكن حذف سؤال له إجابات طلاب. يمكنك تعديله مع حفظ نتائج المحاولات السابقة.'
          );
        await tx.question.delete({ where: { id: questionId } });
      });

      return reply.status(204).send();
    }
  );

  // ── GET /api/quiz/:id ──────────────────────────────────────────────────────
  // Returns a quiz with its questions. Students don't receive correctAnswer.
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: quizId } = request.params;

      const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: { questions: true, content: { select: { courseId: true } } },
      });
      if (!quiz) {
        return reply.status(404).send({ error: 'Quiz not found' });
      }

      if (!(await canAccessCourse(request.user, quiz.content.courseId)))
        return reply.status(403).send({ error: 'You cannot submit this quiz' });

      if (role === 'TEACHER' || role === 'ADMIN') {
        return reply.send({ data: quiz });
      }

      return reply.send({
        data: {
          ...quiz,
          questions: quiz.questions.map(({ correctAnswer: _correctAnswer, ...q }) => q),
        },
      });
    }
  );

  // ── POST /api/quiz/:id/submit ─────────────────────────────────────────────
  // Student submits answers. MCQ/TRUE_FALSE are auto-graded immediately;
  // WRITTEN answers are saved as pending for the teacher to grade.
  app.post<{ Params: { id: string } }>(
    '/:id/submit',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id: userId, role } = request.user;
      const { id: quizId } = request.params;

      if (role !== 'STUDENT') {
        return reply.status(403).send({ error: 'Only students can submit quiz answers' });
      }

      const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
      if (!studentProfile) {
        return reply.status(404).send({ error: 'Student profile not found' });
      }

      const body = submitQuizSchema.parse(request.body);
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id = ${quizId} FOR UPDATE`;
        const quiz = await tx.quiz.findUnique({
          where: { id: quizId },
          include: { questions: true, content: { select: { courseId: true } } },
        });
        if (!quiz) throw httpError(404, 'Quiz not found');
        const enrollment = await tx.enrollment.findFirst({
          where: {
            studentId: studentProfile.id,
            courseId: quiz.content.courseId,
            status: 'ACTIVE',
          },
        });
        if (!enrollment) throw httpError(403, 'You cannot submit this quiz');
        if (body.submissionKey) {
          const existing = await tx.studentQuizResult.findUnique({
            where: {
              studentId_quizId_submissionKey: {
                studentId: studentProfile.id,
                quizId,
                submissionKey: body.submissionKey,
              },
            },
            include: { quiz: true, studentAnswers: { include: { question: true } } },
          });
          if (existing) {
            const old = existing.answers as Record<string, string>;
            if (
              Object.keys(old).length !== Object.keys(body.answers).length ||
              Object.entries(old).some(([id, value]) => body.answers[id] !== value)
            )
              throw httpError(
                409,
                'هذا الطلب محفوظ بإجابات مختلفة. افتح محاولة جديدة لتغيير الإجابات.'
              );
            return existing;
          }
        }
        if (body.quizRevision !== undefined && body.quizRevision !== quiz.revision)
          throw httpError(
            409,
            'تغير الاختبار أثناء الإجابة. أغلقه وافتحه مجددًا لرؤية أحدث الأسئلة.'
          );
        if (!quiz.questions.length) throw httpError(400, 'This quiz has no questions yet');
        const ids = new Set(quiz.questions.map((q) => q.id));
        if (Object.keys(body.answers).some((id) => !ids.has(id)))
          throw httpError(400, 'الإجابات تحتوي على سؤال لا ينتمي لهذا الاختبار.');
        for (const q of quiz.questions) {
          const answer = body.answers[q.id];
          if (!answer) throw httpError(400, 'أجب عن جميع الأسئلة قبل تسليم الاختبار.');
          if (
            q.questionType !== 'WRITTEN' &&
            (!Array.isArray(q.options) || !q.options.includes(answer))
          )
            throw httpError(400, 'اختر إجابة من الخيارات المعروضة.');
        }
        let earnedPoints = 0;
        const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
        const hasPending = quiz.questions.some((q) => q.questionType === 'WRITTEN');
        const studentAnswers = quiz.questions.map((q) => {
          const correct =
            q.questionType === 'WRITTEN' ? null : body.answers[q.id] === q.correctAnswer;
          const pointsAwarded = correct === null ? null : correct ? q.points : 0;
          earnedPoints += pointsAwarded ?? 0;
          return {
            questionId: q.id,
            answerText: body.answers[q.id],
            correct,
            pointsAwarded,
            status: correct === null ? ('PENDING' as const) : ('GRADED' as const),
            questionTextSnapshot: q.text,
            questionTypeSnapshot: q.questionType,
            maxPointsSnapshot: q.points,
            correctAnswerSnapshot: q.correctAnswer,
          };
        });
        const score = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
        return tx.studentQuizResult.create({
          data: {
            studentId: studentProfile.id,
            quizId,
            submissionKey: body.submissionKey,
            quizTitleSnapshot: quiz.title,
            passingScoreSnapshot: quiz.passingScore,
            score,
            passed: !hasPending && score >= quiz.passingScore,
            status: hasPending ? 'PENDING_REVIEW' : 'COMPLETE',
            answers: body.answers,
            studentAnswers: { create: studentAnswers },
          },
          include: { quiz: true, studentAnswers: { include: { question: true } } },
        });
      });
      await awardQuiz(result.id);
      return reply.status(201).send({ data: quizResultData(result) });
    }
  );
}
