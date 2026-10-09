import json
import base64
import os
import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel('gemini-3.5-flash')

# Let's find BulkCourses.jpg in the user uploaded directory if it exists
import glob
files = glob.glob("/Users/sumaiyaafrineva/.gemini/antigravity-ide/brain/628a68e1-d26a-4321-beb7-a1ca9f623085/.user_uploaded/*.png")
image_path = files[-1] if files else None

if not image_path or not os.path.exists(image_path):
    print("Cannot find image")
else:
    with open(image_path, "rb") as f:
        file_content = f.read()

    prompt = """
    Extract ALL the courses listed in this document. There are many courses, do not stop early.
    Return ONLY a valid JSON array of objects, with no markdown formatting and no extra text.
    """
    try:
        resp = model.generate_content(
            [{"mime_type": "image/png", "data": file_content}, prompt],
            generation_config=genai.GenerationConfig(max_output_tokens=8192)
        )
        print("Tokens used:", resp.usage_metadata if hasattr(resp, 'usage_metadata') else "Unknown")
        print("Length:", len(resp.text))
        print("Start:", resp.text[:100])
        print("End:", resp.text[-100:])
    except Exception as e:
        print("Error:", e)
