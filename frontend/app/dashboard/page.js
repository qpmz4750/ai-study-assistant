"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://127.0.0.1:8000";

export default function DashboardPage() {
  const router = useRouter();

  const [topics, setTopics] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function getToken() {
    return localStorage.getItem("access_token");
  }

  function logout() {
    localStorage.removeItem("access_token");
    router.push("/login");
  }

  async function fetchTopics() {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/topics`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error("فشل تحميل المواضيع");
      }

      const data = await response.json();

      setTopics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTopics();
  }, []);

  function handleFileChange(e) {
    const file = e.target.files?.[0];

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const fileName = file.name.toLowerCase();

    if (
      !fileName.endsWith(".pdf") &&
      !fileName.endsWith(".txt")
    ) {
      setError("يسمح فقط بملفات PDF أو TXT");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("حجم الملف يجب ألا يتجاوز 10 MB");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    setError("");
    setSelectedFile(file);
  }

  async function uploadFileToTopic(topicId, file) {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      `${API_URL}/topics/${topicId}/files`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${getToken()}`,
        },

        body: formData,
      }
    );

    if (!response.ok) {
      let message =
        "تم إنشاء الموضوع ولكن فشل رفع الملف";

      try {
        const data = await response.json();

        if (data.detail) {
          message = data.detail;
        }
      } catch {}

      throw new Error(message);
    }

    return response.json();
  }

  async function handleCreateTopic(e) {
    e.preventDefault();

    if (!title.trim()) {
      setError("اكتب اسم الموضوع أولاً");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/topics`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },

        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        let message = "فشل إنشاء الموضوع";

        try {
          const data = await response.json();

          if (data.detail) {
            message = data.detail;
          }
        } catch {}

        throw new Error(message);
      }

      const createdTopic = await response.json();

      if (selectedFile) {
        await uploadFileToTopic(
          createdTopic.id,
          selectedFile
        );
      }

      setTitle("");
      setDescription("");
      setSelectedFile(null);

      const fileInput =
        document.getElementById("topic-file-input");

      if (fileInput) {
        fileInput.value = "";
      }

      setSuccess(
        selectedFile
          ? "تم إنشاء الموضوع ورفع الملف بنجاح ✅"
          : "تم إنشاء الموضوع بنجاح ✅"
      );

      await fetchTopics();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteTopic(topicId) {
    const confirmed = window.confirm(
      "هل تريد حذف الموضوع؟"
    );

    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_URL}/topics/${topicId}`,
        {
          method: "DELETE",

          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("فشل حذف الموضوع");
      }

      await fetchTopics();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <main className="main-content" dir="rtl">
        <header className="page-header">
          <div>
            <h1>لوحة التحكم</h1>

            <p className="muted">
              نظّم مواضيعك وابدأ رحلة تعلمك.
            </p>
          </div>

          <div className="muted">
            AI Study Assistant
          </div>
        </header>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        {success && (
          <div className="success-box">
            {success}
          </div>
        )}

        <section className="card topic-form">
          <h2>+ موضوع جديد</h2>

          <form onSubmit={handleCreateTopic}>
            <div className="form-row">
              <input
                className="form-input"
                placeholder="اسم الموضوع"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
              />

              <input
                className="form-input"
                placeholder="وصف مختصر"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
              />

              <label className="file-btn">
                📎 إرفاق ملف

                <input
                  id="topic-file-input"
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileChange}
                  hidden
                />
              </label>

              <button
                className="primary-btn"
                disabled={creating}
              >
                {creating
                  ? "جاري الإضافة..."
                  : "إضافة"}
              </button>
            </div>

            {selectedFile && (
              <div className="selected-file">
                <span>
                  📄 {selectedFile.name}
                </span>

                <button
                  type="button"
                  className="remove-file-btn"
                  onClick={() => {
                    setSelectedFile(null);

                    const input =
                      document.getElementById(
                        "topic-file-input"
                      );

                    if (input) {
                      input.value = "";
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            <p className="file-help">
              اختياري — PDF أو TXT بحد أقصى 10 MB
            </p>
          </form>
        </section>

        <section>
          <h2 className="section-title">
            مواضيعي
          </h2>

          {loading ? (
            <p className="muted">
              جاري تحميل المواضيع...
            </p>
          ) : topics.length === 0 ? (
            <div className="card empty-card">
              لا توجد مواضيع حتى الآن
            </div>
          ) : (
            <div className="topics-grid">
              {topics.map((topic) => (
                <article
                  className="topic-card"
                  key={topic.id}
                >
                  <h3>{topic.title}</h3>

                  <p>
                    {topic.description ||
                      "بدون وصف"}
                  </p>

                  <div className="topic-card-actions">
                    <button
                      className="primary-btn"
                      onClick={() =>
                        router.push(
                          `/topics/${topic.id}`
                        )
                      }
                    >
                      فتح الموضوع
                    </button>

                    <button
                      className="danger-btn"
                      onClick={() =>
                        deleteTopic(topic.id)
                      }
                    >
                      حذف
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <aside className="sidebar" dir="rtl">
        <div className="sidebar-brand">
          AI Study ✦
        </div>

        <button
          className="nav-item active"
          onClick={() =>
            router.push("/dashboard")
          }
        >
          الرئيسية
        </button>

        <div className="sidebar-section">
          <div className="sidebar-title">
            مواضيعي
          </div>

          {topics.length === 0 ? (
            <div className="sidebar-empty">
              لا توجد مواضيع
            </div>
          ) : (
            <div className="sidebar-topics">
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  className="sidebar-topic"
                  onClick={() =>
                    router.push(
                      `/topics/${topic.id}`
                    )
                  }
                >
                  <span className="topic-dot">
                    •
                  </span>

                  <span className="topic-name">
                    {topic.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="nav-item logout"
          onClick={logout}
        >
          تسجيل الخروج
        </button>
      </aside>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .app-shell {
          min-height: 100vh;

          display: grid;

          grid-template-columns:
            minmax(0, 1fr)
            300px;

          direction: ltr;

          background: #070c14;
          color: #f5f7ff;

          font-family: Arial, sans-serif;
        }

        .main-content {
          grid-column: 1;
          grid-row: 1;

          min-width: 0;

          width: 100%;
          max-width: 1500px;

          margin: 0 auto;

          padding: 42px 38px 70px;
        }

        .sidebar {
          grid-column: 2;
          grid-row: 1;

          min-height: 100vh;

          background: #090f19;

          border-left: 1px solid #1e293b;

          padding: 28px 22px;

          display: flex;
          flex-direction: column;

          gap: 12px;
        }

        .sidebar-brand {
          font-size: 23px;
          font-weight: 800;

          margin-bottom: 25px;
        }

        .nav-item {
          width: 100%;

          border: 0;

          border-radius: 14px;

          padding: 14px 16px;

          background: transparent;

          color: #9eabc2;

          cursor: pointer;

          text-align: right;

          font-size: 15px;
        }

        .nav-item.active {
          background: #161f3c;
          color: white;
        }

        .sidebar-section {
          margin-top: 18px;
        }

        .sidebar-title {
          padding: 0 8px;

          margin-bottom: 9px;

          color: #6f7d95;

          font-size: 13px;
        }

        .sidebar-topics {
          display: flex;

          flex-direction: column;

          gap: 6px;
        }

        .sidebar-topic {
          width: 100%;

          border: 0;

          border-radius: 11px;

          padding: 11px 12px;

          display: flex;

          align-items: center;

          gap: 8px;

          background: transparent;

          color: #b8c3d7;

          cursor: pointer;

          text-align: right;
        }

        .sidebar-topic:hover {
          background: #111b2d;
          color: white;
        }

        .topic-dot {
          color: #5875ff;

          font-size: 20px;

          line-height: 1;
        }

        .topic-name {
          overflow: hidden;

          white-space: nowrap;

          text-overflow: ellipsis;
        }

        .sidebar-empty {
          padding: 10px;

          color: #59677e;

          font-size: 13px;
        }

        .logout {
          margin-top: auto;

          color: #ff7474;
        }

        .page-header {
          display: flex;

          justify-content: space-between;

          align-items: flex-start;

          margin-bottom: 38px;
        }

        .page-header h1 {
          margin: 0 0 10px;

          font-size: 38px;
        }

        .muted {
          color: #8491aa;
        }

        .card {
          background: #111927;

          border: 1px solid #28354a;

          border-radius: 22px;
        }

        .topic-form {
          padding: 28px;

          margin-bottom: 38px;
        }

        .topic-form h2 {
          margin: 0 0 22px;

          font-size: 25px;
        }

        .form-row {
          display: grid;

          grid-template-columns:
            1fr
            1fr
            170px
            110px;

          gap: 14px;
        }

        .form-input {
          height: 62px;

          border: 1px solid #334155;

          border-radius: 15px;

          background: #0b111c;

          color: white;

          padding: 0 18px;

          outline: none;
        }

        .file-btn {
          height: 62px;

          border: 1px solid #334155;

          border-radius: 15px;

          background: #0b111c;

          color: #d9e4ff;

          display: flex;

          align-items: center;

          justify-content: center;

          cursor: pointer;

          white-space: nowrap;
        }

        .primary-btn {
          min-height: 52px;

          border: 0;

          border-radius: 13px;

          background: #4c6fff;

          color: white;

          padding: 0 18px;

          cursor: pointer;
        }

        .selected-file {
          margin-top: 14px;

          padding: 12px 14px;

          border: 1px solid #263247;

          border-radius: 12px;

          background: #0b111c;

          display: flex;

          justify-content: space-between;
        }

        .remove-file-btn {
          border: 0;

          background: transparent;

          color: #ff7474;

          cursor: pointer;
        }

        .file-help {
          color: #75839b;

          font-size: 12px;
        }

        .section-title {
          margin-bottom: 18px;
        }

        .topics-grid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fill,
              minmax(270px, 1fr)
            );

          gap: 16px;
        }

        .topic-card {
          padding: 22px;

          border: 1px solid #27344a;

          border-radius: 18px;

          background: #101826;
        }

        .topic-card h3 {
          margin: 0 0 10px;
        }

        .topic-card p {
          color: #8996ad;

          min-height: 40px;
        }

        .topic-card-actions {
          margin-top: 18px;

          display: flex;

          gap: 10px;
        }

        .danger-btn {
          min-height: 52px;

          border: 1px solid #733b42;

          border-radius: 13px;

          background: #241318;

          color: #ff8686;

          padding: 0 16px;

          cursor: pointer;
        }

        .error-box,
        .success-box {
          margin-bottom: 18px;

          padding: 14px 17px;

          border-radius: 12px;
        }

        .error-box {
          border: 1px solid #813737;

          color: #ff9b9b;
        }

        .success-box {
          border: 1px solid #277b57;

          color: #65dda5;
        }

        .empty-card {
          padding: 20px;

          color: #7f8ca4;
        }

        @media (max-width: 900px) {
          .app-shell {
            display: flex;
            flex-direction: column;
          }

          .sidebar {
            order: 1;

            width: 100%;

            min-height: auto;

            border-left: 0;

            border-bottom: 1px solid #1e293b;
          }

          .main-content {
            order: 2;

            padding: 24px 16px 50px;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .logout {
            margin-top: 20px;
          }
        }
      `}</style>
    </div>
  );
}