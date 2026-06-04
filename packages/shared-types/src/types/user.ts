export type UserRole = 'TEACHER' | 'STUDENT' | 'PARENT';

export type ArabicLevel = 'beginner' | 'intermediate' | 'advanced';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  bio: string;
  qualifications: string[];
  hourlyRate: number;
  currency: string;
  rating: number;
  totalReviews: number;
}

export interface StudentProfile {
  id: string;
  userId: string;
  age: number;
  level: ArabicLevel;
  totalPoints: number;
  parentId?: string;
}

export interface ParentProfile {
  id: string;
  userId: string;
}
