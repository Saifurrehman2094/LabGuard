import { useState, useEffect, useCallback } from 'react';
import {
  StudentSummary,
  StudentProfile,
  AtRiskStudent,
  ReportData
} from '../types/studentAnalytics';

interface UseStudentAnalyticsReturn {
  students: StudentSummary[];
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string | null) => void;
  studentProfile: StudentProfile | null;
  atRiskStudents: AtRiskStudent[];
  isLoadingStudents: boolean;
  isLoadingProfile: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  generateReport: (studentId: string, format: 'text' | 'json') => Promise<void>;
  error: string | null;
}

const eAPI = () => (window as any).electronAPI;

export function useStudentAnalytics(teacherId: string): UseStudentAnalyticsReturn {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all students
  const fetchStudents = useCallback(async () => {
    if (!teacherId) return;
    setIsLoadingStudents(true);
    setError(null);
    try {
      const result = await eAPI().studentsGetAll(teacherId);
      if (result.success) {
        setStudents(result.students || []);
        setLastUpdated(new Date());
      } else {
        setError(result.error || 'Failed to fetch students');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoadingStudents(false);
    }
  }, [teacherId]);

  // Fetch at-risk students
  const fetchAtRiskStudents = useCallback(async () => {
    if (!teacherId) return;
    try {
      const result = await eAPI().studentsGetAtRisk(teacherId);
      if (result.success) {
        setAtRiskStudents(result.atRiskStudents || []);
      }
    } catch (err) {
      console.warn('Failed to fetch at-risk students:', err);
    }
  }, [teacherId]);

  // Fetch selected student profile
  const fetchStudentProfile = useCallback(
    async (studentId: string) => {
      if (!teacherId || !studentId) return;
      setIsLoadingProfile(true);
      setError(null);
      try {
        const result = await eAPI().studentsGetProfile({
          teacherId,
          studentId
        });
        if (result.success) {
          setStudentProfile(result.profile);
          setLastUpdated(new Date());
        } else {
          setError(result.error || 'Failed to fetch student profile');
          setStudentProfile(null);
        }
      } catch (err) {
        setError((err as Error).message);
        setStudentProfile(null);
      } finally {
        setIsLoadingProfile(false);
      }
    },
    [teacherId]
  );

  // Initial load
  useEffect(() => {
    fetchStudents();
    fetchAtRiskStudents();
  }, [fetchStudents, fetchAtRiskStudents]);

  // Load profile when student is selected
  useEffect(() => {
    if (selectedStudentId) {
      fetchStudentProfile(selectedStudentId);
    } else {
      setStudentProfile(null);
    }
  }, [selectedStudentId, fetchStudentProfile]);

  // Listen for real-time updates
  useEffect(() => {
    const api = eAPI();
    if (!api?.onDashboardUpdated) return;

    const unsubscribe = api.onDashboardUpdated((event: any, data: any) => {
      if (
        data.type === 'submissionAdded' ||
        data.type === 'examGraded' ||
        data.type === 'testCaseAdded'
      ) {
        // Refresh students list
        fetchStudents();
        fetchAtRiskStudents();

        // Refresh current profile if one is selected
        if (selectedStudentId) {
          fetchStudentProfile(selectedStudentId);
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [selectedStudentId, fetchStudents, fetchAtRiskStudents, fetchStudentProfile]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchStudents();
    await fetchAtRiskStudents();
  }, [fetchStudents, fetchAtRiskStudents]);

  const refreshProfile = useCallback(async () => {
    if (selectedStudentId) {
      await fetchStudentProfile(selectedStudentId);
    }
  }, [selectedStudentId, fetchStudentProfile]);

  // Generate and download report
  const generateReport = useCallback(
    async (studentId: string, format: 'text' | 'json') => {
      if (!teacherId) return;
      try {
        const result = await eAPI().studentsGenerateReport({
          teacherId,
          studentId,
          format
        });

        if (result.success) {
          // Download the report
          const blob = new Blob([result.content], {
            type: format === 'json' ? 'application/json' : 'text/plain'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          setError(result.error || 'Failed to generate report');
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [teacherId]
  );

  return {
    students,
    selectedStudentId,
    setSelectedStudentId,
    studentProfile,
    atRiskStudents,
    isLoadingStudents,
    isLoadingProfile,
    lastUpdated,
    refresh,
    refreshProfile,
    generateReport,
    error
  };
}
