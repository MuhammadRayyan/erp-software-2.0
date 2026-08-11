import { PINT_AE_SPECIFICATION_VERSION } from "../einvoice-types";
import { generatePintAeXml } from "./versions/v1.0.4/xml-generator";
import { validatePintAe104 } from "./versions/v1.0.4/validator";

const versions = {
  [PINT_AE_SPECIFICATION_VERSION]: {
    generateXml: generatePintAeXml,
    validateXml: validatePintAe104,
  },
} as const;

export function getPintAeVersion(version: string) {
  const implementation = versions[version as keyof typeof versions];
  if (!implementation) throw new Error(`PINT-AE specification version ${version} is not installed.`);
  return implementation;
}
