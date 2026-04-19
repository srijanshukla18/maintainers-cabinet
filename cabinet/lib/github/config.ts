import yaml from "js-yaml";
import { DEFAULT_CONFIG, type CabinetConfig } from "../agents/types";

export function parseConfig(raw: string | null): CabinetConfig {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = yaml.load(raw) as Partial<CabinetConfig>;
    return deepMerge(DEFAULT_CONFIG, parsed) as CabinetConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function deepMerge(base: object, override: object): object {
  const result = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof result[k] === "object") {
      result[k] = deepMerge(result[k] as object, v as object);
    } else if (v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}
