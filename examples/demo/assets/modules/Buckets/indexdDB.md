# Nexa Storage — IndexedDB (panduan NexaStorage)

*NEXA STORAGE - INDEXEDDB DOCUMENTATION & USAGE GUIDE*

- @version 1.0.0
- @author Nexa Team
- @created 2025

Dokumentasi lengkap penggunaan IndexedDB dengan NexaStorage
Termasuk contoh-contoh praktis dan best practices

## Daftar isi

  - IMPORT DEPENDENCIES
- 1. INISIALISASI DATABASE
  - 1.1 AUTO MODE - Database otomatis membuat store saat dibutuhkan
  - 1.2 MANUAL MODE - Tentukan stores yang akan dibuat
  - 1.3 DYNAMIC STORE ADDITION - Tambah store secara dinamis
  - 2.1 CREATE/UPDATE DATA
  - 2.2 READ DATA
  - 2.3 DELETE DATA
- 3. OPERASI DATA LANJUTAN
  - 3.1 GET LATEST DATA
  - 3.2 GET OLDEST DATA
  - 3.3 DATE RANGE QUERIES
  - 3.4 SEARCH DATA
  - 4.1 WATCH DATA CHANGES
  - 4.2 AUTO REFRESH FROM API
  - 4.3 MANUAL REFRESH
  - 4.4 SIMPLE REFRESH - METODE TERMUDAH DAN TERCEPAT
  - 4.4 BATCH OPERATIONS
  - 5.1 DATABASE SIZE MONITORING
  - 5.2 AUTO SIZE MONITORING
  - 5.3 CLEANUP BY SIZE
- 6. EXPORT/IMPORT OPERATIONS
  - 6.1 EXPORT DATA
  - 6.2 IMPORT DATA
  - 6.3 IMPORT FROM FILE
  - 7.1 SAFE OPERATIONS
  - 8.1 DATABASE INFO & STATUS
  - 8.2 DATABASE RESET
  - 8.3 CLEANUP RESOURCES
  - 9.1 SYNC WITH LOCALSTORAGE
  - 10.1 COMPARE STORAGE SIZES
- 11. BEST PRACTICES & EXAMPLES
  - 11.1 COMPLETE USER MANAGEMENT EXAMPLE
- 1. Create users
- 2. Setup real-time watching
- 3. Search users
- 4. Get latest user
- 5. Update user
- 6. Export users for backup
- 7. Monitor size
  - 11.2 E-COMMERCE PRODUCT CATALOG EXAMPLE
- 1. Setup product catalog with auto-refresh
- 2. Setup categories
- 3. Search products
- 4. Get products by price range (simulate date range with custom logic)
- 5. Setup inventory monitoring
- 6. Simulate stock update
- 7. Export catalog for backup
- 12. ERROR HANDLING & DEBUGGING
  - 12.1 ERROR HANDLING PATTERNS
- 1. Safe initialization with fallback
- 2. Safe operations with error handling
- 3. Batch operations with error recovery
- 4. Connection monitoring
- 13. PERFORMANCE OPTIMIZATION
  - 13.1 PERFORMANCE BEST PRACTICES
- 1. Batch operations untuk data besar
- 2. Efficient querying
- 3. Memory management
- 4. Efficient watching (avoid too many observers)
- 14. TESTING & VALIDATION
  - 14.1 COMPREHENSIVE TESTING
  - 15.1 UPDATE MULTIPLE FIELDS
  - 15.2 UPDATE SINGLE FIELD
  - 15.3 UPDATE NESTED FIELDS
  - 15.4 MERGE DATA (SHALLOW & DEEP)
  - 15.5 BATCH UPDATE FIELDS
  - 15.6 REAL-WORLD E-COMMERCE EXAMPLE
  - 15.7 USER PROFILE MANAGEMENT EXAMPLE
  - 15.8 TESTING PARTIAL UPDATE METHODS
- 1. Basic operations
- 2. Advanced queries
- 3. Real-time features
- 4. Size management
- 5. Export/Import
- 6. Practical examples
- 7. Performance optimization
- 16. EXPORT FUNCTIONS FOR EXTERNAL USE
- 18. MULTIPLE TABLES/STORES MANAGEMENT
  - 18.1 MULTIPLE STORES DALAM SATU DATABASE
  - 18.2 DYNAMIC STORE CREATION (Auto Mode)
  - 18.3 MULTIPLE DATABASES DENGAN STORES BERBEDA
  - 18.4 CROSS-TABLE OPERATIONS
  - 18.5 STORE MANAGEMENT UTILITIES
  - 18.6 REAL-WORLD MULTI-TABLE EXAMPLE
- 1. Users table
- 2. Courses table
- 3. Enrollments table
- 4. Lessons table
- 5. Progress table
  - 18.7 TESTING MULTIPLE TABLES
  - 20.1 BASIC DUPLICATE - Duplikasi Sederhana
  - 20.2 DUPLICATE WITH MODIFICATIONS - Duplikasi dengan Modifikasi
  - 20.3 DUPLICATE WITH PRESERVED TIMESTAMPS - Duplikasi dengan Timestamp Asli
  - 20.4 DUPLICATE WITH OVERWRITE - Duplikasi dengan Overwrite
  - 20.5 BATCH DUPLICATE - Duplikasi Batch
  - 20.6 E-COMMERCE PRODUCT VARIANTS - Contoh Real-World
  - 20.7 USER TEMPLATES AND ROLES - Template User dari Role Existing
  - 20.8 TESTING DUPLICATE METHODS
- 19. CARA MENAMBAH TABEL BARU KE DATABASE YANG SUDAH ADA
  - 19.1 MENGGUNAKAN addStores() - Cara Termudah
- 1. Inisialisasi database dengan tabel awal
- 2. Tambah tabel baru menggunakan addStores()
- 3. Test tabel baru dengan menambah data
- 4. Verifikasi data
  - 19.2 MENAMBAH TABEL SATU PER SATU
  - 19.3 AUTO MODE - Tabel Dibuat Otomatis Saat Dibutuhkan
  - 19.4 MENAMBAH TABEL DENGAN VALIDASI
  - 19.5 MENAMBAH TABEL DENGAN BATCH OPERATION
  - 19.6 REAL-WORLD EXAMPLE: E-COMMERCE EXPANSION
  - 19.7 TESTING SEMUA METODE PENAMBAHAN TABEL

---

### IMPORT DEPENDENCIES

```js
    const defaultStores = [
        "nexaStore",
        "bucketsStore",
        "folderStructure",
        "activityLogs",
        "metadata",
        "recycleBin",
        "fileContents",
        "fileSettings",
        "presentations",
      ];
```

## 1. INISIALISASI DATABASE

```js
const dDB = NXUI.Storage();
```

### 1.1 AUTO MODE - Database otomatis membuat store saat dibutuhkan

```js
async function initAutoMode() {
  try {
    // Inisialisasi dengan auto mode (tanpa parameter store)
    await dDB.indexedDB.init("MyAppDB", 1);

    console.log("✅ Auto Mode initialized");
    console.log("Database info:", NXUI.ref.getInfo());
  } catch (error) {
    console.error("❌ Auto mode initialization failed:", error);
  }
}
```

### 1.2 MANUAL MODE - Tentukan stores yang akan dibuat

```js
async function initManualMode() {
  try {
    // Inisialisasi dengan stores yang sudah ditentukan
    await dDB.indexedDB.init("MyAppDB", 1, [
      "users",
      "products",
      "orders",
    ]);

    console.log("✅ Manual Mode initialized");
    console.log("Available stores:", NXUI.ref.getInfo().availableStores);
  } catch (error) {
    console.error("❌ Manual mode initialization failed:", error);
  }
}
```

### 1.3 DYNAMIC STORE ADDITION - Tambah store secara dinamis

```js
async function addNewStores() {
  try {
    await dDB.indexedDB.init("MyAppDB", 1, ["users"]);

    // Tambah stores baru
    await NXUI.ref.addStores(["products", "categories"]);

    console.log("✅ New stores added");
    console.log("Updated stores:", NXUI.ref.getInfo().availableStores);
  } catch (error) {
    console.error("❌ Failed to add stores:", error);
  }
}
```

2. OPERASI CRUD DASAR

### 2.1 CREATE/UPDATE DATA

```js
async function createUpdateData() {
  try {
    // Simpan data user
    const userId = await NXUI.ref.set("users", {
      id: "user_001",
      name: "John Doe",
      email: "john@example.com",
      role: "admin",
      profile: {
        avatar: "avatar.jpg",
        bio: "Software Developer",
      },
    });

    console.log("✅ User created with ID:", userId);

    // Update data yang sudah ada
    await NXUI.ref.set("users", {
      id: "user_001",
      name: "John Smith", // Updated name
      email: "john.smith@example.com", // Updated email
      role: "admin",
      profile: {
        avatar: "new_avatar.jpg",
        bio: "Senior Software Developer",
      },
    });

    console.log("✅ User updated successfully");
  } catch (error) {
    console.error("❌ Create/Update failed:", error);
  }
}
```

### 2.2 READ DATA

```js
async function readData() {
  try {
    // Get single record
    const user = await NXUI.ref.get("users", "user_001");
    console.log("👤 User data:", user);

    // Get all records from store
    const allUsers = await NXUI.ref.getAll("users");
    console.log("👥 All users:", allUsers.data);

    // Check if store exists
    const hasUsersStore = NXUI.ref.hasStore("users");
    console.log("🏪 Users store exists:", hasUsersStore);
  } catch (error) {
    console.error("❌ Read operation failed:", error);
  }
}
```

### 2.3 DELETE DATA

```js
async function deleteData() {
  try {
    // Delete single record
    const result = await NXUI.ref.delete("users", "user_001");
    console.log("🗑️ Delete result:", result);

    // Verify deletion
    const deletedUser = await NXUI.ref.get("users", "user_001");
    console.log("🔍 Deleted user (should be null):", deletedUser);
  } catch (error) {
    console.error("❌ Delete operation failed:", error);
  }
}
```

## 3. OPERASI DATA LANJUTAN

### 3.1 GET LATEST DATA

```js
async function getLatestData() {
  try {
    // Tambah beberapa data dengan timestamp berbeda
    await NXUI.ref.set("posts", {
      id: "post_1",
      title: "First Post",
      content: "Content 1",
    });
    await new Promise((resolve) => setTimeout(resolve, 100)); // Delay
    await NXUI.ref.set("posts", {
      id: "post_2",
      title: "Second Post",
      content: "Content 2",
    });
    await new Promise((resolve) => setTimeout(resolve, 100)); // Delay
    await NXUI.ref.set("posts", {
      id: "post_3",
      title: "Latest Post",
      content: "Content 3",
    });

    // Get latest single record
    const latestPost = await NXUI.ref.getLatest("posts", 1);
    console.log("📰 Latest post:", latestPost.data);

    // Get latest 2 records
    const latest2Posts = await NXUI.ref.getLatest("posts", 2);
    console.log("📰 Latest 2 posts:", latest2Posts.data);
  } catch (error) {
    console.error("❌ Get latest failed:", error);
  }
}
```

### 3.2 GET OLDEST DATA

```js
async function getOldestData() {
  try {
    // Get oldest single record
    const oldestPost = await NXUI.ref.getOldest("posts", 1);
    console.log("📜 Oldest post:", oldestPost.data);

    // Get oldest 2 records
    const oldest2Posts = await NXUI.ref.getOldest("posts", 2);
    console.log("📜 Oldest 2 posts:", oldest2Posts.data);
  } catch (error) {
    console.error("❌ Get oldest failed:", error);
  }
}
```

### 3.3 DATE RANGE QUERIES

```js
async function getByDateRange() {
  try {
    const startDate = new Date("2025-01-01");
    const endDate = new Date("2025-12-31");

    const postsInRange = await NXUI.ref.getByDateRange("posts", startDate, endDate);
    console.log("📅 Posts in date range:", postsInRange);
  } catch (error) {
    console.error("❌ Date range query failed:", error);
  }
}
```

### 3.4 SEARCH DATA

```js
async function searchData() {
  try {
    // Search in all fields
    const searchResults = await NXUI.ref.search("posts", "latest");
    console.log("🔍 Search results (all fields):", searchResults);

    // Search in specific fields
    const titleSearch = await NXUI.ref.search("posts", "first", ["title"]);
    console.log("🔍 Search results (title only):", titleSearch);
  } catch (error) {
    console.error("❌ Search failed:", error);
  }
}
```

4. REAL-TIME FEATURES

### 4.1 WATCH DATA CHANGES

```js
async function watchDataChanges() {
  try {
    // Setup watcher untuk perubahan data
    const unwatch = NXUI.ref.watch("users", (event) => {
      console.log("👁️ Data changed:", {
        store: event.storeName,
        changeType: event.changeType, // 'add', 'update', 'delete', 'refresh'
        data: event.data,
        timestamp: event.timestamp,
      });
    });

    // Test perubahan data
    await NXUI.ref.set("users", { id: "user_002", name: "Jane Doe" });
    await NXUI.ref.set("users", { id: "user_002", name: "Jane Smith" }); // Update
    await NXUI.ref.delete("users", "user_002"); // Delete

    // Stop watching setelah 10 detik
    setTimeout(() => {
      unwatch();
      console.log("🛑 Stopped watching users");
    }, 10000);
  } catch (error) {
    console.error("❌ Watch setup failed:", error);
  }
}
```

