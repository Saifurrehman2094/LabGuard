/**
 * Student Analytics Service - Concept performance tracking, trend analysis, at-risk detection
 * All computations happen here (not in SQL) for flexibility
 */

/**
 * Compute per-concept statistics from student's submission history
 * @param {Array} submissions - Array of submission objects from Query 2
 * @returns {Array<ConceptStat>} Sorted by fail rate descending
 */
function computeConceptStats(submissions) {
  const conceptMap = {};

  for (const sub of submissions) {
    let concepts = [];
    try {
      concepts = JSON.parse(sub.required_concepts || '[]');
    } catch (e) {
      concepts = [];
    }

    const passed = sub.concept_passed === 1 || sub.concept_passed === true;
    const score = sub.score || 0;

    for (const concept of concepts) {
      if (!conceptMap[concept]) {
        conceptMap[concept] = {
          concept,
          attempts: [],
          totalAttempts: 0,
          passedCount: 0,
          failedCount: 0,
          failRate: 0,
          avgScore: 0,
          lastSeen: null,
          trend: 'neutral', // 'improving' | 'worsening' | 'neutral'
          consecutiveFailures: 0,
          isAtRisk: false
        };
      }

      const entry = {
        passed,
        score,
        submittedAt: sub.submitted_at,
        examTitle: sub.examTitle,
        questionTitle: sub.questionTitle
      };

      conceptMap[concept].attempts.push(entry);
      conceptMap[concept].totalAttempts++;

      if (passed && score >= 60) {
        conceptMap[concept].passedCount++;
      } else {
        conceptMap[concept].failedCount++;
      }

      if (!conceptMap[concept].lastSeen || sub.submitted_at > conceptMap[concept].lastSeen) {
        conceptMap[concept].lastSeen = sub.submitted_at;
      }
    }
  }

  // Post-process each concept
  for (const key of Object.keys(conceptMap)) {
    const c = conceptMap[key];
    c.failRate = Math.round((c.failedCount / c.totalAttempts) * 100);
    c.avgScore = Math.round(
      c.attempts.reduce((s, a) => s + a.score, 0) / c.attempts.length
    );

    // Trend: compare first half vs second half of attempts
    if (c.attempts.length >= 4) {
      const half = Math.floor(c.attempts.length / 2);
      const firstHalf = c.attempts.slice(0, half);
      const secondHalf = c.attempts.slice(half);
      const firstAvg = firstHalf.reduce((s, a) => s + a.score, 0) / half;
      const secondAvg = secondHalf.reduce((s, a) => s + a.score, 0) / secondHalf.length;
      if (secondAvg > firstAvg + 10) c.trend = 'improving';
      else if (secondAvg < firstAvg - 10) c.trend = 'worsening';
      else c.trend = 'neutral';
    } else if (c.attempts.length >= 2) {
      // For smaller sample, just compare latest vs earliest
      const firstScore = c.attempts[0].score;
      const lastScore = c.attempts[c.attempts.length - 1].score;
      if (lastScore > firstScore + 10) c.trend = 'improving';
      else if (lastScore < firstScore - 10) c.trend = 'worsening';
    }

    // Consecutive failures (at-risk check) — count from most recent backward
    const sorted = [...c.attempts].sort(
      (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
    );
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].passed || sorted[i].score < 60) {
        streak++;
      } else {
        break;
      }
    }
    c.consecutiveFailures = streak;
    c.isAtRisk = streak >= 2;
  }

  return Object.values(conceptMap).sort((a, b) => b.failRate - a.failRate);
}

/**
 * Compute overall improvement trend across exams
 * @param {Array} examPerformance - Per-exam avg scores sorted by date
 * @returns {string} 'improving' | 'declining' | 'stable' | 'insufficient_data'
 */
function computeImprovementTrend(examPerformance) {
  if (examPerformance.length < 2) return 'insufficient_data';
  const scores = examPerformance.map(e => e.avgScore);
  const first = scores.slice(0, Math.ceil(scores.length / 2));
  const second = scores.slice(Math.ceil(scores.length / 2));
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;
  if (secondAvg > firstAvg + 8) return 'improving';
  if (secondAvg < firstAvg - 8) return 'declining';
  return 'stable';
}

/**
 * Generate a plain-text report for a student
 * @param {object} studentProfile - Full profile from backend
 * @param {string} teacherName - Name of the teacher generating the report
 * @returns {string} Plain text report
 */
