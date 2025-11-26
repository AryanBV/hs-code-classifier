"use strict";
/**
 * Focused Accuracy Test Suite - Quick validation across major categories
 * Uses direct layeredSearch without confidence-scorer overhead
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
var layered_search_service_1 = require("./src/services/layered-search.service");
var logger_1 = require("./src/utils/logger");
var testCases = [
    // Animal Products
    { category: 'Animal Products', name: 'Live Cattle', query: 'Live beef cattle breeding', expectedCodes: ['01'] },
    { category: 'Animal Products', name: 'Fresh Pork', query: 'Fresh pork meat cuts', expectedCodes: ['01', '02'] },
    { category: 'Animal Products', name: 'Chicken', query: 'Fresh chicken meat', expectedCodes: ['02'] },
    // Fruits & Produce
    { category: 'Fruits', name: 'Fresh Apples', query: 'Fresh red apples export', expectedCodes: ['08'] },
    { category: 'Fruits', name: 'Fresh Mangoes', query: 'Mangoes fresh tropical fruit', expectedCodes: ['08'] },
    { category: 'Fruits', name: 'Fresh Oranges', query: 'Fresh citrus oranges', expectedCodes: ['08'] },
    // Cereals
    { category: 'Cereals', name: 'Wheat', query: 'Wheat grains milling', expectedCodes: ['10'] },
    { category: 'Cereals', name: 'Rice', query: 'Milled rice consumption', expectedCodes: ['10'] },
    // Textiles
    { category: 'Textiles', name: 'Cotton Fabric', query: 'Cotton fabric woven cloth', expectedCodes: ['52'] },
    { category: 'Textiles', name: 'Wool', query: 'Wool textile fabric', expectedCodes: ['51', '52'] },
    // Machinery
    { category: 'Machinery', name: 'Diesel Engine', query: 'Diesel engine motor automotive', expectedCodes: ['84'] },
    { category: 'Machinery', name: 'Pump', query: 'Centrifugal pump mechanical', expectedCodes: ['84'] },
    // Electronics
    { category: 'Electronics', name: 'Mobile Phone', query: 'Mobile phone smartphone electronic', expectedCodes: ['85'] },
    { category: 'Electronics', name: 'Laptop Computer', query: 'Laptop computer electronic device', expectedCodes: ['84', '85'] },
    // Chemicals
    { category: 'Chemicals', name: 'Organic Chemical', query: 'Organic chemical compound', expectedCodes: ['29'] },
    { category: 'Chemicals', name: 'Plastic Resin', query: 'Plastic polymer resin material', expectedCodes: ['39'] },
];
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var passedTests, totalTests, categoryResults, _loop_1, _i, testCases_1, testCase, sortedCategories, _a, sortedCategories_1, category, result, passed, total, percentage, status_1, overallPercentage;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('\n╔════════════════════════════════════════════════════════════════╗');
                    console.log('║        FOCUSED ACCURACY TEST - QUICK MULTI-CATEGORY SUITE        ║');
                    console.log('╚════════════════════════════════════════════════════════════════╝\n');
                    passedTests = 0;
                    totalTests = testCases.length;
                    categoryResults = {};
                    _loop_1 = function (testCase) {
                        var category, name_1, query, expectedCodes, results, topResult_1, resultChapter_1, isMatch, error_1;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    category = testCase.category, name_1 = testCase.name, query = testCase.query, expectedCodes = testCase.expectedCodes;
                                    if (!categoryResults[category]) {
                                        categoryResults[category] = { passed: 0, total: 0 };
                                    }
                                    categoryResults[category].total++;
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    console.log("\n[".concat(category, "] ").concat(name_1));
                                    console.log("Query: \"".concat(query, "\""));
                                    return [4 /*yield*/, (0, layered_search_service_1.layeredSearch)(query, 3)];
                                case 2:
                                    results = _c.sent();
                                    topResult_1 = results.results[0];
                                    if (!topResult_1) {
                                        console.log("\u274C FAILED - No results returned");
                                        return [2 /*return*/, "continue"];
                                    }
                                    resultChapter_1 = topResult_1.hsCode.substring(0, 2);
                                    isMatch = expectedCodes.some(function (code) { return resultChapter_1 === code || topResult_1.hsCode.startsWith(code); });
                                    if (isMatch) {
                                        console.log("\u2705 PASSED");
                                        console.log("   Top: ".concat(topResult_1.hsCode, " (").concat(topResult_1.confidence, "% confidence)"));
                                        passedTests++;
                                        categoryResults[category].passed++;
                                    }
                                    else {
                                        console.log("\u274C FAILED");
                                        console.log("   Got: ".concat(topResult_1.hsCode, " (Chapter ").concat(resultChapter_1, ")"));
                                        console.log("   Expected: Chapter ".concat(expectedCodes.join(' or ')));
                                        console.log("   Confidence: ".concat(topResult_1.confidence, "%"));
                                    }
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_1 = _c.sent();
                                    console.log("\u274C ERROR - ".concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, testCases_1 = testCases;
                    _b.label = 1;
                case 1:
                    if (!(_i < testCases_1.length)) return [3 /*break*/, 4];
                    testCase = testCases_1[_i];
                    return [5 /*yield**/, _loop_1(testCase)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    // Print summary
                    console.log('\n╔════════════════════════════════════════════════════════════════╗');
                    console.log('║                       RESULTS SUMMARY                           ║');
                    console.log('╠════════════════════════════════════════════════════════════════╣');
                    sortedCategories = Object.keys(categoryResults).sort();
                    for (_a = 0, sortedCategories_1 = sortedCategories; _a < sortedCategories_1.length; _a++) {
                        category = sortedCategories_1[_a];
                        result = categoryResults[category];
                        if (!result)
                            continue;
                        passed = result.passed, total = result.total;
                        percentage = ((passed / total) * 100).toFixed(0);
                        status_1 = passed === total ? '✅' : passed === 0 ? '❌' : '⚠️ ';
                        console.log("".concat(status_1, " ").concat(category.padEnd(20), " ").concat(passed, "/").concat(total, " (").concat(percentage, "%)"));
                    }
                    console.log('╠════════════════════════════════════════════════════════════════╣');
                    overallPercentage = ((passedTests / totalTests) * 100).toFixed(1);
                    console.log("\u2551 OVERALL: ".concat(passedTests, "/").concat(totalTests, " TESTS PASSED (").concat(overallPercentage, "%)").concat(' '.repeat(20), "\u2551"));
                    console.log('╚════════════════════════════════════════════════════════════════╝\n');
                    return [2 /*return*/];
            }
        });
    });
}
// Run tests
runTests().catch(function (error) {
    logger_1.logger.error('Test suite error:', error);
    process.exit();
});