### 4.2 AUTO REFRESH FROM API

```js
async function setupAutoRefresh() {
  try {
    // Setup auto refresh dari API endpoint
    const pollId = await NXUI.ref.setupAutoRefresh("products", {
      strategy: "polling",
      endpoint: async () => {
        // Simulasi API call
        const response = await fetch("/api/products");
        return await response.json();
      },
      pollInterval: 30000, // 30 detik
      immediate: true,
    });

    console.log("🔄 Auto refresh setup with poll ID:", pollId);

    // Stop polling setelah 5 menit
    setTimeout(() => {
      NXUI.ref.stopPolling("products");
      console.log("🛑 Stopped auto refresh");
    }, 300000);
  } catch (error) {
    console.error("❌ Auto refresh setup failed:", error);
  }
}
```

### 4.3 MANUAL REFRESH

```js
async function manualRefresh() {
  try {
    // Refresh single table dari endpoint
    await NXUI.ref.refreshTable("products", async () => {
      // Fetch fresh data dari API
      const response = await fetch("/api/products");
      return await response.json();
    });

    console.log("🔄 Products refreshed from API");

    // Refresh semua tables (re-trigger observers)
    await NXUI.ref.refreshTable();
    console.log("🔄 All tables refreshed");
  } catch (error) {
    console.error("❌ Manual refresh failed:", error);
  }
}
```

### 4.4 SIMPLE REFRESH - METODE TERMUDAH DAN TERCEPAT

```js
async function simpleRefresh() {
  try {
    console.log("⚡ === SIMPLE REFRESH - SUPER MUDAH ===");

    // Setup sample data
    await NXUI.ref.set("users", { id: "user_1", name: "John", status: "active" });
    await NXUI.ref.set("products", { id: "prod_1", name: "Laptop", stock: 10 });
    await NXUI.ref.set("orders", { id: "order_1", total: 1000, status: "pending" });

    console.log("✅ Sample data created");

    // CARA PALING MUDAH - Refresh semua tabel
    await NXUI.ref.refresh();
    console.log("🔄 Semua tabel telah direfresh!");

    // REFRESH DENGAN API ENDPOINT
    await NXUI.ref.refresh("https://api.example.com/data", {
      onProgress: (progress) => {
        console.log(`📊 Progress: ${progress.completed}/${progress.total}`);
      },
    });
    console.log("🔄 Data direfresh dari API!");

    // REFRESH SINGLE TABLE - SUPER SIMPEL
    await NXUI.ref.refreshTable("users", "https://api.example.com/users");
    console.log("🔄 Users table direfresh dari API!");

    // REFRESH MANUAL TANPA API
    await NXUI.ref.refreshTable("products");
    console.log("🔄 Products table direfresh secara manual!");

  } catch (error) {
    console.error("❌ Simple refresh failed:", error);
  }
}
```

### 4.4 BATCH OPERATIONS

```js
async function batchOperations() {
  try {
    // Batch insert/update data
    const batchData = [
      { id: "product_1", name: "Laptop", price: 1000 },
      { id: "product_2", name: "Mouse", price: 25 },
      { id: "product_3", name: "Keyboard", price: 75 },
    ];

    await NXUI.ref.batchUpdate("products", batchData, {
      clearFirst: true, // Clear existing data first
      batchSize: 100, // Process 100 items per batch
      onProgress: (progress) => {
        console.log(`📦 Batch progress: ${progress.percentage}%`);
      },
    });

    console.log("✅ Batch operation completed");
  } catch (error) {
    console.error("❌ Batch operation failed:", error);
  }
}
```

5. SIZE MANAGEMENT

### 5.1 DATABASE SIZE MONITORING

```js
async function monitorDatabaseSize() {
  try {
    // Get current database size
    const sizeInfo = await NXUI.ref.getDatabaseSize();
    console.log("💾 Database size info:", sizeInfo);

    // Get specific store size
    const storeSize = await NXUI.ref.getStoreSize("users");
    console.log("📊 Users store size:", storeSize);

    // Get specific data size
    const dataSize = await NXUI.ref.getDataSize("users", "user_001");
    console.log("📏 Single user data size:", dataSize);

    // Get browser storage usage
    const storageUsage = await NXUI.ref.getStorageUsage();
    console.log("🌐 Browser storage usage:", storageUsage);
  } catch (error) {
    console.error("❌ Size monitoring failed:", error);
  }
}
```

### 5.2 AUTO SIZE MONITORING

```js
async function startSizeMonitoring() {
  try {
    // Start monitoring setiap 30 detik
    const stopMonitoring = NXUI.ref.monitorSize(30000);

    console.log("📊 Size monitoring started");

    // Stop monitoring setelah 5 menit
    setTimeout(() => {
      stopMonitoring();
      console.log("🛑 Size monitoring stopped");
    }, 300000);
  } catch (error) {
    console.error("❌ Size monitoring failed:", error);
  }
}
```

### 5.3 CLEANUP BY SIZE

```js
async function cleanupBySize() {
  try {
    // Cleanup jika store melebihi 10MB
    const cleanupResult = await NXUI.ref.cleanupBySize("logs", 10);
    console.log("🧹 Cleanup result:", cleanupResult);
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
}
```

## 6. EXPORT/IMPORT OPERATIONS

### 6.1 EXPORT DATA

```js
async function exportData() {
  try {
    // Export all stores
    const exportResult = await NXUI.ref.export();
    console.log("📤 Export result:", exportResult);

    // Export specific stores
    const specificExport = await NXUI.ref.export(["users", "products"], {
      encrypt: true,
      includeMetadata: true,
      onProgress: (progress) => {
        console.log(
          `📤 Export progress: ${progress.completed}/${progress.total}`
        );
      },
    });
    console.log("📤 Specific export:", specificExport);

    // Export to downloadable file
    await NXUI.ref.exportToFile("my_backup.json", ["users"], {
      encrypt: false,
      includeMetadata: true,
    });
    console.log("💾 Data exported to file");
  } catch (error) {
    console.error("❌ Export failed:", error);
  }
}
```

### 6.2 IMPORT DATA

```js
async function importData() {
  try {
    // Sample import data
    const importData = {
      metadata: {
        dbName: "MyAppDB",
        exportDate: new Date().toISOString(),
        stores: ["users"],
      },
      data: {
        users: [
          { id: "user_003", name: "Alice Johnson", email: "alice@example.com" },
          { id: "user_004", name: "Bob Wilson", email: "bob@example.com" },
        ],
      },
    };

    // Import data
    const importResult = await NXUI.ref.import(importData, {
      decrypt: false,
      overwrite: true,
      onProgress: (progress) => {
        console.log(
          `📥 Import progress: ${progress.completed}/${progress.total}`
        );
      },
    });
    console.log("📥 Import result:", importResult);
  } catch (error) {
    console.error("❌ Import failed:", error);
  }
}
```

### 6.3 IMPORT FROM FILE

```js
async function importFromFile() {
  try {
    // Create file input untuk demo
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";

    fileInput.onchange = async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          const importResult = await NXUI.ref.importFromFile(file, {
            decrypt: false,
            overwrite: true,
          });
          console.log("📥 File import result:", importResult);
        } catch (error) {
          console.error("❌ File import failed:", error);
        }
      }
    };

    // Trigger file selection
    fileInput.click();
  } catch (error) {
    console.error("❌ File import setup failed:", error);
  }
}
```

7. SAFE INTERFACE

### 7.1 SAFE OPERATIONS

```js
async function safeOperations() {
  try {
    // Get safe interface yang handle error secara otomatis
    const safe = NXUI.ref.safe();

    // Safe operations tidak akan throw error
    const user = await safe.get("nonexistent_store", "user_001"); // Returns null
    console.log("🛡️ Safe get result:", user);

    const allData = await safe.getAll("nonexistent_store"); // Returns { data: [] }
    console.log("🛡️ Safe getAll result:", allData);

    // Safe set akan create store jika belum ada
    await safe.set("new_store", { id: "item_001", name: "New Item" });
    console.log("🛡️ Safe set completed");

    // List available stores
    const stores = safe.listStores();
    console.log("🛡️ Available stores:", stores);
  } catch (error) {
    console.error("❌ Safe operations failed:", error);
  }
}
```

8. UTILITY FUNCTIONS

### 8.1 DATABASE INFO & STATUS

```js
async function getDatabaseInfo() {
  try {
    // Get database info
    const info = NXUI.ref.getInfo();
    console.log("ℹ️ Database info:", info);

    // Get real-time status
    const realtimeStatus = NXUI.ref.getRealtimeStatus();
    console.log("📡 Real-time status:", realtimeStatus);

    // Check if store exists
    const hasUsers = NXUI.ref.hasStore("users");
    console.log("🏪 Has users store:", hasUsers);
  } catch (error) {
    console.error("❌ Info retrieval failed:", error);
  }
}
```

### 8.2 DATABASE RESET

```js
async function resetDatabase() {
  try {
    // Reset entire database (CAUTION: This deletes all data!)
    await NXUI.ref.resetDatabase();
    console.log("🔄 Database reset completed");

    // Re-initialize after reset
    const newDb = await initAutoMode();
    console.log("✅ Database re-initialized");
  } catch (error) {
    console.error("❌ Database reset failed:", error);
  }
}
```

### 8.3 CLEANUP RESOURCES

```js
async function cleanupResources() {
  try {
    // Cleanup all real-time connections
    NXUI.ref.cleanup();
    console.log("🧹 Resources cleaned up");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
}
```

9. CROSS-STORAGE SYNC

### 9.1 SYNC WITH LOCALSTORAGE

```js
async function syncWithLocalStorage() {
  const storage = Storage();

  try {
    // Sync localStorage to IndexedDB
    const syncResult = await storage.sync.localStorageToIndexedDB({
      prefix: "app_",
      storeName: "localStorage_backup",
      overwrite: true,
      clearTarget: false,
    });
    console.log("🔄 LocalStorage to IndexedDB sync:", syncResult);

    // Sync IndexedDB to localStorage
    const reverseSyncResult = await storage.sync.indexedDBToLocalStorage(
      "users",
      {
        prefix: "backup_",
        overwrite: true,
        clearTarget: false,
      }
    );
    console.log("🔄 IndexedDB to localStorage sync:", reverseSyncResult);

    // Bidirectional sync
    const bidirectionalResult = await storage.sync.bidirectional("users", {
      localStoragePrefix: "sync_",
      strategy: "localStorage", // 'localStorage', 'indexedDB', 'newer'
    });
    console.log("🔄 Bidirectional sync:", bidirectionalResult);
  } catch (error) {
    console.error("❌ Sync failed:", error);
  }
}
```

10. STORAGE COMPARISON

### 10.1 COMPARE STORAGE SIZES

```js
async function compareStorages() {
  const storage = Storage();

  try {
    // Get sizes comparison
    const sizes = await storage.compare.getSizes();
    console.log("📊 Storage sizes comparison:", sizes);

    // Health check
    const health = await storage.compare.healthCheck();
    console.log("🏥 Storage health check:", health);
  } catch (error) {
    console.error("❌ Storage comparison failed:", error);
  }
}
```

## 11. BEST PRACTICES & EXAMPLES

### 11.1 COMPLETE USER MANAGEMENT EXAMPLE

```js
async function userManagementExample() {
  try {
    console.log("👥 === USER MANAGEMENT EXAMPLE ===");
```

## 1. Create users

```js
    const users = [
      {
        id: "admin_001",
        name: "Admin User",
        role: "admin",
        email: "admin@example.com",
      },
      {
        id: "user_001",
        name: "Regular User",
        role: "user",
        email: "user@example.com",
      },
      {
        id: "mod_001",
        name: "Moderator",
        role: "moderator",
        email: "mod@example.com",
      },
    ];

    for (const user of users) {
      await NXUI.ref.set("users", user);
    }
    console.log("✅ Users created");
```

## 2. Setup real-time watching

```js
    const unwatch = NXUI.ref.watch("users", (event) => {
      console.log(`👁️ User ${event.changeType}:`, event.data.name);
    });
```

## 3. Search users

```js
    const adminUsers = await NXUI.ref.search("users", "admin", ["role", "name"]);
    console.log("🔍 Admin users found:", adminUsers.found);
```

## 4. Get latest user

```js
    const latestUser = await NXUI.ref.getLatest("users", 1);
    console.log("👤 Latest user:", latestUser.data.name);
```

## 5. Update user

```js
    await NXUI.ref.set("users", {
      id: "user_001",
      name: "Updated Regular User",
      role: "user",
      email: "updated.user@example.com",
      lastLogin: new Date().toISOString(),
    });
```

## 6. Export users for backup

```js
    await NXUI.ref.exportToFile("users_backup.json", ["users"]);
    console.log("💾 Users exported to backup file");
```

## 7. Monitor size

```js
    const userStoreSize = await NXUI.ref.getStoreSize("users");
    console.log("📊 Users store size:", `${userStoreSize.sizeKB} KB`);

    // Cleanup
    setTimeout(() => {
      unwatch();
      console.log("🛑 Stopped watching users");
    }, 5000);
  } catch (error) {
    console.error("❌ User management example failed:", error);
  }
}
```

### 11.2 E-COMMERCE PRODUCT CATALOG EXAMPLE

```js
async function ecommerceExample() {
  try {
    console.log("🛒 === E-COMMERCE EXAMPLE ===");
```

