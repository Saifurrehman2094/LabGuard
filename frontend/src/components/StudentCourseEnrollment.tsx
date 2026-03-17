import React, { useState, useEffect } from 'react';
import './StudentCourseEnrollment.css';

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
    const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCourses();
    }, [user]);

    const loadCourses = async () => {
        setLoading(true);
        try {
            const enrolledResult = await (window as any).electronAPI.getStudentCourses(user.userId);
            if (enrolledResult.success) {
                setEnrolledCourses(enrolledResult.courses);
            }
        } catch (error) {
            console.error('Error loading courses:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading">Loading courses...</div>;
    }

    return (
        <div className="student-course-enrollment">
            <div className="enrollment-header">
                <h2>My Courses</h2>
                <p className="enrollment-hint">Courses you are enrolled in (enrolled by your teacher)</p>
            </div>

            <div className="enrolled-courses">
                {enrolledCourses.length === 0 ? (
                    <div className="no-courses">
                        <p>You are not enrolled in any courses yet.</p>
                        <p className="no-courses-hint">Your teacher will enroll you in courses. Contact your teacher or administrator if you need access to a course.</p>
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
        </div>
    );
};

export default StudentCourseEnrollment;
