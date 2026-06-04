import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const badges = [
    { name: 'First Lesson', description: 'Completed your very first lesson!', iconUrl: '/badges/first-lesson.svg' },
    { name: 'Week Streak', description: '7 days of learning in a row!', iconUrl: '/badges/week-streak.svg' },
    { name: 'Month Streak', description: '30 days of learning in a row!', iconUrl: '/badges/month-streak.svg' },
    { name: 'Perfect Score', description: 'Got 100% on a quiz!', iconUrl: '/badges/perfect-score.svg' },
    { name: 'Star Student', description: 'Recognized as star student by your teacher!', iconUrl: '/badges/star.svg' },
    { name: 'Alphabet Master', description: 'Mastered the Arabic alphabet!', iconUrl: '/badges/alphabet.svg' },
    { name: 'Helpful Peer', description: 'Helped a classmate in the community!', iconUrl: '/badges/helpful.svg' },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { name: badge.name },
      update: {},
      create: badge,
    });
  }

  console.log('Seeded', badges.length, 'badges.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
