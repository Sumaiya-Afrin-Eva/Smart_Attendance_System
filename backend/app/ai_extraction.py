import json
import re

import google.generativeai as genai

from .config import settings

GEMINI_MODEL = "gemini-3.8-flash"


def _semester_from_heading(match_text: str) -> str:
    text = match_text.lower().replace("&", " and ")
    year = None
    term = None

    if "1st" in text or "first" in text:
        year = 1
    elif "2nd" in text or "second" in text:
        year = 2
    elif "3rd" in text or "third" in text:
        year = 3
    elif "4th" in text or "fourth" in text:
        year = 4

    if "1st" in text or "first" in text:
        term = 1
    elif "2nd" in text or "second" in text:
        term = 2
    elif "3rd" in text or "third" in text:
        term = 3
    elif "4th" in text or "fourth" in text:
        term = 4

    if year and term:
        return f"{year}-{term}"
    return "3-2"


def _extract_courses_from_text(text: str) -> list[dict]:
    """Fallback parser tuned for curriculum tables like engineering course catalogs."""
    cleaned = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if not cleaned:
        return []

    semester_headings = list(re.finditer(
        r"(?:1st|2nd|3rd|4th|first|second|third|fourth)\s*(?:year|yr)\s*(?:1st|2nd|3rd|4th|first|second|third|fourth)\s*(?:term|semester)",
        cleaned,
        flags=re.I,
    ))

    course_matches = []
    # First pass: look for explicit keyword: value blocks (OCR'd key-value pairs)
    # e.g. "Course code: CSE 1101", "Course title: Structured Programming", "Credit: 3.0",
    # Accept loose keys and common OCR mistakes: e.g. "Code:", "C0DE:", "Title-", "Cred1t:", "Dept:"
    key_variants = {
        r"course\s*code": "course code",
        r"code": "course code",
        r"c0de": "course code",
        r"course\s*title": "course title",
        r"title": "course title",
        r"t1tle": "course title",
        r"credit": "credit",
        r"cred1t": "credit",
        r"credits": "credit",
        r"dept(?:\.|artment)?": "department",
        r"department": "department",
        r"sem(?:ester)?": "semester",
        r"term": "semester",
        r"type": "type",
        r"lab/theory": "type",
    }

    kv_re = re.compile(r"^(?P<key>[^:\-]{1,40})\s*[:\-]\s*(?P<value>.+)$")
    kv_entries = []
    for line in cleaned.splitlines():
        m = kv_re.search(line)
        if not m:
            continue
        raw_key = m.group('key').strip().lower()
        # normalize common OCR substitutions
        raw_key_norm = raw_key.replace('0', 'o').replace('1', 'i').replace('@', 'a')
        mapped = None
        for pat, canonical in key_variants.items():
            if re.search(pat, raw_key_norm, flags=re.I):
                mapped = canonical
                break
        if mapped:
            kv_entries.append((mapped, m.group('value').strip()))

    # If we found a sequence of key/value pairs, group them into course objects.
    if kv_entries:
        grouped = []
        current = {}
        for key, val in kv_entries:
            if key == 'course code' and current:
                # start of a new course
                grouped.append(current)
                current = {}
            current[key] = val
        if current:
            grouped.append(current)

        for item in grouped:
            code = item.get('course code')
            title = item.get('course title') or item.get('title') or code
            credit_raw = item.get('credit') or ''
            credit_match = re.search(r"(\d+(?:\.\d+)?)", credit_raw)
            credit = float(credit_match.group(1)) if credit_match else 3.0
            dept = (item.get('department') or '').upper() or (re.sub(r"\d+", "", code).strip().upper() if code else 'CSE')
            sem_raw = item.get('semester') or ''
            # normalize semester keywords like "1st Year 1st Term" or "2-1"
            sem_match = re.search(r"(\d)\s*[-/]\s*(\d)", sem_raw)
            if sem_match:
                semester = f"{sem_match.group(1)}-{sem_match.group(2)}"
            else:
                # fallback to heading mapping
                heading_match = re.search(r"(1st|2nd|3rd|4th).*?(1st|2nd|3rd|4th)", sem_raw, flags=re.I)
                semester = _semester_from_heading(sem_raw) if heading_match else '3-2'

            ctype = 'Lab' if re.search(r"lab|laboratory|sessional|project|design", (item.get('type') or title).lower()) else 'Theory'
            course_matches.append({
                'code': re.sub(r"\s+", " ", code).strip() if code else title,
                'title': title,
                'credit': credit,
                'department': dept,
                'semester': semester,
                'course_type': ctype,
                'session': '2025-2026',
            })

    # Continue to table/line based code detection as a fallback
    code_pattern = r"\b[A-Z]{2,6}\s*\d{3,5}\b"
    for match in re.finditer(code_pattern, cleaned):
        code = re.sub(r"\s+", " ", match.group(0)).strip()
        snippet_start = match.start()
        snippet_end = min(len(cleaned), snippet_start + 400)
        snippet = cleaned[snippet_start:snippet_end]

        semester = "3-2"
        for heading in reversed(semester_headings):
            if heading.start() < match.start():
                semester = _semester_from_heading(heading.group(0))
                break

        title_prefix = snippet[match.end() - snippet_start:]
        title_prefix = re.sub(r"^\s*[:\-–—]", "", title_prefix)
        title_prefix = title_prefix.split("hrs/wk", 1)[0].split("hrs", 1)[0]
        title_prefix = title_prefix.split("credit", 1)[0].split("credits", 1)[0]
        title_prefix = title_prefix.strip(" ,;:-–—")

        title = "".join(ch for ch in title_prefix if ch not in "\n\r")
        title = re.sub(r"\s+", " ", title).strip()

        if not title:
            title = code

        credit_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:credits?|credit)", snippet, flags=re.I)
        credit = float(credit_match.group(1)) if credit_match else 3.0

        dept = re.sub(r"\d+", "", code).strip().upper()
        if not dept:
            dept = "CSE"

        title_lower = title.lower()
        course_type = "Lab" if re.search(r"\b(lab|laboratory|sessional|project|design)\b", title_lower) else "Theory"

        course_matches.append({
            "code": code,
            "title": title,
            "credit": credit,
            "department": dept,
            "semester": semester,
            "course_type": course_type,
            "session": "2025-2026",
        })

    # Deduplicate repeated OCR/data duplicates.
    unique = {}
    for course in course_matches:
        unique[course["code"].upper()] = course
    return list(unique.values())


