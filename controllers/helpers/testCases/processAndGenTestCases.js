const fs = require("fs");
const processDataInBatches = require("../../../utils/processDataInBatches");
const { genTestCases } = require("./genTestCases");
const { getMissingInfoInReq, cosineSimilarity } = require("./getMissingInfo");
const { generateEmbeddings } = require("../openAIHelpers");

const REQ_PER_TIME = 30;

const dataLogger = {
  data: {},
  addMissingInfo: (id, info, message) => {
    this.data[id] = {
      missingKeywords: info,
      messages: [message],
    };
  },
  addAdditionalReqs: (id, additionalReqIds) => {
    this.data[id] = {
      ...this.data[id],
      additionalReqIds,
    };
  },
  addTestCasesAndAdditionalText: (id, messageGenTestCases, testCasesToGenerate, additionalReqsText) => {
    this.data[id] = {
      ...this.data[id],
      messages: [...this.data[id].messages, messageGenTestCases],
      genTestCases: testCasesToGenerate,
      additionalReqsText,
    };
  },

  reset: () => (this.data = {}),
};

exports.processAndGenTestCases = async (requirementsData, signalLookupTable, signalLookupKeys, artifactLookupById, signalLookupKeysEmbedded) => {
  if (requirementsData == null || signalLookupTable == null || signalLookupKeys == null || artifactLookupById == null) throw new Error("No requirments or lookup available");

  // dataLogger.reset()

  const promiseHandler = async (reqData) => {
    if (reqData?.primaryText == null) return Promise.resolve();

    const [missingKeywords, messageMissingInfo] = await getMissingInfoInReq(reqData.primaryText);
    const missingKeywordsEmbedded = await generateEmbeddings(missingKeywords);

    // dataLogger.addMissingInfo(reqData.id, missingKeywords, messageMissingInfo)

    if (missingKeywords?.length === 0 || missingKeywordsEmbedded.length === 0) return Promise.resolve();

    const matchLookupKeys = missingKeywordsEmbedded.map((missingVector) => {
      const mostSimilaryKey = signalLookupKeysEmbedded.reduce(
        (mostSimilar, lookupKeyVector, index) => {
          const similarity = cosineSimilarity(missingVector, lookupKeyVector);
          if (similarity <= mostSimilar.similarity) return mostSimilar;

          return {
            key: lookupKeyVector,
            index: index,
            similarity,
          };
        },
        {
          key: null,
          index: -1,
          similarity: Number.NEGATIVE_INFINITY,
        }
      );

      return signalLookupKeys[mostSimilaryKey.index];
    });

    const additionalReqIds = matchLookupKeys.flatMap((key) => {
      return signalLookupTable[key].map((req) => req.reqId).slice(0, 20);
    });

    // dataLogger.addAdditionalReqs(reqData.id, additionalReqIds);

    const [testCasesToGenerate, additionalReqsText, messageGenTestCases] = await genTestCases(reqData, additionalReqIds, artifactLookupById);

    // dataLogger.addTestCasesAndAdditionalText(reqData.id, messageGenTestCases, testCasesToGenerate, additionalReqsText);

    return {
      requirementData: reqData,
      testCasesToGenerate,
    };
  };

  const responses = await processDataInBatches(requirementsData, REQ_PER_TIME, promiseHandler, null, new AbortController());

  fs.writeFileSync("debug.json", JSON.stringify(loggerData, null, 2));

  return responses;
};
