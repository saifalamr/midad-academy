import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function HomePage() {
  return (
    <main className="midad" style={{ background: 'var(--cream)' }}>
      <Navbar />

      {/* hero */}
      <div className="hero geo">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="pill">🕌 Trusted Arabic learning for ages 5–15</span>
            <h1 className="hero-h1">Where children fall in<br />love with <span className="u-gold">Arabic</span>.</h1>
            <p className="ar hero-ar">حيث يتعلّم الأطفال العربية بشغفٍ ومتعة</p>
            <p className="hero-sub">Live classes with certified teachers, an interactive whiteboard built for kids, and a parent dashboard that keeps you in the loop — all in one warm, beautifully crafted academy.</p>
            <div className="hero-actions">
              <Link className="btn btn-lg btn-gold" href="/register">
                Get Started Free
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link className="btn btn-lg btn-outline" href="/courses">Browse Courses</Link>
            </div>
            <div className="hero-trust">
              <div className="stack">
                <span className="av" style={{ background: '#dce6f4' }}>ن</span>
                <span className="av" style={{ background: '#f3e3c2' }}>س</span>
                <span className="av" style={{ background: '#e3efe6' }}>م</span>
                <span className="av" style={{ background: '#f4dede' }}>ر</span>
              </div>
              <div><b>12,000+</b> families learning together · <span className="stars">★★★★★</span> 4.9</div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-card card">
              <div className="hc-top">
                <span className="badge-live"><span className="dot"></span> Live now</span>
                <span className="hc-time">10:00 — 10:45</span>
              </div>
              <div className="hc-stage">
                <div className="hc-ph"><span>teacher video feed</span></div>
                <div className="hc-tn"><span>student</span></div>
                <div className="hc-tn"><span>student</span></div>
              </div>
              <div className="hc-foot">
                <div>
                  <div className="hc-title ar">الحروف الهجائية</div>
                  <div className="hc-sub">Arabic Letters · Beginner</div>
                </div>
                <Link className="btn btn-sm btn-gold" href="/courses">Join</Link>
              </div>
            </div>
            <div className="float-chip chip-xp">
              <div className="ci">⭐</div><div><b>+150 XP</b><span>earned today</span></div>
            </div>
            <div className="float-chip chip-streak">
              <div className="ci">🔥</div><div><b>14 days</b><span>streak</span></div>
            </div>
          </div>
        </div>
        <div className="hero-logos wrap">
          <span>Aligned with national curricula</span>
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
            <p>Small-group sessions with certified native teachers. Cameras, audio, hand-raising and instant feedback — face to face, every week.</p>
            <ul className="feat-list"><li>Max 6 students per class</li><li>Recorded for replay</li></ul>
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
            <p>Follow every child&apos;s attendance, XP, streaks and badges. Get weekly progress reports and never miss a class or milestone.</p>
            <ul className="feat-list"><li>Multi-child overview</li><li>Weekly email reports</li></ul>
          </div>
        </div>
      </div>

      {/* how it works strip */}
      <div className="howstrip geo-navy">
        <div className="wrap how-grid">
          <div className="how"><span className="hn">1</span><b>Create an account</b><p>Pick a plan and add your children in minutes.</p></div>
          <div className="how"><span className="hn">2</span><b>Choose courses</b><p>Match each child to the right level and teacher.</p></div>
          <div className="how"><span className="hn">3</span><b>Join live &amp; grow</b><p>Learn weekly, earn XP and watch progress soar.</p></div>
        </div>
      </div>

      {/* pricing */}
      <div className="section" id="pricing-anchor">
        <div className="wrap center">
          <span className="eyebrow">Simple, family-friendly pricing</span>
          <h2 className="sec-h2">Plans that grow with your child</h2>
          <p className="sec-sub">No contracts. Cancel anytime. Every plan includes the parent dashboard.</p>
        </div>
        <div className="wrap price-grid">
          <div className="price card">
            <div className="pr-name">Explorer</div>
            <div className="pr-amt"><b>$19</b><span>/ month</span></div>
            <p className="pr-desc">A gentle start for one young learner.</p>
            <ul className="pr-list">
              <li>1 live class / week</li>
              <li>Whiteboard access</li>
              <li>Parent dashboard</li>
              <li>XP, badges &amp; streaks</li>
            </ul>
            <Link className="btn btn-block btn-outline" href="/register">Choose Explorer</Link>
          </div>
          <div className="price card price-best">
            <span className="pr-tag">Most popular</span>
            <div className="pr-name">Scholar</div>
            <div className="pr-amt"><b>$39</b><span>/ month</span></div>
            <p className="pr-desc">Steady weekly progress with extras.</p>
            <ul className="pr-list">
              <li>3 live classes / week</li>
              <li>Recorded class replays</li>
              <li>Homework &amp; quizzes</li>
              <li>Priority teacher matching</li>
              <li>Up to 2 children</li>
            </ul>
            <Link className="btn btn-block btn-gold" href="/register">Choose Scholar</Link>
          </div>
          <div className="price card">
            <div className="pr-name">Family</div>
            <div className="pr-amt"><b>$69</b><span>/ month</span></div>
            <p className="pr-desc">The whole family, one simple plan.</p>
            <ul className="pr-list">
              <li>Unlimited live classes</li>
              <li>Up to 4 children</li>
              <li>1-on-1 monthly review</li>
              <li>Certificates of completion</li>
            </ul>
            <Link className="btn btn-block btn-outline" href="/register">Choose Family</Link>
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="wrap"><div className="cta-band geo-navy">
        <div>
          <h2 className="cta-h">Start your child&apos;s Arabic journey today</h2>
          <p>Join 12,000+ families. Your first week is on us.</p>
        </div>
        <Link className="btn btn-lg btn-gold" href="/register">Get Started Free</Link>
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
            <div><h5>Learn</h5><Link href="/courses">Browse Courses</Link><a href="#pricing-anchor">Pricing</a><Link href="/register">Free Trial</Link><a href="#">Curriculum</a></div>
            <div><h5>Platform</h5><Link href="/student">Student</Link><Link href="/teacher">Teacher</Link><Link href="/parent">Parent</Link><Link href="/courses">Classroom</Link></div>
            <div><h5>Company</h5><a href="#">About</a><a href="#">Our Teachers</a><a href="#">Contact</a><a href="#">Help Center</a></div>
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
    </main>
  );
}
