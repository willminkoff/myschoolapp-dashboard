import { Provider, SessionExpiredError } from "./base.js";
import { cookieHeaderFor } from "../session.js";

/**
 * Unofficial provider: calls the same internal JSON endpoints the
 * {school}.myschoolapp.com web UI uses, authenticated with the parent's
 * browser session cookies (captured via the app's per-school sign-in).
 *
 * These endpoints are unsupported by Blackbaud and can change without notice.
 * They are centralized here so a breakage is a one-file fix. If a school's
 * responses don't match expectations, run probe() from src/fetcher.js to
 * dump the raw responses into data/probe-<schoolId>/ and adjust.
 */

// persona 1 = parent in the myschoolapp web UI (verified against FRA)
const PERSONA_PARENT = 1;

// AssignmentStatusType codes observed in the Assignment Center payloads.
// Unknown codes fall through to "unknown" and keep the raw object.
const STATUS_MAP = {
  "-1": "todo",
  0: "in_progress",
  1: "completed",
  2: "overdue",
  4: "graded",
};

// The assignment-center payload arrives pre-bucketed by due date.
// PastBeforeLastWeek is skipped — months of history we don't need.
const ASSIGNMENT_BUCKETS = [
  "Overdue",
  "DueToday",
  "DueTomorrow",
  "DueThisWeek",
  "DueNextWeek",
  "DueAfterNextWeek",
  "PastThisWeek",
  "PastLastWeek",
];

export class MySchoolAppProvider extends Provider {
  constructor(school, session) {
    super(school);
    if (!session) throw new SessionExpiredError(school.id);
    this.cookieHeader = cookieHeaderFor(session, school.host);
    if (!this.cookieHeader) throw new SessionExpiredError(school.id);
    this._context = null;
  }

  async api(pathAndQuery) {
    const url = `https://${this.school.host}${pathAndQuery}`;
    const res = await fetch(url, {
      headers: {
        cookie: this.cookieHeader,
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest",
        referer: `https://${this.school.host}/app/`,
      },
      redirect: "manual",
    });
    // Expired sessions typically 302 to the login page or return HTML
    if (res.status === 302 || res.status === 401 || res.status === 403) {
      throw new SessionExpiredError(this.school.id);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new SessionExpiredError(this.school.id);
    }
  }

  /** The web app's bootstrap blob: current user, personas, children, school year. */
  async context() {
    if (!this._context) {
      const ctx = await this.api("/api/webapp/context");
      // Anonymous visitors get a 200 JSON context too — no user id means
      // the session cookie is dead.
      const ui = ctx.UserInfo || ctx.MasterUserInfo || {};
      if (!(ui.UserId ?? ui.Id ?? ctx.UserId)) {
        throw new SessionExpiredError(this.school.id);
      }
      this._context = ctx;
    }
    return this._context;
  }

