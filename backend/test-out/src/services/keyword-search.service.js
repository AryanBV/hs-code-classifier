"use strict";
/**
 * Layer 1: Keyword Search Service
 *
 * Extracts keywords from product descriptions and matches them against:
 * - keywords field (pre-configured HS code keywords)
 * - commonProducts field (typical products for each code)
 * - synonyms field (alternative names)
 *
 * Returns codes with highest keyword match scores for accurate initial filtering
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.keywordSearch = keywordSearch;
exports.detectRelevantChapters = detectRelevantChapters;
exports.getChaptersForCodes = getChaptersForCodes;
var logger_1 = require("../utils/logger");
var prisma_1 = require("../utils/prisma");
/**
 * Tokenize text into lowercase words, removing punctuation
 */
function tokenizeQuery(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
        .split(/\s+/)
        .filter(function (word) { return word.length > 2; }); // Only keep words with 3+ characters
}
/**
 * Calculate keyword match score
 *
 * Algorithm:
 * 1. Extract keywords from user query
 * 2. For each code, check if keywords appear in: keywords, commonProducts, synonyms fields
 * 3. Score based on: match count, field importance, position weighting
 */
function calculateKeywordScore(userKeywords, codeKeywords, commonProducts, synonyms, description) {
    var matched = [];
    var score = 0;
    // Combine all HS code metadata
    var allCodeText = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], codeKeywords, true), commonProducts, true), synonyms, true), [
        description
    ], false).join(' ')
        .toLowerCase();
    var _loop_1 = function (userKeyword) {
        var lowerKeyword = userKeyword.toLowerCase();
        // Exact word match in keywords (highest weight) - must be whole word
        if (codeKeywords.some(function (k) {
            var lowerK = k.toLowerCase();
            return lowerK.includes(lowerKeyword) ||
                lowerK.split(/[\s\-_,]+/).some(function (w) { return w.includes(lowerKeyword); });
        })) {
            score += 25; // Increased from 20
            matched.push(userKeyword);
        }
        // Exact match in common_products
        else if (commonProducts.some(function (p) {
            var lowerP = p.toLowerCase();
            return lowerP.includes(lowerKeyword) ||
                lowerP.split(/[\s\-_,]+/).some(function (w) { return w.includes(lowerKeyword); });
        })) {
            score += 20; // Increased from 15
            matched.push(userKeyword);
        }
        // Exact match in synonyms
        else if (synonyms.some(function (s) {
            var lowerS = s.toLowerCase();
            return lowerS.includes(lowerKeyword) ||
                lowerS.split(/[\s\-_,]+/).some(function (w) { return w.includes(lowerKeyword); });
        })) {
            score += 15; // Increased from 10
            matched.push(userKeyword);
        }
        // Partial match in description
        else if (description.toLowerCase().includes(lowerKeyword)) {
            score += 8; // Increased from 5
            matched.push(userKeyword);
        }
    };
    // Check each user keyword
    for (var _i = 0, userKeywords_1 = userKeywords; _i < userKeywords_1.length; _i++) {
        var userKeyword = userKeywords_1[_i];
        _loop_1(userKeyword);
    }
    // Normalize score: divide by total possible matches
    var maxScore = userKeywords.length * 25; // Max 25 points per keyword (updated)
    var normalizedScore = (score / maxScore) * 100;
    // Generate reason
    var reason = '';
    if (matched.length === userKeywords.length) {
        reason = "All ".concat(matched.length, " keywords matched");
    }
    else if (matched.length > 0) {
        reason = "".concat(matched.length, "/").concat(userKeywords.length, " keywords matched: ").concat(matched.join(', '));
    }
    else {
        reason = 'No keywords matched';
    }
    return {
        score: Math.min(100, normalizedScore),
        matched: matched,
        reason: reason
    };
}
/**
 * Keyword search - Layer 1 of 4-layer pipeline
 *
 * @param query - Product description from user
 * @param topN - Number of top results to return
 * @returns Codes sorted by keyword match score
 */
