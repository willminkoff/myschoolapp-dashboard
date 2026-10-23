/**
 * Provider interface. Every data source (unofficial myschoolapp JSON API today,
 * official SKY API later) implements these three methods and returns the same
 * normalized shapes, so the fetcher and dashboard never care which one is used.
 *
 * Normalized shapes:
 *
 * Student:    { id, name, school }
 * Assignment: { studentId, school, className, title, type,
 *               dateAssigned, dateDue,            // ISO strings or null
 *               status,                           // "todo" | "in_progress" | "completed" | "graded" | "overdue" | "unknown"
 *               pointsEarned, maxPoints,          // numbers or null
 *               raw }                             // original API object, for debugging
 * Grade:      { studentId, school, className, term, grade, raw }
 */
export class Provider {
  /** @param {{id: string, name: string, host: string}} school */
  constructor(school) {
    this.school = school;
  }

  /** @returns {Promise<Student[]>} the parent's children at this school */
  async listStudents() {
    throw new Error("not implemented");
  }

  /** @returns {Promise<Assignment[]>} */
  async getAssignments(student, startDate, endDate) {
    throw new Error("not implemented");
  }

  /** @returns {Promise<Grade[]>} current cumulative grades per class */
  async getGrades(student) {
    throw new Error("not implemented");
  }
}

export class SessionExpiredError extends Error {
  constructor(schoolId) {
    super(
      `Session for "${schoolId}" is missing or expired — sign in again from the School Board menu (the graduation cap in the menu bar).`
    );
    this.schoolId = schoolId;
  }
}
