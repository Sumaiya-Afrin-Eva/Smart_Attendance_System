import json
import base64
import os
import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel('gemini-3.5-flash-lite')

# Let's see what the latest user uploaded image is
image_path = "/Users/sumaiyaafrineva/.gemini/antigravity-ide/brain/628a68e1-d26a-4321-beb7-a1ca9f623085/.user_uploaded/media_1791301880421.png"
if not os.path.exists(image_path):
    print("Cannot find image")
else:
    with open(image_path, "rb") as f:
        file_content = f.read()

    prompt = """
    Extract all the courses listed in this document.
    Return ONLY a valid JSON array of objects, with no markdown formatting and no extra text.
    Each object MUST have the following string/number keys exactly:
    - "code": The course code (e.g. "CSE 3101"). Must have space between letters and numbers.
    - "title": The title of the course.
    - "credit": A float representing the credits (e.g. 3.0, 1.5).
    - "department": The department abbreviation (e.g. "CSE", "EEE", "ME").
    - "semester": The semester formatted as "{year}-{term}" (e.g. "3-2", "1-1").
    - "course_type": "Theory" or "Lab".
    - "session": The academic session (e.g. "2025-2026").
    
    If any field is missing, try to infer it from the document context (e.g., infer department from course code prefix CSE -> CSE). 
    Default session to "2025-2026" if not mentioned. 
    Default course_type to "Theory" if not mentioned, unless title contains "Lab" or "Sessional", then "Lab".
    """
    
    resp = model.generate_content([{"mime_type": "image/png", "data": file_content}, prompt])
    print(resp.text)
