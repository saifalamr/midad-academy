export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4">🌙</p>
        <h1 className="text-5xl font-bold text-primary-700 mb-4">Arabic Learning Platform</h1>
        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto">
          Live interactive Arabic classes for children aged 5–15, taught by certified teachers.
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          <a
            href="/auth/login"
            className="bg-primary-500 text-white px-8 py-3 rounded-xl font-semibold hover:bg-primary-600 transition-colors shadow-sm"
          >
            Get Started
          </a>
          <a
            href="/courses"
            className="border-2 border-primary-400 text-primary-600 px-8 py-3 rounded-xl font-semibold hover:bg-primary-50 transition-colors"
          >
            Browse Courses
          </a>
        </div>
      </div>

      <section className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { icon: '🎥', title: 'Live Video Classes', body: 'Real-time lessons with certified Arabic teachers.' },
            { icon: '🏆', title: 'Gamified Learning', body: 'Earn points and badges as you progress.' },
            { icon: '👨‍👩‍👧', title: 'Parent Dashboard', body: 'Track your child\'s progress in real time.' },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm text-center">
              <p className="text-3xl mb-3">{f.icon}</p>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
