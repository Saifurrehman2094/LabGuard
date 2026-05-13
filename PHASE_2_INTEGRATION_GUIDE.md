# Phase 2 Integration Guide

## Quick Start: Add Upload Component to Teacher Dashboard

### Step 1: Import Component

Open `frontend/src/components/TeacherDashboard.tsx` and add:

```typescript
import TeacherExamUpload from "./TeacherExamUpload";
```

### Step 2: Add State

Add these state variables near the top of your component:

```typescript
const [showUploadModal, setShowUploadModal] = useState(false);
const [exams, setExams] = useState([]);
const [isLoadingExams, setIsLoadingExams] = useState(false);
```

### Step 3: Create Fetch Function

Add function to refresh exams:

```typescript
const fetchExams = async () => {
  setIsLoadingExams(true);
  try {
    const response = await axios.get(
      "http://localhost:5000/api/exams/available",
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );
    setExams(response.data.exams);
  } catch (error) {
    console.error("Failed to fetch exams:", error);
  } finally {
    setIsLoadingExams(false);
  }
};

// Call when component loads
useEffect(() => {
  fetchExams();
}, [authToken]);
```

### Step 4: Add Upload Button

In your JSX, add button to open upload:

```typescript
<button
  onClick={() => setShowUploadModal(true)}
  className="btn btn-primary"
>
  + Upload New Exam
</button>
```

### Step 5: Render Upload Component

Add this in your return JSX:

```typescript
{showUploadModal && (
  <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <TeacherExamUpload
        token={authToken}
        onUploadSuccess={(exam) => {
          console.log('Exam uploaded:', exam);
          setShowUploadModal(false);
          // Refresh exams list
          fetchExams();
        }}
      />
    </div>
  </div>
)}
```

### Step 6: Add Modal Styling (Optional)

Add to your CSS:

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-height: 90vh;
  overflow-y: auto;
  max-width: 900px;
  width: 90%;
}
```

---

## Full Example Integration

Here's a complete `TeacherDashboard.tsx` integration:

```typescript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TeacherExamUpload from './TeacherExamUpload';
import './TeacherDashboard.css';

