import type { AspProvider } from "./asp-provider";
import { MockAspProvider } from "./mock-provider";

const providers: Record<string, AspProvider> = {
  mock: new MockAspProvider(),
};

export function getAspProvider(key: string) {
  const provider = providers[key];
  if (!provider) throw new Error(`ASP provider '${key}' is not available in this build.`);
  return provider;
}
