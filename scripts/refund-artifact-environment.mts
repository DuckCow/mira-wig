import { statSync } from "node:fs";
import { isAbsolute } from "node:path";

// Only the controls used by Docker/buildx and its gcloud credential helper cross
// this boundary. Provider credentials and general shell environment never do.
export function refundArtifactEnvironment(env: Partial<NodeJS.ProcessEnv> = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: "production", CHECKPOINT_DISABLE: "1", PATH: env.PATH, HOME: env.HOME };
  for (const key of ["DOCKER_CONFIG", "CLOUDSDK_CONFIG"] as const) {
    const value = env[key];
    if (value === undefined) continue;
    if (!safePath(value) || !statSync(value).isDirectory()) throw new Error("ARTIFACT_CONFIG_DIRECTORY_INVALID");
    result[key] = value;
  }
  for (const key of ["DOCKER_CONTEXT", "BUILDX_BUILDER"] as const) {
    const value = env[key];
    if (value === undefined) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value)) throw new Error("ARTIFACT_CONTEXT_INVALID");
    result[key] = value;
  }
  addDockerEndpoint(result, env);
  return result;
}

function addDockerEndpoint(result: NodeJS.ProcessEnv, env: Partial<NodeJS.ProcessEnv>): void {
  if (env.DOCKER_HOST === undefined) return;
  if (env.DOCKER_CONTEXT || !env.DOCKER_HOST.startsWith("unix://") || !safePath(env.DOCKER_HOST.slice(7))) {
    throw new Error("ARTIFACT_DOCKER_ENDPOINT_INVALID");
  }
  result.DOCKER_HOST = env.DOCKER_HOST;
}

function safePath(value: string): boolean {
  return isAbsolute(value) && value.length <= 4096 && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
