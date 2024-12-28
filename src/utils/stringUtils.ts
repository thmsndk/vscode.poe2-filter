export function levenshteinDistance(a: string, b: string): number {
  console.log(`Comparing '${a}' with '${b}'`);

  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }

  console.log("Distance matrix:");
  console.log(matrix);

  return matrix[b.length][a.length];
}

export function findSimilarValues(
  input: string,
  validValues: string[],
  maxDistance = 3,
  maxSuggestions = 3
): string[] {
  // First try Levenshtein distance
  const levenshteinMatches = validValues
    .map((valid) => ({
      value: valid,
      distance: levenshteinDistance(input.toLowerCase(), valid.toLowerCase()),
    }))
    .filter((result) => result.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map((result) => result.value);

  // If no matches found, try partial matching
  if (levenshteinMatches.length === 0) {
    const partialMatches = validValues
      .filter((valid) => valid.toLowerCase().includes(input.toLowerCase()))
      .sort((a, b) => a.length - b.length) // Prefer shorter matches
      .slice(0, maxSuggestions);

    return partialMatches;
  }

  return levenshteinMatches;
}

export function calculateNameSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength; // Returns value between 0 and 1
}
