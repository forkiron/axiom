import schoolData from './data/school-difficulty.json';
import type { SchoolDatum } from './types';

interface SubjectScores {
  math: number;
  physics: number;
  english: number;
}

// ensure we only operate on entries which actually have difficulty information
type DifficultyDatum = SchoolDatum & {
  difficulty: SubjectScores;
};

/**
 * Compute the simple arithmetic mean of all schools for each subject.
 */
export function computeSubjectAverages(
  schools: DifficultyDatum[] = schoolData as DifficultyDatum[]
): SubjectScores {
  const totals: SubjectScores = { math: 0, physics: 0, english: 0 };
  schools.forEach((s) => {
    totals.math += s.difficulty.math;
    totals.physics += s.difficulty.physics;
    totals.english += s.difficulty.english;
  });

  const count = schools.length || 1;
  return {
    math: totals.math / count,
    physics: totals.physics / count,
    english: totals.english / count,
  };
}

/**
 * For a school datum, calculate how its difficulty compares to the national average.
 * The returned values are "relative difficulties": positive means harder than average,
 * negative means easier. (Optionally you could divide by the average to get a ratio.)
 */
export function relativeDifficulty(
  school: DifficultyDatum,
  averages: SubjectScores = computeSubjectAverages()
): SubjectScores {
  return {
    math: school.difficulty.math - averages.math,
    physics: school.difficulty.physics - averages.physics,
    english: school.difficulty.english - averages.english,
  };
}

/**
 * If you'd prefer a single scalar index for a school, you can average the three
 * subject relative values (or take a weighted sum).
 */
export function overallRelativeIndex(
  school: DifficultyDatum,
  averages: SubjectScores = computeSubjectAverages()
): number {
  const rel = relativeDifficulty(school, averages);
  return (rel.math + rel.physics + rel.english) / 3;
}
