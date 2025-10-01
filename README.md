# LAB-Guard Phase 1

LAB-Guard is an exam monitoring system for university computer labs. This Phase 1 implementation provides a working prototype with teacher/student authentication, basic app monitoring, and role-based dashboards.

## Project Structure

```
LAB-Guard/
├── app/                     # Electron main process
│   ├── main.js             # Main Electron process with security best practices
│   └── preload.js          # Secure context bridge for renderer communication
├── src/                    # React frontend (renderer process)
│   ├── components/         # React components
│   ├── App.tsx            # Main App component
│   └── index.tsx          # React entry point
├── services/              # Backend services
│   ├── auth.js           # Authentication service
│   ├── database.js       # SQLite database operations
│   ├── monitoring.js     # Application monitoring
│   └── files.js          # File management
├── config/               # Configuration files
│   └── app-config.json   # Application settings
├── data/                 # Local data storage
│   ├── uploads/          # PDF file storage
│   └── database.sqlite   # SQLite database (created at runtime)
└── assets/              # Application assets
```

## Technology Stack

- **Frontend**: React with TypeScript
- **Backend**: Node.js (Electron main process)
- **Database**: SQLite with better-sqlite3
- **Authentication**: JWT tokens with bcrypt password hashing
- **Desktop Framework**: Electron
- **Build Tool**: electron-builder

## Development Setup

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation
```bash
npm install
```

### Development
```bash
# Start React development server and Electron
npm run dev

# Start only React development server
npm run dev:react

# Start only Electron (requires React to be running)
npm start
```

### Building
```bash
# Build React app for production
npm run build

# Build Electron executable
npm run build:electron

# Build both React and Electron
npm run dist
```

## Security Features

- Context isolation enabled
- Node integration disabled in renderer
- Preload script for secure IPC communication
- Content Security Policy configured
- External navigation blocked
- Remote module disabled

## Requirements Addressed

This setup addresses the following requirements from the specification:

- **Requirement 5.1**: Local SQLite database initialization structure
- **Security best practices**: Electron security configuration
- **Cross-platform compatibility**: Windows-focused with NSIS installer

## Next Steps

The following tasks will implement the core functionality:

1. Database service and schema (Task 2)
2. Authentication system (Task 3)
3. Login UI component (Task 4)
4. Teacher dashboard and exam creation (Task 5)
5. Student dashboard and exam participation (Task 6)
6. Application monitoring service (Task 7)

## Development Notes

- The project uses legacy peer deps to resolve React Scripts compatibility
- Admin privileges are requested during installation for monitoring capabilities
- All services are currently placeholder files that will be implemented in subsequent tasks