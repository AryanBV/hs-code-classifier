"use strict";
/**
 * Layer 2: Chapter Filtering Service
 *
 * Filters HS codes to relevant chapters based on product category detection.
 * This dramatically reduces search space (from 10,468 codes to ~100-500 per category).
 *
 * Why this layer works:
 * - HS codes are organized hierarchically by chapter (product type)
 * - A "cotton fabric" query should ONLY search Chapter 52, not all 10,468 codes
 * - This ensures vector search (Layer 3) works on the correct category
 */
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
exports.CHAPTER_KEYWORDS = void 0;
exports.detectChaptersFromQuery = detectChaptersFromQuery;
exports.getCodesByChapters = getCodesByChapters;
exports.smartChapterFilter = smartChapterFilter;
exports.filterCodesByChapters = filterCodesByChapters;
exports.getChapterStats = getChapterStats;
var logger_1 = require("../utils/logger");
var prisma_1 = require("../utils/prisma");
/**
 * HS Code Chapter Mappings
 * Maps product categories to HS chapters
 */
exports.CHAPTER_KEYWORDS = {
    'fruits_produce': {
        chapters: ['08'],
        keywords: ['fruit', 'produce', 'mango', 'apple', 'banana', 'orange', 'grape', 'kiwi', 'blueberry', 'strawberry', 'nut', 'almond', 'walnut', 'cashew', 'pistachio']
    },
    'cotton': {
        chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
        narrowChapters: ['52'], // Cotton specifically
        keywords: ['cotton', 'woven cotton', 'cotton fabric', 'cotton apparel', 'cotton cloth']
    },
    'wool': {
        chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
        narrowChapters: ['53'], // Wool specifically
        keywords: ['wool']
    },
    'textiles': {
        chapters: ['52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
        keywords: ['fabric', 'cloth', 'textile', 'silk', 'linen', 'weave', 'woven', 'yarn', 'thread', 'garment', 'apparel', 'clothing']
    },
    'machinery_engines': {
        chapters: ['84'],
        keywords: ['engine', 'motor', 'machine', 'pump', 'compressor', 'turbine', 'diesel', 'fuel', 'mechanical', 'automotive', 'vehicle', 'parts', 'component']
    },
    'electronics': {
        chapters: ['85'],
        keywords: ['electronic', 'phone', 'smartphone', 'mobile', 'computer', 'circuit', 'electrical', 'battery', 'cable', 'wire', 'equipment', 'device']
    },
    'chemicals': {
        chapters: ['29', '38'],
        keywords: ['chemical', 'organic', 'compound', 'liquid', 'acid', 'base', 'salt', 'polymer', 'plastic', 'resin', 'coolant', 'lubricant', 'solvent', 'cleaner', 'additive', 'catalyst']
    },
    'metals': {
        chapters: ['72', '73', '74', '75', '76', '78', '79', '80', '81'],
        keywords: ['metal', 'steel', 'iron', 'aluminum', 'copper', 'brass', 'stainless', 'alloy', 'ingot', 'plate', 'wire', 'sheet']
    },
    'plastics': {
        chapters: ['39'],
        keywords: ['plastic', 'polymer', 'polypropylene', 'polyethylene', 'PVC', 'resin', 'polystyrene']
    }
};
/**
 * Detect product category and return relevant chapters
 *
 * @param query - Product description
 * @returns List of relevant chapters with confidence scores
 */
function detectChaptersFromQuery(query) {
    var lowerQuery = query.toLowerCase();
    var detectedCategories = new Map();
    // Score each category based on keyword matches
    for (var _i = 0, _a = Object.entries(exports.CHAPTER_KEYWORDS); _i < _a.length; _i++) {
        var _b = _a[_i], category = _b[0], categoryData = _b[1];
        var keywords = categoryData.keywords;
        var score = 0;
        for (var _c = 0, keywords_1 = keywords; _c < keywords_1.length; _c++) {
            var keyword = keywords_1[_c];
            if (lowerQuery.includes(keyword)) {
                score += 10; // 10 points per keyword match
            }
        }
        if (score > 0) {
            detectedCategories.set(category, score);
        }
    }
    // Sort by confidence score and convert to chapters
    var sortedCategories = Array.from(detectedCategories.entries())
        .sort(function (a, b) { return b[1] - a[1]; });
    var chapterInfo = [];
    var addedChapters = new Set();
    for (var _d = 0, sortedCategories_1 = sortedCategories; _d < sortedCategories_1.length; _d++) {
        var _e = sortedCategories_1[_d], category = _e[0], score = _e[1];
        var categoryData = exports.CHAPTER_KEYWORDS[category];
        if (!categoryData)
            continue;
        // Use narrowChapters if available (for specific materials like cotton)
        // Otherwise use full chapters list
        var chaptersToUse = categoryData.narrowChapters || categoryData.chapters;
        var confidence = Math.min(100, score);
        for (var _f = 0, chaptersToUse_1 = chaptersToUse; _f < chaptersToUse_1.length; _f++) {
            var chapter = chaptersToUse_1[_f];
            if (!addedChapters.has(chapter)) {
                chapterInfo.push({
                    chapter: chapter,
                    description: category,
                    confidence: confidence
                });
                addedChapters.add(chapter);
            }
        }
    }
    return chapterInfo;
}
/**
 * Get all codes from a list of chapters
 *
 * @param chapters - List of chapter numbers (e.g., ['52', '08', '84'])
 * @returns Filtered codes organized by chapter
 */
function getCodesByChapters(chapters) {
    return __awaiter(this, void 0, void 0, function () {
        var filteredCodes, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!chapters || chapters.length === 0) {
                        logger_1.logger.warn('No chapters provided for filtering');
                        return [2 /*return*/, {
                                codes: [],
                                chapters: [],
                                filterReason: 'No chapters specified'
                            }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    logger_1.logger.info("Filtering codes by chapters: ".concat(chapters.join(', ')));
                    return [4 /*yield*/, prisma_1.prisma.hsCode.findMany({
                            where: {
                                chapter: {
                                    in: chapters
                                }
                            },
                            select: {
                                code: true,
                                description: true,
                                chapter: true
                            }
                        })];
                case 2:
                    filteredCodes = _a.sent();
                    logger_1.logger.info("Found ".concat(filteredCodes.length, " codes in chapters ").concat(chapters.join(', ')));
                    return [2 /*return*/, {
                            codes: filteredCodes,
                            chapters: chapters,
                            filterReason: "Filtered to chapters: ".concat(chapters.join(', '))
                        }];
                case 3:
                    error_1 = _a.sent();
                    logger_1.logger.error('Error filtering codes by chapters');
                    logger_1.logger.error(error_1 instanceof Error ? error_1.message : String(error_1));
                    return [2 /*return*/, {
                            codes: [],
                            chapters: chapters,
                            filterReason: 'Error filtering codes'
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Smart chapter filtering with fallback
 *
 * If query is too generic and matches many chapters, narrows to top 1-3 most relevant
 * This prevents search space from becoming too large
 *
 * @param query - Product description
 * @param maxChapters - Maximum number of chapters to include (default: 3)
 * @returns Filtered codes from most relevant chapters
 */
function smartChapterFilter(query_1) {
    return __awaiter(this, arguments, void 0, function (query, maxChapters) {
        var detectedChapters, allCodes, chaptersToUse;
        if (maxChapters === void 0) { maxChapters = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.info("Smart chapter filtering for query: \"".concat(query.substring(0, 100), "...\""));
                    detectedChapters = detectChaptersFromQuery(query);
                    if (!(detectedChapters.length === 0)) return [3 /*break*/, 2];
                    logger_1.logger.warn('No chapters detected from query - will search all codes');
                    return [4 /*yield*/, prisma_1.prisma.hsCode.findMany({
                            select: {
                                code: true,
                                description: true,
                                chapter: true
                            },
                            take: 100 // Limit to prevent overwhelming results
                        })];
                case 1:
                    allCodes = _a.sent();
                    return [2 /*return*/, {
                            codes: allCodes,
                            chapters: [],
                            filterReason: 'Generic query - searched sample of all codes'
                        }];
                case 2:
                    chaptersToUse = detectedChapters
                        .slice(0, maxChapters)
                        .map(function (c) { return c.chapter; });
                    logger_1.logger.info("Detected ".concat(detectedChapters.length, " potential chapters, using top ").concat(chaptersToUse.length, ": ").concat(chaptersToUse.join(', ')));
                    // Get codes from selected chapters
                    return [2 /*return*/, getCodesByChapters(chaptersToUse)];
            }
        });
    });
}
/**
 * Filter a list of codes by chapter
 *
 * Used when you already have a list of codes and want to filter by chapter
 *
 * @param codes - List of HS codes
 * @param chapters - Chapters to keep
 * @returns Filtered codes
 */
function filterCodesByChapters(codes, chapters) {
    if (!chapters || chapters.length === 0) {
        return codes;
    }
    return codes.filter(function (code) {
        var chapter = code.code.substring(0, 2);
        return chapters.includes(chapter);
    });
}
/**
 * Get chapter statistics (for debugging)
 * Shows how many codes are in each chapter
 */
function getChapterStats() {
    return __awaiter(this, void 0, void 0, function () {
        var stats, chapters, _i, chapters_1, ch, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    stats = {};
                    return [4 /*yield*/, prisma_1.prisma.hsCode.groupBy({
                            by: ['chapter'],
                            _count: true
                        })];
                case 1:
                    chapters = _a.sent();
                    for (_i = 0, chapters_1 = chapters; _i < chapters_1.length; _i++) {
                        ch = chapters_1[_i];
                        if (ch.chapter) {
                            stats[ch.chapter] = ch._count;
                        }
                    }
                    return [2 /*return*/, stats];
                case 2:
                    error_2 = _a.sent();
                    logger_1.logger.error('Error getting chapter stats');
                    return [2 /*return*/, {}];
                case 3: return [2 /*return*/];
            }
        });
    });
}