function generateReportText(studentProfile, teacherName = 'Instructor') {
  const {
    student,
    conceptStats,
    examPerformance,
    atRiskConcepts,
    overallTrend,
    submissions
  } = studentProfile;

  const date = new Date().toLocaleDateString('en-GB');
  const time = new Date().toLocaleTimeString('en-GB');

  let report = `LABGUARD STUDENT PERFORMANCE REPORT
Generated: ${date} at ${time}
Teacher: ${teacherName}
================================================================================

STUDENT OVERVIEW
================================================================================
Name: ${student.name}
Email: ${student.email}
Overall Average Score: ${student.overallAvgScore}%
Total Questions Attempted: ${student.totalSubmissions}
Exams Completed: ${student.examsAttempted}
Overall Trend: ${overallTrend.toUpperCase()}
Last Active: ${student.lastActive ? new Date(student.lastActive).toLocaleDateString() : 'N/A'}

================================================================================
CONCEPT PERFORMANCE SUMMARY
================================================================================
`;

  if (conceptStats.length === 0) {
    report += 'No concept data available for this student.\n';
  } else {
    for (const c of conceptStats) {
      const status = c.isAtRisk
        ? '[⚠️  AT RISK]'
        : c.failRate > 50
        ? '[⚡ NEEDS ATTENTION]'
        : '[✓ OK]';
      const trendArrow = c.trend === 'improving' ? '↑' : c.trend === 'worsening' ? '↓' : '→';

      report += `
${status} ${c.concept.toUpperCase()}
  Attempts: ${c.totalAttempts} | Passed: ${c.passedCount} | Failed: ${c.failedCount}
  Fail Rate: ${c.failRate}% | Average Score: ${c.avgScore}%
  Trend: ${trendArrow} (${c.trend}) | Consecutive Failures: ${c.consecutiveFailures}
  Last Attempted: ${c.lastSeen ? new Date(c.lastSeen).toLocaleDateString() : 'N/A'}
`;
    }
  }

  report += `
================================================================================
EXAM-BY-EXAM PERFORMANCE
================================================================================
`;

  if (examPerformance.length === 0) {
    report += 'No exams attempted.\n';
  } else {
    for (const exam of examPerformance) {
      if (exam.questionsAttempted === 0) continue;
      report += `
${exam.examTitle}
  Date: ${new Date(exam.examDate).toLocaleDateString()}
  Questions Attempted: ${exam.questionsAttempted}
  Average Score: ${exam.avgScore}%
  Passed: ${exam.passedCount} | Failed: ${exam.failedCount}
  Hardcoding Flags: ${exam.hardcodingFlags}
`;
    }
  }

  if (atRiskConcepts.length > 0) {
    report += `
================================================================================
⚠️  AT-RISK CONCEPTS — REQUIRES IMMEDIATE ATTENTION
================================================================================
The following concepts have been failed in 2 or more consecutive questions.
Immediate intervention is recommended.

`;
    for (const c of atRiskConcepts) {
      report += `  • ${c.concept}: ${c.consecutiveFailures} consecutive failures\n`;
    }
  }

  report += `
================================================================================
TEACHER RECOMMENDATIONS
================================================================================
`;

  if (conceptStats.length === 0) {
    report += `Unable to generate recommendations due to insufficient concept data.\n`;
  } else {
    const failing = conceptStats.filter(c => c.failRate >= 60);
    if (failing.length === 0) {
      report += `✓ Student is performing well across all tested concepts.\n`;
    } else {
      report += `Areas requiring attention:\n\n`;
      for (const c of failing) {
        if (c.failRate >= 80) {
          report += `• ${c.concept} (${c.failRate}% fail rate): CRITICAL GAP\n`;
          report += `  Recommendation: One-on-one session and targeted practice problems\n\n`;
        } else if (c.failRate >= 60) {
          report += `• ${c.concept} (${c.failRate}% fail rate): Needs reinforcement\n`;
          report += `  Recommendation: Review fundamentals and attempt additional practice exercises\n\n`;
        }
      }
    }
  }

  // Personalized suggestions per concept
  if (atRiskConcepts.length > 0) {
    report += `Priority Action Items:\n\n`;
    for (let i = 0; i < Math.min(3, atRiskConcepts.length); i++) {
      const c = atRiskConcepts[i];
      const suggestion = getConceptSuggestion(c.concept);
      report += `${i + 1}. ${c.concept}: ${suggestion}\n`;
    }
  }

  report += `
================================================================================
SUBMISSION HISTORY
================================================================================
`;

  if (submissions.length === 0) {
    report += 'No submissions on record.\n';
  } else {
    report += `Total submissions: ${submissions.length}\n\n`;
    const recentSubs = submissions.slice(-10); // Last 10
    for (const sub of recentSubs) {
      const status = sub.concept_passed ? '✓' : '✗';
      report += `${status} ${sub.questionTitle} (${sub.examTitle})\n`;
      report += `   Score: ${sub.score}%, Date: ${new Date(sub.submitted_at).toLocaleDateString()}\n`;
    }
    if (submissions.length > 10) {
      report += `   ... and ${submissions.length - 10} more submissions\n`;
    }
  }

  report += `
================================================================================
Generated by LabGuard — AI-Powered Exam Platform
Report Date: ${date} ${time}
================================================================================
`;

  return report;
}

/**
 * Get personalized suggestion text for a concept
 * @param {string} concept - Concept name
 * @returns {string} Suggestion text
 */
function getConceptSuggestion(concept) {
  const suggestions = {
    arrays: 'Practice array traversal, boundary conditions, and common patterns (sum, max, search)',
    pointers: 'Review pointer arithmetic, dereferencing, and memory management with guided practice',
    '2D arrays': 'Practice nested loop iteration and row/column access patterns',
    sorting: 'Review sort algorithms, swap mechanics, and verify correct boundary handling',
    loops: 'Focus on loop structure, iteration counts, and termination conditions',
    conditionals: 'Practice nested if-else chains and edge case handling',
    strings: 'Review character indexing, string functions, and common string operations',
    recursion: 'Focus on base cases, recursive structure, and stack depth understanding',
    nested_loops: 'Practice outer/inner loop index management and nested iteration patterns',
    'brute force': 'Understand when to use brute force and optimize loop efficiency'
  };

  return (
    suggestions[concept] ||
    `Review ${concept} fundamentals and attempt additional practice problems aligned with course materials`
  );
}

module.exports = {
  computeConceptStats,
  computeImprovementTrend,
  generateReportText,
  getConceptSuggestion
};
