# Terrific QA 🧪

<div align="center">

**Intelligent QA Testing Platform with Session Recording and Automated Analysis**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-45ba4b.svg)](https://playwright.dev/)

</div>

---

## 📋 Description

**Terrific QA** is a fullstack application designed to revolutionize manual testing processes. It allows you to record test sessions in real-time, capturing every user interaction, console logs, network requests, and session video. Additionally, it integrates intelligent analysis capabilities through LLM to automatically generate reports and detect patterns.

### ✨ Key Features

- 🎥 **Complete Session Recording**: Captures video, user actions, console logs, and network traffic
- 🔄 **Real-Time Updates**: WebSocket for live event streaming
- 🧠 **Intelligent LLM Analysis**: Automatic context generation and bug reports
- 🎯 **Smart Crawling**: Automatic DOM capture with SmartDiff for token optimization
- 📊 **Interactive Timeline**: Temporal visualization of all captured events
- 🏷️ **Profile Management**: Save and reuse browser configurations with credentials
- 🔍 **Advanced Filters**: Filter events by type, errors, crawls, and more
- 📝 **Notes and Flags**: Add annotations and markers during tests
- 🌓 **Dark Mode**: Minimalist Apple-inspired interface with dark mode support
- 💾 **Context Export**: Generate optimized context for LLMs with applied filters

---

## 🏗️ Project Architecture

```
terrific-qa/
├── frontend/              # React 19 + Vite + TypeScript
│   ├── components/        # UI components and features
│   │   ├── ui/           # Base components (Button, Card, etc.)
│   │   ├── layout/       # Layout and Header
│   │   └── features/     # ActivityFeed, SessionReplay, etc.
│   ├── src/              # Application logic
│   └── public/           # Static assets
│
├── backend/              # Node.js + Express + Playwright
│   ├── src/
│   │   ├── controllers/  # Endpoint logic
│   │   ├── services/     # Playwright, SmartDiff, Crawler
│   │   ├── models/       # Types and data models
│   │   └── utils/        # Utilities
│   └── dist/             # Compiled build
│
├── sessions/             # Saved session data (JSON + videos)
├── credentials.json      # Saved browser profiles
└── docs/                 # Documentation and specifications
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **PowerShell** (for Windows)

### Installation

#### 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/terrific-qa.git
cd terrific-qa
```

#### 2️⃣ Configure Environment Variables

Create a `.env` file in the project root:

```env
# Backend Configuration
PORT=3001
NODE_ENV=development

# OpenAI Configuration (optional, for LLM analysis)
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Session Configuration
SESSION_STORAGE_PATH=./sessions
CREDENTIALS_PATH=./credentials.json
```

#### 3️⃣ Install and Run Backend

```powershell
cd backend
npm install
npx playwright install chromium
npm run dev
```

Backend will be available at `http://localhost:3001`

#### 4️⃣ Install and Run Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`

---

## 📖 Usage Guide

### 1. Create a New Session

1. Open the application in your browser
2. Configure recording options:
   - ✅ Record user actions
   - ✅ Record console logs
   - ✅ Record network requests
   - ✅ Record video (optional)
   - ✅ Smart auto-crawl
3. Enter the initial URL to test
4. Click **"Start Session"**

### 2. During the Session

- A browser will open automatically
- Interact normally with the web application
- All events are captured in real-time
- Add **notes**, **flags**, or **bug reports** from the side panel
- The system will perform automatic crawls when detecting significant DOM changes

### 3. Finish and Review

- Click **"End Session"**
- Review the event timeline
- Play back the video synchronized with events
- Export context for LLM analysis
- Apply filters to focus on errors or specific events

---

## 🎯 Advanced Features

### SmartDiff for Crawls

The system uses an intelligent diff algorithm to optimize storage and context generation:

- **Change Detection**: Only saves differences between consecutive crawls
- **Blank Line Compression**: Removes redundancies while maintaining semantics
- **Automatic Decision**: Chooses between diff or full snapshot based on token efficiency

### Browser Profile Management

- Save browser configurations with cookies and localStorage
- Automatically reuse login credentials
- Launch configurator to create new profiles

### Smart Filters

- **All Errors**: Groups console, network, and server errors
- **Crawls Only**: Visualize only DOM captures
- **Network Events**: Filter HTTP requests
- **Console Logs**: Show only browser logs

### Context Export for LLM

Generates an optimized context file that includes:
- Session metadata
- Filtered events based on selection
- Crawls with SmartDiff applied
- TOON format for maximum readability

---

## 🛠️ Technology Stack

### Frontend
- **React 19** - UI Framework
- **TypeScript** - Static typing
- **Vite** - Build tool and dev server
- **Lucide React** - Icons
- **React Router** - Navigation

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **TypeScript** - Static typing
- **Playwright** - Browser automation
- **WebSocket (ws)** - Real-time communication
- **Turndown** - HTML to Markdown conversion
- **Diff** - Diff algorithm
- **TOON Format** - Serialization format

### Testing
- **Vitest** - Testing framework

---

## 📚 Additional Documentation

- [Design Specifications](./docs/design-specifications.md) - Complete UI/UX guide
- [Smart Autocrawl Plan](./docs/tasks/plan-autocrawl-inteligente.md) - Crawling system details

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow the design specifications in `docs/design-specifications.md`
- Maintain TypeScript code with strict typing
- Add tests for new features
- Document significant changes

---

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 👥 Author

**Rodrigo Garciaguirre**

---

## 🙏 Acknowledgments

- [Playwright](https://playwright.dev/) for the excellent automation tool
- [React](https://reactjs.org/) for the UI framework
- [OpenAI](https://openai.com/) for LLM analysis capabilities
- The open source community for the amazing tools

---

## 📧 Contact

Questions or suggestions? Open an issue on GitHub.

---

<div align="center">

**Made with ❤️ to improve the QA process**

</div>
