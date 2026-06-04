export default function StudentDashboard() {
  const stats = [
    { label: 'Total Points', value: '0 ⭐', color: 'text-primary-600' },
    { label: 'Lessons Completed', value: '0', color: 'text-secondary-600' },
    { label: 'Badges Earned', value: '0 🏆', color: 'text-yellow-500' },
    { label: 'Day Streak', value: '0 🔥', color: 'text-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">My Learning Journey</h1>
      <p className="text-gray-500 mb-8">Keep going — every lesson gets you closer to fluency!</p>

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
          <h2 className="font-semibold text-gray-900 mb-4">Next Lesson</h2>
          <p className="text-sm text-gray-400">No upcoming lessons.</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">My Badges</h2>
          <p className="text-sm text-gray-400">Complete lessons to earn your first badge!</p>
        </div>
      </div>
    </div>
  );
}