  async listStudents() {
    const ctx = await this.context();
    // Children have appeared under a few keys across versions; try them in order.
    let candidates = ctx.Children || ctx.children || ctx.UserInfo?.Children || [];
    // The same child appears once per role ("All School", "Student", …); dedupe by id.
    const seen = new Set();
    candidates = candidates.filter((c) => {
      const id = String(c.Id ?? c.UserId ?? c.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const students = candidates.map((c) => ({
      id: String(c.Id ?? c.UserId ?? c.id),
      name:
        c.FirstName && c.LastName
          ? `${c.FirstName} ${c.LastName}`
          : c.StudentDisplay || c.Name || `Student ${c.Id ?? c.UserId}`,
      school: this.school.id,
    }));
    if (students.length === 0) {
      throw new Error(
        `No children found in /api/webapp/context for "${this.school.id}". ` +
          `Dump data/probe-${this.school.id}/context.json with probe() from src/fetcher.js ` +
          `to find where the student list lives, then update listStudents() in src/providers/myschoolapp.js.`
      );
    }
    return students;
  }

  async getAssignments(student /*, startDate, endDate — payload is pre-bucketed */) {
    // Modern assignment-center endpoint, verified against FRA. Returns one
    // object with assignments pre-bucketed by due date.
    const payload = await this.api(
      `/api/assignment2/ParentStudentAssignmentCenterGet?studentUserId=${student.id}`
    );
    if (typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(
        `Unexpected assignments response for ${this.school.id} — probe() in src/fetcher.js dumps the raw payloads.`
      );
    }
    const out = [];
    const seen = new Set();
    for (const bucket of ASSIGNMENT_BUCKETS) {
      for (const a of payload[bucket] ?? []) {
        if (seen.has(a.AssignmentIndexId ?? a.AssignmentId)) continue;
        seen.add(a.AssignmentIndexId ?? a.AssignmentId);
        let status =
          STATUS_MAP[String(a.AssignmentStatusType ?? a.AssignmentStatus ?? "")] ??
          "unknown";
        if (a.HasGrade) status = "graded";
        else if (a.MissingInd || a.LateInd) status = "overdue";
        out.push({
          studentId: student.id,
          school: this.school.id,
          className: a.GroupName ?? null,
          title: cleanText(a.ShortDescription) || "(untitled)",
          type: a.AssignmentType ?? null,
          dateAssigned: parseMsaDate(a.DateAssigned),
          dateDue: parseMsaDate(a.DateDue),
          status,
          pointsEarned: numOrNull(a.Grade ?? a.PointsEarned),
          maxPoints: numOrNull(a.MaxPoints),
          raw: a,
        });
      }
    }
    return out;
  }

  /**
   * Rich detail for one assignment: the teacher's full instructions, any
   * attached links, and file names. Returns null when there's nothing extra.
   */
  async getAssignmentDetail(assignmentId) {
    const d = await this.api(`/api/assignment2/read/${assignmentId}/?format=json`);
    const instructions = cleanMultiline(d.LongDescription);
    const links = (d.LinkItems ?? [])
      .filter((l) => l.Url)
      .map((l) => ({ url: l.Url, title: cleanText(l.ShortDescription) || l.Url }));
    const files = (d.DownloadItems ?? [])
      .map((f) => cleanText(f.FriendlyFileName || f.FileName))
      .filter(Boolean);
    if (!instructions && links.length === 0 && files.length === 0) return null;
    return { instructions, links, files, maxPoints: numOrNull(d.MaxPoints) };
  }

  /**
   * Per-assignment scores and teacher comments for one class (the portal's
   * "See grade details" view). classRaw is a raw row from getGrades().
   */
  async getGradeDetails(student, classRaw) {
    const sectionId = classRaw.sectionid ?? classRaw.leadsectionid;
    const markingPeriodId = classRaw.markingperiodid;
    if (!sectionId || !markingPeriodId) return [];
    const rows = await this.api(
      `/api/gradebook/AssignmentPerformanceStudent?sectionId=${sectionId}` +
        `&markingPeriodId=${markingPeriodId}&studentId=${student.id}`
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      assignmentId: r.AssignmentId,
      comment: cleanMultiline(r.Comment),
      points: numOrNull(r.Points),
      maxPoints: numOrNull(r.MaxPoints),
      letter: String(r.Letter ?? "").trim() || null,
      late: Boolean(r.Late),
      missing: Boolean(r.Missing),
    }));
  }

  async getGrades(student) {
    // Flow verified against FRA: current year label → current academic term
    // (duration) → classes with cumulative grades.
    const years = await this.api("/api/datadirect/SchoolYearsGet");
    const yearLabel = (Array.isArray(years) &&
      (years.find((y) => y.Current) ?? years.at(-1)))?.Label;
    if (!yearLabel) return [];
    const terms = await this.api(
      `/api/DataDirect/StudentGroupTermList/?studentUserId=${student.id}` +
        `&schoolYearLabel=${encodeURIComponent(yearLabel)}&personaId=${PERSONA_PARENT}`
    );
    // OfferingType 1 = academic classes; CurrentInd marks the active term.
    const current =
      (Array.isArray(terms) &&
        (terms.find((t) => t.OfferingType === 1 && t.CurrentInd) ??
          terms.find((t) => t.CurrentInd))) ||
      null;
    if (!current) return [];
    const qs = new URLSearchParams({
      userId: student.id,
      schoolYearLabel: yearLabel,
      memberLevel: "3",
      persona: String(PERSONA_PARENT),
      durationList: String(current.DurationId),
      markingPeriodId: "",
    });
    const classes = await this.api(
      `/api/datadirect/ParentStudentUserClassesGet?${qs}`
    );
    if (!Array.isArray(classes)) return [];
    return classes
      .filter((g) => g.cumgrade != null || g.CumulativeDisplay)
      .map((g) => ({
        studentId: student.id,
        school: this.school.id,
        className: g.sectionidentifier ?? g.GroupName ?? null,
        term: g.currentterm ?? current.DurationDescription ?? null,
        grade: g.CumulativeDisplay || String(g.cumgrade),
        raw: g,
      }));
  }
}

/** Dates arrive as "9/30/2026 11:59 PM" or "/Date(…)/"; normalize to ISO. */
function parseMsaDate(v) {
  if (!v) return null;
  const msEpoch = /\/Date\((\d+)\)\//.exec(String(v));
  const d = msEpoch ? new Date(Number(msEpoch[1])) : new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

/** Teachers paste rich text into titles — strip tags and decode entities. */
function cleanText(s) {
  if (!s) return "";
  const named = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…" };
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Like cleanText, but keeps paragraph/list breaks as newlines. */
function cleanMultiline(s) {
  if (!s) return "";
  return cleanText(
    String(s).replace(/<\s*(br|\/p|\/li|\/div)[^>]*>/gi, "\u0000")
  )
    .split("\u0000")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function numOrNull(v) {
  const n = Number(v);
  return v == null || v === "" || isNaN(n) ? null : n;
}

