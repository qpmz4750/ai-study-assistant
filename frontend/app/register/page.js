"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export default function RegisterPage() {
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
      const registerResponse = await fetch(
        `${API_URL}/auth/register`,
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

      const registerData =
        await registerResponse.json();

      if (!registerResponse.ok) {
        if (registerResponse.status === 400) {
          throw new Error(
            "البريد الإلكتروني مسجل مسبقًا"
          );
        }

        throw new Error(
          registerData.detail ||
            "فشل إنشاء الحساب"
        );
      }

      const loginResponse = await fetch(
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

      const loginData =
        await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(
          loginData.detail ||
            "تم إنشاء الحساب ولكن فشل تسجيل الدخول"
        );
      }

      localStorage.setItem(
        "access_token",
        loginData.access_token
      );

      router.replace("/dashboard");

    } catch (err) {
      console.error(err);

      setError(
        err.message ||
          "حدث خطأ أثناء إنشاء الحساب"
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
            <span className="brand-icon">✦</span>
            AI Study Assistant
          </div>

          <h1>
            ابدأ رحلة
            <br />
            <span className="gradient-text">
              تعلم جديدة
            </span>
          </h1>

          <p>
            أنشئ حسابك وابدأ بتنظيم مواضيعك
            واستخدام أدوات الذكاء الاصطناعي
            للمساعدة في الدراسة.
          </p>

          <div className="feature-list">

            <div className="feature-box">
              <strong>✦ شرح ذكي</strong>
              <p>
                حول ملاحظاتك إلى شرح واضح.
              </p>
            </div>

            <div className="feature-box">
              <strong>✓ اختبارات</strong>
              <p>
                اختبارات مولدة من ملاحظاتك.
              </p>
            </div>

            <div className="feature-box">
              <strong>💬 AI Chat</strong>
              <p>
                تحدث مع المساعد حول موضوعك.
              </p>
            </div>

          </div>
        </section>

        <section className="auth-form-side">
          <div className="auth-card">

            <h2>إنشاء حساب</h2>

            <p className="subtitle">
              ابدأ استخدام AI Study Assistant
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
                  ? "جاري إنشاء الحساب..."
                  : "إنشاء الحساب"}
              </button>

            </form>

            <div className="auth-switch">
              عندك حساب؟{" "}

              <Link
                href="/login"
                className="link-button"
              >
                تسجيل الدخول
              </Link>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}