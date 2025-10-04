import React, { useState } from 'react';
import WebStorageService from '../services/webStorage';
import './ExamCreationForm.css';

interface User {
  userId: string;
  username: string;
  role: 'teacher' | 'student';
  fullName: string;
  token?: string;
  deviceId?: string;
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
}

interface FormError {
  field?: string;
  message: string;
}

const COMMON_APPLICATIONS = [
  { name: 'Notepad', executable: 'notepad.exe' },
  { name: 'Calculator', executable: 'calc.exe' },
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
    allowedApps: ['notepad.exe'], // Default to notepad
    pdfFile: null
  });
  const [errors, setErrors] = useState<FormError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customApp, setCustomApp] = useState('');

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
      if (durationMinutes < 15) {
        newErrors.push({ field: 'endTime', message: 'Exam must be at least 15 minutes long' });
      }

      if (durationMinutes > 480) { // 8 hours
        newErrors.push({ field: 'endTime', message: 'Exam cannot be longer than 8 hours' });
      }
    }

    if (formData.allowedApps.length === 0) {
      newErrors.push({ field: 'allowedApps', message: 'At least one application must be allowed' });
    }

    if (formData.pdfFile) {
      if (formData.pdfFile.size > 50 * 1024 * 1024) { // 50MB
        newErrors.push({ field: 'pdfFile', message: 'PDF file must be smaller than 50MB' });
      }

      if (!formData.pdfFile.name.toLowerCase().endsWith('.pdf')) {
        newErrors.push({ field: 'pdfFile', message: 'Only PDF files are allowed' });
      }
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

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({
      ...prev,
      pdfFile: file
    }));

    // Clear file-specific errors
    if (errors.some(error => error.field === 'pdfFile')) {
      setErrors(prev => prev.filter(error => error.field !== 'pdfFile'));
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
          startTime: formData.startTime,
          endTime: formData.endTime,
          allowedApps: formData.allowedApps,
          pdfFile: formData.pdfFile
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
            allowedApps: ['notepad.exe'],
            pdfFile: null
          });

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
            allowedApps: ['notepad.exe'],
            pdfFile: null
          });

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
            placeholder="Enter exam title"
            disabled={isLoading}
          />
          {getFieldError('title') && (
            <div className="field-error">{getFieldError('title')}</div>
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
          <label htmlFor="pdfFile">Exam PDF (Optional)</label>
          <input
            type="file"
            id="pdfFile"
            accept=".pdf"
            onChange={handleFileChange}
            className={getFieldError('pdfFile') ? 'error' : ''}
            disabled={isLoading}
          />
          {formData.pdfFile && (
            <div className="file-info">
              Selected: {formData.pdfFile.name} ({(formData.pdfFile.size / (1024 * 1024)).toFixed(2)} MB)
            </div>
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