import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import './CourseManagement.css';

interface Course {
    course_id: string;
    course_name: string;
    course_code: string;
    teacher_id: string;
    description: string;
    student_count: number;
}

interface Student {
    user_id: string;
    username: string;
    full_name: string;
    email: string;
}

interface CourseManagementProps {
    user: any;
}

const CourseManagement: React.FC<CourseManagementProps> = ({ user }) => {
    const { addNotification } = useNotification();
    const [courses, setCourses] = useState<Course[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [showEnrollModal, setShowEnrollModal] = useState(false);

    const [formData, setFormData] = useState({
        courseName: '',
        courseCode: '',
        description: ''
    });

    useEffect(() => {
        loadCourses();
        loadAllStudents();

        // Auto-refresh every 5 seconds for real-time updates
        const interval = setInterval(() => {
            loadCourses();
            if (selectedCourse) {
                loadEnrolledStudents(selectedCourse.course_id);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [user, selectedCourse]);

    const loadCourses = async () => {
        const result = await (window as any).electronAPI.getCoursesByTeacher(user.userId);
        if (result.success) {
            setCourses(result.courses);
        }
    };

    const loadAllStudents = async () => {
        const result = await (window as any).electronAPI.getUsers({ role: 'student' });
        if (result.success) {
            setAllStudents(result.users);
        }
    };

    const loadEnrolledStudents = async (courseId: string) => {
        const result = await (window as any).electronAPI.getEnrolledStudents(courseId);
        if (result.success) {
            setEnrolledStudents(result.students);
        }
    };

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();

        const result = await (window as any).electronAPI.createCourse(formData);

        if (result.success) {
            addNotification({
                type: 'success',
                title: 'Course Created',
                message: `${formData.courseName} (${formData.courseCode}) has been created successfully!`,
                duration: 5000
            });
            setFormData({ courseName: '', courseCode: '', description: '' });
            setShowCreateForm(false);
            loadCourses();
        } else {
            addNotification({
                type: 'error',
                title: 'Error Creating Course',
                message: result.error || 'Failed to create course',
                duration: 5000
            });
        }
    };

    const handleViewCourse = async (course: Course) => {
        setSelectedCourse(course);
        await loadEnrolledStudents(course.course_id);
    };

    const handleEnrollStudent = async (studentId: string) => {
        if (!selectedCourse) return;

        const student = allStudents.find(s => s.user_id === studentId);
        const result = await (window as any).electronAPI.enrollStudent(selectedCourse.course_id, studentId);

        if (result.success) {
            addNotification({
                type: 'success',
                title: 'Student Enrolled',
                message: `${student?.full_name || 'Student'} has been enrolled in ${selectedCourse.course_name}`,
                duration: 5000
            });
            await loadEnrolledStudents(selectedCourse.course_id);
            await loadCourses();
            setShowEnrollModal(false);
        } else {
            addNotification({
                type: 'error',
                title: 'Enrollment Failed',
                message: result.error || 'Failed to enroll student',
                duration: 5000
            });
        }
    };

    const handleUnenrollStudent = async (studentId: string) => {
        if (!selectedCourse) return;

        if (window.confirm('Are you sure you want to unenroll this student?')) {
            const student = enrolledStudents.find(s => s.user_id === studentId);
            const result = await (window as any).electronAPI.unenrollStudent(selectedCourse.course_id, studentId);

            if (result.success) {
                addNotification({
                    type: 'info',
                    title: 'Student Unenrolled',
                    message: `${student?.full_name || 'Student'} has been removed from ${selectedCourse.course_name}`,
                    duration: 5000
                });
                await loadEnrolledStudents(selectedCourse.course_id);
                await loadCourses();
            } else {
                addNotification({
                    type: 'error',
                    title: 'Unenrollment Failed',
                    message: result.error || 'Failed to unenroll student',
                    duration: 5000
                });
            }
        }
    };

    const getAvailableStudents = () => {
        const enrolledIds = enrolledStudents.map(s => s.user_id);
        return allStudents.filter(s => !enrolledIds.includes(s.user_id));
    };

    return (
        <div className="course-management">
            <div className="course-header">
                <h2>My Courses</h2>
                <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
                    Create New Course
                </button>
            </div>

            {showCreateForm && (
                <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Create New Course</h3>
                        <form onSubmit={handleCreateCourse}>
                            <div className="form-group">
                                <label>Course Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Introduction to Computer Science"
                                    value={formData.courseName}
                                    onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Course Code *</label>
                                <input
                                    type="text"
                                    placeholder="e.g., CS101"
                                    value={formData.courseCode}
                                    onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    placeholder="Course description..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={4}
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn-primary">Create Course</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedCourse && !showEnrollModal && (
                <div className="modal-overlay" onClick={() => { setSelectedCourse(null); setShowEnrollModal(false); }}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        <h3>{selectedCourse.course_name}</h3>
                        <p className="course-code">{selectedCourse.course_code}</p>
                        <p className="course-description">{selectedCourse.description}</p>

                        <div className="enrolled-students-section">
                            <div className="section-header">
                                <h4>Enrolled Students ({enrolledStudents.length})</h4>
                                <button className="btn-primary" onClick={(e) => { e.stopPropagation(); setShowEnrollModal(true); }}>
                                    Enroll Student
                                </button>
                            </div>

                            <div className="students-list">
                                {enrolledStudents.length === 0 ? (
                                    <p className="no-data">No students enrolled yet</p>
                                ) : (
                                    enrolledStudents.map(student => (
                                        <div key={student.user_id} className="student-item">
                                            <div className="student-info">
                                                <strong>{student.full_name}</strong>
                                                <span className="student-username">{student.username}</span>
                                            </div>
                                            <button
                                                className="btn-danger-small"
                                                onClick={(e) => { e.stopPropagation(); handleUnenrollStudent(student.user_id); }}
                                            >
                                                Unenroll
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <button className="btn-secondary" onClick={() => { setSelectedCourse(null); setShowEnrollModal(false); }}>
                            Close
                        </button>
                    </div>
                </div>
            )}

            {showEnrollModal && selectedCourse && (
                <div className="modal-overlay" onClick={() => setShowEnrollModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Enroll Student</h3>
                        <p className="modal-subtitle">Select a student to enroll in {selectedCourse.course_name}</p>
                        
                        <div className="students-list">
                            {getAvailableStudents().length === 0 ? (
                                <p className="no-data">
                                    {allStudents.length === 0 
                                        ? 'No students found. Please ask the admin to create student accounts first.' 
                                        : 'All students are already enrolled in this course.'}
                                </p>
                            ) : (
                                getAvailableStudents().map(student => (
                                    <div key={student.user_id} className="student-item">
                                        <div className="student-info">
                                            <strong>{student.full_name}</strong>
                                            <span className="student-username">@{student.username}</span>
                                        </div>
                                        <button
                                            className="btn-primary-small"
                                            onClick={(e) => { e.stopPropagation(); handleEnrollStudent(student.user_id); }}
                                        >
                                            Enroll
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        
                        <div className="form-actions">
                            <button className="btn-secondary" onClick={() => setShowEnrollModal(false)}>
                                Back to Course
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="courses-grid">
                {courses.length === 0 ? (
                    <div className="no-courses">
                        <p>No courses yet. Create your first course to get started!</p>
                    </div>
                ) : (
                    courses.map(course => (
                        <div key={course.course_id} className="course-card" onClick={() => handleViewCourse(course)}>
                            <h3>{course.course_name}</h3>
                            <p className="course-code">{course.course_code}</p>
                            <p className="course-description">{course.description}</p>
                            <div className="course-footer">
                                <span className="student-count">
                                    👥 {course.student_count} student{course.student_count !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default CourseManagement;
