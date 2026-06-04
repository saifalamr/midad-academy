export type AgeGroup = '5-7' | '8-10' | '11-13' | '14-15';
export type LessonStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
export type EnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface Course {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  ageGroup: AgeGroup;
  price: number;
  currency: string;
  maxStudents: number;
  coverImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  description: string;
  scheduledAt: Date;
  durationMinutes: number;
  videoRoomId?: string;
  whiteboardId?: string;
  status: LessonStatus;
  recordingUrl?: string;
}

export interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: Date;
  status: EnrollmentStatus;
}
