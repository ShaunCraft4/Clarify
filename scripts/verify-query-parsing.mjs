/**
 * Quick check for natural-language query parsing.
 * Run: npx tsx scripts/verify-query-parsing.mjs
 */
import { extractTopic, resolveStudyQuery } from "../src/lib/search-query.ts";

const cases = [
  ["Can you explain to me how B-Trees work?", "B-Trees"],
  ["Can you explaint o me B-Trees?", "B-Trees"],
  ["Explain red-black trees", "red-black trees"],
  ["What is a splay tree?", "splay tree"],
  ["I'd like to know about hash tables", "hash tables"],
  ["Help me understand dynamic programming", "dynamic programming"],
  ["Could you walk me through Dijkstra's algorithm?", "Dijkstra's algorithm"],
  ["Why do we use B-trees?", "B-trees"],
  ["How does a binary search tree work?", "binary search tree"],
  ["I don't understand AVL trees", "AVL trees"],
  ["I was wondering if you could explain merge sort", "merge sort"],
  ["Search for red-black trees", "red-black trees"],
  ["Notes on splay trees please", "splay trees"],
  ["What are the properties of B-trees?", "B-trees"],
  ["Tell me about quicksort from my materials", "quicksort"],
  ["Compare splay trees and AVL trees", "splay trees and AVL trees"],
  ["Give me an overview of graph traversal", "graph traversal"],
  ["What is the time complexity of merge sort?", "merge sort"],
  ["Find info on heap sort", "heap sort"],
  ["Can I get an explanation of red-black trees?", "red-black trees"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = extractTopic(input);
  const ok =
    got.toLowerCase() === expected.toLowerCase() ||
    got.toLowerCase().includes(expected.toLowerCase());
  if (!ok) {
    failed++;
    console.error(`FAIL: "${input}"\n  expected: ${expected}\n  got:      ${got}`);
  }
}

const broad = resolveStudyQuery("Summarize all my materials");
if (!broad.isBroad) {
  failed++;
  console.error('FAIL: "Summarize all my materials" should be broad');
}

const specific = resolveStudyQuery("Explain everything about merge sort");
if (specific.isBroad) {
  failed++;
  console.error('FAIL: "Explain everything about merge sort" should not be broad');
}

if (failed === 0) {
  console.log(`All ${cases.length + 2} query parsing checks passed.`);
} else {
  process.exit(1);
}
