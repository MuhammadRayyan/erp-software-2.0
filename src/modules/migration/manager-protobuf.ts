/**
 * Protobuf Wire Decoder & Value Formatter for Manager.io (.manager) Databases.
 * 
 * Manager.io serializes C# objects using Marc Gravell's protobuf-net library.
 * This module decodes raw Protobuf binary streams into structured JavaScript objects,
 * resolving .NET System.Guid, Protobuf-net Decimal, and ZigZag Unix DateOnly formats.
 */

export interface DecodedProtobuf {
  [fieldNumber: number]: any;
}

export function decodeProtobuf(buf: Buffer): DecodedProtobuf {
  let offset = 0;
  const result: Record<number, any[]> = {};

  while (offset < buf.length) {
    const tagVarint = readVarint(buf, offset);
    if (!tagVarint) break;
    offset = tagVarint.newOffset;
    const tag = tagVarint.value;
    const fieldNumber = Number(tag >> 3n);
    const wireType = Number(tag & 7n);

    if (fieldNumber === 0) break;

    let value: any;

    if (wireType === 0) {
      // Varint
      const v = readVarint(buf, offset);
      if (!v) break;
      offset = v.newOffset;
      value = v.value <= BigInt(Number.MAX_SAFE_INTEGER) && v.value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(v.value)
        : v.value.toString();
    } else if (wireType === 1) {
      // 64-bit fixed
      if (offset + 8 > buf.length) break;
      const rawHex = buf.subarray(offset, offset + 8).toString("hex");
      offset += 8;
      value = { _type: "fixed64", rawHex };
    } else if (wireType === 2) {
      // Length-delimited
      const lenVarint = readVarint(buf, offset);
      if (!lenVarint) break;
      offset = lenVarint.newOffset;
      const len = Number(lenVarint.value);
      if (offset + len > buf.length) break;
      const chunk = buf.subarray(offset, offset + len);
      offset += len;

      value = parseLengthDelimited(chunk);
    } else if (wireType === 5) {
      // 32-bit fixed
      if (offset + 4 > buf.length) break;
      const intVal = buf.readInt32LE(offset);
      offset += 4;
      value = { _type: "fixed32", intVal };
    } else {
      break;
    }

    if (!result[fieldNumber]) {
      result[fieldNumber] = [];
    }
    result[fieldNumber].push(value);
  }

  // Simplify single-element arrays
  const simplified: Record<string, any> = {};
  for (const [k, v] of Object.entries(result)) {
    simplified[k] = v.length === 1 ? v[0] : v;
  }
  return simplified;
}

function readVarint(buf: Buffer, offset: number): { value: bigint; newOffset: number } | null {
  let res = 0n;
  let shift = 0n;
  while (offset < buf.length) {
    const byte = buf[offset++];
    res |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: res, newOffset: offset };
    }
    shift += 7n;
    if (shift > 70n) return null;
  }
  return null;
}

function parseLengthDelimited(chunk: Buffer): any {
  if (chunk.length === 0) return "";

  // 1. Check if it's printable UTF-8 string first
  if (isPrintableUtf8(chunk)) {
    return chunk.toString("utf8");
  }

  // 2. Check if it's an embedded protobuf message
  if (canBeSubmessage(chunk)) {
    try {
      const sub = decodeProtobuf(chunk);
      if (Object.keys(sub).length > 0) {
        // If it's a protobuf-net Guid sub-message (field 1: fixed64, field 2: fixed64)
        if (sub["1"]?._type === "fixed64" && sub["2"]?._type === "fixed64" && Object.keys(sub).length === 2) {
          const g = resolveGuidSubmessage(sub["1"].rawHex, sub["2"].rawHex);
          if (g) return g;
        }
        return sub;
      }
    } catch {}
  }

  // 3. If raw 16 bytes, format as .NET binary GUID
  if (chunk.length === 16) {
    return formatDotNetGuid(chunk);
  }

  return { _rawHex: chunk.toString("hex") };
}

function isPrintableUtf8(buf: Buffer): boolean {
  try {
    const str = buf.toString("utf8");
    if (Buffer.from(str, "utf8").compare(buf) !== 0) return false;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function canBeSubmessage(buf: Buffer): boolean {
  if (buf.length < 2) return false;
  const tag = buf[0];
  const wire = tag & 7;
  const field = tag >> 3;
  return field > 0 && field < 100 && (wire === 0 || wire === 2 || wire === 1 || wire === 5);
}

export function formatDotNetGuid(buf: Buffer): string {
  if (buf.length !== 16) return "";
  const d1 = buf.readUInt32LE(0).toString(16).padStart(8, "0");
  const d2 = buf.readUInt16LE(4).toString(16).padStart(4, "0");
  const d3 = buf.readUInt16LE(6).toString(16).padStart(4, "0");
  const d4 = buf.subarray(8, 10).toString("hex");
  const d5 = buf.subarray(10, 16).toString("hex");
  return `${d1}-${d2}-${d3}-${d4}-${d5}`.toLowerCase();
}

export function resolveGuidSubmessage(rawHex1: string, rawHex2: string): string {
  const b1 = Buffer.from(rawHex1, "hex");
  const b2 = Buffer.from(rawHex2, "hex");
  return formatDotNetGuid(Buffer.concat([b1, b2]));
}

/**
 * Decodes Zigzag encoded integer representing days since Unix Epoch (1970-01-01) into ISO YYYY-MM-DD.
 */
export function unzigzag(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

export function decodeManagerDate(val: unknown): string {
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const numVal = typeof val === "number" ? val : (val as any)?.["1"];
  if (typeof numVal !== "number") return new Date().toISOString().slice(0, 10);

  const days = unzigzag(numVal);
  const ms = days * 86400 * 1000;
  try {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Decodes protobuf-net bcl.Decimal into JavaScript number.
 */
export function decodeManagerDecimal(sub: any): number {
  if (typeof sub === "number") return sub;
  if (typeof sub === "string") {
    const num = Number(sub);
    return isNaN(num) ? 0 : num;
  }
  if (!sub || typeof sub !== "object") return 0;

  // If sub has an inner "1" that is itself an object, recurse
  if (sub["1"] && typeof sub["1"] === "object") {
    return decodeManagerDecimal(sub["1"]);
  }

  let low = sub["1"];
  let high = sub["2"];
  let signScale = sub["3"];

  if (typeof low !== "number" && typeof low !== "bigint") low = 0;
  if (typeof high !== "number" && typeof high !== "bigint") high = 0;
  if (typeof signScale !== "number") signScale = 0;

  try {
    const scale = signScale >>> 1;
    const isNeg = (signScale & 1) === 1;
    const raw = Number(BigInt(low) + (BigInt(high) << 64n));
    const val = raw / Math.pow(10, scale);
    return isNeg ? -val : val;
  } catch {
    return 0;
  }
}

