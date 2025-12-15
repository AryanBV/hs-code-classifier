/**
 * Hierarchy Expansion Service
 *
 * Expands search candidates to include all children of parent codes.
 *
 * Problem: If search finds heading "8408", we need to include
 * all specific tariff codes like "8408.20.10", "8408.20.20", etc.
 *
 * Solution: Use the hs_code_hierarchy table to fetch all child codes
 * and add them to the candidate list with slightly lower scores.
 */

import { prisma } from '../utils/prisma';


export interface Candidate {
  code: string;
  score: number;
  matchType: string;
  description?: string;  // Optional to match multi-candidate-search interface
  source: string;
}

export interface HierarchyNode {
  code: string;
  parentCode: string | null;
  level: number;
  childrenCodes: string[];
  allChildren: string[];
}

/**
 * Expand candidates to include all children of parent codes
 *
 * @param candidates - Initial candidate codes from semantic search
 * @returns Expanded list including all children with adjusted scores
 */
export async function expandCandidatesWithChildren(
  candidates: Candidate[]
): Promise<Candidate[]> {
  const expandedCodes = new Map<string, { score: number; source: string; matchType: string }>();

  // Step 1: Add all original candidates
  for (const candidate of candidates) {
    expandedCodes.set(candidate.code, {
      score: candidate.score,
      source: candidate.source,
      matchType: candidate.matchType
    });
  }

  // Step 2: For each candidate, check if it has children
  for (const candidate of candidates) {
    // Fetch hierarchy info using raw SQL (since Prisma client might not have the model yet)
    const hierarchy: any[] = await prisma.$queryRaw`
      SELECT code, parent_code as "parentCode", level, children_codes as "childrenCodes", all_children as "allChildren"
      FROM hs_code_hierarchy
      WHERE code = ${candidate.code}
    `;

    if (hierarchy.length > 0) {
      const node = hierarchy[0];

      // If this is a heading (level 4) or subheading (level 6), expand with children
      // Don't expand tariff codes (level 8+) as they're already specific
      if (node.level <= 6 && node.childrenCodes && node.childrenCodes.length > 0) {
        // Add all direct children with lower scores
        for (const childCode of node.childrenCodes) {
          if (!expandedCodes.has(childCode)) {
            expandedCodes.set(childCode, {
              score: candidate.score * 0.85, // 15% penalty for being a child
              source: 'hierarchy-child',
              matchType: 'hierarchy-expanded'
            });
          }
        }

        // For high-confidence matches (score >= 8), also add ALL descendants
        if (candidate.score >= 8 && node.allChildren && node.allChildren.length > 0) {
          for (const descendantCode of node.allChildren) {
            if (!expandedCodes.has(descendantCode)) {
              expandedCodes.set(descendantCode, {
                score: candidate.score * 0.75, // 25% penalty for descendants
                source: 'hierarchy-descendant',
                matchType: 'hierarchy-expanded-all'
              });
            }
          }
        }
      }
    }
  }

  // Step 3: Fetch full details for all expanded codes
  const allCodes = Array.from(expandedCodes.keys());
  const codeDetails = await prisma.hsCode.findMany({
    where: { code: { in: allCodes } },
    select: {
      code: true,
      description: true
    }
  });

  // Step 4: Build final candidate list
  const expandedCandidates: Candidate[] = codeDetails.map(detail => {
    const metadata = expandedCodes.get(detail.code)!;
    return {
      code: detail.code,
      score: metadata.score,
      matchType: metadata.matchType,
      description: detail.description,
      source: metadata.source
    };
  });

  // Step 5: Sort by score descending
  expandedCandidates.sort((a, b) => b.score - a.score);

  return expandedCandidates;
}

/**
 * Get hierarchy statistics for a code
 *
 * @param code - HS code to analyze
 * @returns Hierarchy stats (level, children count, etc.)
 */
export async function getHierarchyStats(code: string): Promise<HierarchyNode | null> {
  const hierarchy: any[] = await prisma.$queryRaw`
    SELECT
      code,
      parent_code as "parentCode",
      level,
      children_codes as "childrenCodes",
      all_children as "allChildren"
    FROM hs_code_hierarchy
    WHERE code = ${code}
  `;

  if (hierarchy.length === 0) return null;

  return hierarchy[0];
}

/**
 * Get all ancestor codes for a given code
 *
 * @param code - HS code to trace ancestors for
 * @returns Array of ancestor codes from immediate parent to chapter
 */
export async function getAncestors(code: string): Promise<string[]> {
  const ancestors: string[] = [];
  let currentCode = code;

  while (true) {
    const hierarchy: any[] = await prisma.$queryRaw`
      SELECT parent_code as "parentCode"
      FROM hs_code_hierarchy
      WHERE code = ${currentCode}
    `;

    if (hierarchy.length === 0 || !hierarchy[0].parentCode) {
      break;
    }

    ancestors.push(hierarchy[0].parentCode);
    currentCode = hierarchy[0].parentCode;
  }

  return ancestors;
}
