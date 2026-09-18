import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repository, validPostPath, decodedText, encodedText } from "../lib/writing.mjs";
import { translateEntry } from "../lib/translation-server.mjs";

export async function translateGithub({ path, sha, token, apiKey, model, fetcher = fetch, translator = translateEntry }) {
  if (!validPostPath(path) || !path.endsWith(".zh.md") || !/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("Invalid source path or revision.");
  if (!token) throw new Error("GitHub authentication is missing.");
  const target = path.replace(/\.zh\.md$/, ".en.md");
  const endpoint = value => `https://api.github.com/repos/${repository}/contents/` + value.split("/").map(encodeURIComponent).join("/");
  async function request(file, options = {}) {
    return fetcher(endpoint(file) + (options.method ? "" : "?ref=main"), {
      ...options, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    });
  }
  async function readSource() {
    const response = await request(path);
    if (!response.ok) throw new Error("Cannot read the Chinese source.");
    const file = await response.json();
    if (file.sha !== sha || file.type !== "file" || file.encoding !== "base64") throw new Error("Chinese source changed. Open its latest version before translating.");
    return decodedText(file.content);
  }
  const source = await readSource();
  const existing = await request(target);
  if (existing.status !== 404) throw new Error("An English version already exists, or its status cannot be checked. No translation was requested.");
  const translated = await translator(source, path, { apiKey, model, fetcher });
  if (translated.path !== target) throw new Error("Unexpected translation path.");
  await readSource();
  // No SHA means create-only: concurrent English edits are never overwritten.
  const saved = await request(target, { method: "PUT", body: JSON.stringify({
    branch: "main", message: "Draft: English translation", content: encodedText(translated.source),
  }) });
  if (!saved.ok) throw new Error("Could not create the English draft. Refresh the article list; another version may already exist.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await translateGithub({ path: process.env.SOURCE_PATH, sha: process.env.SOURCE_SHA, token: process.env.GITHUB_TOKEN, apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_TRANSLATION_MODEL || undefined });
    console.log("English draft created. Review and publish it in the writing studio.");
  } catch (error) {
    // Do not dump provider bodies, input text, environment or credentials.
    console.error(error.message); process.exitCode = 1;
  }
}
