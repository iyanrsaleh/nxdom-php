/**
 * NexaEncrypt - Simple JavaScript JSON Obfuscation Class
 * Basic encoding/decoding for JSON data obfuscation
 * Uses simple Base64 encoding with optional basic encryption
 */
class NexaEncrypt {
  constructor(secretKey = "nexa-default-secret-key-2025") {
    this.secretKey = secretKey;
    this.cache = new Map(); // Cache for successful decodes
    this.retryCount = 3; // Number of retries
    this.retryDelay = 100; // Delay between retries in ms
  }

  /**
   * Sleep helper for retry mechanism
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Simple XOR encryption with fixed key
   * @param {string} text - Text to encrypt
   * @param {string} key - Encryption key
   * @returns {string} Encrypted text
   */
  simpleXOR(text, key) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  /**
   * Encode JSON data to Base64 (simple obfuscation)
   * @param {Object|Array|string} data - Data to encode
   * @returns {string} Base64 encoded data
   */
  encodeJson(data) {
    try {
      // Convert data to JSON string
      const jsonString = typeof data === "string" ? data : JSON.stringify(data);

      // Simple Base64 encoding
      return btoa(unescape(encodeURIComponent(jsonString)));
    } catch (error) {
      throw new Error("Encoding failed: " + error.message);
    }
  }

