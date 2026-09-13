"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();

  const topicId = params?.id;

  const [topic, setTopic] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  const [currentQuestion, setCurrentQuestion] = useState(0);

  const [phase, setPhase] = useState("intro");
  const [countdown, setCountdown] = useState(3);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState("");

  function getToken() {
    return localStorage.getItem("access_token");
  }

  function logout() {
    localStorage.removeItem("access_token");
    router.push("/login");
  }

  async function authFetch(url, options = {}) {
    const token = getToken();

    if (!token) {
      logout();
      throw new Error("يرجى تسجيل الدخول");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("انتهت جلسة تسجيل الدخول");
    }

    return response;
  }

  useEffect(() => {
    if (!topicId) return;

    async function loadTopic() {
      try {
        const response = await authFetch(
          `${API_URL}/topics/${topicId}`
        );

        if (!response.ok) {
          throw new Error("فشل تحميل الموضوع");
        }

        const data = await response.json();

        setTopic(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadTopic();
  }, [topicId]);

  function normalizeAnswer(value) {
    if (value === true) return "صح";
    if (value === false) return "خطأ";

    if (value === "true") return "صح";
    if (value === "false") return "خطأ";

    return String(value ?? "").trim();
  }

  function getCorrectAnswer(question) {
    return normalizeAnswer(question.correct_answer);
  }

  function isCorrect(question, answer) {
    return (
      normalizeAnswer(answer) ===
      getCorrectAnswer(question)
    );
  }

  function hasAnswered(index) {
    return Object.prototype.hasOwnProperty.call(
      answers,
      index
    );
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function runCountdown() {
    setPhase("countdown");

    setCountdown(3);
    await wait(650);

    setCountdown(2);
    await wait(650);

    setCountdown(1);
    await wait(650);

    setCountdown("انطلق! 🏁");
    await wait(650);

    setPhase("quiz");
  }

  async function generateQuiz() {
    setGenerating(true);
    setError("");

    try {
      const response = await authFetch(
        `${API_URL}/ai/quiz/${topicId}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        let message = "فشل توليد الاختبار";

        try {
          const data = await response.json();

          message =
            data.detail || message;
        } catch {}

        throw new Error(message);
      }

      const data = await response.json();

      if (
        !Array.isArray(data.questions) ||
        data.questions.length === 0
      ) {
        throw new Error(
          "لم يتم توليد أسئلة للاختبار"
        );
      }

      setQuestions(data.questions);
      setAnswers({});
      setCurrentQuestion(0);

      await runCountdown();
    } catch (err) {
      setError(err.message);
      setPhase("intro");
    } finally {
      setGenerating(false);
    }
  }

  function selectAnswer(value) {
    if (hasAnswered(currentQuestion)) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion]: value,
    }));
  }

  function nextQuestion() {
    if (!hasAnswered(currentQuestion)) {
      return;
    }

    if (
      currentQuestion <
      questions.length - 1
    ) {
      setCurrentQuestion(
        (prev) => prev + 1
      );
    } else {
      setPhase("result");
    }
  }

  function calculateScore() {
    let score = 0;

    questions.forEach(
      (question, index) => {
        if (
          isCorrect(
            question,
            answers[index]
          )
        ) {
          score += 1;
        }
      }
    );

    return score;
  }

  function calculatePercentage() {
    if (questions.length === 0) {
      return 0;
    }

    return Math.round(
      (calculateScore() /
        questions.length) *
        100
    );
  }

  function getResultMessage() {
    const percentage =
      calculatePercentage();

    if (percentage === 100) {
      return "علامة كاملة! ممتاز جدًا 🔥";
    }

    if (percentage >= 80) {
      return "ممتاز! أداء قوي جدًا.";
    }

    if (percentage >= 60) {
      return "جيد جدًا، راجع الأسئلة التي أخطأت فيها.";
    }

    return "راجع الأسئلة بالأسفل وحاول مرة أخرى.";
  }

  function explainQuestion(question) {
    const message =
      `اشرح لي هذا السؤال بطريقة بسيطة وواضحة:\n\n${question.question}`;

    router.push(
      `/topics/${topicId}?explain=${encodeURIComponent(
        message
      )}`
    );
  }

  function renderMultipleChoice(question) {
    const answered =
      hasAnswered(currentQuestion);

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "14px",
          width: "100%",
        }}
      >
        {(question.options || []).map(
          (option, index) => {
            const selected =
              normalizeAnswer(
                answers[currentQuestion]
              ) ===
              normalizeAnswer(option);

            const correct =
              normalizeAnswer(option) ===
              getCorrectAnswer(question);

            let background = "#111c2f";
            let borderColor = "#31425f";

            if (answered) {
              if (correct) {
                background =
                  "rgba(34, 197, 94, 0.17)";
                borderColor = "#22c55e";
              } else if (selected) {
                background =
                  "rgba(239, 68, 68, 0.17)";
                borderColor = "#ef4444";
              }
            } else if (selected) {
              background =
                "rgba(79, 103, 230, 0.20)";
              borderColor = "#647cff";
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() =>
                  selectAnswer(option)
                }
                style={{
                  width: "100%",
                  minHeight: "78px",
                  padding: "16px 18px",

                  display: "flex",
                  alignItems: "center",
                  gap: "14px",

                  border: `1px solid ${borderColor}`,
                  borderRadius: "16px",

                  background,
                  color: "#ffffff",

                  cursor: answered
                    ? "default"
                    : "pointer",

                  textAlign: "right",
                  fontSize: "16px",
                  fontFamily:
                    "Arial, sans-serif",

                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                <span
                  style={{
                    width: "38px",
                    height: "38px",
                    flex: "0 0 38px",

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    borderRadius: "11px",

                    background: "#1d2b43",
                    color: "#dce7ff",

                    fontWeight: "700",
                  }}
                >
                  {String.fromCharCode(
                    65 + index
                  )}
                </span>

                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    lineHeight: "1.6",
                    color: "#ffffff",
                  }}
                >
                  {option}
                </span>
              </button>
            );
          }
        )}
      </div>
    );
  }

  function renderTrueFalse(question) {
    const options = [
      {
        label: "صح",
        value: true,
      },
      {
        label: "خطأ",
        value: false,
      },
    ];

    const answered =
      hasAnswered(currentQuestion);

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: "14px",
          width: "100%",
        }}
      >
        {options.map((option) => {
          const selected =
            normalizeAnswer(
              answers[currentQuestion]
            ) ===
            normalizeAnswer(option.value);

          const correct =
            normalizeAnswer(
              option.value
            ) ===
            getCorrectAnswer(question);

          let background = "#111c2f";
          let borderColor = "#31425f";

          if (answered) {
            if (correct) {
              background =
                "rgba(34, 197, 94, 0.17)";
              borderColor = "#22c55e";
            } else if (selected) {
              background =
                "rgba(239, 68, 68, 0.17)";
              borderColor = "#ef4444";
            }
          } else if (selected) {
            background =
              "rgba(79, 103, 230, 0.20)";
            borderColor = "#647cff";
          }

          return (
            <button
              key={option.label}
              type="button"
              onClick={() =>
                selectAnswer(
                  option.value
                )
              }
              style={{
                width: "100%",
                minHeight: "78px",
                padding: "16px 18px",

                display: "flex",
                alignItems: "center",
                gap: "14px",

                border: `1px solid ${borderColor}`,
                borderRadius: "16px",

                background,
                color: "#ffffff",

                cursor: answered
                  ? "default"
                  : "pointer",

                textAlign: "right",
                fontSize: "16px",
                fontFamily:
                  "Arial, sans-serif",

                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              <span
                style={{
                  width: "38px",
                  height: "38px",
                  flex: "0 0 38px",

                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",

                  borderRadius: "11px",

                  background: "#1d2b43",
                  color: "#dce7ff",

                  fontWeight: "700",
                }}
              >
                {option.label === "صح"
                  ? "✓"
                  : "✕"}
              </span>

              <span
                style={{
                  flex: 1,
                  color: "#ffffff",
                  fontSize: "17px",
                }}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-page">
        جاري تحميل الاختبار...

        <style jsx>{`
          .loading-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #070c14;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 20px;
          }
        `}</style>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div
        className="intro-page"
        dir="rtl"
      >
        <section className="intro-card">
          <div className="intro-icon">
            ✦
          </div>

          <span className="pill">
            اختبار تفاعلي
          </span>

          <h1>
            هل أنت مستعد للاختبار؟
          </h1>

          <p>
            سيتم إنشاء اختبار من
            الموضوع والملاحظات
            والملفات المرفوعة.
          </p>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            className="main-button"
            onClick={generateQuiz}
            disabled={generating}
          >
            {generating
              ? "جاري تجهيز الاختبار..."
              : "ابدأ الاختبار 🚀"}
          </button>

          <button
            className="secondary-button"
            onClick={() =>
              router.push(
                `/topics/${topicId}`
              )
            }
          >
            العودة للموضوع
          </button>
        </section>

        <style jsx>{`
          * {
            box-sizing: border-box;
          }

          .intro-page {
            min-height: 100vh;
            padding: 70px 20px;

            background:
              linear-gradient(
                180deg,
                #070c14,
                #0a1424
              );

            color: white;

            font-family:
              Arial,
              sans-serif;
          }

          .intro-card {
            width: 100%;
            max-width: 650px;

            margin: 0 auto;

            padding: 50px 35px;

            border:
              1px solid
              #26364f;

            border-radius:
              26px;

            background:
              #0d1726;

            text-align:
              center;
          }

          .intro-icon {
            font-size: 65px;
            margin-bottom: 18px;
          }

          .pill {
            display:
              inline-block;

            padding:
              8px 15px;

            border:
              1px solid
              #3a4a85;

            border-radius:
              999px;

            color:
              #bcc8ff;

            background:
              #141d3b;

            font-size:
              13px;
          }

          h1 {
            margin:
              24px 0
              13px;

            font-size:
              38px;
          }

          p {
            color:
              #8998b2;

            line-height:
              1.9;
          }

          .main-button,
          .secondary-button {
            width: 100%;

            min-height:
              58px;

            border-radius:
              15px;

            cursor:
              pointer;

            font-size:
              16px;
          }

          .main-button {
            margin-top:
              28px;

            border: 0;

            color: white;

            background:
              linear-gradient(
                90deg,
                #5b63ef,
                #3a82ef
              );
          }

          .secondary-button {
            margin-top:
              12px;

            border:
              1px solid
              #304058;

            background:
              #111a29;

            color: white;
          }

          .error-box {
            margin-top:
              20px;

            padding:
              13px;

            border:
              1px solid
              #8d3838;

            border-radius:
              12px;

            color:
              #ffabab;
          }

          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div
        className="countdown-page"
        dir="rtl"
      >
        <div className="countdown-number">
          {countdown}
        </div>

        <style jsx>{`
          .countdown-page {
            min-height: 100vh;

            display: grid;

            place-items: center;

            background:
              linear-gradient(
                180deg,
                #070c14,
                #0a1424
              );

            color: white;

            font-family:
              Arial,
              sans-serif;
          }

          .countdown-number {
            font-size:
              clamp(
                75px,
                15vw,
                160px
              );

            font-weight:
              900;

            animation:
              pop
              0.5s
              ease;
          }

          @keyframes pop {
            0% {
              transform:
                scale(0.3);

              opacity: 0;
            }

            100% {
              transform:
                scale(1);

              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  if (phase === "quiz") {
    const question =
      questions[currentQuestion];

    const answered =
      hasAnswered(currentQuestion);

    const correct =
      answered &&
      isCorrect(
        question,
        answers[currentQuestion]
      );

    return (
      <div
        className="quiz-page"
        dir="rtl"
      >
        <div className="quiz-container">
          <header className="quiz-header">
            <div>
              <span className="pill">
                السؤال{" "}
                {currentQuestion + 1}{" "}
                من{" "}
                {questions.length}
              </span>

              <h1>
                {topic?.title}
              </h1>
            </div>

            <button
              className="back-button"
              onClick={() =>
                router.push(
                  `/topics/${topicId}`
                )
              }
            >
              العودة
            </button>
          </header>

          <div className="progress">
            <div
              className="progress-fill"
              style={{
                width: `${
                  ((currentQuestion + 1) /
                    questions.length) *
                  100
                }%`,
              }}
            />
          </div>

          <section className="question-card">
            <span className="question-number">
              السؤال{" "}
              {currentQuestion + 1}
            </span>

            <h2>
              {question.question}
            </h2>

            {question.type ===
            "true_false"
              ? renderTrueFalse(
                  question
                )
              : renderMultipleChoice(
                  question
                )}

            {answered && (
              <div
                className={`feedback ${
                  correct
                    ? "correct-feedback"
                    : "wrong-feedback"
                }`}
              >
                {correct ? (
                  <>
                    ✓ إجابة صحيحة
                  </>
                ) : (
                  <>
                    ✕ إجابة خاطئة
                    <br />

                    الإجابة الصحيحة:{" "}
                    <strong>
                      {getCorrectAnswer(
                        question
                      )}
                    </strong>
                  </>
                )}
              </div>
            )}

            {answered && (
              <button
                className="next-button"
                onClick={nextQuestion}
              >
                {currentQuestion ===
                questions.length - 1
                  ? "عرض النتيجة"
                  : "السؤال التالي ←"}
              </button>
            )}
          </section>
        </div>

        <style jsx>{`
          * {
            box-sizing:
              border-box;
          }

          .quiz-page {
            min-height:
              100vh;

            padding:
              30px 20px
              60px;

            background:
              linear-gradient(
                180deg,
                #070c14,
                #0a1424
              );

            color:
              white;

            font-family:
              Arial,
              sans-serif;
          }

          .quiz-container {
            max-width:
              900px;

            margin:
              0 auto;
          }

          .quiz-header {
            display:
              flex;

            justify-content:
              space-between;

            align-items:
              flex-start;

            gap:
              20px;

            margin-bottom:
              20px;
          }

          .quiz-header h1 {
            margin:
              13px 0 0;

            font-size:
              31px;
          }

          .pill {
            display:
              inline-block;

            padding:
              7px 14px;

            border:
              1px solid
              #3b4a80;

            border-radius:
              999px;

            background:
              #141d3b;

            color:
              #bdc8ff;
          }

          .back-button {
            padding:
              12px 18px;

            border:
              1px solid
              #304058;

            border-radius:
              12px;

            background:
              #111a29;

            color:
              white;

            cursor:
              pointer;
          }

          .progress {
            height: 8px;

            margin-bottom:
              22px;

            border-radius:
              999px;

            background:
              #172236;

            overflow:
              hidden;
          }

          .progress-fill {
            height: 100%;

            background:
              linear-gradient(
                90deg,
                #6366f1,
                #3b82f6
              );
          }

          .question-card {
            padding:
              30px;

            border:
              1px solid
              #28374e;

            border-radius:
              22px;

            background:
              #0d1726;
          }

          .question-number {
            color:
              #8492aa;

            font-size:
              13px;
          }

          .question-card h2 {
            margin:
              12px 0
              28px;

            font-size:
              25px;

            line-height:
              1.7;
          }

          .feedback {
            margin-top:
              20px;

            padding:
              15px;

            border-radius:
              13px;

            line-height:
              1.8;
          }

          .correct-feedback {
            color:
              #9af0b8;

            border:
              1px solid
              #22c55e;

            background:
              rgba(
                34,
                197,
                94,
                0.12
              );
          }

          .wrong-feedback {
            color:
              #ffaaaa;

            border:
              1px solid
              #ef4444;

            background:
              rgba(
                239,
                68,
                68,
                0.12
              );
          }

          .next-button {
            width: 100%;

            min-height:
              56px;

            margin-top:
              20px;

            border: 0;

            border-radius:
              14px;

            background:
              linear-gradient(
                90deg,
                #5964ef,
                #3d82ef
              );

            color:
              white;

            cursor:
              pointer;
          }

          @media (
            max-width:
              700px
          ) {
            .quiz-header {
              flex-direction:
                column;
            }
          }
        `}</style>
      </div>
    );
  }

  const score =
    calculateScore();

  const percentage =
    calculatePercentage();

  return (
    <div
      className="result-page"
      dir="rtl"
    >
      <main className="result-container">
        <section className="result-card">
          <div
            className="confetti"
            aria-hidden="true"
          >
            {Array.from({
              length: 30,
            }).map(
              (_, index) => (
                <span
                  key={index}
                  className={`piece p${
                    (index % 6) + 1
                  }`}
                  style={{
                    left: `${
                      2 +
                      index * 3.2
                    }%`,

                    animationDelay: `${
                      (index % 7) *
                      0.15
                    }s`,
                  }}
                />
              )
            )}
          </div>

          <div className="celebration">
            🎉 ✨ 🎊
          </div>

          <span className="pill">
            اكتمل الاختبار
          </span>

          <h1>
            النتيجة النهائية
          </h1>

          <div className="score-circle">
            <strong>
              {score}
            </strong>

            <span>
              /{" "}
              {questions.length}
            </span>
          </div>

          <div className="percentage">
            {percentage}%
          </div>

          <p className="result-message">
            {getResultMessage()}
          </p>

          <button
            className="new-quiz-button"
            onClick={generateQuiz}
            disabled={generating}
          >
            {generating
              ? "جاري توليد اختبار جديد..."
              : "🔄 توليد أسئلة جديدة"}
          </button>

          <button
            className="return-button"
            onClick={() =>
              router.push(
                `/topics/${topicId}`
              )
            }
          >
            العودة للموضوع
          </button>
        </section>

        <section className="review-section">
          <div className="review-heading">
            <h2>
              مراجعة الاختبار
            </h2>

            <p>
              السؤال الأخضر إجابته صحيحة،
              والسؤال الأحمر إجابته خاطئة.
            </p>
          </div>

          <div className="review-list">
            {questions.map(
              (question, index) => {
                const userAnswer =
                  answers[index];

                const correct =
                  isCorrect(
                    question,
                    userAnswer
                  );

                return (
                  <article
                    key={index}
                    className={`review-question ${
                      correct
                        ? "review-correct"
                        : "review-wrong"
                    }`}
                  >
                    <div className="review-top">
                      <span className="review-number">
                        السؤال{" "}
                        {index + 1}
                      </span>

                      <span className="review-status">
                        {correct
                          ? "✓ إجابتك صحيحة"
                          : "✕ إجابتك خاطئة"}
                      </span>
                    </div>

                    <h3>
                      {question.question}
                    </h3>

                    <div className="answers-box">
                      <div>
                        <span>
                          إجابتك:
                        </span>

                        <strong>
                          {" "}
                          {normalizeAnswer(
                            userAnswer
                          )}
                        </strong>
                      </div>

                      {!correct && (
                        <div>
                          <span>
                            الإجابة الصحيحة:
                          </span>

                          <strong>
                            {" "}
                            {getCorrectAnswer(
                              question
                            )}
                          </strong>
                        </div>
                      )}
                    </div>

                    <button
                      className="explain-button"
                      onClick={() =>
                        explainQuestion(
                          question
                        )
                      }
                    >
                      💡 اشرح لي
                    </button>
                  </article>
                );
              }
            )}
          </div>
        </section>
      </main>

      <style jsx>{`
        * {
          box-sizing:
            border-box;
        }

        .result-page {
          min-height:
            100vh;

          padding:
            35px 18px
            70px;

          background:
            linear-gradient(
              180deg,
              #070c14,
              #0a1424
            );

          color: white;

          font-family:
            Arial,
            sans-serif;
        }

        .result-container {
          width: 100%;
          max-width:
            900px;
          margin:
            0 auto;
        }

        .result-card {
          position:
            relative;

          overflow:
            hidden;

          padding:
            40px 32px;

          border:
            1px solid
            #293951;

          border-radius:
            26px;

          background:
            #0d1726;

          text-align:
            center;
        }

        .celebration {
          font-size:
            45px;

          margin-bottom:
            17px;
        }

        .pill {
          display:
            inline-block;

          padding:
            8px 14px;

          border:
            1px solid
            #3d4d84;

          border-radius:
            999px;

          background:
            #141d3b;

          color:
            #bec9ff;

          font-size:
            13px;
        }

        .result-card h1 {
          margin:
            20px 0
            25px;

          font-size:
            37px;
        }

        .score-circle {
          width:
            195px;

          height:
            195px;

          margin:
            0 auto;

          display:
            flex;

          align-items:
            center;

          justify-content:
            center;

          border:
            12px solid
            #1c2940;

          border-radius:
            50%;
        }

        .score-circle strong {
          font-size:
            61px;
        }

        .score-circle span {
          margin-right:
            8px;

          color:
            #a8b6cc;

          font-size:
            23px;
        }

        .percentage {
          margin-top:
            17px;

          color:
            #8395ff;

          font-size:
            35px;

          font-weight:
            900;
        }

        .result-message {
          color:
            #b9c5da;

          font-size:
            17px;
        }

        .new-quiz-button,
        .return-button {
          width: 100%;

          min-height:
            58px;

          border-radius:
            15px;

          cursor:
            pointer;

          font-size:
            16px;
        }

        .new-quiz-button {
          margin-top:
            22px;

          border: 0;

          color: white;

          background:
            linear-gradient(
              90deg,
              #5963ef,
              #3d83ef
            );
        }

        .return-button {
          margin-top:
            12px;

          border:
            1px solid
            #304058;

          background:
            #111a29;

          color: white;
        }

        .review-section {
          margin-top:
            35px;
        }

        .review-heading {
          margin-bottom:
            20px;
        }

        .review-heading h2 {
          margin:
            0 0 8px;

          font-size:
            29px;
        }

        .review-heading p {
          margin: 0;

          color:
            #8a98b0;
        }

        .review-list {
          display:
            grid;

          gap:
            17px;
        }

        .review-question {
          padding:
            22px;

          border-radius:
            18px;
        }

        .review-correct {
          border:
            2px solid
            #22c55e;

          background:
            rgba(
              22,
              163,
              74,
              0.18
            );
        }

        .review-wrong {
          border:
            2px solid
            #ef4444;

          background:
            rgba(
              220,
              38,
              38,
              0.18
            );
        }

        .review-top {
          display:
            flex;

          justify-content:
            space-between;

          gap: 12px;

          margin-bottom:
            13px;
        }

        .review-number {
          color:
            #b0bdcf;

          font-size:
            13px;
        }

        .review-correct
        .review-status {
          color:
            #8cf0b0;

          font-weight:
            700;
        }

        .review-wrong
        .review-status {
          color:
            #ffabab;

          font-weight:
            700;
        }

        .review-question h3 {
          margin:
            0 0
            18px;

          font-size:
            21px;

          line-height:
            1.8;
        }

        .answers-box {
          display:
            grid;

          gap: 8px;

          margin-bottom:
            16px;

          padding:
            13px;

          border-radius:
            12px;

          background:
            rgba(
              0,
              0,
              0,
              0.16
            );

          line-height:
            1.8;
        }

        .answers-box span {
          color:
            #b9c4d6;
        }

        .explain-button {
          padding:
            11px 19px;

          border:
            1px solid
            #526bd2;

          border-radius:
            12px;

          background:
            #17264a;

          color: white;

          cursor:
            pointer;

          font-size:
            14px;
        }

        .explain-button:hover {
          background:
            #21356b;
        }

        .confetti {
          position:
            absolute;

          inset: 0;

          pointer-events:
            none;
        }

        .piece {
          position:
            absolute;

          top:
            -25px;

          width:
            9px;

          height:
            18px;

          border-radius:
            3px;

          animation:
            fall
            3.5s
            linear
            infinite;
        }

        .p1 {
          background:
            #f87171;
        }

        .p2 {
          background:
            #fbbf24;
        }

        .p3 {
          background:
            #34d399;
        }

        .p4 {
          background:
            #60a5fa;
        }

        .p5 {
          background:
            #c084fc;
        }

        .p6 {
          background:
            #fb7185;
        }

        @keyframes fall {
          0% {
            transform:
              translateY(
                -20px
              )
              rotate(
                0deg
              );

            opacity: 0;
          }

          10% {
            opacity: 1;
          }

          100% {
            transform:
              translateY(
                520px
              )
              rotate(
                500deg
              );

            opacity: 0;
          }
        }

        button:disabled {
          opacity: 0.6;

          cursor:
            not-allowed;
        }

        @media (
          max-width:
            700px
        ) {
          .review-top {
            flex-direction:
              column;
          }

          .result-card {
            padding:
              30px 18px;
          }

          .review-question {
            padding:
              18px;
          }
        }
      `}</style>
    </div>
  );
}
