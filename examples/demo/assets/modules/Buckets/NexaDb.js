export class NexaDb {
  constructor() {
    this.dbName = this.dbName();
    this.dbVersion = 41; // Added: pelangganFoto store (foto dokumentasi pelanggan)
    this.db = null;
    this.userData = window.NEXA?.userId || 0; // Default user ID = 1 untuk backward compatibility
  }

  /**
   * Get default stores list - single source of truth
   * Cukup tambahkan nama store di sini, dan akan otomatis terbuat
   * @returns {Array<string>} Array of store names
   */
  getDefaultStores() {
    return [
       "nexaStore",
       "notifications",
       "bucketsStore",
       "drive",
       "userData",
       "bucketsRoute",
       "bucketsData",
       "createTabel",
       "mergeTabel",
       "viewStore",
       "metadata",
       "settings",  
       "extensions",
       "bucketsCli",
       "developer",
       "chat",
       "chatReview",
       "chat_review",
       "editor",
       "debug",
       "discovery",
       "browser",
       "nexaSocialite",
       "socialite",
       "textsheet",
       "docxsheet",
       "spreadsheet",
       "presentations", // Store untuk NexaPptx presentations
       "diagrams",      // Store untuk DiagramsPanel (AntV X6)
       "statistics",    // Store untuk StatisticsPanel (NxStat)
       "printSettings",
       "nxclouddb",
       "oauth",
       "employee",   // Data master pegawai (id dari NxFace, nama, dll)
       "attendance", // Log presensi/absen — satu entri per login (waktu + foto)
       "pelangganFoto", // Foto dokumentasi pelanggan (id = id pelanggan di NxMyDb, TANPA pengenalan wajah — beda dari 'employee')

    ];
  }


  /**
   * Get store configuration for stores that need custom setup (indexes, keyPath, etc)
   * Store yang tidak ada di sini akan dibuat dengan konfigurasi default
   * @param {string} storeName - Name of the store
   * @returns {Object|null} Store configuration or null for default
   */
  getStoreConfig(storeName) {
    const storeConfigs = {
      folderStructure: {
        keyPath: "id",
        autoIncrement: false,
        indexes: [
          { name: "path", keyPath: "path", unique: false },
          { name: "parentPath", keyPath: "parentPath", unique: false },
        ],
      },
      activityLogs: {
        keyPath: "id",
        autoIncrement: true,
        indexes: [
          { name: "timestamp", keyPath: "timestamp", unique: false },
          { name: "action", keyPath: "action", unique: false },
          { name: "path", keyPath: "path", unique: false },
        ],
      },
      metadata: {
        keyPath: "key",
        autoIncrement: false,
        indexes: [],
      },
      recycleBin: {
        keyPath: "id",
        autoIncrement: true,
        indexes: [
          { name: "deletedDate", keyPath: "deletedDate", unique: false },
          { name: "originalPath", keyPath: "originalPath", unique: false },
          { name: "itemType", keyPath: "itemType", unique: false },
        ],
      },
      fileContents: {
        keyPath: "fileId",
        autoIncrement: false,
        indexes: [
          { name: "fileName", keyPath: "fileName", unique: false },
          { name: "fileType", keyPath: "fileType", unique: false },
          { name: "lastModified", keyPath: "lastModified", unique: false },
          { name: "fileNameType", keyPath: ["fileName", "fileType"], unique: true },
        ],
      },
      fileSettings: {
        keyPath: "id",
        autoIncrement: false,
        indexes: [
          { name: "fileName", keyPath: "fileName", unique: false },
          { name: "userData", keyPath: "userData", unique: false },
          { name: "savedAt", keyPath: "savedAt", unique: false },
        ],
      },
      programFiles: {
        keyPath: "id",
        autoIncrement: true,
        indexes: [
          { name: "name", keyPath: "name", unique: false },
          { name: "path", keyPath: "path", unique: false },
          { name: "createdAt", keyPath: "createdAt", unique: false },
          { name: "updatedAt", keyPath: "updatedAt", unique: false },
        ],
      },
      settings: {
        keyPath: "id",
        autoIncrement: false,
        indexes: [
          { name: "id", keyPath: "id", unique: true },
        ],
      },
      // Data master pegawai. id = id dari NxFace (crypto.randomUUID() saat
      // registrasi wajah, lihat templates/oauth/register.js) — DITENTUKAN
      // client, bukan auto-generate DB, makanya autoIncrement: false.
      employee: {
        keyPath: "id",
        autoIncrement: false,
        indexes: [
          { name: "nama", keyPath: "nama", unique: false },
        ],
      },
      // Foto dokumentasi pelanggan — id = String(id pelanggan) dari tabel
      // 'pelanggan' di NxMyDb (templates/penjualan/pelanggan.js). TANPA
      // pengenalan wajah (beda dari 'employee'/NxFace) — cuma snapshot
      // disimpan & ditampilkan, tidak ada training/recognize.
      pelangganFoto: {
        keyPath: "id",
        autoIncrement: false,
        indexes: [],
      },
      // Log presensi/absen — SATU ENTRI PER LOGIN (bukan overwrite), beda
      // dari store 'oauth' (sesi login SAAT INI, satu record ditimpa tiap
      // login). autoIncrement: true supaya tiap login otomatis jadi baris
      // baru. Diisi dari templates/oauth/login.js setiap wajah dikenali.
      attendance: {
        keyPath: "id",
        autoIncrement: true,
        indexes: [
          { name: "employeeId", keyPath: "employeeId", unique: false },
          { name: "timestamp", keyPath: "timestamp", unique: false },
        ],
      },
    };

    return storeConfigs[storeName] || null;
  }

  /**
   * Instance method to initialize NXUI.ref using this instance's properties
   * @param {Array} stores - Array of store names (optional, defaults to all required stores)
   * @returns {Promise<Object>} - Returns the initialized NXUI.ref
   */
dbName() {
  // Gunakan NEXA.url langsung tanpa fallback
  // NEXA.url sudah dijamin tersedia sebelum NexaDb dibuat (dari wait mechanism di NexaUI.js)
  const dname = window.NEXA?.url;
  // Validasi: pastikan NEXA.url tersedia
  if (!dname || dname === '') {
    throw new Error('NEXA.url is required for database name. Make sure NEXA.url is set before creating NexaDb instance.');
  }
  
  let base64 = btoa(unescape(encodeURIComponent(dname)));

  // hapus semua "=" di akhir Base64
  base64 = base64.replace(/=/g, "");

  return "nexaui-" + base64;
}


  async Ref(stores = null) {
    try {
      // Check if NXUI is available (prioritas: window.NXUI > global NXUI)
      const NXUI = (typeof window !== 'undefined' && window.NXUI) ? window.NXUI : (typeof NXUI !== 'undefined' ? NXUI : null);
    
      if (!NXUI) {
        throw new Error('NXUI is not available. Make sure nexa-ui.js is loaded first.');
      }
      
      // If NXUI.ref already exists, return it
      if (NXUI.ref) {
        return NXUI.ref;
      }

      // Default stores if not provided - menggunakan getDefaultStores() sebagai single source of truth
      const defaultStores = this.getDefaultStores();

      const storesToInit = stores || defaultStores;
      
      // Pastikan NXUI.Storage tersedia
      if (!NXUI.Storage || typeof NXUI.Storage !== 'function') {
        throw new Error('NXUI.Storage() is not available. Make sure NXUI is properly initialized.');
      }

      // Initialize NXUI.ref using NXUI.Storage
      const storageInstance = NXUI.Storage();
      if (!storageInstance || !storageInstance.indexedDB) {
        throw new Error('NXUI.Storage().indexedDB is not available.');
      }

      NXUI.ref = await storageInstance
        .indexedDB.init(this.dbName, this.dbVersion, storesToInit);

      // Shorthand store accessors:
      // NXUI.ref.bucketsStore('tools').get()
      // NXUI.ref.bucketsStore('tools').set({ ... })
      // NXUI.ref.bucketsStore('tools').del()
      // NXUI.ref.bucketsStore('tools').getAll()
      // NXUI.ref.bucketsStore('tools').merge({ ... })
      const _ref = NXUI.ref;
      const allStores = stores || this.getDefaultStores();
      allStores.forEach(storeName => {
        NXUI.ref[storeName] = (key) => ({
          get:    ()           => _ref.get(storeName, key),
          set:    (data)       => _ref.set(storeName, { ...data, id: key }),
          del:    ()           => _ref.delete(storeName, key),
          getAll: ()           => _ref.getAll(storeName),
          merge:  (data, opts) => _ref.mergeData(storeName, key, data, opts),
        });
      });

      return NXUI.ref;
    } catch (error) {
      throw error;
    }
  }

  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;

        this.createObjectStores(oldVersion);
      };
    });
  }
  /**
   * Ensure all required object stores are ready
   */
  uninstall() {
    const dbName = this.dbName;
    const deleteRequest = indexedDB.deleteDatabase(this.dbName);
    deleteRequest.onsuccess = function () {};
    deleteRequest.onerror = function (event) {
      // Silent fail
    };

    deleteRequest.onblocked = function () {
      // Silent fail
    };
  }

  async install() {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    // Menggunakan getDefaultStores() sebagai single source of truth
    const requiredStores = this.getDefaultStores();

    const missingStores = requiredStores.filter(
      (storeName) => !this.db.objectStoreNames.contains(storeName)
    );

    if (missingStores.length > 0) {
      // Force database upgrade by reopening with higher version
      await this.forceDatabaseUpgrade();

      // Verify stores were created after upgrade
      const stillMissing = requiredStores.filter(
        (storeName) => !this.db.objectStoreNames.contains(storeName)
      );

      if (stillMissing.length > 0) {
        throw new Error(
          `Failed to create required object stores: ${stillMissing.join(", ")}`
        );
      }
    }

    return true;
  }

  /**
   * Force database upgrade to ensure all object stores exist
   */
  async forceDatabaseUpgrade() {
    return new Promise((resolve, reject) => {
      // Close current connection
      if (this.db) {
        this.db.close();
      }

      // Reopen with incremented version to trigger upgrade
      const newVersion = this.dbVersion + 1;
      const request = indexedDB.open(this.dbName, newVersion);
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbVersion = newVersion;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;
        this.createObjectStores(oldVersion);

        // Log created stores
        const createdStores = Array.from(this.db.objectStoreNames);
      };
    });
  }

  /**
   * Create object stores dynamically based on getDefaultStores()
   * Store yang ada di getDefaultStores() akan otomatis dibuat
   * Konfigurasi khusus (indexes, keyPath) diambil dari getStoreConfig()
   * Jika tidak ada konfigurasi khusus, akan menggunakan default: keyPath="id", autoIncrement=true
   */
  createObjectStores(oldVersion = 0) {
    const defaultStores = this.getDefaultStores();

    // Loop melalui semua store di defaultStores dan buat jika belum ada
    defaultStores.forEach((storeName) => {
      if (!this.db.objectStoreNames.contains(storeName)) {
        const config = this.getStoreConfig(storeName);

        // Jika ada konfigurasi khusus, gunakan konfigurasi tersebut
        if (config) {
          const store = this.db.createObjectStore(storeName, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement !== false, // Default true jika tidak didefinisikan
          });

          // Buat indexes jika ada
          if (config.indexes && Array.isArray(config.indexes)) {
            config.indexes.forEach((index) => {
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique || false,
              });
            });
          }
        } else {
          // Konfigurasi default untuk store baru yang tidak ada di getStoreConfig()
          this.db.createObjectStore(storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      }
    });

    // Log final state of object stores
    const finalStores = Array.from(this.db.objectStoreNames);
  }

  // Method untuk kompatibilitas dengan NexaSystem
  async getActivityLogs(limit = 5000) {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["activityLogs"], "readonly");
      const store = transaction.objectStore("activityLogs");
      const index = store.index("timestamp");

      const request = index.getAll();

      request.onsuccess = () => {
        const logs = request.result || [];
        // Sort by timestamp descending (newest first) and limit
        const sortedLogs = logs
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limit);
        resolve(sortedLogs);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAllFileContents() {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["fileContents"], "readonly");
      const store = transaction.objectStore("fileContents");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFileSettings() {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["fileSettings"], "readonly");
      const store = transaction.objectStore("fileSettings");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecycleBinItems() {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["recycleBin"], "readonly");
      const store = transaction.objectStore("recycleBin");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}
