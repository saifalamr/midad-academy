import MonthlyCatalog from '@/components/MonthlyCatalog';
import HomeExperience from '@/components/HomeExperience';
import Icon from '@/components/Icon';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
export default function HomePage() {
  return (
    <HomeExperience>
      <div className="midad public-home">
        <Navbar />
        <main>
          <section className="welcome-section wrap" dir="rtl">
            <div>
              <span className="eyebrow">مداد أكاديمي · للأعمار 5–15</span>
              <h1>
                تعلّم العربية،
                <br />
                وتابع تقدّم طفلك.
              </h1>
              <p>دورات شهرية، حصص مباشرة، وواجبات وتقارير تجمع الأسرة والمعلم في مكان واحد.</p>
              <div className="welcome-actions">
                <Link className="btn btn-gold" href="/login">
                  <Icon name="right" /> تسجيل الدخول
                </Link>
                <Link className="btn btn-outline" href="/register">
                  إنشاء حساب ولي أمر
                </Link>
              </div>
              <a className="welcome-courses" href="#monthly-courses">
                استعرض الدورات الشهرية <Icon name="book" size={18} />
              </a>
            </div>
            <aside className="welcome-card">
              <Icon name="academy" size={38} />
              <h2>بداية بسيطة للأسرة</h2>
              <ol>
                <li>أنشئ حساب ولي الأمر.</li>
                <li>اختر الدورة وأرسل طلب تسجيل طفلك.</li>
                <li>تابع اعتماد التسجيل ومواعيد الحصص.</li>
              </ol>
              <p>الطالب والمعلم يدخلان بالبيانات التي توفرها الأكاديمية.</p>
            </aside>
          </section>
          <section className="welcome-features wrap" aria-label="مميزات الأكاديمية" dir="rtl">
            <article>
              <Icon name="video" size={24} />
              <div>
                <h2>حصص تفاعلية</h2>
                <p>معلم، سبورة ومحتوى للحصة.</p>
              </div>
            </article>
            <article>
              <Icon name="edit" size={24} />
              <div>
                <h2>واجبات ومتابعة</h2>
                <p>تمارين وتصحيح وتقييم المعلم.</p>
              </div>
            </article>
            <article>
              <Icon name="family" size={24} />
              <div>
                <h2>مساحة ولي الأمر</h2>
                <p>حضور الأبناء وتقارير تقدمهم.</p>
              </div>
            </article>
          </section>
          <MonthlyCatalog />
        </main>
        <footer className="welcome-footer wrap" dir="rtl">
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
