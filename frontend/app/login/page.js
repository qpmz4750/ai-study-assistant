"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        );
      }

      localStorage.setItem(
        "access_token",
        data.access_token
      );

      router.push("/dashboard");

    } catch (err) {
      console.error(err);

      setError(
        err.message || "حدث خطأ أثناء تسجيل الدخول"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">

        <section className="auth-info">

          <div className="brand">
            <span className="brand-icon">
              ✦
            </span>

            AI Study Assistant
          </div>

          <h1>
            تعلم بشكل
            <br />

            <span className="gradient-text">
              أذكى
            </span>
          </h1>

          <p>
            منصة تساعدك على تنظيم دراستك،
            تلخيص ملاحظاتك، شرح المحتوى،
            إنشاء اختبارات والتحدث مع مساعد
            ذكاء اصطناعي.
          </p>

          <div className="feature-list">

            <div className="feature-box">
              <strong>
                ✦ مساعد ذكي
              </strong>

              <p>
                اسأل عن موضوعك واحصل على إجابة.
              </p>
            </div>

            <div className="feature-box">
              <strong>
                ✓ اختبارات تفاعلية
              </strong>

              <p>
                اختبر معرفتك واعرف درجتك.
              </p>
            </div>

            <div className="feature-box">
              <strong>
                ≡ تنظيم الملاحظات
              </strong>

              <p>
                مواضيعك وملاحظاتك في مكان واحد.
              </p>
            </div>

          </div>

        </section>

        <section className="auth-form-side">

          <div className="auth-card">

            <h2>
             ارحبببب
            </h2>

            <p className="subtitle">
              سجل الدخول لمتابعة تعلمك
            </p>

            <form onSubmit={handleSubmit}>

              <div className="form-group">

                <label>
                  البريد الإلكتروني
                </label>

                <input
                  className="form-input"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                />

              </div>

              <div className="form-group">

                <label>
                  كلمة المرور
                </label>

                <input
                  className="form-input"
                  type="password"
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  required
                />

              </div>

              {error && (
                <div className="error-box">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="primary-btn full-btn"
                disabled={loading}
              >
                {loading
                  ?"....انتظر ديقيه"
                  : "تسجيل الدخول"}
              </button>

            </form>

            <div className="auth-switch">

              ما عندك حساب؟{" "}

              <Link
                href="/register"
                className="link-button"
              >
                تبي تسوي حساب
              </Link>

            </div>

          </div>

        </section>

      </div>
    </main>
  );
}
