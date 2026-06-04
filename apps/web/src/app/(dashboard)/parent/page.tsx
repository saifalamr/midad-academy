export default function ParentDashboard() {
  const stats = [
    { label: 'Children Enrolled', value: '0', color: 'text-primary-600' },
    { label: 'Active Subscriptions', value: '0', color: 'text-secondary-600' },
    { label: 'Lessons This Month', value: '0', color: 'text-green-600' },
    { label: 'Total Spent', value: '$0', color: 'text-purple-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Parent Dashboard</h1>
      <p className="text-gray-500 mb-8">Monitor your children's progress and manage subscriptions</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Children</h2>
          <p className="text-sm text-gray-400">No children added yet.</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Payment History</h2>
          <p className="text-sm text-gray-400">No payments yet.</p>
        </div>
      </div>
    </div>
  );
}
