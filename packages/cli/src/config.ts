import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

const CONFIG_DIR = join(homedir(), ".jeremy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  endpoint?: string;
  "api-key"?: string;
}

const DEFAULTS: Required<Pick<Config, "endpoint">> = {
  endpoint: "http://localhost:5173",
};

async function readConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as Config;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

async function writeConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export async function getConfigValue(key: keyof Config): Promise<string> {
  const config = await readConfig();
  if (key in config && config[key] !== undefined) {
    return config[key] as string;
  }
  if (key === "endpoint") {
    return DEFAULTS.endpoint;
  }
  throw new Error(`Config key "${key}" is not set.`);
}

export async function setConfigValue(
  key: keyof Config,
  value: string,
): Promise<void> {
  const config = await readConfig();
  config[key] = value;
  await writeConfig(config);
}

export async function getEndpoint(): Promise<string> {
  try {
    return await getConfigValue("endpoint");
  } catch {
    return DEFAULTS.endpoint;
  }
}

export async function getApiKey(): Promise<string | undefined> {
  try {
    return await getConfigValue("api-key");
  } catch {
    return undefined;
  }
}

export async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = await getApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}
