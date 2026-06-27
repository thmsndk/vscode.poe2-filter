export function levenshteinDistance(a: string, b: string): number {
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

  return matrix[b.length][a.length];
}

export function findSimilarValues(
  input: string,
  validValues: string[],
  maxSuggestions = 3
): string[] {
  const lowerInput = input.toLowerCase();

  // Edit-distance budget relative to the input length (~40%, min 1, capped at
  // 3). A fixed budget of 3 let short words match unrelated candidates - e.g.
  // "Gold" is distance 3 from both "Bows" and "Foci" despite sharing one
  // letter. Scaling by length keeps suggestions actually similar.
  const maxDistance = Math.max(1, Math.min(3, Math.floor(input.length * 0.4)));

  // Substring/prefix matches (either direction) are almost always what the
  // author meant (e.g. "Waystone" -> "Waystones"), so prefer them. Guard with a
  // minimum length so a 1-2 char input doesn't match everything.
  const isSubstringMatch = (lowerValid: string) =>
    lowerInput.length >= 3 &&
    (lowerValid.includes(lowerInput) || lowerInput.includes(lowerValid));

  return [...new Set(validValues)]
    // Guard against empty/whitespace candidate names (e.g. a blank game-data
    // Name). An empty string is a substring of every input and would always be
    // suggested first, producing a misleading "Did you mean: ?" message.
    .filter((valid) => Boolean(valid) && valid.trim().length > 0)
    .map((valid) => {
      const lowerValid = valid.toLowerCase();
      return {
        value: valid,
        distance: levenshteinDistance(lowerInput, lowerValid),
        substring: isSubstringMatch(lowerValid),
      };
    })
    .filter((result) => result.substring || result.distance <= maxDistance)
    .sort((a, b) => {
      // Substring matches first, then closest edit distance, then shorter and
      // alphabetical so the output is stable instead of data-order dependent.
      if (a.substring !== b.substring) {
        return a.substring ? -1 : 1;
      }
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      if (a.value.length !== b.value.length) {
        return a.value.length - b.value.length;
      }
      return a.value.localeCompare(b.value);
    })
    .slice(0, maxSuggestions)
    .map((result) => result.value);
}

export function calculateNameSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength; // Returns value between 0 and 1
}
