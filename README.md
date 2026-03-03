# LAB-Guard - Exam Monitoring System

## 📁 Project Structure

```
LAB-Guard/
├── 📂 frontend/              # React + TypeScript UI
│   ├── src/                 # React components and services
│   ├── public/              # Static assets and AI models
│   ├── tsconfig.json        # TypeScript configuration
│   └── README.md            # Frontend documentation
│
├── 📂 backend/               # Electron + Node.js Backend
│   ├── app/                 # Electron main process
│   │   ├── main.js         # Main process entry
│   │   └── preload.js      # IPC bridge
│   ├── services/            # Backend services (12 services)
│   ├── scripts/             # Utility scripts
│   ├── data/                # SQLite database
│   └── README.md            # Backend documentation
│
├── 📂 assets/                # Application assets
├── 📂 build/                 # Production build output
├── 📂 config/                # Configuration files
├── 📄 package.json           # Dependencies and scripts
├── 📄 PROJECT-DOCUMENTATION.md  # Complete technical guide
└── 📄 FYP.pdf                # Project report
```

## 🚀 Quick Start

### Prerequisites
- Node.js v14 or higher
- Windows 10/11
- Webcam (for face authentication)

### Installation
```bash
npm install
```

### Development Mode
```bash
npm run dev
```
Runs React dev server on port 3001 and launches Electron.

### Production Build
```bash
npm run build
npm start
```

### Download Face Recognition Models
```bash
npm run download-models
```

## 📚 Documentation

- **[Frontend Documentation](frontend/README.md)** - React UI components and services
- **[Backend Documentation](backend/README.md)** - Electron services and architecture
- **[Complete Technical Guide](PROJECT-DOCUMENTATION.md)** - Full system documentation

## 🎯 Key Features

### Multi-Factor Authentication
- Username/password authentication
- Biometric face recognition (2FA)
- JWT token-based sessions
- Device fingerprinting

### Real-Time Monitoring
- Windows API integration
- Application switching detection
- Screenshot evidence capture
- Violation tracking and alerts

### Role-Based Access
- **Admin** - User management, system configuration
- **Teacher** - Exam creation, monitoring, reports
- **Student** - Exam participation with monitoring

### Programming Questions & AI Test Case Generation
- **AI-powered extraction** - Extract programming questions from PDF/Word exam documents (Groq API)
- **Automatic test case generation** - AI generates reference solution + test inputs; expected outputs come from **execution** (Judge0), not AI prediction
- **Multi-language support** - Python, C, C++, Java, JavaScript
- **3 best solutions** - Generate efficient, readable, and alternative approaches for each problem
- **Code execution sandbox** - Judge0 CE (free) runs student code in isolated containers
- **Input normalization** - Handles array inputs (JSON → space-separated) for reliable execution
- **Fill expected outputs** - Manual verification when needed

### Security Features
- bcrypt password hashing (12 rounds)
- Face embeddings (128-dimension vectors)
- Complete audit logging
- Offline-capable operation

## 🛠️ Technology Stack

### Frontend
- React 18 + TypeScript
- Face-API.js (TensorFlow.js)
- CSS3 for styling

### Backend
- Electron (Desktop framework)
- Node.js runtime
- SQLite database
- Windows API integration
- Groq AI (question extraction, test case generation)
- Judge0 CE (code execution sandbox)

### Security
- JWT authentication
- bcrypt encryption
- Biometric verification
- Audit trail logging

## 📦 Available Scripts

```bash
npm start              # Start production app
npm run dev            # Development mode
npm run build          # Build React app
npm run download-models # Download AI models
npm test               # Run tests
```

## 🔐 Security Protocols

- **Password Security**: bcrypt with 12 salt rounds
- **Face Recognition**: 128-dimension embeddings, no images stored
- **Session Management**: JWT tokens with 8-hour expiration
- **Monitoring**: System-level Windows API, can't be bypassed
- **Audit Logging**: Complete traceability of all actions

## 📊 Database Schema

- **users** - User accounts with roles
- **exams** - Exam configurations
- **programming_questions** - Coding problems with problem text, language
- **question_test_cases** - Input/output pairs for auto-grading
- **code_submissions** - Student code submissions
- **submission_results** - Per-test-case pass/fail results
- **face_embeddings** - Biometric data
- **events** - Monitoring events
- **app_violations** - Application violations
- **audit_logs** - Security audit trail

## 🎓 Use Cases

- University computer lab exams
- Online certification tests
- Remote learning assessments
- Corporate training evaluations

## 📝 License

Proprietary - LAB-Guard Development Team

## 🤝 Support

For technical documentation, see:
- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
- [Technical Documentation](PROJECT-DOCUMENTATION.md)

---

**Version:** 1.0.0  
**Platform:** Windows 10/11  
**Framework:** Electron + React
