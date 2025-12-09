import React, { useState } from 'react';
import WebStorageService from '../services/webStorage';
import './ExamCreationForm.css';

interface User {
  userId: string;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  token?: string;
  deviceId?: string;
  faceVerified?: boolean;
}

interface Exam {
  examId: string;
  teacherId: string;
  title: string;
  pdfPath?: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  createdAt: string;
}

interface ExamCreationFormProps {
  user: User;
  onExamCreated: (exam: Exam) => void;
}

interface FormData {
  title: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  pdfFile: File | null;
  pdfFilePath?: string;
  pdfFileName?: string;
}

interface FormError {
  field?: string;
  message: string;
}

const COMMON_APPLICATIONS = [
  { name: 'Notepad', executable: 'Notepad.exe' },
  { name: 'Calculator', executable: 'CalculatorApp.exe' },
  { name: 'Calculator (Legacy)', executable: 'calc.exe' },
  { name: 'Google Chrome', executable: 'chrome.exe' },
  { name: 'Microsoft Edge', executable: 'msedge.exe' },
  { name: 'Firefox', executable: 'firefox.exe' },
  { name: 'Visual Studio Code', executable: 'Code.exe' },
  { name: 'Microsoft Word', executable: 'WINWORD.EXE' },
  { name: 'Microsoft Excel', executable: 'EXCEL.EXE' },
  { name: 'Adobe Acrobat Reader', executable: 'AcroRd32.exe' },
  { name: 'MySQL Workbench', executable: 'MySQLWorkbench.exe' }
];

