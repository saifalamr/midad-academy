import HomeExperience from '@/components/HomeExperience';
import Icon from '@/components/Icon';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function HomePage() {
  return (
    <HomeExperience><main className="midad" style={{ background: 'var(--cream)' }}>
      <Navbar />

      {/* hero */}
      <div className="hero geo">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="pill"><Icon name="academy" /> Trusted Arabic learning for ages 5–15</span>
            <h1 className="hero-h1">Where children fall in<br />love with <span className="u-gold">Arabic</span>.</h1>
            <p className="ar hero-ar">حيث يتعلّم الأطفال العربية بشغفٍ ومتعة</p>
            <p className="hero-sub">Live classes with your course teacher, an interactive whiteboard built for kids, and a parent dashboard that keeps you in the loop — all in one warm, beautifully crafted academy.</p>
            <div className="hero-actions">
              <Link className="btn btn-lg btn-gold" href="/register">
                Create an account
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link className="btn btn-lg btn-outline" href="/courses">Browse Courses</Link>
            </div>
            <div className="hero-trust"><b>Learn together.</b> Live lessons, practice and family progress in one place.</div>
          </div>

          <div className="hero-visual">
            <div className="hero-card card">
              <div className="hc-top">
                <span className="badge-live"><span className="dot"></span> Lesson preview</span>
                <span className="hc-time">Arabic letters</span>
              </div>
              <div className="hc-stage">
                <div className="hc-ph"><span className="ar" style={{ fontSize: 40 }}>أ ب ت</span></div>
                <div className="hc-tn"><Icon name="graduate" size={24} /></div>
                <div className="hc-tn"><Icon name="graduate" size={24} /></div>
              </div>
              <div className="hc-foot">
                <div>
                  <div className="hc-title ar">الحروف الهجائية</div>
                  <div className="hc-sub">Arabic Letters · Beginner</div>
                </div>
                <Link className="btn btn-sm btn-gold" href="/lesson-sample">View sample</Link>
              </div>
            </div>
            <div className="float-chip chip-xp">
              <div className="ci"><Icon name="star" /></div><div><b>Practice together</b><span>Interactive lessons</span></div>
            </div>
            <div className="float-chip chip-streak">
              <div className="ci"><Icon name="flame" /></div><div><b>Step by step</b><span>Learn at your level</span></div>
            </div>
          </div>
        </div>
        <div className="hero-logos wrap">
          <span>Practice core Arabic skills</span>
          <div className="lg-row"><b>القرآن</b><b>النحو</b><b>القراءة</b><b>الكتابة</b><b>المحادثة</b></div>
        </div>
      </div>

      {/* features */}
      <div className="section" id="features">
        <div className="wrap center">
          <span className="eyebrow">Everything in one place</span>
          <h2 className="sec-h2">A complete academy, built for kids</h2>
          <p className="sec-sub">Three pillars that make every lesson feel personal, playful and effective.</p>
        </div>
        <div className="wrap feat-grid">
          <div className="feat card">
            <div className="feat-ic ic-navy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="4" width="15" height="16" rx="2.5" /><path d="M17 9l5-3v12l-5-3" /></svg>
            </div>
            <h3>Live Classes</h3>
            <p>Scheduled sessions with your course teacher. Cameras, audio, hand-raising and instant feedback — face to face, every week.</p>
            <ul className="feat-list"><li>Scheduled live sessions</li><li>Teacher-led materials</li></ul>
          </div>
          <div className="feat card feat-feature">
            <div className="feat-ic ic-gold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8 21h8M12 16.5V21" /><path d="M7 9l2.5 2.5L7 14M12.5 13.5H16" /></svg>
            </div>
            <h3>Interactive Whiteboard</h3>
            <p>A playful canvas with pens, shapes, Arabic text tools and stickers. Teachers and students draw, write and trace together in real time.</p>
            <ul className="feat-list"><li>Arabic handwriting practice</li><li>Saveable lesson boards</li></ul>
          </div>
          <div className="feat card">
            <div className="feat-ic ic-navy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 13h4l2 5 4-12 2 7h6" /></svg>
            </div>
            <h3>Parent Dashboard</h3>
            <p>Follow every child&apos;s attendance, XP and learning activity. Download learning reports and never miss a class or milestone.</p>
            <ul className="feat-list"><li>Multi-child overview</li><li>Downloadable learning reports</li></ul>
          </div>
        </div>
      </div>

      {/* how it works strip */}
      <div className="howstrip geo-navy">
        <div className="wrap how-grid">
          <div className="how"><span className="hn">1</span><b>Create an account</b><p>Create a student or parent account in minutes.</p></div>
          <div className="how"><span className="hn">2</span><b>Choose courses</b><p>Match each child to the right level and teacher.</p></div>
          <div className="how"><span className="hn">3</span><b>Join live &amp; grow</b><p>Learn weekly, earn XP and watch progress soar.</p></div>
        </div>
      </div>

      {/* pricing */}
      <div className="section" id="pricing-anchor">
        <div className="wrap center">
          <span className="eyebrow">Simple, family-friendly pricing</span>
          <h2 className="sec-h2">Choose the right course for your child</h2>
          <p className="sec-sub">Course prices are shown before enrollment. Paid courses use a one-time checkout.</p>
        </div>
        <div className="wrap price-grid">
          <div className="price card"><div className="pr-name">Start learning</div><h3>Choose a course</h3><p className="pr-desc">Browse courses by age group and teacher. Each course shows its own enrollment price.</p><Link className="btn btn-block btn-outline" href="/courses">Browse courses</Link></div>
          <div className="price card price-best"><div className="pr-name">Live & interactive</div><h3>Learn with your teacher</h3><p className="pr-desc">Join scheduled video classes, follow shared materials and practise on the collaborative whiteboard.</p><Link className="btn btn-block btn-gold" href="/curriculum">Explore learning</Link></div>
          <div className="price card"><div className="pr-name">For families</div><h3>Follow your child</h3><p className="pr-desc">Securely link a student account, follow attendance and download learning reports.</p><Link className="btn btn-block btn-outline" href="/register">Create an account</Link></div>
        </div>
      </div>

      {/* CTA band */}
      <div className="wrap"><div className="cta-band geo-navy">
        <div>
          <h2 className="cta-h">Start your child&apos;s Arabic journey today</h2>
          <p>Create an account and explore the available courses.</p>
        </div>
        <Link className="btn btn-lg btn-gold" href="/register">Create an account</Link>
      </div></div>

      {/* footer */}
      <footer className="footer">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="brand foot-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/midad-logo-transparent.png" alt="Midad Academy" className="logo-full logo-white" />
              </div>
              <p className="foot-about">A premium online academy helping children aged 5–15 read, write and speak Arabic with confidence and joy.</p>
            </div>
            <div><h5>Learn</h5><Link href="/courses">Browse Courses</Link><a href="#pricing-anchor">Pricing</a><Link href="/register">Get Started</Link><Link href="/curriculum">Curriculum</Link></div>
            <div><h5>Platform</h5><Link href="/student">Student</Link><Link href="/teacher">Teacher</Link><Link href="/parent">Parent</Link><Link href="/courses">Classroom</Link></div>
            <div><h5>Company</h5><Link href="/about">About</Link><Link href="/teachers">Our Teachers</Link><Link href="/contact">Contact</Link><Link href="/help">Help Center</Link></div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Midad Academy · مداد. All rights reserved.</span>
            <span>Privacy · Terms · Cookies</span>
          </div>
        </div>
      </footer>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--ink-3)', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', zIndex: 50, borderTop: '1px solid var(--line)' }}>
        By Yousef Al-Omari
      </div>
    </main></HomeExperience>
  );
}
