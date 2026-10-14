// Firebase v9+ modular SDK — bundel lokal di assets/modules/Firebase/vendor (offline, tanpa gstatic)
import { initializeApp, getApp } from "/assets/modules/Firebase/vendor/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  off,
  child,
  query,
  orderByChild,
  orderByKey,
  limitToFirst,
  limitToLast,
  equalTo,
  startAt,
  endAt
} from "/assets/modules/Firebase/vendor/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "/assets/modules/Firebase/vendor/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  uploadBytesResumable,
} from "/assets/modules/Firebase/vendor/firebase-storage.js";

import { getFirebaseConfig, isFirebaseConfigured } from "./nexaFirebaseConfig.js";

export { getFirebaseConfig, isFirebaseConfigured };

export const FirebaseManager = {
  app: null,
  database: null,
  config: null,
  observers: new Map(), // Real-time observers
  pollingIntervals: new Map(), // Polling intervals
  broadcastChannel: null, // Cross-tab communication
  tabId: null,
  autoMode: false,

  init: function (config = null, options = {}) {
    const { autoMode = true } = options;
    
    // Use default config if none provided
    this.config = config || getFirebaseConfig();
    this.autoMode = autoMode;

    if (!this.config) {
      return null;
    }
    
    try {
      // Check if already initialized
      if (this.app && this.database) {
        return this.createInterface();
      }
      
      // Try to get existing app first
      try {
        this.app = getApp();
      } catch (error) {
        // No existing app, create new one
        this.app = initializeApp(this.config);
        console.log('🔥 Firebase v9+ initialized successfully');
      }
      
      // Initialize services
      this.database = getDatabase(this.app);
      this.auth = getAuth(this.app);
      this.storage = getStorage(this.app);
      
      // Setup broadcast channel for cross-tab sync
      this.setupBroadcastChannel();
      
      // Return interface object
      return this.createInterface();
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      throw error;
    }
  },


  // Create the main interface object
  createInterface: function() {
    return {
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
        batchUpdateFields: (storeName, updates, options = {}) =>
          this.batchUpdateFields(storeName, updates, options),
        batchRemoveFields: (storeName, fieldsToRemove, options = {}) =>
          this.batchRemoveFields(storeName, fieldsToRemove, options),

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

      // Real-time methods
          refreshTable: (storeName = null, endpoint = null, options = {}) =>
            this.refreshTable(storeName, endpoint, options),
          watch: (storeName, callback, options = {}) =>
            this.watch(storeName, callback, options),
          setupAutoRefresh: (storeName, config = {}) =>
            this.setupAutoRefresh(storeName, config),
          startPolling: (storeName, endpoint, options = {}) =>
            this.startPolling(storeName, endpoint, options),
          stopPolling: (storeName) => this.stopPolling(storeName),
          batchUpdate: (storeName, dataArray, options = {}) =>
            this.batchUpdate(storeName, dataArray, options),

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
          cleanup: () => this.cleanup(),
          getRealtimeStatus: () => this.getRealtimeStatus(),

          // Simple refresh methods
          refresh: (apiEndpoint = null, options = {}) =>
            this.refresh(apiEndpoint, options),
          stopRefresh: () => this.stopRefresh(),
          forceRefresh: () => this.forceRefresh(),

      // Single store mode untuk semua data dalam satu tempat
      setData: (key, data) => this.set("MyAppData", { id: key, ...data }),
      getData: (key) => this.get("MyAppData", key),
      getAllData: () => this.getAll("MyAppData"),
      deleteData: (key) => this.delete("MyAppData", key),

          // Safe interface
          safe: () => this.createSafeInterface(),

      // Legacy compatibility - Storage API pattern
          Storage: () => ({
        firebase: this,
      }),
    };
  },

  // === BASIC CRUD OPERATIONS ===

  set: function (storeName, data) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.database) {
          reject(new Error("Firebase not initialized"));
          return;
        }

        // Ensure data has an ID
        if (!data.id) {
          data.id = this.generateId();
        }

        // Add timestamps
      const dataWithTimestamp = {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

        // Create reference and set data using v9+ API with correct database structure
        const dataRef = ref(this.database, `NexaStoreDB/${storeName}/${data.id}`);
        await set(dataRef, dataWithTimestamp);

        // Notify observers
          this.notifyObservers(storeName, dataWithTimestamp, "update");

        // Broadcast to other tabs
        this.broadcastChange(storeName, dataWithTimestamp, "update");

        resolve(data.id);
      } catch (error) {
        console.error(`❌ Firebase set error for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  get: function (storeName, key) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.database) {
          reject(new Error("Firebase not initialized"));
        return;
      }

        // Create reference and get data using v9+ API with correct database structure
        const dataRef = ref(this.database, `NexaStoreDB/${storeName}/${key}`);
        const snapshot = await get(dataRef);

        if (snapshot.exists()) {
          resolve(snapshot.val());
        } else {
        resolve(null);
        }
      } catch (error) {
        console.error(`❌ Firebase get error for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  getAll: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.database) {
          reject(new Error("Firebase not initialized"));
        return;
      }

        // Create reference and get all data using v9+ API with correct database structure
        const storeRef = ref(this.database, `NexaStoreDB/${storeName}`);
        const snapshot = await get(storeRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          // Convert object to array
          const dataArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          resolve({ data: dataArray });
        } else {
        resolve({ data: [] });
        }
      } catch (error) {
        console.error(`❌ Firebase getAll error for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  delete: function (storeName, key) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.database) {
          reject(new Error("Firebase not initialized"));
          return;
        }

        // Create reference and remove data using v9+ API with correct database structure
        const dataRef = ref(this.database, `NexaStoreDB/${storeName}/${key}`);
        await remove(dataRef);

        // Notify observers
        this.notifyObservers(storeName, { id: key }, "delete");

        // Broadcast to other tabs
        this.broadcastChange(storeName, { id: key }, "delete");

        resolve(true);
      } catch (error) {
        console.error(`❌ Firebase delete error for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === PARTIAL UPDATE METHODS ===

  updateFields: function (storeName, id, fieldUpdates) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.database) {
          reject(new Error("Firebase not initialized"));
        return;
      }

        // Get existing data first
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(new Error(`Data with ID "${id}" not found in store "${storeName}"`));
        return;
      }

        // Merge with new fields
        const updatedData = {
          ...existingData,
          ...fieldUpdates,
          updatedAt: new Date().toISOString(),
        };

        // Update in Firebase using v9+ API with correct database structure
        const dataRef = ref(this.database, `NexaStoreDB/${storeName}/${id}`);
        await set(dataRef, updatedData);

        // Notify observers
        this.notifyObservers(storeName, updatedData, "update");

        resolve(updatedData);
      } catch (error) {
        console.error(`❌ Failed to update fields in store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  updateField: function (storeName, id, fieldName, fieldValue) {
    return this.updateFields(storeName, id, { [fieldName]: fieldValue });
  },

  updateNestedField: function (storeName, id, fieldPath, newValue) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get existing data
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(new Error(`Data with ID "${id}" not found in store "${storeName}"`));
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
        console.error(`❌ Failed to update nested field "${fieldPath}":`, error);
        reject(error);
      }
    });
  },

  removeFields: function (storeName, id, fieldsToRemove) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get existing data
        const existingData = await this.get(storeName, id);
        if (!existingData) {
          reject(new Error(`Data with ID "${id}" not found in store "${storeName}"`));
          return;
        }

        // Convert fieldsToRemove to array if it's a single string
        const fields = Array.isArray(fieldsToRemove) ? fieldsToRemove : [fieldsToRemove];

        // Create updated data without the specified fields
        const updatedData = JSON.parse(JSON.stringify(existingData));

        fields.forEach((fieldName) => {
          if (typeof fieldName !== "string") return;

          // Support dot notation for nested fields
          if (fieldName.includes(".")) {
            const fieldPath = fieldName.split(".");
            let current = updatedData;

            // Navigate to parent of target field
            for (let i = 0; i < fieldPath.length - 1; i++) {
              if (current[fieldPath[i]]) {
                current = current[fieldPath[i]];
              } else {
                return; // Path doesn't exist
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

        resolve(updatedData);
      } catch (error) {
        console.error(`❌ Failed to remove fields in store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  removeNestedField: function (storeName, id, parentPath, fieldName) {
    const fullPath = `${parentPath}.${fieldName}`;
    return this.removeFields(storeName, id, fullPath);
  },

  mergeData: function (storeName, id, mergeObject, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { deepMerge = false, createIfNotExists = false } = options;

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
            reject(new Error(`Data with ID "${id}" not found in store "${storeName}"`));
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

  // === BATCH OPERATIONS ===

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
        console.error(`❌ Batch update fields failed for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

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

            const result = await this.removeFields(storeName, item.id, fieldsToRemove);
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
        console.error(`❌ Batch remove fields failed for store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  batchUpdate: function (storeName, dataArray, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          clearFirst = false,
          batchSize = 100,
          onProgress = null,
        } = options;

        // Clear existing data if requested
        if (clearFirst) {
          const storeRef = ref(this.database, `NexaStoreDB/${storeName}`);
          await remove(storeRef);
        }

        // Process in batches
        for (let i = 0; i < dataArray.length; i += batchSize) {
          const batch = dataArray.slice(i, i + batchSize);

          // Process batch
          await Promise.all(batch.map((item) => this.set(storeName, item)));

          // Progress callback
              if (onProgress) {
                onProgress({
              processed: Math.min(i + batchSize, dataArray.length),
              total: dataArray.length,
              percentage: Math.round(((i + batchSize) / dataArray.length) * 100),
            });
          }
        }

        resolve({
          success: true,
          processed: dataArray.length,
          storeName,
        });
      } catch (error) {
        console.error(`❌ Batch update error for ${storeName}:`, error);
        reject(error);
      }
    });
  },

  // === DATA ACCESS METHODS ===

  getLatest: function (storeName, count = 1) {
    return new Promise(async (resolve, reject) => {
      try {
        const allData = await this.getAll(storeName);
        
        // Sort by updatedAt or createdAt (newest first)
        const sortedData = allData.data.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA; // Descending order
        });

        const result = count === 1 ? sortedData[0] : sortedData.slice(0, count);
        resolve({
          data: result,
          total: allData.data.length,
          requested: count,
        });
      } catch (error) {
        console.error(`❌ Error getting latest data from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  getOldest: function (storeName, count = 1) {
    return new Promise(async (resolve, reject) => {
      try {
        const allData = await this.getAll(storeName);
        
        // Sort by updatedAt or createdAt (oldest first)
        const sortedData = allData.data.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateA - dateB; // Ascending order
        });

        const result = count === 1 ? sortedData[0] : sortedData.slice(0, count);
        resolve({
          data: result,
          total: allData.data.length,
          requested: count,
        });
      } catch (error) {
        console.error(`❌ Error getting oldest data from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  getByDateRange: function (storeName, startDate, endDate) {
    return new Promise(async (resolve, reject) => {
      try {
        const allData = await this.getAll(storeName);
        const start = new Date(startDate);
        const end = new Date(endDate);

        const filteredData = allData.data.filter((item) => {
          const itemDate = new Date(item.updatedAt || item.createdAt);
          return itemDate >= start && itemDate <= end;
        });

        // Sort by date (newest first)
        const sortedData = filteredData.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        });

        resolve({
          data: sortedData,
          total: allData.data.length,
          filtered: sortedData.length,
          startDate,
          endDate,
        });
      } catch (error) {
        console.error(`❌ Error getting date range data from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  search: function (storeName, query, fields = []) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!query || query.trim() === "") {
          resolve({ data: [], total: 0, query });
        return;
      }

        const allData = await this.getAll(storeName);
        const searchTerm = query.toLowerCase();

        const filteredData = allData.data.filter((item) => {
          // If no fields specified, search in all fields
          if (fields.length === 0) {
            return JSON.stringify(item).toLowerCase().includes(searchTerm);
          }

          // Search in specified fields
          return fields.some((field) => {
            const value = item[field];
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(searchTerm);
          });
        });

        // Sort by relevance and date
        const sortedData = filteredData.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        });

        resolve({
          data: sortedData,
          total: allData.data.length,
          found: sortedData.length,
          query,
          searchFields: fields,
        });
      } catch (error) {
        console.error(`❌ Error searching in store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === GET IDs METHODS ===

  getAllIDs: function (storeName) {
    return new Promise(async (resolve, reject) => {
      try {
        const allData = await this.getAll(storeName);
        const ids = allData.data.map(item => item.id);
        
        resolve({
          data: ids,
          total: ids.length,
          storeName,
        });
      } catch (error) {
        console.error(`❌ Error getting IDs from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  getIDs: function (storeName, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
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
        console.error(`❌ Error getting IDs from store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === DUPLICATE METHOD ===

  duplicate: function (storeName, originalId, newId, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get original data
        const originalData = await this.get(storeName, originalId);
        if (!originalData) {
          reject(new Error(`Data with ID "${originalId}" not found in store "${storeName}"`));
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
            reject(new Error(`Data with ID "${newId}" already exists in store "${storeName}". Use overwrite: true to replace it.`));
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
        console.error(`❌ Failed to duplicate data in store "${storeName}":`, error);
        reject(error);
      }
    });
  },

  // === REAL-TIME METHODS ===

  // Setup BroadcastChannel for cross-tab sync
  setupBroadcastChannel: function () {
    if (!this.broadcastChannel) {
      this.broadcastChannel = new BroadcastChannel("nexa_firebase_sync");
      this.tabId = `tab_${Date.now()}_${Math.random()}`;

      this.broadcastChannel.onmessage = (event) => {
        const { storeName, data, changeType, tabId } = event.data;

        // Ignore message from same tab
        if (tabId === this.tabId) return;

        // Notify observers in this tab
        this.notifyObservers(storeName, data, changeType);
      };
    }
  },

  // Broadcast changes to other tabs
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

  // Watch for data changes (Observer Pattern)
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

    // Setup Firebase real-time listener using v9+ API with correct database structure
    const storeRef = ref(this.database, `NexaStoreDB/${storeName}`);
    const unsubscribe = onValue(storeRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Convert object to array
        // id kunci dokumen Firebase harus menang — jangan biarkan field id di dalam record menimpa kunci path
        const dataArray = Object.keys(data).map((docKey) => ({
          ...data[docKey],
          id: docKey,
        }));
        
        // Notify this specific observer
        try {
          callback({
            storeName,
            data: dataArray,
            changeType: 'refresh',
            timestamp: new Date().toISOString(),
            watchId,
          });
        } catch (error) {
          console.error(`Observer error for ${storeName}:`, error);
        }
      }
    });

    // Store unsubscribe function
    this.observers.get(storeName).get(watchId).unsubscribe = unsubscribe;

    // Setup BroadcastChannel if not already
    this.setupBroadcastChannel();

    // Return unwatch function
    return () => this.unwatch(storeName, watchId);
  },

  // Stop watching
  unwatch: function (storeName, watchId) {
    if (this.observers.has(storeName)) {
      const observer = this.observers.get(storeName).get(watchId);
      if (observer && observer.unsubscribe) {
        observer.unsubscribe();
      }
      
      this.observers.get(storeName).delete(watchId);

      // Cleanup if no observers left
      if (this.observers.get(storeName).size === 0) {
        this.observers.delete(storeName);
        this.stopPolling(storeName);
      }
    }
  },

  // Notify observers when data changes
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

  // Refresh table
  refreshTable: function (storeName = null, endpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!storeName) {
          // Refresh all stores - Firebase doesn't have a concept of "all stores"
          // so we'll just trigger observers for existing data
          resolve({
            success: true,
            message: "Firebase doesn't support refreshing all stores. Use specific store names.",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        let freshData;

        if (endpoint) {
          // Fetch from API endpoint
          if (typeof endpoint === "function") {
            freshData = await endpoint();
          } else if (typeof endpoint === "string") {
            const response = await fetch(endpoint);
            freshData = await response.json();
          } else {
            throw new Error("Endpoint must be function or string");
        }

          // Update Firebase with fresh data
        if (Array.isArray(freshData)) {
            await this.batchUpdate(storeName, freshData, { clearFirst: true });
        } else {
          await this.set(storeName, freshData);
          }
        } else {
          // Re-fetch existing data from Firebase
          const existing = await this.getAll(storeName);
          freshData = existing.data;
        }

        // Notify observers
        this.notifyObservers(storeName, freshData, "refresh");

        // Broadcast to other tabs
        this.broadcastChange(storeName, freshData, "refresh");

        resolve({
          success: true,
          store: storeName,
          data: freshData,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`❌ Refresh table error for ${storeName}:`, error);
        reject(error);
      }
    });
  },

  // Auto polling for periodic refresh
  startPolling: function (storeName, endpoint, options = {}) {
    const {
      interval = 30000, // 30 seconds default
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
          const response = await fetch(endpoint);
          freshData = await response.json();
        }

        // Transform data if provided
        if (transform && typeof transform === "function") {
          freshData = transform(freshData);
        }

        // Compare with previous data
        const hasChanged = lastData
          ? JSON.stringify(lastData) !== JSON.stringify(freshData)
          : true;

        if (hasChanged) {
          // Update Firebase
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

  // Setup auto refresh with strategy
  setupAutoRefresh: function (storeName, config = {}) {
    const {
      strategy = "polling", // 'polling' or 'realtime'
      endpoint = null,
      pollInterval = 30000,
      immediate = true,
    } = config;

    if (strategy === "polling") {
      return this.startPolling(storeName, endpoint, {
        interval: pollInterval,
        immediate,
      });
    } else if (strategy === "realtime") {
      // Firebase real-time is handled automatically through watch()
      return this.watch(storeName, (data) => {
        console.log(`Real-time update for ${storeName}:`, data);
      });
    }

    throw new Error(`Strategy '${strategy}' not supported`);
  },

  // === SIMPLE REFRESH METHODS ===

  refresh: function (apiEndpoint = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { onProgress = null, refreshInterval = null } = options;
        
        // Firebase doesn't have a concept of "all stores" like IndexedDB
        // This method would need specific store names to work with
        resolve({
          success: true,
          message: "Firebase refresh requires specific store names. Use refreshTable() instead.",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Refresh failed:", error);
        reject(error);
      }
    });
  },

  stopRefresh: function () {
    // Stop all polling intervals
    this.pollingIntervals.forEach((_, storeName) => {
      this.stopPolling(storeName);
    });
    return true;
  },

  forceRefresh: function (delay = 50) {
    return new Promise(async (resolve, reject) => {
      try {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Firebase connections are automatically managed
        // Force refresh would just re-trigger observers
        resolve(true);
      } catch (error) {
        console.error("❌ Force refresh failed:", error);
        reject(error);
      }
    });
  },

  // === EXPORT/IMPORT METHODS ===

  export: function (storeNames = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          encrypt = false,
          includeMetadata = true,
          onProgress = null,
        } = options;

        // Get all data from specified stores
        const storesToExport = storeNames || await this.listStores();
        const exportData = {
          metadata: includeMetadata
            ? {
                source: "Firebase",
                config: this.config.projectId, // Don't export sensitive config
                exportDate: new Date().toISOString(),
                stores: storesToExport,
              }
            : null,
          data: {},
        };

        let completed = 0;
        const total = storesToExport.length;

        for (const storeName of storesToExport) {
          try {
            const storeData = await this.getAll(storeName);
            exportData.data[storeName] = storeData.data;

            completed++;
            if (onProgress) {
              onProgress({ completed, total, currentStore: storeName });
            }
          } catch (error) {
            console.warn(`Failed to export store "${storeName}":`, error);
          }
        }

        let result = exportData;
        if (encrypt && typeof nexaEncrypt !== 'undefined') {
          result = await nexaEncrypt.encryptJson(exportData);
        }

        resolve({
          success: true,
          data: result,
          size: JSON.stringify(result).length,
          stores: Object.keys(exportData.data),
        });
      } catch (error) {
        console.error("Firebase Export Error:", error);
        reject(error);
      }
    });
  },

  import: function (importData, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          decrypt = false,
          overwrite = false,
          onProgress = null,
        } = options;

        let data = importData;
        if (decrypt && typeof nexaEncrypt !== 'undefined') {
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
        console.error("Firebase Import Error:", error);
        reject(error);
      }
    });
  },

  exportToFile: function (filename = null, storeNames = null, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const exportResult = await this.export(storeNames, options);
        const data = exportResult.data;

        const fileName =
          filename ||
          `firebase_${this.config.projectId}_backup_${
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
          projectId: this.config.projectId,
        });
      } catch (error) {
        console.error("Firebase Export to File Error:", error);
        reject(error);
      }
    });
  },

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
            projectId: this.config.projectId,
          });
        } catch (error) {
          console.error("Firebase Import from File Error:", error);
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  },

  // === UTILITY METHODS ===

  getInfo: function () {
    return {
      projectId: this.config?.projectId,
      databaseURL: this.config?.databaseURL,
      isInitialized: !!this.database,
      autoMode: this.autoMode,
      activeObservers: Array.from(this.observers.keys()),
      activePolling: Array.from(this.pollingIntervals.keys()),
    };
  },

  hasStore: function (storeName) {
    // Firebase doesn't have a direct way to check if a "store" exists
    // We'll try to read from it and see if it has data
    return new Promise(async (resolve) => {
      try {
        const storeRef = ref(this.database, `NexaStoreDB/${storeName}`);
        const snapshot = await get(storeRef);
        resolve(snapshot.exists());
      } catch (error) {
        resolve(false);
      }
    });
  },

  listStores: function () {
    // Firebase doesn't have a direct way to list all "stores"
    // This would need to be maintained separately or discovered through data exploration
    return Promise.resolve([]);
  },

  cleanup: function () {
    // Stop all polling
    this.pollingIntervals.forEach((_, storeName) => {
      this.stopPolling(storeName);
    });

    // Clear observers and their Firebase listeners
    this.observers.forEach((observerMap, storeName) => {
      observerMap.forEach((observer, watchId) => {
        if (observer.unsubscribe) {
          observer.unsubscribe();
        }
      });
    });
    this.observers.clear();

    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  },

  getRealtimeStatus: function () {
    return {
      observers: Array.from(this.observers.keys()),
      polling: Array.from(this.pollingIntervals.keys()),
      broadcastChannel: !!this.broadcastChannel,
      tabId: this.tabId,
      firebaseConnected: !!this.database,
    };
  },

  // Create a safe interface that handles errors gracefully
  createSafeInterface: function () {
    const self = this;

    return {
      // Safe get method
      get: async function (storeName, key) {
        try {
          return await self.get(storeName, key);
        } catch (error) {
          console.error(`Safe get error for store "${storeName}":`, error);
          return null;
        }
      },

      // Safe getAll method
      getAll: async function (storeName) {
        try {
          return await self.getAll(storeName);
        } catch (error) {
          console.error(`Safe getAll error for store "${storeName}":`, error);
          return { data: [] };
        }
      },

      // Safe set method
      set: async function (storeName, data) {
        try {
          return await self.set(storeName, data);
        } catch (error) {
          console.error(`Safe set error for store "${storeName}":`, error);
          throw error;
        }
      },

      // Safe delete method
      delete: async function (storeName, key) {
        try {
          return await self.delete(storeName, key);
        } catch (error) {
          console.error(`Safe delete error for store "${storeName}":`, error);
          return false;
        }
      },

      // Expose other methods
      getLatest: (storeName, count) => self.getLatest(storeName, count),
      getOldest: (storeName, count) => self.getOldest(storeName, count),
      search: (storeName, query, fields) => self.search(storeName, query, fields),
      getByDateRange: (storeName, start, end) => self.getByDateRange(storeName, start, end),
      getAllIDs: (storeName) => self.getAllIDs(storeName),
      getIDs: (storeName, options) => self.getIDs(storeName, options),
      getInfo: () => self.getInfo(),
      hasStore: (storeName) => self.hasStore(storeName),
    };
  },

  // Generate unique ID for Firebase
  generateId: function() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Export default configuration function
export default function NexaFirebase(config) {
  const resolved = config !== undefined ? config : getFirebaseConfig();
  if (resolved == null) {
    return Promise.resolve(null);
  }
  const result = FirebaseManager.init(resolved);
  
  // Handle Promise if Firebase SDK needs to be loaded
  if (result && typeof result.then === 'function') {
    return result;
  }
  
  return Promise.resolve(result);
}

// Alternative exports (FirebaseManager sudah di-export di atas)

// Quick initialization with default config
export const initFirebase = () => NexaFirebase();

// Return config only
export const config = () => getFirebaseConfig();