const ExamCreationForm: React.FC<ExamCreationFormProps> = ({ user, onExamCreated }) => {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    startTime: '',
    endTime: '',
    allowedApps: ['Notepad.exe'], // Default to notepad
    pdfFile: null,
    pdfFilePath: undefined,
    pdfFileName: undefined
  });
  const [errors, setErrors] = useState<FormError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customApp, setCustomApp] = useState('');
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Load teacher's courses on mount
  React.useEffect(() => {
    loadCourses();
  }, [user.userId]);

  const loadCourses = async () => {
    try {
      setLoadingCourses(true);
      if (isElectron()) {
        const result = await (window as any).electronAPI.getCoursesByTeacher(user.userId);
        if (result.success) {
          setCourses(result.courses || []);
        } else {
          console.error('Failed to load courses:', result.error);
        }
      } else {
        // Web mode - mock data
        setCourses([
          { course_id: '1', course_name: 'Computer Science 101', course_code: 'CS101' },
          { course_id: '2', course_name: 'Data Structures', course_code: 'CS201' }
        ]);
      }
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoadingCourses(false);
    }
  };

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Form validation
  const validateForm = (): FormError[] => {
    const newErrors: FormError[] = [];

    if (!formData.title.trim()) {
      newErrors.push({ field: 'title', message: 'Exam title is required' });
    }

    if (!selectedCourse) {
      newErrors.push({ field: 'course', message: 'Please select a course for this exam' });
    }

    if (!formData.startTime) {
      newErrors.push({ field: 'startTime', message: 'Start time is required' });
    }

    if (!formData.endTime) {
      newErrors.push({ field: 'endTime', message: 'End time is required' });
    }

    if (formData.startTime && formData.endTime) {
      const startDate = new Date(formData.startTime);
      const endDate = new Date(formData.endTime);
      const now = new Date();

      if (startDate <= now) {
        newErrors.push({ field: 'startTime', message: 'Start time must be in the future' });
      }

      if (endDate <= startDate) {
        newErrors.push({ field: 'endTime', message: 'End time must be after start time' });
      }

      const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
      if (durationMinutes < 3) {
        newErrors.push({ field: 'endTime', message: 'Exam must be at least 3 minutes long' });
      }

      if (durationMinutes > 480) { // 8 hours
        newErrors.push({ field: 'endTime', message: 'Exam cannot be longer than 8 hours' });
      }
    }

    if (formData.allowedApps.length === 0) {
      newErrors.push({ field: 'allowedApps', message: 'At least one application must be allowed' });
    }

    // Validate PDF file (web mode)
    if (formData.pdfFile) {
      if (formData.pdfFile.size > 50 * 1024 * 1024) { // 50MB
        newErrors.push({ field: 'pdfFile', message: 'PDF file must be smaller than 50MB' });
      }

      if (!formData.pdfFile.name.toLowerCase().endsWith('.pdf')) {
        newErrors.push({ field: 'pdfFile', message: 'Only PDF files are allowed' });
      }
    }

    // Validate PDF file (Electron mode)
    if (formData.pdfFileName && !formData.pdfFileName.toLowerCase().endsWith('.pdf')) {
      newErrors.push({ field: 'pdfFile', message: 'Only PDF files are allowed' });
    }

    return newErrors;
  };

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear field-specific errors
    if (errors.some(error => error.field === name)) {
      setErrors(prev => prev.filter(error => error.field !== name));
    }
  };

  // Handle file selection (for web/development mode)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({
      ...prev,
      pdfFile: file,
      pdfFilePath: undefined,
      pdfFileName: undefined
    }));

    // Clear file-specific errors
    if (errors.some(error => error.field === 'pdfFile')) {
      setErrors(prev => prev.filter(error => error.field !== 'pdfFile'));
    }
  };

  // Handle file selection using Electron file dialog
  const handleFileSelect = async () => {
    try {
      if (isElectron()) {
        const result = await (window as any).electronAPI.openFileDialog({
          title: 'Select Exam PDF',
          filters: [
            { name: 'PDF Files', extensions: ['pdf'] }
          ]
        });

        if (result.success && !result.canceled) {
          const filePath = result.filePath;
          const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'unknown.pdf';

          setFormData(prev => ({
            ...prev,
            pdfFile: null, // Clear web file
            pdfFilePath: filePath,
            pdfFileName: fileName
          }));

          // Clear file-specific errors
          if (errors.some(error => error.field === 'pdfFile')) {
            setErrors(prev => prev.filter(error => error.field !== 'pdfFile'));
          }
        }
      }
    } catch (error) {
      console.error('File selection error:', error);
      setErrors(prev => [...prev, { field: 'pdfFile', message: 'Failed to select file' }]);
    }
  };

  // Handle allowed app selection
  const handleAppToggle = (appExecutable: string) => {
    setFormData(prev => ({
      ...prev,
      allowedApps: prev.allowedApps.includes(appExecutable)
        ? prev.allowedApps.filter(app => app !== appExecutable)
        : [...prev.allowedApps, appExecutable]
    }));

    // Clear allowed apps errors
    if (errors.some(error => error.field === 'allowedApps')) {
      setErrors(prev => prev.filter(error => error.field !== 'allowedApps'));
    }
  };

  // Add custom application
  const handleAddCustomApp = () => {
    const trimmedApp = customApp.trim();
    if (trimmedApp && !formData.allowedApps.includes(trimmedApp)) {
      setFormData(prev => ({
        ...prev,
        allowedApps: [...prev.allowedApps, trimmedApp]
      }));
      setCustomApp('');
    }
  };

  // Remove custom application
  const handleRemoveApp = (appExecutable: string) => {
    setFormData(prev => ({
      ...prev,
      allowedApps: prev.allowedApps.filter(app => app !== appExecutable)
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setErrors([]);

    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      if (isElectron()) {
        // Create exam through Electron API
        const examData = {
          title: formData.title.trim(),
          courseId: selectedCourse,
          startTime: formData.startTime,
          endTime: formData.endTime,
          allowedApps: formData.allowedApps,
          pdfFilePath: formData.pdfFilePath,
          pdfFileName: formData.pdfFileName
        };

        const result = await (window as any).electronAPI.createExam(examData);

        if (result.success) {
          // Exam created successfully
          onExamCreated(result.exam);

          // Reset form
          setFormData({
            title: '',
            startTime: '',
            endTime: '',
            allowedApps: ['Notepad.exe'],
            pdfFile: null,
            pdfFilePath: undefined,
            pdfFileName: undefined
          });
          setSelectedCourse('');

          // Reset file input
          const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }
        } else {
          setErrors([{ message: result.error || 'Failed to create exam' }]);
        }
      } else {
        // Development mode - use WebStorageService
        const webStorage = WebStorageService.getInstance();
        const result = await webStorage.createExam({
          teacherId: user.userId,
          title: formData.title.trim(),
          courseId: selectedCourse,
          startTime: formData.startTime,
          endTime: formData.endTime,
          allowedApps: formData.allowedApps,
          pdfFile: formData.pdfFile
        });

        if (result.success && result.exam) {
          onExamCreated(result.exam);

          // Reset form
          setFormData({
            title: '',
            startTime: '',
            endTime: '',
            allowedApps: ['Notepad.exe'],
            pdfFile: null,
            pdfFilePath: undefined,
            pdfFileName: undefined
          });
          setSelectedCourse('');

          // Reset file input
          const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }
        } else {
          setErrors([{ message: result.error || 'Failed to create exam' }]);
        }
      }
    } catch (error) {
      console.error('Error creating exam:', error);
      setErrors([{ message: 'An unexpected error occurred. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get field-specific error
  const getFieldError = (fieldName: string): string | undefined => {
    const error = errors.find(err => err.field === fieldName);
    return error?.message;
  };

  // Get general errors (not field-specific)
  const getGeneralErrors = (): FormError[] => {
    return errors.filter(err => !err.field);
  };

  return (
    <div className="exam-creation-form">
      <form onSubmit={handleSubmit}>
        {/* General error messages */}
        {getGeneralErrors().length > 0 && (
          <div className="error-messages">
            {getGeneralErrors().map((error, index) => (
              <div key={index} className="error-message">
                {error.message}
              </div>
            ))}
          </div>
        )}

        {/* Exam Title */}
        <div className="form-group">
          <label htmlFor="title">Exam Title *</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={getFieldError('title') ? 'error' : ''}
            placeholder="e.g., Midterm Exam, Final Exam, Quiz 1"
            disabled={isLoading}
          />
          {getFieldError('title') && (
            <div className="field-error">{getFieldError('title')}</div>
          )}
        </div>

        {/* Course Selection */}
        <div className="form-group">
          <label htmlFor="course">Course *</label>
          {loadingCourses ? (
            <div className="loading-courses">
              <span className="loading-spinner-small"></span>
              Loading your courses...
            </div>
          ) : courses.length === 0 ? (
            <div className="no-courses-warning">
              <p>⚠️ You haven't created any courses yet.</p>
              <p>Please create a course first in the "My Courses" tab before creating exams.</p>
            </div>
          ) : (
            <>
              <select
                id="course"
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  if (errors.some(error => error.field === 'course')) {
                    setErrors(prev => prev.filter(error => error.field !== 'course'));
                  }
                }}
                className={getFieldError('course') ? 'error' : ''}
                disabled={isLoading}
              >
                <option value="">-- Select a course --</option>
                {courses.map(course => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_code} - {course.course_name}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                Only students enrolled in this course will see this exam
              </small>
            </>
          )}
          {getFieldError('course') && (
            <div className="field-error">{getFieldError('course')}</div>
          )}
        </div>

        {/* Time Settings */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="startTime">Start Time *</label>
            <input
              type="datetime-local"
              id="startTime"
              name="startTime"
              value={formData.startTime}
              onChange={handleInputChange}
              className={getFieldError('startTime') ? 'error' : ''}
              disabled={isLoading}
            />
            {getFieldError('startTime') && (
              <div className="field-error">{getFieldError('startTime')}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="endTime">End Time *</label>
            <input
              type="datetime-local"
              id="endTime"
              name="endTime"
              value={formData.endTime}
              onChange={handleInputChange}
              className={getFieldError('endTime') ? 'error' : ''}
              disabled={isLoading}
            />
            {getFieldError('endTime') && (
              <div className="field-error">{getFieldError('endTime')}</div>
            )}
          </div>
        </div>

        {/* PDF Upload */}
        <div className="form-group">
          <label htmlFor="pdfFile">
            Exam Question Paper (PDF)
            <span className="optional-badge">Optional</span>
          </label>
          <small className="field-hint">
            Upload the exam question paper that students will view during the exam
          </small>

          {isElectron() ? (
            // Electron mode - use file dialog button
            <div className="file-select-container">
              <button
                type="button"
                onClick={handleFileSelect}
                className={`file-select-btn ${getFieldError('pdfFile') ? 'error' : ''} ${formData.pdfFileName ? 'has-file' : ''}`}
                disabled={isLoading}
              >
                <span className="btn-icon">📄</span>
                {formData.pdfFileName ? 'Change PDF File' : 'Browse for PDF File'}
              </button>
              {formData.pdfFileName && (
                <div className="file-info success">
                  <span className="file-icon">✓</span>
                  <div className="file-details">
                    <strong>{formData.pdfFileName}</strong>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          pdfFilePath: undefined,
                          pdfFileName: undefined
                        }));
                      }}
                      className="remove-file-btn"
                      disabled={isLoading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              {!formData.pdfFileName && (
                <div className="file-hint">
                  <p>💡 Click the button above to select a PDF file from your computer</p>
                  <p>Maximum file size: 50 MB</p>
                </div>
              )}
            </div>
          ) : (
            // Web mode - use file input
            <>
              <input
                type="file"
                id="pdfFile"
                accept=".pdf"
                onChange={handleFileChange}
                className={getFieldError('pdfFile') ? 'error' : ''}
                disabled={isLoading}
              />
              {formData.pdfFile && (
                <div className="file-info success">
                  <span className="file-icon">✓</span>
                  <div className="file-details">
                    <strong>{formData.pdfFile.name}</strong>
                    <span className="file-size">
                      ({(formData.pdfFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {getFieldError('pdfFile') && (
            <div className="field-error">{getFieldError('pdfFile')}</div>
          )}
        </div>

        {/* Allowed Applications */}
        <div className="form-group">
          <label>Allowed Applications *</label>
          <div className="allowed-apps-section">
            <div className="common-apps">
              <h4>Common Applications</h4>
              <div className="app-checkboxes">
                {COMMON_APPLICATIONS.map(app => (
                  <label key={app.executable} className="app-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.allowedApps.includes(app.executable)}
                      onChange={() => handleAppToggle(app.executable)}
                      disabled={isLoading}
                    />
                    <span>{app.name}</span>
                    <small>({app.executable})</small>
                  </label>
                ))}
              </div>
            </div>

            <div className="custom-apps">
              <h4>Custom Applications</h4>
              <div className="custom-app-input">
                <input
                  type="text"
                  value={customApp}
                  onChange={(e) => setCustomApp(e.target.value)}
                  placeholder="Enter executable name (e.g., myapp.exe)"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={handleAddCustomApp}
                  disabled={isLoading || !customApp.trim()}
                  className="add-app-btn"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="selected-apps">
              <h4>Selected Applications ({formData.allowedApps.length})</h4>
              <div className="selected-app-list">
                {formData.allowedApps.map(app => (
                  <div key={app} className="selected-app-item">
                    <span>{app}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveApp(app)}
                      disabled={isLoading}
                      className="remove-app-btn"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {getFieldError('allowedApps') && (
            <div className="field-error">{getFieldError('allowedApps')}</div>
          )}
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            className="create-exam-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Creating Exam...
              </>
            ) : (
              'Create Exam'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExamCreationForm;
