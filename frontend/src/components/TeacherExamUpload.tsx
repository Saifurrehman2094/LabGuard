import React, { useState, ChangeEvent, FormEvent, ReactNode } from "react";
import axios, { AxiosError } from "axios";
import "./TeacherExamUpload.css";

interface ExamDataType {
  title: string;
  description: string;
  duration_minutes: number;
  allowed_apps: string[];
}

interface TestCaseType {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

interface QuestionType {
  question_number: number;
  question_text: string;
  constraints_json: Record<string, unknown>;
  test_cases: TestCaseType[];
}

interface TeacherExamUploadProps {
  onUploadSuccess?: (exam: unknown) => void;
  token: string;
}

/**
 * Teacher Exam Upload Component
 * Phase 2: Allows teachers to upload exams with PDF and test cases
 */
const TeacherExamUpload: React.FC<TeacherExamUploadProps> = ({
  onUploadSuccess,
  token,
}) => {
  const [step, setStep] = useState(1); // 1: exam details, 2: questions, 3: review
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State - Exam Details
  const [examData, setExamData] = useState<ExamDataType>({
    title: "",
    description: "",
    duration_minutes: 120,
    allowed_apps: [],
  });

  // Form State - PDF File
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);

  // Form State - Questions & Test Cases
  const [questions, setQuestions] = useState<QuestionType[]>([
    {
      question_number: 1,
      question_text: "",
      constraints_json: {},
      test_cases: [{ input: "", expected_output: "", is_hidden: false }],
    },
  ]);

  const [uploadProgress, setUploadProgress] = useState(0);

  // ============================================================================
  // EVENT HANDLERS - EXAM DETAILS
  // ============================================================================

