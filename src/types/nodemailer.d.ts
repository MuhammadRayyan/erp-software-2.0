declare module "nodemailer" {
  export interface Transporter {
    sendMail(options: {
      from?: string;
      to?: string;
      cc?: string;
      bcc?: string;
      replyTo?: string;
      subject?: string;
      text?: string;
      html?: string;
      attachments?: Array<{ filename: string; content: unknown; contentType?: string }>;
    }): Promise<{ messageId: string; response?: string }>;
    verify?(): Promise<true>;
    close?(): void;
  }
  export function createTransport(options: unknown): Transporter;
  const _default: { createTransport: typeof createTransport };
  export default _default;
}
