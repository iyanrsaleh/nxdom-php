/**
 * Konversi `production` (state Buckets) → payload siap kirim ke executeOperation.
 * Menangani single-table maupun multi-join secara otomatis.
 */
export async function NexaBuildQuery(id) {
  const Store = await NXUI.ref.nexaStore(id).get();
  if (!Store) throw new Error(`NexaBuildQuery: store tidak ditemukan untuk id "${id}"`);
  const production=Store.production;
  const prod = production || {};
  const alias        = prod.alias      || [];
  const original     = prod.original   || [];
  const aggregate    = prod.aggregate  || [];
  const arithmetic   = prod.arithmetic || [];

  const finalAlias = mergeAliasWithTransformations(alias, arithmetic, aggregate);

  let tabelName, operasi;
  if (prod.join?.tables?.length > 0) {
    // Multi-join: gunakan data dari production.join
    tabelName = prod.join.tables;
    operasi   = prod.join.operasi || {};
  } else {
    // Single table: bangun operasi minimal dari production.tabel / production.key
    tabelName = [prod.tabel];
    operasi   = {
      [prod.tabel]: {
        type:        'single',
        index:       '',
        aliasIndex:  prod.tabel,
        keyIndex:    prod.key,
        target:      '',
        condition:   '',
        aliasTarget: '',
        keyTarget:   '',
      },
    };
  }

  const selectMode = String(
    prod?.setting?.tabel?.classSelect ??
    prod?.setting?.tabel?.storage ??
    "",
  ).trim().toLowerCase();
  const explicitOrder = prod.orderBy?.alias || false;
  const defaultDbOrder = (() => {
    // Khusus mode database: saat order belum diset, default data terbaru di atas.
    if (selectMode !== "" && selectMode !== "database") return false;
    const mainTable = Array.isArray(tabelName) && tabelName.length ? String(tabelName[0] ?? "").trim() : "";
    if (!mainTable) return false;
    return `${mainTable}.id DESC`;
  })();
// const checkedItems = await Sdk.getFields("select");
  return {
    
    alias:      finalAlias,
    aliasNames: original,
    tabelName,
    operasi,
    where:  prod.where?.alias   || false,
    group:  prod.groupBy?.alias || false,
    order:  explicitOrder || defaultDbOrder || false,
    limit:  prod.limit  != null ? prod.limit  : null,
    offset: prod.offset != null ? prod.offset : null,
    // UNTUK FOMULIR
    formulir:         production.from,
  };
}

export async function NEXASDKJOIN(id) {
  let data = null;
  try {
    const Sdk = new NXUI.Buckets(id);
    data = await Sdk.storage();

    const prod    = data.production || {};
    const sqlview = buildQuery(prod);

    // Simpan dengan mergeData + spread production
    const existingProduction = prod;
    await NXUI.ref.mergeData(data.store, id, {
      production: {
        ...existingProduction,
        sqlview,
      },
    });

    console.log("✅ NEXASDKJOIN sqlview tersimpan:", sqlview);
  } catch (error) {
    console.error("Error:", error);
    return { error: error.message, data: data };
  }
}
export function mergeAliasWithTransformations(
  alias,
  arithmetic,
  aggregateType
) {
  if (!alias || !Array.isArray(alias)) {
    return [];
  }

  // Create a copy of the original alias array
  let mergedAlias = [...alias];

  // Handle arithmetic as object
  if (
    arithmetic &&
    !Array.isArray(arithmetic) &&
    arithmetic.field &&
    arithmetic.alias
  ) {
    const arithmeticField = arithmetic.field;

    // Find and replace the matching field in alias array
    const arithmeticIndex = mergedAlias.findIndex((item) => {
      // Extract field name from "field AS alias" format
      const fieldMatch = item.match(/^([^\s]+)/);
      return fieldMatch && fieldMatch[1] === arithmeticField;
    });

    if (arithmeticIndex !== -1) {
      mergedAlias[arithmeticIndex] = arithmetic.alias;
    }
  }

  // Handle arithmetic as array (similar to aggregateType)
  if (arithmetic && Array.isArray(arithmetic)) {
    arithmetic.forEach((arith) => {
      if (arith.field && arith.alias) {
        const arithmeticField = arith.field;

        // Find and replace the matching field in alias array
        const arithmeticIndex = mergedAlias.findIndex((item) => {
          // Extract field name from "field AS alias" format
          const fieldMatch = item.match(/^([^\s]+)/);
          return fieldMatch && fieldMatch[1] === arithmeticField;
        });

        if (arithmeticIndex !== -1) {
          mergedAlias[arithmeticIndex] = arith.alias;
        }
      }
    });
  }

  // Handle aggregateType transformations
  if (aggregateType && Array.isArray(aggregateType)) {
    aggregateType.forEach((agg) => {
      if (agg.field && agg.alias) {
        const aggField = agg.field;

        // Find and replace the matching field in alias array
        const aggIndex = mergedAlias.findIndex((item) => {
          // Extract field name from "field AS alias" format
          const fieldMatch = item.match(/^([^\s]+)/);
          return fieldMatch && fieldMatch[1] === aggField;
        });

        if (aggIndex !== -1) {
          mergedAlias[aggIndex] = agg.alias;
        }
      }
    });
  }

  return mergedAlias;
}