  const handleExamDataChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setExamData((prev) => ({
      ...prev,
      [name]: name === "duration_minutes" ? parseInt(value) : value,
    }));
  };

  const handleAllowedAppsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const apps = e.target.value.split(",").map((app: string) => app.trim());
    setExamData((prev) => ({
      ...prev,
      allowed_apps: apps.filter((app: string) => app),
    }));
  };

  // ============================================================================
  // EVENT HANDLERS - PDF FILE
  // ============================================================================

  const handlePdfChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setPdfPreview(file.name);
      setError(null);
    } else {
      setError("Please select a valid PDF file");
      setPdfFile(null);
      setPdfPreview(null);
    }
  };

  const removePdf = (): void => {
    setPdfFile(null);
    setPdfPreview(null);
  };

  // ============================================================================
  // EVENT HANDLERS - QUESTIONS & TEST CASES
  // ============================================================================

  const handleQuestionChange = (
    qIndex: number,
    field: keyof QuestionType,
    value: unknown,
  ): void => {
    const newQuestions = [...questions];
    if (field === "test_cases" || field === "constraints_json") {
      // These are not directly editable via this handler
      return;
    }
    (newQuestions[qIndex][field] as unknown) = value;
    setQuestions(newQuestions);
  };

  const handleTestCaseChange = (
    qIndex: number,
    tcIndex: number,
    field: keyof TestCaseType,
    value: unknown,
  ): void => {
    const newQuestions = [...questions];
    (newQuestions[qIndex].test_cases[tcIndex][field] as unknown) = value;
    setQuestions(newQuestions);
  };

  const addQuestion = (): void => {
    setQuestions((prev) => [
      ...prev,
      {
        question_number: prev.length + 1,
        question_text: "",
        constraints_json: {},
        test_cases: [{ input: "", expected_output: "", is_hidden: false }],
      },
    ]);
  };

  const removeQuestion = (qIndex: number): void => {
    if (questions.length > 1) {
      setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
    }
  };

  const addTestCase = (qIndex: number): void => {
    const newQuestions = [...questions];
    newQuestions[qIndex].test_cases.push({
      input: "",
      expected_output: "",
      is_hidden: false,
    });
    setQuestions(newQuestions);
  };

  const removeTestCase = (qIndex: number, tcIndex: number): void => {
    const newQuestions = [...questions];
    if (newQuestions[qIndex].test_cases.length > 1) {
      newQuestions[qIndex].test_cases = newQuestions[qIndex].test_cases.filter(
        (_, i) => i !== tcIndex,
      );
      setQuestions(newQuestions);
    }
  };

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = (stepNum: number): boolean => {
    if (stepNum === 1) {
      if (!examData.title.trim()) {
        setError("Exam title is required");
        return false;
      }
      if (!pdfFile) {
        setError("PDF file is required");
        return false;
      }
      return true;
    }

    if (stepNum === 2) {
      for (const q of questions) {
        if (!q.question_text.trim()) {
          setError("All questions must have text");
          return false;
        }
        for (const tc of q.test_cases) {
          if (!tc.input.trim() || !tc.expected_output.trim()) {
            setError("All test cases must have input and expected output");
            return false;
          }
        }
      }
      return true;
    }

    return true;
  };

  // ============================================================================
  // SUBMIT
  // ============================================================================

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!validateStep(step)) return;

    if (step < 3) {
      setStep(step + 1);
      return;
    }

    // Step 3 - Submit
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("exam_data", JSON.stringify(examData));
      formData.append("questions", JSON.stringify(questions));
      formData.append(
        "metadata",
        JSON.stringify({ upload_date: new Date().toISOString() }),
      );

      if (pdfFile) {
        formData.append("pdf_file", pdfFile);
      }

      const response = await axios.post(
        `http://localhost:5000/api/exams/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (progressEvent) => {
            const total = progressEvent.total || 1;
            const percentComplete = Math.round(
              (progressEvent.loaded * 100) / total,
            );
            setUploadProgress(percentComplete);
          },
        },
      );

      setSuccess(true);
      setError(null);
      setUploadProgress(0);

      // Call parent callback
      if (onUploadSuccess) {
        onUploadSuccess(response.data);
      }

      // Reset form after 2 seconds
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (err) {
      const axiosError = err as AxiosError;
      const errorMsg =
        (axiosError.response?.data as Record<string, unknown>)?.error ||
        "Upload failed. Please try again.";
      setError(String(errorMsg));
      setUploadProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = (): void => {
    setStep(1);
    setExamData({
      title: "",
      description: "",
      duration_minutes: 120,
      allowed_apps: [],
    });
    setPdfFile(null);
    setPdfPreview(null);
    setQuestions([
      {
        question_number: 1,
        question_text: "",
        constraints_json: {},
        test_cases: [{ input: "", expected_output: "", is_hidden: false }],
      },
    ]);
    setSuccess(false);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (success) {
    return (
      <div className="exam-upload-container success">
        <div className="success-message">
          <div className="success-icon">✓</div>
          <h2>Exam Uploaded Successfully!</h2>
          <p>Your exam is now available for students to download.</p>
          <button onClick={resetForm} className="btn btn-primary">
            Upload Another Exam
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-upload-container">
      <div className="upload-header">
        <h2>Upload Exam</h2>
        <div className="step-indicator">
          <div className={`step ${step >= 1 ? "active" : ""}`}>
            <span>1</span>
            <p>Exam Details</p>
          </div>
          <div className={`step ${step >= 2 ? "active" : ""}`}>
            <span>2</span>
            <p>Questions</p>
          </div>
          <div className={`step ${step >= 3 ? "active" : ""}`}>
            <span>3</span>
            <p>Review</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        {error && <div className="alert alert-error">{error}</div>}

        {/* STEP 1: EXAM DETAILS */}
        {step === 1 && (
          <div className="form-section">
            <h3>Exam Details</h3>

            <div className="form-group">
              <label htmlFor="title">
                Exam Title <span className="required">*</span>
              </label>
              <input
                id="title"
                type="text"
                name="title"
                value={examData.title}
                onChange={handleExamDataChange}
                placeholder="e.g., Algorithms Final Exam"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={examData.description}
                onChange={handleExamDataChange}
                placeholder="Exam instructions and details..."
                rows={4}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="duration">Duration (minutes)</label>
                <input
                  id="duration"
                  type="number"
                  name="duration_minutes"
                  value={examData.duration_minutes}
                  onChange={handleExamDataChange}
                  min="30"
                  max="480"
                />
              </div>

              <div className="form-group">
                <label htmlFor="apps">Allowed Apps (comma-separated)</label>
                <input
                  id="apps"
                  type="text"
                  placeholder="e.g., VS Code, Compiler"
                  value={examData.allowed_apps.join(", ")}
                  onChange={handleAllowedAppsChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pdf">
                Exam PDF <span className="required">*</span>
              </label>
              <div className="file-upload">
                {!pdfPreview ? (
                  <div className="file-input-wrapper">
                    <input
                      id="pdf"
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfChange}
                      className="file-input"
                    />
                    <div className="file-input-label">
                      <span className="upload-icon">📄</span>
                      <span>Click to select PDF or drag and drop</span>
                    </div>
                  </div>
                ) : (
                  <div className="file-preview">
                    <span className="file-icon">✓</span>
                    <div className="file-info">
                      <p className="file-name">{pdfPreview}</p>
                      <p className="file-size">
                        {pdfFile && (pdfFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={removePdf}
                      className="btn-remove"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: QUESTIONS & TEST CASES */}
        {step === 2 && (
          <div className="form-section">
            <h3>Questions & Test Cases</h3>

            {questions.map((question, qIndex) => (
              <div key={qIndex} className="question-card">
                <div className="question-header">
                  <h4>Question {qIndex + 1}</h4>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIndex)}
                      className="btn-remove-section"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label>Question Text</label>
                  <textarea
                    value={question.question_text}
                    onChange={(e) =>
                      handleQuestionChange(
                        qIndex,
                        "question_text",
                        e.target.value,
                      )
                    }
                    placeholder="Enter the question text..."
                    rows={3}
                    required
                  />
                </div>

                <div className="test-cases-section">
                  <h5>Test Cases</h5>

                  {question.test_cases.map((testCase, tcIndex) => (
                    <div key={tcIndex} className="test-case-card">
                      <div className="test-case-header">
                        <span>Test Case {tcIndex + 1}</span>
                        {question.test_cases.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTestCase(qIndex, tcIndex)}
                            className="btn-remove-small"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Input</label>
                          <input
                            type="text"
                            value={testCase.input}
                            onChange={(e) =>
                              handleTestCaseChange(
                                qIndex,
                                tcIndex,
                                "input",
                                e.target.value,
                              )
                            }
                            placeholder="e.g., 5 3"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>Expected Output</label>
                          <input
                            type="text"
                            value={testCase.expected_output}
                            onChange={(e) =>
                              handleTestCaseChange(
                                qIndex,
                                tcIndex,
                                "expected_output",
                                e.target.value,
                              )
                            }
                            placeholder="e.g., 8"
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group checkbox">
                        <label>
                          <input
                            type="checkbox"
                            checked={testCase.is_hidden}
                            onChange={(e) =>
                              handleTestCaseChange(
                                qIndex,
                                tcIndex,
                                "is_hidden",
                                e.target.checked,
                              )
                            }
                          />
                          Hide from student (secret test case)
                        </label>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addTestCase(qIndex)}
                    className="btn btn-secondary btn-small"
                  >
                    + Add Test Case
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addQuestion}
              className="btn btn-secondary"
            >
              + Add Question
            </button>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {step === 3 && (
          <div className="form-section">
            <h3>Review & Confirm</h3>

            <div className="review-card">
              <h4>Exam Summary</h4>
              <div className="review-item">
                <span className="label">Title:</span>
                <span className="value">{examData.title}</span>
              </div>
              <div className="review-item">
                <span className="label">Duration:</span>
                <span className="value">
                  {examData.duration_minutes} minutes
                </span>
              </div>
              <div className="review-item">
                <span className="label">PDF File:</span>
                <span className="value">{pdfPreview}</span>
              </div>
              <div className="review-item">
                <span className="label">Questions:</span>
                <span className="value">{questions.length}</span>
              </div>
              <div className="review-item">
                <span className="label">Total Test Cases:</span>
                <span className="value">
                  {questions.reduce((sum, q) => sum + q.test_cases.length, 0)}
                </span>
              </div>
            </div>

            {uploadProgress > 0 && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                >
                  {uploadProgress}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* FORM ACTIONS */}
        <div className="form-actions">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="btn btn-secondary"
              disabled={isLoading}
            >
              ← Back
            </button>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading
              ? `Processing... ${uploadProgress}%`
              : step === 3
                ? "Upload Exam"
                : "Next"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeacherExamUpload;
