import React, { useState } from 'react';
import StudentScoresPanel from './StudentScoresPanel';
import StudentsPage from './students/StudentsPage';
import './StudentsHub.css';

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

interface StudentsHubProps {
  teacherId: string;
  exams: Exam[];
}

const StudentsHub: React.FC<StudentsHubProps> = ({ teacherId, exams }) => {
  const [activeView, setActiveView] = useState<'scores' | 'profiles'>('scores');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  return (
    <div className="students-hub">
      <div className="students-hub-header">
        <div>
          <h2>Students</h2>
          <p>Start from the score matrix, then jump into a full student performance profile when you need more context.</p>
        </div>
        <div className="students-hub-tabs">
          <button
            className={activeView === 'scores' ? 'active' : ''}
            onClick={() => setActiveView('scores')}
          >
            Score Matrix
          </button>
          <button
            className={activeView === 'profiles' ? 'active' : ''}
            onClick={() => setActiveView('profiles')}
          >
            Student Profiles
          </button>
        </div>
      </div>

      <div className="students-hub-body">
        {activeView === 'scores' ? (
          <StudentScoresPanel
            exams={exams}
            onOpenProfile={(studentId) => {
              setSelectedStudentId(studentId);
              setActiveView('profiles');
            }}
          />
        ) : (
          <StudentsPage teacherId={teacherId} initialStudentId={selectedStudentId} />
        )}
      </div>
    </div>
  );
};

export default StudentsHub;
