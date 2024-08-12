const { parentPort, workerData } = require("worker_threads");

const computeSimilarities = ({ concurTCs, reqTestCaseLevel, existingTestCasesByWords, existingTestCasesLookup, similarityThreshold, signalUsedNames }) => {
  try {
    const groups = new Map();

    const POTENTIAL_MAX = 7;

    const concursLength = concurTCs.length;
    const existingTestCaseEntries = Array.from(existingTestCasesByWords.entries());
    const existingLength = existingTestCaseEntries.length;

    for (let i = 0; i < concursLength; i++) {
      const visited = new Map();
      const { index, title: requiredTitle, description: requiredDescription } = concurTCs[i];

      const currentDescriptionWords = new Set(requiredDescription?.split(" ") || "");
      const currentDescriptionNumbers = (requiredDescription.match(/\d+/g) || []).map(Number);

      for (let j = 0; j < existingLength; j++) {
        const [id, value] = existingTestCaseEntries[j];

        if (visited.has(id)) continue;

        if (!existingTestCasesLookup.has(id)) continue;
        if (existingTestCasesLookup.get(id).testLevel["@_externalURI"] !== reqTestCaseLevel) continue;

        const { title: existingTitle, description: existingDescriptionWords } = value;

        // Calculate Jaccard simiflarity using intersection and union of word sets
        const intersectionSize = new Set([...currentDescriptionWords].filter((word) => existingDescriptionWords.has(word))).size;
        const unionSize = currentDescriptionWords.size + existingDescriptionWords.size - intersectionSize;
        let similarity = intersectionSize / unionSize;
        let numberSimilarity = 0;
        let signalUsedNameSimilarity = 0;

        const numberMatches = currentDescriptionNumbers.filter((num) => existingDescriptionWords.has(num.toString()));
        const signalNameMatches = signalUsedNames.filter((signalName) => existingDescriptionWords.has(signalName));

        if (currentDescriptionNumbers.length > 0 && numberMatches.length === 0 && signalUsedNames.length > 0 && signalNameMatches.length === 0) continue;

        if (numberMatches.length > 0) {
          similarity = 1;
          numberSimilarity = numberMatches.length;
        }

        if (signalNameMatches.length > 0) {
          similarity = 1;
          signalUsedNameSimilarity = signalNameMatches.length;
        }

        if (similarity < similarityThreshold) continue;

        const group = groups.get(index) || [];
        visited.set(id, true);

        group.push({
          id,
          similarity,
          numberSimilarity,
          signalUsedNameSimilarity,
        });

        group.sort((a, b) => {
          if (b.similarity == a.similarity) {
            if (b.signalUsedNameSimilarity == a.signalUsedNameSimilarity) {
              return b.numberSimilarity - a.numberSimilarity;
            }

            return b.signalUsedNameSimilarity - a.signalUsedNamesimilarity;
          }

          return b.similarity - a.similarity;
        });

        if (group.length > POTENTIAL_MAX) {
          const removed = group.pop();
          visited.delete(removed.id);
        }
        groups.set(index, group);
      }
    }

    return groups;
  } catch (err) {
    console.log(err);
  }
};

parentPort.on("message", (msg) => {
  if (msg === "start") {
    const groups = computeSimilarities(workerData);
    parentPort.postMessage(Array.from(groups.entries()));
    return;
  }

  throw new Error(`Unknown message: ${msg}`);
});
