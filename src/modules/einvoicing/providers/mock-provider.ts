import { randomUUID } from "node:crypto";
import type {
  AspInboundEnvelope,
  AspProvider,
  AspSubmissionRequest,
  AspSubmissionResult,
  NormalizedAspInboundDocument,
} from "./asp-provider";

export const mockSubmissionScenarios = [
  "accepted",
  "provider_rejected",
  "exchange_rejected",
  "reporting_rejected",
  "provider_error",
] as const;

export type MockSubmissionScenario = (typeof mockSubmissionScenarios)[number];

export class MockAspProvider implements AspProvider {
  readonly key = "mock";

  async validateConnection() {
    return { valid: true, message: "Mock ASP is available for local development and tests." };
  }

  async submit(request: AspSubmissionRequest, scenario = "accepted"): Promise<AspSubmissionResult> {
    const selected = mockSubmissionScenarios.includes(scenario as MockSubmissionScenario)
      ? scenario as MockSubmissionScenario
      : "accepted";
    if (selected === "provider_error") throw new Error("Mock ASP transport failure.");
    const providerRequestId = `mock-${randomUUID()}`;
    const common = {
      providerRequestId,
      rawResponse: {
        mock: true,
        scenario: selected,
        providerRequestId,
        documentUuid: request.documentUuid,
        payloadHash: request.payloadHash,
      },
    };
    if (selected === "provider_rejected") {
      return { ...common, accepted: false, exchangeStatus: "not_submitted", reportingStatus: "not_submitted", responseCode: "MOCK_PROVIDER_REJECTED" };
    }
    if (selected === "exchange_rejected") {
      return { ...common, accepted: false, exchangeStatus: "rejected", reportingStatus: "not_submitted", responseCode: "MOCK_EXCHANGE_REJECTED" };
    }
    if (selected === "reporting_rejected") {
      return { ...common, accepted: false, exchangeStatus: "accepted", reportingStatus: "rejected", responseCode: "MOCK_REPORTING_REJECTED" };
    }
    return { ...common, accepted: true, exchangeStatus: "accepted", reportingStatus: "accepted", responseCode: "MOCK_ACCEPTED" };
  }

  normalizeInbound(envelope: AspInboundEnvelope, environment: string): NormalizedAspInboundDocument {
    if (environment !== "mock") throw new Error("Mock inbound documents require the Mock environment.");
    const mediaType = envelope.contentType.split(";", 1)[0]?.trim().toLowerCase();
    if (!mediaType || !["application/xml", "text/xml"].includes(mediaType)) {
      throw new Error("Inbound eInvoices must use an XML content type.");
    }
    const charset = envelope.contentType.match(/charset\s*=\s*["']?([^;"']+)/i)?.[1]?.trim().toLowerCase();
    if (charset && !["utf-8", "utf8"].includes(charset)) {
      throw new Error("Inbound eInvoices must be UTF-8 encoded.");
    }
    const xml = typeof envelope.payload === "string"
      ? envelope.payload
      : new TextDecoder("utf-8", { fatal: true }).decode(envelope.payload);
    return {
      providerKey: this.key,
      environment,
      providerDocumentId: envelope.providerDocumentId ?? null,
      providerEventId: envelope.providerEventId ?? null,
      specificationVersion: envelope.specificationVersion,
      contentType: "application/xml",
      xml,
      receivedAt: envelope.receivedAt ?? new Date().toISOString(),
      networkStatus: envelope.networkStatus ?? "MOCK_RECEIVED",
      rawProviderEvent: { mock: true, metadata: envelope.metadata ?? null },
    };
  }

  async acknowledgeReceipt(document: NormalizedAspInboundDocument) {
    return {
      status: "MOCK_ACKNOWLEDGED",
      rawResponse: { mock: true, providerDocumentId: document.providerDocumentId },
    };
  }

  async getInboundStatus(providerDocumentId: string) {
    return { status: "MOCK_RECEIVED", rawResponse: { mock: true, providerDocumentId } };
  }
}
