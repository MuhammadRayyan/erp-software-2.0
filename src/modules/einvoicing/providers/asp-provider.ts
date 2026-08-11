export type AspSubmissionRequest = {
  documentId: string;
  documentUuid: string;
  specificationVersion: string;
  payloadHash: string;
  xml: string;
};

export type AspSubmissionResult = {
  accepted: boolean;
  providerRequestId: string;
  exchangeStatus: string;
  reportingStatus: string;
  responseCode: string;
  rawResponse: unknown;
};

export type AspInboundEnvelope = {
  providerDocumentId?: string;
  providerEventId?: string;
  specificationVersion: string;
  contentType: string;
  payload: string | Uint8Array;
  receivedAt?: string;
  networkStatus?: string;
  metadata?: unknown;
};

export type NormalizedAspInboundDocument = {
  providerKey: string;
  environment: string;
  providerDocumentId: string | null;
  providerEventId: string | null;
  specificationVersion: string;
  contentType: "application/xml";
  xml: string;
  receivedAt: string;
  networkStatus: string | null;
  rawProviderEvent: unknown;
};

export interface AspProvider {
  readonly key: string;
  validateConnection(): Promise<{ valid: boolean; message: string }>;
  submit(request: AspSubmissionRequest, scenario?: string): Promise<AspSubmissionResult>;
  normalizeInbound?(envelope: AspInboundEnvelope, environment: string): NormalizedAspInboundDocument;
  acknowledgeReceipt?(document: NormalizedAspInboundDocument): Promise<{ status: string; rawResponse: unknown }>;
  getInboundStatus?(providerDocumentId: string): Promise<{ status: string; rawResponse: unknown }>;
}
