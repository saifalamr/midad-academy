import MonthlyCatalog from '@/components/MonthlyCatalog';
import HomeExperience from '@/components/HomeExperience';
import HomeLineIcon from '@/components/HomeLineIcon';
import HomeThemeToggle from '@/components/HomeThemeToggle';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import './public-home.css';

export default function HomePage() {
  return (
    <HomeExperience>
      <div className="midad public-home" dir="rtl" lang="ar">
        <Navbar homeThemeControl={<HomeThemeToggle />} />
        <main id="main-content">
          <section className="welcome-section wrap" aria-labelledby="home-title">
            <div className="welcome-intro">
              <span className="home-kicker">
                <span /> مداد أكاديمي · تعليم العربية للأطفال
              </span>
              <h1 id="home-title">
                العربية، <em>عالمٌ يكتشفه طفلك.</em>
              </h1>
              <p className="welcome-lead">
                حصص مباشرة مع معلّم، وممارسة تجعل اللغة أقرب لطفلك. يشارك في الحصة ويتدرّب بعدها،
                وأنت تتابع مواعيده وتقدّمه بخطوات واضحة.
              </p>
              <div className="welcome-actions">
                <a className="home-primary-action" href="#monthly-courses">
                  اكتشف الدورات <HomeLineIcon name="arrow" size={19} />
                </a>
                <Link className="home-secondary-action" href="/register">
                  أنشئ حساب ولي أمر
                </Link>
              </div>
              <p className="welcome-signin">
                لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link>
              </p>
            </div>

            <div className="home-lesson-scene" aria-label="تصوّر مبسّط لحصة العربية المباشرة">
              <div className="home-scene-top">
                <span className="home-live">
                  <span /> حصة مباشرة
                </span>
                <span className="home-scene-name">مع مداد</span>
              </div>
              <div className="home-scene-board">
                <span className="home-board-label">نتعلّم اليوم</span>
                <strong>أ</strong>
                <span className="home-board-word">أَسَدٌ</span>
              </div>
              <div className="home-scene-bottom">
                <div>
                  <HomeLineIcon name="person" size={19} />
                  <span>المعلّم يشرح</span>
                </div>
                <span className="home-scene-separator" />
                <div>
                  <HomeLineIcon name="pen" size={19} />
                  <span>طفلك يشارك</span>
                </div>
              </div>
              <div className="home-parent-note">
                <HomeLineIcon name="chart" size={19} />
                <span>وتتابع أنت التقدّم</span>
              </div>
            </div>
          </section>

          <section className="home-how wrap" aria-labelledby="home-how-title">
            <div className="home-section-head">
              <span className="home-eyebrow">رحلة التعلّم</span>
              <h2 id="home-how-title">تجربة واضحة للطفل، وطمأنينة لك.</h2>
            </div>
            <div className="home-how-grid">
              <article>
                <span className="home-step-number">01</span>
                <HomeLineIcon name="camera" size={27} />
                <h3>حصة فيها تفاعل</h3>
                <p>يلتقي طفلك بالمعلّم وزملائه، ويشارك في الشرح والأنشطة على السبورة.</p>
              </article>
              <article>
                <span className="home-step-number">02</span>
                <HomeLineIcon name="pen" size={27} />
                <h3>ممارسة بعد الحصة</h3>
                <p>يحلّ التمارين والواجبات، ويتلقى ملاحظات تساعده على التحسّن.</p>
              </article>
              <article>
                <span className="home-step-number">03</span>
                <HomeLineIcon name="chart" size={27} />
                <h3>تقدّم تراه بنفسك</h3>
                <p>تتابع مواعيده وحضوره ونتائجه من حساب ولي الأمر.</p>
              </article>
            </div>
            <p className="home-how-note">
              <HomeLineIcon name="check" size={18} /> اختر الدورة، أنشئ حساب ولي الأمر، ثم أرسل طلب
              تسجيل طفلك. تراجع الأكاديمية الطلب وتؤكد لك الخطوات التالية.
            </p>
          </section>

          <MonthlyCatalog />
        </main>
        <footer className="welcome-footer wrap">
          <span>مداد أكاديمي</span>
          <nav aria-label="روابط المساعدة">
            <Link href="/contact">تواصل معنا</Link>
            <Link href="/help">المساعدة</Link>
          </nav>
          <small>made by DOPIXA</small>
        </footer>
      </div>
    </HomeExperience>
  );
}
