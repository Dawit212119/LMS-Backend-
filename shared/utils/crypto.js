const crypto = require('crypto');
const bcrypt = require('bcrypt');

class CryptoUtils {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32;
  }

  // Generate random string
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate secure token
  generateToken(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate UUID v4
  generateUUID() {
    return crypto.randomUUID();
  }

  // Hash password using bcrypt
  async hashPassword(password, rounds = 12) {
    try {
      const salt = await bcrypt.genSalt(rounds);
      return await bcrypt.hash(password, salt);
    } catch (error) {
      throw new Error('Failed to hash password');
    }
  }

  // Verify password using bcrypt
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      throw new Error('Failed to verify password');
    }
  }

  // Derive key from password
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
  }

  // Encrypt data
  encrypt(text, password) {
    try {
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      const key = this.deriveKey(password, salt);
      
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('additional-data'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine salt, iv, tag, and encrypted data
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);
      
      return combined.toString('base64');
    } catch (error) {
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt data
  decrypt(encryptedData, password) {
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
      
      const key = this.deriveKey(password, salt);
      
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from('additional-data'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }

  // Create hash of data
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  // Create HMAC
  hmac(data, secret, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  // Verify HMAC
  verifyHmac(data, hmac, secret, algorithm = 'sha256') {
    const expectedHmac = this.hmac(data, secret, algorithm);
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  }

  // Generate API key
  generateApiKey(prefix = 'lp') {
    const timestamp = Date.now().toString(36);
    const random = this.generateRandomString(24);
    return `${prefix}_${timestamp}_${random}`;
  }

  // Generate secure session ID
  generateSessionId() {
    return this.generateRandomString(64);
  }

  // Generate password reset token
  generatePasswordResetToken() {
    return this.generateToken(32);
  }

  // Generate email verification token
  generateEmailVerificationToken() {
    return this.generateToken(32);
  }

  // Generate refresh token
  generateRefreshToken() {
    return this.generateToken(64);
  }

  // Generate access token signature
  generateAccessTokenSignature(payload) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureData = `${encodedHeader}.${encodedPayload}`;
    
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(signatureData)
      .digest('base64url');
    
    return `${signatureData}.${signature}`;
  }

  // Verify access token signature
  verifyAccessTokenSignature(token) {
    try {
      const [header, payload, signature] = token.split('.');
      
      const signatureData = `${header}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(signatureData)
        .digest('base64url');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      return false;
    }
  }

  // Generate secure hash for file
  hashFile(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Generate secure hash for stream
  async hashStream(stream) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // Generate key pair for asymmetric encryption
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  // Encrypt with public key
  publicEncrypt(publicKey, data) {
    try {
      return crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(data)
      ).toString('base64');
    } catch (error) {
      throw new Error('Failed to encrypt with public key');
    }
  }

  // Decrypt with private key
  privateDecrypt(privateKey, encryptedData) {
    try {
      return crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        Buffer.from(encryptedData, 'base64')
      ).toString();
    } catch (error) {
      throw new Error('Failed to decrypt with private key');
    }
  }

  // Sign data with private key
  sign(privateKey, data) {
    try {
      return crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64');
    } catch (error) {
      throw new Error('Failed to sign data');
    }
  }

  // Verify signature with public key
  verify(publicKey, data, signature) {
    try {
      return crypto.verify(
        'sha256',
        Buffer.from(data),
        publicKey,
        Buffer.from(signature, 'base64')
      );
    } catch (error) {
      return false;
    }
  }

  // Generate secure random number
  generateSecureRandom(min, max) {
    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const maxValue = Math.pow(256, bytesNeeded) - 1;
    const randomBytes = crypto.randomBytes(bytesNeeded);
    const randomValue = randomBytes.readUIntBE(0, bytesNeeded);
    
    return min + (randomValue % range);
  }

  // Generate OTP code
  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      const index = this.generateSecureRandom(0, digits.length - 1);
      otp += digits[index];
    }
    
    return otp;
  }

  // Generate timestamp-based token
  generateTimestampToken(secret, validityPeriod = 300) { // 5 minutes default
    const timestamp = Math.floor(Date.now() / 1000);
    const data = `${timestamp}:${this.generateRandomString(16)}`;
    const signature = this.hmac(data, secret);
    
    return {
      token: `${data}:${signature}`,
      expiresAt: timestamp + validityPeriod
    };
  }

  // Verify timestamp-based token
  verifyTimestampToken(token, secret) {
    try {
      const [timestamp, random, signature] = token.split(':');
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if token has expired (5 minute window)
      if (currentTime - parseInt(timestamp) > 300) {
        return false;
      }
      
      const data = `${timestamp}:${random}`;
      const expectedSignature = this.hmac(data, secret);
      
      return this.verifyHmac(data, signature, secret);
    } catch (error) {
      return false;
    }
  }

  // Sanitize sensitive data for logging
  sanitizeForLogging(data) {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'hash',
      'creditCard',
      'ssn',
      'apiKey'
    ];
    
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

// Export singleton instance
const cryptoUtils = new CryptoUtils();

module.exports = cryptoUtils;
