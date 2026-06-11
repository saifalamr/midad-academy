import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@arabic-platform/database';

const createQuestionSchema = z.object({
  text: z.string().min(1, 'Question text is required'),
  questionType: z.enum(['MCQ', 'WRITTEN', 'TRUE_FALSE']).optional().default('MCQ'),
  options: z.array(z.string().min(1)).optional(),
  correctAnswer: z.string().min(1).optional(),
  points: z.number().int().min(1).optional(),
});

const submitQuizSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

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

    let options: string[] | undefined;
    let correctAnswer: string | undefined;

    if (body.questionType === 'WRITTEN') {
      // Written answers are free-text and graded manually — no options/correctAnswer.
      options = undefined;
      correctAnswer = undefined;
    } else if (body.questionType === 'TRUE_FALSE') {
      options = ['True', 'False'];
      correctAnswer = body.correctAnswer;
      if (correctAnswer !== 'True' && correctAnswer !== 'False') {
        return reply.status(400).send({ error: "correctAnswer must be 'True' or 'False'" });
      }
    } else {
      if (!body.options || body.options.length < 2) {
        return reply.status(400).send({ error: 'At least two options are required' });
      }
      if (!body.correctAnswer || !body.options.includes(body.correctAnswer)) {
        return reply.status(400).send({ error: 'correctAnswer must be one of the provided options' });
      }
      options = body.options;
      correctAnswer = body.correctAnswer;
    }

    const question = await prisma.question.create({
      data: {
        quizId,
        text: body.text,
        questionType: body.questionType,
        options,
        correctAnswer,
        ...(body.points !== undefined ? { points: body.points } : {}),
      },
    });

    return reply.status(201).send({ data: question });
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
