import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createQuestionSchema = z.object({
  text: z.string().min(1, 'Question text is required'),
  questionType: z.enum(['MCQ', 'WRITTEN', 'TRUE_FALSE']).optional().default('MCQ'),
  options: z.array(z.string().min(1)).optional(),
  correctAnswer: z.string().min(1).optional(),
  points: z.number().int().min(1).optional(),
});

const updateQuizSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
});

const submitQuizSchema = z.object({
  answers: z.record(z.string(), z.string()),
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
  if (!body.correctAnswer || !body.options.includes(body.correctAnswer)) {
    return { ok: false, error: 'correctAnswer must be one of the provided options' };
  }
  return { ok: true, options: body.options, correctAnswer: body.correctAnswer };
}

// Loads a quiz only if it belongs to the given teacher's course. Returns null
// when the teacher has no profile or the quiz isn't theirs — callers respond 404
// either way so quiz existence isn't leaked across teachers.
async function findOwnedQuiz(userId: string, quizId: string) {
  const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (!teacherProfile) return null;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { content: { include: { course: true } } },
  });
  if (!quiz || quiz.content.course.teacherId !== teacherProfile.id) return null;
  return quiz;
}

export async function quizRoutes(app: FastifyInstance) {
  // ── POST /api/quiz/:id/questions ──────────────────────────────────────────
  // Adds a question to a quiz. Only the owning teacher may do this.
  app.post<{ Params: { id: string } }>('/:id/questions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: quizId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can add questions' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { content: { include: { course: true } } },
    });
    if (!quiz || quiz.content.course.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Quiz not found' });
    }

    const body = createQuestionSchema.parse(request.body);

    const resolved = resolveQuestionFields(body);
    if (!resolved.ok) {
      return reply.status(400).send({ error: resolved.error });
    }

    const question = await prisma.question.create({
      data: {
        quizId,
        text: body.text,
        questionType: body.questionType,
        options: resolved.options,
        correctAnswer: resolved.correctAnswer,
        ...(body.points !== undefined ? { points: body.points } : {}),
      },
    });

    return reply.status(201).send({ data: question });
  });

  // ── PATCH /api/quiz/:id ────────────────────────────────────────────────────
  // Updates a quiz's title and/or passing score. Only the owning teacher may.
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: quizId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can edit quizzes' });
    }

    const quiz = await findOwnedQuiz(userId, quizId);
    if (!quiz) {
      return reply.status(404).send({ error: 'Quiz not found' });
    }

    const body = updateQuizSchema.parse(request.body);

    const updated = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.passingScore !== undefined ? { passingScore: body.passingScore } : {}),
      },
      include: { questions: true },
    });

    return reply.send({ data: updated });
  });

  // ── PATCH /api/quiz/:id/questions/:questionId ─────────────────────────────
  // Edits an existing question (text, type, options, correct answer, points).
  // The question must belong to the quiz, which must belong to the teacher.
  app.patch<{ Params: { id: string; questionId: string } }>('/:id/questions/:questionId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: quizId, questionId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can edit questions' });
    }

    const quiz = await findOwnedQuiz(userId, quizId);
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

    const question = await prisma.question.update({
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
    });

    return reply.send({ data: question });
  });

  // ── DELETE /api/quiz/:id/questions/:questionId ────────────────────────────
  // Removes a question from a quiz. Only the owning teacher may.
  app.delete<{ Params: { id: string; questionId: string } }>('/:id/questions/:questionId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: quizId, questionId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can delete questions' });
    }

    const quiz = await findOwnedQuiz(userId, quizId);
    if (!quiz) {
      return reply.status(404).send({ error: 'Quiz not found' });
    }

    const existing = await prisma.question.findUnique({ where: { id: questionId } });
    if (!existing || existing.quizId !== quizId) {
      return reply.status(404).send({ error: 'Question not found' });
    }

    await prisma.question.delete({ where: { id: questionId } });

    return reply.status(204).send();
  });

  // ── GET /api/quiz/:id ──────────────────────────────────────────────────────
  // Returns a quiz with its questions. Students don't receive correctAnswer.
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { role } = request.user;
    const { id: quizId } = request.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) {
      return reply.status(404).send({ error: 'Quiz not found' });
    }

    if (role === 'TEACHER') {
      return reply.send({ data: quiz });
    }

    return reply.send({
      data: {
        ...quiz,
        questions: quiz.questions.map(({ correctAnswer: _correctAnswer, ...q }) => q),
      },
    });
  });

  // ── POST /api/quiz/:id/submit ─────────────────────────────────────────────
  // Student submits answers. MCQ/TRUE_FALSE are auto-graded immediately;
  // WRITTEN answers are saved as pending for the teacher to grade.
  app.post<{ Params: { id: string } }>('/:id/submit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: quizId } = request.params;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can submit quiz answers' });
    }

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) {
      return reply.status(404).send({ error: 'Quiz not found' });
    }

    const body = submitQuizSchema.parse(request.body);

    let totalPoints = 0;
    let earnedPoints = 0;
    let hasPending = false;

    const graded = quiz.questions.map((q) => {
      totalPoints += q.points;
      const yourAnswer = body.answers[q.id] ?? '';

      if (q.questionType === 'WRITTEN') {
        hasPending = true;
        return {
          questionId: q.id,
          text: q.text,
          questionType: q.questionType,
          yourAnswer,
          correctAnswer: null as string | null,
          correct: null as boolean | null,
          points: q.points,
          pointsAwarded: null as number | null,
          status: 'PENDING' as const,
        };
      }

      const correct = yourAnswer === q.correctAnswer;
      const pointsAwarded = correct ? q.points : 0;
      earnedPoints += pointsAwarded;
      return {
        questionId: q.id,
        text: q.text,
        questionType: q.questionType,
        yourAnswer,
        correctAnswer: q.correctAnswer,
        correct,
        points: q.points,
        pointsAwarded,
        status: 'GRADED' as const,
      };
    });

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = !hasPending && score >= quiz.passingScore;
    const status = hasPending ? 'PENDING_REVIEW' : 'COMPLETE';

    const result = await prisma.studentQuizResult.create({
      data: {
        studentId: studentProfile.id,
        quizId,
        score,
        passed,
        status,
        answers: body.answers,
        studentAnswers: {
          create: graded.map((g) => ({
            questionId: g.questionId,
            answerText: g.yourAnswer,
            status: g.status,
            correct: g.correct,
            pointsAwarded: g.pointsAwarded,
          })),
        },
      },
    });

    return reply.status(201).send({
      data: {
        id: result.id,
        score,
        passed,
        status,
        passingScore: quiz.passingScore,
        totalPoints,
        earnedPoints,
        results: graded,
        completedAt: result.completedAt,
      },
    });
  });
}
