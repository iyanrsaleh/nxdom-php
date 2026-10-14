/**
 * NexaModels.js - Pembangun Query SQL JavaScript
 * Menghasilkan string query SQL tanpa panggilan API
 *
 * @version 1.0.0
 * @author Nexa Framework
 */
import NexaEncrypt from "./NexaEncrypt.js";

class NexaModels {
  constructor(secretKey = "nexa-default-secret-key-2025") {
    this.reset();

    // Inisialisasi NexaEncrypt dengan secret key
    this.nexaEncrypt = new NexaEncrypt(secretKey);
    // Pengaturan keamanan
    this.allowedFunctions = [
      "UPPER",
      "LOWER",
      "DATE",
      "YEAR",
      "MONTH",
      "DAY",
      "COUNT",
      "SUM",
      "AVG",
      "MAX",
      "MIN",
      "RAND",
      "CONCAT",
      "SUBSTRING",
      "TRIM",
      "LENGTH",
      "COALESCE",
      "IFNULL",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
      "IF",
      "DATE_FORMAT",
      "FORMAT",
      "CURDATE",
      "CURTIME",
      "NOW",
      "UNIX_TIMESTAMP",
    ];
  }

  /**
   * Reset status query
   */
  reset() {
    this.tableName = null;
    this.selectFields = "*";
    this.whereConditions = [];
    this.joinConditions = [];
    this.orderByFields = [];
    this.groupByFields = [];
    this.havingConditions = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.unionQueries = [];
    this.isDistinct = false;
    this.insertData = null;
    this.updateData = null;
    this.deleteMode = false;
    return this;
  }

  /**
   * Set nama tabel
   * @param {string} table - Nama tabel
   * @returns {NexaModels}
   */
  table(table) {
    this.validateTableName(table);
    this.tableName = table;
    return this;
  }

  /**
   * Alias untuk method table
   * @param {string} table - Nama tabel
   * @returns {NexaModels}
   */
  from(table) {
    return this.table(table);
  }

  /**
   * Alias untuk method table (Storage)
   * @param {string} table - Nama tabel
   * @returns {NexaModels}
   */
  Storage(table) {
    return this.table(table);
  }

  /**
   * Set field select
   * @param {string|Array} columns - Kolom yang akan dipilih
   * @returns {NexaModels}
   */
  select(columns) {
    if (Array.isArray(columns)) {
      columns.forEach((col) => this.validateColumnName(col.trim()));
      this.selectFields = columns.join(", ");
    } else {
      if (columns.includes(",")) {
        const columnArray = columns.split(",").map((col) => col.trim());
        columnArray.forEach((col) => this.validateColumnName(col));
      } else {
        this.validateColumnName(columns);
      }
      this.selectFields = columns;
    }
    return this;
  }

  /**
   * Tidak memilih kolom tertentu (mengecualikan kolom dari SELECT)
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @returns {NexaModels}
   *
   * Example:
   * .noSelect(['password', 'remember_token'])
   * .noSelect('password,remember_token')
   */
  noSelect(excludeColumns) {
    throw new Error(
      "noSelect method requires table schema information. Use noSelectFrom() with manual column list instead, or implement table introspection via API."
    );
  }

  /**
   * Alias untuk noSelect method
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @returns {NexaModels}
   */
  except(excludeColumns) {
    return this.noSelect(excludeColumns);
  }

  /**
   * Alias untuk noSelect method
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @returns {NexaModels}
   */
  exclude(excludeColumns) {
    return this.noSelect(excludeColumns);
  }

  /**
   * Tidak memilih kolom tertentu dengan daftar kolom manual
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia
   * @returns {NexaModels}
   *
   * Example:
   * .noSelectFrom(['password', 'token'], ['id', 'name', 'email', 'password', 'token'])
   */
  noSelectFrom(excludeColumns, allColumns) {
    // Convert string to array if needed
    if (typeof excludeColumns === "string") {
      excludeColumns = excludeColumns.split(",").map((col) => col.trim());
    }

    if (!Array.isArray(excludeColumns)) {
      throw new Error(
        "Exclude columns must be array or comma-separated string"
      );
    }

    if (!Array.isArray(allColumns) || allColumns.length === 0) {
      throw new Error("All columns array cannot be empty");
    }

    // Validate excluded column names
    excludeColumns.forEach((column) => {
      this.validateColumnName(column.trim());
    });

    // Remove excluded columns
    const selectedColumns = allColumns.filter(
      (col) => !excludeColumns.includes(col)
    );

    if (selectedColumns.length === 0) {
      throw new Error("Cannot exclude all columns");
    }

    this.selectFields = selectedColumns.join(", ");
    return this;
  }

  /**
   * Alias untuk noSelectFrom
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia
   * @returns {NexaModels}
   */
  exceptFrom(excludeColumns, allColumns) {
    return this.noSelectFrom(excludeColumns, allColumns);
  }

  /**
   * Alias untuk noSelectFrom
   * @param {string|Array} excludeColumns - Kolom yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia
   * @returns {NexaModels}
   */
  withoutFrom(excludeColumns, allColumns) {
    return this.noSelectFrom(excludeColumns, allColumns);
  }

  /**
   * Method untuk tidak mengambil field tertentu
   * @param {string|Array} excludeColumns - Kolom yang tidak akan diambil
   * @returns {NexaModels}
   */
  without(excludeColumns) {
    return this.noSelect(excludeColumns);
  }

  /**
   * Method untuk mengabaikan field tertentu
   * @param {string|Array} excludeColumns - Kolom yang akan diabaikan
   * @returns {NexaModels}
   */
  ignore(excludeColumns) {
    return this.noSelect(excludeColumns);
  }

  /**
   * Method untuk melewati field tertentu
   * @param {string|Array} excludeColumns - Kolom yang akan dilewati
   * @returns {NexaModels}
   */
  skipFields(excludeColumns) {
    return this.noSelect(excludeColumns);
  }

