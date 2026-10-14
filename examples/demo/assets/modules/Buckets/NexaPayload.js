
import { NexaFederated } from "./NexaFederated.js";

export class NexaPayload {
	/** Kunci konstruktor/query select — tidak dipakai sebagai nama kolom filter. */
	static SELECT_FILTER_RESERVED_KEYS = new Set([
		"appId",
		"id",
		"page",
		"pageSize",
		"pagesize",
		"limit",
		"perPage",
		"per_page",
		"skipCount",
		"search",
		"recordId",
		"rowId",
		"pk",
		"filter",
		"where",
		"buildQuery",
		"userid",
		"userId",
	]);

	/** Alias tabel utama (sama logika dengan PK predicate). */
	static selectMainTableAlias(buildQuery) {
		let main =
			Array.isArray(buildQuery.tabelName) && buildQuery.tabelName.length
				? buildQuery.tabelName[0]
				: typeof buildQuery.tabelName === "string"
					? buildQuery.tabelName
					: null;
		if (!main && buildQuery.operasi && typeof buildQuery.operasi === "object") {
			const keys = Object.keys(buildQuery.operasi);
			main = keys.length ? keys[0] : null;
		}
		return main && String(main).trim() !== "" ? String(main).trim() : null;
	}

	/** Literal SQL aman untuk WHERE (= / IS NULL); string di-quote dan di-escape. */
	static sqlScalarLiteral(val) {
		if (val === null || val === undefined) return "NULL";
		if (typeof val === "boolean") return val ? "1" : "0";
		if (typeof val === "number") {
			if (!Number.isFinite(val)) return "NULL";
			return String(val);
		}
		const s = String(val);
		const escaped = s.replace(/\\/g, "\\\\").replace(/'/g, "''");
		return `'${escaped}'`;
	}

	/** `kolom` atau `alias.kolom` — tolak identifier tidak aman. */
	static qualifyFilterColumn(colRaw, mainAlias) {
		const col = String(colRaw ?? "").trim();
		if (!col) return null;
		const qual = /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/;
		const m = col.match(qual);
		if (m) return `${m[1]}.${m[2]}`;
		const bare = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
		if (!bare.test(col) || !mainAlias || !bare.test(mainAlias)) return null;
		return `${mainAlias}.${col}`;
	}

	/**
	 * Gabung filter dari `opts.filter` + argumen `.select(patch)`:
	 * - patch boleh `{ desa: "Tunas Jaya" }` atau `{ filter: { … } }`
	 * - nilai primitif saja (string, number, boolean, null); objek/array diabaikan
	 */
	static collectSelectFilters(opts = {}, filterPatch = {}) {
		const out = Object.create(null);
		const assignSafe = (src) => {
			if (!src || typeof src !== "object" || Array.isArray(src)) return;
			for (const [k, v] of Object.entries(src)) {
				if (NexaPayload.SELECT_FILTER_RESERVED_KEYS.has(k)) continue;
				if (v === undefined) continue;
				if (v !== null && typeof v === "object") continue;
				out[k] = v;
			}
		};
		assignSafe(opts.filter);
		if (filterPatch.filter && typeof filterPatch.filter === "object") {
			assignSafe(filterPatch.filter);
		}
		assignSafe(filterPatch);
		return out;
	}

	/** Predikat `alias.col = literal` digabung dengan AND; kosong → null */
	static buildEqualityWhereFromFilter(buildQuery, filterObj) {
		const main = NexaPayload.selectMainTableAlias(buildQuery);
		if (!main) return null;
		const parts = [];
		for (const [key, val] of Object.entries(filterObj ?? {})) {
			const qcol = NexaPayload.qualifyFilterColumn(key, main);
			if (!qcol) continue;
			if (val === null || val === undefined) {
				parts.push(`${qcol} IS NULL`);
			} else {
				parts.push(`${qcol} = ${NexaPayload.sqlScalarLiteral(val)}`);
			}
		}
		return parts.length ? parts.join(" AND ") : null;
	}

	/** Sisipkan fragmen WHERE ke buildQuery (gabung dengan where ada). */
	static mergeWhereFragmentIntoBuildQuery(buildQuery, fragment) {
		const frag = String(fragment ?? "").trim();
		if (!frag) return;
		const w = buildQuery.where;
		if (w !== false && w != null && String(w).trim() !== "") {
			const inner = String(w).replace(/^\s*WHERE\s+/i, "").trim();
			buildQuery.where = `${frag} AND (${inner})`;
		} else {
			buildQuery.where = frag;
		}
	}

	/** Satu baris: `aliasUtama.pk = id` untuk filter `recordId` / `rowId` / `pk`. */
	static buildPkEqualityPredicate(buildQuery, recordIdNumeric) {
		const idNum = Number(recordIdNumeric);
		if (!Number.isFinite(idNum)) {
			return null;
		}
		const iq = Math.trunc(idNum);
		let main =
			Array.isArray(buildQuery.tabelName) && buildQuery.tabelName.length
				? buildQuery.tabelName[0]
				: typeof buildQuery.tabelName === "string"
					? buildQuery.tabelName
					: null;
		if (!main && buildQuery.operasi && typeof buildQuery.operasi === "object") {
			const keys = Object.keys(buildQuery.operasi);
			main = keys.length ? keys[0] : null;
		}
		if (!main) {
			return null;
		}
		const pkCol = NexaPayload.joinPkColumnName(buildQuery, main);
		return `${main}.${pkCol} = ${iq}`;
	}

	static resolveSelectQueryOpts(data) {
		const d = data && typeof data === "object" ? data : {};
		const n = (v) => {
			const x = Number(v);
			return Number.isFinite(x) ? x : NaN;
		};
		const page = n(d.page);
		const candidates = [d.pageSize, d.pagesize, d.limit, d.perPage, d.per_page];
		let pageSize = NaN;
		for (const c of candidates) {
			const v = n(c);
			if (v > 0) {
				pageSize = v;
				break;
			}
		}

		const ridRaw = d.recordId ?? d.rowId ?? d.pk ?? null;
		const ridN = Number(ridRaw);

		return {
			appId: d.appId ?? d.id ?? "",
			page: Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0,
			pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : null,
			skipCount: Boolean(d.skipCount),
			search: typeof d.search === "string" ? d.search : "",
			recordId:
				ridRaw !== null &&
				ridRaw !== undefined &&
				ridRaw !== "" &&
				Number.isFinite(ridN) &&
				Math.trunc(ridN) !== 0
					? Math.trunc(ridN)
					: null,
		};
	}

	static normalizeStorageMode(modeRaw) {
		const mode = String(modeRaw ?? "").trim().toLowerCase();
		if (mode === "firebase") return "firebase";
		if (mode === "sqlite3") return "sqlite3";
		if (mode === "websocket") return "websocket";
		return "indexeddb";
	}

	static mapStorageLabel(modeRaw) {
		const mode = NexaPayload.normalizeStorageMode(modeRaw);
		if (mode === "firebase") return "firebase";
		if (mode === "sqlite3") return "sqlite3";
		if (mode === "websocket") return "websocket";
		return "indexedDB";
	}

	static isAwaitStorage(modeRaw) {
		const mode = String(modeRaw ?? "").trim().toLowerCase();
		return mode === "sqlite3" || mode === "websocket";
	}

	static ensureAwaitAvailable() {
		if (typeof NXUI?.Await !== "function") {
			throw new Error("NexaPayload: NXUI.Await tidak tersedia untuk mode sqlite3/websocket.");
		}
	}

	static async resolveAwaitTableName(appId) {
		try {
			const buildQuery = await NX.BuildQuery(appId);
			const table = NexaPayload.selectMainTableAlias(buildQuery);
			if (table && String(table).trim() !== "") return String(table).trim();
		} catch (_) {
			// fallback below
		}
		return "nexa";
	}

	static buildAwaitMode(awaitInstance, modeRaw) {
		const mode = String(modeRaw ?? "").trim().toLowerCase();
		if (mode === "websocket") return awaitInstance.websocket();
		return awaitInstance.sqlite3();
	}

	static async resolveStoreData(appId) {
		const rawGet = await NXUI.ref.nexaStore(appId).get();
		if (!rawGet || rawGet.key == null || rawGet.key === "") {
			throw new Error(
				`NexaPayload: nexaStore tidak ditemukan atau key kosong untuk appId "${String(appId)}".`,
			);
		}
		return rawGet;
	}

	static mergeStorageInStoreData(storeData, modeRaw) {
		return {
			...storeData,
			settings: {
				...(storeData?.settings ?? {}),
				storage: NexaPayload.mapStorageLabel(modeRaw),
			},
		};
	}

	static async federatedFromEnvelope(envelope = {}, fallbackMode = "indexedDB") {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const appId = e.appId ?? e.id ?? "";
		if (String(appId).trim() === "") {
			throw new Error("NexaPayload: appId/id wajib diisi.");
		}
		const mode = e.storage ?? fallbackMode;
		const storeData = await NexaPayload.resolveStoreData(appId);
		const mergedStore = NexaPayload.mergeStorageInStoreData(storeData, mode);
		return new NexaFederated(mergedStore);
	}

	/**
	 * Select terpaginasi: `pageSize` → `buildQuery.limit`, `page` × `pageSize` → `buildQuery.offset`.
	 * `recordId` / `rowId` / `pk`: filter satu baris (PK dari operasi utama + `LIMIT 1`), cocok juga sqlview `layar`.
	 * Filter kolom: `.select({ desa: "Tunas Jaya" })` atau `{ filter: { … } }` pada opts/patch — equality + IS NULL.
	 */
	static async selectPayload(opts = {}, filterPatch = {}) {
		const {
			appId = "",
			page = 0,
			pageSize = null,
			skipCount = false,
			search = "",
			recordId = null,
			storage = null,
		} = opts;
		const normalizedStorage =
			typeof storage === "string" ? storage.trim().toLowerCase() : "";

		if (normalizedStorage === "indexeddb" || normalizedStorage === "firebase") {
			const federated = await NexaPayload.federatedFromEnvelope(
				{ appId, storage },
				storage,
			);
			const pageNum =
				Number.isFinite(Number(page)) && Number(page) >= 0
					? Math.floor(Number(page))
					: 0;
			const psNum = Number(pageSize);
			const effectivePageSize =
				pageSize != null && Number.isFinite(psNum) && psNum > 0
					? Math.floor(psNum)
					: 10;
			const getResult = await federated.get({
				offset: recordId != null ? 0 : pageNum * effectivePageSize,
				limit: recordId != null ? 1 : effectivePageSize,
			});
			let response = Array.isArray(getResult?.response)
				? getResult.response
				: getResult?.response
					? [getResult.response]
					: [];
			if (recordId != null) {
				const rid = Number(recordId);
				response = response.filter((row) => Number(row?.id) === rid);
			}
			const searchText = String(search ?? "").trim().toLowerCase();
			if (searchText) {
				response = response.filter((row) => {
					if (!row || typeof row !== "object") return false;
					return Object.values(row).some((v) =>
						String(v ?? "").toLowerCase().includes(searchText),
					);
				});
			}
			return {
				success: Boolean(getResult?.success ?? true),
				mode: getResult?.mode ?? NexaPayload.mapStorageLabel(storage),
				response,
				count: response.length,
				totalCount:
					typeof getResult?.totalCount === "number"
						? getResult.totalCount
						: response.length,
			};
		}
		if (NexaPayload.isAwaitStorage(normalizedStorage)) {
			NexaPayload.ensureAwaitAvailable();
			const table = await NexaPayload.resolveAwaitTableName(appId);
			const awaitModel = NexaPayload.buildAwaitMode(new NXUI.Await(), normalizedStorage)
				.tabel(table)
				.select(["*"]);
			const filterObj = NexaPayload.collectSelectFilters(opts, filterPatch);
			for (const [k, v] of Object.entries(filterObj)) {
				awaitModel.where(k, "=", v);
			}
			if (recordId != null) {
				awaitModel.where("id", "=", Number(recordId)).limit(1);
			} else {
				const pageNum =
					Number.isFinite(Number(page)) && Number(page) >= 0
						? Math.floor(Number(page))
						: 0;
				const psNum = Number(pageSize);
				const effectivePageSize =
					pageSize != null && Number.isFinite(psNum) && psNum > 0
						? Math.floor(psNum)
						: 10;
				awaitModel.limit(effectivePageSize);
				if (pageNum > 0) awaitModel.offset(pageNum * effectivePageSize);
			}
			const res = await awaitModel;
			const unwrapRows = (obj) => {
				if (!obj || typeof obj !== "object") return [];
				if (Array.isArray(obj)) return obj;
				if (Array.isArray(obj?.data)) return obj.data;
				if (Array.isArray(obj?.response)) return obj.response;
				if (obj?.data && typeof obj.data === "object") {
					const nested = unwrapRows(obj.data);
					if (nested.length) return nested;
				}
				if (obj?.response && typeof obj.response === "object") {
					const nested = unwrapRows(obj.response);
					if (nested.length) return nested;
				}
				return [];
			};
			const rows = unwrapRows(res);
			return {
				success: Boolean(res?.ok ?? res?.success ?? true),
				mode: normalizedStorage,
				response: rows,
				count: rows.length,
				totalCount: rows.length,
				raw: res,
			};
		}

		const buildQuery = await NX.BuildQuery(appId);
		const filterObj = NexaPayload.collectSelectFilters(opts, filterPatch);
		const filterFrag = NexaPayload.buildEqualityWhereFromFilter(
			buildQuery,
			filterObj,
		);
		if (filterFrag) {
			NexaPayload.mergeWhereFragmentIntoBuildQuery(buildQuery, filterFrag);
		}

		if (recordId != null) {
			const pred = NexaPayload.buildPkEqualityPredicate(buildQuery, recordId);
			if (pred) {
				NexaPayload.mergeWhereFragmentIntoBuildQuery(buildQuery, pred);
			}
			buildQuery.limit = 1;
			buildQuery.offset = 0;
			buildQuery.skipCount = true;
			if (!(search && search.trim() !== "")) {
				delete buildQuery.search;
			} else {
				buildQuery.search = search.trim();
			}

			return NXUI.Storage().models("Office").executeOperation(buildQuery);
		}

		const pageNum =
			Number.isFinite(Number(page)) && Number(page) >= 0
				? Math.floor(Number(page))
				: 0;
		const fromProd =
			buildQuery.limit != null && Number(buildQuery.limit) > 0
				? Math.floor(Number(buildQuery.limit))
				: 10;
		const psNum = Number(pageSize);
		const sizeFromOpts =
			pageSize != null && Number.isFinite(psNum) && psNum > 0
				? Math.floor(psNum)
				: null;
		const effectivePageSize = sizeFromOpts != null ? sizeFromOpts : fromProd;

		buildQuery.limit = effectivePageSize;
		buildQuery.offset = pageNum * effectivePageSize;

		if (skipCount) buildQuery.skipCount = true;

		if (search && search.trim() !== "") {
			buildQuery.search = search.trim();
			delete buildQuery.skipCount;
		} else {
			delete buildQuery.search;
		}

		return NXUI.Storage().models("Office").executeOperation(buildQuery);
	}

	static async insertPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};

