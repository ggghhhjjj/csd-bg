import { PipelineError } from "./errors.js";
import { KNOWN_STEPS, type PipelineStep } from "./types.js";

export { KNOWN_STEPS };

export function parseSteps(raw: string | null | undefined): PipelineStep[] {
  if (raw === null || raw === undefined || !String(raw).trim()) {
    throw new PipelineError("Steps argument is required (e.g. scrape,download,extract,vectors)");
  }

  const parts = String(raw)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new PipelineError("Steps argument is required (e.g. scrape,download,extract,vectors)");
  }

  const known = new Set<string>(KNOWN_STEPS);
  const unknown = parts.filter((step) => !known.has(step));
  if (unknown.length > 0) {
    throw new PipelineError(
      `Unknown step(s): ${unknown.join(", ")}. Known steps: ${KNOWN_STEPS.join(", ")}`,
    );
  }

  if (parts.length !== new Set(parts).size) {
    throw new PipelineError(`Duplicate steps are not allowed: ${raw}`);
  }

  return parts as PipelineStep[];
}

export function runPipeline(
  steps: PipelineStep[],
  handlers: Partial<Record<PipelineStep, () => number | Promise<number>>>,
): number | Promise<number> {
  return steps.reduce<number | Promise<number>>(
    async (previous, step) => {
      const exitCode = await previous;
      if (exitCode !== 0) {
        return exitCode;
      }

      const handler = handlers[step];
      if (!handler) {
        throw new PipelineError(`No handler registered for step: ${step}`);
      }

      return handler();
    },
    Promise.resolve(0),
  );
}
