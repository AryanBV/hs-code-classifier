"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorSearchService = void 0;
var VectorSearchService = /** @class */ (function () {
    function VectorSearchService(prisma, openai) {
        this.EMBEDDING_MODEL = 'text-embedding-3-small';
        this.EMBEDDING_DIMENSIONS = 1536;
        this.prisma = prisma;
        this.openai = openai;
    }
    /**
     * Generate embedding for a query string
     */
    VectorSearchService.prototype.generateEmbedding = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.openai.embeddings.create({
                                input: text,
                                model: this.EMBEDDING_MODEL,
                                dimensions: this.EMBEDDING_DIMENSIONS,
                            })];
                    case 1:
                        response = _b.sent();
                        if ((_a = response.data[0]) === null || _a === void 0 ? void 0 : _a.embedding) {
                            return [2 /*return*/, response.data[0].embedding];
                        }
                        throw new Error('Failed to generate embedding: No embedding returned');
                    case 2:
                        error_1 = _b.sent();
                        throw new Error("Embedding generation failed: ".concat(error_1.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Search for similar HS codes using vector similarity
     * Uses cosine similarity via pgvector <=> operator
     */
    VectorSearchService.prototype.semanticSearch = function (query_1) {
        return __awaiter(this, arguments, void 0, function (query, options) {
            var _a, limit, _b, threshold, queryEmbedding, embeddingStr, results, error_2;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = options.limit, limit = _a === void 0 ? 10 : _a, _b = options.threshold, threshold = _b === void 0 ? 0.5 : _b;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.generateEmbedding(query)];
                    case 2:
                        queryEmbedding = _c.sent();
                        embeddingStr = "[".concat(queryEmbedding.join(','), "]");
                        return [4 /*yield*/, this.prisma.$queryRaw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        SELECT\n          id,\n          code,\n          description,\n          description_clean as \"descriptionClean\",\n          chapter,\n          heading,\n          subheading,\n          country_code,\n          ROUND((1 - (embedding <=> ", "::vector))::numeric, 4) as similarity\n        FROM hs_codes\n        WHERE (1 - (embedding <=> ", "::vector)) >= ", "\n        ORDER BY embedding <=> ", "::vector\n        LIMIT ", "\n      "], ["\n        SELECT\n          id,\n          code,\n          description,\n          description_clean as \"descriptionClean\",\n          chapter,\n          heading,\n          subheading,\n          country_code,\n          ROUND((1 - (embedding <=> ", "::vector))::numeric, 4) as similarity\n        FROM hs_codes\n        WHERE (1 - (embedding <=> ", "::vector)) >= ", "\n        ORDER BY embedding <=> ", "::vector\n        LIMIT ", "\n      "])), embeddingStr, embeddingStr, threshold, embeddingStr, limit)];
                    case 3:
                        results = _c.sent();
                        return [2 /*return*/, results];
                    case 4:
                        error_2 = _c.sent();
                        throw new Error("Vector search failed: ".concat(error_2.message));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Hybrid search combining semantic search with keyword matching
     * First uses vector search, then optionally filters by keywords
     */
    VectorSearchService.prototype.hybridSearch = function (query_1) {
        return __awaiter(this, arguments, void 0, function (query, options) {
            var _a, limit, _b, threshold, _c, keywords, results, error_3;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _a = options.limit, limit = _a === void 0 ? 10 : _a, _b = options.threshold, threshold = _b === void 0 ? 0.5 : _b, _c = options.keywords, keywords = _c === void 0 ? [] : _c;
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.semanticSearch(query, { limit: limit * 2, threshold: threshold })];
                    case 2:
                        results = _d.sent();
                        // Optional keyword filtering
                        if (keywords.length > 0) {
                            results = results.filter(function (result) {
                                var searchText = "".concat(result.description, " ").concat(result.descriptionClean).toLowerCase();
                                return keywords.some(function (keyword) { return searchText.includes(keyword.toLowerCase()); });
                            });
                        }
                        return [2 /*return*/, results.slice(0, limit)];
                    case 3:
                        error_3 = _d.sent();
                        throw new Error("Hybrid search failed: ".concat(error_3.message));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Find similar HS codes to a given code
     * Useful for related product suggestions
     */
    VectorSearchService.prototype.findSimilarCodes = function (hsCode_1) {
        return __awaiter(this, arguments, void 0, function (hsCode, options) {
            var _a, limit, _b, threshold, originalCode, embeddingStr, results, error_4;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = options.limit, limit = _a === void 0 ? 10 : _a, _b = options.threshold, threshold = _b === void 0 ? 0.5 : _b;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.prisma.$queryRaw(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n        SELECT embedding::text as embedding FROM hs_codes WHERE code = ", "\n      "], ["\n        SELECT embedding::text as embedding FROM hs_codes WHERE code = ", "\n      "])), hsCode)];
                    case 2:
                        originalCode = _c.sent();
                        if (!originalCode || originalCode.length === 0) {
                            throw new Error("HS Code not found: ".concat(hsCode));
                        }
                        embeddingStr = originalCode[0].embedding;
                        return [4 /*yield*/, this.prisma.$queryRaw(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n        SELECT\n          id,\n          code,\n          description,\n          description_clean as \"descriptionClean\",\n          chapter,\n          heading,\n          subheading,\n          country_code,\n          ROUND((1 - (embedding <=> ", "::vector))::numeric, 4) as similarity\n        FROM hs_codes\n        WHERE code != ", "\n          AND (1 - (embedding <=> ", "::vector)) >= ", "\n        ORDER BY embedding <=> ", "::vector\n        LIMIT ", "\n      "], ["\n        SELECT\n          id,\n          code,\n          description,\n          description_clean as \"descriptionClean\",\n          chapter,\n          heading,\n          subheading,\n          country_code,\n          ROUND((1 - (embedding <=> ", "::vector))::numeric, 4) as similarity\n        FROM hs_codes\n        WHERE code != ", "\n          AND (1 - (embedding <=> ", "::vector)) >= ", "\n        ORDER BY embedding <=> ", "::vector\n        LIMIT ", "\n      "])), embeddingStr, hsCode, embeddingStr, threshold, embeddingStr, limit)];
                    case 3:
                        results = _c.sent();
                        return [2 /*return*/, results];
                    case 4:
                        error_4 = _c.sent();
                        throw new Error("Finding similar codes failed: ".concat(error_4.message));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Batch search for multiple queries
     */
    VectorSearchService.prototype.batchSearch = function (queries_1) {
        return __awaiter(this, arguments, void 0, function (queries, options) {
            var results, _i, queries_2, query, searchResults, error_5;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = new Map();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        _i = 0, queries_2 = queries;
                        _a.label = 2;
                    case 2:
                        if (!(_i < queries_2.length)) return [3 /*break*/, 5];
                        query = queries_2[_i];
                        return [4 /*yield*/, this.semanticSearch(query, options)];
                    case 3:
                        searchResults = _a.sent();
                        results.set(query, searchResults);
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, results];
                    case 6:
                        error_5 = _a.sent();
                        throw new Error("Batch search failed: ".concat(error_5.message));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get search statistics
     */
    VectorSearchService.prototype.getSearchStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var total, withEmbeddings, count, completeness, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.prisma.hsCode.count()];
                    case 1:
                        total = _a.sent();
                        return [4 /*yield*/, this.prisma.$queryRaw(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n        SELECT COUNT(*) as count FROM hs_codes WHERE embedding IS NOT NULL\n      "], ["\n        SELECT COUNT(*) as count FROM hs_codes WHERE embedding IS NOT NULL\n      "])))];
                    case 2:
                        withEmbeddings = _a.sent();
                        count = Number(withEmbeddings[0].count);
                        completeness = total > 0 ? (count / total) * 100 : 0;
                        return [2 /*return*/, {
                                totalCodes: total,
                                codesWithEmbeddings: count,
                                completeness: Math.round(completeness * 100) / 100,
                            }];
                    case 3:
                        error_6 = _a.sent();
                        throw new Error("Failed to get search statistics: ".concat(error_6.message));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return VectorSearchService;
}());
exports.VectorSearchService = VectorSearchService;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
