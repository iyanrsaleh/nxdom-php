/**
 * NexaCrypto - JavaScript version
 * Compatible with PHP NexaCrypto class
 */
class NexaCrypto {
  /**
   * Encode data to base64 format compatible with PHP
   *
   * @param {*} data Data to encode (will be converted to JSON)
   * @returns {string} Base64 encoded string
   */
  static encode(data) {
    // Convert data to JSON string
    const jsonString = JSON.stringify(data);

    // Encode to base64 (compatible with PHP base64_encode)
    return btoa(unescape(encodeURIComponent(jsonString)));
  }

  /**
   * Decode base64 string to original data
   *
   * @param {string} encodedData Base64 encoded string
   * @returns {*} Decoded data
   */
  static decode(encodedData) {
    // Decode from base64
    const jsonString = decodeURIComponent(escape(atob(encodedData)));

    // Convert JSON string back to data
    return JSON.parse(jsonString);
  }

  /**
   * Encode data with encryption key using Web Crypto API
   *
   * @param {*} data Data to encode
   * @param {string} key Encryption key
   * @returns {Promise<string>} Base64 encoded encrypted string
   */
  static async encodeWithKey(data, key) {
    try {
      // Convert data to JSON string
      const jsonString = JSON.stringify(data);

      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(jsonString);

      // Create key from string
      const keyBuffer = await this._createCryptoKey(key);

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(16));

      // Encrypt the data
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv: iv },
        keyBuffer,
        dataBuffer
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error("Encryption error:", error);
      return false;
    }
  }

  /**
   * Decode encrypted data with key
   *
   * @param {string} encryptedData Base64 encoded encrypted string
   * @param {string} key Decryption key
   * @returns {Promise<*>} Decoded data or false on failure
   */
  static async decodeWithKey(encryptedData, key) {
    try {
      // Decode base64
      const combined = new Uint8Array(
        [...atob(encryptedData)].map((char) => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 16);
      const encrypted = combined.slice(16);

      // Create key from string
      const keyBuffer = await this._createCryptoKey(key);

      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv },
        keyBuffer,
        encrypted
      );

      // Convert back to string
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decrypted);

      // Convert JSON string back to data
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Decryption error:", error);
      return false;
    }
  }

  /**
   * Generate a secure random key
   *
   * @param {number} length Key length in characters (default: 32)
   * @returns {string} Generated key
   */
  static generateKey(length = 32) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomArray = new Uint8Array(length);
    crypto.getRandomValues(randomArray);

    for (let i = 0; i < length; i++) {
      result += chars.charAt(randomArray[i] % chars.length);
    }

    return result;
  }

  /**
   * Create hash from string for use as key
   *
   * @param {string} string String to hash
   * @param {string} algorithm Hash algorithm (default: 'SHA-256')
   * @returns {Promise<string>} Hashed key
   */
  static async createKey(string, algorithm = "SHA-256") {
    const encoder = new TextEncoder();
    const data = encoder.encode(string);
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Encode JSON string directly to base64
   *
   * @param {string} jsonString JSON string to encode
   * @returns {string} Base64 encoded string
   */
  static encodeJson(jsonString) {
    return btoa(unescape(encodeURIComponent(jsonString)));
  }

  /**
   * Decode base64 to JSON string
   *
   * @param {string} encodedData Base64 encoded string
   * @returns {string} JSON string
   */
  static decodeToJson(encodedData) {
    return decodeURIComponent(escape(atob(encodedData)));
  }

  /**
   * Check if a string is valid base64
   *
   * @param {string} data String to check
   * @returns {boolean} True if valid base64
   */
  static isValidBase64(data) {
    try {
      return btoa(atob(data)) === data;
    } catch (e) {
      return false;
    }
  }

  /**
   * Create crypto key from string (internal method)
   *
   * @param {string} keyString Key string
   * @returns {Promise<CryptoKey>} Crypto key
   * @private
   */
  static async _createCryptoKey(keyString) {
    // Hash the key string to get consistent 256-bit key
    const hashedKey = await this.createKey(keyString);

    // Convert hex string to ArrayBuffer
    const keyBuffer = new Uint8Array(
      hashedKey.match(/.{2}/g).map((byte) => parseInt(byte, 16))
    );

    // Import key for AES-CBC
    return await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-CBC" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Test compatibility with PHP version
   *
   * @returns {boolean} True if browser supports required features
   */
  static isSupported() {
    return (
      typeof crypto !== "undefined" &&
      typeof crypto.subtle !== "undefined" &&
      typeof TextEncoder !== "undefined" &&
      typeof TextDecoder !== "undefined"
    );
  }
}

// Export for ES6 modules
export default NexaCrypto;

// Export for Node.js if available
if (typeof module !== "undefined" && module.exports) {
  module.exports = NexaCrypto;
}

// Example usage:
/*
// Basic encode/decode (compatible with PHP btoa/atob)
const data = { name: 'John', age: 30 };
const encoded = NexaCrypto.encode(data);
const decoded = NexaCrypto.decode(encoded);

// Encrypted encode/decode with key
const key = 'my-secret-key';
NexaCrypto.encodeWithKey(data, key).then(encrypted => {
    NexaCrypto.decodeWithKey(encrypted, key).then(decrypted => {
        console.log(decrypted);
    });
});

// Generate secure key
const secureKey = NexaCrypto.generateKey();

// Create key from string
NexaCrypto.createKey('my-password').then(hashedKey => {
    console.log(hashedKey);
});
*/
