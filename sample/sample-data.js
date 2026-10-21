/** Fake family data for previewing the dashboard without any school logins. */
export function sampleData() {
  const day = (n, h = 23, m = 59) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const A = (studentId, school, className, title, type, due, status, pe = null, mp = null) => ({
    studentId, school, className, title, type,
    dateAssigned: day(-3), dateDue: due, status,
    pointsEarned: pe, maxPoints: mp, raw: {},
  });
  return {
    fetchedAt: new Date().toISOString(),
    schools: {
      lakeside: { name: "Lakeside Academy", host: "lakeside.myschoolapp.com" },
      oakwood: { name: "Oakwood School", host: "oakwood.myschoolapp.com" },
      riverview: { name: "Riverview Prep", host: "riverview.myschoolapp.com" },
    },
    students: [
      { id: "101", name: "Ava", school: "lakeside" },
      { id: "202", name: "Ben", school: "oakwood" },
      { id: "303", name: "Clara", school: "riverview" },
    ],
    assignments: [
      A("101", "lakeside", "Algebra II", "Ch. 4 problem set", "Homework", day(-1), "todo"),
      A("101", "lakeside", "English 10", "Gatsby essay outline", "Essay", day(0), "in_progress"),
      A("101", "lakeside", "Chemistry", "Lab report: titration", "Lab", day(2), "todo"),
      A("101", "lakeside", "US History", "Unit 3 reading quiz", "Quiz", day(6), "todo"),
      A("202", "oakwood", "Math 7", "Fractions worksheet", "Homework", day(0), "completed"),
      A("202", "oakwood", "Science", "Ecosystem diorama", "Project", day(1), "todo"),
      A("202", "oakwood", "ELA", "Vocabulary set 8", "Homework", day(3), "todo"),
      A("202", "oakwood", "Spanish", "Oral practice recording", "Homework", day(9), "todo"),
      A("303", "riverview", "Pre-Calc", "Trig identities quiz", "Quiz", day(1), "todo"),
      A("303", "riverview", "Biology", "Cell cycle worksheet", "Homework", day(-2), "graded", 18, 20),
      A("303", "riverview", "World Lit", "Poetry annotation", "Homework", day(4), "todo"),
      A("303", "riverview", "AP Euro", "DBQ practice essay", "Essay", day(12), "todo"),
    ],
    grades: [
      { studentId: "101", school: "lakeside", className: "Algebra II", term: "Fall", grade: "91.2", raw: {} },
      { studentId: "101", school: "lakeside", className: "English 10", term: "Fall", grade: "88.5", raw: {} },
      { studentId: "202", school: "oakwood", className: "Math 7", term: "T1", grade: "94.0", raw: {} },
      { studentId: "202", school: "oakwood", className: "Science", term: "T1", grade: "89.7", raw: {} },
      { studentId: "303", school: "riverview", className: "Pre-Calc", term: "Fall", grade: "96.1", raw: {} },
      { studentId: "303", school: "riverview", className: "Biology", term: "Fall", grade: "92.8", raw: {} },
    ],
    errors: [],
  };
}
