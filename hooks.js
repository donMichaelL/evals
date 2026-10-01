// promptfoo extension hook: seeds a workspace file for the tests that need one.
// A test opts in with
//   metadata: { seed: { path: demo/nginx.yaml, fixture: fixtures/nginx.yaml } }
// Before it runs, the fixture is saved to the ide-backend at `path`, so the agent
// can read_file it; afterwards the file is removed again — along with its folder
// when the seed created it — so every other case sees the workspace unchanged.
//
// A hook that throws aborts the whole eval, so failures are only logged: an
// unreachable backend then costs the seeded case its points, nothing more.

const fs = require("node:fs");
const path = require("node:path");

const BACKEND_URL = process.env.IDE_BACKEND_URL || "http://localhost:3001/api";

const createdFolders = new Map();

async function listNames(folder) {
  const res = await fetch(`${BACKEND_URL}/files?path=${encodeURIComponent(folder)}`);
  return res.ok ? (await res.json()).map((item) => item.name) : [];
}

async function seed({ path: target, fixture }) {
  const folder = path.posix.dirname(target);
  const topFolder = target.split("/")[0];
  const existed = folder === "." || (await listNames("")).includes(topFolder);

  const res = await fetch(`${BACKEND_URL}/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: target, content: fs.readFileSync(path.join(__dirname, fixture), "utf8") }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!existed) createdFolders.set(target, topFolder);
}

async function unseed({ path: target }) {
  const remove = createdFolders.get(target) ?? target;
  createdFolders.delete(target);
  await fetch(`${BACKEND_URL}/delete?path=${encodeURIComponent(remove)}`, { method: "DELETE" });
}

async function extensionHook(hookName, context) {
  const spec = context?.test?.metadata?.seed;
  if (!spec) return;

  try {
    if (hookName === "beforeEach") await seed(spec);
    if (hookName === "afterEach") await unseed(spec);
  } catch (e) {
    console.warn(`[hooks] ${hookName}: could not ${hookName === "beforeEach" ? "seed" : "remove"} ${spec.path} on ${BACKEND_URL} (${e.message})`);
  }
}

module.exports = { extensionHook };