const TeacherDashboard = ({ authToken }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [exams, setExams] = useState([]);
  const [isLoadingExams, setIsLoadingExams] = useState(false);
  const [activeTab, setActiveTab] = useState('exams');

  // Fetch exams on load
  useEffect(() => {
    fetchExams();
  }, [authToken]);

  const fetchExams = async () => {
    setIsLoadingExams(true);
    try {
      const response = await axios.get(
        'http://localhost:5000/api/exams/available',
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );
      setExams(response.data.exams || []);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setIsLoadingExams(false);
    }
  };

  const handleExamUploadSuccess = (exam) => {
    console.log('Exam uploaded successfully:', exam);
    setShowUploadModal(false);
    // Refresh exams list
    fetchExams();
  };

  return (
    <div className="teacher-dashboard">
      <div className="dashboard-header">
        <h1>Teacher Dashboard</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowUploadModal(true)}
        >
          + Upload New Exam
        </button>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === 'exams' ? 'active' : ''}`}
          onClick={() => setActiveTab('exams')}
        >
          My Exams
        </button>
        <button
          className={`tab ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          Student Submissions
        </button>
        <button
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>

      {/* Exams Tab */}
      {activeTab === 'exams' && (
        <div className="tab-content">
          {isLoadingExams ? (
            <div className="loading">Loading exams...</div>
          ) : exams.length === 0 ? (
            <div className="empty-state">
              <p>No exams yet. Upload your first exam to get started!</p>
            </div>
          ) : (
            <div className="exams-grid">
              {exams.map((exam) => (
                <div key={exam.exam_id} className="exam-card">
                  <h3>{exam.title}</h3>
                  <p className="exam-description">{exam.description}</p>
                  <div className="exam-meta">
                    <span>
                      Duration: <strong>{exam.duration_minutes} min</strong>
                    </span>
                    <span>
                      Questions: <strong>{exam.questions_count || 0}</strong>
                    </span>
                  </div>
                  {exam.pdf_url && (
                    <p className="exam-status">✓ PDF Uploaded</p>
                  )}
                  <div className="exam-actions">
                    <button className="btn btn-secondary btn-small">
                      View Details
                    </button>
                    <button className="btn btn-secondary btn-small">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-close">
              <button
                className="close-button"
                onClick={() => setShowUploadModal(false)}
              >
                ✕
              </button>
            </div>
            <TeacherExamUpload
              token={authToken}
              onUploadSuccess={handleExamUploadSuccess}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
```

---

## Testing the Integration

### 1. Start the Backend

```bash
npm run api:start
```

### 2. Start the React Development Server

```bash
cd frontend
npm start
```

### 3. Navigate to Teacher Dashboard

1. Login with teacher account
2. Find "Upload New Exam" button
3. Click to open upload modal
4. Fill in exam details:
   - Title: "Test Exam"
   - Description: "A test exam"
   - Duration: 120 minutes
   - PDF: Select any PDF file
   - Add 2-3 questions with test cases
5. Click "Next" through steps
6. Review and submit
7. Verify exam appears in the exams list

---

## Verification Checklist

- [ ] Backend server running on port 5000
- [ ] Database initialized (tables created)
- [ ] React frontend starts without errors
- [ ] Can login as teacher
- [ ] Upload button visible in teacher dashboard
- [ ] Can fill exam details form
- [ ] Can add multiple questions and test cases
- [ ] Can select and upload PDF file
- [ ] File upload progress shows during upload
- [ ] Upload succeeds and shows success message
- [ ] Exam appears in exams list
- [ ] Can click "Upload Another Exam" and repeat

---

## Styling Notes

The `TeacherExamUpload` component includes all necessary CSS in `TeacherExamUpload.css`.

If you want to customize:

1. **Modal Styling**: Update `.modal-overlay` and `.modal-content` in your dashboard CSS
2. **Button Colors**: Update `.btn-primary` colors to match your theme
3. **Spacing**: Adjust padding/margins in `.exam-upload-container`

The component is responsive and will work on:

- Desktop (900px width)
- Tablet (600px-900px)
- Mobile (under 480px)

---

## Common Integration Issues

### Issue: "Cannot find module 'TeacherExamUpload'"

**Solution:**

```typescript
// Check file path is correct
import TeacherExamUpload from "./TeacherExamUpload";
// Should be same directory or adjust path accordingly
```

### Issue: Upload button doesn't work

**Check:**

1. `authToken` is being passed to component
2. API server is running on port 5000
3. Network requests aren't blocked

**Debug:**

```typescript
// Add this in your component
console.log("Auth token:", authToken);
console.log("API URL:", "http://localhost:5000/api/exams/upload");
```

### Issue: File upload fails with CORS error

**Check:**

1. Backend has CORS middleware enabled
2. Check `live-db-server.js` has:

```javascript
const cors = require("cors");
app.use(cors());
```

### Issue: Modal won't close

**Ensure:**

```typescript
// Modal has click handler to close
onClick={() => setShowUploadModal(false)}

// Content has event.stopPropagation
onClick={(e) => e.stopPropagation()}
```

---

## Running Automated Tests

```bash
# Test Phase 2 endpoints
npm run db:test:phase2

# Expected output:
# ✓ Health Check
# ✓ User Authentication
# ✓ Upload Exam with PDF File
# ✓ Download Uploaded Exam
# ✓ List Available Exams
```

---

## Next Steps

After integration:

1. **Style Customization**
   - Adjust colors to match your branding
   - Customize fonts and spacing
   - Add your logo/icons

2. **Add Features**
   - Edit exam after upload
   - Delete exams
   - Duplicate exams
   - Exam templates

3. **Enhance UI**
   - Add drag-and-drop for questions reordering
   - Rich text editor for question text
   - Question categories/tags
   - Exam previews

4. **Phase 3 Preparation**
   - Student download UI
   - Local caching
   - Offline support

---

## File Reference

| File                     | Purpose           | Status              |
| ------------------------ | ----------------- | ------------------- |
| `TeacherExamUpload.tsx`  | Upload component  | ✅ Complete         |
| `TeacherExamUpload.css`  | Component styling | ✅ Complete         |
| `TeacherDashboard.tsx`   | Integration point | ⏳ Ready for update |
| `live-db-server.js`      | Backend API       | ✅ Updated          |
| `test-api-phase2.js`     | Test suite        | ✅ Complete         |
| `PHASE_2_SETUP_GUIDE.md` | Setup docs        | ✅ Complete         |

---

## Support

For issues or questions:

1. Check logs: `npm run db:test:phase2`
2. Read PHASE_2_SETUP_GUIDE.md for detailed info
3. Verify all dependencies: `npm install`
4. Reset database: `npm run db:init`

---

_Last Updated: May 2026_
_Phase 2: Integration Guide_
