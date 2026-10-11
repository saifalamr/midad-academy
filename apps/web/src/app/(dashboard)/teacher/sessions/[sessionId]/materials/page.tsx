'use client';
import { useParams } from 'next/navigation';
import SessionPlan from '@/components/SessionPlan';
export default function TeacherSessionMaterials() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <SessionPlan sessionId={sessionId} editable={false} />;
}
