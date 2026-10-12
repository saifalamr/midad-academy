import AdminSessionDetails from '@/components/AdminSessionDetails';
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <AdminSessionDetails sessionId={sessionId} />;
}
