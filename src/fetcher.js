import { MySchoolAppProvider } from "./providers/myschoolapp.js";
import { SessionExpiredError } from "./providers/base.js";
import { loadConfig, loadSession, readData, writeData } from "./session.js";

async function fetchSchool(school) {
  const provider = new MySchoolAppProvider(school, loadSession(school.id));
  const result = { students: [], assignments: [], grades: [] };
  result.students = await provider.listStudents();
  for (const student of result.students) {
    const [assignments, grades] = await Promise.all([
      provider.getAssignments(student),
      provider.getGrades(student),
    ]);
    result.assignments.push(...assignments);
    result.grades.push(...grades);
    console.log(
      `  ${school.name} / ${student.name}: ${assignments.length} assignments, ${grades.length} grades`
    );
  }

  // Enrich current/upcoming work with teacher instructions and links
  // (skip old history to keep refreshes fast).
  const cutoff = Date.now() - 2 * 86400e3;
  const toEnrich = result.assignments.filter(
    (a) =>
      ["todo", "in_progress", "overdue"].includes(a.status) ||
      (a.dateDue && new Date(a.dateDue).getTime() >= cutoff)
  );
  let enriched = 0;
  for (let i = 0; i < toEnrich.length; i += 5) {
    await Promise.all(
      toEnrich.slice(i, i + 5).map(async (a) => {
        try {
          a.detail = await provider.getAssignmentDetail(a.raw.AssignmentId);
          if (a.detail) {
            enriched++;
            if (a.maxPoints == null) a.maxPoints = a.detail.maxPoints;
          }
        } catch {}
      })
    );
  }
  if (toEnrich.length) {
    console.log(`  ${school.name}: details on ${enriched}/${toEnrich.length} current assignments`);
  }

  // Per-class grade details: earned points and teacher comments, merged
  // into the matching assignment rows.
  const perfByAssignment = new Map();
  for (const g of result.grades) {
    const student = result.students.find((s) => s.id === g.studentId);
    try {
      for (const perf of await provider.getGradeDetails(student, g.raw)) {
        perfByAssignment.set(`${g.studentId}:${perf.assignmentId}`, perf);
      }
    } catch {}
  }
  let comments = 0;
  for (const a of result.assignments) {
    const perf = perfByAssignment.get(`${a.studentId}:${a.raw.AssignmentId}`);
    if (!perf) continue;
    if (a.pointsEarned == null) a.pointsEarned = perf.points;
    if (a.maxPoints == null) a.maxPoints = perf.maxPoints;
    if (perf.points != null) a.status = "graded";
    if (perf.letter) (a.detail ??= {}).letter = perf.letter;
    if (perf.comment) {
      (a.detail ??= {}).comment = perf.comment;
      comments++;
    }
  }
  if (perfByAssignment.size) {
    console.log(
      `  ${school.name}: merged scores for ${perfByAssignment.size} graded assignments (${comments} teacher comments)`
    );
  }
  return result;
}

/**
 * @param {{relogin?: (school) => Promise<boolean>}} [options] — the Electron
 * app injects its own BrowserWindow-based session renewal here; the CLI
 * defaults to the Playwright one in relogin.js.
 */
export async function fetchAll({ relogin } = {}) {
  const config = loadConfig();
  const previous = readData("normalized.json");

  const out = {
    fetchedAt: new Date().toISOString(),
    schools: {},
    students: [],
    assignments: [],
    grades: [],
    errors: [],
  };

  for (const school of config.schools) {
    out.schools[school.id] = { name: school.name, host: school.host };
    try {
      let result;
      try {
        result = await fetchSchool(school);
      } catch (err) {
        if (!(err instanceof SessionExpiredError)) throw err;
        // The portal's auth cookie dies daily; renew it headlessly via the
        // Google session kept in the browser profile, then retry once.
        console.log(`  ${school.name}: session expired, renewing headlessly…`);
        const renew = relogin ?? (await import("./relogin.js")).reloginHeadless;
        if (!(await renew(school))) throw err;
        result = await fetchSchool(school);
      }
      out.students.push(...result.students);
      out.assignments.push(...result.assignments);
      out.grades.push(...result.grades);
    } catch (err) {
      const msg =
        err instanceof SessionExpiredError
          ? err.message
          : `${school.name}: ${err.message}`;
      console.warn(`  ⚠️  ${msg}`);
      // Keep the last good data for this school rather than blanking it,
      // even across several failed refreshes in a row.
      if (previous?.students?.some((s) => s.school === school.id)) {
        out.students.push(...previous.students.filter((s) => s.school === school.id));
        out.assignments.push(...previous.assignments.filter((a) => a.school === school.id));
        out.grades.push(...previous.grades.filter((g) => g.school === school.id));
        const staleSince = previous.stale?.[school.id] ?? previous.fetchedAt;
        (out.stale ??= {})[school.id] = staleSince;
        out.errors.push({
          school: school.id,
          message: `${school.name}: couldn't refresh (${
            err instanceof SessionExpiredError ? "session expired" : err.message
          }) — showing data from ${new Date(staleSince).toLocaleString()}. Fix by signing in again from the School Board menu.`,
        });
      } else {
        out.errors.push({ school: school.id, message: msg });
      }
    }
  }

  // A school may still list former/duplicate students (e.g. a sibling who
  // moved schools). Hide anyone with no assignments and no grades.
  out.students = out.students.filter((s) => {
    const has =
      out.assignments.some((a) => a.studentId === s.id && a.school === s.school) ||
      out.grades.some((g) => g.studentId === s.id && g.school === s.school);
    if (!has) console.log(`  (hiding ${s.name} @ ${s.school}: no data)`);
    return has;
  });

  const p = writeData("normalized.json", out);
  console.log(
    `\nSaved ${out.assignments.length} assignments / ${out.grades.length} grades ` +
      `for ${out.students.length} students → ${p}`
  );
  return out;
}

/** Dump raw responses for one school so endpoint mismatches are easy to fix. */
export async function probe(school) {
  const session = loadSession(school.id);
  const provider = new MySchoolAppProvider(school, session);
  const ctx = await provider.context();
  writeData(`probe-${school.id}/context.json`, ctx);
  console.log(`Saved data/probe-${school.id}/context.json`);
  try {
    const students = await provider.listStudents();
    writeData(`probe-${school.id}/students.json`, students);
    console.log(`Found students: ${students.map((s) => s.name).join(", ")}`);
    const start = new Date(Date.now() - 7 * 86400e3);
    const end = new Date(Date.now() + 14 * 86400e3);
    for (const s of students) {
      const a = await provider.getAssignments(s, start, end);
      writeData(`probe-${school.id}/assignments-${s.id}.json`, a);
      console.log(`  ${s.name}: ${a.length} assignments (saved raw)`);
    }
  } catch (err) {
    console.warn(`Probe stopped after context: ${err.message}`);
    console.warn(
      `Inspect data/probe-${school.id}/context.json and adjust src/providers/myschoolapp.js.`
    );
  }
}
