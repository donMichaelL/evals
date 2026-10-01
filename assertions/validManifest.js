// Assertions that check a file action's content against the ide-backend validator.
// The backend validates files on disk, and nothing executes actions in the eval
// stack, so the content is saved to a throwaway folder, validated, then removed —
// the folder never outlives the assertion, so later cases cannot see it.
//
//   G1  valid            create_file content is a device manifest with 0 errors
//       clean            ... and 0 warnings as well
//   G3  editValid        edit_file content is a native profile, 0 errors, 0 warnings
//       editAvailability qos.availability is 90%
//       editStartupTime  qos.startupTime is 5s
//       editKeepsRest    every other line of the seeded file is still there

const fs = require("node:fs");
const path = require("node:path");

const BACKEND_URL = process.env.IDE_BACKEND_URL || "http://localhost:3001/api";

// The file G3 edits, as hooks.js seeds it (see the G3 metadata in promptfooconfig.yaml).
const G3_SEED = fs.readFileSync(path.join(__dirname, "..", "fixtures", "nginx.yaml"), "utf8");
const G3_CHANGED = /^\s*(availability|startupTime)\s*:/;

const findAction = (output, name) =>
  (output.actions || []).find((a) => a.action === name && /nginx\.yaml$/.test(String(a.path || "")) && a.content);

async function validate(content) {
  const folder = `.eval-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const file = `${folder}/nginx.yaml`;
  try {
    const saved = await fetch(`${BACKEND_URL}/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, content: String(content) }),
    });
    if (!saved.ok) return { error: `could not save the manifest to the ide-backend (HTTP ${saved.status})` };

    const res = await fetch(`${BACKEND_URL}/agent/validation/file?path=${encodeURIComponent(file)}`);
    if (!(res.headers.get("content-type") || "").includes("application/json")) {
      return { error: `the ide-backend at ${BACKEND_URL} has no validation endpoint (HTTP ${res.status}) - it is too old` };
    }
    return { report: await res.json() };
  } catch (e) {
    return { error: `ide-backend unreachable at ${BACKEND_URL} (${e.message})` };
  } finally {
    await fetch(`${BACKEND_URL}/delete?path=${encodeURIComponent(folder)}`, { method: "DELETE" }).catch(() => {});
  }
}

const list = (items) =>
  items
    .slice(0, 5)
    .map((i) => `line ${i.line} ${i.field || "(file)"}: ${i.message}`)
    .join("; ");

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });

// Validates the named action's content; `warnings` decides whether they fail it.
async function check(output, actionName, type, { warnings }) {
  const action = findAction(output, actionName);
  if (!action) return result(false, `no ${actionName} action on nginx.yaml with content`);

  const { report, error } = await validate(action.content);
  if (error) return result(false, error);
  if (report.type !== type) return result(false, `not a ${type} manifest (detected: ${report.type ?? "unrecognised"})`);
  if (!report.valid) return result(false, `${report.errors.length} error(s): ${list(report.errors)}`);
  if (warnings && report.warnings.length > 0) {
    return result(false, `${report.warnings.length} warning(s): ${list(report.warnings)}`);
  }
  return result(true, `valid ${type} manifest${warnings ? ", no warnings" : ""}`);
}

// Compares YAML lines loosely: indentation, quotes and spacing do not matter.
const normalise = (line) => line.trim().replace(/["']/g, "").replace(/\s*:\s*/, ": ").replace(/\s+/g, " ");

const editContent = (output) => String(findAction(output, "edit_file")?.content ?? "");

const valid = (output) => check(output, "create_file", "device", { warnings: false });
const clean = (output) => check(output, "create_file", "device", { warnings: true });

const editValid = (output) => check(output, "edit_file", "native", { warnings: true });

function editAvailability(output) {
  const ok = /^\s*availability\s*:\s*["']?90(\.0+)?\s?%["']?\s*$/m.test(editContent(output));
  return result(ok, ok ? "availability is 90%" : "qos.availability is not 90%");
}

function editStartupTime(output) {
  const ok = /^\s*startupTime\s*:\s*["']?5(\.0+)?s["']?\s*$/m.test(editContent(output));
  return result(ok, ok ? "startupTime is 5s" : "qos.startupTime is not 5s");
}

function editKeepsRest(output) {
  const content = editContent(output);
  if (!content) return result(false, "no edit_file action on nginx.yaml with content");

  const have = new Set(content.split("\n").map(normalise));
  const missing = G3_SEED.split("\n")
    .filter((line) => line.trim() && !G3_CHANGED.test(line))
    .filter((line) => !have.has(normalise(line)));
  return missing.length === 0
    ? result(true, "every other line of the file is unchanged")
    : result(false, `${missing.length} line(s) of the original changed or missing: ${missing.slice(0, 3).map((l) => l.trim()).join(" | ")}`);
}

module.exports = { valid, clean, editValid, editAvailability, editStartupTime, editKeepsRest };