  /**
   * Decode Base64 JSON data
   * @param {string} encodedData - Base64 encoded data
   * @returns {Object|Array|string} Decoded JSON data
   */
  decodeJson(encodedData) {
    try {
      // Decode base64
      const jsonString = decodeURIComponent(escape(atob(encodedData)));

      // Try to parse as JSON, return as string if parsing fails
      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        return jsonString;
      }
    } catch (error) {
      throw new Error("Decoding failed: " + error.message);
    }
  }

  /**
   * Obfuscate JSON data with simple XOR + Base64
   * @param {Object|Array|string} data - Data to obfuscate
   * @returns {string} Obfuscated data
   */
  obfuscateJson(data) {
    try {
      // Convert data to JSON string
      const jsonString = typeof data === "string" ? data : JSON.stringify(data);

      // URUTAN PENTING: UTF-8 DULU, baru XOR.
      //
      // Versi lama: XOR dulu (`simpleXOR(jsonString)`) baru
      // `encodeURIComponent`. Itu rusak untuk karakter non-ASCII —
      // XOR pada code unit menghasilkan nilai > 255 (mis. `…` U+2026
      // menjadi 8266), lalu `encodeURIComponent` memecahnya jadi
      // BEBERAPA byte. PHP membalikkannya dengan `base64_decode` + XOR
      // byte-demi-byte, tanpa tahu ada langkah UTF-8 di tengah — jadi
      // hasilnya JSON rusak.
      //
      // Gejalanya jahat karena SENYAP: `deobfuscateJson` mengembalikan
      // string mentah saat JSON.parse gagal (bukan melempar), sehingga
      // PHP menerima `$params = []` dan membalas "Too few arguments ...
      // 0 passed" — pesan yang sama sekali tidak menyebut enkripsi.
      // Terbukti: payload 6840 karakter DENGAN `…` gagal, payload 6840
      // karakter yang sama tanpa `…` berhasil.
      //
      // Sekarang: string → byte UTF-8 → XOR → Base64. XOR bekerja pada
      // byte (0-255), jadi hasilnya selalu aman untuk `btoa` dan cocok
      // dengan cara PHP membalikkannya.
      const utf8 = unescape(encodeURIComponent(jsonString));
      const xorEncrypted = this.simpleXOR(utf8, this.secretKey);
      return btoa(xorEncrypted);
    } catch (error) {
      throw new Error("Obfuscation failed: " + error.message);
    }
  }

  /**
   * Deobfuscate JSON data
   * @param {string} obfuscatedData - Obfuscated data
   * @returns {Object|Array|string} Deobfuscated JSON data
   */
  deobfuscateJson(obfuscatedData) {
    try {
      // Kebalikan obfuscateJson — urutannya juga dibalik:
      // Base64 → XOR (byte) → tafsirkan sebagai UTF-8.
      const xorEncrypted = atob(obfuscatedData);
      const utf8 = this.simpleXOR(xorEncrypted, this.secretKey);
      const jsonString = decodeURIComponent(escape(utf8));

      // Try to parse as JSON, return as string if parsing fails
      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        return jsonString;
      }
    } catch (error) {
      throw new Error("Deobfuscation failed: " + error.message);
    }
  }

  /**
   * Legacy methods for backward compatibility
   */

  /**
   * Encrypt JSON data (simple obfuscation)
   * @param {Object|Array|string} data - Data to encrypt
   * @returns {Promise<string>} Obfuscated data
   */
  async encryptJson(data) {
    return this.obfuscateJson(data);
  }

  /**
   * Decrypt JSON data (simple deobfuscation)
   * @param {string} encryptedData - Obfuscated data
   * @returns {Promise<Object|Array|string>} Deobfuscated data
   */
  async decryptJson(encryptedData) {
    return this.deobfuscateJson(encryptedData);
  }

  /**
   * Encrypt simple string data
   * @param {string} data - String data to encrypt
   * @returns {Promise<string>} Obfuscated data
   */
  async encrypt(data) {
    return this.obfuscateJson(data);
  }

  /**
   * Decrypt simple string data
   * @param {string} encryptedData - Obfuscated data
   * @returns {Promise<string>} Deobfuscated data
   */
  async decrypt(encryptedData) {
    return this.deobfuscateJson(encryptedData);
  }

  /**
   * Set new secret key
   * @param {string} newKey - New secret key
   */
  setSecretKey(newKey) {
    this.secretKey = newKey;
  }

  /**
   * Get current secret key
   * @returns {string} Current secret key
   */
  getSecretKey() {
    return this.secretKey;
  }

  /**
   * Convert safe string back to standard base64 (enhanced version)
   * @param {string} data - Safe encoded data with mixed patterns
   * @returns {string} Standard base64 data
   */
  safeDecode(data) {
    let result = data;

    // Handle multiple encoding patterns in sequence
    // First: Handle PHP safe encoding (p1, p2, p3)
    if (data.includes("p1") || data.includes("p2") || data.includes("p3")) {
      result = result
        .replace(/p1/g, "+")
        .replace(/p2/g, "/")
        .replace(/p3/g, "=");
    }

    // Second: Handle URL-safe base64 (-, _)
    if (result.includes("-") || result.includes("_")) {
      result = result.replace(/-/g, "+").replace(/_/g, "/");
    }

    // Third: Clean up any remaining invalid characters
    const beforeCleanup = result.length;
    result = result.replace(/[^A-Za-z0-9+/=]/g, "");
    if (result.length !== beforeCleanup) {
      // console.log(
      //   `🔧 Removed ${beforeCleanup - result.length} invalid characters`
      // );
    }

    // Fourth: Fix padding
    const padding = result.length % 4;
    if (padding === 2) {
      result += "==";
      // console.log("🔧 Added == padding");
    } else if (padding === 3) {
      result += "=";
      // console.log("🔧 Added = padding");
    }

    // console.log("🔧 Final safe decode result length:", result.length);
    return result;
  }

  /**
   * Convert standard base64 to safe string (compatible with NexaDecode.php)
   * @param {string} data - Standard base64 data
   * @returns {string} Safe encoded data
   */
  safeEncode(data) {
    // Replace base64 characters with safe alternatives
    return data.replace(/\+/g, "p1").replace(/\//g, "p2").replace(/=/g, "p3");
  }

  /**
   * Decode PHP NexaDecode format (AES-256-CBC with specific safe encoding)
   * @param {string} encodedData - Data from PHP NexaDecode->encode()
   * @param {string} secretKey - Secret key (optional, uses instance key if not provided)
   * @returns {Promise<Object|Array|null>} Decoded data or null if failed
   */
  async decodePhpNexaDecode(encodedData, secretKey = null) {
    try {
      if (!window.crypto || !window.crypto.subtle) {
        return null;
      }

      const keyToUse = secretKey || this.secretKey;

      // PHP NexaDecode uses safe encoding (p1, p2, p3) then AES-256-CBC
      try {
        // First convert from PHP safe encoding to standard base64
        let base64Data = encodedData;

        // Check encoding type and convert accordingly
        if (
          encodedData.includes("p1") ||
          encodedData.includes("p2") ||
          encodedData.includes("p3")
        ) {
          // Standard PHP safe encoding (p1, p2, p3)
          base64Data = encodedData
            .replace(/p1/g, "+")
            .replace(/p2/g, "/")
            .replace(/p3/g, "=");
          // console.log("🔍 Converting from PHP safe encoding (p1/p2/p3)");
        } else if (encodedData.includes("-") || encodedData.includes("_")) {
          // URL-safe base64 encoding (-, _)
          base64Data = encodedData.replace(/-/g, "+").replace(/_/g, "/");

          // Add padding if needed for URL-safe
          const padding = base64Data.length % 4;
          if (padding === 2) {
            base64Data += "==";
          } else if (padding === 3) {
            base64Data += "=";
          }

          // console.log("🔍 Converting from URL-safe base64 (-/_)");
        } else {
          // console.log("🔍 Trying direct base64 decode");
        }

        // console.log(
        //   "🔍 After conversion (first 50):",
        //   base64Data.substring(0, 50)
        // );

        // Fix and validate base64 - use the truncated version if full fails
        const originalBase64 = base64Data;
        base64Data = this.fixBase64Padding(base64Data);
        if (!base64Data) {
          // console.log(
          //   "❌ Base64 fix failed for:",
          //   originalBase64.substring(0, 50)
          // );
          throw new Error("Invalid base64 format");
        }

        // console.log("🔍 Using base64 length:", base64Data.length);

        // Try to decode the base64 data
        let combinedData;
        try {
          combinedData = Uint8Array.from(atob(base64Data), (c) =>
            c.charCodeAt(0)
          );
          // console.log("✅ Successfully decoded base64 to binary data");
        } catch (atobError) {
          // console.log("❌ Failed to decode base64:", atobError.message);
          throw new Error("Base64 decode failed");
        }

        if (combinedData.length >= 16) {
          const iv = combinedData.slice(0, 16);
          const encryptedData = combinedData.slice(16);

          // console.log(
          //   "🔍 AES data lengths - IV:",
          //   iv.length,
          //   "Encrypted:",
          //   encryptedData.length
          // );

          // Create key exactly like PHP: hash('sha256', $secretKey, true)
          const encoder = new TextEncoder();
          const keyData = encoder.encode(keyToUse);
          const hashedKey = await window.crypto.subtle.digest(
            "SHA-256",
            keyData
          );

          const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            hashedKey,
            { name: "AES-CBC" },
            false,
            ["decrypt"]
          );

          try {
            const decryptedBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-CBC", iv: iv },
              cryptoKey,
              encryptedData
            );

            const decoder = new TextDecoder();
            const decryptedString = decoder.decode(decryptedBuffer);
            // console.log(
            //   "✅ AES decryption successful, length:",
            //   decryptedString.length
            // );

            try {
              const parsed = JSON.parse(decryptedString);
              // console.log("✅ PHP NexaDecode format successful");
              return parsed;
            } catch (parseError) {
              // console.log(
              //   "⚠️ PHP NexaDecode AES successful but JSON parse failed"
              // );
              // console.log(
              //   "🔍 Decrypted string sample:",
              //   decryptedString.substring(0, 100)
              // );
              return decryptedString;
            }
          } catch (aesError) {
            // console.log("❌ AES decryption failed:", aesError.message);
            throw aesError;
          }
        } else {
          // console.log("❌ Combined data too short:", combinedData.length);
          throw new Error("Combined data too short for AES");
        }
      } catch (error) {
        // console.log("🔄 PHP NexaDecode format failed:", error.message);
        throw error;
      }
    } catch (error) {
      // console.log("❌ PHP NexaDecode decode error:", error.message);
      return null;
    }
  }

  /**
   * Alternative decode method for non-standard token formats
   * @param {string} encodedData - Raw token data
   * @returns {Object|null} Decoded data or null if failed
   */
  decodeAlternativeFormat(encodedData) {
    try {
      // console.log("🔍 Trying alternative token format decode...");

      // Try URL decode first
      try {
        const urlDecoded = decodeURIComponent(encodedData);
        if (urlDecoded !== encodedData) {
          const result = JSON.parse(urlDecoded);
          // console.log("✅ URL decode successful");
          return result;
        }
      } catch (urlError) {
        // Continue to next method
      }

      // Try hex decode
      try {
        if (
          /^[0-9a-fA-F]+$/.test(encodedData) &&
          encodedData.length % 2 === 0
        ) {
          const hexDecoded = encodedData
            .match(/.{1,2}/g)
            .map((byte) => String.fromCharCode(parseInt(byte, 16)))
            .join("");
          const result = JSON.parse(hexDecoded);
          // console.log("✅ Hex decode successful");
          return result;
        }
      } catch (hexError) {
        // Continue to next method
      }

      // Try as plain JSON
      try {
        const result = JSON.parse(encodedData);
        // console.log("✅ Plain JSON decode successful");
        return result;
      } catch (jsonError) {
        // Continue to next method
      }

      // console.log("❌ All alternative format attempts failed");
      return null;
    } catch (error) {
      // console.log("❌ Alternative decode error:", error.message);
      return null;
    }
  }

  /**
   * Direct working decode method - bypasses complex logic
   */
  async directDecode(encodedData, secretKey = null) {
    try {
      // console.log("🎯 Direct decode attempt...");

      // Simple approach: just convert p1/p2/p3 and try direct AES
      let cleaned = encodedData
        .replace(/p1/g, "+")
        .replace(/p2/g, "/")
        .replace(/p3/g, "=");

      // Remove any invalid chars and fix padding
      cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, "");
      const pad = cleaned.length % 4;
      if (pad === 2) cleaned += "==";
      else if (pad === 3) cleaned += "=";

      // Try to get the largest valid base64 chunk
      for (let len = cleaned.length; len >= 100; len -= 4) {
        try {
          const chunk = cleaned.substring(0, len);
          const binary = atob(chunk);
          const data = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            data[i] = binary.charCodeAt(i);
          }

          if (data.length >= 16) {
            // Try AES decrypt
            const iv = data.slice(0, 16);
            const encrypted = data.slice(16);

            const key = await window.crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(secretKey || this.secretKey)
            );
            const cryptoKey = await window.crypto.subtle.importKey(
              "raw",
              key,
              { name: "AES-CBC" },
              false,
              ["decrypt"]
            );

            try {
              const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-CBC", iv },
                cryptoKey,
                encrypted
              );
              const text = new TextDecoder().decode(decrypted);
              const result = JSON.parse(text);

              // console.log("🎯 Direct decode SUCCESS!");
              return result;
            } catch (aesErr) {
              continue; // Try next length
            }
          }
        } catch (err) {
          continue;
        }
      }

      return null;
    } catch (error) {
      // console.log("🎯 Direct decode failed:", error.message);
      return null;
    }
  }

  /**
   * Analyze token format to understand what we're dealing with
   */
  analyzeToken(token) {
    console.log("🔍 Analyzing token - length:", token.length);
    console.log("🔍 First 50 chars:", token.substring(0, 50));
    console.log("🔍 Last 50 chars:", token.substring(token.length - 50));

    // Character analysis
    const hasP123 =
      token.includes("p1") || token.includes("p2") || token.includes("p3");
    const hasUrlSafe = token.includes("-") || token.includes("_");
    const hasBase64Chars = /^[A-Za-z0-9+/=]+$/.test(token);
    const hasOnlyAlphaNum = /^[A-Za-z0-9]+$/.test(token);

    console.log("🔍 Has p1/p2/p3:", hasP123);
    console.log("🔍 Has URL-safe:", hasUrlSafe);
    console.log("🔍 Has base64 chars:", hasBase64Chars);
    console.log("🔍 Only alphanumeric:", hasOnlyAlphaNum);

    // Try different decode approaches and log results
    const tests = [
      {
        name: "P1/P2/P3 converted",
        test: () =>
          atob(
            token.replace(/p1/g, "+").replace(/p2/g, "/").replace(/p3/g, "=")
          ),
      },
      {
        name: "Direct base64",
        test: () => atob(token),
      },
      {
        name: "URL-safe converted",
        test: () =>
          atob(
            token.replace(/-/g, "+").replace(/_/g, "/") +
              "=".repeat((4 - (token.length % 4)) % 4)
          ),
      },
      {
        name: "Hex decode",
        test: () =>
          token
            .match(/.{1,2}/g)
            .map((byte) => String.fromCharCode(parseInt(byte, 16)))
            .join(""),
      },
      {
        name: "URI decode",
        test: () => decodeURIComponent(token),
      },
    ];

    for (const test of tests) {
      try {
        console.log(`🔧 Testing: ${test.name}`);
        const result = test.test();
        console.log(`✅ ${test.name}: SUCCESS (${result.length} chars)`);

        // Try to parse as JSON first
        try {
          const json = JSON.parse(result);
          console.log(`🎯 ${test.name} + JSON: SUCCESS!`);
          return { method: test.name, result: json };
        } catch (jsonErr) {
          // If not JSON, try AES decryption
          if (result.length >= 16) {
            const aesResult = this.tryAESDecryptSync(result);
            if (aesResult) {
              console.log(`🎯 ${test.name} + AES: SUCCESS!`);
              return { method: test.name + " + AES", result: aesResult };
            }
          }
          console.log(`⚠️ ${test.name}: Binary data, not JSON`);
        }
      } catch (err) {
        console.log(`❌ ${test.name}: ${err.message}`);
      }
    }

    console.log("❌ All analysis tests failed");
    return null;
  }

  /**
   * Synchronous AES decrypt attempt for analysis
   */
  tryAESDecryptSync(binaryData) {
    try {
      // Convert to Uint8Array
      const data = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        data[i] = binaryData.charCodeAt(i);
      }

      if (data.length >= 16) {
        const iv = data.slice(0, 16);
        const encrypted = data.slice(16);

        // We'll need to make this async, but for now just indicate it's AES-encrypted
        return "AES_ENCRYPTED_DATA";
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Async AES decrypt for actual decryption
   */
  async tryAESDecryptAsync(binaryData, secretKey = null) {
    try {
      console.log("      🔧 Starting AES decrypt...");
      console.log("      📊 Binary data length:", binaryData.length);

      if (!window.crypto || !window.crypto.subtle) {
        console.log("      ❌ Web Crypto API not available");
        return null;
      }

      const keyToUse = secretKey || this.secretKey;
      console.log("      🔑 Using key:", keyToUse);

      // Convert to Uint8Array
      const data = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        data[i] = binaryData.charCodeAt(i);
      }

      if (data.length >= 16) {
        const iv = data.slice(0, 16);
        const encrypted = data.slice(16);

        console.log(
          "      🔍 IV length:",
          iv.length,
          "Encrypted length:",
          encrypted.length
        );
        console.log("      🔍 IV bytes:", Array.from(iv.slice(0, 8)));
        console.log(
          "      🔍 Encrypted bytes:",
          Array.from(encrypted.slice(0, 8))
        );

        // Validate encrypted data length (should be multiple of 16 for AES-CBC)
        if (encrypted.length % 16 !== 0) {
          console.log(
            "      ⚠️ Encrypted data not multiple of 16, remainder:",
            encrypted.length % 16
          );

          // Try to fix padding by removing extra bytes
          const fixedEncrypted = encrypted.slice(
            0,
            encrypted.length - (encrypted.length % 16)
          );
          console.log(
            "      🔧 Fixed encrypted length:",
            fixedEncrypted.length
          );

          if (fixedEncrypted.length > 0) {
            console.log("      🔧 Trying with fixed padding...");
            const result = await this.performAESDecrypt(
              iv,
              fixedEncrypted,
              keyToUse
            );
            if (result) {
              console.log("      ✅ Fixed padding worked!");
              return result;
            }
          }
        }

        // Try original data
        console.log("      🔧 Trying original encrypted data...");
        const result = await this.performAESDecrypt(iv, encrypted, keyToUse);
        if (result) {
          console.log("      ✅ Original data worked!");
          return result;
        }

        // Try different key format (without hashing)
        console.log("      🔧 Trying raw key (no SHA256)...");
        const resultNoHash = await this.performAESDecryptNoHash(
          iv,
          encrypted,
          keyToUse
        );
        if (resultNoHash) {
          console.log("      ✅ Raw key worked!");
          return resultNoHash;
        }
      } else {
        console.log("      ❌ Data too short for AES (need >= 16 bytes)");
      }

      console.log("      ❌ All AES methods failed");
      return null;
    } catch (error) {
      console.log("      ❌ AES decrypt error:", error.name, error.message);
      return null;
    }
  }

  /**
   * Perform AES decryption with SHA256 hashed key
   */
  async performAESDecrypt(iv, encrypted, keyToUse) {
    try {
      console.log("        🔧 performAESDecrypt with SHA256...");

      // Create key like PHP: hash('sha256', $secretKey, true)
      const encoder = new TextEncoder();
      const keyData = encoder.encode(keyToUse);
      const hashedKey = await window.crypto.subtle.digest("SHA-256", keyData);

      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        hashedKey,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );

      console.log("        🔧 Attempting AES-CBC decryption...");
      console.log(
        "        📊 IV length:",
        iv.length,
        "Encrypted length:",
        encrypted.length
      );

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv },
        cryptoKey,
        encrypted
      );

      console.log("        ✅ AES decryption successful!");

      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);

      console.log(
        "        📝 Decrypted string length:",
        decryptedString.length
      );
      console.log(
        "        📝 First 50 chars:",
        decryptedString.substring(0, 50)
      );

      try {
        const jsonResult = JSON.parse(decryptedString);
        console.log("        ✅ JSON parse successful!");
        return jsonResult;
      } catch (parseError) {
        console.log("        ⚠️ Not JSON, returning string");
        return decryptedString;
      }
    } catch (error) {
      console.log(
        "        ❌ SHA256 decrypt failed:",
        error.name,
        "-",
        error.message
      );
      return null;
    }
  }

  /**
   * Perform AES decryption without key hashing (raw key)
   */
  async performAESDecryptNoHash(iv, encrypted, keyToUse) {
    try {
      // Pad or truncate key to 32 bytes for AES-256
      const encoder = new TextEncoder();
      let keyBytes = encoder.encode(keyToUse);

      if (keyBytes.length < 32) {
        // Pad with zeros
        const paddedKey = new Uint8Array(32);
        paddedKey.set(keyBytes);
        keyBytes = paddedKey;
      } else if (keyBytes.length > 32) {
        // Truncate to 32 bytes
        keyBytes = keyBytes.slice(0, 32);
      }

      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv },
        cryptoKey,
        encrypted
      );

      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);

      try {
        const jsonResult = JSON.parse(decryptedString);
        return jsonResult;
      } catch (parseError) {
        return decryptedString;
      }
    } catch (error) {
      return null;
    }
  }

  async secureDecode(encodedData, secretKey = null) {
    const keyToUse = secretKey || this.secretKey;

    // Enhanced P1/P2/P3 + AES method (handles random IV)
    try {
      // Convert p1/p2/p3 to standard base64
      const converted = encodedData
        .replace(/p1/g, "+")
        .replace(/p2/g, "/")
        .replace(/p3/g, "=");

      // Clean invalid characters
      const cleaned = converted.replace(/[^A-Za-z0-9+/=]/g, "");

      // Fix base64 padding
      let fixedBase64 = cleaned;
      const padding = fixedBase64.length % 4;
      if (padding === 1) {
        fixedBase64 = fixedBase64.slice(0, -1);
      } else if (padding === 2) {
        fixedBase64 += "==";
      } else if (padding === 3) {
        fixedBase64 += "=";
      }

      // Decode base64 to binary
      const binaryData = atob(fixedBase64);

      if (binaryData.length >= 16) {
        const data = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          data[i] = binaryData.charCodeAt(i);
        }

        // Extract IV (first 16 bytes) and encrypted data (rest)
        const iv = data.slice(0, 16);
        let encrypted = data.slice(16);

        // Fix encrypted data length (must be multiple of 16 for AES-CBC)
        const remainder = encrypted.length % 16;
        if (remainder !== 0) {
          encrypted = encrypted.slice(0, encrypted.length - remainder);
        }

        if (encrypted.length >= 16) {
          // Create SHA256 hashed key (same as PHP)
          const encoder = new TextEncoder();
          const keyData = encoder.encode(keyToUse);
          const hashedKey = await window.crypto.subtle.digest(
            "SHA-256",
            keyData
          );

          const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            hashedKey,
            { name: "AES-CBC" },
            false,
            ["decrypt"]
          );

          // Perform AES-CBC decryption
          const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-CBC", iv: iv },
            cryptoKey,
            encrypted
          );

          const decoder = new TextDecoder();
          const decryptedString = decoder.decode(decryptedBuffer);

          // Try multiple JSON parsing strategies

          // Strategy 1: Remove PKCS7 padding
          try {
            const lastByte = decryptedString.charCodeAt(
              decryptedString.length - 1
            );
            if (lastByte > 0 && lastByte <= 16) {
              const cleanString = decryptedString.slice(
                0,
                decryptedString.length - lastByte
              );
              const result = JSON.parse(cleanString);
              if (result && typeof result === "object") {
                return result;
              }
            }
          } catch (paddingError) {
            // Continue to next strategy
          }

          // Strategy 2: Direct JSON parse
          try {
            const result = JSON.parse(decryptedString);
            if (result && typeof result === "object") {
              return result;
            }
          } catch (directError) {
            // Continue to next strategy
          }

          // Strategy 3: Trim null bytes and parse
          try {
            const trimmed = decryptedString.replace(/\0+$/, "").trim();
            const result = JSON.parse(trimmed);
            if (result && typeof result === "object") {
              return result;
            }
          } catch (trimError) {
            // Continue to fallback methods
          }
        }
      }
    } catch (p123Error) {
      // Continue to fallback methods
    }

    // Fallback: Try XOR + Base64 (NexaEncrypt format)
    try {
      const result = await this.decryptJson(encodedData);
      if (result && typeof result === "object") {
        return result;
      }
    } catch (xorError) {
      // Continue to next fallback
    }

    // Final fallback: Direct deobfuscation
    try {
      const result = this.deobfuscateJson(encodedData);
      if (result && typeof result === "object") {
        return result;
      }
    } catch (deobfError) {
      // All methods failed
    }

    return null;
  }

  /**
   * Internal decode attempt method
   */
  async _attemptDecode(encodedData, secretKey = null) {
    const keyToUse = secretKey || this.secretKey;

    // Quick validation
    if (
      !encodedData ||
      typeof encodedData !== "string" ||
      encodedData.length < 10
    ) {
      throw new Error("Invalid token format");
    }

    // Debug info (only on first attempt)
    // console.log(" Token analysis:");
    // console.log("  Length:", encodedData.length);
    // console.log("  First 30 chars:", encodedData.substring(0, 30));
    // console.log("  Secret key used:", keyToUse);

    // Check if Web Crypto API is available
    if (!window.crypto || !window.crypto.subtle) {
      // console.log("🚫 Web Crypto API not available, using fallback");
      return this.decodeSafeStringOnly(encodedData);
    }

    // Strategy 1: Try PHP NexaDecode format with multiple keys (most likely to succeed)
    const keysToTry = [
      "nexaui2025", // Default framework key
      keyToUse, // Current key from instance
      "nexa-default-secret-key-2025", // Fallback key
    ];

    for (const testKey of keysToTry) {
      try {
        const phpResult = await this.decodePhpNexaDecode(encodedData, testKey);
        if (phpResult !== null && typeof phpResult === "object") {
          // console.log(`✅ PHP NexaDecode success with key: ${testKey}`);
          return phpResult;
        }
      } catch (phpError) {
        // console.log(
        //   `⚠️ PHP decode failed for key ${testKey}:`,
        //   phpError.message
        // );
      }
    }

    // Strategy 2: Try enhanced safe string decode
    try {
      const safeResult = await this._enhancedSafeStringDecode(encodedData);
      if (safeResult !== null && typeof safeResult === "object") {
        // console.log("✅ Enhanced safe string decode successful");
        return safeResult;
      }
    } catch (safeError) {
      // console.log("⚠️ Enhanced safe decode failed:", safeError.message);
    }

    // Strategy 3: Try simple obfuscation methods
    try {
      const simpleResult = await this.decryptJson(encodedData);
      if (simpleResult !== null && typeof simpleResult === "object") {
        // console.log("✅ Simple obfuscation decode successful");
        return simpleResult;
      }
    } catch (simpleError) {
      // Continue to next strategy
    }

    // Strategy 4: Try direct deobfuscation
    try {
      const directResult = this.deobfuscateJson(encodedData);
      if (directResult !== null && typeof directResult === "object") {
        // console.log("✅ Direct deobfuscation successful");
        return directResult;
      }
    } catch (directError) {
      // Continue to next strategy
    }

    return null;
  }

  /**
   * Enhanced safe string decode with better error handling
   */
  async _enhancedSafeStringDecode(encodedData) {
    try {
      // Multiple decode strategies
      const strategies = [
        () => this.decodeSafeStringOnly(encodedData),
        () => this.decodeAlternativeFormat(encodedData),
        () => this._bruteForceBase64Decode(encodedData),
      ];

      for (const strategy of strategies) {
        try {
          const result = strategy();
          if (result && typeof result === "object") {
            return result;
          }
        } catch (strategyError) {
          continue;
        }
      }

      return null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Brute force base64 decode by trying different chunk sizes
   */
  _bruteForceBase64Decode(encodedData) {
    try {
      // Clean the string
      let cleaned = this.safeDecode(encodedData);

      // Try different substring lengths to find valid base64
      for (let end = cleaned.length; end >= 100; end -= 4) {
        try {
          const chunk = cleaned.substring(0, end);
          const decoded = atob(chunk);

          // Try to parse as JSON
          try {
            const result = JSON.parse(decoded);
            if (result && typeof result === "object") {
              return result;
            }
          } catch (jsonError) {
            continue;
          }
        } catch (atobError) {
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = NexaEncrypt;
}

// Make available globally
if (typeof window !== "undefined") {
  window.NexaEncrypt = NexaEncrypt;
}

// Export both named and default exports
export { NexaEncrypt };
export default NexaEncrypt;