## 1. Setup product catalog with auto-refresh

```js
    const products = [
      {
        id: "prod_001",
        name: "Laptop Gaming",
        category: "Electronics",
        price: 1500,
        stock: 10,
      },
      {
        id: "prod_002",
        name: "Wireless Mouse",
        category: "Accessories",
        price: 50,
        stock: 100,
      },
      {
        id: "prod_003",
        name: "Mechanical Keyboard",
        category: "Accessories",
        price: 120,
        stock: 50,
      },
    ];

    await NXUI.ref.batchUpdate("products", products, { clearFirst: true });
    console.log("✅ Product catalog initialized");
```

## 2. Setup categories

```js
    const categories = [
      { id: "cat_001", name: "Electronics", description: "Electronic devices" },
      {
        id: "cat_002",
        name: "Accessories",
        description: "Computer accessories",
      },
    ];

    await NXUI.ref.batchUpdate("categories", categories, { clearFirst: true });
    console.log("✅ Categories initialized");
```

## 3. Search products

```js
    const laptops = await NXUI.ref.search("products", "laptop", ["name", "category"]);
    console.log("💻 Laptops found:", laptops.found);
```

## 4. Get products by price range (simulate date range with custom logic)

```js
    const allProducts = await NXUI.ref.getAll("products");
    const expensiveProducts = allProducts.data.filter((p) => p.price > 100);
    console.log("💰 Expensive products:", expensiveProducts.length);
```

## 5. Setup inventory monitoring

```js
    const unwatchProducts = NXUI.ref.watch("products", (event) => {
      if (event.changeType === "update") {
        console.log(
          `📦 Product updated: ${event.data.name} - Stock: ${event.data.stock}`
        );
      }
    });
```

## 6. Simulate stock update

```js
    await NXUI.ref.set("products", {
      id: "prod_001",
      name: "Laptop Gaming",
      category: "Electronics",
      price: 1400, // Price reduced
      stock: 8, // Stock reduced
    });
```

## 7. Export catalog for backup

```js
    await NXUI.ref.exportToFile("catalog_backup.json", ["products", "categories"]);
    console.log("💾 Catalog exported");

    // Cleanup
    setTimeout(() => {
      unwatchProducts();
      console.log("🛑 Stopped watching products");
    }, 3000);
  } catch (error) {
    console.error("❌ E-commerce example failed:", error);
  }
}
```

## 12. ERROR HANDLING & DEBUGGING

### 12.1 ERROR HANDLING PATTERNS

```js
async function errorHandlingExamples() {
  try {
    console.log("🐛 === ERROR HANDLING EXAMPLES ===");
```

## 1. Safe initialization with fallback

```js
    try {
      await dDB.indexedDB.init("MyAppDB", 1);
    } catch (error) {
      console.warn("⚠️ IndexedDB failed, falling back to localStorage");
      // Fallback to localStorage
      const storage = Storage();
      return storage.localStorage;
    }
```

## 2. Safe operations with error handling

```js
    try {
      const user = await NXUI.ref.get("users", "nonexistent_user");
      console.log("User found:", user || "No user found");
    } catch (error) {
      console.error("Failed to get user:", error.message);
    }
```

## 3. Batch operations with error recovery

```js
    const batchData = [
      { id: "valid_001", name: "Valid Item 1" },
      {
        /* invalid data */
      },
      { id: "valid_002", name: "Valid Item 2" },
    ];

    for (const item of batchData) {
      try {
        if (item.id && item.name) {
          await NXUI.ref.set("items", item);
          console.log("✅ Item saved:", item.id);
        } else {
          console.warn("⚠️ Invalid item skipped:", item);
        }
      } catch (error) {
        console.error("❌ Failed to save item:", error.message);
      }
    }
```

## 4. Connection monitoring

```js
    const realtimeStatus = NXUI.ref.getRealtimeStatus();
    if (!realtimeStatus.broadcastChannel) {
      console.warn("⚠️ Cross-tab sync not available");
    }
  } catch (error) {
    console.error("❌ Error handling example failed:", error);
  }
}
```

## 13. PERFORMANCE OPTIMIZATION

### 13.1 PERFORMANCE BEST PRACTICES

```js
async function performanceOptimization() {
  try {
    console.log("⚡ === PERFORMANCE OPTIMIZATION ===");
```

## 1. Batch operations untuk data besar

```js
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      id: `item_${i}`,
      name: `Item ${i}`,
      data: `Large data content ${i}`.repeat(100),
    }));

    console.time("Batch Insert");
    await NXUI.ref.batchUpdate("large_items", largeDataset, {
      batchSize: 100, // Process 100 items at a time
      onProgress: (progress) => {
        if (progress.percentage % 20 === 0) {
          console.log(`📊 Progress: ${progress.percentage}%`);
        }
      },
    });
    console.timeEnd("Batch Insert");
```

## 2. Efficient querying

```js
    console.time("Latest Query");
    const latest10 = await NXUI.ref.getLatest("large_items", 10);
    console.timeEnd("Latest Query");
    console.log("📊 Latest 10 items retrieved");
```

## 3. Memory management

```js
    const sizeInfo = await NXUI.ref.getStoreSize("large_items");
    console.log("💾 Store size:", `${sizeInfo.sizeMB} MB`);

    if (parseFloat(sizeInfo.sizeMB) > 5) {
      console.log("🧹 Store is large, consider cleanup");
      await NXUI.ref.cleanupBySize("large_items", 3); // Keep under 3MB
    }
```

## 4. Efficient watching (avoid too many observers)

```js
    let changeCount = 0;
    const unwatch = NXUI.ref.watch("large_items", (event) => {
      changeCount++;
      if (changeCount % 100 === 0) {
        console.log(`👁️ Processed ${changeCount} changes`);
      }
    });

    // Cleanup
    setTimeout(() => {
      unwatch();
      console.log("🛑 Stopped watching large items");
    }, 5000);
  } catch (error) {
    console.error("❌ Performance optimization failed:", error);
  }
}
```

## 14. TESTING & VALIDATION

### 14.1 COMPREHENSIVE TESTING

```js
async function runTests() {
  console.log("🧪 === RUNNING COMPREHENSIVE TESTS ===");

  const tests = [
    { name: "Auto Mode Initialization", fn: initAutoMode },
    { name: "Manual Mode Initialization", fn: initManualMode },
    { name: "CRUD Operations", fn: createUpdateData },
    { name: "Data Queries", fn: getLatestData },
    { name: "Search Functionality", fn: searchData },
    { name: "Real-time Watching", fn: watchDataChanges },
    { name: "Size Management", fn: monitorDatabaseSize },
    { name: "Export/Import", fn: exportData },
    { name: "Safe Operations", fn: safeOperations },
    { name: "Cross-storage Sync", fn: syncWithLocalStorage },
    { name: "User Management Example", fn: userManagementExample },
    { name: "E-commerce Example", fn: ecommerceExample },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`🧪 Running test: ${test.name}`);
      await test.fn();
      results.push({ name: test.name, status: "PASSED" });
      console.log(`✅ ${test.name} - PASSED`);
    } catch (error) {
      results.push({ name: test.name, status: "FAILED", error: error.message });
      console.error(`❌ ${test.name} - FAILED:`, error.message);
    }
  }

  // Test summary
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log("\n📊 === TEST SUMMARY ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`
  );

  return results;
}
```

15. PARTIAL UPDATE METHODS - UPDATE FIELD TERTENTU SAJA

### 15.1 UPDATE MULTIPLE FIELDS

```js
async function updateMultipleFields() {
  try {
    console.log("📝 === UPDATE MULTIPLE FIELDS ===");

    // Setup initial user data
    await NXUI.ref.set("users", {
      id: "user_001",
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      role: "user",
      profile: {
        avatar: "avatar.jpg",
        bio: "Software Developer",
        location: "Jakarta",
      },
      settings: {
        theme: "light",
        notifications: true,
        language: "id",
      },
    });

    console.log("✅ Initial user data created");

    // Update hanya beberapa field
    await NXUI.ref.updateFields("users", "user_001", {
      email: "john.new@example.com",
      age: 31,
      role: "admin",
    });

    console.log("✅ Multiple fields updated successfully");

    // Verify update
    const updatedUser = await NXUI.ref.get("users", "user_001");
    console.log("👤 Updated user:", updatedUser);

    return updatedUser;
  } catch (error) {
    console.error("❌ Update multiple fields failed:", error);
  }
}
```

### 15.2 UPDATE SINGLE FIELD

```js
async function updateSingleField() {
  try {
    console.log("🎯 === UPDATE SINGLE FIELD ===");

    // Update hanya satu field
    await NXUI.ref.updateField(
      "users",
      "user_001",
      "email",
      "updated.email@example.com"
    );
    console.log("✅ Email updated");

    await NXUI.ref.updateField("users", "user_001", "age", 32);
    console.log("✅ Age updated");

    await NXUI.ref.updateField("users", "user_001", "role", "super_admin");
    console.log("✅ Role updated");

    // Verify updates
    const user = await NXUI.ref.get("users", "user_001");
    console.log("👤 User after single field updates:", {
      email: user.email,
      age: user.age,
      role: user.role,
    });

    return user;
  } catch (error) {
    console.error("❌ Update single field failed:", error);
  }
}
```

### 15.3 UPDATE NESTED FIELDS

```js
async function updateNestedFields() {
  try {
    console.log("🔗 === UPDATE NESTED FIELDS ===");

    // Update nested fields using dot notation
    await NXUI.ref.updateNestedField(
      "users",
      "user_001",
      "profile.bio",
      "Senior Software Developer"
    );
    console.log("✅ Profile bio updated");

    await NXUI.ref.updateNestedField(
      "users",
      "user_001",
      "profile.location",
      "Bandung"
    );
    console.log("✅ Profile location updated");

    await NXUI.ref.updateNestedField("users", "user_001", "settings.theme", "dark");
    console.log("✅ Settings theme updated");

    await NXUI.ref.updateNestedField(
      "users",
      "user_001",
      "settings.notifications",
      false
    );
    console.log("✅ Settings notifications updated");

    // Verify nested updates
    const user = await NXUI.ref.get("users", "user_001");
    console.log("👤 User after nested updates:", {
      profile: user.profile,
      settings: user.settings,
    });

    return user;
  } catch (error) {
    console.error("❌ Update nested fields failed:", error);
  }
}
```

### 15.4 MERGE DATA (SHALLOW & DEEP)

```js
async function mergeDataExample() {
  try {
    console.log("🔄 === MERGE DATA EXAMPLE ===");

    // Shallow merge - hanya level pertama
    await NXUI.ref.mergeData("users", "user_001", {
      status: "active",
      lastLogin: new Date().toISOString(),
      loginCount: 1,
    });
    console.log("✅ Shallow merge completed");

    // Deep merge - merge nested objects juga
    await NXUI.ref.mergeData(
      "users",
      "user_001",
      {
        profile: {
          bio: "Expert Software Developer",
          skills: ["JavaScript", "React", "Node.js"],
        },
        settings: {
          language: "en",
          timezone: "Asia/Jakarta",
        },
      },
      { deepMerge: true }
    );
    console.log("✅ Deep merge completed");

    // Merge dengan create if not exists
    await NXUI.ref.mergeData(
      "users",
      "user_002",
      {
        name: "Jane Smith",
        email: "jane@example.com",
        profile: {
          bio: "UI/UX Designer",
          location: "Jakarta",
        },
      },
      { createIfNotExists: true }
    );
    console.log("✅ Merge with create completed");

    // Verify merge results
    const user1 = await NXUI.ref.get("users", "user_001");
    const user2 = await NXUI.ref.get("users", "user_002");

    console.log("👤 User 1 after merge:", user1);
    console.log("👤 User 2 (new):", user2);

    return { user1, user2 };
  } catch (error) {
    console.error("❌ Merge data failed:", error);
  }
}
```

### 15.5 BATCH UPDATE FIELDS

```js
async function batchUpdateFieldsExample() {
  try {
    console.log("📦 === BATCH UPDATE FIELDS ===");

    // Setup multiple users
    const users1 = [
      {
        id: "user_003",
        name: "Alice Johnson",
        role: "user",
        status: "pending",
      },
      { id: "user_004", name: "Bob Wilson", role: "user", status: "pending" },
      { id: "user_005", name: "Carol Brown", role: "user", status: "pending" },
    ];

    for (const user of users) {
      await NXUI.ref.set("users", user);
    }
    console.log("✅ Multiple users created");

    // Batch update dengan berbagai perubahan
    const batchUpdates = [
      { id: "user_003", fields: { status: "active", role: "moderator" } },
      {
        id: "user_004",
        fields: { status: "active", email: "bob@example.com" },
      },
      { id: "user_005", fields: { status: "inactive", role: "admin" } },
    ];

    const result = await NXUI.ref.batchUpdateFields("users", batchUpdates, {
      onProgress: (progress) => {
        console.log(`📊 Batch progress: ${progress.percentage}%`);
      },
    });

    console.log("✅ Batch update completed:", result);

    // Verify batch updates
    for (const update of batchUpdates) {
      const user = await NXUI.ref.get("users", update.id);
      console.log(`👤 ${update.id}:`, {
        status: user.status,
        role: user.role,
        email: user.email,
      });
    }

    return result;
  } catch (error) {
    console.error("❌ Batch update fields failed:", error);
  }
}
```

### 15.6 REAL-WORLD E-COMMERCE EXAMPLE

```js
async function ecommercePartialUpdateExample() {
  try {
    console.log("🛒 === E-COMMERCE PARTIAL UPDATE EXAMPLE ===");

    // Setup product data
    await NXUI.ref.set("products", {
      id: "prod_001",
      name: "Laptop Gaming",
      price: 15000000,
      stock: 10,
      category: "Electronics",
      specs: {
        processor: "Intel i7",
        ram: "16GB",
        storage: "512GB SSD",
      },
      status: "active",
      ratings: {
        average: 4.5,
        count: 25,
      },
    });

    console.log("✅ Product created");

    // Scenario 1: Update stock after purchase
    await NXUI.ref.updateField("products", "prod_001", "stock", 8);
    console.log("📦 Stock updated after purchase");

    // Scenario 2: Price discount
    await NXUI.ref.updateField("products", "prod_001", "price", 13500000);
    console.log("💰 Price updated (discount applied)");

    // Scenario 3: Update specs
    await NXUI.ref.updateNestedField("products", "prod_001", "specs.ram", "32GB");
    await NXUI.ref.updateNestedField(
      "products",
      "prod_001",
      "specs.storage",
      "1TB SSD"
    );
    console.log("⚙️ Product specs upgraded");

    // Scenario 4: New rating received
    await NXUI.ref.mergeData(
      "products",
      "prod_001",
      {
        ratings: {
          average: 4.7,
          count: 26,
          lastReview: new Date().toISOString(),
        },
      },
      { deepMerge: true }
    );
    console.log("⭐ New rating added");

    // Scenario 5: Batch update multiple products
    const productUpdates = [
      { id: "prod_001", fields: { featured: true, discount: 10 } },
    ];

    await NXUI.ref.batchUpdateFields("products", productUpdates);
    console.log("🎯 Product featured and discount applied");

    // Final product state
    const finalProduct = await NXUI.ref.get("products", "prod_001");
    console.log("📦 Final product state:", finalProduct);

    return finalProduct;
  } catch (error) {
    console.error("❌ E-commerce partial update failed:", error);
  }
}
```

### 15.7 USER PROFILE MANAGEMENT EXAMPLE

```js
async function userProfilePartialUpdateExample() {
  try {
    console.log("👤 === USER PROFILE PARTIAL UPDATE ===");

    // Setup user profile
    await NXUI.ref.set("profiles", {
      id: "profile_001",
      userId: "user_001",
      personalInfo: {
        firstName: "John",
        lastName: "Doe",
        birthDate: "1990-01-01",
        phone: "+62812345678",
      },
      address: {
        street: "Jl. Sudirman No. 1",
        city: "Jakarta",
        province: "DKI Jakarta",
        postalCode: "10110",
      },
      preferences: {
        language: "id",
        timezone: "Asia/Jakarta",
        newsletter: true,
        notifications: {
          email: true,
          push: false,
          sms: true,
        },
      },
      social: {
        facebook: "",
        twitter: "",
        linkedin: "",
      },
    });

    console.log("✅ User profile created");

    // Update personal info
    await NXUI.ref.updateNestedField(
      "profiles",
      "profile_001",
      "personalInfo.phone",
      "+628123456789"
    );
    console.log("📱 Phone number updated");

    // Update address
    await NXUI.ref.mergeData(
      "profiles",
      "profile_001",
      {
        address: {
          street: "Jl. Thamrin No. 5",
          city: "Jakarta",
        },
      },
      { deepMerge: true }
    );
    console.log("🏠 Address partially updated");

    // Update notification preferences
    await NXUI.ref.updateNestedField(
      "profiles",
      "profile_001",
      "preferences.notifications.push",
      true
    );
    await NXUI.ref.updateNestedField(
      "profiles",
      "profile_001",
      "preferences.language",
      "en"
    );
    console.log("⚙️ Preferences updated");

    // Add social media links
    await NXUI.ref.updateFields("profiles", "profile_001", {
      "social.linkedin": "https://linkedin.com/in/johndoe",
      "social.twitter": "@johndoe",
    });
    console.log("🔗 Social media links added");

    // Final profile state
    const finalProfile = await NXUI.ref.get("profiles", "profile_001");
    console.log("👤 Final profile state:", finalProfile);

    return finalProfile;
  } catch (error) {
    console.error("❌ User profile partial update failed:", error);
  }
}
```

### 15.8 TESTING PARTIAL UPDATE METHODS

```js
async function testPartialUpdateMethods() {
  console.log("🧪 === TESTING PARTIAL UPDATE METHODS ===");

  const tests = [
    { name: "Update Multiple Fields", fn: updateMultipleFields },
    { name: "Update Single Field", fn: updateSingleField },
    { name: "Update Nested Fields", fn: updateNestedFields },
    { name: "Merge Data Example", fn: mergeDataExample },
    { name: "Batch Update Fields", fn: batchUpdateFieldsExample },
    { name: "E-commerce Partial Update", fn: ecommercePartialUpdateExample },
    {
      name: "User Profile Partial Update",
      fn: userProfilePartialUpdateExample,
    },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n🧪 Testing: ${test.name}`);
      console.log("=".repeat(50));
      await test.fn();
      results.push({ name: test.name, status: "PASSED" });
      console.log(`✅ ${test.name} - PASSED`);
    } catch (error) {
      results.push({ name: test.name, status: "FAILED", error: error.message });
      console.error(`❌ ${test.name} - FAILED:`, error.message);
    }
  }

  // Test summary
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log("\n📊 === PARTIAL UPDATE TEST SUMMARY ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`
  );

  return results;
}
```

16. MAIN DEMO FUNCTION

```js

