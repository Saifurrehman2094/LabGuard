import React, { useState, useEffect, useCallback } from 'react';
import './CourseManagement.css';

interface Course {
    course_id: string;
    course_name: string;
    course_code: string;
    teacher_id: string;
    teacher_name?: string;
    description: string;
    student_count: number;
}

interface Student {
    user_id: string;
    username: string;
    full_name: string;
    email: string;
    role?: string;
}

interface Teacher {
    user_id: string;
    username: string;
    full_name: string;
    email: string;
    role?: string;
}

type Banner = { variant: 'success' | 'error'; message: string };

type CourseElectronApi = {
    getAllCourses: () => Promise<{ success: boolean; courses?: Course[]; error?: string }>;
    getUsers: (filters?: { role?: string }) => Promise<{ success: boolean; users?: any[]; error?: string }>;
    getEnrolledStudents: (courseId: string) => Promise<{ success: boolean; students?: Student[]; error?: string }>;
    createCourse: (data: {
        courseName: string;
        courseCode: string;
        description: string;
        teacherId: string;
    }) => Promise<{ success: boolean; error?: string }>;
    enrollStudent: (courseId: string, studentId: string) => Promise<{ success: boolean; error?: string }>;
    unenrollStudent: (courseId: string, studentId: string) => Promise<{ success: boolean; error?: string }>;
};

const courseApi = (): CourseElectronApi => window.electronAPI as unknown as CourseElectronApi;