def extract_courses_from_file(file_content: bytes, mime_type: str) -> list[dict]:
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not configured in backend.")

    mime_type = mime_type or "application/octet-stream"
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)

    prompt = """
    Extract all the courses from this curriculum document.
    This is a university course table, not free-form prose.
    Return ONLY a valid JSON array of objects, with no markdown formatting and no extra text.
    Each object MUST have these exact keys:
    - "code": course code such as "CSE 1101" or "EEE 2107". Always include a space between letters and numbers.
    - "title": the full course title
    - "credit": numeric credit value like 3.0 or 1.5
    - "department": abbreviation like "CSE", "EEE", "ME"
    - "semester": format as "1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", or "4-2"
    - "course_type": "Theory" or "Lab"
    - "session": e.g. "2025-2026"

    Important parsing rules for this document:
    - Map academic headings like "1st Year 1st Term" to "1-1", "2nd Year 1st Term" to "2-1", "3rd Year 1st Term" to "3-1", "4th Year 1st Term" to "4-1".
    - If a course row is in "1st Year 2nd Term", use "1-2".
    - Infer department from the course code prefix.
    - Use "Lab" when the title or nearby text mentions Lab, Laboratory, Sessional, Project, or Design; otherwise use "Theory".
    - Default to "2025-2026" when the session is missing.
    - Do not include any extra commentary outside the JSON array.
    """

    contents = [
        {"text": prompt},
        {"inline_data": {"mime_type": mime_type, "data": file_content}},
    ]

    try:
        response = model.generate_content(
            contents=contents,
            generation_config={"temperature": 0.0},
        )
    except Exception as e:
        message = str(e)
        if "429" in message or "quota" in message.lower() or "free tier" in message.lower():
            try:
                text = file_content.decode("utf-8", errors="ignore")
            except Exception:
                text = ""
            fallback = _extract_courses_from_text(text)
            if fallback:
                return fallback
            raise ValueError("You have exceeded the Free Tier quota limit for Gemini AI. Please wait about 30 seconds and try again!") from e
        if "Unable to process input image" in message or "unsupported" in message.lower():
            try:
                text = file_content.decode("utf-8", errors="ignore")
            except Exception:
                text = ""
            fallback = _extract_courses_from_text(text)
            if fallback:
                return fallback
            raise ValueError(
                "The uploaded file could not be processed by Gemini. Please upload a clear PDF, JPG, or PNG image of the course list."
            ) from e
        raise e

    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        fallback = _extract_courses_from_text(text)
        if fallback:
            return fallback
        raise ValueError("Failed to parse AI response as JSON.")