// Main demo function yang menjalankan semua contoh
async function runCompleteDemo() {
  console.log("🚀 === NEXA STORAGE INDEXEDDB COMPLETE DEMO ===\n");

  try {
```

## 1. Basic operations

```js
    console.log("1️⃣ Basic Operations");
    await initAutoMode();
    await createUpdateData();
    await readData();
```

## 2. Advanced queries

```js
    console.log("\n2️⃣ Advanced Queries");
    await getLatestData();
    await searchData();
```

## 3. Real-time features

```js
    console.log("\n3️⃣ Real-time Features");
    await watchDataChanges();
    await simpleRefresh();
    await batchOperations();
```

## 4. Size management

```js
    console.log("\n4️⃣ Size Management");
    await monitorDatabaseSize();
```

## 5. Export/Import

```js
    console.log("\n5️⃣ Export/Import");
    await exportData();
    await importData();
```

## 6. Practical examples

```js
    console.log("\n6️⃣ Practical Examples");
    await userManagementExample();
    await ecommerceExample();
```

## 7. Performance optimization

```js
    console.log("\n7️⃣ Performance Optimization");
    await performanceOptimization();

    console.log("\n🎉 === DEMO COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}
```

## 16. EXPORT FUNCTIONS FOR EXTERNAL USE

```js

// Export semua functions untuk digunakan di tempat lain
export {
  // Initialization
  initAutoMode,
  initManualMode,
  addNewStores,

  // CRUD Operations
  createUpdateData,
  readData,
  deleteData,

  // Advanced Queries
  getLatestData,
  getOldestData,
  getByDateRange,
  searchData,

  // Real-time Features
  watchDataChanges,
  setupAutoRefresh,
  manualRefresh,
  simpleRefresh,
  batchOperations,

  // Size Management
  monitorDatabaseSize,
  startSizeMonitoring,
  cleanupBySize,

  // Export/Import
  exportData,
  importData,
  importFromFile,

  // Safe Interface
  safeOperations,

  // Utilities
  getDatabaseInfo,
  resetDatabase,
  cleanupResources,

  // Cross-storage
  syncWithLocalStorage,
  compareStorages,

  // Examples
  userManagementExample,
  ecommerceExample,

  // Testing
  errorHandlingExamples,
  performanceOptimization,
  runTests,
  runCompleteDemo,

  // Partial Update Methods
  updateMultipleFields,
  updateSingleField,
  updateNestedFields,
  mergeDataExample,
  batchUpdateFieldsExample,
  ecommercePartialUpdateExample,
  userProfilePartialUpdateExample,
  testPartialUpdateMethods,
};
```

17. AUTO-RUN DEMO (OPTIONAL)

```js

// Uncomment baris di bawah untuk menjalankan demo otomatis saat file di-load
// runCompleteDemo();
```

## 18. MULTIPLE TABLES/STORES MANAGEMENT

JAWABAN: YA! NexaStorage dapat membuka dan mengelola multiple tabel
yang berbeda dari tabel aslinya dengan berbagai cara:

### 18.1 MULTIPLE STORES DALAM SATU DATABASE

```js
async function multipleStoresExample() {
  try {
    console.log("🗂️ === MULTIPLE STORES EXAMPLE ===");

    // Inisialisasi dengan multiple stores sekaligus
    await dDB.indexedDB.init("MyAppDB", 1, [
      "users", // Tabel user
      "products", // Tabel produk
      "orders", // Tabel pesanan
      "categories", // Tabel kategori
      "reviews", // Tabel review
      "settings", // Tabel pengaturan
      "logs", // Tabel log
    ]);

    console.log("✅ Multiple stores initialized");
    console.log("Available stores:", NXUI.ref.getInfo().availableStores);

    // Operasi pada tabel yang berbeda-beda
    await NXUI.ref.set("users", { id: "user_1", name: "John Doe", role: "admin" });
    await NXUI.ref.set("products", { id: "prod_1", name: "Laptop", price: 1000 });
    await NXUI.ref.set("orders", {
      id: "order_1",
      userId: "user_1",
      productId: "prod_1",
      total: 1000,
    });
    await NXUI.ref.set("categories", { id: "cat_1", name: "Electronics" });
    await NXUI.ref.set("reviews", {
      id: "rev_1",
      productId: "prod_1",
      rating: 5,
      comment: "Great!",
    });
    await NXUI.ref.set("settings", { id: "theme", value: "dark" });
    await NXUI.ref.set("logs", {
      id: "log_1",
      action: "user_login",
      timestamp: new Date(),
    });

    console.log("✅ Data inserted into different stores");

    // Baca data dari tabel berbeda
    const user = await NXUI.ref.get("users", "user_1");
    const product = await NXUI.ref.get("products", "prod_1");
    const order = await NXUI.ref.get("orders", "order_1");

    console.log("👤 User:", user);
    console.log("📦 Product:", product);
    console.log("🛒 Order:", order);

  } catch (error) {
    console.error("❌ Multiple stores example failed:", error);
  }
}
```

### 18.2 DYNAMIC STORE CREATION (Auto Mode)

```js
async function dynamicStoreCreation() {
  try {
    console.log("🔄 === DYNAMIC STORE CREATION ===");

    // Auto mode - stores dibuat otomatis saat dibutuhkan
    await dDB.indexedDB.init("DynamicDB", 1); // Tanpa parameter stores

    // Buat tabel baru secara dinamis saat runtime
    await NXUI.ref.set("customers", {
      id: "cust_1",
      name: "Alice",
      email: "alice@example.com",
    });
    await NXUI.ref.set("suppliers", {
      id: "supp_1",
      name: "Tech Corp",
      contact: "tech@corp.com",
    });
    await NXUI.ref.set("inventory", { id: "inv_1", item: "Mouse", quantity: 100 });
    await NXUI.ref.set("transactions", { id: "trans_1", type: "sale", amount: 50 });

    console.log("✅ Dynamic stores created automatically");
    console.log("New stores:", NXUI.ref.listStores());

    // Tambah stores baru kapan saja
    await NXUI.ref.set("analytics", {
      id: "analytics_1",
      pageViews: 1000,
      visitors: 250,
    });
    await NXUI.ref.set("notifications", {
      id: "notif_1",
      message: "Welcome!",
      read: false,
    });

    console.log("✅ Additional stores added");
    console.log("Updated stores:", NXUI.ref.listStores());

  } catch (error) {
    console.error("❌ Dynamic store creation failed:", error);
  }
}
```

### 18.3 MULTIPLE DATABASES DENGAN STORES BERBEDA

```js
async function multipleDatabases() {
  try {
    console.log("🗄️ === MULTIPLE DATABASES ===");

    // Database untuk aplikasi utama
    await dDB.indexedDB.init("MainAppDB", 1, [
      "users",
      "posts",
      "comments",
    ]);

    // Database untuk e-commerce
    await dDB.indexedDB.init("EcommerceDB", 1, [
      "products",
      "orders",
      "payments",
      "shipping",
    ]);

    // Database untuk analytics
    await dDB.indexedDB.init("AnalyticsDB", 1, [
      "pageviews",
      "events",
      "conversions",
      "reports",
    ]);

    // Database untuk cache
    await dDB.indexedDB.init("CacheDB", 1, [
      "api_cache",
      "image_cache",
      "user_sessions",
    ]);

    console.log("✅ Multiple databases initialized");

    // Operasi pada database berbeda
    await NXUI.ref.set("users", { id: "user_1", name: "John" });
    await NXUI.ref.set("products", { id: "prod_1", name: "Laptop" });
    await NXUI.ref.set("pageviews", {
      id: "pv_1",
      page: "/home",
      views: 100,
    });
    await NXUI.ref.set("api_cache", {
      id: "cache_1",
      endpoint: "/api/users",
      data: [],
    });

    console.log("✅ Data stored in different databases");
  } catch (error) {
    console.error("❌ Multiple databases failed:", error);
  }
}
```

### 18.4 CROSS-TABLE OPERATIONS

```js
async function crossTableOperations() {
  try {
    console.log("🔗 === CROSS-TABLE OPERATIONS ===");

    await dDB.indexedDB.init("CrossTableDB", 1);

    // Setup data relasional
    await NXUI.ref.set("users", {
      id: "user_1",
      name: "John Doe",
      email: "john@example.com",
    });
    await NXUI.ref.set("users", {
      id: "user_2",
      name: "Jane Smith",
      email: "jane@example.com",
    });

    await NXUI.ref.set("products", {
      id: "prod_1",
      name: "Laptop",
      price: 1000,
      categoryId: "cat_1",
    });
    await NXUI.ref.set("products", {
      id: "prod_2",
      name: "Mouse",
      price: 25,
      categoryId: "cat_2",
    });

    await NXUI.ref.set("categories", { id: "cat_1", name: "Electronics" });
    await NXUI.ref.set("categories", { id: "cat_2", name: "Accessories" });

    await NXUI.ref.set("orders", {
      id: "order_1",
      userId: "user_1",
      productId: "prod_1",
      quantity: 1,
    });
    await NXUI.ref.set("orders", {
      id: "order_2",
      userId: "user_2",
      productId: "prod_2",
      quantity: 2,
    });

    console.log("✅ Relational data setup complete");

    // Query cross-table (manual join)
    const orders = await NXUI.ref.getAll("orders");
    const users = await NXUI.ref.getAll("users");
    const products = await NXUI.ref.getAll("products");

    // Join data dari multiple tables
    const orderDetails = orders.data.map((order) => {
      const user = users.data.find((u) => u.id === order.userId);
      const product = products.data.find((p) => p.id === order.productId);

      return {
        orderId: order.id,
        customerName: user?.name,
        customerEmail: user?.email,
        productName: product?.name,
        productPrice: product?.price,
        quantity: order.quantity,
        total: (product?.price || 0) * order.quantity,
      };
    });

    console.log("🔗 Cross-table query results:", orderDetails);

    return orderDetails;
  } catch (error) {
    console.error("❌ Cross-table operations failed:", error);
  }
}
```

### 18.5 STORE MANAGEMENT UTILITIES

```js
async function storeManagementUtilities() {
  try {
    console.log("🛠️ === STORE MANAGEMENT UTILITIES ===");

    await dDB.indexedDB.init("ManagementDB", 1);

    // Buat beberapa stores dengan data
    await NXUI.ref.set("table_a", { id: "a1", data: "Data A1" });
    await NXUI.ref.set("table_b", { id: "b1", data: "Data B1" });
    await NXUI.ref.set("table_c", { id: "c1", data: "Data C1" });

    // List semua stores
    const allStores = NXUI.ref.listStores();
    console.log("📋 All stores:", allStores);

    // Check store existence
    console.log("🔍 table_a exists:", NXUI.ref.hasStore("table_a"));
    console.log("🔍 table_d exists:", NXUI.ref.hasStore("table_d"));

    // Get store sizes
    for (const storeName of allStores) {
      const storeSize = await NXUI.ref.getStoreSize(storeName);
      console.log(`📊 ${storeName} size:`, `${storeSize.sizeKB} KB`);
    }

    // Export specific stores
    const exportResult = await NXUI.ref.export(["table_a", "table_b"], {
      includeMetadata: true,
    });
    console.log("📤 Exported stores:", Object.keys(exportResult.data));

    // Database info
    const dbInfo = NXUI.ref.getInfo();
    console.log("ℹ️ Database info:", dbInfo);

  } catch (error) {
    console.error("❌ Store management failed:", error);
  }
}
```

### 18.6 REAL-WORLD MULTI-TABLE EXAMPLE

```js
async function realWorldMultiTableExample() {
  try {
    console.log("🌍 === REAL-WORLD MULTI-TABLE EXAMPLE ===");

    // Simulasi aplikasi e-learning dengan multiple tables
    await dDB.indexedDB.init("ELearningDB", 1);

    // Setup data untuk berbagai tabel
```

## 1. Users table

```js
    await NXUI.ref.batchUpdate("users", [
      {
        id: "user_1",
        name: "John Student",
        role: "student",
        email: "john@student.com",
      },
      {
        id: "user_2",
        name: "Jane Teacher",
        role: "teacher",
        email: "jane@teacher.com",
      },
      {
        id: "user_3",
        name: "Bob Admin",
        role: "admin",
        email: "bob@admin.com",
      },
    ]);
```

## 2. Courses table

```js
    await NXUI.ref.batchUpdate("courses", [
      {
        id: "course_1",
        title: "JavaScript Basics",
        teacherId: "user_2",
        duration: "4 weeks",
      },
      {
        id: "course_2",
        title: "React Advanced",
        teacherId: "user_2",
        duration: "6 weeks",
      },
    ]);
```

## 3. Enrollments table

```js
    await NXUI.ref.batchUpdate("enrollments", [
      {
        id: "enroll_1",
        userId: "user_1",
        courseId: "course_1",
        enrollDate: new Date(),
      },
      {
        id: "enroll_2",
        userId: "user_1",
        courseId: "course_2",
        enrollDate: new Date(),
      },
    ]);
```

## 4. Lessons table

```js
    await NXUI.ref.batchUpdate("lessons", [
      { id: "lesson_1", courseId: "course_1", title: "Variables", order: 1 },
      { id: "lesson_2", courseId: "course_1", title: "Functions", order: 2 },
      { id: "lesson_3", courseId: "course_2", title: "Components", order: 1 },
    ]);
```

## 5. Progress table

```js
    await NXUI.ref.batchUpdate("progress", [
      {
        id: "prog_1",
        userId: "user_1",
        lessonId: "lesson_1",
        completed: true,
        score: 95,
      },
      {
        id: "prog_2",
        userId: "user_1",
        lessonId: "lesson_2",
        completed: false,
        score: 0,
      },
    ]);

    console.log("✅ E-learning database setup complete");
    console.log("📚 Available tables:", NXUI.ref.listStores());

    // Complex query: Get student progress report
    const users = await NXUI.ref.getAll("users");
    const courses = await NXUI.ref.getAll("courses");
    const enrollments = await NXUI.ref.getAll("enrollments");
    const lessons = await NXUI.ref.getAll("lessons");
    const progress = await NXUI.ref.getAll("progress");

    const studentReport = users.data
      .filter((user) => user.role === "student")
      .map((student) => {
        const studentEnrollments = enrollments.data.filter(
          (e) => e.userId === student.id
        );
        const studentCourses = studentEnrollments.map((enrollment) => {
          const course = courses.data.find((c) => c.id === enrollment.courseId);
          const courseLessons = lessons.data.filter(
            (l) => l.courseId === course.id
          );
          const studentProgress = progress.data.filter(
            (p) =>
              p.userId === student.id &&
              courseLessons.some((l) => l.id === p.lessonId)
          );

          const completedLessons = studentProgress.filter(
            (p) => p.completed
          ).length;
          const totalLessons = courseLessons.length;
          const averageScore =
            studentProgress.length > 0
              ? studentProgress.reduce((sum, p) => sum + p.score, 0) /
                studentProgress.length
              : 0;

          return {
            courseTitle: course.title,
            progress: `${completedLessons}/${totalLessons}`,
            averageScore: averageScore.toFixed(1),
          };
        });

        return {
          studentName: student.name,
          email: student.email,
          courses: studentCourses,
        };
      });

    console.log(
      "📊 Student Progress Report:",
      JSON.stringify(studentReport, null, 2)
    );

    return { studentReport };
  } catch (error) {
    console.error("❌ Real-world multi-table example failed:", error);
  }
}
```

### 18.7 TESTING MULTIPLE TABLES

```js
async function testMultipleTables() {
  console.log("🧪 === TESTING MULTIPLE TABLES ===");

  const tests = [
    { name: "Multiple Stores in One DB", fn: multipleStoresExample },
    { name: "Dynamic Store Creation", fn: dynamicStoreCreation },
    { name: "Multiple Databases", fn: multipleDatabases },
    { name: "Cross-Table Operations", fn: crossTableOperations },
    { name: "Store Management Utilities", fn: storeManagementUtilities },
    { name: "Real-World Multi-Table", fn: realWorldMultiTableExample },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`🧪 Testing: ${test.name}`);
      await test.fn();
      results.push({ name: test.name, status: "PASSED" });
      console.log(`✅ ${test.name} - PASSED\n`);
    } catch (error) {
      results.push({ name: test.name, status: "FAILED", error: error.message });
      console.error(`❌ ${test.name} - FAILED:`, error.message, "\n");
    }
  }

  // Test summary
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log("📊 === MULTIPLE TABLES TEST SUMMARY ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`
  );

  return results;
}
```

KESIMPULAN MULTIPLE TABLES/STORES

JAWABAN: YA! NexaStorage IndexedDB DAPAT:

✅ 1. Membuat multiple stores dalam satu database
✅ 2. Membuat stores secara dinamis (auto mode)
✅ 3. Mengelola multiple databases terpisah
✅ 4. Melakukan operasi cross-table/relational
✅ 5. Export/import specific tables
✅ 6. Monitor size per table
✅ 7. Real-time watching per table
✅ 8. Batch operations per table

CARA PENGGUNAAN:

// Manual mode - tentukan stores di awal
const db = await dDB.indexedDB.init("MyDB", 1, ["users", "products", "orders"]);

// Auto mode - stores dibuat otomatis
const db = await dDB.indexedDB.init("MyDB", 1);
await NXUI.ref.set("new_table", { id: "1", data: "value" }); // Table dibuat otomatis

// Multiple databases
const userDB = await dDB.indexedDB.init("UserDB", 1, ["users", "profiles"]);
const productDB = await dDB.indexedDB.init("ProductDB", 1, ["products", "categories"]);

```js

// Export functions untuk multiple tables
export {
  // Multiple Tables Functions
  multipleStoresExample,
  dynamicStoreCreation,
  multipleDatabases,
  crossTableOperations,
  storeManagementUtilities,
  realWorldMultiTableExample,
  testMultipleTables,
};
```

SIMPLE REFRESH METHODS SUMMARY - MUDAH & CEPAT!

⚡ METODE REFRESH YANG TERSEDIA:

1. refresh(apiEndpoint, options)
   - Refresh semua tabel sekaligus
   - Contoh: await NXUI.ref.refresh() // Refresh semua
   - Contoh: await NXUI.ref.refresh("https://api.com/data") // Dari API

2. refreshTable(storeName, apiEndpoint)
   - Refresh satu tabel saja
   - Contoh: await NXUI.ref.refreshTable("users") // Manual refresh
   - Contoh: await NXUI.ref.refreshTable("users", "https://api.com/users") // Dari API

3. stopRefresh()
   - Stop semua auto refresh yang berjalan
   - Contoh: await NXUI.ref.stopRefresh()

🎯 PENGGUNAAN SUPER SIMPEL:

// Inisialisasi
const db = await dDB.indexedDB.init("MyAppDB", 1);

// Refresh semua - SUPER MUDAH!
await NXUI.ref.refresh();

// Refresh dari API
await NXUI.ref.refresh("https://api.example.com/data");

// Refresh satu tabel
await NXUI.ref.refreshTable("users");

// Refresh satu tabel dari API
await NXUI.ref.refreshTable("users", "https://api.example.com/users");

✅ KEUNTUNGAN:
- Sangat simpel dan mudah digunakan
- Otomatis trigger real-time events
- Support progress monitoring
- Auto error handling
- Tidak perlu setup kompleks
- Work dengan semua mode (auto/manual)

PARTIAL UPDATE METHODS SUMMARY

✅ METODE YANG TERSEDIA:

1. updateFields(storeName, id, fieldUpdates)
   - Update multiple fields sekaligus
   - Contoh: await NXUI.ref.updateFields("users", "user_001", { email: "new@email.com", age: 32 })

2. updateField(storeName, id, fieldName, fieldValue)
   - Update single field
   - Contoh: await NXUI.ref.updateField("users", "user_001", "email", "new@email.com")

3. updateNestedField(storeName, id, fieldPath, newValue)
   - Update nested field dengan dot notation
   - Contoh: await NXUI.ref.updateNestedField("users", "user_001", "profile.bio", "New Bio")

4. mergeData(storeName, id, mergeObject, options)
   - Merge object dengan shallow atau deep merge
   - Contoh: await NXUI.ref.mergeData("users", "user_001", { status: "active" }, { deepMerge: true })

5. batchUpdateFields(storeName, updates, options)
   - Batch update multiple records
   - Contoh: await NXUI.ref.batchUpdateFields("users", [{ id: "user_1", fields: { status: "active" } }])

🎯 KEUNTUNGAN:
- Tidak perlu get-merge-set manual
- Performa lebih baik
- Otomatis update timestamp
- Support nested object update
- Batch processing untuk multiple records
- Real-time notification tetap berfungsi

📱 PENGGUNAAN:

// Auto Mode
const db = await dDB.indexedDB.init("MyAppDB", 1);
await NXUI.ref.updateField("users", "user_001", "email", "new@email.com");

// Manual Mode
const db = await dDB.indexedDB.init("MyAppDB", 1, ["users"]);
await NXUI.ref.updateFields("users", "user_001", { email: "new@email.com", age: 32 });

20. DUPLICATE DATA METHODS - DUPLIKASI DATA DENGAN MUDAH

Method baru untuk menduplikasi data dengan ID yang berbeda.
Sangat berguna untuk template, backup, dan variasi produk.

### 20.1 BASIC DUPLICATE - Duplikasi Sederhana

```js
async function basicDuplicateExample() {
  try {
    console.log("📋 === BASIC DUPLICATE EXAMPLE ===");

    // Setup original data
    await NXUI.ref.set("users", {
      id: "user_001",
      name: "John Doe",
      email: "john@example.com",
      role: "admin",
      profile: {
        avatar: "avatar.jpg",
        bio: "Software Developer",
        location: "Jakarta",
      },
      settings: {
        theme: "dark",
        notifications: true,
        language: "id",
      },
    });

    console.log("✅ Original user created");

    // Basic duplication
    const duplicateResult = await NXUI.ref.duplicate(
      "users",
      "user_001",
      "user_001_copy"
    );
    console.log("✅ Basic duplicate created:", duplicateResult);

    // Verify both users exist
    const original = await NXUI.ref.get("users", "user_001");
    const duplicate = await NXUI.ref.get("users", "user_001_copy");

    console.log(
      "👤 Original user:",
      original.name,
      "(isDuplicate:",
      original.isDuplicate || false,
      ")"
    );
    console.log(
      "👤 Duplicate user:",
      duplicate.name,
      "(isDuplicate:",
      duplicate.isDuplicate,
      ")"
    );
    console.log("🔗 Original ID reference:", duplicate.originalId);

    return { original, duplicate };
  } catch (error) {
    console.error("❌ Basic duplicate failed:", error);
  }
}
```

### 20.2 DUPLICATE WITH MODIFICATIONS - Duplikasi dengan Modifikasi

```js
async function duplicateWithModificationsExample() {
  try {
    console.log("🛠️ === DUPLICATE WITH MODIFICATIONS ===");

    // Setup product data
    await NXUI.ref.set("products", {
      id: "product_001",
      name: "Basic T-Shirt",
      price: 250000,
      category: "clothing",
      specs: {
        material: "cotton",
        size: "M",
        color: "blue",
        weight: "200g",
      },
      stock: 100,
      status: "active",
    });

    console.log("✅ Original product created");

    // Create size variants with modifications
    const sizes = ["S", "L", "XL"];

    for (const size of sizes) {
      const result = await NXUI.ref.duplicate(
        "products",
        "product_001",
        `product_001_${size.toLowerCase()}`,
        {
          modifications: {
            name: `Basic T-Shirt - Size ${size}`,
            specs: {
              material: "cotton", // Keep same material
              size: size, // Change size
              color: "blue", // Keep same color
              weight: size === "XL" ? "250g" : size === "L" ? "225g" : "175g", // Different weight
            },
            variant: {
              type: "size",
              value: size,
              parentId: "product_001",
            },
            stock: size === "S" ? 50 : size === "L" ? 75 : 25, // Different stock per size
          },
        }
      );

      console.log(`✅ ${size} variant created:`, result.newId);
    }

    // Get all products to see variants
    const allProducts = await NXUI.ref.getAll("products");
    console.log("📦 Total products:", allProducts.data.length);

    allProducts.data.forEach((product) => {
      console.log(
        `   - ${product.id}: ${product.name} (Size: ${product.specs.size}, Stock: ${product.stock})`
      );
    });

    return allProducts.data;
  } catch (error) {
    console.error("❌ Duplicate with modifications failed:", error);
  }
}
```

### 20.3 DUPLICATE WITH PRESERVED TIMESTAMPS - Duplikasi dengan Timestamp Asli

```js
async function duplicateWithPreservedTimestamps() {
  try {
    console.log("⏰ === DUPLICATE WITH PRESERVED TIMESTAMPS ===");

    // Create original post with specific timestamp
    const originalTimestamp = "2025-01-01T00:00:00Z";
    await NXUI.ref.set("posts", {
      id: "post_001",
      title: "My First Blog Post",
      content: "This is the content of my first blog post...",
      author: "John Doe",
      tags: ["javascript", "tutorial"],
      publishDate: "2025-01-01",
      status: "published",
      createdAt: originalTimestamp,
      updatedAt: originalTimestamp,
    });

    console.log("✅ Original post created with timestamp:", originalTimestamp);

    // Duplicate with preserved timestamps
    const archiveResult = await NXUI.ref.duplicate(
      "posts",
      "post_001",
      "post_001_archive",
      {
        preserveTimestamps: true,
        modifications: {
          title: "My First Blog Post (Archive)",
          status: "archived",
          archivedBy: "admin",
          archiveReason: "Backup before major edit",
        },
      }
    );

    console.log("✅ Archive created with preserved timestamps");

    // Duplicate without preserved timestamps (default behavior)
    const copyResult = await NXUI.ref.duplicate(
      "posts",
      "post_001",
      "post_001_copy",
      {
        modifications: {
          title: "My First Blog Post (Copy)",
          status: "draft",
          author: "Editor",
        },
      }
    );

    console.log("✅ Copy created with new timestamps");

    // Compare timestamps
    const original = await NXUI.ref.get("posts", "post_001");
    const archive = await NXUI.ref.get("posts", "post_001_archive");
    const copy = await NXUI.ref.get("posts", "post_001_copy");

    console.log("🕐 Timestamp comparison:");
    console.log(`   Original: ${original.createdAt} | ${original.updatedAt}`);
    console.log(
      `   Archive:  ${archive.createdAt} | ${archive.updatedAt} (preserved: ${
        archive.createdAt === originalTimestamp
      })`
    );
    console.log(
      `   Copy:     ${copy.createdAt} | ${copy.updatedAt} (new timestamps)`
    );

    return { original, archive, copy };
  } catch (error) {
    console.error("❌ Preserved timestamps duplicate failed:", error);
  }
}
```

### 20.4 DUPLICATE WITH OVERWRITE - Duplikasi dengan Overwrite

```js
async function duplicateWithOverwriteExample() {
  try {
    console.log("🔄 === DUPLICATE WITH OVERWRITE ===");

    // Setup original data
    await NXUI.ref.set("settings", {
      id: "theme_config",
      theme: "dark",
      primaryColor: "#007bff",
      fontSize: "14px",
      layout: "sidebar",
      version: "1.0.0",
    });

    // Create first backup
    await NXUI.ref.duplicate("settings", "theme_config", "theme_backup", {
      modifications: {
        backupDate: new Date().toISOString(),
        backupVersion: "1.0.0",
      },
    });

    console.log("✅ First backup created");

    // Update original settings
    await NXUI.ref.updateFields("settings", "theme_config", {
      theme: "light",
      primaryColor: "#28a745",
      version: "1.1.0",
    });

    console.log("✅ Original settings updated");

    // Try to create backup with same ID (should fail)
    try {
      await NXUI.ref.duplicate("settings", "theme_config", "theme_backup");
    } catch (error) {
      console.log("❌ Expected error:", error.message);
    }

    // Create backup with overwrite
    const overwriteResult = await NXUI.ref.duplicate(
      "settings",
      "theme_config",
      "theme_backup",
      {
        overwrite: true,
        modifications: {
          backupDate: new Date().toISOString(),
          backupVersion: "1.1.0",
          overwritten: true,
        },
      }
    );

    console.log("✅ Backup overwritten:", overwriteResult.newId);

    // Verify final state
    const currentSettings = await NXUI.ref.get("settings", "theme_config");
    const backup = await NXUI.ref.get("settings", "theme_backup");

    console.log("⚙️ Current settings:", {
      theme: currentSettings.theme,
      version: currentSettings.version,
    });
    console.log("💾 Backup settings:", {
      theme: backup.theme,
      version: backup.version,
      backupVersion: backup.backupVersion,
      overwritten: backup.overwritten,
    });

    return { currentSettings, backup };
  } catch (error) {
    console.error("❌ Overwrite duplicate failed:", error);
  }
}
```

### 20.5 BATCH DUPLICATE - Duplikasi Batch

```js
async function batchDuplicateExample() {
  try {
    console.log("📦 === BATCH DUPLICATE EXAMPLE ===");

    // Setup multiple users
    const users = [
      { id: "user_001", name: "John Doe", role: "admin", department: "IT" },
      { id: "user_002", name: "Jane Smith", role: "manager", department: "HR" },
      {
        id: "user_003",
        name: "Bob Johnson",
        role: "developer",
        department: "IT",
      },
    ];

    for (const user of users) {
      await NXUI.ref.set("users", user);
    }

    console.log("✅ Original users created:", users.length);

    // Create backup copies of all users
    const backupResults = [];
    for (const user of users) {
      const result = await NXUI.ref.duplicate("users", user.id, `${user.id}_backup`, {
        modifications: {
          name: `${user.name} (Backup)`,
          status: "backup",
          backupDate: new Date().toISOString(),
          isActiveUser: false,
        },
      });
      backupResults.push(result);
      console.log(`✅ Backup created for ${user.name}`);
    }

    // Create template users from existing users
    const templateResults = [];
    for (const user of users) {
      const result = await NXUI.ref.duplicate(
        "users",
        user.id,
        `template_${user.role}`,
        {
          overwrite: true,
          modifications: {
            name: `Template ${
              user.role.charAt(0).toUpperCase() + user.role.slice(1)
            }`,
            role: user.role,
            department: "",
            isTemplate: true,
            templateBasedOn: user.id,
            instructions: `Fill in details for new ${user.role}`,
          },
        }
      );
      templateResults.push(result);
      console.log(`✅ Template created for ${user.role}`);
    }

    // Summary
    const allUsers = await NXUI.ref.getAll("users");
    const originalUsers = allUsers.data.filter((u) => !u.isDuplicate);
    const backupUsers = allUsers.data.filter((u) => u.status === "backup");
    const templateUsers = allUsers.data.filter((u) => u.isTemplate);

    console.log("📊 Duplicate Summary:");
    console.log(`   📋 Total users: ${allUsers.data.length}`);
    console.log(`   👤 Original users: ${originalUsers.length}`);
    console.log(`   💾 Backup users: ${backupUsers.length}`);
    console.log(`   📝 Template users: ${templateUsers.length}`);

    return {
      all: allUsers.data,
      original: originalUsers,
      backups: backupUsers,
      templates: templateUsers,
    };
  } catch (error) {
    console.error("❌ Batch duplicate failed:", error);
  }
}
```

### 20.6 E-COMMERCE PRODUCT VARIANTS - Contoh Real-World

```js
async function ecommerceProductVariantsExample() {
  try {
    console.log("🛒 === E-COMMERCE PRODUCT VARIANTS ===");

    // Master product
    await NXUI.ref.set("products", {
      id: "tshirt_master",
      name: "Basic Cotton T-Shirt",
      description: "Comfortable cotton t-shirt for everyday wear",
      basePrice: 99000,
      category: "clothing",
      brand: "BasicWear",
      masterProduct: true,
      specs: {
        material: "100% Cotton",
        care: "Machine washable",
        origin: "Indonesia",
      },
      images: ["tshirt_main.jpg"],
      seo: {
        title: "Basic Cotton T-Shirt - Comfortable & Affordable",
        description: "High-quality cotton t-shirt...",
        keywords: ["t-shirt", "cotton", "basic", "comfortable"],
      },
    });

    console.log("✅ Master product created");

    // Create size variants
    const sizes = [
      { size: "S", price: 99000, stock: 50 },
      { size: "M", price: 99000, stock: 100 },
      { size: "L", price: 109000, stock: 75 },
      { size: "XL", price: 119000, stock: 30 },
      { size: "XXL", price: 129000, stock: 15 },
    ];

    for (const variant of sizes) {
      await NXUI.ref.duplicate(
        "products",
        "tshirt_master",
        `tshirt_${variant.size.toLowerCase()}`,
        {
          modifications: {
            name: `Basic Cotton T-Shirt - Size ${variant.size}`,
            price: variant.price,
            stock: variant.stock,
            sku: `TSHIRT-BASIC-${variant.size}`,
            variant: {
              type: "size",
              value: variant.size,
              parentId: "tshirt_master",
            },
            specs: {
              material: "100% Cotton",
              care: "Machine washable",
              origin: "Indonesia",
              size: variant.size,
              fit:
                variant.size === "S"
                  ? "Slim"
                  : variant.size === "XXL"
                  ? "Relaxed"
                  : "Regular",
            },
            images: [`tshirt_${variant.size.toLowerCase()}.jpg`],
            masterProduct: false,
            variantProduct: true,
          },
        }
      );

      console.log(
        `✅ Size ${
          variant.size
        } variant created (Price: Rp ${variant.price.toLocaleString()})`
      );
    }

    // Create color variants for Medium size
    const colors = [
      { color: "White", hex: "#FFFFFF", stock: 80 },
      { color: "Black", hex: "#000000", stock: 90 },
      { color: "Navy", hex: "#1a237e", stock: 60 },
      { color: "Gray", hex: "#757575", stock: 70 },
    ];

    for (const colorVariant of colors) {
      await NXUI.ref.duplicate(
        "products",
        "tshirt_m",
        `tshirt_m_${colorVariant.color.toLowerCase()}`,
        {
          modifications: {
            name: `Basic Cotton T-Shirt - Size M - ${colorVariant.color}`,
            sku: `TSHIRT-BASIC-M-${colorVariant.color.toUpperCase()}`,
            stock: colorVariant.stock,
            variant: {
              type: "color",
              value: colorVariant.color,
              hex: colorVariant.hex,
              parentId: "tshirt_m",
              size: "M",
            },
            specs: {
              material: "100% Cotton",
              care: "Machine washable",
              origin: "Indonesia",
              size: "M",
              fit: "Regular",
              color: colorVariant.color,
              colorCode: colorVariant.hex,
            },
            images: [`tshirt_m_${colorVariant.color.toLowerCase()}.jpg`],
            colorVariant: true,
          },
        }
      );

      console.log(`✅ Color ${colorVariant.color} variant created for size M`);
    }

    // Get product summary
    const allProducts = await NXUI.ref.getAll("products");
    const masterProducts = allProducts.data.filter((p) => p.masterProduct);
    const sizeVariants = allProducts.data.filter(
      (p) => p.variant?.type === "size"
    );
    const colorVariants = allProducts.data.filter(
      (p) => p.variant?.type === "color"
    );

    console.log("📊 Product Variants Summary:");
    console.log(`   📋 Total products: ${allProducts.data.length}`);
    console.log(`   🎯 Master products: ${masterProducts.length}`);
    console.log(`   📏 Size variants: ${sizeVariants.length}`);
    console.log(`   🎨 Color variants: ${colorVariants.length}`);

    // Show price range
    const prices = allProducts.data.map((p) => p.price).filter((p) => p);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    console.log(
      `   💰 Price range: Rp ${minPrice.toLocaleString()} - Rp ${maxPrice.toLocaleString()}`
    );

    return {
      all: allProducts.data,
      master: masterProducts,
      sizeVariants,
      colorVariants,
      priceRange: { min: minPrice, max: maxPrice },
    };
  } catch (error) {
    console.error("❌ E-commerce variants failed:", error);
  }
}
```

### 20.7 USER TEMPLATES AND ROLES - Template User dari Role Existing

```js
async function userTemplatesExample() {
  try {
    console.log("👥 === USER TEMPLATES AND ROLES ===");

    // Setup existing users with complete profiles
    const existingUsers = [
      {
        id: "admin_john",
        name: "John Admin",
        email: "john@company.com",
        role: "admin",
        department: "IT",
        permissions: [
          "read",
          "write",
          "delete",
          "manage_users",
          "system_config",
        ],
        profile: {
          avatar: "john.jpg",
          bio: "Senior System Administrator",
          phone: "+62812345678",
          address: "Jakarta, Indonesia",
        },
        settings: {
          theme: "dark",
          notifications: { email: true, push: true, sms: false },
          language: "id",
          timezone: "Asia/Jakarta",
        },
        onboarding: {
          completed: true,
          steps: ["profile", "security", "preferences", "team_intro"],
          completedAt: "2024-12-01T00:00:00Z",
        },
      },
      {
        id: "manager_jane",
        name: "Jane Manager",
        email: "jane@company.com",
        role: "manager",
        department: "HR",
        permissions: ["read", "write", "manage_team", "reports"],
        profile: {
          avatar: "jane.jpg",
          bio: "HR Manager",
          phone: "+62812345679",
          address: "Bandung, Indonesia",
        },
        settings: {
          theme: "light",
          notifications: { email: true, push: false, sms: true },
          language: "en",
          timezone: "Asia/Jakarta",
        },
        onboarding: {
          completed: true,
          steps: ["profile", "team_setup", "goals", "training"],
          completedAt: "2024-11-15T00:00:00Z",
        },
      },
    ];

    // Save existing users
    for (const user of existingUsers) {
      await NXUI.ref.set("users", user);
      console.log(`✅ Existing user created: ${user.name} (${user.role})`);
    }

    // Create templates from existing users
    for (const user of existingUsers) {
      const templateResult = await NXUI.ref.duplicate(
        "users",
        user.id,
        `template_${user.role}`,
        {
          overwrite: true,
          modifications: {
            name: `[TEMPLATE] New ${
              user.role.charAt(0).toUpperCase() + user.role.slice(1)
            }`,
            email: "",
            isTemplate: true,
            templateBasedOn: user.id,
            templateCreatedAt: new Date().toISOString(),
            templateInstructions: {
              step1: "Fill in personal information",
              step2: "Set up email and contact details",
              step3: "Configure permissions and access",
              step4: "Review and activate account",
            },
            profile: {
              ...user.profile,
              avatar: "",
              bio: "",
              phone: "",
              address: "",
              placeholder: {
                bio: `Enter bio for new ${user.role}`,
                phone: "Enter phone number",
                address: "Enter address",
              },
            },
            settings: {
              ...user.settings,
              setupRequired: true,
              defaultsApplied: true,
            },
            onboarding: {
              completed: false,
              steps: user.onboarding.steps,
              currentStep: user.onboarding.steps[0],
              templateMode: true,
            },
          },
        }
      );

      console.log(`✅ Template created: ${templateResult.data.name}`);
    }

    // Create quick user from template
    const newAdminResult = await NXUI.ref.duplicate(
      "users",
      "template_admin",
      "new_admin_001",
      {
        modifications: {
          name: "Alice New Admin",
          email: "alice@company.com",
          isTemplate: false,
          createdFromTemplate: "template_admin",
          profile: {
            avatar: "",
            bio: "New team member",
            phone: "+62812345680",
            address: "Surabaya, Indonesia",
          },
          onboarding: {
            completed: false,
            steps: ["profile", "security", "preferences", "team_intro"],
            currentStep: "profile",
            startedAt: new Date().toISOString(),
          },
          status: "pending_activation",
        },
      }
    );

    console.log("✅ New user created from template:", newAdminResult.data.name);

    // Summary
    const allUsers = await NXUI.ref.getAll("users");
    const templates = allUsers.data.filter((u) => u.isTemplate);
    const activeUsers = allUsers.data.filter(
      (u) => !u.isTemplate && !u.isDuplicate
    );
    const newUsers = allUsers.data.filter((u) => u.createdFromTemplate);

    console.log("📊 User Templates Summary:");
    console.log(`   👥 Total entries: ${allUsers.data.length}`);
    console.log(`   👤 Active users: ${activeUsers.length}`);
    console.log(`   📝 Templates: ${templates.length}`);
    console.log(`   🆕 Users from template: ${newUsers.length}`);

    // Show templates
    console.log("📝 Available templates:");
    templates.forEach((template) => {
      console.log(
        `   - ${template.id}: ${template.name} (Role: ${template.role})`
      );
    });

    return {
      all: allUsers.data,
      templates,
      activeUsers,
      newUsers,
    };
  } catch (error) {
    console.error("❌ User templates failed:", error);
  }
}
```

### 20.8 TESTING DUPLICATE METHODS

```js
async function testDuplicateMethods() {
  console.log("🧪 === TESTING DUPLICATE METHODS ===");

  const tests = [
    { name: "Basic Duplicate", fn: basicDuplicateExample },
    {
      name: "Duplicate with Modifications",
      fn: duplicateWithModificationsExample,
    },
    {
      name: "Duplicate with Preserved Timestamps",
      fn: duplicateWithPreservedTimestamps,
    },
    { name: "Duplicate with Overwrite", fn: duplicateWithOverwriteExample },
    { name: "Batch Duplicate", fn: batchDuplicateExample },
    {
      name: "E-commerce Product Variants",
      fn: ecommerceProductVariantsExample,
    },
    { name: "User Templates and Roles", fn: userTemplatesExample },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n🧪 Testing: ${test.name}`);
      console.log("=".repeat(50));
      await test.fn();
      results.push({ name: test.name, status: "PASSED" });
      console.log(`✅ ${test.name} - PASSED`);
    } catch (error) {
      results.push({ name: test.name, status: "FAILED", error: error.message });
      console.error(`❌ ${test.name} - FAILED:`, error.message);
    }
  }

  // Test summary
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log("\n📊 === DUPLICATE METHODS TEST SUMMARY ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`
  );

  return results;
}
```

DUPLICATE METHOD SUMMARY - RINGKASAN FITUR DUPLICATE

🎯 METHOD YANG TERSEDIA:

1. duplicate(storeName, originalId, newId, options)
   - Duplikasi data dengan ID baru
   - Otomatis menambah metadata duplicate
   - Support untuk modifikasi data

2. duplicateAuto(storeName, originalId, newId, options)
   - Versi auto mode yang membuat store otomatis

📋 PARAMETER OPTIONS:

- overwrite: boolean (default: false)
  Apakah boleh overwrite jika ID sudah ada

- modifications: object (default: {})
  Objek berisi field yang ingin dimodifikasi

- preserveTimestamps: boolean (default: false)
  Apakah mempertahankan timestamp asli

🏷️ METADATA OTOMATIS:

- isDuplicate: true
- originalId: ID data asli
- duplicatedAt: Timestamp duplikasi
- createdAt: Timestamp baru (kecuali preserveTimestamps: true)
- updatedAt: Timestamp baru

💡 CONTOH PENGGUNAAN:

// Basic duplicate
await NXUI.ref.duplicate("users", "user_001", "user_001_copy");

// Duplicate dengan modifikasi
await NXUI.ref.duplicate("users", "user_001", "user_backup", {
  modifications: {
    name: "John Doe (Backup)",
    status: "backup"
  }
});

// Duplicate dengan preserve timestamp
await NXUI.ref.duplicate("posts", "post_001", "post_archive", {
  preserveTimestamps: true,
  modifications: { status: "archived" }
});

// Duplicate dengan overwrite
await NXUI.ref.duplicate("settings", "config", "config_backup", {
  overwrite: true,
  modifications: { backupDate: new Date() }
});

✅ KEUNTUNGAN:
- Sangat mudah digunakan
- Otomatis handle metadata
- Support modifikasi inline
- Error handling yang baik
- Compatible dengan semua mode (auto/manual)
- Real-time notifications
- Cross-tab sync

🎯 USE CASES:
- Template creation dari data existing
- Backup data sebelum update
- Variasi produk (size, color, dll)
- User role templates
- Draft copies dari published content
- A/B testing variants
- Historical snapshots

```js

console.log("📚 NexaStorage IndexedDB Documentation loaded successfully!");
console.log("🚀 Run runCompleteDemo() to see all features in action");
console.log("🧪 Run runTests() to validate functionality");
console.log(
  "🗂️ Run testMultipleTables() to test multiple tables functionality"
);
console.log(
  "📝 Run testPartialUpdateMethods() to test partial update features"
);
console.log("⚡ Run simpleRefresh() to test simple refresh methods");
console.log("📋 Run testDuplicateMethods() to test duplicate functionality");
```

## 19. CARA MENAMBAH TABEL BARU KE DATABASE YANG SUDAH ADA

JAWABAN: Ada beberapa cara untuk menambah tabel baru ke database yang sudah ada

### 19.1 MENGGUNAKAN addStores() - Cara Termudah

```js
async function addNewTablesToExistingDB() {
  try {
    console.log("➕ === MENAMBAH TABEL BARU ===");
```

## 1. Inisialisasi database dengan tabel awal

```js
    await dDB.indexedDB.init("MyAppDB", 1, [
      "users",
      "products",
      "orders",
    ]);

    console.log("📋 Tabel awal:", NXUI.ref.getInfo().availableStores);
```

## 2. Tambah tabel baru menggunakan addStores()

```js
    await NXUI.ref.addStores([
      "categories", // Tabel kategori
      "reviews", // Tabel review
      "settings", // Tabel pengaturan
      "notifications", // Tabel notifikasi
      "logs", // Tabel log
    ]);

    console.log("✅ Tabel baru berhasil ditambahkan!");
    console.log("📋 Semua tabel sekarang:", NXUI.ref.getInfo().availableStores);
```

## 3. Test tabel baru dengan menambah data

```js
    await NXUI.ref.set("categories", {
      id: "cat_1",
      name: "Electronics",
      description: "Electronic devices",
    });
    await NXUI.ref.set("reviews", {
      id: "rev_1",
      productId: "prod_1",
      rating: 5,
      comment: "Excellent!",
    });
    await NXUI.ref.set("settings", { id: "theme", key: "theme", value: "dark" });
    await NXUI.ref.set("notifications", {
      id: "notif_1",
      message: "Welcome!",
      read: false,
    });
    await NXUI.ref.set("logs", {
      id: "log_1",
      action: "user_login",
      timestamp: new Date(),
    });

    console.log("✅ Data berhasil disimpan ke tabel baru");
```

## 4. Verifikasi data

```js
    const category = await NXUI.ref.get("categories", "cat_1");
    const review = await NXUI.ref.get("reviews", "rev_1");
    const setting = await NXUI.ref.get("settings", "theme");

    console.log("📂 Category:", category);
    console.log("⭐ Review:", review);
    console.log("⚙️ Setting:", setting);

  } catch (error) {
    console.error("❌ Gagal menambah tabel baru:", error);
  }
}
```

### 19.2 MENAMBAH TABEL SATU PER SATU

```js
async function addTablesOneByOne() {
  try {
    console.log("1️⃣ === MENAMBAH TABEL SATU PER SATU ===");

    // Database awal dengan 3 tabel
    await dDB.indexedDB.init("StepByStepDB", 1, [
      "users",
      "products",
      "orders",
    ]);

    console.log("📋 Tabel awal:", NXUI.ref.listStores());

    // Tambah tabel satu per satu
    console.log("➕ Menambah tabel 'categories'...");
    await NXUI.ref.addStores("categories");
    console.log("📋 Sekarang ada:", NXUI.ref.listStores());

    console.log("➕ Menambah tabel 'reviews'...");
    await NXUI.ref.addStores("reviews");
    console.log("📋 Sekarang ada:", NXUI.ref.listStores());

    console.log("➕ Menambah tabel 'inventory'...");
    await NXUI.ref.addStores("inventory");
    console.log("📋 Sekarang ada:", NXUI.ref.listStores());

    // Test dengan data
    await NXUI.ref.set("categories", { id: "cat_1", name: "Electronics" });
    await NXUI.ref.set("reviews", { id: "rev_1", rating: 5 });
    await NXUI.ref.set("inventory", { id: "inv_1", stock: 100 });

    console.log("✅ Semua tabel baru berhasil ditambahkan dan diisi data");

  } catch (error) {
    console.error("❌ Gagal menambah tabel satu per satu:", error);
  }
}
```

### 19.3 AUTO MODE - Tabel Dibuat Otomatis Saat Dibutuhkan

```js
async function autoTableCreation() {
  try {
    console.log("🤖 === AUTO MODE - TABEL OTOMATIS ===");

    // Inisialisasi tanpa menentukan tabel (auto mode)
    await dDB.indexedDB.init("AutoDB", 1);

    console.log("📋 Tabel awal (kosong):", NXUI.ref.listStores());

    // Tabel akan dibuat otomatis saat pertama kali digunakan
    await NXUI.ref.set("users", { id: "user_1", name: "John Doe" });
    console.log("📋 Setelah buat 'users':", NXUI.ref.listStores());

    await NXUI.ref.set("products", { id: "prod_1", name: "Laptop" });
    console.log("📋 Setelah buat 'products':", NXUI.ref.listStores());

    await NXUI.ref.set("orders", { id: "order_1", total: 1000 });
    console.log("📋 Setelah buat 'orders':", NXUI.ref.listStores());

    // Tambah tabel baru kapan saja
    await NXUI.ref.set("categories", { id: "cat_1", name: "Electronics" });
    await NXUI.ref.set("reviews", { id: "rev_1", rating: 5 });
    await NXUI.ref.set("settings", { id: "set_1", theme: "dark" });
    await NXUI.ref.set("analytics", { id: "ana_1", pageViews: 1000 });

    console.log("📋 Semua tabel (auto-created):", NXUI.ref.listStores());
    console.log("✅ Auto mode: Tabel dibuat otomatis saat dibutuhkan!");

  } catch (error) {
    console.error("❌ Auto table creation gagal:", error);
  }
}
```

### 19.4 MENAMBAH TABEL DENGAN VALIDASI

```js
async function addTablesWithValidation() {
  try {
    console.log("✅ === MENAMBAH TABEL DENGAN VALIDASI ===");

    await dDB.indexedDB.init("ValidatedDB", 1, [
      "users",
      "products",
    ]);

    console.log("📋 Tabel awal:", NXUI.ref.listStores());

    // Daftar tabel yang ingin ditambahkan
    const newTables = ["orders", "categories", "reviews", "settings", "logs"];

    // Validasi dan tambah tabel satu per satu
    for (const tableName of newTables) {
      // Check apakah tabel sudah ada
      if (NXUI.ref.hasStore(tableName)) {
        console.log(`⚠️ Tabel '${tableName}' sudah ada, skip...`);
        continue;
      }

      try {
        console.log(`➕ Menambah tabel '${tableName}'...`);
        await NXUI.ref.addStores(tableName);

        // Verifikasi tabel berhasil dibuat
        if (NXUI.ref.hasStore(tableName)) {
          console.log(`✅ Tabel '${tableName}' berhasil ditambahkan`);

          // Test dengan sample data
          await NXUI.ref.set(tableName, {
            id: `${tableName}_test`,
            name: `Test ${tableName}`,
            created: new Date().toISOString(),
          });

          console.log(`📝 Sample data ditambahkan ke '${tableName}'`);
        } else {
          console.log(`❌ Gagal membuat tabel '${tableName}'`);
        }
      } catch (error) {
        console.error(`❌ Error menambah tabel '${tableName}':`, error.message);
      }
    }

    console.log("📋 Tabel akhir:", NXUI.ref.listStores());
    console.log("📊 Total tabel:", NXUI.ref.listStores().length);

  } catch (error) {
    console.error("❌ Validasi gagal:", error);
  }
}
```

### 19.5 MENAMBAH TABEL DENGAN BATCH OPERATION

```js
async function batchAddTables() {
  try {
    console.log("📦 === BATCH ADD TABLES ===");

    await dDB.indexedDB.init("BatchDB", 1, ["users", "products"]);

    console.log("📋 Tabel awal:", NXUI.ref.listStores());

    // Tambah multiple tabel sekaligus
    const newTables = [
      "orders",
      "categories",
      "reviews",
      "settings",
      "notifications",
      "logs",
      "analytics",
      "cache",
    ];

    console.log(`➕ Menambah ${newTables.length} tabel sekaligus...`);
    await NXUI.ref.addStores(newTables);

    console.log("✅ Batch add tabel berhasil!");
    console.log("📋 Semua tabel:", NXUI.ref.listStores());

    // Batch insert data ke semua tabel baru
    console.log("📝 Menambah sample data ke semua tabel...");

    const sampleData = {
      orders: { id: "order_1", total: 1000, status: "pending" },
      categories: { id: "cat_1", name: "Electronics", active: true },
      reviews: { id: "rev_1", rating: 5, comment: "Great product!" },
      settings: { id: "theme", key: "theme", value: "dark" },
      notifications: { id: "notif_1", message: "Welcome!", read: false },
      logs: { id: "log_1", action: "user_login", level: "info" },
      analytics: { id: "ana_1", pageViews: 1000, visitors: 250 },
      cache: { id: "cache_1", key: "api_users", data: [], ttl: 3600 },
    };

    // Insert data ke semua tabel
    for (const [tableName, data] of Object.entries(sampleData)) {
      await NXUI.ref.set(tableName, data);
      console.log(`✅ Data ditambahkan ke '${tableName}'`);
    }

    console.log("🎉 Batch operation selesai!");

    // Verifikasi data
    const tableInfo = {};
    for (const tableName of NXUI.ref.listStores()) {
      const allData = await NXUI.ref.getAll(tableName);
      tableInfo[tableName] = allData.data.length;
    }

    console.log("📊 Jumlah data per tabel:", tableInfo);

  } catch (error) {
    console.error("❌ Batch add tables gagal:", error);
  }
}
```

### 19.6 REAL-WORLD EXAMPLE: E-COMMERCE EXPANSION

```js
async function ecommerceExpansion() {
  try {
    console.log("🛒 === E-COMMERCE EXPANSION EXAMPLE ===");

    // Mulai dengan tabel dasar e-commerce
    await dDB.indexedDB.init("EcommerceDB", 1, [
      "users",
      "products",
      "orders",
    ]);

    console.log("📋 Tabel e-commerce awal:", NXUI.ref.listStores());

    // Fase 1: Tambah fitur kategori dan review
    console.log("\n🔄 Fase 1: Menambah Categories & Reviews");
    await NXUI.ref.addStores(["categories", "reviews"]);

    await NXUI.ref.set("categories", {
      id: "cat_1",
      name: "Electronics",
      slug: "electronics",
    });
    await NXUI.ref.set("reviews", {
      id: "rev_1",
      productId: "prod_1",
      rating: 5,
      verified: true,
    });

    console.log("✅ Fase 1 selesai. Tabel:", NXUI.ref.listStores());

    // Fase 2: Tambah fitur inventory dan shipping
    console.log("\n🔄 Fase 2: Menambah Inventory & Shipping");
    await NXUI.ref.addStores(["inventory", "shipping"]);

    await NXUI.ref.set("inventory", {
      id: "inv_1",
      productId: "prod_1",
      stock: 100,
      reserved: 5,
    });
    await NXUI.ref.set("shipping", {
      id: "ship_1",
      orderId: "order_1",
      carrier: "DHL",
      tracking: "123456",
    });

    console.log("✅ Fase 2 selesai. Tabel:", NXUI.ref.listStores());

    // Fase 3: Tambah fitur marketing dan analytics
    console.log("\n🔄 Fase 3: Menambah Marketing & Analytics");
    await NXUI.ref.addStores(["coupons", "analytics", "wishlists"]);

    await NXUI.ref.set("coupons", {
      id: "coup_1",
      code: "SAVE10",
      discount: 10,
      active: true,
    });
    await NXUI.ref.set("analytics", {
      id: "ana_1",
      event: "page_view",
      page: "/products",
      count: 1000,
    });
    await NXUI.ref.set("wishlists", {
      id: "wish_1",
      userId: "user_1",
      productId: "prod_1",
      added: new Date(),
    });

    console.log("✅ Fase 3 selesai. Tabel:", NXUI.ref.listStores());

    // Fase 4: Tambah fitur advanced
    console.log("\n🔄 Fase 4: Menambah Advanced Features");
    await NXUI.ref.addStores(["notifications", "settings", "logs", "cache"]);

    await NXUI.ref.set("notifications", {
      id: "notif_1",
      userId: "user_1",
      message: "Order shipped!",
      read: false,
    });
    await NXUI.ref.set("settings", { id: "currency", key: "currency", value: "USD" });
    await NXUI.ref.set("logs", {
      id: "log_1",
      action: "order_created",
      userId: "user_1",
      timestamp: new Date(),
    });
    await NXUI.ref.set("cache", {
      id: "cache_1",
      key: "popular_products",
      data: [],
      ttl: 3600,
    });

    console.log("✅ Fase 4 selesai. Tabel final:", NXUI.ref.listStores());

    // Summary
    console.log("\n📊 === E-COMMERCE EXPANSION SUMMARY ===");
    console.log(`🎯 Total tabel: ${NXUI.ref.listStores().length}`);
    console.log("📋 Semua tabel:", NXUI.ref.listStores().join(", "));

    // Get database size
    const dbSize = await NXUI.ref.getDatabaseSize();
    console.log(`💾 Database size: ${dbSize.totalSizeMB} MB`);

  } catch (error) {
    console.error("❌ E-commerce expansion gagal:", error);
  }
}
```

### 19.7 TESTING SEMUA METODE PENAMBAHAN TABEL

```js
async function testAddTableMethods() {
  console.log("🧪 === TESTING ADD TABLE METHODS ===");

  const tests = [
    { name: "Add Multiple Tables at Once", fn: addNewTablesToExistingDB },
    { name: "Add Tables One by One", fn: addTablesOneByOne },
    { name: "Auto Table Creation", fn: autoTableCreation },
    { name: "Add Tables with Validation", fn: addTablesWithValidation },
    { name: "Batch Add Tables", fn: batchAddTables },
    { name: "E-commerce Expansion", fn: ecommerceExpansion },
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n🧪 Testing: ${test.name}`);
      console.log("=".repeat(50));
      await test.fn();
      results.push({ name: test.name, status: "PASSED" });
      console.log(`✅ ${test.name} - PASSED`);
    } catch (error) {
      results.push({ name: test.name, status: "FAILED", error: error.message });
      console.error(`❌ ${test.name} - FAILED:`, error.message);
    }
  }

  // Test summary
  const passed = results.filter((r) => r.status === "PASSED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log("\n📊 === ADD TABLE METHODS TEST SUMMARY ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`
  );

  return results;
}
```

KESIMPULAN CARA MENAMBAH TABEL BARU

🎯 CARA TERMUDAH:

1. MENGGUNAKAN addStores() - RECOMMENDED
   const db = await dDB.indexedDB.init("MyDB", 1, ["users", "products"]);
   await NXUI.ref.addStores(["categories", "reviews", "settings"]);

2. AUTO MODE - PALING FLEKSIBEL
   const db = await dDB.indexedDB.init("MyDB", 1); // Tanpa parameter
   await NXUI.ref.set("new_table", { id: "1", data: "value" }); // Tabel dibuat otomatis

3. SATU PER SATU
   await NXUI.ref.addStores("categories");
   await NXUI.ref.addStores("reviews");

4. DENGAN VALIDASI
   if (!NXUI.ref.hasStore("categories")) {
     await NXUI.ref.addStores("categories");
   }

✅ KEUNTUNGAN:
- Tidak perlu restart aplikasi
- Data existing tetap aman
- Version database otomatis diupdate
- Mendukung real-time sync
- Bisa menambah kapan saja

```js

// Export functions untuk add tables
export {
  // Add Tables Functions
  addNewTablesToExistingDB,
  addTablesOneByOne,
  autoTableCreation,
  addTablesWithValidation,
  batchAddTables,
  ecommerceExpansion,
  testAddTableMethods,

  // Partial Update Functions
  updateMultipleFields,
  updateSingleField,
  updateNestedFields,
  mergeDataExample,
  batchUpdateFieldsExample,
  ecommercePartialUpdateExample,
  userProfilePartialUpdateExample,
  testPartialUpdateMethods,

  // Duplicate Functions
  basicDuplicateExample,
  duplicateWithModificationsExample,
  duplicateWithPreservedTimestamps,
  duplicateWithOverwriteExample,
  batchDuplicateExample,
  ecommerceProductVariantsExample,
  userTemplatesExample,
  testDuplicateMethods,
};
```
