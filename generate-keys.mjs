
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  modulusLength: 2048,
  extractable: true,
});

const privatePem = (await exportPKCS8(privateKey))
  .replace(/\r?\n/g, " ")
  .trim();

const publicJwk = await exportJWK(publicKey);

const jwks = {
  keys: [{
    ...publicJwk,
    alg: "RS256",
    use: "sig",
    kid: randomUUID(),
  }],
};

writeFileSync("jwt-private-key.txt", privatePem);
writeFileSync("jwks.json", JSON.stringify(jwks));

console.log("JWT key files generated successfully.");
