export type PointEvent =
  | 'lesson_completed'
  | 'homework_submitted'
  | 'perfect_score'
  | 'streak_7_days'
  | 'streak_30_days'
  | 'first_lesson'
  | 'helpful_comment';

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
}

export interface Achievement {
  id: string;
  studentId: string;
  badgeId: string;
  badge: Badge;
  earnedAt: Date;
}

export interface PointTransaction {
  id: string;
  studentId: string;
  points: number;
  event: PointEvent;
  createdAt: Date;
}

export const POINT_VALUES: Record<PointEvent, number> = {
  lesson_completed: 50,
  homework_submitted: 20,
  perfect_score: 100,
  streak_7_days: 75,
  streak_30_days: 300,
  first_lesson: 25,
  helpful_comment: 10,
};