const AdminCourseManagement: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [banner, setBanner] = useState<Banner | null>(null);

    const showBanner = useCallback((next: Banner) => {
        setBanner(next);
        window.setTimeout(() => setBanner(null), 5000);
    }, []);

    const [formData, setFormData] = useState({
        courseName: '',
        courseCode: '',
        description: '',
        teacherId: ''
    });

    useEffect(() => {
        loadCourses();
        loadAllStudents();
        loadAllTeachers();
    }, []);

    const loadCourses = async () => {
        setLoading(true);
        try {
            const result = await courseApi().getAllCourses();
            if (result.success) {
                setCourses(result.courses || []);
            } else {
                showBanner({ variant: 'error', message: result.error || 'Failed to load courses' });
            }
        } catch {
            showBanner({ variant: 'error', message: 'Failed to load courses' });
        } finally {
            setLoading(false);
        }
    };

    const loadAllStudents = async () => {
        try {
            const result = await courseApi().getUsers({ role: 'student' });
            if (result.success) {
                const studentsOnly = (result.users || []).filter((u: { role: string }) => u.role === 'student');
                setAllStudents(studentsOnly);
            }
        } catch {
            console.error('Error loading students');
        }
    };

    const loadAllTeachers = async () => {
        try {
            const result = await courseApi().getUsers({ role: 'teacher' });
            if (result.success) {
                const teachersOnly = (result.users || []).filter((u: { role: string }) => u.role === 'teacher');
                setAllTeachers(teachersOnly);
            }
        } catch {
            console.error('Error loading teachers');
        }
    };

    const loadEnrolledStudents = async (courseId: string) => {
        try {
            const result = await courseApi().getEnrolledStudents(courseId);
            if (result.success) {
                setEnrolledStudents(result.students || []);
            }
        } catch {
            console.error('Error loading enrolled students');
        }
    };

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.teacherId) {
            showBanner({ variant: 'error', message: 'Select a teacher for this course.' });
            return;
        }

        const result = await courseApi().createCourse({
            courseName: formData.courseName,
            courseCode: formData.courseCode,
            description: formData.description,
            teacherId: formData.teacherId
        });

        if (result.success) {
            showBanner({ variant: 'success', message: 'Course created.' });
            setFormData({ courseName: '', courseCode: '', description: '', teacherId: '' });
            setShowCreateForm(false);
            loadCourses();
        } else {
            showBanner({ variant: 'error', message: result.error || 'Could not create course' });
        }
    };

    const handleViewCourse = async (course: Course) => {
        setSelectedCourse(course);
        await loadEnrolledStudents(course.course_id);
    };

    const handleCourseCardKeyDown = (e: React.KeyboardEvent, course: Course) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void handleViewCourse(course);
        }
    };

    const handleEnrollStudent = async (studentId: string) => {
        if (!selectedCourse) return;

        const result = await courseApi().enrollStudent(selectedCourse.course_id, studentId);

        if (result.success) {
            showBanner({ variant: 'success', message: 'Student enrolled.' });
            await loadEnrolledStudents(selectedCourse.course_id);
            await loadCourses();
            setShowEnrollModal(false);
        } else {
            showBanner({ variant: 'error', message: result.error || 'Could not enroll student' });
        }
    };

    const handleUnenrollStudent = async (studentId: string) => {
        if (!selectedCourse) return;

        if (window.confirm('Unenroll this student from the course?')) {
            const result = await courseApi().unenrollStudent(selectedCourse.course_id, studentId);

            if (result.success) {
                showBanner({ variant: 'success', message: 'Student unenrolled.' });
                await loadEnrolledStudents(selectedCourse.course_id);
                await loadCourses();
            } else {
                showBanner({ variant: 'error', message: result.error || 'Could not unenroll' });
            }
        }
    };

    const getAvailableStudents = () => {
        const enrolledIds = enrolledStudents.map(s => s.user_id);
        return allStudents.filter(s => !enrolledIds.includes(s.user_id));
    };

    return (
        <div className="course-management">
            {banner && (
                <div
                    className={banner.variant === 'success' ? 'success-banner' : 'error-banner'}
                    role={banner.variant === 'error' ? 'alert' : 'status'}
                >
                    <span>{banner.message}</span>
                    <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss notice">
                        ×
                    </button>
                </div>
            )}

            <h2 className="admin-tab-title">Course management</h2>
            <p className="tab-description">
                Create courses, assign teachers, and enroll or remove students from each class roster.
            </p>
            <div className="admin-tab-toolbar">
                <button type="button" className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
                    Create course
                </button>
            </div>

            {showCreateForm && (
                <div className="modal-overlay" role="presentation">
                    <div
                        className="modal-content"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-course-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="create-course-title">Create course</h3>
                        <form onSubmit={handleCreateCourse}>
                            <div className="form-group">
                                <label htmlFor="cc-name">Course name</label>
                                <input
                                    id="cc-name"
                                    type="text"
                                    placeholder="e.g. Introduction to Computer Science"
                                    value={formData.courseName}
                                    onChange={e => setFormData({ ...formData, courseName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="cc-code">Course code</label>
                                <input
                                    id="cc-code"
                                    type="text"
                                    placeholder="e.g. CS101"
                                    value={formData.courseCode}
                                    onChange={e => setFormData({ ...formData, courseCode: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="cc-teacher">Teacher</label>
                                <select
                                    id="cc-teacher"
                                    value={formData.teacherId}
                                    onChange={e => setFormData({ ...formData, teacherId: e.target.value })}
                                    required
                                >
                                    <option value="">Select a teacher</option>
                                    {allTeachers.map(teacher => (
                                        <option key={teacher.user_id} value={teacher.user_id}>
                                            {teacher.full_name} ({teacher.username})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="cc-desc">Description</label>
                                <textarea
                                    id="cc-desc"
                                    placeholder="Course description…"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={4}
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary">
                                    Create course
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowCreateForm(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedCourse && (
                <div className="modal-overlay" role="presentation">
                    <div
                        className="modal-content large"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="course-detail-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="course-detail-title">{selectedCourse.course_name}</h3>
                        <p className="course-code">{selectedCourse.course_code}</p>
                        {selectedCourse.teacher_name && (
                            <p className="teacher-name">Teacher: {selectedCourse.teacher_name}</p>
                        )}
                        <p className="course-description">{selectedCourse.description}</p>

                        <div className="enrolled-students-section">
                            <div className="section-header">
                                <h4>Enrolled students ({enrolledStudents.length})</h4>
                                <button type="button" className="btn btn-primary" onClick={() => setShowEnrollModal(true)}>
                                    Enroll student
                                </button>
                            </div>

                            <div className="students-list">
                                {enrolledStudents.length === 0 ? (
                                    <p className="no-data">No students enrolled yet.</p>
                                ) : (
                                    enrolledStudents.map(student => (
                                        <div key={student.user_id} className="student-item">
                                            <div className="student-info">
                                                <strong>{student.full_name}</strong>
                                                <span className="student-username">{student.username}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn-danger-small"
                                                onClick={() => handleUnenrollStudent(student.user_id)}
                                            >
                                                Unenroll
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {showEnrollModal && (
                            <div className="enroll-modal">
                                <h4>Select a student</h4>
                                <button
                                    type="button"
                                    className="close-modal-button"
                                    onClick={() => setShowEnrollModal(false)}
                                    aria-label="Close enroll panel"
                                >
                                    ×
                                </button>
                                <div className="students-list">
                                    {getAvailableStudents().length === 0 ? (
                                        <p className="no-data">All students are already enrolled.</p>
                                    ) : (
                                        getAvailableStudents().map(student => (
                                            <div key={student.user_id} className="student-item">
                                                <div className="student-info">
                                                    <strong>{student.full_name}</strong>
                                                    <span className="student-username">{student.username}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn-primary-small"
                                                    onClick={() => handleEnrollStudent(student.user_id)}
                                                >
                                                    Enroll
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        <button type="button" className="btn btn-secondary" onClick={() => setSelectedCourse(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="course-management-loading" role="status" aria-live="polite">
                    <div className="loading-spinner loading-spinner--sm" />
                    <p>Loading courses…</p>
                </div>
            ) : (
                <div className="courses-grid">
                    {courses.length === 0 ? (
                        <div className="no-courses">
                            <p>No courses yet. Create one to get started.</p>
                        </div>
                    ) : (
                        courses.map(course => (
                            <div
                                key={course.course_id}
                                className="course-card"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    void handleViewCourse(course);
                                }}
                                onKeyDown={e => handleCourseCardKeyDown(e, course)}
                                aria-label={`Open course ${course.course_name}`}
                            >
                                <h3>{course.course_name}</h3>
                                <p className="course-code">{course.course_code}</p>
                                {course.teacher_name && (
                                    <p className="teacher-name">Teacher: {course.teacher_name}</p>
                                )}
                                <p className="course-description">{course.description}</p>
                                <div className="course-footer">
                                    <span className="student-count">
                                        {course.student_count || 0} student
                                        {(course.student_count || 0) !== 1 ? 's' : ''} enrolled
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default AdminCourseManagement;
