import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Crypto } from '../../application/common/ports';
export class ArgonCrypto implements Crypto {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  verify(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
  random() {
    return randomBytes(48).toString('base64url');
  }
  digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  uuid() {
    return randomUUID();
  }
}
