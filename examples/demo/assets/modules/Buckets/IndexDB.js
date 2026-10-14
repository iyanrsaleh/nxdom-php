export const IndexedDBManager = {
  db: null,
  dbName: null,
  version: null,
  stores: new Set(), // Track all requested stores
  observers: new Map(), // Real-time observers
  pollingIntervals: new Map(), // Polling intervals
  broadcastChannel: null, // Cross-tab communication
  
  // ============================================
  // 🔐 ENCRYPTION CONFIGURATION (AUTO ENABLED)
  // ============================================
  encryptionEnabled: true, // 🔐 ENABLED BY DEFAULT - Auto encrypt semua data
  encryptionSecretKey: "nexaui2025", // Default secret key
  encryptor: null, // NexaEncrypt instance (will be auto-loaded)
  encryptedFields: new Set(), // Track which fields are encrypted
  fieldsToSkip: new Set(["id", "createdAt", "updatedAt"]), // Fields that won't be encrypted
  encryptionInitialized: false, // Flag untuk track initialization

  // Store yang datanya bukan data sensitif (mis. struktur folder/nama file) dan bisa
  // berukuran sangat besar (puluhan ribu node) — enkripsi/dekripsi + deep-clone JSON
  // pada seluruh record ini per mutasi kecil sangat mahal (bisa >1 detik). Skip saja.
  storesToSkipEncryption: new Set(["discovery"]),

  /**
   * Auto-initialize encryption (called automatically)
   * User tidak perlu memanggil ini, akan otomatis dipanggil saat pertama kali digunakan
   */
  _autoInitEncryption: async function () {
    // Jika sudah di-initialize, return
    if (this.encryptionInitialized) {
      return true;
    }

    // Jika encryption disabled, skip
    if (!this.encryptionEnabled) {
      return false;
    }

    try {
      // Auto-load NexaEncrypt
      let NexaEncrypt;
      if (typeof window !== "undefined" && window.NexaEncrypt) {
        NexaEncrypt = window.NexaEncrypt;
      } else {
        // Try to import - multiple paths untuk compatibility
        try {
          const module = await import("./NexaEncrypt.js");
          NexaEncrypt = module.default || module.NexaEncrypt;
        } catch (importError) {
          // Try alternative path
          try {
            const module = await import("./NexaEncrypt.js");
            NexaEncrypt = module.default || module.NexaEncrypt;
          } catch (importError2) {
            // Jika tidak ditemukan, disable encryption tapi tetap bisa digunakan
            console.warn("⚠️ NexaEncrypt tidak ditemukan. Encryption disabled. Data akan tersimpan tanpa enkripsi.");
            this.encryptionEnabled = false;
            this.encryptionInitialized = true;
            return false;
          }
        }
      }

      // Initialize encryptor dengan default key
      this.encryptor = new NexaEncrypt(this.encryptionSecretKey);
      this.encryptionInitialized = true;
      
      // Silent initialization (no console log untuk tidak mengganggu user)
      return true;
    } catch (error) {
      console.warn("⚠️ Failed to initialize encryption:", error);
      this.encryptionEnabled = false;
      this.encryptionInitialized = true;
      return false;
    }
  },

  /**
   * Setup enkripsi untuk IndexedDB (OPTIONAL - hanya jika ingin custom key)
   * Jika tidak dipanggil, akan menggunakan default key "nexaui2025"
   * @param {string} secretKey - Secret key untuk enkripsi (default: "nexaui2025")
   * @param {Array} fieldsToSkip - Field yang tidak akan di-encrypt (default: ["id", "createdAt", "updatedAt"])
   */
  setupEncryption: async function (secretKey = "nexaui2025", fieldsToSkip = ["id", "createdAt", "updatedAt"]) {
    try {
      // Import NexaEncrypt secara dinamis
      let NexaEncrypt;
      if (typeof window !== "undefined" && window.NexaEncrypt) {
        NexaEncrypt = window.NexaEncrypt;
      } else {
        // Try to import
        try {
          NexaEncrypt = (await import("./NexaEncrypt.js")).default || (await import("./NexaEncrypt.js")).NexaEncrypt;
        } catch (importError) {
          try {
            NexaEncrypt = (await import("../Failed/NexaEncrypt.js")).default || (await import("../Failed/NexaEncrypt.js")).NexaEncrypt;
          } catch (importError2) {
            console.warn("⚠️ NexaEncrypt tidak ditemukan. Pastikan NexaEncrypt.js tersedia.");
            this.encryptionEnabled = false;
            return false;
          }
        }
      }

      // Initialize encryptor
      this.encryptor = new NexaEncrypt(secretKey);
      this.encryptionSecretKey = secretKey;
      this.encryptionEnabled = true;
      this.fieldsToSkip = new Set(fieldsToSkip);
      this.encryptionInitialized = true;

      console.log("✅ Encryption enabled dengan secret key:", secretKey);
      return true;
    } catch (error) {
      console.error("❌ Error setting up encryption:", error);
      this.encryptionEnabled = false;
      return false;
    }
  },

  /**
   * Disable enkripsi
   */
  disableEncryption: function () {
    this.encryptionEnabled = false;
    this.encryptor = null;
    this.encryptionSecretKey = null;
    this.encryptedFields.clear();
    console.log("🔓 Encryption disabled");
  },

  /**
   * Encrypt data fields (kecuali metadata)
   */
  encryptDataFields: async function (data, storeName = null) {
    if (storeName && this.storesToSkipEncryption.has(storeName)) {
      return data;
    }
    // Auto-initialize encryption jika belum
    if (!this.encryptionInitialized) {
      await this._autoInitEncryption();
    }

    if (!this.encryptionEnabled || !this.encryptor) {
      return data; // Return as is jika encryption tidak aktif
    }

    try {
      const encrypted = JSON.parse(JSON.stringify(data)); // Deep clone

      // Encrypt setiap field kecuali yang di-skip
      for (const key in encrypted) {
        if (!this.fieldsToSkip.has(key) && encrypted[key] !== null && encrypted[key] !== undefined) {
          try {
            // Encrypt value (object/array atau primitive)
            if (typeof encrypted[key] === "object") {
              encrypted[key] = this.encryptor.obfuscateJson(encrypted[key]);
            } else {
              encrypted[key] = this.encryptor.obfuscateJson(String(encrypted[key]));
            }
            this.encryptedFields.add(key);
          } catch (error) {
            console.warn(`⚠️ Failed to encrypt field "${key}":`, error);
          }
        }
      }

      // Mark data sebagai terenkripsi
      encrypted._encrypted = true;
      return encrypted;
    } catch (error) {
      console.error("❌ Encryption error:", error);
      return data; // Return original jika gagal
    }
  },

  /**
   * Decrypt data fields
   */
  decryptDataFields: async function (data, storeName = null) {
    if (storeName && this.storesToSkipEncryption.has(storeName)) {
      return data;
    }
    // Auto-initialize encryption jika belum
    if (!this.encryptionInitialized) {
      await this._autoInitEncryption();
    }

    if (!this.encryptionEnabled || !this.encryptor || !data) {
      return data; // Return as is jika encryption tidak aktif
    }

    // Jika tidak ada flag _encrypted, mungkin data lama tanpa enkripsi
    if (!data._encrypted) {
      return data;
    }

    try {
      const decrypted = JSON.parse(JSON.stringify(data)); // Deep clone
      delete decrypted._encrypted;

      // Decrypt setiap field yang terenkripsi
      for (const key in decrypted) {
        if (key !== "id" && key !== "createdAt" && key !== "updatedAt") {
          try {
            // Coba decrypt
            const decryptedValue = this.encryptor.deobfuscateJson(decrypted[key]);
            
            // Coba parse sebagai JSON jika memungkinkan
            if (typeof decryptedValue === "string") {
              try {
                decrypted[key] = JSON.parse(decryptedValue);
              } catch {
                decrypted[key] = decryptedValue;
              }
            } else {
              decrypted[key] = decryptedValue;
            }
          } catch (error) {
            // Jika decrypt gagal, mungkin field tidak terenkripsi
            // Biarkan as is
          }
        }
      }

      return decrypted;
    } catch (error) {
      console.error("❌ Decryption error:", error);
      return data; // Return original jika gagal
    }
  },

  init: function (dbName, version, storeNames = null) {
    // Auto mode: jika storeNames tidak diberikan, gunakan mode auto-create
    if (!storeNames) {
      this.autoMode = true;
      this.dbName = dbName;
      this.version = version || 1;

      // Initialize stores set if not already
      if (!this.stores) {
        this.stores = new Set();
      }

      // Return promise yang resolve dengan interface untuk auto mode
      return this.initAutoMode(dbName, version || 1);
    }

    // Manual mode: convert storeNames to array if it's a single string
    this.autoMode = false;
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];

    // Add new stores to our tracking set
    stores.forEach((store) => this.stores.add(store));

    // If database is already initialized with same name, just ensure stores exist
    if (this.db && this.dbName === dbName) {
      return this.ensureStores(stores);
    }

    this.dbName = dbName;

    return this.openDatabase(dbName, version, stores);
  },

  // Inisialisasi mode auto-create stores
  initAutoMode: function (dbName, version) {
    return new Promise((resolve, reject) => {
      // Pastikan version minimal 1
      const dbVersion = version || 1;

      // Open database tanpa stores awal
      const request = indexedDB.open(dbName, dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.version = this.db.version || dbVersion;
        this.dbName = dbName;

        // Initialize stores set if not already
        if (!this.stores) {
          this.stores = new Set();
        }
        resolve({
          // Method dengan auto store creation
          set: (storeName, data) => this.setAuto(storeName, data),
          get: (storeName, key) => this.getAuto(storeName, key),
          getAll: (storeName) => this.getAllAuto(storeName),
          delete: (storeName, key) => this.deleteAuto(storeName, key),
          duplicate: (storeName, originalId, newId, options = {}) =>
            this.duplicateAuto(storeName, originalId, newId, options),

          // Partial update methods
          removeNestedField: (storeName, id, parentPath, fieldName) =>
            this.removeNestedFieldAuto(storeName, id, parentPath, fieldName),
          removeFields: (storeName, id, fieldsToRemove) =>
            this.removeFieldsAuto(storeName, id, fieldsToRemove),
          updateFields: (storeName, id, fieldUpdates) =>
            this.updateFieldsAuto(storeName, id, fieldUpdates),
          updateField: (storeName, id, fieldName, fieldValue) =>
            this.updateFieldAuto(storeName, id, fieldName, fieldValue),
          updateNestedField: (storeName, id, fieldPath, newValue) =>
            this.updateNestedFieldAuto(storeName, id, fieldPath, newValue),
          mergeData: (storeName, id, mergeObject, options = {}) =>
            this.mergeDataAuto(storeName, id, mergeObject, options),
          merge: (meta, mergeObject, options = {}) =>
            this.mergeDataAuto(meta.store, meta.id, mergeObject, options),
          batchUpdateFields: (storeName, updates, options = {}) =>
            this.batchUpdateFieldsAuto(storeName, updates, options),
          batchRemoveFields: (storeName, fieldsToRemove, options = {}) =>
            this.batchRemoveFieldsAuto(storeName, fieldsToRemove, options),

          // Simple refresh methods
          refresh: (apiEndpoint = null, options = {}) =>
            this.refreshAuto(apiEndpoint, options),
          refreshTable: (storeName, apiEndpoint = null) =>
            this.refreshTableAuto(storeName, apiEndpoint),
          stopRefresh: () => this.stopRefresh(),
          forceRefresh: () => this.forceRefresh(),

          // Data access methods
          getLatest: (storeName, count = 1) =>
            this.getLatestAuto(storeName, count),
          getOldest: (storeName, count = 1) =>
            this.getOldestAuto(storeName, count),
          getByDateRange: (storeName, startDate, endDate) =>
            this.getByDateRangeAuto(storeName, startDate, endDate),
          search: (storeName, query, fields = []) =>
            this.searchAuto(storeName, query, fields),

          // Get IDs methods
          getIDs: (storeName, options = {}) =>
            this.getIDsAuto(storeName, options),
          getAllIDs: (storeName) => this.getAllIDsAuto(storeName),

          // Real-time methods
          refreshTable: (storeName = null, endpoint = null, options = {}) =>
            this.refreshTableAuto(storeName, endpoint, options),
          watch: (storeName, callback, options = {}) =>
            this.watchAuto(storeName, callback, options),
          setupAutoRefresh: (storeName, config = {}) =>
            this.setupAutoRefreshAuto(storeName, config),
          startPolling: (storeName, endpoint, options = {}) =>
            this.startPollingAuto(storeName, endpoint, options),
          stopPolling: (storeName) => this.stopPolling(storeName),
          batchUpdate: (storeName, dataArray, options = {}) =>
            this.batchUpdateAuto(storeName, dataArray, options),

          // Size management methods
          getDatabaseSize: () => this.getDatabaseSize(),
          getStoreSize: (storeName) => this.getStoreSizeAuto(storeName),
          getDataSize: (storeName, dataId) =>
            this.getDataSizeAuto(storeName, dataId),
          monitorSize: (interval = 30000) => this.monitorSize(interval),
          cleanupBySize: (storeName, maxSizeMB = 10) =>
            this.cleanupBySizeAuto(storeName, maxSizeMB),
          getStorageUsage: () => this.getStorageUsage(),

          // Export/Import methods
          export: (storeNames = null, options = {}) =>
            this.export(storeNames, options),
          import: (importData, options = {}) =>
            this.import(importData, options),
          exportToFile: (filename = null, storeNames = null, options = {}) =>
            this.exportToFile(filename, storeNames, options),
          importFromFile: (file, options = {}) =>
            this.importFromFile(file, options),

          // Utility methods
          getInfo: () => this.getInfo(),
          hasStore: (storeName) => this.hasStore(storeName),
          addStores: (storeNames) => this.addStores(storeNames),
          resetDatabase: () => this.resetDatabase(),
          cleanup: () => this.cleanup(),
          getRealtimeStatus: () => this.getRealtimeStatus(),

          // Auto mode specific
          createStore: (storeName) => this.createStoreAuto(storeName),
          listStores: () => this.listStores(),

          // Safe interface for auto mode
          safe: () => this.createSafeInterface(),

          // Single store mode untuk semua data dalam satu tempat
          setData: (key, data) =>
            this.setAuto("MyAppData", { id: key, ...data }),
          getData: (key) => this.getAuto("MyAppData", key),
          getAllData: () => this.getAllAuto("MyAppData"),
          deleteData: (key) => this.deleteAuto("MyAppData", key),

          // Legacy compatibility
          Storage: () => ({
            indexedDB: this,
          }),
        });
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.version = db.version;
        // Tidak membuat store apa-apa di awal, akan dibuat otomatis saat dibutuhkan
      };
    });
  },

  // Smart database opening that handles version conflicts
  openDatabase: function (dbName, requestedVersion, stores) {
    return new Promise((resolve, reject) => {
      // First, try to get the current database version
      const checkRequest = indexedDB.open(dbName);

      checkRequest.onsuccess = (event) => {
        const db = event.target.result;
        const currentVersion = db.version;
        db.close();

        // Use the higher version between requested and current
        const useVersion = Math.max(requestedVersion, currentVersion);
        this.version = useVersion;

        // Now open with the correct version
        this.actuallyOpenDatabase(dbName, useVersion, stores, resolve, reject);
      };

      checkRequest.onerror = () => {
        // Database doesn't exist yet, use requested version
        this.version = requestedVersion;
        this.actuallyOpenDatabase(
          dbName,
          requestedVersion,
          stores,
          resolve,
          reject
        );
      };

      checkRequest.onupgradeneeded = () => {
        // Database doesn't exist, close and use proper method
        checkRequest.result.close();
        this.version = requestedVersion;
        this.actuallyOpenDatabase(
          dbName,
          requestedVersion,
          stores,
          resolve,
          reject
        );
      };
    });
  },

  // Actual database opening logic
  actuallyOpenDatabase: function (dbName, version, stores, resolve, reject) {
    const request = indexedDB.open(dbName, version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      this.db = request.result;
      this.version = this.db.version; // Update to actual version

      // Return object dengan real-time methods yang bisa dipanggil langsung
      resolve({
        // Method untuk refresh table
        refreshTable: (storeName = null, endpoint = null, options = {}) =>
          this.refreshTable(storeName, endpoint, options),

        // Method untuk watch data changes
        watch: (storeName, callback, options = {}) =>
          this.watch(storeName, callback, options),

        // Method untuk setup auto refresh
        setupAutoRefresh: (storeName, config = {}) =>
          this.setupAutoRefresh(storeName, config),

        // Method untuk start polling manual
        startPolling: (storeName, endpoint, options = {}) =>
          this.startPolling(storeName, endpoint, options),

        // Method untuk stop polling
        stopPolling: (storeName) => this.stopPolling(storeName),

        // Method untuk batch update
        batchUpdate: (storeName, dataArray, options = {}) =>
          this.batchUpdate(storeName, dataArray, options),

        // Basic CRUD methods
        set: (storeName, data) => this.set(storeName, data),
        get: (storeName, key) => this.get(storeName, key),
        getAll: (storeName) => this.getAll(storeName),
        delete: (storeName, key) => this.delete(storeName, key),
        duplicate: (storeName, originalId, newId, options = {}) =>
          this.duplicate(storeName, originalId, newId, options),

        // Partial update methods
        removeFields: (storeName, id, fieldsToRemove) =>
          this.removeFields(storeName, id, fieldsToRemove),
        updateFields: (storeName, id, fieldUpdates) =>
          this.updateFields(storeName, id, fieldUpdates),
        updateField: (storeName, id, fieldName, fieldValue) =>
          this.updateField(storeName, id, fieldName, fieldValue),
        updateNestedField: (storeName, id, fieldPath, newValue) =>
          this.updateNestedField(storeName, id, fieldPath, newValue),
        mergeData: (storeName, id, mergeObject, options = {}) =>
          this.mergeData(storeName, id, mergeObject, options),
        merge: (meta, mergeObject, options = {}) =>
          this.mergeData(meta.store, meta.id, mergeObject, options),
        batchUpdateFields: (storeName, updates, options = {}) =>
          this.batchUpdateFields(storeName, updates, options),
        batchRemoveFields: (storeName, fieldsToRemove, options = {}) =>
          this.batchRemoveFields(storeName, fieldsToRemove, options),

        // Simple refresh methods
        refresh: (apiEndpoint = null, options = {}) =>
          this.refresh(apiEndpoint, options),
        refreshTable: (storeName, apiEndpoint = null) =>
          this.refreshTable(storeName, apiEndpoint),
        stopRefresh: () => this.stopRefresh(),
        forceRefresh: () => this.forceRefresh(),

        // Data access methods
        getLatest: (storeName, count = 1) => this.getLatest(storeName, count),
        getOldest: (storeName, count = 1) => this.getOldest(storeName, count),
        getByDateRange: (storeName, startDate, endDate) =>
          this.getByDateRange(storeName, startDate, endDate),
        search: (storeName, query, fields = []) =>
          this.search(storeName, query, fields),

        // Get IDs methods
        getIDs: (storeName, options = {}) => this.getIDs(storeName, options),
        getAllIDs: (storeName) => this.getAllIDs(storeName),

        // Export/Import methods
        export: (storeNames = null, options = {}) =>
          this.export(storeNames, options),
        import: (importData, options = {}) => this.import(importData, options),
        exportToFile: (filename = null, storeNames = null, options = {}) =>
          this.exportToFile(filename, storeNames, options),
        importFromFile: (file, options = {}) =>
          this.importFromFile(file, options),

        // Utility methods
        getInfo: () => this.getInfo(),
        hasStore: (storeName) => this.hasStore(storeName),
        addStores: (storeNames) => this.addStores(storeNames),
        resetDatabase: () => this.resetDatabase(),
        cleanup: () => this.cleanup(),
        getRealtimeStatus: () => this.getRealtimeStatus(),

        // Size management methods
        getDatabaseSize: () => this.getDatabaseSize(),
        getStoreSize: (storeName) => this.getStoreSize(storeName),
        getDataSize: (storeName, dataId) => this.getDataSize(storeName, dataId),
        monitorSize: (interval = 30000) => this.monitorSize(interval),
        cleanupBySize: (storeName, maxSizeMB = 10) =>
          this.cleanupBySize(storeName, maxSizeMB),
        getStorageUsage: () => this.getStorageUsage(),

        // Safe interface for manual mode
        safe: () => this.createSafeInterface(),

        // Legacy compatibility - Storage API pattern
        Storage: () => ({
          indexedDB: this,
        }),
      });
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Create all stores that have been requested
      Array.from(this.stores).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };
  },

  // Helper method to ensure stores exist without reopening database
  ensureStores: function (storeNames) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
      const missingStores = stores.filter(
        (store) => !this.db.objectStoreNames.contains(store)
      );

      if (missingStores.length === 0) {
        // All stores already exist - return same interface as init
        resolve({
          // Method untuk refresh table
          refreshTable: (storeName = null, endpoint = null, options = {}) =>
            this.refreshTable(storeName, endpoint, options),

          // Method untuk watch data changes
          watch: (storeName, callback, options = {}) =>
            this.watch(storeName, callback, options),

          // Method untuk setup auto refresh
          setupAutoRefresh: (storeName, config = {}) =>
            this.setupAutoRefresh(storeName, config),

          // Method untuk start polling manual
          startPolling: (storeName, endpoint, options = {}) =>
            this.startPolling(storeName, endpoint, options),

          // Method untuk stop polling
          stopPolling: (storeName) => this.stopPolling(storeName),

          // Method untuk batch update
          batchUpdate: (storeName, dataArray, options = {}) =>
            this.batchUpdate(storeName, dataArray, options),

          // Basic CRUD methods
          set: (storeName, data) => this.set(storeName, data),
          get: (storeName, key) => this.get(storeName, key),
          getAll: (storeName) => this.getAll(storeName),
          delete: (storeName, key) => this.delete(storeName, key),
          duplicate: (storeName, originalId, newId, options = {}) =>
            this.duplicate(storeName, originalId, newId, options),

          // Partial update methods
          removeNestedField: (storeName, id, parentPath, fieldName) =>
            this.removeNestedField(storeName, id, parentPath, fieldName),
          removeFields: (storeName, id, fieldsToRemove) =>
            this.removeFields(storeName, id, fieldsToRemove),
          updateFields: (storeName, id, fieldUpdates) =>
            this.updateFields(storeName, id, fieldUpdates),
          updateField: (storeName, id, fieldName, fieldValue) =>
            this.updateField(storeName, id, fieldName, fieldValue),
          updateNestedField: (storeName, id, fieldPath, newValue) =>
            this.updateNestedField(storeName, id, fieldPath, newValue),
          mergeData: (storeName, id, mergeObject, options = {}) =>
            this.mergeData(storeName, id, mergeObject, options),
          merge: (meta, mergeObject, options = {}) =>
            this.mergeData(meta.store, meta.id, mergeObject, options),
          batchUpdateFields: (storeName, updates, options = {}) =>
            this.batchUpdateFields(storeName, updates, options),
          batchRemoveFields: (storeName, fieldsToRemove, options = {}) =>
            this.batchRemoveFields(storeName, fieldsToRemove, options),

          // Simple refresh methods
          refresh: (apiEndpoint = null, options = {}) =>
            this.refresh(apiEndpoint, options),
          refreshTable: (storeName, apiEndpoint = null) =>
            this.refreshTable(storeName, apiEndpoint),
          stopRefresh: () => this.stopRefresh(),
          forceRefresh: () => this.forceRefresh(),

          // Data access methods
          getLatest: (storeName, count = 1) => this.getLatest(storeName, count),
          getOldest: (storeName, count = 1) => this.getOldest(storeName, count),
          getByDateRange: (storeName, startDate, endDate) =>
            this.getByDateRange(storeName, startDate, endDate),
          search: (storeName, query, fields = []) =>
            this.search(storeName, query, fields),

          // Get IDs methods
          getIDs: (storeName, options = {}) => this.getIDs(storeName, options),
          getAllIDs: (storeName) => this.getAllIDs(storeName),

          // Export/Import methods
          export: (storeNames = null, options = {}) =>
            this.export(storeNames, options),
          import: (importData, options = {}) =>
            this.import(importData, options),
          exportToFile: (filename = null, storeNames = null, options = {}) =>
            this.exportToFile(filename, storeNames, options),
          importFromFile: (file, options = {}) =>
            this.importFromFile(file, options),

          // Utility methods
          getInfo: () => this.getInfo(),
          hasStore: (storeName) => this.hasStore(storeName),
          addStores: (storeNames) => this.addStores(storeNames),
          resetDatabase: () => this.resetDatabase(),
          cleanup: () => this.cleanup(),
          getRealtimeStatus: () => this.getRealtimeStatus(),

          // Safe interface
          safe: () => this.createSafeInterface(),

          // Legacy compatibility
          Storage: () => ({
            indexedDB: this,
          }),
        });
        return;
      }

      // Need to upgrade database version to add new stores
      this.db.close();
      const newVersion = this.version + 1;

      const request = indexedDB.open(this.dbName, newVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.version = this.db.version; // Update to actual version
        resolve({
          // Method untuk refresh table
          refreshTable: (storeName = null, endpoint = null, options = {}) =>
            this.refreshTable(storeName, endpoint, options),

          // Method untuk watch data changes
          watch: (storeName, callback, options = {}) =>
            this.watch(storeName, callback, options),

          // Method untuk setup auto refresh
          setupAutoRefresh: (storeName, config = {}) =>
            this.setupAutoRefresh(storeName, config),

          // Method untuk start polling manual
          startPolling: (storeName, endpoint, options = {}) =>
            this.startPolling(storeName, endpoint, options),

          // Method untuk stop polling
          stopPolling: (storeName) => this.stopPolling(storeName),

          // Method untuk batch update
          batchUpdate: (storeName, dataArray, options = {}) =>
            this.batchUpdate(storeName, dataArray, options),

          // Basic CRUD methods
          set: (storeName, data) => this.set(storeName, data),
          get: (storeName, key) => this.get(storeName, key),
          getAll: (storeName) => this.getAll(storeName),
          delete: (storeName, key) => this.delete(storeName, key),
          duplicate: (storeName, originalId, newId, options = {}) =>
            this.duplicate(storeName, originalId, newId, options),

          // Partial update methods
          removeNestedField: (storeName, id, parentPath, fieldName) =>
            this.removeNestedField(storeName, id, parentPath, fieldName),
          removeFields: (storeName, id, fieldsToRemove) =>
            this.removeFields(storeName, id, fieldsToRemove),
          updateFields: (storeName, id, fieldUpdates) =>
            this.updateFields(storeName, id, fieldUpdates),
          updateField: (storeName, id, fieldName, fieldValue) =>
            this.updateField(storeName, id, fieldName, fieldValue),
          updateNestedField: (storeName, id, fieldPath, newValue) =>
            this.updateNestedField(storeName, id, fieldPath, newValue),
          mergeData: (storeName, id, mergeObject, options = {}) =>
            this.mergeData(storeName, id, mergeObject, options),
          merge: (meta, mergeObject, options = {}) =>
            this.mergeData(meta.store, meta.id, mergeObject, options),
          batchUpdateFields: (storeName, updates, options = {}) =>
            this.batchUpdateFields(storeName, updates, options),
          batchRemoveFields: (storeName, fieldsToRemove, options = {}) =>
            this.batchRemoveFields(storeName, fieldsToRemove, options),

          // Simple refresh methods
          refresh: (apiEndpoint = null, options = {}) =>
            this.refresh(apiEndpoint, options),
          refreshTable: (storeName, apiEndpoint = null) =>
            this.refreshTable(storeName, apiEndpoint),
          stopRefresh: () => this.stopRefresh(),
          forceRefresh: () => this.forceRefresh(),

          // Size management methods
          getDatabaseSize: () => this.getDatabaseSize(),
          getStoreSize: (storeName) => this.getStoreSize(storeName),
          getDataSize: (storeName, dataId) =>
            this.getDataSize(storeName, dataId),
          monitorSize: (interval = 30000) => this.monitorSize(interval),
          cleanupBySize: (storeName, maxSizeMB = 10) =>
            this.cleanupBySize(storeName, maxSizeMB),
          getStorageUsage: () => this.getStorageUsage(),

          // Data access methods
          getLatest: (storeName, count = 1) => this.getLatest(storeName, count),
          getOldest: (storeName, count = 1) => this.getOldest(storeName, count),
          getByDateRange: (storeName, startDate, endDate) =>
            this.getByDateRange(storeName, startDate, endDate),
          search: (storeName, query, fields = []) =>
            this.search(storeName, query, fields),

          // Get IDs methods
          getIDs: (storeName, options = {}) => this.getIDs(storeName, options),
          getAllIDs: (storeName) => this.getAllIDs(storeName),

          // Export/Import methods
          export: (storeNames = null, options = {}) =>
            this.export(storeNames, options),
          import: (importData, options = {}) =>
            this.import(importData, options),
          exportToFile: (filename = null, storeNames = null, options = {}) =>
            this.exportToFile(filename, storeNames, options),
          importFromFile: (file, options = {}) =>
            this.importFromFile(file, options),

          // Utility methods
          getInfo: () => this.getInfo(),
          hasStore: (storeName) => this.hasStore(storeName),
          addStores: (storeNames) => this.addStores(storeNames),
          resetDatabase: () => this.resetDatabase(),
          cleanup: () => this.cleanup(),
          getRealtimeStatus: () => this.getRealtimeStatus(),

          // Safe interface
          safe: () => this.createSafeInterface(),

          // Legacy compatibility
          Storage: () => ({
            indexedDB: this,
          }),
        });
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        missingStores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        });
      };
    });
  },

  // Get information about current database state
  getInfo: function () {
    return {
      dbName: this.dbName,
      version: this.version,
      isInitialized: !!this.db,
      availableStores: this.db ? Array.from(this.db.objectStoreNames) : [],
      requestedStores: Array.from(this.stores),
    };
  },

  // Check if a specific store exists
  hasStore: function (storeName) {
    return this.db ? this.db.objectStoreNames.contains(storeName) : false;
  },

  // Add new stores dynamically
  addStores: function (storeNames) {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    return this.ensureStores(stores);
  },

  // Reset database completely (useful for development/debugging)
  resetDatabase: function () {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      if (!this.dbName) {
        resolve();
        return;
      }

      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      deleteRequest.onsuccess = () => {
        this.version = null;
        this.stores.clear();

        resolve();
      };
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  },

  // Get current database version from IndexedDB
  getCurrentVersion: function (dbName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const version = db.version;
        db.close();
        resolve(version);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Check if database exists
  exists: function (dbName) {
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const exists = db.version > 0;
        db.close();
        resolve(exists);
      };
      request.onerror = () => resolve(false);
    });
  },

  // Safe method to ensure store exists or create it
  ensureStoreExists: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // If store already exists, resolve immediately
        if (this.db.objectStoreNames.contains(storeName)) {
          resolve(true);
          return;
        }

        // If in auto mode, create the store
        if (this.autoMode) {
          await this.createStoreAuto(storeName);
          resolve(true);
          return;
        }

        // If not in auto mode, suggest using auto mode or manual creation
        reject(
          new Error(
            `Store "${storeName}" does not exist. Use auto mode or create the store manually.`
          )
        );
      } catch (error) {
        reject(error);
      }
    });
  },

  // Export IndexedDB data
  export: function (storeNames = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const {
          encrypt = false,
          includeMetadata = true,
          onProgress = null,
        } = options;

        const storesToExport =
          storeNames || Array.from(this.db.objectStoreNames);
        const exportData = {
          metadata: includeMetadata
            ? {
                dbName: this.dbName,
                version: this.version,
                exportDate: new Date().toISOString(),
                stores: storesToExport,
              }
            : null,
          data: {},
        };

        let completed = 0;
        const total = storesToExport.length;

        for (const storeName of storesToExport) {
          if (!this.db.objectStoreNames.contains(storeName)) {
            console.warn(`Store "${storeName}" does not exist, skipping...`);
            continue;
          }

          const storeData = await this.getAll(storeName);
          exportData.data[storeName] = storeData.data;

          completed++;
          if (onProgress) {
            onProgress({ completed, total, currentStore: storeName });
          }
        }

        let result = exportData;
        if (encrypt) {
          result = await nexaEncrypt.encryptJson(exportData);
        }

        resolve({
          success: true,
          data: result,
          size: JSON.stringify(result).length,
          stores: Object.keys(exportData.data),
        });
      } catch (error) {
        console.error("IndexedDB Export Error:", error);
        reject(error);
      }
    });
  },

  // Import IndexedDB data
  import: function (importData, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const {
          decrypt = false,
          overwrite = false,
          onProgress = null,
          validateStores = true,
        } = options;

        let data = importData;
        if (decrypt) {
          data = await nexaEncrypt.decryptJson(importData);
        }

        // Validate import data structure
        if (!data.data || typeof data.data !== "object") {
          reject(new Error("Invalid import data format"));
          return;
        }

        const stores = Object.keys(data.data);
        let completed = 0;
        const total = stores.length;
        const results = { success: [], failed: [], skipped: [] };

        for (const storeName of stores) {
          try {
            // Check if store exists
            if (
              validateStores &&
              !this.db.objectStoreNames.contains(storeName)
            ) {
              results.skipped.push(storeName);
              console.warn(`Store "${storeName}" does not exist, skipping...`);
              continue;
            }

            const storeData = data.data[storeName];

            if (Array.isArray(storeData)) {
              // Import each item
              for (const item of storeData) {
                if (!overwrite) {
                  // Check if item exists
                  const existing = await this.get(storeName, item.id);
                  if (existing) {
                    continue;
                  }
                }
                await this.set(storeName, item);
              }
            }

            results.success.push(storeName);
            completed++;

            if (onProgress) {
              onProgress({ completed, total, currentStore: storeName });
            }
          } catch (error) {
            console.error(`Failed to import store "${storeName}":`, error);
            results.failed.push({ storeName, error: error.message });
          }
        }

        resolve({
          success: true,
          imported: results.success.length,
          failed: results.failed.length,
          skipped: results.skipped.length,
          details: results,
          metadata: data.metadata || null,
        });
      } catch (error) {
        console.error("IndexedDB Import Error:", error);
        reject(error);
      }
    });
  },

  // Export IndexedDB to downloadable file
  exportToFile: function (filename = null, storeNames = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const exportResult = await this.export(storeNames, options);
        const data = exportResult.data;

        const fileName =
          filename ||
          `indexedDB_${this.dbName}_backup_${
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
          stores: exportResult.stores,
          dbName: this.dbName,
        });
      } catch (error) {
        console.error("IndexedDB Export to File Error:", error);
        reject(error);
      }
    });
  },

  // Import IndexedDB from file
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
            dbName: this.dbName,
          });
        } catch (error) {
          console.error("IndexedDB Import from File Error:", error);
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  },

  set: function (storeName, data) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        reject(
          new Error(
            `Store "${storeName}" does not exist. Use auto mode or create the store first.`
          )
        );
        return;
      }

      // Tambahkan timestamp otomatis jika belum ada
      const dataWithTimestamp = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 🔐 Encrypt data jika encryption enabled (OTOMATIS)
      this.encryptDataFields(dataWithTimestamp, storeName)
        .then((dataToSave) => {
          const transaction = this.db.transaction([storeName], "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(dataToSave);

          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            // Notify observers dengan data yang sudah di-decrypt untuk observer
            const decryptedData = await this.decryptDataFields(dataToSave, storeName);
            this.notifyObservers(storeName, decryptedData, "update");
            resolve(request.result);
          };
        })
        .catch((error) => {
          console.error("Encryption error:", error);
          // Fallback: save without encryption
          const transaction = this.db.transaction([storeName], "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(dataWithTimestamp);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.notifyObservers(storeName, dataWithTimestamp, "update");
            resolve(request.result);
          };
        });
    });
  },

  get: function (storeName, key) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
       // console.warn(`Store "${storeName}" does not exist, returning null`);
        resolve(null);
        return;
      }

      // Validate key - jika key tidak ada atau undefined, return null
      if (key === undefined || key === null || key === "") {
        console.warn(`Key is ${key === undefined ? 'undefined' : key === null ? 'null' : 'empty'} for store "${storeName}", returning null`);
        resolve(null);
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => {
          // Jika error karena key tidak valid, return null instead of reject
          console.warn(`Error accessing store "${storeName}" with key "${key}":`, request.error);
          resolve(null);
        };
        
        request.onsuccess = async () => {
          // 🔐 Decrypt data jika encryption enabled (OTOMATIS)
          const encryptedData = request.result;
          if (encryptedData) {
            try {
              const decryptedData = await this.decryptDataFields(encryptedData, storeName);
              resolve(decryptedData);
            } catch (decryptError) {
              console.warn(`Decryption error for store "${storeName}", returning encrypted data:`, decryptError);
              resolve(encryptedData);
            }
          } else {
            resolve(null);
          }
        };
      } catch (error) {
        // Handle error gracefully - return null instead of reject
        console.warn(`Error accessing store "${storeName}":`, error.message);
        resolve(null);
      }
    });
  },

  getAll: function (storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        // Return empty data instead of error for non-existent stores
        console.warn(
          `Store "${storeName}" does not exist, returning empty data`
        );
        resolve({ data: [] });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
          // 🔐 Decrypt semua data jika encryption enabled (OTOMATIS)
          const encryptedData = request.result;
          const decryptPromises = encryptedData.map((item) => this.decryptDataFields(item, storeName));
          const decryptedData = await Promise.all(decryptPromises);
          resolve({ data: decryptedData });
        };
      } catch (error) {
        console.error(`Error accessing store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  delete: function (storeName, key) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(`Store "${storeName}" does not exist, cannot delete`);
        resolve(false);
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);

        // Jika key tidak diberikan, hapus semua data (clear store)
        if (key == null) {
          const request = store.clear();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.notifyObservers(storeName, null, "clear");
            resolve(request.result);
          };
          return;
        }

        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          // Notify observers setelah delete
          this.notifyObservers(storeName, { id: key }, "delete");
          resolve(request.result);
        };
      } catch (error) {
        console.error(`Error deleting from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // Duplicate data with new ID
  duplicate: function (storeName, originalId, newId, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists before creating transaction
        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(
            new Error(
              `Store "${storeName}" does not exist. Use auto mode or create the store first.`
            )
          );
          return;
        }

        // Get original data
        const originalData = await this.get(storeName, originalId);
        if (!originalData) {
          reject(
            new Error(
              `Data with ID "${originalId}" not found in store "${storeName}"`
            )
          );
          return;
        }

        // Check if new ID already exists (unless overwrite is true)
        const {
          overwrite = false,
          modifications = {},
          preserveTimestamps = false,
        } = options;

        if (!overwrite) {
          const existingData = await this.get(storeName, newId);
          if (existingData) {
            reject(
              new Error(
                `Data with ID "${newId}" already exists in store "${storeName}". Use overwrite: true to replace it.`
              )
            );
            return;
          }
        }

        // Create duplicated data
        const currentTime = new Date().toISOString();
        const duplicatedData = {
          ...originalData,
          id: newId,
          originalId: originalId,
          isDuplicate: true,
          duplicatedAt: currentTime,
          ...modifications,
        };

        // Handle timestamps based on preserveTimestamps option
        if (!preserveTimestamps) {
          duplicatedData.createdAt = currentTime;
          duplicatedData.updatedAt = currentTime;
        } else {
          duplicatedData.updatedAt = currentTime;
        }

        // Save duplicated data
        await this.set(storeName, duplicatedData);

        resolve({
          success: true,
          originalId,
          newId,
          data: duplicatedData,
          storeName,
          timestamp: currentTime,
        });
      } catch (error) {
        console.error(
          `❌ Failed to duplicate data in store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // === DATA ACCESS METHODS ===

  // Mendapatkan data terbaru berdasarkan timestamp
  getLatest: function (storeName, count = 1) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(
          `Store "${storeName}" does not exist, returning empty result`
        );
        resolve({
          data: count === 1 ? null : [],
          total: 0,
          requested: count,
        });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const allData = request.result;

          // Sort berdasarkan updatedAt atau createdAt (terbaru dulu)
          const sortedData = allData.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateB - dateA; // Descending order
          });

          const result =
            count === 1 ? sortedData[0] : sortedData.slice(0, count);
          resolve({
            data: result,
            total: allData.length,
            requested: count,
          });
        };
      } catch (error) {
        console.error(
          `Error getting latest data from store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Mendapatkan data terlama berdasarkan timestamp
  getOldest: function (storeName, count = 1) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(
          `Store "${storeName}" does not exist, returning empty result`
        );
        resolve({
          data: count === 1 ? null : [],
          total: 0,
          requested: count,
        });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const allData = request.result;

          // Sort berdasarkan updatedAt atau createdAt (terlama dulu)
          const sortedData = allData.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateA - dateB; // Ascending order
          });

          const result =
            count === 1 ? sortedData[0] : sortedData.slice(0, count);
          resolve({
            data: result,
            total: allData.length,
            requested: count,
          });
        };
      } catch (error) {
        console.error(
          `Error getting oldest data from store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Mendapatkan data berdasarkan rentang tanggal
  getByDateRange: function (storeName, startDate, endDate) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(
          `Store "${storeName}" does not exist, returning empty result`
        );
        resolve({
          data: [],
          total: 0,
          filtered: 0,
          startDate,
          endDate,
        });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const allData = request.result;
          const start = new Date(startDate);
          const end = new Date(endDate);

          const filteredData = allData.filter((item) => {
            const itemDate = new Date(item.updatedAt || item.createdAt);
            return itemDate >= start && itemDate <= end;
          });

          // Sort berdasarkan tanggal (terbaru dulu)
          const sortedData = filteredData.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateB - dateA;
          });

          resolve({
            data: sortedData,
            total: allData.length,
            filtered: sortedData.length,
            startDate,
            endDate,
          });
        };
      } catch (error) {
        console.error(
          `Error getting date range data from store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Pencarian data berdasarkan query
  search: function (storeName, query, fields = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      if (!query || query.trim() === "") {
        resolve({ data: [], total: 0, query });
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(
          `Store "${storeName}" does not exist, returning empty search result`
        );
        resolve({
          data: [],
          total: 0,
          found: 0,
          query,
          searchFields: fields,
        });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const allData = request.result;
          const searchTerm = query.toLowerCase();

          const filteredData = allData.filter((item) => {
            // Jika fields tidak ditentukan, cari di semua field
            if (fields.length === 0) {
              return JSON.stringify(item).toLowerCase().includes(searchTerm);
            }

            // Cari di field yang ditentukan
            return fields.some((field) => {
              const value = item[field];
              if (value === null || value === undefined) return false;
              return String(value).toLowerCase().includes(searchTerm);
            });
          });

          // Sort berdasarkan relevance dan tanggal
          const sortedData = filteredData.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateB - dateA;
          });

          resolve({
            data: sortedData,
            total: allData.length,
            found: sortedData.length,
            query,
            searchFields: fields,
          });
        };
      } catch (error) {
        console.error(`Error searching in store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === GET IDs METHODS ===

  // Get all IDs from a store
  getAllIDs: function (storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Check if store exists before creating transaction
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(
          `Store "${storeName}" does not exist, returning empty IDs`
        );
        resolve({
          data: [],
          total: 0,
          storeName,
        });
        return;
      }

      try {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAllKeys();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const ids = request.result;
          resolve({
            data: ids,
            total: ids.length,
            storeName,
          });
        };
      } catch (error) {
        console.error(`Error getting IDs from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // Get IDs with options (pagination, sorting, etc.)
  getIDs: function (storeName, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists before creating transaction
        if (!this.db.objectStoreNames.contains(storeName)) {
          console.warn(
            `Store "${storeName}" does not exist, returning empty IDs`
          );
          resolve({
            data: [],
            total: 0,
            storeName,
            options,
          });
          return;
        }

        const {
          limit = null,
          offset = 0,
          sort = "asc", // 'asc' or 'desc'
          filter = null, // function to filter IDs
        } = options;

        // Get all IDs first
        const allIDsResult = await this.getAllIDs(storeName);
        let ids = allIDsResult.data;

        // Apply filter if provided
        if (filter && typeof filter === "function") {
          ids = ids.filter(filter);
        }

        // Apply sorting
        if (sort === "desc") {
          ids.sort((a, b) => b.toString().localeCompare(a.toString()));
        } else {
          ids.sort((a, b) => a.toString().localeCompare(b.toString()));
        }

        // Apply pagination
        const startIndex = offset;
        const endIndex = limit ? startIndex + limit : ids.length;
        const paginatedIds = ids.slice(startIndex, endIndex);

        resolve({
          data: paginatedIds,
          total: ids.length,
          returned: paginatedIds.length,
          storeName,
          options,
          pagination: {
            offset,
            limit,
            hasMore: endIndex < ids.length,
          },
        });
      } catch (error) {
        console.error(`Error getting IDs from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === PARTIAL UPDATE METHODS ===

  // Helper function to find object path dynamically
  findObjectPath: function (data, targetObject, currentPath = "") {
    for (const [key, value] of Object.entries(data)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;

      // If we found the exact object reference
      if (value === targetObject) {
        return newPath;
      }

      // If value is object and matches content (deep comparison)
      if (
        typeof value === "object" &&
        value !== null &&
        typeof targetObject === "object"
      ) {
        if (JSON.stringify(value) === JSON.stringify(targetObject)) {
          return newPath;
        }

        // Recursively search nested objects
        if (!Array.isArray(value)) {
          const found = this.findObjectPath(value, targetObject, newPath);
          if (found) return found;
        }
      }
    }
    return null;
  },

  // Remove nested field helper (wrapper for specific nested operations)
  removeNestedField: function (storeName, id, parentPath, fieldName) {
    const fullPath = `${parentPath}.${fieldName}`;
    return this.removeFields(storeName, id, fullPath);
  },

  // Remove specific fields from object
  removeFields: function (storeName, id, fieldsToRemove) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists
        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(
            new Error(
              `Store "${storeName}" does not exist. Use auto mode or create the store first.`
            )
          );
          return;
        }

        // Get existing data
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(
            new Error(`Data with ID "${id}" not found in store "${storeName}"`)
          );
          return;
        }

        // Validate input first
        if (fieldsToRemove === undefined || fieldsToRemove === null) {
          reject(
            new Error(
              `fieldsToRemove is ${fieldsToRemove}. Please provide valid field name(s) to remove.`
            )
          );
          return;
        }

        // Convert fieldsToRemove to array if it's a single string
        const fields = Array.isArray(fieldsToRemove)
          ? fieldsToRemove
          : [fieldsToRemove];

        // Create updated data without the specified fields
        const updatedData = JSON.parse(JSON.stringify(existingData)); // Deep clone

        fields.forEach((field) => {
          let fieldName = field;

          // If field is an object, find its path dynamically
          if (typeof field === "object" && field !== null) {
            // Search for this object in the data structure
            const foundPath = this.findObjectPath(existingData, field);
            if (foundPath) {
              fieldName = foundPath;
            } else {
              console.warn(
                `Object provided but not found in data structure:`,
                field
              );
              return;
            }
          }

          // If field is undefined/null, skip it with informative message
          if (field === undefined || field === null) {
            return;
          }

          // Skip if field is null, undefined, or not a string after extraction
          if (!fieldName || typeof fieldName !== "string") {
            console.warn(
              `Invalid field type: ${typeof fieldName}, value:`,
              fieldName
            );
            return;
          }

          // Support dot notation for nested fields (e.g., "form.failed.images")
          if (fieldName.includes(".")) {
            const fieldPath = fieldName.split(".");
            let current = updatedData;

            // Navigate to parent of target field
            for (let i = 0; i < fieldPath.length - 1; i++) {
              if (current[fieldPath[i]]) {
                current = current[fieldPath[i]];
              } else {
                // Path doesn't exist, skip this field
                console.warn(
                  `Path "${fieldPath
                    .slice(0, i + 1)
                    .join(".")}" doesn't exist, skipping field "${fieldName}"`
                );
                return;
              }
            }

            // Delete the final field
            delete current[fieldPath[fieldPath.length - 1]];
          } else {
            // Simple field deletion
            delete updatedData[fieldName];
          }
        });
        updatedData.updatedAt = new Date().toISOString();

        // Save updated data
        await this.set(storeName, updatedData);

        // Verify data was actually saved
        const verifyData = await this.get(storeName, id);

        resolve(updatedData);
      } catch (error) {
        console.error(
          `❌ Failed to remove fields in store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Update specific fields without replacing entire object
  updateFields: function (storeName, id, fieldUpdates) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists
        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(
            new Error(
              `Store "${storeName}" does not exist. Use auto mode or create the store first.`
            )
          );
          return;
        }

        // Get existing data
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(
            new Error(`Data with ID "${id}" not found in store "${storeName}"`)
          );
          return;
        }

        // Merge with new fields
        const updatedData = {
          ...existingData,
          ...fieldUpdates,
          updatedAt: new Date().toISOString(),
        };

        // Save updated data
        await this.set(storeName, updatedData);
        resolve(updatedData);
      } catch (error) {
        console.error(
          `❌ Failed to update fields in store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Update single field
  updateField: function (storeName, id, fieldName, fieldValue) {
    return this.updateFields(storeName, id, { [fieldName]: fieldValue });
  },

  // Update nested field using dot notation (e.g., "profile.bio")
  updateNestedField: function (storeName, id, fieldPath, newValue) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists
        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(
            new Error(
              `Store "${storeName}" does not exist. Use auto mode or create the store first.`
            )
          );
          return;
        }

        // Get existing data
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(
            new Error(`Data with ID "${id}" not found in store "${storeName}"`)
          );
          return;
        }

        // Deep clone data
        const updatedData = JSON.parse(JSON.stringify(existingData));

        // Navigate to the nested field
        const pathArray = fieldPath.split(".");
        let current = updatedData;

        // Navigate to parent of target field
        for (let i = 0; i < pathArray.length - 1; i++) {
          if (!current[pathArray[i]]) {
            current[pathArray[i]] = {};
          }
          current = current[pathArray[i]];
        }

        // Set the final value
        current[pathArray[pathArray.length - 1]] = newValue;
        updatedData.updatedAt = new Date().toISOString();

        // Save updated data
        await this.set(storeName, updatedData);

        resolve(updatedData);
      } catch (error) {
        console.error(
          `❌ Failed to update nested field "${fieldPath}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Merge objects deeply
  mergeData: function (storeName, id, mergeObject, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { deepMerge = false, createIfNotExists = false } = options;

        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        // Check if store exists
        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(
            new Error(
              `Store "${storeName}" does not exist. Use auto mode or create the store first.`
            )
          );
          return;
        }

        // Get existing data
        let existingData = await this.get(storeName, id);

        // Handle if data doesn't exist
        if (!existingData) {
          if (createIfNotExists) {
            existingData = {
              id,
              ...mergeObject,
              createdAt: new Date().toISOString(),
            };
            await this.set(storeName, existingData);
            resolve(existingData);
            return;
          } else {
            reject(
              new Error(
                `Data with ID "${id}" not found in store "${storeName}"`
              )
            );
            return;
          }
        }

        let updatedData;

        if (deepMerge) {
          // Deep merge function
          const deepMergeObjects = (target, source) => {
            for (const key in source) {
              if (
                source[key] &&
                typeof source[key] === "object" &&
                !Array.isArray(source[key])
              ) {
                if (!target[key] || typeof target[key] !== "object") {
                  target[key] = {};
                }
                deepMergeObjects(target[key], source[key]);
              } else {
                target[key] = source[key];
              }
            }
            return target;
          };

          updatedData = deepMergeObjects(
            JSON.parse(JSON.stringify(existingData)),
            mergeObject
          );
        } else {
          // Shallow merge
          updatedData = { ...existingData, ...mergeObject };
        }

        updatedData.updatedAt = new Date().toISOString();

        // Save updated data
        await this.set(storeName, updatedData);

        resolve(updatedData);
      } catch (error) {
        console.error(`❌ Failed to merge data for ID "${id}":`, error);
        reject(error);
      }
    });
  },

  // Batch remove fields from multiple records
  batchRemoveFields: function (storeName, fieldsToRemove, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { onProgress = null, continueOnError = true } = options;

        // Get all data first
        const allData = await this.getAll(storeName);
        const results = { success: [], failed: [], skipped: [] };

        let completed = 0;
        const total = allData.data.length;

        for (const item of allData.data) {
          try {
            if (!item.id) {
              results.skipped.push({ item, reason: "Missing id" });
              continue;
            }

            const result = await this.removeFields(
              storeName,
              item.id,
              fieldsToRemove
            );
            results.success.push({ id: item.id, data: result });
          } catch (error) {
            if (continueOnError) {
              results.failed.push({ item, error: error.message });
            } else {
              reject(error);
              return;
            }
          }

          completed++;
          if (onProgress) {
            onProgress({
              completed,
              total,
              percentage: Math.round((completed / total) * 100),
            });
          }
        }

        resolve({
          success: true,
          processed: completed,
          successful: results.success.length,
          failed: results.failed.length,
          skipped: results.skipped.length,
          details: results,
          fieldsRemoved: fieldsToRemove,
        });
      } catch (error) {
        console.error(
          `❌ Batch remove fields failed for store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // Batch update multiple records with partial data
  batchUpdateFields: function (storeName, updates, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { onProgress = null, continueOnError = true } = options;
        const results = { success: [], failed: [], skipped: [] };

        let completed = 0;
        const total = updates.length;

        for (const update of updates) {
          try {
            const { id, fields } = update;

            if (!id || !fields) {
              results.skipped.push({ update, reason: "Missing id or fields" });
              continue;
            }

            const result = await this.updateFields(storeName, id, fields);
            results.success.push({ id, data: result });
          } catch (error) {
            if (continueOnError) {
              results.failed.push({ update, error: error.message });
            } else {
              reject(error);
              return;
            }
          }

          completed++;
          if (onProgress) {
            onProgress({
              completed,
              total,
              percentage: Math.round((completed / total) * 100),
            });
          }
        }

        resolve({
          success: true,
          processed: completed,
          successful: results.success.length,
          failed: results.failed.length,
          skipped: results.skipped.length,
          details: results,
        });
      } catch (error) {
        console.error(
          `❌ Batch update fields failed for store "${storeName}":`,
          error
        );
        reject(error);
      }
    });
  },

  // === SIMPLE REFRESH METHODS ===

  // Simple refresh all tables from API
  refresh: function (apiEndpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const { onProgress = null, refreshInterval = null } = options;
        const allStores = Array.from(this.db.objectStoreNames);
        const results = { success: [], failed: [], refreshed: 0 };

        // If API endpoint provided, refresh all tables from API
        if (apiEndpoint) {
          for (const storeName of allStores) {
            try {
              // Build API URL for each table
              const apiUrl =
                typeof apiEndpoint === "string"
                  ? `${apiEndpoint}/${storeName}`
                  : await apiEndpoint(storeName);

              // Fetch fresh data
              const response = await fetch(apiUrl);
              const freshData = await response.json();

              // Update table with fresh data
              if (Array.isArray(freshData)) {
                await this.batchUpdate(storeName, freshData, {
                  clearFirst: true,
                });
              } else {
                await this.set(storeName, freshData);
              }

              results.success.push(storeName);
              results.refreshed++;

              // Notify observers
              this.notifyObservers(storeName, freshData, "refresh");

              if (onProgress) {
                onProgress({
                  current: results.refreshed,
                  total: allStores.length,
                  percentage: Math.round(
                    (results.refreshed / allStores.length) * 100
                  ),
                  currentTable: storeName,
                });
              }
            } catch (error) {
              console.error(`Failed to refresh ${storeName}:`, error);
              results.failed.push({ storeName, error: error.message });
            }
          }
        } else {
          // Re-trigger observers for all existing data (local refresh)
          for (const storeName of allStores) {
            try {
              const existingData = await this.getAll(storeName);
              this.notifyObservers(storeName, existingData.data, "refresh");
              results.success.push(storeName);
              results.refreshed++;

              if (onProgress) {
                onProgress({
                  current: results.refreshed,
                  total: allStores.length,
                  percentage: Math.round(
                    (results.refreshed / allStores.length) * 100
                  ),
                  currentTable: storeName,
                });
              }
            } catch (error) {
              results.failed.push({ storeName, error: error.message });
            }
          }
        }

        // Setup auto-refresh if interval provided
        if (refreshInterval && refreshInterval > 0) {
          this.autoRefreshInterval = setInterval(() => {
            this.refresh(apiEndpoint, { onProgress });
          }, refreshInterval);
        }

        resolve({
          success: true,
          refreshed: results.refreshed,
          total: allStores.length,
          results: results,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Refresh failed:", error);
        reject(error);
      }
    });
  },

  // Simple refresh with auto mode
  refreshAuto: function (apiEndpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Ensure database is initialized
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const result = await this.refresh(apiEndpoint, options);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Stop auto refresh
  stopRefresh: function () {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;

      return true;
    }
    return false;
  },

  // ✅ NEW: Force refresh that actually reloads data from IndexedDB storage
  forceRefresh: function (delay = 50) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }
        // Optional delay before refresh (for timing synchronization)
        if (delay > 50) {
          await new Promise((resolve) => setTimeout(resolve, delay - 50));
        }

        // Close current database connection
        const currentDbName = this.dbName;
        const currentVersion = this.version;
        const currentStores = Array.from(this.stores);

        this.db.close();
        this.db = null;

        // Small delay to ensure connection is fully closed
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Reopen database with same configuration
        const request = indexedDB.open(currentDbName, currentVersion);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.db = request.result;

          resolve(true);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          // Recreate stores if needed
          currentStores.forEach((storeName) => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: "id" });
            }
          });
        };
      } catch (error) {
        console.error("❌ Force refresh failed:", error);
        reject(error);
      }
    });
  },

  // Simple table refresh (single table)
  refreshTable: function (storeName, apiEndpoint = null) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(new Error(`Store "${storeName}" does not exist`));
          return;
        }

        let freshData;

        if (apiEndpoint) {
          // Fetch from API
          const apiUrl =
            typeof apiEndpoint === "string" ? apiEndpoint : await apiEndpoint();

          const response = await fetch(apiUrl);
          freshData = await response.json();

          // Update table
          if (Array.isArray(freshData)) {
            await this.batchUpdate(storeName, freshData, { clearFirst: true });
          } else {
            await this.set(storeName, freshData);
          }
        } else {
          // Local refresh - re-trigger observers
          const existingData = await this.getAll(storeName);
          freshData = existingData.data;
        }

        // Notify observers
        this.notifyObservers(storeName, freshData, "refresh");

        resolve({
          success: true,
          storeName,
          data: freshData,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`❌ Failed to refresh table "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // Simple table refresh with auto mode
  refreshTableAuto: function (storeName, apiEndpoint = null) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.refreshTable(storeName, apiEndpoint);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // === AUTO MODE PARTIAL UPDATE METHODS ===

  // Auto mode version - removeNestedField with auto store creation
  removeNestedFieldAuto: function (storeName, id, parentPath, fieldName) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.removeNestedField(
          storeName,
          id,
          parentPath,
          fieldName
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - removeFields with auto store creation
  removeFieldsAuto: function (storeName, id, fieldsToRemove) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.removeFields(storeName, id, fieldsToRemove);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - updateFields with auto store creation
  updateFieldsAuto: function (storeName, id, fieldUpdates) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.updateFields(storeName, id, fieldUpdates);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - updateField with auto store creation
  updateFieldAuto: function (storeName, id, fieldName, fieldValue) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.updateField(
          storeName,
          id,
          fieldName,
          fieldValue
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - updateNestedField with auto store creation
  updateNestedFieldAuto: function (storeName, id, fieldPath, newValue) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.updateNestedField(
          storeName,
          id,
          fieldPath,
          newValue
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - mergeData with auto store creation
  mergeDataAuto: function (storeName, id, mergeObject, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.mergeData(
          storeName,
          id,
          mergeObject,
          options
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - batchUpdateFields with auto store creation
  batchUpdateFieldsAuto: function (storeName, updates, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.batchUpdateFields(
          storeName,
          updates,
          options
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Auto mode version - batchRemoveFields with auto store creation
  batchRemoveFieldsAuto: function (storeName, fieldsToRemove, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.batchRemoveFields(
          storeName,
          fieldsToRemove,
          options
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // === AUTO MODE METHODS ===

  // Auto create store jika belum ada
  createStoreAuto: function (storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      // Jika store sudah ada, langsung resolve
      if (this.db.objectStoreNames.contains(storeName)) {
        resolve(true);
        return;
      }

      // Close current database
      this.db.close();

      // Reopen dengan version baru dan tambahkan store
      const newVersion = this.version + 1;
      const request = indexedDB.open(this.dbName, newVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.version = this.db.version;
        this.stores.add(storeName);
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Buat store baru
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
    });
  },

  // Set dengan auto store creation
  setAuto: function (storeName, data) {
    return new Promise(async (resolve, reject) => {
      try {
        // Pastikan store ada, buat jika belum
        await this.createStoreAuto(storeName);

        // Tambahkan timestamp otomatis
        const dataWithTimestamp = {
          ...data,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // 🔐 Encrypt data jika encryption enabled (OTOMATIS)
        const encryptPromise = this.encryptDataFields(dataWithTimestamp, storeName);
        encryptPromise.then(async (dataToSave) => {
          const transaction = this.db.transaction([storeName], "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(dataToSave);

          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            // Notify observers dengan data yang sudah di-decrypt
            const decryptedData = await this.decryptDataFields(dataToSave, storeName);
            this.notifyObservers(storeName, decryptedData, "update");
            resolve(request.result);
          };
        }).catch((error) => {
          console.error("Encryption error:", error);
          // Fallback: save without encryption
          const transaction = this.db.transaction([storeName], "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(dataWithTimestamp);

          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.notifyObservers(storeName, dataWithTimestamp, "update");
            resolve(request.result);
          };
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Get dengan auto store creation
  getAuto: function (storeName, key) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);

        // Validate key - jika key tidak ada atau undefined, return null
        if (key === undefined || key === null || key === "") {
          console.warn(`Key is ${key === undefined ? 'undefined' : key === null ? 'null' : 'empty'} for store "${storeName}", returning null`);
          resolve(null);
          return;
        }

        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => {
          // Jika error karena key tidak valid, return null instead of reject
          console.warn(`Error accessing store "${storeName}" with key "${key}":`, request.error);
          resolve(null);
        };
        
        request.onsuccess = async () => {
          // 🔐 Decrypt data jika encryption enabled (OTOMATIS)
          const encryptedData = request.result;
          if (encryptedData) {
            try {
              const decryptedData = await this.decryptDataFields(encryptedData, storeName);
              resolve(decryptedData);
            } catch (decryptError) {
              console.warn(`Decryption error for store "${storeName}", returning encrypted data:`, decryptError);
              resolve(encryptedData);
            }
          } else {
            resolve(null);
          }
        };
      } catch (error) {
        // Handle error gracefully - return null instead of reject
        console.warn(`Error in getAuto for store "${storeName}":`, error.message);
        resolve(null);
      }
    });
  },

  // GetAll dengan auto store creation
  getAllAuto: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);

        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
          // 🔐 Decrypt semua data jika encryption enabled (OTOMATIS)
          const encryptedData = request.result;
          const decryptPromises = encryptedData.map((item) => this.decryptDataFields(item, storeName));
          const decryptedData = await Promise.all(decryptPromises);
          resolve({ data: decryptedData });
        };
      } catch (error) {
        reject(error);
      }
    });
  },

  // Delete dengan auto store creation
  deleteAuto: function (storeName, key) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);

        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.notifyObservers(storeName, { id: key }, "delete");
          resolve(request.result);
        };
      } catch (error) {
        reject(error);
      }
    });
  },

  // Duplicate dengan auto store creation
  duplicateAuto: function (storeName, originalId, newId, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const result = await this.duplicate(
          storeName,
          originalId,
          newId,
          options
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Data access methods dengan auto store creation
  getLatestAuto: function (storeName, count = 1) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getLatest(storeName, count);
      } catch (error) {
        reject(error);
      }
    });
  },

  getOldestAuto: function (storeName, count = 1) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getOldest(storeName, count);
      } catch (error) {
        reject(error);
      }
    });
  },

  getByDateRangeAuto: function (storeName, startDate, endDate) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getByDateRange(storeName, startDate, endDate);
      } catch (error) {
        reject(error);
      }
    });
  },

  searchAuto: function (storeName, query, fields = []) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.search(storeName, query, fields);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Get IDs methods dengan auto store creation
  getAllIDsAuto: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getAllIDs(storeName);
      } catch (error) {
        reject(error);
      }
    });
  },

  getIDsAuto: function (storeName, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getIDs(storeName, options);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Real-time methods dengan auto store creation
  refreshTableAuto: function (storeName = null, endpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (storeName) {
          await this.createStoreAuto(storeName);
        }
        return await this.refreshTable(storeName, endpoint, options);
      } catch (error) {
        reject(error);
      }
    });
  },

  watchAuto: function (storeName, callback, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        const watchId = this.watch(storeName, callback, options);
        resolve(watchId);
      } catch (error) {
        reject(error);
      }
    });
  },

  setupAutoRefreshAuto: function (storeName, config = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.setupAutoRefresh(storeName, config);
      } catch (error) {
        reject(error);
      }
    });
  },

  startPollingAuto: function (storeName, endpoint, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.startPolling(storeName, endpoint, options);
      } catch (error) {
        reject(error);
      }
    });
  },

  batchUpdateAuto: function (storeName, dataArray, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.batchUpdate(storeName, dataArray, options);
      } catch (error) {
        reject(error);
      }
    });
  },

  // Size management methods dengan auto store creation
  getStoreSizeAuto: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getStoreSize(storeName);
      } catch (error) {
        reject(error);
      }
    });
  },

  getDataSizeAuto: function (storeName, dataId) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.getDataSize(storeName, dataId);
      } catch (error) {
        reject(error);
      }
    });
  },

  cleanupBySizeAuto: function (storeName, maxSizeMB = 10) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStoreAuto(storeName);
        return await this.cleanupBySize(storeName, maxSizeMB);
      } catch (error) {
        reject(error);
      }
    });
  },

  // List semua stores yang ada
  listStores: function () {
    if (!this.db) {
      return [];
    }
    return Array.from(this.db.objectStoreNames);
  },

  // Create a safe interface that handles store creation automatically
  createSafeInterface: function () {
    const self = this;

    return {
      // Safe get method that creates store if needed
      get: async function (storeName, key) {
        try {
          if (self.autoMode) {
            await self.ensureStoreExists(storeName);
            return await self.getAuto(storeName, key);
          } else {
            return await self.get(storeName, key);
          }
        } catch (error) {
          console.error(`Safe get error for store "${storeName}":`, error);
          return null;
        }
      },

      // Safe getAll method that creates store if needed
      getAll: async function (storeName) {
        try {
          if (self.autoMode) {
            await self.ensureStoreExists(storeName);
            return await self.getAllAuto(storeName);
          } else {
            return await self.getAll(storeName);
          }
        } catch (error) {
          console.error(`Safe getAll error for store "${storeName}":`, error);
          return { data: [] };
        }
      },

      // Safe set method that creates store if needed
      set: async function (storeName, data) {
        try {
          if (self.autoMode) {
            await self.ensureStoreExists(storeName);
            return await self.setAuto(storeName, data);
          } else {
            return await self.set(storeName, data);
          }
        } catch (error) {
          console.error(`Safe set error for store "${storeName}":`, error);
          throw error;
        }
      },

      // Safe delete method that creates store if needed
      delete: async function (storeName, key) {
        try {
          if (self.autoMode) {
            await self.ensureStoreExists(storeName);
            return await self.deleteAuto(storeName, key);
          } else {
            return await self.delete(storeName, key);
          }
        } catch (error) {
          console.error(`Safe delete error for store "${storeName}":`, error);
          return false;
        }
      },

      // Safe duplicate method that creates store if needed
      duplicate: async function (storeName, originalId, newId, options = {}) {
        try {
          if (self.autoMode) {
            await self.ensureStoreExists(storeName);
            return await self.duplicateAuto(
              storeName,
              originalId,
              newId,
              options
            );
          } else {
            return await self.duplicate(storeName, originalId, newId, options);
          }
        } catch (error) {
          console.error(
            `Safe duplicate error for store "${storeName}":`,
            error
          );
          throw error;
        }
      },

      // Expose other methods
      getLatest: (storeName, count) =>
        self.autoMode
          ? self.getLatestAuto(storeName, count)
          : self.getLatest(storeName, count),
      getOldest: (storeName, count) =>
        self.autoMode
          ? self.getOldestAuto(storeName, count)
          : self.getOldest(storeName, count),
      search: (storeName, query, fields) =>
        self.autoMode
          ? self.searchAuto(storeName, query, fields)
          : self.search(storeName, query, fields),
      getByDateRange: (storeName, start, end) =>
        self.autoMode
          ? self.getByDateRangeAuto(storeName, start, end)
          : self.getByDateRange(storeName, start, end),

      // Get IDs methods
      getAllIDs: (storeName) =>
        self.autoMode
          ? self.getAllIDsAuto(storeName)
          : self.getAllIDs(storeName),
      getIDs: (storeName, options) =>
        self.autoMode
          ? self.getIDsAuto(storeName, options)
          : self.getIDs(storeName, options),

      // Utility methods
      listStores: () => self.listStores(),
      hasStore: (storeName) => self.hasStore(storeName),
      getInfo: () => self.getInfo(),
    };
  },

  // === SIZE MANAGEMENT METHODS ===

  // Get database size dengan analisis detail
  getDatabaseSize: function () {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const storeNames = Array.from(this.db.objectStoreNames);
        let totalSizeBytes = 0;
        const storeSizes = {};

        // Analisis ukuran per store
        for (const storeName of storeNames) {
          const storeData = await this.getAll(storeName);
          const storeJsonSize = JSON.stringify(storeData.data).length;

          storeSizes[storeName] = {
            records: storeData.data.length,
            sizeBytes: storeJsonSize,
            sizeKB: (storeJsonSize / 1024).toFixed(2),
            sizeMB: (storeJsonSize / (1024 * 1024)).toFixed(2),
          };

          totalSizeBytes += storeJsonSize;
        }

        // Get browser storage info
        let browserInfo = null;
        if ("storage" in navigator && "estimate" in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            browserInfo = {
              quota: estimate.quota,
              usage: estimate.usage,
              available: estimate.quota - estimate.usage,
              quotaGB: (estimate.quota / (1024 * 1024 * 1024)).toFixed(2),
              usageMB: (estimate.usage / (1024 * 1024)).toFixed(2),
            };
          } catch (e) {
            console.warn("Could not get storage estimate:", e);
          }
        }

        const result = {
          database: this.dbName,
          version: this.version,
          totalStores: storeNames.length,
          totalSizeBytes,
          totalSizeKB: (totalSizeBytes / 1024).toFixed(2),
          totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
          storeSizes,
          browserStorage: browserInfo,
          timestamp: new Date().toISOString(),
        };

        resolve(result);
      } catch (error) {
        console.error("IndexedDB getDatabaseSize Error:", error);
        reject(error);
      }
    });
  },

  // Get ukuran store tertentu
  getStoreSize: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        if (!this.db.objectStoreNames.contains(storeName)) {
          reject(new Error(`Store "${storeName}" does not exist`));
          return;
        }

        const storeData = await this.getAll(storeName);
        const data = storeData.data;

        if (data.length === 0) {
          resolve({
            storeName,
            totalRecords: 0,
            sizeBytes: 0,
            sizeKB: "0.00",
            sizeMB: "0.00",
            avgRecordSize: 0,
            largestRecords: [],
            smallestRecords: [],
          });
          return;
        }

        // Analisis per record
        const recordSizes = data.map((record) => ({
          id: record.id,
          size: JSON.stringify(record).length,
        }));

        recordSizes.sort((a, b) => b.size - a.size);

        const totalSize = recordSizes.reduce(
          (sum, record) => sum + record.size,
          0
        );

        const result = {
          storeName,
          totalRecords: data.length,
          sizeBytes: totalSize,
          sizeKB: (totalSize / 1024).toFixed(2),
          sizeMB: (totalSize / (1024 * 1024)).toFixed(2),
          avgRecordSize: Math.round(totalSize / data.length),
          largestRecords: recordSizes.slice(0, 5),
          smallestRecords: recordSizes.slice(-5).reverse(),
          timestamp: new Date().toISOString(),
        };

        resolve(result);
      } catch (error) {
        console.error("IndexedDB getStoreSize Error:", error);
        reject(error);
      }
    });
  },

  // Get ukuran data tertentu
  getDataSize: function (storeName, dataId) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const data = await this.get(storeName, dataId);
        if (!data) {
          resolve({ error: "Data not found", storeName, dataId });
          return;
        }

        const jsonString = JSON.stringify(data);
        const sizeBytes = jsonString.length;

        // Analisis ukuran per field
        const fieldSizes = {};
        for (const [key, value] of Object.entries(data)) {
          fieldSizes[key] = JSON.stringify(value).length;
        }

        const sortedFields = Object.entries(fieldSizes).sort(
          ([, a], [, b]) => b - a
        );

        const result = {
          storeName,
          dataId,
          sizeBytes,
          sizeKB: (sizeBytes / 1024).toFixed(2),
          sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
          fieldCount: Object.keys(data).length,
          largestFields: sortedFields.slice(0, 5),
          fieldSizes,
          timestamp: new Date().toISOString(),
        };

        resolve(result);
      } catch (error) {
        console.error("IndexedDB getDataSize Error:", error);
        reject(error);
      }
    });
  },

  // Monitor ukuran database secara berkala
  monitorSize: function (interval = 30000) {
    let monitoringInterval;

    const startMonitoring = async () => {
      try {
        const sizeInfo = await this.getDatabaseSize();

        // Warning jika database besar
        const sizeMB = parseFloat(sizeInfo.totalSizeMB);
        if (sizeMB > 50) {
          console.warn(`⚠️ Database size is ${sizeMB}MB - consider cleanup`);
        }

        return sizeInfo;
      } catch (error) {
        console.error("Size monitoring error:", error);
      }
    };

    // Start monitoring
    startMonitoring();
    monitoringInterval = setInterval(startMonitoring, interval);

    // Return stop function
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
      }
    };
  },

  // Cleanup berdasarkan ukuran maksimal
  cleanupBySize: function (storeName, maxSizeMB = 10) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const currentSize = await this.getStoreSize(storeName);
        const currentSizeMB = parseFloat(currentSize.sizeMB);

        if (currentSizeMB <= maxSizeMB) {
          resolve({
            cleaned: false,
            reason: "Size within limit",
            currentSizeMB,
            maxSizeMB,
          });
          return;
        }

        // Get oldest data untuk dihapus
        const oldestData = await this.getOldest(storeName, 100);
        let deletedCount = 0;

        for (const item of oldestData.data) {
          await this.delete(storeName, item.id);
          deletedCount++;

          // Check size after each deletion
          const newSize = await this.getStoreSize(storeName);
          if (parseFloat(newSize.sizeMB) <= maxSizeMB) {
            break;
          }
        }

        const finalSize = await this.getStoreSize(storeName);

        const result = {
          cleaned: true,
          storeName,
          deletedRecords: deletedCount,
          beforeSizeMB: currentSizeMB,
          afterSizeMB: parseFloat(finalSize.sizeMB),
          savedMB: (currentSizeMB - parseFloat(finalSize.sizeMB)).toFixed(2),
          timestamp: new Date().toISOString(),
        };

        resolve(result);
      } catch (error) {
        console.error("IndexedDB cleanupBySize Error:", error);
        reject(error);
      }
    });
  },

  // Get storage usage info (browser level)
  getStorageUsage: function () {
    return new Promise(async (resolve, reject) => {
      try {
        if (!("storage" in navigator && "estimate" in navigator.storage)) {
          resolve({
            supported: false,
            message: "Storage estimation not supported in this browser",
          });
          return;
        }

        const estimate = await navigator.storage.estimate();

        const result = {
          supported: true,
          quota: estimate.quota,
          usage: estimate.usage,
          available: estimate.quota - estimate.usage,
          usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(1),
          quotaGB: (estimate.quota / (1024 * 1024 * 1024)).toFixed(2),
          usageMB: (estimate.usage / (1024 * 1024)).toFixed(2),
          availableMB: (
            (estimate.quota - estimate.usage) /
            (1024 * 1024)
          ).toFixed(2),
          timestamp: new Date().toISOString(),
        };

        resolve(result);
      } catch (error) {
        console.error("IndexedDB getStorageUsage Error:", error);
        reject(error);
      }
    });
  },

  // === REAL-TIME METHODS ===

  // Setup BroadcastChannel untuk cross-tab sync
  setupBroadcastChannel: function () {
    if (!this.broadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("nexa_storage_sync");
      this.tabId = `tab_${Date.now()}_${Math.random()}`;

      this.broadcastChannel.onmessage = (event) => {
        const { storeName, data, changeType, tabId } = event.data;

        // Ignore message dari tab sendiri
        if (tabId === this.tabId) return;

        // Notify observers di tab ini
        this.notifyObservers(storeName, data, changeType);
      };
    }
  },

  // Broadcast perubahan ke tabs lain
  broadcastChange: function (storeName, data, changeType) {
    if (!this.broadcastChannel) {
      this.setupBroadcastChannel();
    }

    this.broadcastChannel.postMessage({
      storeName,
      data,
      changeType,
      tabId: this.tabId,
      timestamp: new Date().toISOString(),
    });
  },

  // Watch perubahan data (Observer Pattern)
  watch: function (storeName, callback, options = {}) {
    const watchId = `${storeName}_${Date.now()}_${Math.random()}`;

    if (!this.observers.has(storeName)) {
      this.observers.set(storeName, new Map());
    }

    this.observers.get(storeName).set(watchId, {
      callback,
      options: {
        immediate: false,
        ...options,
      },
    });

    // Setup BroadcastChannel jika belum ada
    this.setupBroadcastChannel();

    // Return unwatch function
    return () => this.unwatch(storeName, watchId);
  },

  // Stop watching
  unwatch: function (storeName, watchId) {
    if (this.observers.has(storeName)) {
      this.observers.get(storeName).delete(watchId);

      // Cleanup jika tidak ada observer lagi
      if (this.observers.get(storeName).size === 0) {
        this.observers.delete(storeName);
        this.stopPolling(storeName);
      }
    }
  },

  // Notify observers ketika data berubah
  notifyObservers: function (storeName, data, changeType = "update") {
    if (!this.observers.has(storeName)) return;

    this.observers.get(storeName).forEach((observer, watchId) => {
      try {
        observer.callback({
          storeName,
          data,
          changeType, // 'add', 'update', 'delete', 'refresh'
          timestamp: new Date().toISOString(),
          watchId,
        });
      } catch (error) {
        console.error(`Observer error for ${storeName}:`, error);
      }
    });
  },

  // REFRESH TABLE - Manual refresh dari server atau semua table
  refreshTable: function (storeName = null, endpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Jika tidak ada parameter, refresh semua stores
        if (!storeName) {
          if (!this.db) {
            reject(new Error("Database not initialized"));
            return;
          }

          const allStores = Array.from(this.db.objectStoreNames);
          const results = [];

          for (const store of allStores) {
            try {
              // Re-fetch existing data untuk trigger observers
              const existing = await this.getAll(store);
              const freshData = existing.data;

              // Notify observers
              this.notifyObservers(store, freshData, "refresh");

              // Broadcast ke tabs lain
              this.broadcastChange(store, freshData, "refresh");

              results.push({
                store: store,
                success: true,
                dataCount: Array.isArray(freshData) ? freshData.length : 1,
              });
            } catch (error) {
              console.error(`Refresh error for store ${store}:`, error);
              results.push({
                store: store,
                success: false,
                error: error.message,
              });
            }
          }

          resolve({
            success: true,
            refreshedStores: results,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Single store refresh dengan endpoint
        let freshData;

        if (endpoint) {
          // Fetch dari endpoint/API
          if (typeof endpoint === "function") {
            freshData = await endpoint();
          } else if (typeof endpoint === "string") {
            // Gunakan Storage API
            const storage = Storage();
            const response = await storage.api(endpoint).get();
            freshData = response.data || response;
          } else {
            throw new Error("Endpoint must be function or string");
          }
        } else {
          // Re-fetch existing data (useful untuk re-triggering observers)
          const existing = await this.getAll(storeName);
          freshData = existing.data;
        }

        // Batch update jika array
        if (Array.isArray(freshData)) {
          await this.batchUpdate(storeName, freshData, {
            clearFirst: true,
            ...options,
          });
        } else {
          await this.set(storeName, freshData);
        }

        // Notify observers
        this.notifyObservers(storeName, freshData, "refresh");

        // Broadcast ke tabs lain
        this.broadcastChange(storeName, freshData, "refresh");

        resolve({
          success: true,
          store: storeName,
          data: freshData,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Refresh table error for ${storeName}:`, error);
        reject(error);
      }
    });
  },

  // Batch update untuk efisiensi
  batchUpdate: function (storeName, dataArray, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          clearFirst = false,
          batchSize = 100,
          onProgress = null,
        } = options;

        // Clear existing data jika diminta
        if (clearFirst) {
          const existingData = await this.getAll(storeName);
          for (const item of existingData.data) {
            await this.delete(storeName, item.id);
          }
        }

        // Process dalam batches
        for (let i = 0; i < dataArray.length; i += batchSize) {
          const batch = dataArray.slice(i, i + batchSize);

          // Process batch
          await Promise.all(batch.map((item) => this.set(storeName, item)));

          // Progress callback
          if (onProgress) {
            onProgress({
              processed: Math.min(i + batchSize, dataArray.length),
              total: dataArray.length,
              percentage: Math.round(
                ((i + batchSize) / dataArray.length) * 100
              ),
            });
          }
        }

        resolve({
          success: true,
          processed: dataArray.length,
          storeName,
        });
      } catch (error) {
        console.error(`Batch update error for ${storeName}:`, error);
        reject(error);
      }
    });
  },

  // Auto polling untuk refresh berkala
  startPolling: function (storeName, endpoint, options = {}) {
    const {
      interval = 30000, // 30 detik default
      immediate = true,
      transform = null,
    } = options;

    // Stop existing polling
    this.stopPolling(storeName);

    let lastData = null;

    const poll = async () => {
      try {
        let freshData;

        if (typeof endpoint === "function") {
          freshData = await endpoint();
        } else {
          const storage = Storage();
          const response = await storage.api(endpoint).get();
          freshData = response.data || response;
        }

        // Transform data jika ada
        if (transform && typeof transform === "function") {
          freshData = transform(freshData);
        }

        // Compare dengan data sebelumnya
        const hasChanged = lastData
          ? JSON.stringify(lastData) !== JSON.stringify(freshData)
          : true;

        if (hasChanged) {
          // Update IndexedDB
          if (Array.isArray(freshData)) {
            await this.batchUpdate(storeName, freshData, { clearFirst: true });
          } else {
            await this.set(storeName, freshData);
          }

          // Notify observers
          this.notifyObservers(storeName, freshData, "refresh");

          // Broadcast change
          this.broadcastChange(storeName, freshData, "refresh");

          lastData = freshData;
        }
      } catch (error) {
        console.error(`Polling error for ${storeName}:`, error);
      }
    };

    // Start polling
    if (immediate) poll();
    const intervalId = setInterval(poll, interval);

    this.pollingIntervals.set(storeName, {
      intervalId,
      endpoint,
      options,
    });

    return intervalId;
  },

  // Stop polling
  stopPolling: function (storeName) {
    if (this.pollingIntervals.has(storeName)) {
      const { intervalId } = this.pollingIntervals.get(storeName);
      clearInterval(intervalId);
      this.pollingIntervals.delete(storeName);
    }
  },

  // Setup auto refresh dengan strategy
  setupAutoRefresh: function (storeName, config = {}) {
    const {
      strategy = "polling", // 'polling'
      endpoint = null,
      pollInterval = 30000,
      immediate = true,
    } = config;

    if (strategy === "polling") {
      return this.startPolling(storeName, endpoint, {
        interval: pollInterval,
        immediate,
      });
    }

    throw new Error(`Strategy '${strategy}' not supported`);
  },

  // Cleanup semua real-time connections
  cleanup: function () {
    // Stop all polling
    this.pollingIntervals.forEach((_, storeName) => {
      this.stopPolling(storeName);
    });

    // Clear observers
    this.observers.clear();

    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  },

  // Get status real-time connections
  getRealtimeStatus: function () {
    return {
      observers: Array.from(this.observers.keys()),
      polling: Array.from(this.pollingIntervals.keys()),
      broadcastChannel: !!this.broadcastChannel,
      tabId: this.tabId,
    };
  },
};
