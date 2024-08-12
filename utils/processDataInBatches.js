const processDataInBatches = async (items, batchSize, promiseHandler, progressFn = null, abortController = null, processId = null) => {
  const responses = [];
  const itemsLength = items.length;

  for (let i = 0; i < itemsLength; i += batchSize) {
    const end = Math.min(i + batchSize, itemsLength);
    const batch = items.slice(i, end);

    try {
      const batchResponses = await Promise.allSettled(batch.map((item) => promiseHandler(item, abortController)));
      responses.push(...batchResponses);

      if (progressFn && typeof progressFn === "function") {
        progressFn({
          responses,
          batchResponses,
          processId,
          currentIndex: i,
          totalIndices: itemsLength,
        });
      }
    } catch (err) {
      throw err;
    }

    if (abortController?.signal.aborted) break;
  }

  return responses;
};

module.exports = processDataInBatches;