  /**
   * Tidak memilih field sensitif umum (password, token, etc.)
   * @param {Array} additionalExcludes - Field tambahan yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   *
   * Example:
   * .noSensitive(['api_key'], ['id', 'name', 'email', 'password', 'token'])
   */
  noSensitive(additionalExcludes = [], allColumns = []) {
    const defaultSensitive = [
      "password",
      "password_hash",
      "remember_token",
      "api_token",
      "api_key",
      "secret",
      "secret_key",
      "access_token",
      "refresh_token",
      "private_key",
      "salt",
    ];

    const excludeColumns = [...defaultSensitive, ...additionalExcludes];

    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version. Use noSensitiveFrom() method."
      );
    }

    return this.noSelectFrom(excludeColumns, allColumns);
  }

  /**
   * Alias untuk noSensitive method
   * @param {Array} additionalExcludes - Field tambahan yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia
   * @returns {NexaModels}
   */
  exceptSensitive(additionalExcludes = [], allColumns = []) {
    return this.noSensitive(additionalExcludes, allColumns);
  }

  /**
   * Tidak memilih field timestamp (created_at, updated_at, deleted_at)
   * @param {Array} additionalExcludes - Field tambahan yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   */
  noTimestamps(additionalExcludes = [], allColumns = []) {
    const timestampFields = ["created_at", "updated_at", "deleted_at"];

    const excludeColumns = [...timestampFields, ...additionalExcludes];

    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version. Use noTimestampsFrom() method."
      );
    }

    return this.noSelectFrom(excludeColumns, allColumns);
  }

  /**
   * Alias untuk noTimestamps method
   * @param {Array} additionalExcludes - Field tambahan yang akan dikecualikan
   * @param {Array} allColumns - Semua kolom yang tersedia
   * @returns {NexaModels}
   */
  exceptTimestamps(additionalExcludes = [], allColumns = []) {
    return this.noTimestamps(additionalExcludes, allColumns);
  }

  /**
   * Shortcut: Tidak memilih field password
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   */
  noPassword(allColumns = []) {
    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version."
      );
    }
    return this.noSelectFrom(["password", "password_hash"], allColumns);
  }

  /**
   * Shortcut: Tidak memilih field token
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   */
  noTokens(allColumns = []) {
    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version."
      );
    }
    return this.noSelectFrom(
      [
        "remember_token",
        "api_token",
        "access_token",
        "refresh_token",
        "api_key",
        "secret_key",
      ],
      allColumns
    );
  }

  /**
   * Shortcut: Tidak memilih field ID
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   */
  noId(allColumns = []) {
    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version."
      );
    }
    return this.noSelectFrom(["id"], allColumns);
  }

  /**
   * Shortcut: Tidak memilih field sistem (id + timestamps)
   * @param {Array} allColumns - Semua kolom yang tersedia (required for JS version)
   * @returns {NexaModels}
   */
  noSystem(allColumns = []) {
    if (allColumns.length === 0) {
      throw new Error(
        "allColumns parameter is required for JavaScript version."
      );
    }
    const systemFields = ["id", "created_at", "updated_at", "deleted_at"];
    return this.noSelectFrom(systemFields, allColumns);
  }

  /**
   * Pilih field minimal untuk list/index display
   * @param {Array} baseFields - Field dasar yang akan dipilih
   * @param {Array} additionalFields - Field tambahan
   * @returns {NexaModels}
   */
  selectMinimal(baseFields = ["id", "name", "email"], additionalFields = []) {
    const selectedFields = [...baseFields, ...additionalFields];

    // Validate all fields
    selectedFields.forEach((field) => {
      this.validateColumnName(field);
    });

    // Remove duplicates
    const uniqueFields = [...new Set(selectedFields)];

    this.selectFields = uniqueFields.join(", ");
    return this;
  }

  /**
   * Tambah kondisi WHERE
   * @param {string|Object} column - Nama kolom atau objek kondisi
   * @param {string} operator - Operator perbandingan
   * @param {*} value - Nilai untuk dibandingkan
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  where(column, operator = null, value = null, boolean = "AND") {
    if (typeof column === "object" && column !== null) {
      // Tangani objek kondisi
      Object.entries(column).forEach(([key, val]) => {
        const normalizedValue = this.normalizeValue(val);
        this.whereConditions.push([key, "=", normalizedValue, "AND", "BASIC"]);
      });
    } else {
      if (value === null) {
        value = operator;
        operator = "=";
      }
      const normalizedValue = this.normalizeValue(value);
      this.whereConditions.push([
        column,
        operator,
        normalizedValue,
        boolean,
        "BASIC",
      ]);
    }
    return this;
  }

  /**
   * Tambah kondisi OR WHERE
   * @param {string} column - Nama kolom
   * @param {string} operator - Operator perbandingan
   * @param {*} value - Nilai untuk dibandingkan
   * @returns {NexaModels}
   */
  orWhere(column, operator = null, value = null) {
    return this.where(column, operator, value, "OR");
  }

  /**
   * Tambah kondisi WHERE IN
   * @param {string} column - Nama kolom
   * @param {Array} values - Array nilai
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereIn(column, values, boolean = "AND") {
    if (!Array.isArray(values) || values.length === 0) {
      return this;
    }
    this.whereConditions.push([column, "IN", values, boolean, "IN"]);
    return this;
  }

  /**
   * Tambah kondisi WHERE NOT IN
   * @param {string} column - Nama kolom
   * @param {Array} values - Array nilai
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereNotIn(column, values, boolean = "AND") {
    if (!Array.isArray(values) || values.length === 0) {
      return this;
    }
    this.whereConditions.push([column, "NOT IN", values, boolean, "NOT_IN"]);
    return this;
  }

  /**
   * Tambah kondisi WHERE BETWEEN
   * @param {string} column - Nama kolom
   * @param {Array} values - Array dengan 2 nilai [min, max]
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereBetween(column, values, boolean = "AND") {
    if (!Array.isArray(values) || values.length !== 2) {
      throw new Error("whereBetween requires exactly 2 values");
    }
    this.whereConditions.push([column, "BETWEEN", values, boolean, "BETWEEN"]);
    return this;
  }

  /**
   * Tambah kondisi WHERE NOT BETWEEN
   * @param {string} column - Nama kolom
   * @param {Array} values - Array dengan 2 nilai [min, max]
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereNotBetween(column, values, boolean = "AND") {
    if (!Array.isArray(values) || values.length !== 2) {
      throw new Error("whereNotBetween requires exactly 2 values");
    }
    this.whereConditions.push([
      column,
      "NOT BETWEEN",
      values,
      boolean,
      "NOT_BETWEEN",
    ]);
    return this;
  }

  /**
   * Tambah kondisi WHERE NULL
   * @param {string} column - Nama kolom
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereNull(column, boolean = "AND") {
    this.whereConditions.push([column, "IS NULL", null, boolean, "NULL"]);
    return this;
  }

  /**
   * Tambah kondisi WHERE NOT NULL
   * @param {string} column - Nama kolom
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereNotNull(column, boolean = "AND") {
    this.whereConditions.push([
      column,
      "IS NOT NULL",
      null,
      boolean,
      "NOT_NULL",
    ]);
    return this;
  }

  /**
   * Tambah kondisi WHERE LIKE
   * @param {string} column - Nama kolom
   * @param {string} value - Nilai untuk dicari
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereLike(column, value, boolean = "AND") {
    // If value doesn't contain wildcards, wrap it
    if (!value.includes("%")) {
      value = `%${value}%`;
    }
    this.whereConditions.push([column, "LIKE", value, boolean, "BASIC"]);
    return this;
  }

  /**
   * Tambah kondisi OR WHERE LIKE
   * @param {string} column - Nama kolom
   * @param {string} value - Nilai untuk dicari
   * @returns {NexaModels}
   */
  orWhereLike(column, value) {
    return this.whereLike(column, value, "OR");
  }

  /**
   * Tambah kondisi WHERE tanggal
   * @param {string} column - Nama kolom
   * @param {string} operator - Operator perbandingan
   * @param {*} value - Nilai untuk dibandingkan
   * @param {string} boolean - AND/OR
   * @returns {NexaModels}
   */
  whereDate(column, operator, value, boolean = "AND") {
    return this.where(`DATE(${column})`, operator, value, boolean);
  }

  whereYear(column, operator, value, boolean = "AND") {
    return this.where(`YEAR(${column})`, operator, value, boolean);
  }

  whereMonth(column, operator, value, boolean = "AND") {
    return this.where(`MONTH(${column})`, operator, value, boolean);
  }

  whereDay(column, operator, value, boolean = "AND") {
    return this.where(`DAY(${column})`, operator, value, boolean);
  }

  /**
   * Tambah klausa JOIN
   * @param {string} table - Tabel untuk di-join
   * @param {string} first - Kolom pertama
   * @param {string} operator - Operator join
   * @param {string} second - Kolom kedua
   * @param {string} type - Tipe join
   * @returns {NexaModels}
   */
  join(table, first, operator = null, second = null, type = "INNER") {
    this.joinConditions.push({
      table: table,
      first: first,
      operator: operator,
      second: second,
      type: type,
    });
    return this;
  }

  /**
   * Tambah klausa LEFT JOIN
   * @param {string} table - Tabel untuk di-join
   * @param {string} first - Kolom pertama
   * @param {string} operator - Operator join
   * @param {string} second - Kolom kedua
   * @returns {NexaModels}
   */
  leftJoin(table, first, operator = null, second = null) {
    return this.join(table, first, operator, second, "LEFT");
  }

  /**
   * Tambah klausa RIGHT JOIN
   * @param {string} table - Tabel untuk di-join
   * @param {string} first - Kolom pertama
   * @param {string} operator - Operator join
   * @param {string} second - Kolom kedua
   * @returns {NexaModels}
   */
  rightJoin(table, first, operator = null, second = null) {
    return this.join(table, first, operator, second, "RIGHT");
  }

  /**
   * Tambah klausa INNER JOIN
   * @param {string} table - Tabel untuk di-join
   * @param {string} first - Kolom pertama
   * @param {string} operator - Operator join
   * @param {string} second - Kolom kedua
   * @returns {NexaModels}
   */
  innerJoin(table, first, operator = null, second = null) {
    return this.join(table, first, operator, second, "INNER");
  }

  /**
   * Tambah klausa ORDER BY
   * @param {string|Array} column - Nama kolom
   * @param {string} direction - Arah pengurutan (ASC/DESC)
   * @returns {NexaModels}
   */
  orderBy(column, direction = "ASC") {
    if (Array.isArray(column)) {
      column.forEach((col) => {
        this.orderByFields.push([col, direction.toUpperCase()]);
      });
    } else if (column.includes(",")) {
      const columns = column.split(",").map((col) => col.trim());
      columns.forEach((col) => {
        this.orderByFields.push([col, direction.toUpperCase()]);
      });
    } else {
      this.orderByFields.push([column, direction.toUpperCase()]);
    }
    return this;
  }

  /**
   * Urutkan berdasarkan terbaru (descending)
   * @param {string} column - Nama kolom
   * @returns {NexaModels}
   */
  latest(column = "created_at") {
    return this.orderBy(column, "DESC");
  }

  /**
   * Urutkan berdasarkan terlama (ascending)
   * @param {string} column - Nama kolom
   * @returns {NexaModels}
   */
  oldest(column = "created_at") {
    return this.orderBy(column, "ASC");
  }

  /**
   * Urutkan secara acak
   * @returns {NexaModels}
   */
  inRandomOrder() {
    return this.orderBy("RAND()");
  }

  /**
   * Set LIMIT
   * @param {number} limit - Nilai limit
   * @returns {NexaModels}
   */
  limit(limit) {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set OFFSET
   * @param {number} offset - Nilai offset
   * @returns {NexaModels}
   */
  offset(offset) {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Alias untuk limit
   * @param {number} value - Nilai limit
   * @returns {NexaModels}
   */
  take(value) {
    return this.limit(value);
  }

  /**
   * Alias untuk offset
   * @param {number} value - Nilai offset
   * @returns {NexaModels}
   */
  skip(value) {
    return this.offset(value);
  }

  /**
   * Tambah klausa GROUP BY
   * @param {string|Array} columns - Nama kolom
   * @returns {NexaModels}
   */
  groupBy(columns) {
    this.groupByFields = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  /**
   * Tambah klausa HAVING
   * @param {string} column - Nama kolom
   * @param {string} operator - Operator perbandingan
   * @param {*} value - Nilai untuk dibandingkan
   * @returns {NexaModels}
   */
  having(column, operator = null, value = null) {
    if (value === null) {
      value = operator;
      operator = "=";
    }
    this.havingConditions.push([column, operator, value]);
    return this;
  }

  /**
   * Set DISTINCT
   * @param {string|Array} columns - Nama kolom
   * @returns {NexaModels}
   */
  distinct(columns = null) {
    this.isDistinct = true;
    if (columns) {
      const columnStr = Array.isArray(columns) ? columns.join(", ") : columns;
      this.selectFields = `DISTINCT ${columnStr}`;
    } else {
      this.selectFields = `DISTINCT ${this.selectFields}`;
    }
    return this;
  }

  /**
   * Tambah query UNION
   * @param {NexaModels} query - Query untuk union
   * @param {boolean} all - Gunakan UNION ALL
   * @returns {NexaModels}
   */
  union(query, all = false) {
    const unionType = all ? "UNION ALL" : "UNION";
    this.unionQueries.push({ query: query, type: unionType });
    return this;
  }

  /**
   * Tambah query UNION ALL
   * @param {NexaModels} query - Query untuk union
   * @returns {NexaModels}
   */
  unionAll(query) {
    return this.union(query, true);
  }

  /**
   * Bangun query SELECT
   * @returns {string} String query SQL
   */
  toSql() {
    if (!this.tableName) {
      throw new Error("Table name is required");
    }

    let query = `SELECT ${this.selectFields} FROM ${this.tableName}`;

    // Tambahkan joins
    this.joinConditions.forEach((join) => {
      query += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    });

    // Tambahkan kondisi where
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    // Tambahkan group by
    if (this.groupByFields.length > 0) {
      query += ` GROUP BY ${this.groupByFields.join(", ")}`;
    }

    // Tambahkan having
    if (this.havingConditions.length > 0) {
      query += ` HAVING ${this.buildHavingClause()}`;
    }

    // Tambahkan order by
    if (this.orderByFields.length > 0) {
      const orderParts = this.orderByFields.map(
        (order) => `${order[0]} ${order[1]}`
      );
      query += ` ORDER BY ${orderParts.join(", ")}`;
    }

    // Tambahkan union queries
    this.unionQueries.forEach((unionQuery) => {
      query += ` ${unionQuery.type} ${unionQuery.query.toSql()}`;
    });

    // Tambahkan limit dan offset
    if (this.limitValue !== null) {
      query += ` LIMIT ${this.limitValue}`;
      if (this.offsetValue !== null) {
        query += ` OFFSET ${this.offsetValue}`;
      }
    }

    return query;
  }

  /**
   * Bangun query INSERT
   * @param {Object} data - Data untuk dimasukkan
   * @returns {string} Query SQL INSERT
   */
  insertSql(data) {
    if (!this.tableName) {
      throw new Error("Table name is required");
    }

    if (!data || Object.keys(data).length === 0) {
      throw new Error("Data cannot be empty for insert");
    }

    const columns = Object.keys(data).join(", ");
    const values = Object.values(data)
      .map((value) => this.escapeValue(value))
      .join(", ");

    return `INSERT INTO ${this.tableName} (${columns}) VALUES (${values})`;
  }

  /**
   * Bangun query INSERT MANY
   * @param {Array} data - Array objek data
   * @returns {string} Query SQL INSERT
   */
  insertManySql(data) {
    if (!this.tableName) {
      throw new Error("Table name is required");
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Data must be a non-empty array");
    }

    const firstRow = data[0];
    const columns = Object.keys(firstRow).join(", ");

    const valueRows = data.map((row) => {
      const values = Object.keys(firstRow).map((key) =>
        this.escapeValue(row[key] || null)
      );
      return `(${values.join(", ")})`;
    });

    return `INSERT INTO ${this.tableName} (${columns}) VALUES ${valueRows.join(
      ", "
    )}`;
  }

  /**
   * Bangun query UPDATE
   * @param {Object} data - Data untuk diperbarui
   * @returns {string} Query SQL UPDATE
   */
  updateSql(data) {
    if (!this.tableName) {
      throw new Error("Table name is required");
    }

    if (!data || Object.keys(data).length === 0) {
      throw new Error("Data cannot be empty for update");
    }

    const setParts = Object.entries(data).map(([key, value]) => {
      return `${key} = ${this.escapeValue(value)}`;
    });

    let query = `UPDATE ${this.tableName} SET ${setParts.join(", ")}`;

    // Add where conditions
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    return query;
  }

  /**
   * Bangun query DELETE
   * @returns {string} Query SQL DELETE
   */
  deleteSql() {
    if (!this.tableName) {
      throw new Error("Table name is required");
    }

    let query = `DELETE FROM ${this.tableName}`;

    // Add where conditions
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    return query;
  }

  /**
   * Bangun query COUNT
   * @param {string} column - Kolom untuk dihitung
   * @returns {string} Query SQL COUNT
   */
  countSql(column = "*") {
    const originalSelect = this.selectFields;
    this.selectFields = `COUNT(${column}) as count`;
    const query = this.toSql();
    this.selectFields = originalSelect;
    return query;
  }

  /**
   * Bangun query agregat
   * @param {string} func - Fungsi agregat (SUM, AVG, MAX, MIN)
   * @param {string} column - Nama kolom
   * @returns {string} Query SQL agregat
   */
  aggregateSql(func, column) {
    const originalSelect = this.selectFields;
    this.selectFields = `${func.toUpperCase()}(${column}) as ${func.toLowerCase()}`;
    const query = this.toSql();
    this.selectFields = originalSelect;
    return query;
  }

  /**
   * Bangun query SUM
   * @param {string} column - Kolom untuk dijumlahkan
   * @returns {string} Query SQL SUM
   */
  sumSql(column) {
    return this.aggregateSql("SUM", column);
  }

  /**
   * Bangun query AVG
   * @param {string} column - Kolom untuk dirata-rata
   * @returns {string} Query SQL AVG
   */
  avgSql(column) {
    return this.aggregateSql("AVG", column);
  }

  /**
   * Bangun query MAX
   * @param {string} column - Kolom untuk mendapatkan nilai maksimum
   * @returns {string} Query SQL MAX
   */
  maxSql(column) {
    return this.aggregateSql("MAX", column);
  }

  /**
   * Bangun query MIN
   * @param {string} column - Kolom untuk mendapatkan nilai minimum
   * @returns {string} Query SQL MIN
   */
  minSql(column) {
    return this.aggregateSql("MIN", column);
  }

  /**
   * Hitung record berdasarkan beberapa kondisi menggunakan CASE WHEN
   * @param {string} column - Kolom untuk memeriksa kondisi
   * @param {Array} conditions - Array kondisi untuk dihitung
   * @param {string} countColumn - Kolom untuk dihitung (default: '*') atau 'percentage' untuk kalkulasi persentase
   * @returns {string} Query SQL dengan statement CASE WHEN
   *
   * Contoh:
   * countByConditions('status', ['active', 'inactive', 'pending'])
   * countByConditions('status', ['completed', 'pending'], 'percentage')
   */
  countByConditions(column, conditions, countColumn = "*") {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new Error("Conditions must be a non-empty array");
    }

    const includePercentage = countColumn === "percentage";
    if (includePercentage) {
      countColumn = "*"; // Use default count for percentage calculation
    }

    // Build CASE WHEN statements for each condition
    const caseStatements = [];
    conditions.forEach((condition) => {
      const cleanCondition = condition.replace(/[^a-zA-Z0-9_]/g, "_");
      caseStatements.push(
        `SUM(CASE WHEN ${column} = ${this.escapeValue(
          condition
        )} THEN 1 ELSE 0 END) as count_${cleanCondition}`
      );
    });

    // Add total count for percentage calculation
    if (includePercentage) {
      caseStatements.push(`COUNT(${countColumn}) as total_count`);
    }

    const originalSelect = this.selectFields;
    this.selectFields = caseStatements.join(", ");
    const query = this.toSql();
    this.selectFields = originalSelect;

    return query;
  }

  /**
   * Hitung record berdasarkan kondisi dengan kalkulasi persentase
   * @param {string} column - Kolom untuk memeriksa kondisi
   * @param {Array} conditions - Array kondisi untuk dihitung
   * @returns {string} Query SQL dengan hitungan dan persentase
   */
  countWithPercentage(column, conditions) {
    return this.countByConditions(column, conditions, "percentage");
  }

  /**
   * Dapatkan hanya nilai persentase untuk kondisi
   * @param {string} column - Kolom untuk memeriksa kondisi
   * @param {Array} conditions - Array kondisi untuk dihitung
   * @param {number} decimals - Jumlah tempat desimal (default: 1)
   * @returns {string} Query SQL untuk kalkulasi persentase
   */
  getPercentages(column, conditions, decimals = 1) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new Error("Conditions must be a non-empty array");
    }

    // Build CASE WHEN statements for each condition
    const caseStatements = [];
    conditions.forEach((condition) => {
      const cleanCondition = condition.replace(/[^a-zA-Z0-9_]/g, "_");
      caseStatements.push(
        `SUM(CASE WHEN ${column} = ${this.escapeValue(
          condition
        )} THEN 1 ELSE 0 END) as count_${cleanCondition}`
      );
    });

    // Add total count
    caseStatements.push("COUNT(*) as total_count");

    const originalSelect = this.selectFields;
    this.selectFields = caseStatements.join(", ");
    const query = this.toSql();
    this.selectFields = originalSelect;

    return query;
  }

  /**
   * Hitung record yang dikelompokkan berdasarkan kolom tertentu
   * @param {string} groupColumn - Kolom untuk pengelompokan
   * @param {string} countColumn - Kolom untuk dihitung (default: *)
   * @param {Array} filterValues - Array opsional untuk filter nilai tertentu saja
   * @returns {string} Query SQL GROUP BY
   */
  countByGroup(groupColumn, countColumn = "*", filterValues = []) {
    const originalSelect = this.selectFields;
    const originalGroupBy = this.groupByFields;

    this.selectFields = `${groupColumn}, COUNT(${countColumn}) as count`;
    this.groupByFields = [groupColumn];

    // Add filter for specific values if provided
    if (Array.isArray(filterValues) && filterValues.length > 0) {
      this.whereIn(groupColumn, filterValues);
    }

    const query = this.toSql();

    // Restore original state
    this.selectFields = originalSelect;
    this.groupByFields = originalGroupBy;

    return query;
  }

  /**
   * Count records with multiple WHERE conditions in one query
   * @param {Object} whereConditions - Object with condition labels and their WHERE clauses
   * @param {string} countColumn - Column to count (default: *)
   * @returns {string} SQL query with multiple CASE WHEN conditions
   *
   * Example:
   * countMultipleWhere({
   *   'active_users': ['status', '=', 'active'],
   *   'premium_users': ['plan', '=', 'premium'],
   *   'recent_users': ['created_at', '>=', '2024-01-01']
   * })
   */
  countMultipleWhere(whereConditions, countColumn = "*") {
    if (!whereConditions || Object.keys(whereConditions).length === 0) {
      throw new Error("whereConditions must be a non-empty object");
    }

    // Build CASE WHEN statements for each condition
    const caseStatements = [];

    Object.entries(whereConditions).forEach(([label, condition]) => {
      const [column, operator, value] = condition;
      const cleanLabel = label.replace(/[^a-zA-Z0-9_]/g, "_");
      caseStatements.push(
        `SUM(CASE WHEN ${column} ${operator} ${this.escapeValue(
          value
        )} THEN 1 ELSE 0 END) as count_${cleanLabel}`
      );
    });

    const originalSelect = this.selectFields;
    this.selectFields = caseStatements.join(", ");
    const query = this.toSql();
    this.selectFields = originalSelect;

    return query;
  }

  /**
   * Quick count for common status-based conditions
   * @param {string} statusColumn - Column name for status (default: 'status')
   * @param {Array} statusValues - Array of status values to count
   * @returns {string} SQL query for status counting
   */
  quickStatusCount(
    statusColumn = "status",
    statusValues = ["active", "inactive"]
  ) {
    return this.countByConditions(statusColumn, statusValues);
  }

  /**
   * Count records by multiple columns (aggregate functions)
   * @param {Array} columns - Array of columns to count/sum
   * @param {string} operation - Operation to perform: 'count', 'sum', 'avg', 'max', 'min', 'percentage'
   * @param {boolean} includePercentage - Whether to include percentage calculation for sum operations
   * @returns {string} SQL query with aggregate functions
   */
  countByColumn(columns, operation = "count", includePercentage = false) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error("Columns must be a non-empty array");
    }

    const validOperations = ["count", "sum", "avg", "max", "min", "percentage"];
    operation = operation.toLowerCase();

    if (!validOperations.includes(operation)) {
      throw new Error(
        `Invalid operation. Allowed: ${validOperations.join(", ")}`
      );
    }

    // Handle percentage operation
    const isPercentageOnly = operation === "percentage";
    if (isPercentageOnly) {
      operation = "sum"; // Use sum for percentage calculation
      includePercentage = true;
    }

    // Build aggregate statements for each column
    const aggregateStatements = [];
    columns.forEach((column) => {
      const cleanColumn = column.replace(/[^a-zA-Z0-9_]/g, "_");

      switch (operation) {
        case "count":
          // Count non-null values
          aggregateStatements.push(
            `COUNT(${column}) as ${operation}_${cleanColumn}`
          );
          break;
        case "sum":
          aggregateStatements.push(
            `SUM(${column}) as ${operation}_${cleanColumn}`
          );
          break;
        case "avg":
          aggregateStatements.push(
            `AVG(${column}) as ${operation}_${cleanColumn}`
          );
          break;
        case "max":
          aggregateStatements.push(
            `MAX(${column}) as ${operation}_${cleanColumn}`
          );
          break;
        case "min":
          aggregateStatements.push(
            `MIN(${column}) as ${operation}_${cleanColumn}`
          );
          break;
      }
    });

    // Add total sum for percentage calculation
    if (includePercentage && operation === "sum") {
      const totalSumColumns = columns.map((column) => `COALESCE(${column}, 0)`);
      aggregateStatements.push(
        `SUM(${totalSumColumns.join(" + ")}) as total_sum`
      );
    }

    const originalSelect = this.selectFields;
    this.selectFields = aggregateStatements.join(", ");
    const query = this.toSql();
    this.selectFields = originalSelect;

    return query;
  }

  /**
   * Count non-null values for multiple columns (shortcut for countByColumn with 'count')
   * @param {Array} columns - Array of columns to count non-null values
   * @returns {string} SQL query for counting columns
   */
  countColumns(columns) {
    return this.countByColumn(columns, "count");
  }

  /**
   * Sum values for multiple columns (shortcut for countByColumn with 'sum')
   * @param {Array} columns - Array of columns to sum
   * @returns {string} SQL query for summing columns
   */
  sumColumns(columns) {
    return this.countByColumn(columns, "sum");
  }

  /**
   * Get average values for multiple columns (shortcut for countByColumn with 'avg')
   * @param {Array} columns - Array of columns to average
   * @returns {string} SQL query for averaging columns
   */
  avgColumns(columns) {
    return this.countByColumn(columns, "avg");
  }

  /**
   * Sum values for multiple columns with percentage calculation
   * @param {Array} columns - Array of columns to sum with percentage
   * @returns {string} SQL query for sum with percentages
   */
  sumColumnsWithPercentage(columns) {
    return this.countByColumn(columns, "sum", true);
  }

  /**
   * Get percentage distribution for multiple columns (based on sum)
   * @param {Array} columns - Array of columns to calculate percentage
   * @returns {string} SQL query for column percentages
   */
  getColumnPercentages(columns) {
    return this.countByColumn(columns, "percentage");
  }

  /**
   * Periksa apakah record ada
   * @returns {string} Query SQL untuk memeriksa keberadaan
   */
  existsSql() {
    const originalSelect = this.selectFields;
    this.selectFields = "1";
    this.limitValue = 1;
    const query = this.toSql();
    this.selectFields = originalSelect;
    this.limitValue = null;
    return query;
  }

  /**
   * Dapatkan nilai dari satu kolom
   * @param {string} column - Nama kolom
   * @returns {string} Query SQL untuk nilai kolom tunggal
   */
  valueSql(column) {
    const originalSelect = this.selectFields;
    this.selectFields = column;
    this.limitValue = 1;
    const query = this.toSql();
    this.selectFields = originalSelect;
    this.limitValue = null;
    return query;
  }

  /**
   * Get array of values from a single column (PLUCK equivalent)
   * @param {string} column - Column to pluck
   * @param {string|null} key - Optional key column
   * @returns {string} SQL query for plucking column values
   */
  pluckSql(column, key = null) {
    const originalSelect = this.selectFields;

    if (key) {
      this.selectFields = `${key}, ${column}`;
    } else {
      this.selectFields = column;
    }

    const query = this.toSql();
    this.selectFields = originalSelect;

    return query;
  }

  /**
   * Increment a column value
   * @param {string} column - Column to increment
   * @param {number} amount - Amount to increment (default: 1)
   * @param {Object} extra - Additional columns to update
   * @returns {string} SQL UPDATE query with increment
   */
  incrementSql(column, amount = 1, extra = {}) {
    const updates = [`${column} = ${column} + ${amount}`];

    Object.entries(extra).forEach(([key, value]) => {
      updates.push(`${key} = ${this.escapeValue(value)}`);
    });

    let query = `UPDATE ${this.tableName} SET ${updates.join(", ")}`;

    // Add where conditions
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    return query;
  }

  /**
   * Decrement a column value
   * @param {string} column - Column to decrement
   * @param {number} amount - Amount to decrement (default: 1)
   * @param {Object} extra - Additional columns to update
   * @returns {string} SQL UPDATE query with decrement
   */
  decrementSql(column, amount = 1, extra = {}) {
    return this.incrementSql(column, -amount, extra);
  }

  /**
   * Generate SQL for get() - SELECT query
   * @returns {string} Complete SELECT SQL query
   */
  getSql() {
    return this.toSql();
  }

  /**
   * Generate SQL for first() - SELECT with LIMIT 1
   * @returns {string} SELECT SQL query with LIMIT 1
   */
  firstSql() {
    const originalLimit = this.limitValue;
    this.limitValue = 1;
    const query = this.toSql();
    this.limitValue = originalLimit;
    return query;
  }

  /**
   * Generate SQL for last() - SELECT with ORDER BY id DESC LIMIT 1
   * @param {string} column - Column to order by (default: 'id')
   * @returns {string} SELECT SQL query for last record
   */
  lastSql(column = "id") {
    const originalOrderBy = this.orderByFields;
    const originalLimit = this.limitValue;

    this.orderByFields = [[column, "DESC"]];
    this.limitValue = 1;

    const query = this.toSql();

    // Restore original state
    this.orderByFields = originalOrderBy;
    this.limitValue = originalLimit;

    return query;
  }

  /**
   * Generate SQL for insert() - INSERT query
   * @param {Object} data - Data to insert
   * @returns {string} INSERT SQL query
   */
  insertSql(data) {
    if (!data || Object.keys(data).length === 0) {
      throw new Error("Insert data cannot be empty");
    }

    const columns = Object.keys(data);
    const values = Object.values(data);

    // Validate column names
    columns.forEach((col) => this.validateColumnName(col));

    const columnList = columns.join(", ");
    const valueList = values.map((val) => this.escapeValue(val)).join(", ");

    return `INSERT INTO ${this.tableName} (${columnList}) VALUES (${valueList})`;
  }

  /**
   * Generate SQL for insertMany() - INSERT with multiple VALUES
   * @param {Array} dataArray - Array of data objects to insert
   * @returns {string} INSERT SQL query with multiple VALUES
   */
  insertManySql(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new Error("Insert data array cannot be empty");
    }

    const firstRow = dataArray[0];
    const columns = Object.keys(firstRow);

    // Validate column names
    columns.forEach((col) => this.validateColumnName(col));

    const columnList = columns.join(", ");

    // Build VALUES clauses
    const valuesClauses = dataArray.map((row) => {
      const values = columns.map((col) => this.escapeValue(row[col] || null));
      return `(${values.join(", ")})`;
    });

    return `INSERT INTO ${
      this.tableName
    } (${columnList}) VALUES ${valuesClauses.join(", ")}`;
  }

  /**
   * Generate SQL for upsert() - INSERT ... ON DUPLICATE KEY UPDATE
   * @param {Object} data - Data to insert/update
   * @param {Array} updateColumns - Columns to update on duplicate (optional)
   * @returns {string} INSERT ... ON DUPLICATE KEY UPDATE SQL query
   */
  upsertSql(data, updateColumns = []) {
    if (!data || Object.keys(data).length === 0) {
      throw new Error("Upsert data cannot be empty");
    }

    const columns = Object.keys(data);
    const values = Object.values(data);

    // Validate column names
    columns.forEach((col) => this.validateColumnName(col));

    const columnList = columns.join(", ");
    const valueList = values.map((val) => this.escapeValue(val)).join(", ");

    let query = `INSERT INTO ${this.tableName} (${columnList}) VALUES (${valueList})`;

    // Add ON DUPLICATE KEY UPDATE clause
    if (updateColumns.length > 0) {
      const updates = updateColumns.map((col) => `${col} = VALUES(${col})`);
      query += ` ON DUPLICATE KEY UPDATE ${updates.join(", ")}`;
    } else {
      // Update all columns except id (assuming id is primary key)
      const updates = columns
        .filter((col) => col !== "id")
        .map((col) => `${col} = VALUES(${col})`);

      if (updates.length > 0) {
        query += ` ON DUPLICATE KEY UPDATE ${updates.join(", ")}`;
      }
    }

    return query;
  }

  /**
   * Generate SQL for update() - UPDATE query
   * @param {Object} data - Data to update
   * @returns {string} UPDATE SQL query
   */
  updateSql(data) {
    if (!data || Object.keys(data).length === 0) {
      throw new Error("Update data cannot be empty");
    }

    // Validate column names
    Object.keys(data).forEach((col) => this.validateColumnName(col));

    const setParts = [];
    Object.entries(data).forEach(([column, value]) => {
      setParts.push(`${column} = ${this.escapeValue(value)}`);
    });

    let query = `UPDATE ${this.tableName} SET ${setParts.join(", ")}`;

    // Add WHERE clause
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    return query;
  }

  /**
   * Generate SQL for delete() - DELETE query
   * @returns {string} DELETE SQL query
   */
  deleteSql() {
    let query = `DELETE FROM ${this.tableName}`;

    // Add WHERE clause
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    } else {
      throw new Error(
        "DELETE without WHERE clause is not allowed for safety. Use forceDeleteSql() if you really need to delete all records."
      );
    }

    return query;
  }

  /**
   * Generate SQL for forceDelete() - DELETE without WHERE clause
   * @returns {string} DELETE SQL query without WHERE clause
   */
  forceDeleteSql() {
    let query = `DELETE FROM ${this.tableName}`;

    // Add WHERE clause if exists
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.buildWhereClause()}`;
    }

    return query;
  }

  /**
   * Generate SQL for transaction() - BEGIN TRANSACTION
   * @param {Array} queries - Array of SQL queries to execute in transaction
   * @returns {Object} Transaction SQL object with begin, queries, commit, rollback
   */
  transactionSql(queries = []) {
    return {
      begin: "BEGIN TRANSACTION",
      queries: queries,
      commit: "COMMIT",
      rollback: "ROLLBACK",
    };
  }

  /**
   * Generate raw SQL query
   * @param {string} sql - Raw SQL query
   * @param {Array} bindings - Parameter bindings (optional)
   * @returns {string} Raw SQL query
   */
  rawSql(sql, bindings = []) {
    if (!sql || typeof sql !== "string") {
      throw new Error("Raw SQL query cannot be empty");
    }

    // If bindings are provided, replace placeholders
    if (bindings.length > 0) {
      let bindingIndex = 0;
      return sql.replace(/\?/g, () => {
        if (bindingIndex < bindings.length) {
          return this.escapeValue(bindings[bindingIndex++]);
        }
        return "?";
      });
    }

    return sql;
  }

  /**
   * Get parameter bindings for prepared statements
   * @returns {Array} Array of parameter bindings
   */
  getBindings() {
    const bindings = [];

    // Extract bindings from WHERE conditions
    this.whereConditions.forEach((condition) => {
      const [column, operator, value, boolean, type] = condition;

      switch (type) {
        case "IN":
        case "NOT_IN":
          if (Array.isArray(value)) {
            bindings.push(...value);
          }
          break;
        case "BETWEEN":
        case "NOT_BETWEEN":
          if (Array.isArray(value) && value.length === 2) {
            bindings.push(value[0], value[1]);
          }
          break;
        case "NULL":
        case "NOT_NULL":
          // No bindings needed for NULL checks
          break;
        case "RAW":
          // Nilai sudah termasuk literal di SQL (escapeValue)
          break;
        default:
          if (value !== null && value !== undefined) {
            bindings.push(value);
          }
          break;
      }
    });

    // Extract bindings from HAVING conditions
    this.havingConditions.forEach((condition) => {
      const [column, operator, value] = condition;
      if (value !== null && value !== undefined) {
        bindings.push(value);
      }
    });

    return bindings;
  }

  /**
   * Generate SQL with parameter placeholders for prepared statements
   * @returns {Object} Object with sql and bindings
   */
  toSqlWithBindings() {
    const bindings = this.getBindings();
    let paramIndex = 0;

    // Build query with placeholders
    let query = `SELECT ${this.selectFields} FROM ${this.tableName}`;

    // Add joins
    this.joinConditions.forEach((join) => {
      query += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    });

    // Add where conditions with placeholders
    if (this.whereConditions.length > 0) {
      const whereClause = this.buildWhereClauseWithPlaceholders();
      query += ` WHERE ${whereClause}`;
    }

    // Add group by
    if (this.groupByFields.length > 0) {
      query += ` GROUP BY ${this.groupByFields.join(", ")}`;
    }

    // Add having with placeholders
    if (this.havingConditions.length > 0) {
      const havingClause = this.buildHavingClauseWithPlaceholders();
      query += ` HAVING ${havingClause}`;
    }

    // Add order by
    if (this.orderByFields.length > 0) {
      const orderParts = this.orderByFields.map(
        (order) => `${order[0]} ${order[1]}`
      );
      query += ` ORDER BY ${orderParts.join(", ")}`;
    }

    // Add limit and offset
    if (this.limitValue !== null) {
      query += ` LIMIT ${this.limitValue}`;
      if (this.offsetValue !== null) {
        query += ` OFFSET ${this.offsetValue}`;
      }
    }

    return {
      sql: query,
      bindings: bindings,
    };
  }

  /**
   * Build WHERE clause with parameter placeholders
   * @returns {string} WHERE clause with ? placeholders
   */
  buildWhereClauseWithPlaceholders() {
    const conditions = [];
    let isFirst = true;

    this.whereConditions.forEach((where) => {
      const [column, operator, value, boolean, type] = where;
      let condition = "";

      // Add boolean operator (AND/OR) except for first condition
      if (!isFirst) {
        condition += ` ${boolean} `;
      }

      switch (type) {
        case "IN":
          const inPlaceholders = value.map(() => "?").join(", ");
          condition += `${column} IN (${inPlaceholders})`;
          break;

        case "NOT_IN":
          const notInPlaceholders = value.map(() => "?").join(", ");
          condition += `${column} NOT IN (${notInPlaceholders})`;
          break;

        case "BETWEEN":
          condition += `${column} BETWEEN ? AND ?`;
          break;

        case "NOT_BETWEEN":
          condition += `${column} NOT BETWEEN ? AND ?`;
          break;

        case "NULL":
          condition += `${column} IS NULL`;
          break;

        case "NOT_NULL":
          condition += `${column} IS NOT NULL`;
          break;

        case "RAW":
          condition += `(${value})`;
          break;

        case "BASIC":
        default: // BASIC
          condition += `${column} ${operator} ?`;
          break;
      }

      conditions.push(condition);
      isFirst = false;
    });

    return conditions.join("");
  }

  /**
   * Build HAVING clause with parameter placeholders
   * @returns {string} HAVING clause with ? placeholders
   */
  buildHavingClauseWithPlaceholders() {
    const conditions = [];
    this.havingConditions.forEach((having) => {
      conditions.push(`${having[0]} ${having[1]} ?`);
    });
    return conditions.join(" AND ");
  }

  /**
   * Generate SQL for exists() check
   * @returns {string} EXISTS SQL query
   */
  existsSql() {
    const originalSelect = this.selectFields;
    this.selectFields = "1";
    this.limitValue = 1;
    const query = this.toSql();
    this.selectFields = originalSelect;
    this.limitValue = null;
    return query;
  }

  /**
   * Generate SQL for firstOrFail() - same as first() but indicates it should throw error if not found
   * @returns {string} SELECT SQL query with LIMIT 1
   */
  firstOrFailSql() {
    return this.firstSql();
  }

  /**
   * Generate SQL for find() by ID
   * @param {number|string} id - ID to find
   * @param {string} column - ID column name (default: 'id')
   * @returns {string} SELECT SQL query with WHERE id = ?
   */
  findSql(id, column = "id") {
    const originalWhere = this.whereConditions;
    const originalLimit = this.limitValue;

    this.whereConditions = [[column, "=", id, "AND"]];
    this.limitValue = 1;

    const query = this.toSql();

    // Restore original state
    this.whereConditions = originalWhere;
    this.limitValue = originalLimit;

    return query;
  }

  /**
   * Generate SQL for chunk processing
   * @param {number} size - Chunk size
   * @param {number} offset - Starting offset
   * @returns {string} SELECT SQL query with LIMIT and OFFSET for chunking
   */
  chunkSql(size, offset = 0) {
    const originalLimit = this.limitValue;
    const originalOffset = this.offsetValue;

    this.limitValue = size;
    this.offsetValue = offset;

    const query = this.toSql();

    // Restore original state
    this.limitValue = originalLimit;
    this.offsetValue = originalOffset;

    return query;
  }

  /**
   * Build WHERE clause
   * @returns {string} WHERE clause
   */
  buildWhereClause() {
    const conditions = [];
    let isFirst = true;

    this.whereConditions.forEach((where) => {
      const [column, operator, value, boolean, type] = where;
      let condition = "";

      // Add boolean operator (AND/OR) except for first condition
      if (!isFirst) {
        condition += ` ${boolean} `;
      }

      switch (type) {
        case "IN":
          const inValues = value.map((v) => this.escapeValue(v)).join(", ");
          condition += `${column} IN (${inValues})`;
          break;

        case "NOT_IN":
          const notInValues = value.map((v) => this.escapeValue(v)).join(", ");
          condition += `${column} NOT IN (${notInValues})`;
          break;

        case "BETWEEN":
          condition += `${column} BETWEEN ${this.escapeValue(
            value[0]
          )} AND ${this.escapeValue(value[1])}`;
          break;

        case "NOT_BETWEEN":
          condition += `${column} NOT BETWEEN ${this.escapeValue(
            value[0]
          )} AND ${this.escapeValue(value[1])}`;
          break;

        case "NULL":
          condition += `${column} IS NULL`;
          break;

        case "NOT_NULL":
          condition += `${column} IS NOT NULL`;
          break;

        case "RAW":
          condition += `(${value})`;
          break;

        case "BASIC":
        default: // BASIC
          condition += `${column} ${operator} ${this.escapeValue(value)}`;
          break;
      }

      conditions.push(condition);
      isFirst = false;
    });

    return conditions.join("");
  }

  // ========== DATABASE INTROSPECTION METHODS ==========

  /**
   * Generate SQL to show all tables in database
   * @param {string} database - Database name (optional)
   * @returns {string} SHOW TABLES SQL query
   */
  showTablesSql(database = null) {
    if (database) {
      return `SHOW TABLES FROM ${database}`;
    }
    return "SHOW TABLES";
  }

  /**
   * Generate SQL to get detailed information about all tables
   * @param {string} database - Database name (optional)
   * @returns {string} SQL query to get tables information
   */
  getTablesInfoSql(database = null) {
    if (database) {
      return `SELECT 
        TABLE_NAME as table_name,
        ENGINE as engine,
        TABLE_ROWS as row_count,
        DATA_LENGTH as data_length,
        INDEX_LENGTH as index_length,
        CREATE_TIME as created_at,
        UPDATE_TIME as updated_at,
        TABLE_COMMENT as comment
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${database}'
      ORDER BY TABLE_NAME`;
    }
    return `SELECT 
      TABLE_NAME as table_name,
      ENGINE as engine,
      TABLE_ROWS as row_count,
      DATA_LENGTH as data_length,
      INDEX_LENGTH as index_length,
      CREATE_TIME as created_at,
      UPDATE_TIME as updated_at,
      TABLE_COMMENT as comment
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME`;
  }

  /**
   * Generate SQL to get column information for a table
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @returns {string} SQL query to get table columns
   */
  getTableColumnsSql(tableName = null) {
    const table = tableName || this.tableName;
    return `SELECT 
      COLUMN_NAME as column_name,
      DATA_TYPE as data_type,
      IS_NULLABLE as is_nullable,
      COLUMN_DEFAULT as default_value,
      CHARACTER_MAXIMUM_LENGTH as max_length,
      NUMERIC_PRECISION as precision,
      NUMERIC_SCALE as scale,
      COLUMN_KEY as key_type,
      EXTRA as extra,
      COLUMN_COMMENT as comment
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = '${table}'
    ORDER BY ORDINAL_POSITION`;
  }

  /**
   * Generate SQL to check if table exists
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @param {string} database - Database name (optional)
   * @returns {string} SQL query to check table existence
   */
  tableExistsSql(tableName = null, database = null) {
    const table = tableName || this.tableName;
    const dbCondition = database
      ? `TABLE_SCHEMA = '${database}'`
      : `TABLE_SCHEMA = DATABASE()`;

    return `SELECT COUNT(*) as table_exists 
    FROM information_schema.TABLES 
    WHERE ${dbCondition} 
    AND TABLE_NAME = '${table}'`;
  }

  /**
   * Generate SQL to get database information
   * @param {string} database - Database name (optional)
   * @returns {string} SQL query to get database info
   */
  getDatabaseInfoSql(database = null) {
    if (database) {
      return `SELECT 
        SCHEMA_NAME as database_name,
        DEFAULT_CHARACTER_SET_NAME as charset,
        DEFAULT_COLLATION_NAME as collation
      FROM information_schema.SCHEMATA 
      WHERE SCHEMA_NAME = '${database}'`;
    }
    return `SELECT 
      DATABASE() as database_name,
      @@character_set_database as charset,
      @@collation_database as collation,
      VERSION() as mysql_version,
      USER() as current_user,
      CONNECTION_ID() as connection_id`;
  }

  // ========== DATABASE MONITORING METHODS ==========

  /**
   * Generate SQL for database health check
   * @returns {Object} Object containing multiple health check queries
   */
  healthCheckSql() {
    return {
      connection: "SELECT 1 as status",
      version: "SELECT VERSION() as mysql_version",
      uptime: "SHOW STATUS LIKE 'Uptime'",
      threads: "SHOW STATUS LIKE 'Threads_connected'",
      queries: "SHOW STATUS LIKE 'Questions'",
      slow_queries: "SHOW STATUS LIKE 'Slow_queries'",
      table_locks: "SHOW STATUS LIKE 'Table_locks_waited'",
      innodb_buffer: "SHOW STATUS LIKE 'Innodb_buffer_pool_hit_rate'",
      processlist: "SHOW PROCESSLIST",
      disk_usage: `SELECT 
        table_schema as database_name,
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
      FROM information_schema.tables 
      GROUP BY table_schema
      ORDER BY size_mb DESC`,
    };
  }

  /**
   * Generate SQL for query benchmarking
   * @param {string} query - Query to benchmark
   * @param {number} iterations - Number of iterations (default: 1)
   * @returns {Object} Benchmark SQL queries
   */
  benchmarkQuerySql(query, iterations = 1) {
    return {
      start_time: "SELECT UNIX_TIMESTAMP(NOW(6)) as start_time",
      query: query,
      end_time: "SELECT UNIX_TIMESTAMP(NOW(6)) as end_time",
      explain: `EXPLAIN ${query}`,
      analyze: `EXPLAIN ANALYZE ${query}`,
      profile_start: "SET profiling = 1",
      profile_query: query,
      profile_show: "SHOW PROFILES",
      profile_detail: "SHOW PROFILE FOR QUERY 1",
      profile_stop: "SET profiling = 0",
    };
  }

  // ========== CACHE MANAGEMENT METHODS ==========

  /**
   * Generate SQL for cache clearing (MySQL Query Cache)
   * @param {string} type - Cache type ('query' or 'all')
   * @returns {string} SQL query to clear cache
   */
  clearCacheSql(type = "query") {
    switch (type) {
      case "query":
        return "FLUSH QUERY CACHE";
      case "all":
        return "FLUSH TABLES";
      case "privileges":
        return "FLUSH PRIVILEGES";
      case "logs":
        return "FLUSH LOGS";
      default:
        return "FLUSH QUERY CACHE";
    }
  }

  /**
   * Generate SQL with cache disabled hint
   * @returns {string} SELECT query with NO_CACHE hint
   */
  withoutCacheSql() {
    const originalSelect = this.selectFields;
    this.selectFields = `SQL_NO_CACHE ${this.selectFields}`;
    const query = this.toSql();
    this.selectFields = originalSelect;
    return query;
  }

  /**
   * Generate SQL with cache enabled hint
   * @returns {string} SELECT query with CACHE hint
   */
  withCacheSql() {
    const originalSelect = this.selectFields;
    this.selectFields = `SQL_CACHE ${this.selectFields}`;
    const query = this.toSql();
    this.selectFields = originalSelect;
    return query;
  }

  /**
   * Generate SQL to get cache statistics
   * @returns {Object} Object containing cache statistics queries
   */
  getCacheStatsSql() {
    return {
      query_cache_size: "SHOW STATUS LIKE 'Qcache_total_blocks'",
      query_cache_hits: "SHOW STATUS LIKE 'Qcache_hits'",
      query_cache_inserts: "SHOW STATUS LIKE 'Qcache_inserts'",
      query_cache_not_cached: "SHOW STATUS LIKE 'Qcache_not_cached'",
      query_cache_lowmem_prunes: "SHOW STATUS LIKE 'Qcache_lowmem_prunes'",
      query_cache_free_memory: "SHOW STATUS LIKE 'Qcache_free_memory'",
      query_cache_free_blocks: "SHOW STATUS LIKE 'Qcache_free_blocks'",
      all_cache_stats: `SHOW STATUS WHERE Variable_name LIKE 'Qcache%'`,
    };
  }

  // ========== CONFIGURATION MANAGEMENT METHODS ==========

  /**
   * Generate SQL for configuration management
   * @param {Object} config - Configuration object
   * @returns {Object} Configuration SQL queries
   */
  configureSql(config = {}) {
    const queries = {};

    // Common MySQL configuration variables
    if (config.query_cache_size) {
      queries.query_cache_size = `SET GLOBAL query_cache_size = ${config.query_cache_size}`;
    }

    if (config.max_connections) {
      queries.max_connections = `SET GLOBAL max_connections = ${config.max_connections}`;
    }

    if (config.innodb_buffer_pool_size) {
      queries.innodb_buffer_pool_size = `SET GLOBAL innodb_buffer_pool_size = ${config.innodb_buffer_pool_size}`;
    }

    if (config.slow_query_log) {
      queries.slow_query_log = `SET GLOBAL slow_query_log = ${
        config.slow_query_log ? "ON" : "OFF"
      }`;
    }

    if (config.long_query_time) {
      queries.long_query_time = `SET GLOBAL long_query_time = ${config.long_query_time}`;
    }

    // Default: show current configuration
    if (Object.keys(queries).length === 0) {
      queries.show_variables = "SHOW VARIABLES";
    }

    return queries;
  }

  /**
   * Generate SQL to get current configuration
   * @param {string} variable - Specific variable name (optional)
   * @returns {string} SQL query to get configuration
   */
  getConfigSql(variable = null) {
    if (variable) {
      return `SHOW VARIABLES LIKE '${variable}'`;
    }
    return `SELECT 
      'query_cache_size' as variable_name, @@query_cache_size as value
      UNION ALL SELECT 'max_connections', @@max_connections
      UNION ALL SELECT 'innodb_buffer_pool_size', @@innodb_buffer_pool_size
      UNION ALL SELECT 'slow_query_log', @@slow_query_log
      UNION ALL SELECT 'long_query_time', @@long_query_time
      UNION ALL SELECT 'sql_mode', @@sql_mode
      UNION ALL SELECT 'character_set_server', @@character_set_server
      UNION ALL SELECT 'collation_server', @@collation_server`;
  }

  // ========== PERFORMANCE MONITORING METHODS ==========

  /**
   * Generate SQL to get performance statistics
   * @param {string} category - Performance category ('all', 'queries', 'connections', 'innodb', 'cache')
   * @returns {Object} Performance statistics queries
   */
  getPerformanceStatsSql(category = "all") {
    const stats = {};

    if (category === "all" || category === "queries") {
      stats.query_stats = `SHOW STATUS WHERE Variable_name IN (
        'Questions', 'Queries', 'Slow_queries', 'Select_full_join',
        'Select_full_range_join', 'Select_range', 'Select_range_check',
        'Select_scan', 'Sort_merge_passes', 'Sort_range', 'Sort_rows', 'Sort_scan'
      )`;
    }

    if (category === "all" || category === "connections") {
      stats.connection_stats = `SHOW STATUS WHERE Variable_name IN (
        'Connections', 'Max_used_connections', 'Threads_connected',
        'Threads_created', 'Threads_running', 'Aborted_connects', 'Aborted_clients'
      )`;
    }

    if (category === "all" || category === "innodb") {
      stats.innodb_stats = `SHOW STATUS WHERE Variable_name LIKE 'Innodb%' 
        AND Variable_name IN (
          'Innodb_buffer_pool_hit_rate', 'Innodb_buffer_pool_reads',
          'Innodb_buffer_pool_read_requests', 'Innodb_data_reads',
          'Innodb_data_writes', 'Innodb_log_waits', 'Innodb_row_lock_waits'
        )`;
    }

    if (category === "all" || category === "cache") {
      stats.cache_stats = `SHOW STATUS WHERE Variable_name LIKE 'Qcache%'`;
    }

    if (category === "all" || category === "tables") {
      stats.table_stats = `SHOW STATUS WHERE Variable_name IN (
        'Table_locks_immediate', 'Table_locks_waited', 'Open_tables',
        'Opened_tables', 'Table_open_cache_hits', 'Table_open_cache_misses'
      )`;
    }

    // Summary query for all categories
    if (category === "all") {
      stats.performance_summary = `SELECT 
        'Uptime' as metric, VARIABLE_VALUE as value FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Uptime'
        UNION ALL SELECT 'Questions', VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Questions'
        UNION ALL SELECT 'Slow_queries', VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Slow_queries'
        UNION ALL SELECT 'Connections', VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Connections'
        UNION ALL SELECT 'Threads_connected', VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Threads_connected'
        UNION ALL SELECT 'Innodb_buffer_pool_hit_rate', ROUND((1 - (VARIABLE_VALUE / (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests'))) * 100, 2) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Innodb_buffer_pool_reads'`;
    }

    return stats;
  }

  /**
   * Generate SQL for query execution plan analysis
   * @param {string} query - Query to analyze (optional, uses current query if not provided)
   * @returns {Object} Query analysis SQL queries
   */
  queryAnalysisSql(query = null) {
    const targetQuery = query || this.toSql();

    return {
      explain: `EXPLAIN ${targetQuery}`,
      explain_extended: `EXPLAIN EXTENDED ${targetQuery}`,
      explain_format_json: `EXPLAIN FORMAT=JSON ${targetQuery}`,
      show_warnings: "SHOW WARNINGS",
      checksum: `CHECKSUM TABLE ${this.tableName}`,
      analyze_table: `ANALYZE TABLE ${this.tableName}`,
      optimize_table: `OPTIMIZE TABLE ${this.tableName}`,
    };
  }

  /**
   * Generate SQL for index analysis
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @returns {Object} Index analysis SQL queries
   */
  indexAnalysisSql(tableName = null) {
    const table = tableName || this.tableName;

    return {
      show_indexes: `SHOW INDEX FROM ${table}`,
      index_usage: `SELECT 
        TABLE_NAME,
        INDEX_NAME,
        COLUMN_NAME,
        CARDINALITY,
        SUB_PART,
        NULLABLE,
        INDEX_TYPE
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${table}'
      ORDER BY SEQ_IN_INDEX`,
      unused_indexes: `SELECT 
        s.TABLE_SCHEMA,
        s.TABLE_NAME,
        s.INDEX_NAME
      FROM information_schema.STATISTICS s
      LEFT JOIN information_schema.INDEX_STATISTICS i 
        ON s.TABLE_SCHEMA = i.TABLE_SCHEMA 
        AND s.TABLE_NAME = i.TABLE_NAME 
        AND s.INDEX_NAME = i.INDEX_NAME
      WHERE s.TABLE_SCHEMA = DATABASE() 
        AND s.TABLE_NAME = '${table}'
        AND i.INDEX_NAME IS NULL
        AND s.INDEX_NAME != 'PRIMARY'`,
      duplicate_indexes: `SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        GROUP_CONCAT(INDEX_NAME) as duplicate_indexes,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${table}'
      GROUP BY TABLE_SCHEMA, TABLE_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
      HAVING COUNT(*) > 1`,
    };
  }

  // ========== UTILITY METHODS FOR INTROSPECTION ==========

  /**
   * Generate SQL to get foreign key relationships
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @returns {string} SQL query to get foreign key information
   */
  getForeignKeysSql(tableName = null) {
    const table = tableName || this.tableName;

    return `SELECT 
      CONSTRAINT_NAME as constraint_name,
      COLUMN_NAME as column_name,
      REFERENCED_TABLE_NAME as referenced_table,
      REFERENCED_COLUMN_NAME as referenced_column,
      UPDATE_RULE as on_update,
      DELETE_RULE as on_delete
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${table}'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`;
  }

  /**
   * Generate SQL to get table triggers
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @returns {string} SQL query to get trigger information
   */
  getTriggersSql(tableName = null) {
    const table = tableName || this.tableName;

    return `SELECT 
      TRIGGER_NAME as trigger_name,
      EVENT_MANIPULATION as event_type,
      ACTION_TIMING as timing,
      ACTION_STATEMENT as statement,
      CREATED as created_at
    FROM information_schema.TRIGGERS
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${table}'
    ORDER BY TRIGGER_NAME`;
  }

  /**
   * Generate SQL to get table size and row count
   * @param {string} tableName - Table name (optional, uses current table if not provided)
   * @returns {string} SQL query to get table statistics
   */
  getTableStatsSql(tableName = null) {
    const table = tableName || this.tableName;

    return `SELECT 
      TABLE_NAME as table_name,
      ENGINE as engine,
      TABLE_ROWS as estimated_rows,
      AVG_ROW_LENGTH as avg_row_length,
      DATA_LENGTH as data_size,
      INDEX_LENGTH as index_size,
      DATA_FREE as data_free,
      AUTO_INCREMENT as next_auto_increment,
      CREATE_TIME as created_at,
      UPDATE_TIME as updated_at,
      CHECK_TIME as checked_at,
      TABLE_COLLATION as collation,
      CHECKSUM as checksum,
      TABLE_COMMENT as comment
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${table}'`;
  }

  /**
   * Escape nilai untuk SQL
   * @param {*} value - Nilai untuk di-escape
   * @returns {string} Nilai yang sudah di-escape
   */
  escapeValue(value) {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (typeof value === "string") {
      // Check if string is a numeric value (integer or decimal, positive or negative)
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return value; // Return as number without quotes
      }
      return `'${value.replace(/'/g, "''")}'`;
    }

    if (typeof value === "number") {
      return value.toString();
    }

    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    if (value instanceof Date) {
      return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
    }

    // Handle objects and arrays by JSON stringifying them
    if (typeof value === "object" || Array.isArray(value)) {
      try {
        const jsonString = JSON.stringify(value);
        return `'${jsonString.replace(/'/g, "''")}'`;
      } catch (error) {
        console.warn("Failed to JSON stringify value:", error);
        return "NULL";
      }
    }

    return `'${value.toString().replace(/'/g, "''")}'`;
  }

  /**
   * Get query with parameters (for prepared statements)
   * @returns {Object} Query with parameters
   */
  toSqlWithParams() {
    const params = [];
    let paramIndex = 1;

    // Build query with placeholders
    let query = `SELECT ${this.selectFields} FROM ${this.tableName}`;

    // Add joins
    this.joinConditions.forEach((join) => {
      query += ` ${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    });

    // Add where conditions with parameters
    if (this.whereConditions.length > 0) {
      const whereClause = this.buildWhereClauseWithParams(params);
      query += ` WHERE ${whereClause}`;
    }

    // Add group by
    if (this.groupByFields.length > 0) {
      query += ` GROUP BY ${this.groupByFields.join(", ")}`;
    }

    // Add having
    if (this.havingConditions.length > 0) {
      const havingClause = this.buildHavingClauseWithParams(params);
      query += ` HAVING ${havingClause}`;
    }

    // Add order by
    if (this.orderByFields.length > 0) {
      const orderParts = this.orderByFields.map(
        (order) => `${order[0]} ${order[1]}`
      );
      query += ` ORDER BY ${orderParts.join(", ")}`;
    }

    // Add limit and offset
    if (this.limitValue !== null) {
      query += ` LIMIT ${this.limitValue}`;
      if (this.offsetValue !== null) {
        query += ` OFFSET ${this.offsetValue}`;
      }
    }

    return { sql: query, params: params };
  }

  /**
   * Build WHERE clause with parameters
   * @param {Array} params - Parameters array
   * @returns {string} WHERE clause with placeholders
   */
  buildWhereClauseWithParams(params) {
    const conditions = [];
    let isFirst = true;

    this.whereConditions.forEach((where) => {
      const [column, operator, value, boolean, type] = where;
      let condition = "";

      // Add boolean operator (AND/OR) except for first condition
      if (!isFirst) {
        condition += ` ${boolean} `;
      }

      switch (type) {
        case "IN":
          const inPlaceholders = value.map(() => "?").join(", ");
          condition += `${column} IN (${inPlaceholders})`;
          params.push(...value);
          break;

        case "NOT_IN":
          const notInPlaceholders = value.map(() => "?").join(", ");
          condition += `${column} NOT IN (${notInPlaceholders})`;
          params.push(...value);
          break;

        case "BETWEEN":
          condition += `${column} BETWEEN ? AND ?`;
          params.push(value[0], value[1]);
          break;

        case "NOT_BETWEEN":
          condition += `${column} NOT BETWEEN ? AND ?`;
          params.push(value[0], value[1]);
          break;

        case "NULL":
          condition += `${column} IS NULL`;
          break;

        case "NOT_NULL":
          condition += `${column} IS NOT NULL`;
          break;

        case "BASIC":
        default: // BASIC
          condition += `${column} ${operator} ?`;
          params.push(value);
          break;
      }

      conditions.push(condition);
      isFirst = false;
    });

    return conditions.join("");
  }

  /**
   * Build HAVING clause with parameters
   * @param {Array} params - Parameters array
   * @returns {string} HAVING clause with placeholders
   */
  buildHavingClauseWithParams(params) {
    const conditions = [];
    this.havingConditions.forEach((having) => {
      conditions.push(`${having[0]} ${having[1]} ?`);
      params.push(having[2]);
    });
    return conditions.join(" AND ");
  }

  /**
   * Debug: Print the SQL query
   * @returns {NexaModels}
   */
  dump() {
    console.log("SQL:", this.toSql());
    return this;
  }

  /**
   * Debug: Print the SQL query and stop
   * @returns {NexaModels}
   */
  dd() {
    this.dump();
    throw new Error("Query debugging stopped");
  }

  /**
   * Buat instance baru
   * @returns {NexaModels} Instance baru
   */
  newQuery() {
    return new NexaModels(this.nexaEncrypt.secretKey);
  }

  /**
   * Set secret key baru untuk enkripsi
   * @param {string} secretKey - Secret key baru
   * @returns {NexaModels} Instance ini untuk chaining
   */
  setSecretKey(secretKey) {
    this.nexaEncrypt = new NexaEncrypt(secretKey);
    return this;
  }

  /**
   * Dapatkan secret key saat ini
   * @returns {string} Secret key saat ini
   */
  getSecretKey() {
    return this.nexaEncrypt.secretKey;
  }

  /**
   * Validasi nama tabel
   * @param {string} table - Nama tabel
   * @throws {Error} Jika tidak valid
   */
  validateTableName(table) {
    if (!table || typeof table !== "string") {
      throw new Error("Table name cannot be empty");
    }

    if (!/^[a-zA-Z0-9_\.]+$/.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
  }

  /**
   * Validate column name
   * @param {string} column - Column name
   * @throws {Error} If invalid
   */
  validateColumnName(column) {
    if (!column || typeof column !== "string") {
      throw new Error("Column name cannot be empty");
    }

    column = column.trim();

    // Check for SQL alias (column AS alias)
    if (/^(.+)\s+AS\s+(.+)$/i.test(column)) {
      return true;
    }

    // Check for CASE statements
    if (/^CASE\s+/i.test(column)) {
      return true;
    }

    // Check for function calls
    if (/^([A-Z_]+)\(/.test(column)) {
      const match = column.match(/^([A-Z_]+)\(/);
      if (match && !this.allowedFunctions.includes(match[1])) {
        throw new Error(`Function not allowed: ${match[1]}`);
      }
      return true;
    }

    // Basic column validation
    if (!/^[a-zA-Z0-9_\.\*]+$/.test(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }
  }

  /**
   * Check if value is numeric
   * @param {*} value - Value to check
   * @returns {boolean} True if numeric
   */
  isNumeric(value) {
    if (typeof value === "number") {
      return true;
    }
    if (typeof value === "string") {
      return /^-?\d+(\.\d+)?$/.test(value);
    }
    return false;
  }

  /**
   * Normalize value for SQL
   * @param {*} value - Value to normalize
   * @returns {*} Normalized value
   */
  normalizeValue(value) {
    if (typeof value === "string" && this.isNumeric(value)) {
      return parseFloat(value);
    }
    return value;
  }

  /**
   * Create slug from string
   * @param {string} value - String to slugify
   * @returns {string} Slug
   */
  addSlug(value) {
    if (typeof value !== "string") return "";

    return value
      .toLowerCase()
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /**
   * Convert to JSON string
   * @param {*} data - Data to convert
   * @param {boolean} prettyPrint - Format JSON
   * @returns {string|null} JSON string
   */
  toJson(data, prettyPrint = false) {
    if (data === null || data === undefined) {
      return null;
    }

    return JSON.stringify(data, null, prettyPrint ? 2 : 0);
  }

  /**
   * Override toString method to automatically return SQL query
   * @returns {string} SQL query string
   */
  toString() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Override valueOf method to return SQL query when used in string context
   * @returns {string} SQL query string
   */
  valueOf() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Custom inspect method for Node.js console.log
   * @returns {string} SQL query string
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Custom toStringTag for better debugging
   * @returns {string} Class name
   */
  get [Symbol.toStringTag]() {
    return "NexaModels";
  }

  /**
   * Custom formatter for browser console.log
   * This makes console.log(query) display the SQL directly
   */
  [Symbol.for("nodejs.util.inspect.custom")]() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Override inspect method for better console output
   */
  inspect() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Custom JSON serialization for console.log in browsers
   * @returns {string} SQL query string
   */
  toJSON() {
    try {
      return this.toSql();
    } catch (error) {
      return `[NexaModels Error: ${error.message}]`;
    }
  }

  /**
   * Get SQL query as string (alias for backward compatibility)
   * @returns {string} SQL query string
   */
  getQuery() {
    return this.toSql();
  }

  /**
   * Clone instance query builder saat ini
   * @returns {NexaModels} Instance baru yang telah di-clone
   */
  clone() {
    // Teruskan secret key yang sama untuk menjaga konsistensi enkripsi
    const cloned = new NexaModels(this.nexaEncrypt.secretKey);
    cloned.tableName = this.tableName;
    cloned.selectFields = this.selectFields;
    cloned.whereConditions = [...this.whereConditions];
    cloned.joinConditions = [...this.joinConditions];
    cloned.orderByFields = [...this.orderByFields];
    cloned.groupByFields = [...this.groupByFields];
    cloned.havingConditions = [...this.havingConditions];
    cloned.limitValue = this.limitValue;
    cloned.offsetValue = this.offsetValue;
    cloned.unionQueries = [...this.unionQueries];
    cloned.isDistinct = this.isDistinct;
    cloned.insertData = this.insertData ? { ...this.insertData } : null;
    cloned.updateData = this.updateData ? { ...this.updateData } : null;
    cloned.deleteMode = this.deleteMode;
    return cloned;
  }

  /**
   * Build pagination query with count
   * @param {number} page - Current page (1-based)
   * @param {number} perPage - Items per page
   * @returns {Object} Pagination query object
   */
  paginateQuery(page = 1, perPage = 10) {
    if (page < 1) page = 1;
    if (perPage < 1) perPage = 10;

    const offset = (page - 1) * perPage;

    // Build count query (without LIMIT/OFFSET)
    const countQuery = this.clone();
    countQuery.selectFields = "COUNT(*) as total";
    countQuery.limitValue = null;
    countQuery.offsetValue = null;
    countQuery.orderByFields = []; // Remove ORDER BY for count

    // Build data query (with LIMIT/OFFSET)
    const dataQuery = this.clone();
    dataQuery.limitValue = perPage;
    dataQuery.offsetValue = offset;

    return {
      countSql: countQuery.toSql(),
      dataSql: dataQuery.toSql(),
      page: page,
      perPage: perPage,
      offset: offset,
    };
  }

  /**
   * Get pagination info SQL query
   * @param {number} page - Current page (1-based)
   * @param {number} perPage - Items per page
   * @returns {Object} Pagination info object
   */
  paginateInfo(page = 1, perPage = 10) {
    if (page < 1) page = 1;
    if (perPage < 1) perPage = 10;

    const offset = (page - 1) * perPage;

    // Build count query
    const countQuery = this.clone();
    countQuery.selectFields = "COUNT(*) as total";
    countQuery.limitValue = null;
    countQuery.offsetValue = null;
    countQuery.orderByFields = []; // Remove ORDER BY for count

    const countSql = countQuery.toSql();

    return {
      countSql: countSql,
      page: page,
      perPage: perPage,
      offset: offset,
      // Helper function to calculate pagination info from count result
      calculateInfo: function (totalCount) {
        const total = parseInt(totalCount) || 0;
        const lastPage = total > 0 ? Math.ceil(total / perPage) : 1;
        const currentPage = Math.max(1, Math.min(page, lastPage));
        const from = total > 0 ? (currentPage - 1) * perPage + 1 : 0;
        const to = Math.min(currentPage * perPage, total);

        return {
          total: total,
          last_page: lastPage,
          current_page: currentPage,
          per_page: perPage,
          from: from,
          to: to,
          has_pages: lastPage > 1,
          has_next: currentPage < lastPage,
          has_previous: currentPage > 1,
        };
      },
    };
  }

  /**
   * Build complete pagination SQL queries
   * @param {number} page - Current page (1-based)
   * @param {number} perPage - Items per page
   * @returns {Object} Complete pagination queries
   */
  paginateSql(page = 1, perPage = 10) {
    const paginateQuery = this.paginateQuery(page, perPage);
    const paginateInfo = this.paginateInfo(page, perPage);

    return {
      // SQL queries
      countSql: paginateQuery.countSql,
      dataSql: paginateQuery.dataSql,

      // Pagination parameters
      page: page,
      perPage: perPage,
      offset: paginateQuery.offset,

      // Helper function to build complete result
      buildResult: function (countResult, dataResult) {
        const total = parseInt(countResult) || 0;
        const lastPage = total > 0 ? Math.ceil(total / perPage) : 1;
        const currentPage = Math.max(1, Math.min(page, lastPage));
        const from = total > 0 ? (currentPage - 1) * perPage + 1 : 0;
        const to = Math.min(currentPage * perPage, total);

        return {
          data: dataResult || [],
          total: total,
          last_page: lastPage,
          current_page: currentPage,
          per_page: perPage,
          from: from,
          to: to,
          has_pages: lastPage > 1,
          has_next: currentPage < lastPage,
          has_previous: currentPage > 1,
        };
      },
    };
  }

  // ========== API INTEGRATION METHODS ==========

  /**
   * Eksekusi query melalui API (GET request)
   * @param {string} endpoint - API endpoint (default: 'query')
   * @param {Object} options - Opsi request
   * @returns {Promise} Respon API
   */
  async get(endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.toSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "select",
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Eksekusi query melalui API (POST request)
   * @param {string} endpoint - API endpoint (default: 'query')
   * @param {Object} options - Opsi request
   * @returns {Promise} Respon API
   */
  async post(endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.toSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "select",
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Eksekusi insert query melalui API
   * @param {Object} data - Data yang akan diinsert
   * @param {string} endpoint - API endpoint (default: 'insert')
   * @param {Object} options - Opsi request
   * @returns {Promise} Respon API
   */
  async insert(data, endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.insertSql(data)),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: Object.values(data),
      type: "insert",
      data: data,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Eksekusi update query melalui API
   * @param {Object} data - Data yang akan diupdate
   * @param {string} endpoint - API endpoint (default: 'update')
   * @param {Object} options - Opsi request
   * @returns {Promise} Respon API
   */
  async update(data, endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.updateSql(data)),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: [...Object.values(data), ...this.getBindings()],
      type: "update",
      data: data,
      where: this.whereConditions,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Eksekusi delete query melalui API
   * @param {string} endpoint - API endpoint (default: 'delete')
   * @param {Object} options - Opsi request
   * @returns {Promise} Respon API
   */
  async delete(endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.deleteSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "delete",
      where: this.whereConditions,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Execute paginated query via API
   * @param {number} page - Page number
   * @param {number} perPage - Items per page
   * @param {string} endpoint - API endpoint (default: 'paginate')
   * @param {Object} options - Request options
   * @returns {Promise} API response with pagination data
   */
  async paginate(page = 1, perPage = 10, endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const pagination = this.paginateSql(page, perPage);
    const payload = {
      countSql: await this.nexaEncrypt.encryptJson(pagination.countSql),
      dataSql: await this.nexaEncrypt.encryptJson(pagination.dataSql),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "paginate",
      page: page,
      perPage: perPage,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Execute count query via API
   * @param {string} column - Column to count (default: '*')
   * @param {string} endpoint - API endpoint (default: 'count')
   * @param {Object} options - Request options
   * @returns {Promise} API response with count
   */
  async count(column = "*", endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.countSql(column)),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "count",
      column: column,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Execute exists query via API
   * @param {string} endpoint - API endpoint (default: 'exists')
   * @param {Object} options - Request options
   * @returns {Promise} API response with exists check
   */
  async exists(endpoint = "exists", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.existsSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "exists",
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Execute first query via API
   * @param {string} endpoint - API endpoint (default: 'first')
   * @param {Object} options - Request options
   * @returns {Promise} API response with first record
   */
  async first(endpoint = "Fetch", options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.firstSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "first",
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  /**
   * Execute query with custom endpoint
   * @param {string} endpoint - Custom API endpoint
   * @param {Object} additionalData - Additional data to send
   * @param {Object} options - Request options
   * @returns {Promise} API response
   */
  async execute(endpoint, additionalData = {}, options = {}) {
    if (!window.NEXA?.controllers?.Storage) {
      throw new Error(
        "NexaStorage not available. Make sure NexaUI is initialized."
      );
    }

    const payload = {
      sql: await this.nexaEncrypt.encryptJson(this.toSql()),
      table: await this.nexaEncrypt.encryptJson(this.tableName),
      bindings: this.getBindings(),
      type: "custom",
      ...additionalData,
      ...options,
    };

    return await window.NEXA.controllers.Storage().post(endpoint, payload);
  }

  // ========== PROMISE-LIKE METHODS (THENABLE) ==========

  /**
   * Buat NexaModels thenable (Promise-like) - default ke Fetch
   * @param {Function} onFulfilled - Callback sukses
   * @param {Function} onRejected - Callback error
   * @returns {Promise} Respon API
   */
  then(onFulfilled, onRejected) {
    // Default endpoint for direct promise usage
    const defaultEndpoint = "Fetch";

    // Execute the query and return promise
    return this.post(defaultEndpoint).then(onFulfilled, onRejected);
  }

  /**
   * Make NexaModels catchable (Promise-like)
   * @param {Function} onRejected - Error callback
   * @returns {Promise} API response
   */
  catch(onRejected) {
    // Default endpoint for direct promise usage
    const defaultEndpoint = "Fetch";

    // Execute the query and return promise
    return this.post(defaultEndpoint).catch(onRejected);
  }

  /**
   * Make NexaModels finally-able (Promise-like)
   * @param {Function} onFinally - Finally callback
   * @returns {Promise} API response
   */
  finally(onFinally) {
    // Default endpoint for direct promise usage
    const defaultEndpoint = "Fetch";

    // Execute the query and return promise
    return this.post(defaultEndpoint).finally(onFinally);
  }

  /**
   * ========== noSelectFields Methods (untuk mengecualikan RECORD, bukan kolom) ==========
   */

  /**
   * Tidak menampilkan/memilih record berdasarkan kondisi field tertentu
   * @param {Object} conditions - Kondisi field yang tidak ingin ditampilkan
   * @returns {NexaModels}
   *
   * Example:
   * .noSelectFields({'account_name': 'Biaya Gaji'})
   * .noSelectFields({'status': 'inactive', 'role': 'banned'})
   * .noSelectFields({'published': 0})
   */
  noSelectFields(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return this;
    }

    Object.entries(conditions).forEach(([field, value]) => {
      // Validate field name
      this.validateColumnName(field);

      // Add WHERE NOT condition for each field
      if (Array.isArray(value)) {
        // If value is array, use NOT IN
        this.whereNotIn(field, value);
      } else if (value === null) {
        // If value is null, use IS NOT NULL
        this.whereNotNull(field);
      } else {
        // Regular NOT equal condition
        this.where(field, "!=", value);
      }
    });

    return this;
  }

  /**
   * Alias untuk noSelectFields - tidak menampilkan record berdasarkan kondisi
   * @param {Object} conditions - Kondisi field yang tidak ingin ditampilkan
   * @returns {NexaModels}
   */
  hideRecords(conditions) {
    return this.noSelectFields(conditions);
  }

  /**
   * Tidak menampilkan record yang memiliki nilai tertentu
   * @param {Object} conditions - Kondisi yang akan disembunyikan
   * @returns {NexaModels}
   */
  excludeRecords(conditions) {
    return this.noSelectFields(conditions);
  }

  /**
   * Melewati/skip record berdasarkan kondisi tertentu
   * @param {Object} conditions - Kondisi record yang akan dilewati
   * @returns {NexaModels}
   */
  skipRecords(conditions) {
    return this.noSelectFields(conditions);
  }

  /**
   * Tidak mengambil record yang memenuhi kondisi tertentu
   * @param {Object} conditions - Kondisi record yang tidak akan diambil
   * @returns {NexaModels}
   */
  withoutRecords(conditions) {
    return this.noSelectFields(conditions);
  }

  /**
   * Filter out records yang memiliki nilai tertentu
   * @param {Object} conditions - Kondisi yang akan difilter keluar
   * @returns {NexaModels}
   */
  filterOut(conditions) {
    return this.noSelectFields(conditions);
  }

  /**
   * Shortcut: Tidak menampilkan record yang tidak aktif
   * @param {string} statusField - Nama field status (default: 'is_active')
   * @returns {NexaModels}
   */
  onlyActive(statusField = "is_active") {
    return this.where(statusField, 1);
  }

  /**
   * Shortcut: Tidak menampilkan record yang aktif (hanya yang inactive)
   * @param {string} statusField - Nama field status (default: 'is_active')
   * @returns {NexaModels}
   */
  onlyInactive(statusField = "is_active") {
    return this.where(statusField, 0);
  }

  /**
   * Shortcut: Tidak menampilkan record yang sudah dihapus (soft delete)
   * @param {string} deletedField - Nama field deleted (default: 'deleted_at')
   * @returns {NexaModels}
   */
  notDeleted(deletedField = "deleted_at") {
    return this.whereNull(deletedField);
  }

  /**
   * Shortcut: Hanya menampilkan record yang sudah dihapus (soft delete)
   * @param {string} deletedField - Nama field deleted (default: 'deleted_at')
   * @returns {NexaModels}
   */
  onlyDeleted(deletedField = "deleted_at") {
    return this.whereNotNull(deletedField);
  }
}

// Export for ES6 modules
export default NexaModels;
export { NexaModels };

// // Export for use in modules
// if (typeof module !== "undefined" && module.exports) {
//   module.exports = NexaModels;
// }

// // Global variable for browser use
// if (typeof window !== "undefined") {
//   window.NexaModels = NexaModels;
// }
