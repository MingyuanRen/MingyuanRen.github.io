export function publishProgress(run, jobs = []) {
  const url = Number.isSafeInteger(run.id) && run.id > 0 ? `https://github.com/MingyuanRen/MingyuanRen.github.io/actions/runs/${run.id}` : undefined;
  const saved = jobs.some(job => job.name === "publish" && job.conclusion === "success");
  if (run.status === "completed") return { url, stage: run.conclusion === "success" ? "live" : "failed",
    label: run.conclusion === "success" ? "Deployment completed. Both versions are live." : saved ? "Writing saved, but deployment did not complete. Check the run before retrying." : "Publication did not complete. Check the run before retrying." };
  if (saved) return { url, stage: "deploying", label: "Both versions saved. Building / deploying the website…" };
  const translating = jobs.some(job => job.name === "publish" && job.steps?.some(step => step.name === "Translate and commit both versions" && step.status === "in_progress"));
  return { url, stage: translating ? "translating" : "queued", label: translating ? "Translating and committing both versions…" : "Queued / preparing the publishing job…" };
}
