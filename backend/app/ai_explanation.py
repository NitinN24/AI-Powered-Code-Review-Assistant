import os
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from .env file if present
load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("Missing GOOGLE_API_KEY environment variable.")

genai.configure(api_key=API_KEY)
MODEL_NAME = "gemini-1.5-flash"  # Change to "gemini-1.5-pro" for higher quality, fewer free requests

model = genai.GenerativeModel(MODEL_NAME)

class GeminiModelInstance:
    def explain(self, prompt):
        try:
            response = model.generate_content(prompt)
            return response.text.strip() if hasattr(response, "text") else str(response).strip()
        except Exception as e:
            return f"Gemini API Error: {e}"

model_instance = GeminiModelInstance()