# 🧠 AI-Powered Code Review Assistant

A full-stack platform that performs intelligent static code analysis and provides actionable, AI-generated explanations, improvements, and documentation links — designed to help developers write better code faster.

---

## 🧩 Features by Phase

### ✅ Phase 1: Project Setup & Core Backend
- FastAPI backend scaffolded
- Code upload & analysis endpoints
- Integrated static analysis tools:
  - `pylint`, `bandit`, `semgrep` (Python)
  - `eslint` (JavaScript/TypeScript)
- Returns structured issue metadata

### ✅ Phase 2: Core Frontend & User Flow
- React frontend scaffolded
- Monaco Editor for code editing
- Displays linting results and AI explanations
- Connected to FastAPI backend

### ✅ Phase 3: AI-Powered Explanations
- Integrated **Google Gemini API**
- Generates clear, professional explanations in natural language
- Works for Python, JavaScript, JSX, TSX, Java, C, C++
- Prompts engineered to deliver numbered, clean explanations

### ✅ Phase 4: Actionable Feedback & UX
- Provides example fixes and suggestions
- Shows docs/tutorial links for each issue

### ✅ Phase 5: Advanced Features
- ✅ **Interactive Chatbot:** Users can ask follow-up questions like "Why is this an issue?" or "Show me a fix."
- ✅ **GitHub Integration:** Users can paste GitHub repo/PR/file URLs and receive full code reviews

---

## 🎯 Tech Stack

| Layer       | Technology                    |
|------------|-------------------------------|
| **Frontend** | React.js, Vite, TailwindCSS, Monaco Editor |
| **Backend**  | FastAPI, Python, Gemini API, Semgrep |
| **Linting Tools** | `pylint`, `eslint`, `bandit`, `semgrep` |
| **AI**       | Gemini Pro (Google Generative AI) |
| **Extras**   | GitHub API, Chat UI, REST APIs |

---

## 📁 Folder Structure

```bash
code-review-assistant/
│
├── backend/                 # FastAPI app with analysis & LLM logic
│   ├── app/
│   │   ├── api/
│   │   ├── ai_explanation.py
│   │   └── analysis.py
│   └── .env                 # NOT committed
│
├── frontend/                # React app with Monaco Editor
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   └── .env                 # NOT committed
│
└── README.md

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/NitinN24/AI-Powered-Code-Review-Assistant.git
cd AI-Powered-Code-Review-Assistant
```

---

### 2. Backend Setup (FastAPI)

```bash
cd backend
python -m venv venv
# Activate virtual environment:
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

pip install -r requirements.txt

# Add your Gemini API key to .env
echo "GEMINI_API_KEY=your_key_here" > .env

# Run the backend server
uvicorn app.main:app --reload
```

---

### 3. Frontend Setup (React + Vite)

```bash
cd frontend
npm install

# Add backend API URL to frontend/.env
echo "VITE_API_URL=http://localhost:8000" > .env

# Run the frontend server
npm run dev
```

---

## 📦 Environment Variables

Create `.env` files in both `backend/` and `frontend/`.

### ✅ `backend/.env`

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### ✅ `frontend/.env`

```env
VITE_API_URL=http://localhost:8000
```

> ⚠️ Never commit these `.env` files. Use `.env.example` for sharing structure without secrets.

---

## 🙋‍♂️ Author

**Nitin Nadar**  
🔗 [LinkedIn](https://linkedin.com/in/yourname) • 📫 [Email](mailto:youremail@example.com) • 🧠 [Portfolio](https://yourportfolio.com)

---

## 📝 License

MIT License — use freely, credit appreciated!

---

## ⭐️ Support & Feedback

If you liked this project, consider giving it a ⭐ on GitHub!  
Found a bug or have a feature request? Open an issue or submit a PR.
