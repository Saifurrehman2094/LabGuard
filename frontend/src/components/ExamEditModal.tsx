import React, { useState, useEffect } from 'react';
import './ExamEditModal.css';

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

interface ExamEditModalProps {
  exam: Exam;
  onClose: () => void;
  onExamUpdated: (exam: Exam) => void;
}

interface FormData {
  title: string;
  startTime: string;
  endTime: string;
  allowedApps: string[];
  pdfFile: File | null;
  pdfFilePath?: string;
  pdfFileName?: string;
  removePdf: boolean;
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

const ExamEditModal: React.FC<ExamEditModalProps> = ({ exam, onClose, onExamUpdated }) => {
  const [formData, setFormData] = useState<FormData>({
    title: exam.title,
    startTime: exam.startTime,
    endTime: exam.endTime,
    allowedApps: [...exam.allowedApps],
    pdfFile: null,
    removePdf: false
  });
  const [errors, setErrors] = useState<FormError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customApp, setCustomApp] = useState('');

  // Check if running in Electron
  const isElectron = () => {
    return !!(window as any).electronAPI;
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
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
      pdfFileName: undefined,
      removePdf: false // Reset remove flag if new file selected
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
            pdfFileName: fileName,
            removePdf: false
          }));

          // Clear file-specific errors
          if (errors.some(error => error.field === 'pdfFile')) {
            setErrors(prev => prev.filter(error => error.field !== 'pdfFile'));
          }
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      setErrors([{ message: 'Failed to select file' }]);
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
        // Update exam through Electron API
        const updateData: any = {
          examId: exam.examId,
          title: formData.title.trim(),
          startTime: formData.startTime,
          endTime: formData.endTime,
          allowedApps: formData.allowedApps,
          removePdf: formData.removePdf
        };

        // If there's a new PDF file, use the file path from Electron dialog
        if (formData.pdfFilePath && formData.pdfFileName) {
          updateData.pdfFilePath = formData.pdfFilePath;
          updateData.pdfFileName = formData.pdfFileName;
        }

        const result = await (window as any).electronAPI.updateExam(updateData);

        if (result.success) {
          onExamUpdated(result.exam);
        } else {
          setErrors([{ message: result.error || 'Failed to update exam' }]);
        }
      } else {
        // Development mode - simulate exam update
        const updatedExam: Exam = {
          ...exam,
          title: formData.title.trim(),
          startTime: formData.startTime,
          endTime: formData.endTime,
          allowedApps: formData.allowedApps,
          pdfPath: formData.removePdf ? undefined :
            formData.pdfFile ? `/mock/uploads/${formData.pdfFile.name}` : exam.pdfPath
        };

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        onExamUpdated(updatedExam);
      }
    } catch (error) {
      console.error('Error updating exam:', error);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Exam</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
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
            <label htmlFor="edit-title">Exam Title *</label>
            <input
              type="text"
              id="edit-title"
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
              <label htmlFor="edit-startTime">Start Time *</label>
              <input
                type="datetime-local"
                id="edit-startTime"
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
              <label htmlFor="edit-endTime">End Time *</label>
              <input
                type="datetime-local"
                id="edit-endTime"
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

          {/* PDF Management */}
          <div className="form-group">
            <label>Exam PDF</label>

            {exam.pdfPath && !formData.removePdf && (
              <div className="current-pdf">
                <p>Current PDF: Attached</p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="removePdf"
                    checked={formData.removePdf}
                    onChange={handleInputChange}
                    disabled={isLoading}
                  />
                  Remove current PDF
                </label>
              </div>
            )}

            {(!exam.pdfPath || formData.removePdf) && (
              <div className="pdf-upload">
                {isElectron() ? (
                  <>
                    <button
                      type="button"
                      onClick={handleFileSelect}
                      className="file-select-btn"
                      disabled={isLoading}
                    >
                      📁 Select PDF File
                    </button>
                    {formData.pdfFileName && (
                      <div className="file-info">
                        Selected: {formData.pdfFileName}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      id="edit-pdfFile"
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
                  </>
                )}
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

          {/* Form Actions */}
          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="save-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExamEditModal;