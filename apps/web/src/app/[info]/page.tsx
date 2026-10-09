import Icon from '@/components/Icon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';

const pages: Record<string, { title: string; description: string; sections: [string, string][] }> =
  {
    about: {
      title: 'About Midad Academy · عن مداد',
      description:
        'A place for children to practise Arabic with a teacher and for families to follow learning progress.',
      sections: [
        [
          'Live learning',
          'Scheduled video lessons bring teachers and enrolled students together. Shared materials and a collaborative whiteboard support practice.',
        ],
        [
          'Connected families',
          'The academy creates child accounts and links them to their parent. Parents can see attendance and learning activity.',
        ],
      ],
    },
    curriculum: {
      title: 'Learning at Midad · التعلّم في مداد',
      description: 'Choose a course that matches your child’s age group and learning needs.',
      sections: [
        [
          'Read, write and speak',
          'The academy prepares the curriculum and assigns the course teacher. Check the course month, description and age group before contacting the academy.',
        ],
        [
          'Practice and feedback',
          'Courses can include videos, PDFs, multiple-choice quizzes and written answers reviewed by the teacher.',
        ],
      ],
    },
    teachers: {
      title: 'Meet your course teacher · المعلّمون',
      description: 'Each available course displays its teacher’s name.',
      sections: [
        [
          'Find a teacher',
          'Browse the course catalogue, read the description and choose the course that fits your learning needs.',
        ],
        [
          'Joining as a teacher',
          'The academy creates teacher accounts and assigns monthly courses to them.',
        ],
      ],
    },
    help: {
      title: 'Help centre · المساعدة',
      description: 'Getting started with your Midad account.',
      sections: [
        [
          'Students',
          'Use the username and password provided by the academy. Your assigned courses appear on your dashboard. Join when your teacher starts the session.',
        ],
        [
          'Parents',
          'Register with your email, WhatsApp number and password. Contact the academy to choose a course. The academy creates and links your child’s account.',
        ],
        [
          'Teachers',
          'The academy assigns your courses, curriculum and session times. View materials and start scheduled classes from your dashboard. End class closes the room for everyone.',
        ],
        [
          'Account access',
          'Use Forgot password on the login page. If you cannot receive the reset email, contact the academy.',
        ],
      ],
    },
    contact: {
      title: 'Contact the academy · تواصل معنا',
      description: 'Ask the academy team about enrollment, teaching or account support.',
      sections: [
        [
          'Course questions',
          'Include the course title and your account email when contacting the academy. Do not share your password or payment card details.',
        ],
      ],
    },
    terms: {
      title: 'Using Midad Academy',
      description: 'Platform usage information for students, parents and teachers.',
      sections: [
        [
          'Accounts',
          'Keep your login details private. Parents should supervise children’s use of the platform. Teacher and child accounts are created by the academy.',
        ],
        [
          'Enrollment',
          'Courses run in monthly groups. Parents contact the academy, which completes enrollment. Ask the academy about payment, cancellation and refund conditions; there is no automatic recurring billing in the platform.',
        ],
        [
          'Classroom conduct',
          'Respect other participants and your teacher. Share only materials you are permitted to use. Teachers control classroom access and drawing permissions.',
        ],
      ],
    },
    privacy: {
      title: 'Your information at Midad',
      description: 'How the platform uses account and learning information.',
      sections: [
        [
          'Account and learning data',
          'The platform stores your name, email, account role, encrypted password hash, enrollments, quiz answers, grades and recorded attendance. This supports account access and learning reports.',
        ],
        [
          'Parent access',
          'A linked parent can see a child’s progress. The academy manages the link between each child and their parent.',
        ],
        [
          'Service providers',
          'Live classrooms use LiveKit, uploaded materials use Cloudinary, and card payments use Stripe. The platform does not store your full payment card number.',
        ],
        [
          'Help with your data',
          'Contact the academy team to ask about your information, corrections or account removal. Do not include passwords in support requests.',
        ],
      ],
    },
  };
export function generateStaticParams() {
  return Object.keys(pages).map((info) => ({ info }));
}
export default async function InfoPage({ params }: { params: Promise<{ info: string }> }) {
  const { info } = await params;
  const page = pages[info];
  if (!page) notFound();
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <>
      <Navbar />
      <main className="midad wrap" style={{ maxWidth: 900, padding: '64px 24px' }}>
        <Link href="/" className="link-gold">
          <Icon name="left" /> Home
        </Link>
        <h1 className="sec-h2">{page.title}</h1>
        <p className="sec-sub">{page.description}</p>
        {page.sections.map(([title, body]) => (
          <section key={title} className="card pad" style={{ margin: '20px 0' }}>
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>{title}</h2>
            <p style={{ lineHeight: 1.8 }}>{body}</p>
          </section>
        ))}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 28 }}>
          <Link className="btn btn-gold" href="/courses">
            Browse courses
          </Link>
          <Link className="btn btn-outline" href="/help">
            Help centre
          </Link>
          {email && (
            <a className="btn btn-outline" href={`mailto:${email}`}>
              Email the academy
            </a>
          )}
        </div>
      </main>
    </>
  );
}
