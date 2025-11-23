import React, { useState, useEffect } from 'react';
import './StudentCourseEnrollment.css';

interface Course {
    course_id: string;
    course_name: string;
    course_code: string;
    teacher_name: string;
    description: string;
    student_count: number;
}

interface EnrolledCourse {
    course_id: string;
    course_name: string;
    course_code: string;
    teacher_name: string;
    description: string;
    enrolled_at: string;
}

interface StudentCourseEnrollmentProps {
    user: any;
}

const StudentCourseEnrollment: React.FC<StudentCourseEnrollmentProps> = ({ user }) => {
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'enrolled' | 'available'>('enrolled');

    useEffect(() => {
        loadCourses();
    }, [user]);

    const loadCourses = async () => {
        setLoading(true);
        try {
            // Load enrolled courses
            const enrolledResult = await (window as any).electronAPI.getStudentCourses(user.userId);
            if (enrolledResult.success) {
                setEnrolledCourses(enrolledResult.courses);
            }

            // Load all available courses
            const allResult = await (window as any).electronAPI.getAllCourses();
            if (allResult.success) {
                setAllCourses(allResult.courses);
            }
        } catch (error) {
            console.error('Error loading courses:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEnroll = async (courseId: string) => {
        try {
            const result = await (window as any).electronAPI.selfEnrollInCourse(courseId);

            if (result.success) {
                alert('Successfully enrolled in course!');
                await loadCourses();
                setActiveTab('enrolled');
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            console.error('Error enrolling:', error);
            alert('Failed to enroll in course');
        }
    };

    const getAvailableCourses = () => {
        const enrolledIds = enrolledCourses.map(c => c.course_id);
        return allCourses.filter(c => !enrolledIds.includes(c.course_id));
    };

    if (loading) {
        return <div className="loading">Loading courses...</div>;
    }

    return (
        <div className="student-course-enrollment">
            <div className="enrollment-header">
                <h2>My Courses</h2>
                <div className="tab-buttons">
                    <button
                        className={`tab-btn ${activeTab === 'enrolled' ? 'active' : ''}`}
                        onClick={() => setActiveTab('enrolled')}
                    >
                        Enrolled Courses ({enrolledCourses.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'available' ? 'active' : ''}`}
                        onClick={() => setActiveTab('available')}
                    >
                        Available Courses ({getAvailableCourses().length})
                    </button>
                </div>
            </div>

            {activeTab === 'enrolled' && (
                <div className="enrolled-courses">
                    {enrolledCourses.length === 0 ? (
                        <div className="no-courses">
                            <p>You are not enrolled in any courses yet.</p>
                            <button
                                className="btn-primary"
                                onClick={() => setActiveTab('available')}
                            >
                                Browse Available Courses
                            </button>
                        </div>
                    ) : (
                        <div className="courses-grid">
                            {enrolledCourses.map(course => (
                                <div key={course.course_id} className="course-card enrolled">
                                    <div className="course-badge">Enrolled</div>
                                    <h3>{course.course_name}</h3>
                                    <p className="course-code">{course.course_code}</p>
                                    <p className="course-teacher">👨‍🏫 {course.teacher_name}</p>
                                    <p className="course-description">{course.description}</p>
                                    <p className="enrolled-date">
                                        Enrolled: {new Date(course.enrolled_at).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'available' && (
                <div className="available-courses">
                    {getAvailableCourses().length === 0 ? (
                        <div className="no-courses">
                            <p>No more courses available to enroll.</p>
                            <p>You are already enrolled in all available courses!</p>
                        </div>
                    ) : (
                        <div className="courses-grid">
                            {getAvailableCourses().map(course => (
                                <div key={course.course_id} className="course-card available">
                                    <h3>{course.course_name}</h3>
                                    <p className="course-code">{course.course_code}</p>
                                    <p className="course-teacher">👨‍🏫 {course.teacher_name}</p>
                                    <p className="course-description">{course.description}</p>
                                    <div className="course-footer">
                                        <span className="student-count">
                                            👥 {course.student_count} student{course.student_count !== 1 ? 's' : ''}
                                        </span>
                                        <button
                                            className="btn-enroll"
                                            onClick={() => handleEnroll(course.course_id)}
                                        >
                                            Enroll Now
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StudentCourseEnrollment;
