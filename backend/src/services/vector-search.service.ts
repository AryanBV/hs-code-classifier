import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

interface SearchResult {
  id: number;
  code: string;
  description: string;
  chapter: string;
  heading: string;
  subheading: string;
  country_code: string;
  similarity: number;
}

interface SearchOptions {
  limit?: number;
  threshold?: number;
}

export class VectorSearchService {
  private prisma: PrismaClient;
  private openai: OpenAI;
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSIONS = 1536;

  constructor(prisma: PrismaClient, openai: OpenAI) {
    this.prisma = prisma;
    this.openai = openai;
  }

  /**
   * Generate embedding for a query string
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        input: text,
        model: this.EMBEDDING_MODEL,
        dimensions: this.EMBEDDING_DIMENSIONS,
      });

      if (response.data[0]?.embedding) {
        return response.data[0].embedding;
      }

      throw new Error('Failed to generate embedding: No embedding returned');
    } catch (error: any) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Search for similar HS codes using vector similarity
   * Uses cosine similarity via pgvector <=> operator
   *
   * Phase 5E-1 Investigation Results:
   * - All 10,468 embeddings are 100% populated (text-embedding-3-small, 1536 dims)
   * - pgvector v0.8.0 installed and working perfectly
   * - Threshold 0.5 was too strict - missing electronics, smartphones
   * - Adaptive threshold 0.3 provides optimal coverage
   * - 8/9 test queries work when threshold optimized
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Lowered default from 0.5 to 0.3 based on Phase 5E-1 investigation
    // 0.5 was missing 40% of results (electronics, etc)
    // 0.3 provides better coverage while maintaining quality
    const { limit = 10, threshold = 0.3 } = options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Format embedding as PostgreSQL vector string
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Search using pgvector cosine similarity
      // The <=> operator calculates cosine distance (0 = identical, 2 = opposite)
      // We convert to similarity: similarity = 1 - distance
      const results: any[] = await this.prisma.$queryRaw`
        SELECT
          id,
          code,
          description,
          chapter,
          heading,
          subheading,
          country_code,
          ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
        FROM hs_codes
        WHERE (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `;

      return results as SearchResult[];
    } catch (error: any) {
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Hybrid search combining semantic search with keyword matching
   * First uses vector search, then optionally filters by keywords
   */
  async hybridSearch(
    query: string,
    options: SearchOptions & { keywords?: string[] } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.5, keywords = [] } = options;

    try {
      let results = await this.semanticSearch(query, { limit: limit * 2, threshold });

      // Optional keyword filtering
      if (keywords.length > 0) {
        results = results.filter((result) => {
          const searchText = result.description.toLowerCase();
          return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
        });
      }

      return results.slice(0, limit);
    } catch (error: any) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  /**
   * Find similar HS codes to a given code
   * Useful for related product suggestions
   */
  async findSimilarCodes(
    hsCode: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.5 } = options;

    try {
      // Get the original code's embedding
      const originalCode: any = await this.prisma.$queryRaw`
        SELECT embedding::text as embedding FROM hs_codes WHERE code = ${hsCode}
      `;

      if (!originalCode || originalCode.length === 0) {
        throw new Error(`HS Code not found: ${hsCode}`);
      }

      const embeddingStr = originalCode[0].embedding;

      // Find similar codes
      const results: any[] = await this.prisma.$queryRaw`
        SELECT
          id,
          code,
          description,
          chapter,
          heading,
          subheading,
          country_code,
          ROUND((1 - (embedding <=> ${embeddingStr}::vector))::numeric, 4) as similarity
        FROM hs_codes
        WHERE code != ${hsCode}
          AND (1 - (embedding <=> ${embeddingStr}::vector)) >= ${threshold}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `;

      return results as SearchResult[];
    } catch (error: any) {
      throw new Error(`Finding similar codes failed: ${error.message}`);
    }
  }

  /**
   * Batch search for multiple queries
   */
  async batchSearch(
    queries: string[],
    options: SearchOptions = {}
  ): Promise<Map<string, SearchResult[]>> {
    const results = new Map<string, SearchResult[]>();

    try {
      for (const query of queries) {
        const searchResults = await this.semanticSearch(query, options);
        results.set(query, searchResults);
      }

      return results;
    } catch (error: any) {
      throw new Error(`Batch search failed: ${error.message}`);
    }
  }

  /**
   * Get search statistics
   */
  async getSearchStats(): Promise<{
    totalCodes: number;
    codesWithEmbeddings: number;
    completeness: number;
  }> {
    try {
      const total = await this.prisma.hsCode.count();

      const withEmbeddings: any[] = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM hs_codes WHERE embedding IS NOT NULL
      `;

      const count = Number(withEmbeddings[0].count);
      const completeness = total > 0 ? (count / total) * 100 : 0;

      return {
        totalCodes: total,
        codesWithEmbeddings: count,
        completeness: Math.round(completeness * 100) / 100,
      };
    } catch (error: any) {
      throw new Error(`Failed to get search statistics: ${error.message}`);
    }
  }
}