		const appId = e.appId ?? e.id ?? "";
		const userid = e.userid;
		const { id: _omitRowPk, ...fieldUpdates } = p;

		const columnsForUpdate = { ...fieldUpdates };
		if (userid !== undefined && userid !== null && userid !== "") {
			columnsForUpdate.userid = userid;
		}

		const normalizedStorage =
			typeof e.storage === "string" ? e.storage.trim().toLowerCase() : "";
		if (normalizedStorage === "indexeddb" || normalizedStorage === "firebase") {
			const federated = await NexaPayload.federatedFromEnvelope(
				{ appId, storage: e.storage },
				e.storage,
			);
			return federated.set(columnsForUpdate, false);
		}
		if (NexaPayload.isAwaitStorage(normalizedStorage)) {
			NexaPayload.ensureAwaitAvailable();
			const table = await NexaPayload.resolveAwaitTableName(appId);
			return NexaPayload.buildAwaitMode(new NXUI.Await(), normalizedStorage)
				.tabel(table)
				.insert(columnsForUpdate);
		}
		const rawGet = await NXUI.ref.nexaStore(appId).get();
		if (!rawGet || rawGet.key == null || rawGet.key === "") {
			throw new Error(
				`NexaPayload.insertPayload: nexaStore tidak ditemukan atau key kosong untuk appId "${String(appId)}".`,
			);
		}
		const tableKey = Number(rawGet.key);
		return NXUI.Storage()
			.models("Office")
			.setRetInsert(tableKey, appId, columnsForUpdate, false);
	}
	/**
	 * Terima parameter update dari konstruktor + .update(patch) — belum ke server.
	 * Nanti sambungkan ke buckUpdate / setRetUpdate di sini atau di pemanggil.
	 */
	static async updatePayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};

		const appId = e.appId ?? e.id ?? "";
		const userid = e.userid;
		const rowId = p.id;
		const { id: _omitRowPk, ...fieldUpdates } = p;

		const columnsForUpdate = { ...fieldUpdates };
		if (userid !== undefined && userid !== null && userid !== "") {
			columnsForUpdate.userid = userid;
		}

		const normalizedStorage =
			typeof e.storage === "string" ? e.storage.trim().toLowerCase() : "";
		const recordId = Number(rowId);
		if (normalizedStorage === "indexeddb" || normalizedStorage === "firebase") {
			const federated = await NexaPayload.federatedFromEnvelope(
				{ appId, storage: e.storage },
				e.storage,
			);
			return federated.upt(columnsForUpdate, recordId, null);
		}
		if (NexaPayload.isAwaitStorage(normalizedStorage)) {
			NexaPayload.ensureAwaitAvailable();
			const table = await NexaPayload.resolveAwaitTableName(appId);
			return NexaPayload.buildAwaitMode(new NXUI.Await(), normalizedStorage)
				.tabel(table)
				.where("id", "=", recordId)
				.update(columnsForUpdate);
		}
		const rawGet = await NXUI.ref.nexaStore(appId).get();
		if (!rawGet || rawGet.key == null || rawGet.key === "") {
			throw new Error(
				`NexaPayload.updatePayload: nexaStore tidak ditemukan atau key kosong untuk appId "${String(appId)}".`,
			);
		}
		const tableKey = Number(rawGet.key);
		return NXUI.Storage()
			.models("Office")
			.setRetUpdate(tableKey, appId, columnsForUpdate, recordId, null);
	}

	/**
	 * Hapus satu baris: `{@see Office::setRettDelete}` → `tablesRetDelete`.
	 * Patch / envelope: `id` atau `recordId` (PK baris). `appId` dari envelope.
	 */
	static async deletePayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};

		const appId = e.appId ?? e.id ?? "";
		const rowCandidate =
			p.id ?? p.recordId ?? e.recordId ?? e.deleteId ?? e.rowId ?? null;

		const idNum = Number(rowCandidate);

		if (
			rowCandidate === null ||
			rowCandidate === undefined ||
			rowCandidate === "" ||
			!Number.isFinite(idNum) ||
			idNum < 1 ||
			String(appId ?? "").trim() === ""
		) {
			throw new Error(
				"NexaPayload.deletePayload: butuh appId nexaStore dan id positif.",
			);
		}
		const normalizedStorage =
			typeof e.storage === "string" ? e.storage.trim().toLowerCase() : "";
		if (normalizedStorage === "indexeddb" || normalizedStorage === "firebase") {
			const federated = await NexaPayload.federatedFromEnvelope(
				{ appId, storage: e.storage },
				e.storage,
			);
			return federated.del({ id: idNum });
		}
		if (NexaPayload.isAwaitStorage(normalizedStorage)) {
			NexaPayload.ensureAwaitAvailable();
			const table = await NexaPayload.resolveAwaitTableName(appId);
			return NexaPayload.buildAwaitMode(new NXUI.Await(), normalizedStorage)
				.tabel(table)
				.where("id", "=", idNum)
				.delete();
		}
		const rawGet = await NXUI.ref.nexaStore(appId).get();
		if (!rawGet) {
			throw new Error(
				`NexaPayload.deletePayload: nexaStore tidak ada untuk appId "${String(appId)}".`,
			);
		}
		const tableKey = Number(rawGet.key);
		if (!Number.isFinite(tableKey)) {
			throw new Error(
				"NexaPayload.deletePayload: key tabel tidak valid.",
			);
		}
		return NXUI.Storage()
			.models("Office")
			.setRettDelete(tableKey, appId, idNum);
	}

	/**
	 * Mutasi beberapa tabel berurutan (relasi): {@see Office::executeJoinMutation} / JoinOprasi.
	 * `patch.steps`: `{ action: 'insert'|'update'|'delete'|'upload', tableKey, name, alias?, columns?, id?, … }[]`
	 * Placeholder kolom: string `{{previousInsertId}}` atau nilai tepat itu → PK dari insert langkah sebelumnya.
	 */
	static async joinMutationPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const steps = Array.isArray(p.steps) ? p.steps : [];
		const userid = e.userid ?? e.userId ?? undefined;

		const payload = { steps };
		if (userid !== undefined && userid !== null && userid !== "") {
			payload.userid = userid;
		}

		return NXUI.Storage().models("Office").executeJoinMutation(payload);
	}

	/** Map alias tabel → tableKey dari `operasi` join. */
	static joinTblKeysFromOperasi(operasi) {
		const m = Object.create(null);
		for (const v of Object.values(operasi ?? {})) {
			if (!v || typeof v !== "object") continue;
			const ai = String(v.aliasIndex ?? "").trim();
			const at = String(v.aliasTarget ?? "").trim();
			if (ai && Number(v.keyIndex) > 0) m[ai] = Number(v.keyIndex);
			if (at && Number(v.keyTarget) > 0) m[at] = Number(v.keyTarget);
		}
		return m;
	}

	/** Kolom FK di child yang mengarah ke parent (mis. petani_id). */
	static joinFkColChild(operasi, childTbl, mainTbl) {
		const j = operasi?.[childTbl];
		if (!j || typeof j !== "object") return null;
		const ix = String(j.index ?? "").match(/^([\w]+)\.([\w]+)$/);
		const tg = String(j.target ?? "").match(/^([\w]+)\.([\w]+)$/);
		if (!ix || !tg || tg[1] !== childTbl || ix[1] !== mainTbl) return null;
		return tg[2];
	}

	/** Bentuk `{ tbl: { col: nilai } }` dari `formulir[].failed` + data form. */
	static joinKeServerFromFormulir(formulir, formData) {
		const keServer = Object.create(null);
		if (!formulir || typeof formulir !== "object") return keServer;
		for (const [namaField, nilai] of Object.entries(formData ?? {})) {
			if (nilai != null && typeof nilai === "object") continue;
			const failed = formulir[namaField]?.failed;
			if (typeof failed !== "string") continue;
			const dot = failed.indexOf(".");
			if (dot < 1) continue;
			const tbl = failed.slice(0, dot);
			const col = failed.slice(dot + 1);
			if (!keServer[tbl]) keServer[tbl] = {};
			keServer[tbl][col] = nilai;
		}
		return keServer;
	}

	/** Urutan alias tabel + map kolom (crossjoin) — sama untuk insert/update/delete. */
	static joinOrderedNamesAndKeServer(buildQuery, formData) {
		const keServer = NexaPayload.joinKeServerFromFormulir(
			buildQuery?.formulir ?? {},
			formData,
		);
		const names = [...(buildQuery?.tabelName ?? [])];
		for (const t of Object.keys(keServer)) {
			if (!names.includes(t)) names.push(t);
		}
		return { names, keServer };
	}

	static joinCoercePositiveInt(v) {
		if (v === null || v === undefined || v === "") return 0;
		const n =
			typeof v === "number" ? v : Number(String(v).trim());
		if (!Number.isFinite(n) || n <= 0) return 0;
		return Math.trunc(n);
	}

	static joinNormalizeIdsPatch(idsPatch = {}) {
		const raw = idsPatch && typeof idsPatch === "object" ? idsPatch : {};
		const out = Object.create(null);
		for (const [k, v] of Object.entries(raw)) {
			const n = NexaPayload.joinCoercePositiveInt(v);
			if (n > 0) out[k] = n;
		}
		return out;
	}

	/**
	 * Gabungkan `patch.ids` dengan PK tabel utama dari `patch` / `envelope`
	 * (`recordId`, `rowId`, `pk`, `id`, `deleteId`) agar layar NX.Screen tetap cocok tanpa `{ ids: { … } }` manual.
	 */
	static joinMergeIdsFromEnvelope(envelope = {}, patch = {}, buildQuery) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const merged = NexaPayload.joinNormalizeIdsPatch(
			p.ids && typeof p.ids === "object" ? p.ids : {},
		);
		const mainTbl =
			Array.isArray(buildQuery?.tabelName) && buildQuery.tabelName.length
				? buildQuery.tabelName[0]
				: "";
		const ridRaw =
			p.recordId ??
			p.rowId ??
			p.pk ??
			p.id ??
			e.recordId ??
			e.rowId ??
			e.pk ??
			e.deleteId ??
			null;
		const rid = NexaPayload.joinCoercePositiveInt(ridRaw);
		if (mainTbl && rid > 0 && !(merged[mainTbl] > 0)) {
			merged[mainTbl] = rid;
		}
		return merged;
	}

	/** Alias yang punya PK di ids tapi belum ada di urutan nama — agar delete/update tidak diam-diam diabaikan. */
	static joinEnsureNamesForIds(namesIn, tblKeys, idsMerged) {
		const names = [...namesIn];
		const norm = NexaPayload.joinNormalizeIdsPatch(idsMerged);
		for (const tbl of Object.keys(norm)) {
			if (!tblKeys[tbl]) continue;
			if (!names.includes(tbl)) names.push(tbl);
		}
		return names;
	}

	/**
	 * Nama kolom PK fisik untuk alias (bukan `keyIndex` numerik indeks Office).
	 * Utama: parse `operasi[tbl].index` seperti `alias.kolom`.
	 */
	static joinPkColumnName(buildQuery, tbl) {
		const op = buildQuery?.operasi?.[tbl];
		if (!op || typeof op !== "object") return "id";
		const idx = String(op.index ?? "").trim();
		const m = idx.match(/^([\w]+)\.([\w]+)$/);
		if (
			m &&
			m[1] === tbl &&
			/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(m[2])
		) {
			return m[2];
		}
		const pkRaw =
			op.keyIndex != null ? String(op.keyIndex).trim() : "";
		if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pkRaw)) return pkRaw;
		return "id";
	}

	/** PK per alias: `idsPatch[tbl]` mengalahkan kolom PK dari keServer / `id`. */
	static joinResolveRowIds(buildQuery, names, keServer, idsPatch = {}) {
		const out = Object.create(null);
		const p = NexaPayload.joinNormalizeIdsPatch(idsPatch);
		for (const tbl of names) {
			let n = NexaPayload.joinCoercePositiveInt(p[tbl]);
			if (!(n > 0)) {
				const pkCol = NexaPayload.joinPkColumnName(buildQuery, tbl);
				const row = keServer?.[tbl];
				if (row && typeof row === "object") {
					const cand = row[pkCol] ?? row.id;
					n = NexaPayload.joinCoercePositiveInt(cand);
				}
			}
			if (n > 0) {
				out[tbl] = n;
			}
		}
		return out;
	}

	/** File/Blob atau bentuk NexaValidation `{ content: number[], type, name }`. */
	static joinIsUploadableFile(v) {
		if (v == null) return false;
		if (typeof Blob !== "undefined" && v instanceof Blob) return true;
		if (
			typeof v === "object" &&
			Array.isArray(v.content) &&
			v.content.length > 0
		) {
			return true;
		}
		return false;
	}

	/** Field formulir dengan `upload: true` + `failed` `tabel.kolom` + file bisa di-upload. */
	static joinListUploadJobs(formulir, formData) {
		const jobs = [];
		if (!formulir || typeof formulir !== "object" || !formData) return jobs;
		for (const [fieldKey, meta] of Object.entries(formulir)) {
			if (!meta || typeof meta !== "object") continue;
			if (!meta.upload) continue;
			const failed = String(meta.failed ?? "").trim();
			const dot = failed.indexOf(".");
			if (dot < 1) continue;
			const table = failed.slice(0, dot);
			const column = failed.slice(dot + 1);
			const raw = formData[fieldKey];
			if (!NexaPayload.joinIsUploadableFile(raw)) continue;
			jobs.push({ fieldKey, table, column, file: raw });
		}
		return jobs;
	}

	/** Kolom DB drive-upload (`failed` seperti `demo.file`) untuk satu alias tabel — dipakai saat delete join. */
	static joinCleanupUploadColumnsForTable(formulir, tableAlias) {
		const cols = [];
		const tbl = String(tableAlias ?? "").trim();
		if (!formulir || typeof formulir !== "object" || !tbl) return cols;
		const prefix = `${tbl}.`;
		for (const meta of Object.values(formulir)) {
			if (!meta || typeof meta !== "object" || !meta.upload) continue;
			const failed = String(meta.failed ?? "").trim();
			if (!failed.startsWith(prefix)) continue;
			const col = failed.slice(prefix.length);
			if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) cols.push(col);
		}
		return cols;
	}

	static joinCloneDataWithoutUploads(formData, jobs) {
		const out = { ...(formData ?? {}) };
		for (const j of jobs) delete out[j.fieldKey];
		return out;
	}

	static joinUint8ToBase64(u8) {
		if (typeof Buffer !== "undefined") {
			return Buffer.from(u8).toString("base64");
		}
		let s = "";
		const chunk = 0x8000;
		for (let i = 0; i < u8.length; i += chunk) {
			s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
		}
		return typeof btoa !== "undefined" ? btoa(s) : "";
	}

	static joinFileToBase64(file) {
		return new Promise((resolve, reject) => {
			if (typeof Blob !== "undefined" && file instanceof Blob) {
				const r = new FileReader();
				r.onload = () => resolve(String(r.result ?? ""));
				r.onerror = () =>
					reject(r.error || new Error("FileReader gagal membaca berkas."));
				r.readAsDataURL(file);
				return;
			}
			if (
				file &&
				typeof file === "object" &&
				Array.isArray(file.content)
			) {
				const u8 = new Uint8Array(file.content);
				const mime =
					typeof file.type === "string" && file.type.trim() !== ""
						? file.type.trim()
						: "application/octet-stream";
				const b64 = NexaPayload.joinUint8ToBase64(u8);
				resolve(`data:${mime};base64,${b64}`);
				return;
			}
			reject(new Error("joinFileToBase64: bentuk file tidak didukung."));
		});
	}

	static joinUploadFilename(file) {
		if (file && typeof file.name === "string" && file.name.trim() !== "") {
			return file.name.trim();
		}
		return "upload.bin";
	}

	static joinMergeUploadStepsIntoInsertSteps(insertSteps, uploadSteps) {
		const byAlias = new Map();
		for (const u of uploadSteps) {
			const k = u.afterAlias;
			if (!k) continue;
			if (!byAlias.has(k)) byAlias.set(k, []);
			byAlias.get(k).push(u);
		}
		const out = [];
		for (const st of insertSteps) {
			out.push(st);
			const alias = st.alias;
			const ups = alias && byAlias.has(alias) ? byAlias.get(alias) : null;
			if (ups && ups.length) {
				for (const u of ups) out.push(u);
				byAlias.delete(alias);
			}
		}
		for (const ups of byAlias.values()) {
			for (const u of ups) out.push(u);
		}
		return out;
	}

	/**
	 * Pastikan setiap alias tabel yang memiliki upload pada mode insert
	 * punya langkah `insert` dulu, meski tidak ada field non-upload di form.
	 * Ini mencegah gagal `upload membutuhkan id atau afterAlias`.
	 */
	static joinEnsureInsertStepsForUploadTables(insertSteps, buildQuery, appId, uploads) {
		const steps = Array.isArray(insertSteps) ? [...insertSteps] : [];
		const ups = Array.isArray(uploads) ? uploads : [];
		if (!ups.length) return steps;
		const operasi = buildQuery?.operasi ?? {};
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(operasi);
		const main = Array.isArray(buildQuery?.tabelName) ? (buildQuery.tabelName[0] ?? "") : "";
		const existingAlias = new Set(
			steps
				.map((s) => String(s?.alias ?? "").trim())
				.filter((x) => x !== ""),
		);
		for (const job of ups) {
			const tbl = String(job?.table ?? "").trim();
			if (!tbl || existingAlias.has(tbl)) continue;
			const tk = tblKeys[tbl];
			if (!tk) continue;
			const cols = {};
			if (tbl !== main) {
				const fk = NexaPayload.joinFkColChild(operasi, tbl, main);
				if (fk != null && fk !== "") cols[fk] = "{{previousInsertId}}";
			}
			steps.push({
				action: "insert",
				tableKey: tk,
				name: appId,
				alias: tbl,
				columns: cols,
			});
			existingAlias.add(tbl);
		}
		return steps;
	}

	static async joinBuildUploadStepsInsert(buildQuery, appId, uploads) {
		const operasi = buildQuery?.operasi ?? {};
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(operasi);
		const out = [];
		for (const job of uploads) {
			const tk = tblKeys[job.table];
			if (!tk) continue;
			const b64 = await NexaPayload.joinFileToBase64(job.file);
			out.push({
				action: "upload",
				tableKey: tk,
				name: appId,
				alias: job.table,
				afterAlias: job.table,
				uploadTable: job.table,
				column: job.column,
				base64: b64,
				filename: NexaPayload.joinUploadFilename(job.file),
			});
		}
		return out;
	}

	static async joinBuildUploadStepsForUpdate(
		buildQuery,
		appId,
		uploads,
		idsMerged,
		dataPlain,
	) {
		const operasi = buildQuery?.operasi ?? {};
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(operasi);
		let { names, keServer } = NexaPayload.joinOrderedNamesAndKeServer(
			buildQuery,
			dataPlain,
		);
		names = NexaPayload.joinEnsureNamesForIds(names, tblKeys, idsMerged);
		const resolvedIds = NexaPayload.joinResolveRowIds(
			buildQuery,
			names,
			keServer,
			idsMerged,
		);
		const out = [];
		for (const job of uploads) {
			const rowId = NexaPayload.joinCoercePositiveInt(resolvedIds[job.table]);
			if (!(rowId > 0)) continue;
			const tk = tblKeys[job.table];
			if (!tk) continue;
			const b64 = await NexaPayload.joinFileToBase64(job.file);
			out.push({
				action: "upload",
				tableKey: tk,
				name: appId,
				alias: job.table,
				id: rowId,
				uploadTable: job.table,
				column: job.column,
				base64: b64,
				filename: NexaPayload.joinUploadFilename(job.file),
			});
		}
		return out;
	}

	/**
	 * Susun langkah insert berantai dari `NX.BuildQuery` + field form (Canonical crossjoin).
	 */
	static joinInsertStepsFromBuildQuery(buildQuery, appId, formData) {
		const operasi = buildQuery?.operasi ?? {};
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(operasi);
		const main = Array.isArray(buildQuery?.tabelName)
			? buildQuery.tabelName[0]
			: "";
		const { names, keServer } = NexaPayload.joinOrderedNamesAndKeServer(
			buildQuery,
			formData,
		);

		const steps = [];
		for (const tbl of names) {
			const cols = keServer[tbl];
			if (!cols || !Object.keys(cols).length) continue;
			const tk = tblKeys[tbl];
			if (!tk) continue;

			const patch = { ...cols };
			if (tbl !== main) {
				const fk = NexaPayload.joinFkColChild(operasi, tbl, main);
				if (fk != null && patch[fk] == null)
					patch[fk] = "{{previousInsertId}}";
			}
			steps.push({
				action: "insert",
				tableKey: tk,
				name: appId,
				alias: tbl,
				columns: patch,
			});
		}
		return steps;
	}

	/**
	 * Langkah update per tabel (kolom dari formulir.failed); perlu PK per alias (`ids` atau field map ke `alias.pk`).
	 */
	static joinUpdateStepsFromBuildQuery(
		buildQuery,
		appId,
		formData,
		idsPatch = {},
	) {
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(buildQuery?.operasi ?? {});
		let { names, keServer } = NexaPayload.joinOrderedNamesAndKeServer(
			buildQuery,
			formData,
		);
		names = NexaPayload.joinEnsureNamesForIds(names, tblKeys, idsPatch);
		const resolvedIds = NexaPayload.joinResolveRowIds(
			buildQuery,
			names,
			keServer,
			idsPatch,
		);
		const steps = [];
		for (const tbl of names) {
			const tk = tblKeys[tbl];
			if (!tk) continue;
			const rowId = resolvedIds[tbl];
			if (!(rowId > 0)) continue;
			const pkCol = NexaPayload.joinPkColumnName(buildQuery, tbl);
			const colsRaw =
				keServer[tbl] && typeof keServer[tbl] === "object"
					? { ...keServer[tbl] }
					: {};
			delete colsRaw[pkCol];
			delete colsRaw.id;
			if (!Object.keys(colsRaw).length) continue;
			steps.push({
				action: "update",
				tableKey: tk,
				name: appId,
				alias: tbl,
				id: rowId,
				columns: colsRaw,
			});
		}
		return steps;
	}

	/**
	 * Langkah delete: anak → induk (`tabelName` dibalik). Hanya alias yang punya PK ter-resolve.
	 */
	static joinDeleteStepsFromBuildQuery(
		buildQuery,
		appId,
		formData,
		idsPatch = {},
	) {
		const tblKeys = NexaPayload.joinTblKeysFromOperasi(buildQuery?.operasi ?? {});
		const operasi = buildQuery?.operasi ?? {};
		let { names, keServer } = NexaPayload.joinOrderedNamesAndKeServer(
			buildQuery,
			formData,
		);
		names = NexaPayload.joinEnsureNamesForIds(names, tblKeys, idsPatch);
		const resolvedIds = NexaPayload.joinResolveRowIds(
			buildQuery,
			names,
			keServer,
			idsPatch,
		);
		const mainTbl = Array.isArray(buildQuery?.tabelName) ? (buildQuery.tabelName[0] ?? "") : "";
		const mainId = mainTbl ? NexaPayload.joinCoercePositiveInt(resolvedIds[mainTbl]) : 0;
		const steps = [];
		for (let i = names.length - 1; i >= 0; i--) {
			const tbl = names[i];
			const rowId = resolvedIds[tbl];
			const tk = tblKeys[tbl];
			if (!tk) continue;
			const cleanupCols = NexaPayload.joinCleanupUploadColumnsForTable(
				buildQuery?.formulir ?? {},
				tbl,
			);
			const step = {
				action: "delete",
				tableKey: tk,
				name: appId,
				alias: tbl,
			};
			if (rowId > 0) {
				step.id = rowId;
			} else {
				// Fallback: jika ID child tidak ada di row hasil join, hapus by FK ke parent.
				const fk = tbl !== mainTbl ? NexaPayload.joinFkColChild(operasi, tbl, mainTbl) : null;
				if (!(fk && mainId > 0)) continue;
				step.whereColumn = fk;
				step.whereValue = mainId;
			}
			if (cleanupCols.length) {
				step.cleanupUploadColumns = cleanupCols;
				step.cleanupUploadTable = tbl;
			}
			steps.push(step);
		}
		return steps;
	}

	/**
	 * Insert multi-tabel dari build query join + data form.
	 * `patch`: `{ data }` atau `{ data, buildQuery }` (tanpa buildQuery → `NX.BuildQuery(appId)`).
	 */
	static async joinInsertPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const appId = e.appId ?? e.id ?? "";
		const formData = p.data ?? {};
		const buildQuery =
			p.buildQuery ?? (await NX.BuildQuery(appId));
		const steps = NexaPayload.joinInsertStepsFromBuildQuery(
			buildQuery,
			appId,
			formData,
		);
		if (!steps.length) {
			return null;
		}
		return NexaPayload.joinMutationPayload(e, { steps });
	}

	/**
	 * `patch`: `{ data, ids?, buildQuery?, recordId?, id? … }`.
	 * PK tabel utama dari `patch` / envelope (`recordId`, `rowId`, `pk`, `id`) digabung ke `ids` (tanpa menimpa `ids[aliasUtama]` eksplisit).
	 */
	static async joinUpdatePayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const appId = e.appId ?? e.id ?? "";
		const formData = p.data ?? {};
		const buildQuery =
			p.buildQuery ?? (await NX.BuildQuery(appId));
		const idsMerged = NexaPayload.joinMergeIdsFromEnvelope(
			e,
			p,
			buildQuery,
		);
		const steps = NexaPayload.joinUpdateStepsFromBuildQuery(
			buildQuery,
			appId,
			formData,
			idsMerged,
		);
		if (!steps.length) {
			return {
				success: false,
				error:
					"joinUpdate: tidak ada langkah (perlu PK per alias via ids / recordId / field formulir→alias.pk, dan setidaknya satu kolom non-PK untuk diubah).",
				results: [],
				skipped: true,
			};
		}
		return NexaPayload.joinMutationPayload(e, { steps });
	}

	/**
	 * Simpan crossjoin otomatis: PK utama ada di `envelope` atau `patch`
	 * (`recordId`, `rowId`, `pk`, `id`) → {@link joinUpdatePayload}, jika tidak → {@link joinInsertPayload}.
	 *
	 * Field formulir dengan `upload: true`: berkas dikodekan base64 dan dikirim sebagai langkah `upload`
	 * pada payload yang sama — diproses di JoinOprasi (PHP): NexaFile + Storage, tanpa endpoint CloudController.
	 */
	static async joinMutasiPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const formData = p.data ?? {};
		const appId = String(e.appId ?? e.id ?? "").trim();
		const buildQuery =
			p.buildQuery ??
			(appId !== "" ? await NX.BuildQuery(appId) : null);

		const uploads = NexaPayload.joinListUploadJobs(
			buildQuery?.formulir ?? {},
			formData,
		);
		const dataPlain = NexaPayload.joinCloneDataWithoutUploads(formData, uploads);

		const ridRaw =
			p.recordId ??
			p.rowId ??
			p.pk ??
			p.id ??
			e.recordId ??
			e.rowId ??
			e.pk ??
			null;
		const isUpdate = NexaPayload.joinCoercePositiveInt(ridRaw) > 0;

		if (!uploads.length) {
			if (isUpdate) return NexaPayload.joinUpdatePayload(e, p);
			return NexaPayload.joinInsertPayload(e, p);
		}

		if (!buildQuery) {
			return {
				success: false,
				error:
					"joinMutasi upload: butuh appId dan BuildQuery untuk field dengan upload.",
				results: [],
			};
		}

		try {
			if (isUpdate) {
				const idsMerged = NexaPayload.joinMergeIdsFromEnvelope(
					e,
					p,
					buildQuery,
				);
				let steps = NexaPayload.joinUpdateStepsFromBuildQuery(
					buildQuery,
					appId,
					dataPlain,
					idsMerged,
				);
				const uploadSteps = await NexaPayload.joinBuildUploadStepsForUpdate(
					buildQuery,
					appId,
					uploads,
					idsMerged,
					dataPlain,
				);
				steps = [...steps, ...uploadSteps];
				if (!steps.length) {
					return {
						success: false,
						error:
							"joinMutasi: tidak ada langkah (perlu kolom untuk update atau PK tabel untuk upload).",
						results: [],
						skipped: true,
					};
				}
				return NexaPayload.joinMutationPayload(e, { steps });
			}

			let steps = NexaPayload.joinInsertStepsFromBuildQuery(
				buildQuery,
				appId,
				dataPlain,
			);
			steps = NexaPayload.joinEnsureInsertStepsForUploadTables(
				steps,
				buildQuery,
				appId,
				uploads,
			);
			const uploadSteps = await NexaPayload.joinBuildUploadStepsInsert(
				buildQuery,
				appId,
				uploads,
			);
			steps = NexaPayload.joinMergeUploadStepsIntoInsertSteps(steps, uploadSteps);
			if (!steps.length) {
				return null;
			}
			return NexaPayload.joinMutationPayload(e, { steps });
		} catch (err) {
			return {
				success: false,
				error:
					err && typeof err.message === "string"
						? err.message
						: String(err ?? "joinMutasi gagal"),
				results: [],
			};
		}
	}

	/**
	 * `patch`: `{ data?, ids?, buildQuery?, … }` — hapus terbalik urutan join.
	 * PK dari `ids`, `recordId` / envelope, atau field map ke `alias.pk`.
	 */
	static async joinDeletePayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const appId = e.appId ?? e.id ?? "";
		const formData = p.data ?? {};
		const buildQuery =
			p.buildQuery ?? (await NX.BuildQuery(appId));
		const idsMerged = NexaPayload.joinMergeIdsFromEnvelope(
			e,
			p,
			buildQuery,
		);
		const steps = NexaPayload.joinDeleteStepsFromBuildQuery(
			buildQuery,
			appId,
			formData,
			idsMerged,
		);
		if (!steps.length) {
			return {
				success: false,
				error:
					"joinDelete: tidak ada langkah (perlu PK per tabel via ids / recordId / field formulir→alias.pk).",
				results: [],
				skipped: true,
			};
		}
		return NexaPayload.joinMutationPayload(e, { steps });
	}

	/** Normalisasi baris pertama hasil Office::searchPopulate / searchAtPopulate (bisa `response` atau `data`, kadang dibungkus `data`). */
	static extractSearchPopulateRows(result) {
		const r = result && typeof result === "object" ? result : {};
		const inner =
			r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : r;

		const fromResponse =
			Array.isArray(inner.response) ?
				inner.response
			: Array.isArray(r.response) ?
				r.response
			:	null;
		if (fromResponse) {
			return fromResponse;
		}

		const fromData =
			Array.isArray(inner.data) ?
				inner.data
			: Array.isArray(r.data) && !inner.response ?
				r.data
			:	null;
		return fromData ?? [];
	}

	/**
	 * Populate multi-tabel: baca konfig dari bucket field `populate`,
	 * cari baris indeks dengan Office::searchPopulate, lalu Office::setPopulate (Populate::build).
	 * `status`: insert | update | delete — sama constraint `Populate::build`.
	 */
	static async populatePayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};

		const key = String(p.appKey ?? e.appKey ?? e.appId ?? e.id ?? "").trim();
		const search = String(p.search ?? e.search ?? "");
		const statusRaw = String(p.status ?? e.status ?? "insert").trim();
		const status =
			statusRaw === "insert" ||
			statusRaw === "update" ||
			statusRaw === "delete" ?
				statusRaw
			:	"insert";

		if (!key) {
			throw new Error(
				"NexaPayload.populatePayload: appId/appKey nexaStore wajib diisi.",
			);
		}

		const Sdk = new NXUI.Buckets(key);
		const checkedItems = await Sdk.retFields("populate");
		if (!checkedItems || typeof checkedItems !== "object") {
			throw new Error(
				"NexaPayload.populatePayload: tidak ada field dengan flag populate untuk store ini.",
			);
		}

		const meta = checkedItems.populate?.metadata ?? checkedItems.metadata ?? null;
		const populateIndex =
			meta && typeof meta.index === "object" ? meta.index : null;
		const populateTarget = Array.isArray(meta?.targets) ? meta.targets : [];
		const allowBulkByUserid =
			meta && typeof meta === "object" ?
				Boolean(
					meta.allowBulkByUserid ??
						meta?.options?.allowBulkByUserid ??
						false,
				)
			:	false;

		if (
			!populateIndex ||
			populateIndex.tabel == null ||
			populateIndex.fieldSearch == null
		) {
			throw new Error(
				"NexaPayload.populatePayload: populate.metadata.index (tabel, fieldSearch, …) tidak lengkap.",
			);
		}
		const explicitRecordIdForSearch =
			p?.recordId ??
			p?.id ??
			e?.recordId ??
			e?.id ??
			p?.payload?.id ??
			p?.payload?.recordId ??
			p?.payload?.record_id ??
			p?.data?.id ??
			(typeof NXUI !== "undefined" &&
			NXUI &&
			typeof NXUI.Rid === "function" ?
				NXUI.Rid()
			:	null) ??
			null;
		const result = await NXUI.Storage().models("Office").searchPopulate({
			search,
			debug: Boolean(p.debug ?? e.debug ?? false),
			access: populateIndex?.access,
			userid: globalThis?.NEXA?.credential?.userid,
			recordId: explicitRecordIdForSearch,
			id: explicitRecordIdForSearch,
			...populateIndex,
		});

		const rows = NexaPayload.extractSearchPopulateRows(result);
		const explicitRecordId =
			p?.recordId ??
			p?.id ??
			e?.recordId ??
			e?.id ??
			p?.payload?.id ??
			p?.payload?.recordId ??
			p?.payload?.record_id ??
			p?.data?.id ??
			(typeof NXUI !== "undefined" &&
			NXUI &&
			typeof NXUI.Rid === "function" ?
				NXUI.Rid()
			:	null) ??
			null;
		const hasExplicitRecordId =
			explicitRecordId !== undefined &&
			explicitRecordId !== null &&
			String(explicitRecordId).trim() !== "";
		const responIndexRaw =
			Array.isArray(rows) && rows.length ? rows[0] : undefined;
		if (status !== "insert" && !responIndexRaw && !hasExplicitRecordId) {
			const tabelDbg = populateIndex?.tabel ?? null;
			const fieldDbg = populateIndex?.fieldSearch ?? null;
			throw new Error(
				`NexaPayload.populatePayload: Tidak ada hasil dari searchPopulate. search="${String(search)}" tabel=${String(
					tabelDbg,
				)} fieldSearch=${String(fieldDbg)}`,
			);
		}
		const payloadRow =
			p?.payload && typeof p.payload === "object" ? p.payload : {};
		const responIndex = {
			...(responIndexRaw && typeof responIndexRaw === "object" ? responIndexRaw : {}),
			...payloadRow,
			...(hasExplicitRecordId ? { id: explicitRecordId } : {}),
		};
		const rawUid = globalThis?.NEXA?.credential?.userid;
		const appUserId =
			rawUid !== undefined && rawUid !== null && rawUid !== "" ? rawUid : 1;

		const relasiKeyNorm =
			populateIndex?.relasiKey != null ?
				String(populateIndex.relasiKey).trim()
			:	"";
		const sourceIdFromExplicit =
			hasExplicitRecordId ? explicitRecordId : null;
		const sourceIdFromIndex =
			relasiKeyNorm !== "" ?
				(responIndex?.[relasiKeyNorm] ?? responIndex?.id ?? null)
			:	(responIndex?.id ?? null);
		const sourceId = sourceIdFromExplicit ?? sourceIdFromIndex;

		const indexValue = {
			[populateIndex.fieldSearch]:
				responIndex?.[populateIndex.fieldSearch] ?? null,
			...(relasiKeyNorm !== "" ?
				{ [relasiKeyNorm]: sourceId }
			:	{}),
			...(status === "insert" && relasiKeyNorm !== "userid" ?
				{ userid: appUserId }
			:	{}),
		};
		if (status === "insert" && relasiKeyNorm === "id") {
			delete indexValue.id;
		}
		if (relasiKeyNorm === "userid") {
			indexValue.source_userid = sourceId;
		}

		const indexPayload = {
			tabel: populateIndex.tabel,
			value: indexValue,
		};

		const targets = (populateTarget || []).map((item) => {
			const valueMap = (Array.isArray(item.value) ? item.value : []).reduce(
				(acc, fieldName) => {
					acc[fieldName] = responIndex?.[fieldName] ?? null;
					return acc;
				},
				{},
			);

			const normalizedValueMap = { ...valueMap };
			const relasiField = item?.relasiKey;

			if (relasiField) {
				const relasiFieldNorm = String(relasiField).trim();
				const relasiFromIndex =
					relasiFieldNorm !== "" &&
					responIndex &&
					typeof responIndex === "object" &&
					Object.prototype.hasOwnProperty.call(responIndex, relasiFieldNorm) ?
						responIndex[relasiFieldNorm]
					:	undefined;
				// Untuk target branch: utamakan nilai relasi aktual dari row index (mis. slug/petani),
				// fallback ke sourceId (id index) jika field tersebut tidak ada.
				const useDerivedRelationKey =
					relasiFieldNorm.endsWith("_id") ||
					relasiFieldNorm === "userid" ||
					relasiFieldNorm === "ptmid" ||
					relasiFieldNorm === "id";
				const fallbackRelationValue =
					useDerivedRelationKey ? sourceIdFromIndex : sourceId;
				normalizedValueMap[relasiField] =
					relasiFromIndex !== undefined &&
					relasiFromIndex !== null &&
					String(relasiFromIndex).trim() !== "" ?
						relasiFromIndex
					:	fallbackRelationValue;
			}

			if (relasiField === "userid") {
				normalizedValueMap.source_userid = sourceId;
			}
			if (status === "insert" && relasiField !== "userid") {
				normalizedValueMap.userid = appUserId;
			}
			if (status === "insert" && relasiField === "id") {
				delete normalizedValueMap.id;
			}

			// Untuk update/delete, selalu coba sertakan PK `id` dari baris indeks agar mutasi spesifik (hindari where userid).
			if (status !== "insert") {
				const idxId = responIndex?.id;
				const relasiFieldNorm =
					relasiField != null ? String(relasiField).trim() : "";
				const mayAttachId =
					relasiFieldNorm === "" || relasiFieldNorm === "id";
				if (
					mayAttachId &&
					idxId !== undefined &&
					idxId !== null &&
					String(idxId).trim() !== "" &&
					!Object.prototype.hasOwnProperty.call(normalizedValueMap, "id")
				) {
					normalizedValueMap.id = idxId;
				}
				// Untuk update/delete populate, paksa where menggunakan RID eksplisit jika tersedia.
				// Nilai relasi seperti slug/petani_id tetap diperlakukan sebagai payload update (SET),
				// bukan sebagai kunci WHERE.
				if (hasExplicitRecordId) {
					const useDerivedRelationKey =
						relasiFieldNorm.endsWith("_id") ||
						relasiFieldNorm === "userid" ||
						relasiFieldNorm === "ptmid" ||
						relasiFieldNorm === "id";
					if (!useDerivedRelationKey) {
						normalizedValueMap.__relationKey = "id";
						normalizedValueMap.__relationValue = explicitRecordId;
					}
				}
			} else if (
				relasiField &&
				Object.prototype.hasOwnProperty.call(normalizedValueMap, "id")
			) {
				// Insert populate tidak boleh membawa id.
				delete normalizedValueMap.id;
			}
			return {
				value: normalizedValueMap,
				tabel: item?.tabelSave,
			};
		});

		const payload = {
			status,
			index: status === "insert" ? null : indexPayload,
			targets,
			allowBulkByUserid,
		};

		return NXUI.Storage().models("Office").setPopulate(payload);
	}

	/**
	 * Rantai: `new NexaPayload(env).populate({ search }).insert()` (+ `.update()`, `.delete()` untuk status setPopulate).
	 * Jangan sampur dengan `.run("delete")` — itu hapus baris biasa via `deletePayload`.
	 */
	static populateChain(envelope, patch = {}) {
		const env = envelope && typeof envelope === "object" ? envelope : {};
		const base = patch && typeof patch === "object" ? patch : {};
		const exec = (status) =>
			NexaPayload.populatePayload(env, { ...base, status });
		return {
			insert: () => exec("insert"),
			update: () => exec("update"),
			delete: () => exec("delete"),
		};
	}

	/**
	 * Upload file + kolom tambahan lewat {@link NXUI.Storage().cloud().Background}.
	 *
	 * **Mode otomatis (forms):** envelope berisi `appId`/`id`, patch berisi `data` (objek form).
	 * Konfig upload pertama diambil dari `NXUI.Buckets(appKey).getFields("upload")[0]` —
	 * `failed` → `tabel` + `fieldupload`, kolom file dari `uploadField.id`.
	 * Kolom lain dari form → **`field`** (JSON `fields`), kecuali **`patch.field === false`**:
	 * tidak mengirim kolom tambahan (hanya file), cocok untuk banyak upload/update tanpa menimpa field bawaan form.
	 *
	 * **Mode manual:** isi langsung `tabel`, `fieldupload`, `field`, `file`, `uploadFieldId`, dll. di patch;
	 * atau set `patch.skipBucketResolve: true` untuk paksa manual walau ada `data`.
	 *
	 * Patch juga: `id` / `recordId` / `rowId` (PK untuk update), callback `onProgress` / `onSuccess` / `onError`,
	 * opsional `accept`, `multiple`, `userid`.
	 * **`formElementId`**: ID kontainer form NexaFloating (argumen pertama handler `nx[method](formElementId, data, cfg)`).
	 * Jika diisi dan respons upload `success === true`, event `nexaFloatingFileUploadSuccess` dipanggil agar UI input file di-reset.
	 */
	static async uploadPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};

		const appKey = String(p.appKey ?? e.appKey ?? e.appId ?? e.id ?? "").trim();
		const rawStorage = p.storage ?? e.storage ?? "";
		const storageMode =
			typeof rawStorage === "string" ? rawStorage.trim().toLowerCase() : "";

		const rowIdCandidate = p.id ?? p.recordId ?? p.rowId;
		let rowId =
			rowIdCandidate !== undefined &&
			rowIdCandidate !== null &&
			String(rowIdCandidate).trim() !== ""
				? rowIdCandidate
				: null;

		// Storage lokal/federated: seragam dengan select/insert/update/delete.
		if (storageMode === "indexeddb" || storageMode === "firebase") {
			const federated = await NexaPayload.federatedFromEnvelope(
				{ appId: appKey, storage: storageMode },
				storageMode,
			);
			const normalizeFileValue = (v) => {
				if (v == null) return "";
				if (typeof v === "string") return v.trim();
				if (typeof Blob !== "undefined" && v instanceof Blob) {
					return String(v.name ?? "").trim();
				}
				if (Array.isArray(v) && v.length > 0) {
					return normalizeFileValue(v[0]);
				}
				if (typeof v === "object") {
					const byName = String(v.name ?? "").trim();
					if (byName) return byName;
					const byPath = String(v.path ?? "").trim();
					if (byPath) return byPath;
					const byUrl = String(v.url ?? v.downloadURL ?? "").trim();
					if (byUrl) return byUrl;
					if (typeof v.length === "number" && v.length > 0) {
						return normalizeFileValue(v[0]);
					}
				}
				return "";
			};
			const uploadFieldName = String(p.fieldupload ?? p.uploadFieldId ?? "file").trim();
			const payloadBase =
				p.data && typeof p.data === "object" && !Array.isArray(p.data)
					? { ...p.data }
					: p.field && typeof p.field === "object" && !Array.isArray(p.field)
						? { ...p.field }
						: {};
			const fileFieldKey = uploadFieldName || "file";
			const normalizedFromPatch = normalizeFileValue(p.file);
			const normalizedFromPayload = normalizeFileValue(payloadBase[fileFieldKey]);
			const normalizedFile = normalizedFromPatch || normalizedFromPayload;
			if (normalizedFile) {
				payloadBase[fileFieldKey] = normalizedFile;
			}
			const safeId = Number(rowId);
			if (Number.isFinite(safeId) && safeId > 0) {
				return federated.upt(payloadBase, Math.trunc(safeId), null);
			}
			return federated.set(payloadBase, false);
		}
		if (NexaPayload.isAwaitStorage(storageMode)) {
			NexaPayload.ensureAwaitAvailable();
			const table = await NexaPayload.resolveAwaitTableName(appKey);
			const uploadData =
				p.data && typeof p.data === "object" && !Array.isArray(p.data)
					? { ...p.data }
					: p.field && typeof p.field === "object" && !Array.isArray(p.field)
						? { ...p.field }
						: {};
			if (p.file != null) {
				uploadData.file = p.file;
			}
			if (p.fieldupload && p.file != null) {
				uploadData[String(p.fieldupload)] = p.file;
			}
			const awaitModel = NexaPayload.buildAwaitMode(new NXUI.Await(), storageMode).tabel(table);
			if (rowId != null && String(rowId).trim() !== "") {
				return awaitModel.where("id", "=", Number(rowId)).upload(uploadData);
			}
			return awaitModel.upload(uploadData);
		}

		const formElementIdRaw = p.formElementId ?? p.formId ?? null;
		const formElementIdNorm =
			formElementIdRaw !== undefined &&
			formElementIdRaw !== null &&
			String(formElementIdRaw).trim() !== ""
				? String(formElementIdRaw).trim()
				: "";

		const userOnSuccess = typeof p.onSuccess === "function" ? p.onSuccess : null;
		const userOnError = typeof p.onError === "function" ? p.onError : null;

		const isUploadableFile = (v) =>
			(v != null && typeof Blob !== "undefined" && v instanceof Blob) ||
			(v && typeof v === "object" && Array.isArray(v.content) && v.content.length > 0);

		const pickFirstFileLike = (v) => {
			if (isUploadableFile(v)) return v;
			if (Array.isArray(v) && v.length && isUploadableFile(v[0])) return v[0];
			if (
				v &&
				typeof v === "object" &&
				typeof v.length === "number" &&
				v.length > 0 &&
				isUploadableFile(v[0])
			) {
				return v[0];
			}
			return null;
		};
		const toPositiveInt = (v) => {
			const n = Number(v);
			return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
		};

		const fireFloatingFileSuccess = (result) => {
			try {
				if (
					result &&
					result.success === true &&
					formElementIdNorm !== "" &&
					typeof document !== "undefined"
				) {
					document.dispatchEvent(
						new CustomEvent("nexaFloatingFileUploadSuccess", {
							bubbles: true,
							composed: true,
							detail: {
								result,
								formElementId: formElementIdNorm,
							},
						}),
					);
				}
			} catch (_) {
				/* ignore */
			}
		};

		const runBackground = (rawOpts = {}) =>
			new Promise((resolve) => {
				const opts = { ...(rawOpts || {}) };
				Object.keys(opts).forEach((k) => {
					if (opts[k] === undefined || opts[k] === null || opts[k] === false) {
						if (k !== "id") delete opts[k];
					}
				});
				if (opts.field === false || opts.field === null) {
					delete opts.field;
				}
				NXUI.Storage().cloud().Background({
					...opts,
					onSuccess: (result) => {
						fireFloatingFileSuccess(result);
						if (userOnSuccess) userOnSuccess(result);
						resolve(result);
					},
					onError: (err) => {
						if (userOnError) userOnError(err);
						resolve({
							success: false,
							message:
								err && typeof err.message === "string"
									? err.message
									: String(err ?? "Upload gagal"),
						});
					},
				});
			});

		const baseFieldPayloadFromForm = (formData, uploadFieldIds = []) => {
			if (p.field === false) return null;
			const out = {};
			for (const [k, v] of Object.entries(formData || {})) {
				if (uploadFieldIds.includes(k)) continue;
				if (isUploadableFile(v) || pickFirstFileLike(v)) continue;
				out[k] = v;
			}
			return p.field && typeof p.field === "object" ? { ...out, ...p.field } : out;
		};

		const useBucketResolve =
			appKey !== "" &&
			p.data !== undefined &&
			p.data !== null &&
			typeof p.data === "object" &&
			p.skipBucketResolve !== true;

		if (useBucketResolve) {
			const Sdk = new NXUI.Buckets(appKey);
			const uploadItemsRaw = await Sdk.getFields("upload");
			const uploadItems = Array.isArray(uploadItemsRaw) ? uploadItemsRaw : [];
			if (!uploadItems.length) {
				throw new Error(
					'NexaPayload.uploadPayload: tidak ada field dengan flag upload untuk bucket ini.',
				);
			}

			const formData = p.data;
			const uploadFieldIds = uploadItems
				.map((it) => String(it?.id ?? "").trim())
				.filter((x) => x !== "");
			const commonFields = baseFieldPayloadFromForm(formData, uploadFieldIds);

			const jobs = [];
			for (const uploadField of uploadItems) {
				const fk = String(uploadField?.id ?? "").trim();
				if (!fk) continue;
				const picked = pickFirstFileLike(formData[fk] ?? p[fk] ?? null);
				if (!picked) continue;

				const failedStr = String(uploadField?.failed ?? "").trim();
				const dot = failedStr.indexOf(".");
				const tabelFromFailed =
					failedStr !== "" ? (dot >= 0 ? failedStr.slice(0, dot) : failedStr) : "";
				const colFromFailed =
					failedStr !== "" ? (dot >= 0 ? failedStr.slice(dot + 1) : fk) : fk;

				jobs.push({
					fk,
					tabel: p.tabel ?? tabelFromFailed,
					fieldupload: p.fieldupload ?? colFromFailed,
					file: picked,
				});
			}

			if (jobs.length > 0) {
				const results = [];
				let chainedRowId = toPositiveInt(rowId);
				for (let i = 0; i < jobs.length; i++) {
					const job = jobs[i];
					const opts = {
						tabel: job.tabel,
						userid: p.userid ?? e.userid,
						id: chainedRowId,
						fieldupload: job.fieldupload,
						file: job.file,
						[job.fk]: job.file,
						field: i === 0 ? commonFields : null,
						onProgress: p.onProgress,
						accept: p.accept,
						multiple: p.multiple,
					};
					const r = await runBackground(opts);
					results.push({
						...(r && typeof r === "object" ? r : { success: false, message: String(r) }),
						__uploadFieldId: job.fk,
						__fieldupload: job.fieldupload,
					});
					if (chainedRowId == null && r && typeof r === "object") {
						const nextId = toPositiveInt(r.insert_id ?? r.id ?? r.row_id);
						if (nextId != null) chainedRowId = nextId;
					}
				}
				const success = results.every((x) => x && x.success !== false && !x.error);
				return {
					success,
					message: success
						? `Upload ${results.length} kolom berhasil`
						: "Sebagian upload gagal",
					insert_id: chainedRowId ?? null,
					results,
				};
			}
		}

		// Fallback mode manual/single upload.
		const fk =
			p.uploadFieldId !== undefined && p.uploadFieldId !== null
				? String(p.uploadFieldId).trim()
				: "";
		const manualFile = pickFirstFileLike(p.file ?? (fk ? p[fk] : null));
		const opts = {
			tabel: p.tabel,
			userid: p.userid ?? e.userid,
			id: rowId,
			fieldupload: p.fieldupload,
			field: p.field,
			file: manualFile,
			onProgress: p.onProgress,
			accept: p.accept,
			multiple: p.multiple,
		};
		if (fk !== "") {
			opts[fk] = manualFile;
		}
		return runBackground(opts);
	}

	/** Hilangkan prefiks data URL menjadi raw base64. */
	static stripDataUrlBase64(dataUrl) {
		const s = String(dataUrl ?? "");
		const i = s.indexOf("base64,");
		if (i >= 0) {
			return s.slice(i + 7);
		}
		return s.replace(/^data:[^;]+;(?:charset=[^;]+;)?/i, "").trim();
	}

	/**
	 * Blob/File, plain base64/data URL, atau objek Electron `{ path, name }` → base64 (tanpa data URL).
	 * Path lokal: `nx.readImportFileBase64`, `nx.readFileBase64`, atau `require('fs').readFileSync` jika ada.
	 */
	static async importFileLikeToBase64(fileLike) {
		if (fileLike == null) {
			throw new Error("importPayload: file kosong.");
		}
		if (typeof Blob !== "undefined" && fileLike instanceof Blob) {
			const du = await NexaPayload.joinFileToBase64(fileLike);
			return NexaPayload.stripDataUrlBase64(du);
		}
		if (
			typeof fileLike === "object" &&
			typeof fileLike.path === "string" &&
			fileLike.path.trim() !== ""
		) {
			const p = fileLike.path.trim();
			if (typeof globalThis.nx?.readImportFileBase64 === "function") {
				return String(await globalThis.nx.readImportFileBase64(p));
			}
			if (typeof globalThis.nx?.readFileBase64 === "function") {
				return String(await globalThis.nx.readFileBase64(p));
			}
			try {
				const req =
					typeof globalThis.require === "function"
						? globalThis.require
						: null;
				const fs = req?.("fs");
				if (fs?.readFileSync) {
					return fs.readFileSync(p).toString("base64");
				}
			} catch (_) {
				/* lanjut */
			}
			throw new Error(
				"Import: tidak bisa membaca path file di lingkungan ini; definisikan nx.readImportFileBase64(path) di preload atau kirim Blob/File.",
			);
		}
		if (typeof fileLike === "string") {
			return NexaPayload.stripDataUrlBase64(fileLike);
		}
		throw new Error("Import: bentuk file tidak didukung.");
	}

	/**
	 * Impor CSV/XLSX: `patch.data.file` (Blob / Electron path-object), atau `patch.base64`.
	 * Memerlukan nexaStore + NX.BuildQuery untuk tableKey dan formulir.
	 */
	static async importPayload(envelope = {}, patch = {}) {
		const e = envelope && typeof envelope === "object" ? envelope : {};
		const p = patch && typeof patch === "object" ? patch : {};
		const appId = String(p.appId ?? e.appId ?? e.id ?? "").trim();
		if (!appId) {
			throw new Error("importPayload: appId/id nexaStore wajib di envelope Payload.");
		}

		const formData =
			p.data !== undefined && p.data !== null && typeof p.data === "object"
				? p.data
				: {};

		let base64 = typeof p.base64 === "string" ? p.base64.trim() : "";
		if (!base64) {
			const fileLike =
				p.file ??
				formData.file ??
				(Array.isArray(formData.files) ? formData.files[0] : null);
			base64 = await NexaPayload.importFileLikeToBase64(fileLike);
		} else {
			base64 = NexaPayload.stripDataUrlBase64(base64);
		}

		const rawGet = await NXUI.ref.nexaStore(appId).get();
		const tableKey = Number(rawGet?.key);
		if (!Number.isFinite(tableKey) || tableKey < 1) {
			throw new Error("importPayload: key tabel (nexaStore.key) tidak valid.");
		}

		let buildQuery =
			p.buildQuery != null && typeof p.buildQuery === "object"
				? p.buildQuery
				: typeof NX?.BuildQuery === "function"
					? await NX.BuildQuery(appId)
					: null;
		const filename =
			String(
				p.filename ??
					formData.file?.name ??
					formData.filename ??
					"import.csv",
			).trim() || "import.csv";

		const payload = {
			tableKey,
			name: appId,
			appId,
			buildQuery: buildQuery && typeof buildQuery === "object" ? buildQuery : {},
			base64,
			filename,
			delimiter: typeof p.delimiter === "string" ? p.delimiter : ",",
			maxRows:
				typeof p.maxRows === "number" && p.maxRows > 0
					? Math.floor(p.maxRows)
					: 5000,
			maxBytes:
				typeof p.maxBytes === "number" && p.maxBytes > 0
					? Math.floor(p.maxBytes)
					: undefined,
			userid: p.userid ?? e.userid,
			columnMapMode:
				typeof p.columnMapMode === "string" ? p.columnMapMode.trim() : "header",
		};

		return NXUI.Storage().models("Office").Import(payload);
	}

	static handlers = {
		select: async (screen, patch) =>
			NexaPayload.selectPayload(
				{
					...NexaPayload.resolveSelectQueryOpts(screen?.data ?? {}),
					...(screen && typeof screen.data === "object" ? screen.data : {}),
				},
				patch && typeof patch === "object" ? patch : {},
			),
		insert: async (screen, patch) =>NexaPayload.insertPayload(screen.data, patch ?? {}),
		update: async (screen, patch) =>NexaPayload.updatePayload(screen.data, patch ?? {}),
		delete: async (screen, patch) =>
			NexaPayload.deletePayload(screen.data, patch ?? {}),
		populate: async (screen, patch) => {
			const p = patch && typeof patch === "object" ? patch : {};
			const stRaw = String(p.status ?? "").trim();
			const st =
				stRaw === "update" || stRaw === "delete" ? stRaw : "insert";
			return NexaPayload.populatePayload(screen?.data ?? {}, {
				...p,
				status: st,
			});
		},
		upload: async (screen, patch) =>
			NexaPayload.uploadPayload(screen?.data ?? {}, patch ?? {}),
		joinMutation: async (screen, patch) =>
			NexaPayload.joinMutationPayload(screen?.data ?? {}, patch ?? {}),
		joinInsert: async (screen, patch) =>
			NexaPayload.joinInsertPayload(screen?.data ?? {}, patch ?? {}),
		joinUpdate: async (screen, patch) =>
			NexaPayload.joinUpdatePayload(screen?.data ?? {}, patch ?? {}),
		joinMutasi: async (screen, patch) =>
			NexaPayload.joinMutasiPayload(screen?.data ?? {}, patch ?? {}),
		joinDelete: async (screen, patch) =>
			NexaPayload.joinDeletePayload(screen?.data ?? {}, patch ?? {}),
		import: async (screen, patch) =>
			NexaPayload.importPayload(screen?.data ?? {}, patch ?? {}),
	};

	static register(name, handler) {
		if (!name || typeof handler !== "function") {
			return;
		}
		NexaPayload.handlers[String(name)] = handler;
	}






	constructor(data) {
		this.data = data;
	}

	withStorage(mode) {
		this.data = {
			...(this.data && typeof this.data === "object" ? this.data : {}),
			storage: NexaPayload.mapStorageLabel(mode),
		};
		return this;
	}

	indexedDB() {
		return this.withStorage("indexedDB");
	}

	firebase() {
		return this.withStorage("firebase");
	}

	sqlite3() {
		return this.withStorage("sqlite3");
	}

	websocket() {
		return this.withStorage("websocket");
	}

	then(resolve, reject) {
		return this.select().then(
			(result) => resolve?.(result?.response ?? result),
			reject,
		);
	}

	async run(name, ...args) {
		const methodName = String(name || "").trim();
		const handler = NexaPayload.handlers[methodName];

		if (typeof handler !== "function") {
			throw new Error(`Screen method "${methodName}" tidak terdaftar.`);
		}

		return handler(this, ...args);
	}

	async select(...args) {
		return this.run("select", ...args);
	}
	async insert(...args) {
		return this.run("insert", ...args);
	}
	async update(...args) {
		return this.run("update", ...args);
	}
	/** @returns {{ insert: () => Promise<*>, update: () => Promise<*>, delete: () => Promise<*> }} */
	populate(patch = {}) {
		return NexaPayload.populateChain(this.data, patch);
	}
    async upload(...args) {
		return this.run("upload", ...args);
	}

	async import(...args) {
		return this.run("import", ...args);
	}

	async joinMutation(...args) {
		return this.run("joinMutation", ...args);
	}

	async joinInsert(...args) {
		return this.run("joinInsert", ...args);
	}

	async joinUpdate(...args) {
		return this.run("joinUpdate", ...args);
	}

	async joinMutasi(...args) {
		return this.run("joinMutasi", ...args);
	}

	async joinDelete(...args) {
		return this.run("joinDelete", ...args);
	}

	async delete(...args) {
		return this.run("delete", ...args);
	}
}

/**
 * Satu baris tes: chaining `.populate({ search }).insert|update|delete`.
 */
// export async function testing(key, search, status = "insert") {
// 	const st = String(status ?? "insert").trim();
// 	const chain = NexaPayload.populateChain({ appId: key, id: key }, {
// 		search,
// 	});
// 	if (st === "update") {
// 		return chain.update();
// 	}
// 	if (st === "delete") {
// 		return chain.delete();
// 	}
// 	return chain.insert();
// }
