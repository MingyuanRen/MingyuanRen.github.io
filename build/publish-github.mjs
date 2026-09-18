import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repository, readEntry, serializeEntry } from "../lib/writing.mjs";
import { otherLanguagePath, publishedPair } from "../lib/bilingual-publish.mjs";
import { translateEntry } from "../lib/translation-server.mjs";

export async function publishGithub({ path, source, sha = "", targetSha = "", token, apiKey, model, fetcher = fetch, translator = translateEntry }) {
  const target = otherLanguagePath(path);
  if (typeof source !== "string" || source.length > 600_000 || !/^(?:[a-f0-9]{40})?$/.test(sha) || !/^(?:[a-f0-9]{40})?$/.test(targetSha)) throw new Error("Invalid publication request.");
  const original = serializeEntry(readEntry(source, path), false);
  if (!token) throw new Error("GitHub authentication is missing.");
  const base = "https://api.github.com/repos/" + repository;
  async function api(endpoint, method = "GET", body) {
    const response = await fetcher(base + endpoint, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && method === "GET" && endpoint.startsWith("/contents/")) return null;
    if (!response.ok) throw new Error(`GitHub publication failed (${response.status}). Check the latest versions before retrying.`);
    return response.json();
  }
  const head = (await api("/git/ref/heads/main")).object.sha;
  const currentCommit = await api("/git/commits/" + head);
  for (const [file, expected] of [[path, sha], [target, targetSha]]) {
    const current = await api("/contents/" + file.split("/").map(encodeURIComponent).join("/") + "?ref=" + head);
    if ((current?.sha || "") !== expected || (current && current.type !== "file")) throw new Error("An article changed elsewhere. Reopen the latest version before publishing.");
  }
  const translated = await translator(original.source, path, { apiKey, model, fetcher });
  const pair = publishedPair(original.source, path, translated);
  if ((await api("/git/ref/heads/main")).object.sha !== head) throw new Error("The repository changed during translation. Neither version was published. Reopen before retrying.");
  const tree = await api("/git/trees", "POST", {
    base_tree: currentCommit.tree.sha,
    tree: pair.map(file => ({ path: file.path, mode: "100644", type: "blob", content: file.source })),
  });
  const commit = await api("/git/commits", "POST", { message: "Publish bilingual article", tree: tree.sha, parents: [head] });
  // Both language files land in one commit. Non-fast-forward updates fail closed.
  await api("/git/refs/heads/main", "PATCH", { sha: commit.sha, force: false });
  return { commit: commit.sha };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { inputs } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const result = await publishGithub({ path: inputs.source_path, source: inputs.source, sha: inputs.source_sha || "", targetSha: inputs.target_sha || "", token: process.env.GITHUB_TOKEN, apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_TRANSLATION_MODEL || undefined });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\n`);
    console.log("Both language versions committed. Deployment is the next job.");
  } catch {
    // Never include article text, provider payloads or credentials in public logs.
    console.error("Bilingual publication failed. Check key/model access, API limits and article revisions. Do not retry while another publication is running.");
    process.exitCode = 1;
  }
}
