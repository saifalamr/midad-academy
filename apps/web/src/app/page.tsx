import MonthlyCatalog from '@/components/MonthlyCatalog';
import HomeExperience from '@/components/HomeExperience';
import Icon from '@/components/Icon';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import './public-home.css';

export default function HomePage() {
  return (
    <HomeExperience>
      <div className="midad public-home" dir="rtl" lang="ar">
        <Navbar />
        <main id="main-content">
          <section className="welcome-section wrap" aria-labelledby="home-title">
            <div className="welcome-intro">
              <span className="eyebrow">مداد أكاديمي · تعليم العربية للأطفال</span>
              <h1 id="home-title">مساحة يتعلّم فيها طفلك العربية بثقة.</h1>
              <p className="welcome-lead">
                حصص مباشرة مع معلّم، وأنشطة وواجبات تناسب رحلة التعلّم. يشارك طفلك في الحصة، وتتابع
                أنت مواعيده وتقدّمه من حساب ولي الأمر.
              </p>
              <div className="welcome-actions">
                <a className="btn btn-gold" href="#monthly-courses">
                  استعرض الدورات <Icon name="left" size={18} />
                </a>
                <Link className="btn btn-outline" href="/register">
                  إنشاء حساب ولي أمر
                </Link>
              </div>
              <p className="welcome-signin">
                لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link>
              </p>
            </div>
            <div className="home-lesson-scene" aria-label="تصوّر مبسّط للحصة المباشرة">
              <div className="home-scene-top">
                <span className="home-live-dot" /> حصة عربية مباشرة <span>مع المعلّم</span>
              </div>
              <div className="home-scene-board">
                <span className="home-board-label">نتعلّم اليوم</span>
                <strong>أ</strong>
                <span>أَسَدٌ</span>
              </div>
              <div className="home-scene-bottom">
                <div className="home-scene-person">
                  <span>
                    <Icon name="graduate" size={20} />
                  </span>
                  <div>
                    <b>المعلّم</b>
                    <small>يشرح ويجيب</small>
                  </div>
                </div>
                <div className="home-scene-person">
                  <span>
                    <Icon name="hand" size={20} />
                  </span>
                  <div>
                    <b>الطفل</b>
                    <small>يشارك ويتدرّب</small>
                  </div>
                </div>
              </div>
              <div className="home-parent-note">
                <Icon name="family" size={19} />
                <span>ولي الأمر يتابع المواعيد والتقدّم</span>
              </div>
            </div>
          </section>

          <section className="home-how wrap" aria-labelledby="home-how-title">
            <div className="home-section-head">
              <span className="eyebrow">كيف يتعلّم طفلك؟</span>
              <h2 id="home-how-title">من الحصة إلى الممارسة، بخطوات واضحة.</h2>
            </div>
            <div className="home-how-grid">
              <article>
                <span className="home-step-icon">
                  <Icon name="video" size={24} />
                </span>
                <h3>يحضر حصة مباشرة</h3>
                <p>يلتقي بالمعلّم وزملائه، ويشارك في الشرح والأنشطة على السبورة.</p>
              </article>
              <article>
                <span className="home-step-icon">
                  <Icon name="edit" size={24} />
                </span>
                <h3>يمارس ما تعلّمه</h3>
                <p>يحلّ التمارين والواجبات، ويتلقى ملاحظات تساعده على التحسّن.</p>
              </article>
              <article>
                <span className="home-step-icon">
                  <Icon name="family" size={24} />
                </span>
                <h3>تتابع أنت الرحلة</h3>
                <p>ترى مواعيد طفلك وحضوره ونتائجه من مساحة ولي الأمر.</p>
              </article>
            </div>
          </section>

          <section className="home-start wrap" aria-labelledby="home-start-title">
            <div>
              <span className="eyebrow">ابدأ مع مداد</span>
              <h2 id="home-start-title">اختر الدورة، ثم أرسل طلب تسجيل طفلك.</h2>
              <p>
                أنشئ حساب ولي الأمر، أضف طفلك، واختر الدورة المناسبة. تراجع الأكاديمية الطلب وتؤكد
                لك الخطوات التالية.
              </p>
            </div>
            <Link className="btn btn-outline" href="/register">
              إنشاء حساب ولي أمر <Icon name="left" size={18} />
            </Link>
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
