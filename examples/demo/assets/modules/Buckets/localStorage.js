import NexaEncrypt from "./NexaEncrypt.js";

export function LocalStorageManager() {
  const nexaEncrypt = new NexaEncrypt("nexa-default-secret-key-2025");

  return {
    // Set data with optional encryption
    set: function (key, data, encrypt = false) {
      try {
        let valueToStore = data;

        if (encrypt) {
          valueToStore = nexaEncrypt.encryptJson(data);
        } else if (typeof data === "object") {
          valueToStore = JSON.stringify(data);
        }

        localStorage.setItem(key, valueToStore);
        return Promise.resolve({ success: true, key });
      } catch (error) {
        console.error("localStorage SET Error:", error);
        return Promise.reject(error);
      }
    },

    // Get data with optional decryption
    get: function (key, decrypt = false) {
      try {
        const value = localStorage.getItem(key);

        if (value === null) {
          return Promise.resolve(null);
        }

        let result = value;

        if (decrypt) {
          result = nexaEncrypt.decryptJson(value);
        } else {
          try {
            result = JSON.parse(value);
          } catch (e) {
            // If JSON parse fails, return as string
            result = value;
          }
        }

        return Promise.resolve(result);
      } catch (error) {
        console.error("localStorage GET Error:", error);
        return Promise.reject(error);
      }
    },

    // Get all items with optional prefix filter
    getAll: function (prefix = "") {
      try {
        const items = {};

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith(prefix)) {
            const value = localStorage.getItem(key);
            try {
              items[key] = JSON.parse(value);
            } catch (e) {
              items[key] = value;
            }
          }
        }

        return Promise.resolve({ data: items });
      } catch (error) {
        console.error("localStorage GETALL Error:", error);
        return Promise.reject(error);
      }
    },

    // Delete specific key
    delete: function (key) {
      try {
        localStorage.removeItem(key);
        return Promise.resolve({ success: true, key });
      } catch (error) {
        console.error("localStorage DELETE Error:", error);
        return Promise.reject(error);
      }
    },

    // Clear all localStorage
    clear: function () {
      try {
        localStorage.clear();
        return Promise.resolve({ success: true });
      } catch (error) {
        console.error("localStorage CLEAR Error:", error);
        return Promise.reject(error);
      }
    },

    // Clear with prefix filter
    clearPrefix: function (prefix) {
      try {
        const keysToDelete = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith(prefix)) {
            keysToDelete.push(key);
          }
        }

        keysToDelete.forEach((key) => localStorage.removeItem(key));

        return Promise.resolve({
          success: true,
          deletedCount: keysToDelete.length,
          deletedKeys: keysToDelete,
        });
      } catch (error) {
        console.error("localStorage CLEAR PREFIX Error:", error);
        return Promise.reject(error);
      }
    },

    // Check if key exists
    has: function (key) {
      return localStorage.getItem(key) !== null;
    },

    // Get storage info
    getInfo: function () {
      return {
        type: "localStorage",
        itemCount: localStorage.length,
        estimatedSize: new Blob(Object.values(localStorage)).size + " bytes",
        keys: Object.keys(localStorage),
      };
    },

    // Get storage size (approximate)
    getSize: function () {
      let total = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length;
        }
      }
      return total;
    },

    // Export localStorage data
    export: function (options = {}) {
      try {
        const {
          prefix = "",
          encrypt = false,
          includeMetadata = true,
          excludeKeys = [],
        } = options;

        const exportData = {
          metadata: includeMetadata
            ? {
                type: "localStorage",
                exportDate: new Date().toISOString(),
                prefix: prefix,
                itemCount: 0,
              }
            : null,
          data: {},
        };

        let itemCount = 0;

        // Export all items or filtered by prefix
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);

          // Skip if key doesn't match prefix or is in exclude list
          if (!key.startsWith(prefix) || excludeKeys.includes(key)) {
            continue;
          }

          const value = localStorage.getItem(key);
          let parsedValue;

          try {
            parsedValue = JSON.parse(value);
          } catch (e) {
            parsedValue = value; // Keep as string if not JSON
          }

          exportData.data[key] = parsedValue;
          itemCount++;
        }

        if (exportData.metadata) {
          exportData.metadata.itemCount = itemCount;
        }

        let result = exportData;
        if (encrypt) {
          result = nexaEncrypt.encryptJson(exportData);
        }

        return Promise.resolve({
          success: true,
          data: result,
          size: JSON.stringify(result).length,
          itemCount: itemCount,
          keys: Object.keys(exportData.data),
        });
      } catch (error) {
        console.error("localStorage Export Error:", error);
        return Promise.reject(error);
      }
    },

    // Import localStorage data
    import: function (importData, options = {}) {
      try {
        const {
          decrypt = false,
          overwrite = false,
          prefix = "",
          clearBefore = false,
        } = options;

        let data = importData;
        if (decrypt) {
          data = nexaEncrypt.decryptJson(importData);
        }

        // Validate import data structure
        if (!data.data || typeof data.data !== "object") {
          return Promise.reject(new Error("Invalid import data format"));
        }

        // Clear existing data with prefix if requested
        if (clearBefore && prefix) {
          this.clearPrefix(prefix);
        } else if (clearBefore) {
          localStorage.clear();
        }

        const results = { success: [], failed: [], skipped: [] };
        const keys = Object.keys(data.data);

        for (const key of keys) {
          try {
            const finalKey = prefix ? `${prefix}${key}` : key;

            // Check if key exists and overwrite is false
            if (!overwrite && localStorage.getItem(finalKey) !== null) {
              results.skipped.push(finalKey);
              continue;
            }

            const value = data.data[key];
            const valueToStore =
              typeof value === "object" ? JSON.stringify(value) : value;

            localStorage.setItem(finalKey, valueToStore);
            results.success.push(finalKey);
          } catch (error) {
            console.error(`Failed to import key "${key}":`, error);
            results.failed.push({ key, error: error.message });
          }
        }

        return Promise.resolve({
          success: true,
          imported: results.success.length,
          failed: results.failed.length,
          skipped: results.skipped.length,
          details: results,
          metadata: data.metadata || null,
        });
      } catch (error) {
        console.error("localStorage Import Error:", error);
        return Promise.reject(error);
      }
    },

    // Export to downloadable file
    exportToFile: function (filename = null, options = {}) {
      return new Promise(async (resolve, reject) => {
        try {
          const exportResult = await this.export(options);
          const data = exportResult.data;

          const fileName =
            filename ||
            `localStorage_backup_${
              new Date().toISOString().split("T")[0]
            }.json`;
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });

          // Create download link
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          resolve({
            success: true,
            filename: fileName,
            size: blob.size,
            itemCount: exportResult.itemCount,
          });
        } catch (error) {
          console.error("localStorage Export to File Error:", error);
          reject(error);
        }
      });
    },

    // Import from file
    importFromFile: function (file, options = {}) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (event) => {
          try {
            const jsonData = JSON.parse(event.target.result);
            const importResult = await this.import(jsonData, options);

            resolve({
              ...importResult,
              filename: file.name,
              fileSize: file.size,
            });
          } catch (error) {
            console.error("localStorage Import from File Error:", error);
            reject(error);
          }
        };

        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });
    },

    // Health check for localStorage
    healthCheck: function () {
      const health = {
        localStorage: { available: false, error: null },
      };

      // Test localStorage
      try {
        const testKey = "__storage_health_test__";
        localStorage.setItem(testKey, "test");
        localStorage.removeItem(testKey);
        health.localStorage.available = true;
      } catch (error) {
        health.localStorage.error = error.message;
      }

      return health;
    },
  };
}
