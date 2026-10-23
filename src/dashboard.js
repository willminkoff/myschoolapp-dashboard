/**
 * Renders the normalized data into a single static HTML file.
 * No build step, no server — open data/dashboard.html in any browser.
 */
export function renderDashboard(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="900">
<title>School Board</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --text: #1b2430; --muted: #66707d;
    --line: #e3e7ec; --accent: #2563eb;
    --overdue: #c62828; --today: #b45309; --soon: #2563eb; --done: #2e7d32;
    --kid1: #2563eb; --kid2: #9333ea; --kid3: #0d9488; --kid4: #db2777;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #11151c; --card: #1a202b; --text: #e8edf4; --muted: #94a0ae;
      --line: #2a3340; --accent: #60a5fa;
      --overdue: #ef5350; --today: #fbbf24; --soon: #60a5fa; --done: #66bb6a;
      --kid1: #60a5fa; --kid2: #c084fc; --kid3: #2dd4bf; --kid4: #f472b6;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 60px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  h1 { font-size: 22px; margin: 0; }
  .stamp { color: var(--muted); font-size: 13px; }
  .errors { background: color-mix(in srgb, var(--overdue) 12%, var(--card));
            border: 1px solid var(--overdue); border-radius: 10px;
            padding: 10px 14px; margin: 14px 0; font-size: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
  .chip { border: 1.5px solid var(--line); background: var(--card); color: var(--text);
          border-radius: 999px; padding: 5px 14px; font-size: 14px; cursor: pointer; }
  .chip.on { border-color: var(--chipc, var(--accent)); color: var(--chipc, var(--accent)); font-weight: 600; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
       color: var(--muted); margin: 28px 0 10px; }
  h2 .n { color: var(--text); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
          padding: 4px 0; }
  .row { display: grid; grid-template-columns: 10px 1fr auto; gap: 12px; align-items: center;
         padding: 10px 16px; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: none; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--kidc); }
  .title { font-weight: 600; }
  .meta { color: var(--muted); font-size: 13px; }
  .due { text-align: right; font-size: 13px; white-space: nowrap; }
  .due .when { font-weight: 600; }
  .due.overdue .when { color: var(--overdue); }
  .due.today .when { color: var(--today); }
  .row.can { cursor: pointer; }
  .row.can .title::after { content: " ▸"; color: var(--muted); font-size: 11px; }
  .row.exp .title::after { content: " ▾"; }
  .det { grid-column: 1 / 4; margin: 4px 0 4px 22px; padding: 10px 14px;
         background: var(--bg); border-radius: 8px; font-size: 14px; }
  .det .ins { white-space: pre-line; }
  .det .links { margin-top: 6px; }
  .det .links a { color: var(--accent); text-decoration: none; display: block; }
  .det .links a:hover { text-decoration: underline; }
  .det .files { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .det .comment { font-style: italic; margin-bottom: 6px; }
  .badge { display: inline-block; font-size: 11px; border-radius: 6px; padding: 1px 7px;
           border: 1px solid var(--line); color: var(--muted); margin-left: 8px; vertical-align: 1px; }
  .badge.graded { color: var(--done); border-color: var(--done); }
  .badge.completed { color: var(--done); border-color: var(--done); }
  .badge.overdue, .badge.missing, .badge.late { color: var(--overdue); border-color: var(--overdue); }
  .det .dates { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
  .score { font-weight: 600; color: var(--done); }
  table { width: 100%; border-collapse: collapse; background: var(--card);
          border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 9px 16px; border-bottom: 1px solid var(--line); font-size: 14px; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  tr:last-child td { border-bottom: none; }
  .empty { color: var(--muted); padding: 14px 16px; }
  footer { margin-top: 36px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header><h1>School Board</h1><span class="stamp" id="stamp"></span></header>
  <div id="errors"></div>
  <div class="chips" id="chips"></div>
  <div id="sections"></div>
  <h2>Current grades</h2>
  <div id="grades"></div>
  <footer>Data pulled from each school's myschoolapp portal with your parent account. School Board refreshes this page automatically a few times a day.</footer>
</div>
<script>
const DATA = ${json};
const KID_COLORS = ["var(--kid1)","var(--kid2)","var(--kid3)","var(--kid4)"];
const kids = DATA.students.map((s, i) => ({ ...s, color: KID_COLORS[i % 4] }));
const kidById = Object.fromEntries(kids.map(k => [k.studentKey ?? (k.school + ":" + k.id), k]));
const keyOf = a => a.school + ":" + a.studentId;
kids.forEach(k => { k.key = k.school + ":" + k.id; });
let active = new Set(kids.map(k => k.key));

const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Show the time only when the school set one (11:59 PM deadlines matter).
const whenFull = iso => { const d = new Date(iso); return (d.getHours() || d.getMinutes()) ? fmtDT.format(d) : fmt.format(d); };
const now = new Date();
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const today = startOfDay(now);
const dayDiff = iso => Math.round((startOfDay(new Date(iso)) - today) / 86400e3);

function bucket(a) {
  if (a.status === "graded") return "graded";
  if (!a.dateDue) return "later";
  const d = dayDiff(a.dateDue);
  if (d < 0) return a.status === "completed" ? "graded" : "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "week";
  return "later";
}
const BUCKETS = [
  ["overdue", "Overdue"],
  ["today", "Due today"],
  ["tomorrow", "Due tomorrow"],
  ["week", "Due this week"],
  ["later", "Later"],
  ["graded", "Recently done"],
];

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function dueLabel(a, b) {
  if (!a.dateDue) return "";
  const d = dayDiff(a.dateDue);
  const date = fmt.format(new Date(a.dateDue));
  if (b === "overdue") return (d === -1 ? "yesterday" : Math.abs(d) + " days ago") + " · " + date;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return date;
}

function render() {
  document.getElementById("stamp").textContent =
    "updated " + new Date(DATA.fetchedAt).toLocaleString();

  const errBox = document.getElementById("errors");
  errBox.innerHTML = (DATA.errors || []).length
    ? '<div class="errors">' + DATA.errors.map(e => "⚠️ " + esc(e.message)).join("<br>") + "</div>"
    : "";

  document.getElementById("chips").innerHTML = kids.map(k =>
    '<button class="chip ' + (active.has(k.key) ? "on" : "") + '" style="--chipc:' + k.color +
    '" onclick="toggle(\\'' + k.key + '\\')">' + esc(k.name) +
    ' <span class="meta">· ' + esc(DATA.schools[k.school]?.name ?? k.school) + "</span></button>"
  ).join("");

  const visible = DATA.assignments.filter(a => active.has(keyOf(a)));
  const byBucket = {};
  for (const a of visible) (byBucket[bucket(a)] ??= []).push(a);
  for (const list of Object.values(byBucket))
    list.sort((x, y) => (x.dateDue ?? "9999") < (y.dateDue ?? "9999") ? -1 : 1);

  document.getElementById("sections").innerHTML = BUCKETS.map(([id, label]) => {
    const list = byBucket[id] || [];
    if (!list.length && (id === "overdue" || id === "graded" || id === "later")) return "";
    const rows = list.length ? list.map(a => {
      const kid = kidById[keyOf(a)];
      const score = a.pointsEarned != null && a.maxPoints != null
        ? '<span class="score">' + a.pointsEarned + "/" + a.maxPoints + "</span>" : "";
      // Done states win; otherwise surface the portal's missing/late flags,
      // or a plain overdue tag for anything pending past its due date.
      let tag = "";
      if (a.status === "completed" || a.status === "graded") tag = a.status;
      else if (a.raw?.MissingInd) tag = "missing";
      else if (a.raw?.LateInd) tag = "late";
      else if (a.status === "overdue" || (a.dateDue && dayDiff(a.dateDue) < 0)) tag = "overdue";
      const badge = tag ? '<span class="badge ' + tag + '">' + tag + "</span>" : "";
      const det = a.detail;
      const rid = String(a.raw?.AssignmentId ?? (a.school + (a.title||"")).replace(/\\W/g, ""));
      const isExp = expanded.has(rid);
      let detHtml = "";
      if (isExp) {
        const dates = [
          a.dateAssigned ? "Assigned " + fmt.format(new Date(a.dateAssigned)) : "",
          a.dateDue ? "Due " + whenFull(a.dateDue) : "",
        ].filter(Boolean).join("  ·  ");
        detHtml = '<div class="det" onclick="event.stopPropagation()">' +
          (dates ? '<div class="dates">📅 ' + dates + "</div>" : "") +
          (det?.comment ? '<div class="comment">💬 ' + esc(det.comment) +
            (det.letter ? " — " + esc(det.letter) : "") + "</div>" : "") +
          (det?.instructions ? '<div class="ins">' + esc(det.instructions) + "</div>" : "") +
          (det?.links?.length ? '<div class="links">' + det.links.map(l =>
            '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.title) + "</a>").join("") + "</div>" : "") +
          (det?.files?.length ? '<div class="files">📎 ' + det.files.map(esc).join(" · ") + " (download via the school portal)</div>" : "") +
          (a.maxPoints != null && a.pointsEarned == null ? '<div class="files">Worth ' + a.maxPoints + " points</div>" : "") +
          "</div>";
      }
      return '<div class="row can' + (isExp ? " exp" : "") + '" style="--kidc:' + kid.color + '"' +
        ' onclick="toggleRow(\\'' + rid + '\\')">' +
        '<div class="dot" title="' + esc(kid.name) + '"></div>' +
        '<div><div class="title">' + esc(a.title) + badge + "</div>" +
        '<div class="meta">' + esc(kid.name) + " · " + esc(a.className ?? "") +
        (a.type ? " · " + esc(a.type) : "") + "</div></div>" +
        '<div class="due ' + id + '"><span class="when">' + dueLabel(a, id) + "</span><div>" + score + "</div></div>" +
        detHtml + "</div>";
    }).join("") : '<div class="empty">Nothing here 🎉</div>';
    return "<h2>" + label + ' <span class="n">(' + list.length + ")</span></h2><div class=\\"card\\">" + rows + "</div>";
  }).join("");

  const grades = DATA.grades.filter(g => active.has(g.school + ":" + g.studentId));
  document.getElementById("grades").innerHTML = grades.length
    ? "<table><tr><th>Student</th><th>Class</th><th>Term</th><th>Grade</th></tr>" +
      grades.map(g => {
        const kid = kidById[g.school + ":" + g.studentId];
        return "<tr><td>" + esc(kid?.name ?? g.studentId) + "</td><td>" + esc(g.className) +
          "</td><td>" + esc(g.term ?? "") + "</td><td><b>" + esc(g.grade ?? "—") + "</b></td></tr>";
      }).join("") + "</table>"
    : '<div class="card"><div class="empty">No grades fetched yet.</div></div>';
}

let expanded = new Set();
function toggleRow(id) {
  expanded.has(id) ? expanded.delete(id) : expanded.add(id);
  render();
}

function toggle(key) {
  if (active.has(key) && active.size === 1) { active = new Set(kids.map(k => k.key)); }
  else if (active.size === kids.length) { active = new Set([key]); }
  else { active.has(key) ? active.delete(key) : active.add(key); }
  render();
}
render();
</script>
</body>
</html>`;
}