function keywordSearch(query_1) {
    return __awaiter(this, arguments, void 0, function (query, topN) {
        var userKeywords_2, allCodes, scoredCodes, error_1;
        if (topN === void 0) { topN = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_1.logger.info("Starting keyword search for: \"".concat(query.substring(0, 100), "...\""));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    userKeywords_2 = tokenizeQuery(query);
                    logger_1.logger.debug("Extracted keywords: ".concat(userKeywords_2.join(', ')));
                    if (userKeywords_2.length === 0) {
                        logger_1.logger.warn('No keywords extracted from query');
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, prisma_1.prisma.hsCode.findMany({
                            select: {
                                code: true,
                                description: true,
                                descriptionClean: true,
                                keywords: true,
                                commonProducts: true,
                                synonyms: true
                            }
                        })];
                case 2:
                    allCodes = _a.sent();
                    logger_1.logger.info("Searching through ".concat(allCodes.length, " codes"));
                    scoredCodes = allCodes
                        .map(function (code) {
                        // Handle array or null for keywords
                        var keywordArray = Array.isArray(code.keywords) ? code.keywords : [];
                        var productsArray = Array.isArray(code.commonProducts) ? code.commonProducts : [];
                        var synonymsArray = Array.isArray(code.synonyms) ? code.synonyms : [];
                        var _a = calculateKeywordScore(userKeywords_2, keywordArray, productsArray, synonymsArray, code.description || ''), score = _a.score, matched = _a.matched, reason = _a.reason;
                        return {
                            code: code.code,
                            description: code.descriptionClean || code.description || '',
                            keywordScore: score,
                            matchedKeywords: matched,
                            reason: reason
                        };
                    })
                        // Only keep codes with at least one keyword match
                        .filter(function (result) { return result.keywordScore > 0; })
                        // Sort by score descending
                        .sort(function (a, b) { return b.keywordScore - a.keywordScore; })
                        // Take top N
                        .slice(0, topN);
                    logger_1.logger.info("Keyword search found ".concat(scoredCodes.length, " matching codes (threshold: >0% match)"));
                    if (scoredCodes.length > 0 && scoredCodes[0]) {
                        logger_1.logger.debug("Top result: ".concat(scoredCodes[0].code, " (").concat(scoredCodes[0].keywordScore.toFixed(1), "% score)"));
                    }
                    return [2 /*return*/, scoredCodes];
                case 3:
                    error_1 = _a.sent();
                    logger_1.logger.error('Error in keyword search');
                    logger_1.logger.error(error_1 instanceof Error ? error_1.message : String(error_1));
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Extract product category from query using simple keyword detection
 *
 * Maps user input to HS chapters:
 * - Fruit/produce → Chapter 08
 * - Textiles/fabric → Chapter 52-54
 * - Machinery/engines → Chapter 84
 * - Electronics → Chapter 85
 * etc.
 *
 * @param query - Product description
 * @returns Chapter numbers that are likely relevant
 */
function detectRelevantChapters(query) {
    var lowerQuery = query.toLowerCase();
    var relevantChapters = new Set();
    // Chapter 08: Edible fruit and nuts
    if (/\b(fruit|mango|apple|banana|orange|grape|kiwi|blueberry|strawberry|nut|almond|walnut|cashew|pistachio|edible)\b/i.test(lowerQuery)) {
        relevantChapters.add('08');
    }
    // Chapter 52-54: Textiles
    if (/\b(fabric|cloth|textile|cotton|wool|silk|linen|weave|woven|yarn|thread|garment|apparel|clothing)\b/i.test(lowerQuery)) {
        relevantChapters.add('52');
        relevantChapters.add('53');
        relevantChapters.add('54');
        relevantChapters.add('55');
    }
    // Chapter 84: Machinery and engines
    if (/\b(engine|motor|machine|pump|compressor|turbine|diesel|fuel|mechanical|automotive|vehicle|parts|component)\b/i.test(lowerQuery)) {
        relevantChapters.add('84');
    }
    // Chapter 85: Electronics
    if (/\b(electronic|phone|smartphone|mobile|computer|circuit|electrical|battery|cable|wire|equipment|device)\b/i.test(lowerQuery)) {
        relevantChapters.add('85');
    }
    // Chapter 29: Organic chemicals
    if (/\b(chemical|organic|compound|liquid|acid|base|salt|polymer|plastic|resin)\b/i.test(lowerQuery)) {
        relevantChapters.add('29');
    }
    // Chapter 38: Miscellaneous chemicals
    if (/\b(coolant|lubricant|solvent|cleaner|additive|catalyst)\b/i.test(lowerQuery)) {
        relevantChapters.add('38');
    }
    return Array.from(relevantChapters);
}
/**
 * Get all chapters for a list of codes
 * Used to filter keyword results by relevant chapters only
 */
function getChaptersForCodes(codes) {
    return __awaiter(this, void 0, void 0, function () {
        var chapterSet, _i, codes_1, code, chapter;
        return __generator(this, function (_a) {
            chapterSet = new Set();
            for (_i = 0, codes_1 = codes; _i < codes_1.length; _i++) {
                code = codes_1[_i];
                chapter = code.substring(0, 2);
                if (chapter && !isNaN(parseInt(chapter, 10))) {
                    chapterSet.add(chapter);
                }
            }
            return [2 /*return*/, Array.from(chapterSet)];
        });
    });
}
