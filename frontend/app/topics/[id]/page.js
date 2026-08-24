"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function TopicPage() {
  const params = useParams();

  const router = useRouter();

  const searchParams =
    useSearchParams();

  const topicId = params?.id;

  const fileInputRef =
    useRef(null);

  const [topic, setTopic] =
    useState(null);

  const [allTopics, setAllTopics] =
    useState([]);

  const [notes, setNotes] =
    useState([]);

  const [topicFiles, setTopicFiles] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [chatMessage, setChatMessage] =
    useState("");

  const [chatHistory, setChatHistory] =
    useState([]);

  const [chatLoading, setChatLoading] =
    useState(false);

  const [noteContent, setNoteContent] =
    useState("");

  const [addingNote, setAddingNote] =
    useState(false);

  const [uploadingFile, setUploadingFile] =
    useState(false);

  const [fileMessage, setFileMessage] =
    useState("");

  function getToken() {
    return localStorage.getItem(
      "access_token"
    );
  }

  function logout() {
    localStorage.removeItem(
      "access_token"
    );

    router.push("/login");
  }

  async function authFetch(
    url,
    options = {}
  ) {
    const token =
      getToken();

    if (!token) {
      logout();

      throw new Error(
        "يرجى تسجيل الدخول"
      );
    }

    const response =
      await fetch(
        url,
        {
          ...options,

          headers: {
            ...(options.headers ||
              {}),

            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    if (
      response.status ===
      401
    ) {
      logout();

      throw new Error(
        "انتهت جلسة تسجيل الدخول"
      );
    }

    return response;
  }

  async function fetchData() {
    if (!topicId) {
      return;
    }

    setLoading(true);

    setError("");

    try {
      const [
        topicResponse,
        notesResponse,
        filesResponse,
        topicsResponse,
      ] =
        await Promise.all([
          authFetch(
            `${API_URL}/topics/${topicId}`
          ),

          authFetch(
            `${API_URL}/topics/${topicId}/notes`
          ),

          authFetch(
            `${API_URL}/topics/${topicId}/files`
          ),

          authFetch(
            `${API_URL}/topics`
          ),
        ]);

      if (
        !topicResponse.ok
      ) {
        throw new Error(
          "فشل تحميل الموضوع"
        );
      }

      if (
        !notesResponse.ok
      ) {
        throw new Error(
          "فشل تحميل الملاحظات"
        );
      }

      if (
        !filesResponse.ok
      ) {
        throw new Error(
          "فشل تحميل الملفات"
        );
      }

      const topicData =
        await topicResponse.json();

      const notesData =
        await notesResponse.json();

      const filesData =
        await filesResponse.json();

      const topicsData =
        topicsResponse.ok
          ? await topicsResponse.json()
          : [];

      setTopic(
        topicData
      );

      setNotes(
        notesData
      );

      setTopicFiles(
        filesData
      );

      setAllTopics(
        topicsData
      );
    } catch (err) {
      setError(
        err.message ||
          "حدث خطأ أثناء تحميل البيانات"
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    fetchData();
  }, [topicId]);

  useEffect(() => {
    const explain =
      searchParams.get(
        "explain"
      );

    if (explain) {
      setChatMessage(
        explain
      );

      setTimeout(() => {
        document
          .getElementById(
            "chat-input"
          )
          ?.focus();
      }, 250);
    }
  }, [searchParams]);

  async function sendMessage(
    messageOverride
  ) {
    const message =
      (
        messageOverride ??
        chatMessage
      ).trim();

    if (
      !message ||
      chatLoading
    ) {
      return;
    }

    setChatLoading(
      true
    );

    setError("");

    setChatHistory(
      (prev) => [
        ...prev,

        {
          role: "user",
          text: message,
        },
      ]
    );

    if (
      !messageOverride
    ) {
      setChatMessage("");
    }

    try {
      const response =
        await authFetch(
          `${API_URL}/ai/chat`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                topic_id:
                  Number(
                    topicId
                  ),

                message,
              }),
          }
        );

      if (!response.ok) {
        let detail =
          "The AI service could not answer the request.";

        try {
          const data =
            await response.json();

          detail =
            data.detail ||
            detail;
        } catch {}

        throw new Error(
          detail
        );
      }

      const data =
        await response.json();

      setChatHistory(
        (prev) => [
          ...prev,

          {
            role:
              "assistant",

            text:
              data.answer ||
              "لم يصل رد من المساعد.",
          },
        ]
      );
    } catch (err) {
      setChatHistory(
        (prev) => [
          ...prev,

          {
            role:
              "assistant",

            text:
              `حدث خطأ: ${err.message}`,

            error: true,
          },
        ]
      );

      setError(
        err.message
      );
    } finally {
      setChatLoading(
        false
      );
    }
  }

  function handleChatSubmit(
    e
  ) {
    e.preventDefault();

    sendMessage();
  }

  async function addNote(
    e
  ) {
    e.preventDefault();

    if (
      !noteContent.trim()
    ) {
      return;
    }

    setAddingNote(
      true
    );

    try {
      const response =
        await authFetch(
          `${API_URL}/topics/${topicId}/notes`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                content:
                  noteContent.trim(),
              }),
          }
        );

      if (!response.ok) {
        throw new Error(
          "فشل إضافة الملاحظة"
        );
      }

      setNoteContent("");

      const responseNotes =
        await authFetch(
          `${API_URL}/topics/${topicId}/notes`
        );

      if (
        responseNotes.ok
      ) {
        setNotes(
          await responseNotes.json()
        );
      }
    } catch (err) {
      setError(
        err.message
      );
    } finally {
      setAddingNote(
        false
      );
    }
  }

  async function uploadFile(
    file
  ) {
    if (!file) {
      return;
    }

    const lowerName =
      file.name.toLowerCase();

    if (
      !lowerName.endsWith(
        ".pdf"
      ) &&
      !lowerName.endsWith(
        ".txt"
      )
    ) {
      setFileMessage(
        "يسمح فقط بملفات PDF أو TXT"
      );

      return;
    }

    if (
      file.size >
      10 *
        1024 *
        1024
    ) {
      setFileMessage(
        "حجم الملف يجب ألا يتجاوز 10 MB"
      );

      return;
    }

    setUploadingFile(
      true
    );

    setFileMessage("");

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const response =
        await authFetch(
          `${API_URL}/topics/${topicId}/files`,
          {
            method:
              "POST",

            body:
              formData,
          }
        );

      if (!response.ok) {
        let message =
          "فشل رفع الملف";

        try {
          const data =
            await response.json();

          message =
            data.detail ||
            message;
        } catch {}

        throw new Error(
          message
        );
      }

      const filesResponse =
        await authFetch(
          `${API_URL}/topics/${topicId}/files`
        );

      if (
        filesResponse.ok
      ) {
        setTopicFiles(
          await filesResponse.json()
        );
      }

      setFileMessage(
        "تم رفع الملف بنجاح ✅"
      );
    } catch (err) {
      setFileMessage(
        err.message
      );
    } finally {
      setUploadingFile(
        false
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  async function deleteFile(
    fileId
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف الملف؟"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await authFetch(
          `${API_URL}/topic-files/${fileId}`,
          {
            method:
              "DELETE",
          }
        );

      if (!response.ok) {
        throw new Error(
          "فشل حذف الملف"
        );
      }

      setTopicFiles(
        (prev) =>
          prev.filter(
            (file) =>
              file.id !==
              fileId
          )
      );
    } catch (err) {
      setError(
        err.message
      );
    }
  }

  if (loading) {
    return (
      <div className="loading">
        جاري تحميل الموضوع...
      </div>
    );
  }

  return (
    <div className="page-shell">
      <main
        className="main-content"
        dir="rtl"
      >
        <header className="header">
          <div>
            <span className="muted">
              الموضوع الحالي
            </span>

            <h1>
              {topic?.title}
            </h1>

            {topic?.description && (
              <p className="muted">
                {
                  topic.description
                }
              </p>
            )}
          </div>

          <button
            className="back-btn"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
          >
            ← العودة
          </button>
        </header>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <h2>
                ✦ المساعد الذكي
              </h2>

              <p>
                اسأل أي شيء عن{" "}
                {topic?.title}
              </p>
            </div>

            <span className="ready">
              ● جاهز
            </span>
          </div>

          <div className="quick-actions">
            <button
              onClick={() =>
                sendMessage(
                  "لخص الموضوع والملاحظات والملفات المرفوعة بشكل واضح ومختصر."
                )
              }
            >
              ✦ لخص الموضوع
            </button>

            <button
              onClick={() =>
                sendMessage(
                  "اشرح لي الموضوع ببساطة واعتمد على الملاحظات والملفات إذا كانت موجودة."
                )
              }
            >
              💡 اشرح لي
            </button>

            <button
              className="quiz-btn"
              onClick={() =>
                router.push(
                  `/topics/${topicId}/quiz`
                )
              }
            >
              ✓ اختبرني
            </button>
          </div>

          <div className="chat-area">
            {chatHistory.length ===
            0 ? (
              <div className="empty-chat">
                اكتب سؤالك أو استخدم
                أحد الأزرار بالأعلى.
              </div>
            ) : (
              chatHistory.map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={
                      index
                    }
                    className={`message-row ${
                      item.role ===
                      "user"
                        ? "user-message"
                        : "ai-message"
                    }`}
                  >
                    <div
                      className={`bubble ${
                        item.error
                          ? "bubble-error"
                          : ""
                      }`}
                    >
                      {
                        item.text
                      }
                    </div>
                  </div>
                )
              )
            )}

            {chatLoading && (
              <div className="message-row ai-message">
                <div className="bubble">
                  جاري التفكير...
                </div>
              </div>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={
              handleChatSubmit
            }
          >
            <label className="attach">
              📎

              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                hidden
                onChange={(e) =>
                  uploadFile(
                    e.target
                      .files?.[0]
                  )
                }
              />
            </label>

            <input
              id="chat-input"
              className="chat-input"
              value={
                chatMessage
              }
              onChange={(e) =>
                setChatMessage(
                  e.target.value
                )
              }
              placeholder="اكتب سؤالك هنا..."
            />

            <button
              type="submit"
              className="send-btn"
              disabled={
                chatLoading ||
                !chatMessage.trim()
              }
            >
              إرسال
            </button>
          </form>
        </section>

        <section className="notes-card">
          <h2>
            الملاحظات
          </h2>

          <form
            className="note-form"
            onSubmit={
              addNote
            }
          >
            <textarea
              value={
                noteContent
              }
              onChange={(e) =>
                setNoteContent(
                  e.target.value
                )
              }
              placeholder="اكتب ملاحظة..."
            />

            <button
              disabled={
                addingNote
              }
            >
              {addingNote
                ? "جاري الإضافة..."
                : "إضافة ملاحظة"}
            </button>
          </form>

          <div className="notes-list">
            {notes.length ===
            0 ? (
              <div className="empty-note">
                لا توجد ملاحظات
              </div>
            ) : (
              notes.map(
                (note) => (
                  <div
                    key={
                      note.id
                    }
                    className="note"
                  >
                    {
                      note.content
                    }
                  </div>
                )
              )
            )}
          </div>
        </section>
      </main>

      <aside
        className="sidebar"
        dir="rtl"
      >
        <div className="brand">
          AI Study ✦
        </div>

        <button
          className="nav-btn"
          onClick={() =>
            router.push(
              "/dashboard"
            )
          }
        >
          الرئيسية
        </button>

        <div className="sidebar-section">
          <div className="sidebar-title">
            مواضيعي
          </div>

          <div className="topics-list">
            {allTopics.map(
              (item) => (
                <button
                  key={
                    item.id
                  }
                  className={`topic-link ${
                    Number(
                      item.id
                    ) ===
                    Number(
                      topicId
                    )
                      ? "current-topic"
                      : ""
                  }`}
                  onClick={() =>
                    router.push(
                      `/topics/${item.id}`
                    )
                  }
                >
                  <span>
                    •
                  </span>

                  <span>
                    {
                      item.title
                    }
                  </span>
                </button>
              )
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="files-heading">
            <div className="sidebar-title">
              📁 الملفات
            </div>

            <button
              className="plus-btn"
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              +
            </button>
          </div>

          <input
            ref={
              fileInputRef
            }
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            hidden
            onChange={(e) =>
              uploadFile(
                e.target
                  .files?.[0]
              )
            }
          />

          <div className="file-list">
            {topicFiles.length ===
            0 ? (
              <div className="sidebar-empty">
                لا توجد ملفات
              </div>
            ) : (
              topicFiles.map(
                (file) => (
                  <div
                    className="file-item"
                    key={
                      file.id
                    }
                  >
                    <span className="file-name">
                      📄{" "}
                      {
                        file.filename
                      }
                    </span>

                    <button
                      onClick={() =>
                        deleteFile(
                          file.id
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                )
              )
            )}
          </div>

          {uploadingFile && (
            <div className="file-message">
              جاري رفع الملف...
            </div>
          )}

          {fileMessage &&
            !uploadingFile && (
              <div className="file-message">
                {
                  fileMessage
                }
              </div>
            )}
        </div>

        <button
          className="logout"
          onClick={
            logout
          }
        >
          تسجيل الخروج
        </button>
      </aside>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page-shell {
          min-height: 100vh;

          display: grid;

          grid-template-columns:
            minmax(0, 1fr)
            300px;

          direction: ltr;

          background: #070c14;

          color: white;

          font-family:
            Arial,
            sans-serif;
        }

        .sidebar {
          grid-column: 2;
          grid-row: 1;

          min-height: 100vh;

          padding:
            28px 22px;

          background:
            #090f19;

          border-left:
            1px solid
            #1f2937;

          display: flex;

          flex-direction:
            column;

          gap: 12px;
        }

        .main-content {
          grid-column: 1;
          grid-row: 1;

          min-width: 0;

          width: 100%;

          max-width:
            1100px;

          margin:
            0 auto;

          padding:
            32px 28px
            60px;
        }

        .brand {
          font-size: 22px;

          font-weight: 800;

          margin-bottom:
            20px;
        }

        .nav-btn,
        .logout {
          border: 0;

          border-radius:
            13px;

          padding:
            14px;

          background:
            transparent;

          color:
            #b1bed1;

          text-align:
            right;

          cursor: pointer;
        }

        .nav-btn {
          background:
            #18213b;

          color: white;
        }

        .logout {
          margin-top: auto;

          color:
            #ff7777;
        }

        .sidebar-section {
          margin-top:
            18px;
        }

        .sidebar-title {
          color:
            #7d8ca6;

          font-size:
            13px;

          margin-bottom:
            8px;
        }

        .topics-list {
          display: flex;

          flex-direction:
            column;

          gap: 6px;
        }

        .topic-link {
          display: flex;

          gap: 8px;

          width: 100%;

          padding:
            10px;

          border: 0;

          border-radius:
            10px;

          background:
            transparent;

          color:
            #b7c3d7;

          cursor: pointer;
        }

        .current-topic {
          background:
            #18213b;

          color: white;
        }

        .files-heading {
          display: flex;

          justify-content:
            space-between;

          align-items:
            center;
        }

        .plus-btn {
          width: 30px;

          height: 30px;

          border:
            1px solid
            #465eb8;

          border-radius:
            8px;

          background:
            #17254b;

          color: white;

          cursor: pointer;

          font-size: 19px;
        }

        .file-list {
          display: grid;
          gap: 7px;
        }

        .file-item {
          display: flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap: 8px;

          padding:
            9px 10px;

          background:
            #101927;

          border:
            1px solid
            #29364b;

          border-radius:
            10px;
        }

        .file-name {
          overflow: hidden;

          white-space:
            nowrap;

          text-overflow:
            ellipsis;

          font-size:
            12px;
        }

        .file-item button {
          border: 0;

          background:
            transparent;

          color:
            #ff7777;

          cursor: pointer;
        }

        .file-message,
        .sidebar-empty {
          margin-top:
            7px;

          color:
            #74839b;

          font-size:
            12px;
        }

        .header {
          display: flex;

          justify-content:
            space-between;

          align-items:
            flex-start;

          margin-bottom:
            22px;
        }

        .header h1 {
          margin:
            5px 0;

          font-size: 34px;
        }

        .muted {
          color:
            #8391aa;
        }

        .back-btn {
          padding:
            12px 18px;

          border:
            1px solid
            #2c3a50;

          border-radius:
            12px;

          background:
            #111a28;

          color: white;

          cursor: pointer;
        }

        .error-box {
          margin-bottom:
            15px;

          padding:
            13px;

          color:
            #ffaaaa;

          border:
            1px solid
            #923c3c;

          border-radius:
            12px;
        }

        .chat-card,
        .notes-card {
          border:
            1px solid
            #27344a;

          border-radius:
            20px;

          background:
            #0e1725;

          overflow: hidden;
        }

        .chat-header {
          padding:
            22px;

          display: flex;

          justify-content:
            space-between;

          align-items:
            center;

          border-bottom:
            1px solid
            #27344a;
        }

        .chat-header h2 {
          margin:
            0 0 6px;
        }

        .chat-header p {
          margin: 0;

          color:
            #7f8da7;
        }

        .ready {
          color:
            #6de1a0;

          font-size:
            12px;
        }

        .quick-actions {
          display: flex;

          gap: 10px;

          flex-wrap:
            wrap;

          padding:
            15px 22px;

          border-bottom:
            1px solid
            #27344a;
        }

        .quick-actions button {
          padding:
            11px 16px;

          border:
            1px solid
            #34435c;

          border-radius:
            12px;

          background:
            #121c2d;

          color: white;

          cursor: pointer;
        }

        .quiz-btn {
          border-color:
            #515dd4 !important;
        }

        .chat-area {
          height: 450px;

          overflow-y:
            auto;

          padding: 22px;
        }

        .empty-chat {
          height: 100%;

          display: grid;

          place-items:
            center;

          color:
            #647087;
        }

        .message-row {
          display: flex;

          margin-bottom:
            14px;
        }

        .user-message {
          justify-content:
            flex-start;
        }

        .ai-message {
          justify-content:
            flex-end;
        }

        .bubble {
          max-width: 80%;

          padding:
            13px 16px;

          border:
            1px solid
            #2e3c55;

          border-radius:
            14px;

          background:
            #152034;

          line-height: 1.8;

          white-space:
            pre-wrap;
        }

        .user-message
        .bubble {
          background:
            #4565df;
        }

        .bubble-error {
          color:
            #ffaaaa;
        }

        .chat-form {
          display: grid;

          grid-template-columns:
            52px 1fr
            100px;

          gap: 10px;

          padding:
            18px;

          border-top:
            1px solid
            #27344a;
        }

        .attach,
        .send-btn {
          height: 48px;

          display: grid;

          place-items:
            center;

          border-radius:
            12px;
        }

        .attach {
          background:
            #111b2a;

          border:
            1px solid
            #34435d;

          cursor: pointer;
        }

        .chat-input {
          height: 48px;

          border:
            1px solid
            #34435d;

          border-radius:
            12px;

          background:
            #080e18;

          color: white;

          padding:
            0 14px;

          outline: none;
        }

        .send-btn {
          border: 0;

          background:
            #4b6df0;

          color: white;

          cursor: pointer;
        }

        .notes-card {
          margin-top:
            22px;

          padding: 22px;
        }

        .notes-card h2 {
          margin-top: 0;
        }

        .note-form {
          display: grid;

          grid-template-columns:
            1fr 140px;

          gap: 10px;
        }

        .note-form textarea {
          min-height:
            90px;

          background:
            #080e18;

          color: white;

          border:
            1px solid
            #34435d;

          border-radius:
            12px;

          padding: 13px;
        }

        .note-form button {
          border: 0;

          border-radius:
            12px;

          background:
            #4562db;

          color: white;

          cursor: pointer;
        }

        .notes-list {
          display: grid;

          gap: 9px;

          margin-top:
            15px;
        }

        .note,
        .empty-note {
          padding:
            12px;

          border:
            1px solid
            #28364b;

          border-radius:
            11px;

          background:
            #111a29;
        }

        .loading {
          min-height:
            100vh;

          display: grid;

          place-items:
            center;

          background:
            #070c14;

          color: white;
        }

        @media (
          max-width:
            900px
        ) {
          .page-shell {
            display: flex;

            flex-direction:
              column;
          }

          .sidebar {
            order: 1;

            min-height:
              auto;
          }

          .main-content {
            order: 2;

            padding:
              22px 15px;
          }

          .chat-form {
            grid-template-columns:
              48px 1fr;
          }

          .send-btn {
            grid-column:
              1 / -1;
          }

          .note-form {
            grid-template-columns:
              1fr;
          }
        }
      `}</style>
    </div>
  );
}