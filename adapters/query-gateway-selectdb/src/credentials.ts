import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PlatformException } from "../../../packages/contracts/src/index.js";

function deploymentKey(value: string | undefined): Buffer {
  if (!value || !/^[a-f\d]{64}$/i.test(value)) throw new PlatformException({
    code: "DATA_SOURCE_NOT_CONFIGURED", message: "保存数据源密码需要配置 ONTOLOGY_ENCRYPTION_KEY（32 字节十六进制部署密钥）", stage: "configuration", retryable: false,
  }, 503);
  return Buffer.from(value, "hex");
}
export function encryptCredential(secret: string, sourceId: string, key?: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", deploymentKey(key), iv);
  cipher.setAAD(Buffer.from(sourceId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptCredential(payload: string, sourceId: string, key?: string): string {
  const material = deploymentKey(key);
  try {
    const [version, iv, tag, data] = payload.split(".");
    if (version !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted credential");
    const decipher = createDecipheriv("aes-256-gcm", material, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(sourceId)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new PlatformException({ code: "DATA_SOURCE_NOT_CONFIGURED", message: "数据源凭据无法解密，请核对部署密钥或重新保存连接", stage: "configuration", retryable: false }, 503); }
}
