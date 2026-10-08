import type { Prisma } from '@prisma/client';

type Attempt = Prisma.StudentQuizResultGetPayload<{ include: { quiz: true; studentAnswers: { include: { question: true } } } }>;

export function quizResultData(result: Attempt) {
  const results = result.studentAnswers.map(a => ({
    questionId: a.questionId,
    text: a.questionTextSnapshot ?? a.question.text,
    questionType: a.questionTypeSnapshot ?? a.question.questionType,
    yourAnswer: a.answerText,
    correctAnswer: a.correctAnswerSnapshot,
    correct: a.correct,
    points: a.maxPointsSnapshot ?? a.question.points,
    pointsAwarded: a.pointsAwarded,
    status: a.status,
    feedback: a.feedback,
  }));
  return { id: result.id, quizTitle: result.quizTitleSnapshot ?? result.quiz.title,
    score: result.score, passed: result.passed, status: result.status,
    passingScore: result.passingScoreSnapshot ?? result.quiz.passingScore,
    totalPoints: results.reduce((sum, a) => sum + a.points, 0),
    earnedPoints: results.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0),
    completedAt: result.completedAt, results };
}
