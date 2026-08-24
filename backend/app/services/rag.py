import json
import os
import re


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)

STORE_PATH = os.path.join(
    BASE_DIR,
    "rag_store.json",
)


def load_store():
    if not os.path.exists(STORE_PATH):
        return []

    try:
        with open(
            STORE_PATH,
            "r",
            encoding="utf-8",
        ) as file:
            return json.load(file)

    except Exception:
        return []


def save_store(data):
    with open(
        STORE_PATH,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )


def split_text(
    text: str,
    chunk_size: int = 700,
    overlap: int = 100,
):
    chunks = []

    start = 0

    while start < len(text):
        end = start + chunk_size

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def normalize_words(text: str):
    text = text.lower()

    words = re.findall(
        r"[\w\u0600-\u06FF]+",
        text,
    )

    return set(words)


def add_document(
    topic_id: int,
    file_id: int,
    filename: str,
    text: str,
):
    chunks = split_text(text)

    if not chunks:
        return

    store = load_store()

    store = [
        item
        for item in store
        if item.get("file_id") != file_id
    ]

    for index, chunk in enumerate(chunks):
        store.append(
            {
                "topic_id": topic_id,
                "file_id": file_id,
                "filename": filename,
                "chunk_index": index,
                "text": chunk,
            }
        )

    save_store(store)


def search_topic(
    topic_id: int,
    question: str,
    limit: int = 4,
):
    store = load_store()

    topic_chunks = [
        item
        for item in store
        if item.get("topic_id") == topic_id
    ]

    if not topic_chunks:
        return []

    question_words = normalize_words(
        question
    )

    scored_chunks = []

    for item in topic_chunks:
        chunk_text = item.get(
            "text",
            "",
        )

        chunk_words = normalize_words(
            chunk_text
        )

        common_words = (
            question_words
            & chunk_words
        )

        score = len(common_words)

        scored_chunks.append(
            (
                score,
                chunk_text,
            )
        )

    scored_chunks.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    results = [
        text
        for score, text in scored_chunks
        if score > 0
    ]

    if not results:
        results = [
            item.get("text", "")
            for item in topic_chunks[:limit]
        ]

    return results[:limit]


def delete_file_chunks(
    file_id: int,
):
    store = load_store()

    store = [
        item
        for item in store
        if item.get("file_id") != file_id
    ]

    save_store(store)


def build_grounded_prompt(
    question: str,
    file_context: str = "",
    notes_context: str = "",
    topic_title: str = "",
    topic_description: str = "",
):
    """
    Build a study-assistant prompt.

    Priority:
    1. Uploaded files
    2. Student notes
    3. Topic title / description
    4. General knowledge only when needed
    """

    return f"""
أنت مساعد دراسي ذكي.

مهمتك هي مساعدة الطالب على فهم المحتوى الموجود أمامك.

قواعد أساسية:

1. إذا كان هناك محتوى في قسم "محتوى المصدر"،
فهذا المحتوى هو المصدر الأساسي للإجابة.

2. إذا كانت الإجابة موجودة في محتوى المصدر،
اعتمد عليها مباشرة.

3. لا تقل للمستخدم:
"بناءً على الملف"
أو:
"حسب الملف"
أو:
"وفقًا للملف"
أو:
"المعلومة الموجودة في الملف"
أو أي عبارة مشابهة.

4. لا تذكر أن لديك ملفًا أو أنك تستخدم RAG
إلا إذا سأل المستخدم صراحة عن مصدر الإجابة.

5. أجب بشكل طبيعي ومباشر
وكأنك تشرح المعلومة للطالب.

6. لا تصحح محتوى المصدر من تلقاء نفسك.

7. لا تقل إن معلومة المصدر:
خاطئة
أو غير دقيقة
أو غير علمية
أو متعارضة مع المعرفة العامة.

8. لا تقارن محتوى المصدر بمعرفتك العامة
إلا إذا طلب المستخدم صراحة التحقق من صحة المعلومة.

9. إذا طلب المستخدم:
هل هذه المعلومة صحيحة؟
أو:
تحقق من المعلومة
أو:
صحح المعلومة
أو:
راجع المعلومات
أو:
هل يوجد خطأ؟

عندها فقط يمكنك التحقق من صحة المعلومة
واستخدام المعرفة العامة للمقارنة والتصحيح.

10. إذا لم توجد الإجابة في محتوى المصدر
ولا في ملاحظات الطالب،
يمكنك استخدام المعرفة العامة للإجابة.

11. إذا استخدمت معرفة عامة لأن المعلومة غير موجودة في المصدر،
لا تدّعِ أنها مأخوذة من المصدر.

12. عند طلب الشرح:
اشرح ببساطة ووضوح.
استخدم أمثلة سهلة عند الحاجة.
لا تنتقد المحتوى.
لا تصححه من تلقاء نفسك.

13. عند طلب التلخيص:
لخص المحتوى الموجود فقط.
لا تضف تصحيحات أو مراجعات علمية.

14. عند طلب الاختبار:
أنشئ الأسئلة والإجابات
اعتمادًا على المحتوى الموجود في المصدر.

15. استخدم العربية إذا كان المستخدم يتحدث بالعربية.

16. اجعل الإجابة مختصرة وواضحة
إلا إذا طلب المستخدم شرحًا مفصلًا.

قواعد التنسيق:

17. لا تستخدم Markdown.

18. لا تستخدم النجمة:
*

19. لا تستخدم نجمتين:
**

20. لا تستخدم عناوين Markdown مثل:
#
##
###

21. لا تستخدم علامات backticks.

22. لا تستخدم تنسيق bold أو italic.

23. إذا احتجت إلى ترتيب المعلومات،
استخدم أرقامًا عادية مثل:
1.
2.
3.

أو استخدم شرطة عادية:
-

24. اجعل النص النهائي نظيفًا ومناسبًا للعرض مباشرة داخل الشات.


عنوان الموضوع:
{topic_title}


وصف الموضوع:
{topic_description}


ملاحظات الطالب:
{notes_context}


محتوى المصدر:
{file_context}


سؤال الطالب:
{question}


أجب الآن مباشرة.

لا تبدأ الإجابة بعبارات مثل:
"بناءً على الملف"
أو:
"حسب المحتوى المرفق".

لا تستخدم Markdown أو نجوم في الإجابة.
""".strip()