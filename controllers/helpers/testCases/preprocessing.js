const processDataInBatches = require("../../../utils/processDataInBatches");
const { chatCompletion, generateEmbeddings } = require("../openAIHelpers");

const LIST_OF_KEYWORDS = "**LIST_OF_KEYWORDS**";
const REQ_PER_TIME = 30;

const prompts = `
You are provided with a **Requirement** for a ${"requirement module"}. Examine the details below and extract all signals, parameters, or functions used in the requirement into a **List of Keywords**. Make sure to extract all of them. Put different signals/functions on different lines. Have very short answers per item as they will be embedded and later be used as queries in similarity search. Example:

${LIST_OF_KEYWORDS}
- Definition Signal A
- Example of Signal B
- Constraint of Function C

**Requirement**
##REQUIREMENT##
`;

const vectorizeLookupKeys = async (lookupKeys) => {
  const chunkSize = 100;
  const chunkedKeysArrays = [];
  const lookupKeysEmbedded = [];

  for (let i = 0; i < lookupKeys.length; i += chunkSize) {
    chunkedKeysArrays.push(lookupKeys.slice(i, i + chunkSize));
  }

  const responses = await processDataInBatches(chunkedKeysArrays, REQ_PER_TIME, (keys) => generateEmbeddings(keys), null, new AbortController());

  responses.forEach((res) => {
    if (res.status !== "fulfilled") return;

    lookupKeysEmbedded.push(...res.value);
  });

  return lookupKeysEmbedded;
};

exports.signalsReqsLookupReducer = async (requirementsData) => {
  // Preprocessing Requirements
  // This is a lookup of a signal to get which requirements are using it.
  const lookupTable = {};
  const lookupKeysSet = new Set();
  const artifactLookupById = {};

  const start = performance.now();

  const promiseHandler = async (reqData) => {
    if (reqData?.primaryText == null) return Promise.resolve();
    artifactLookupById[reqData.id] = reqData;

    const messages = [
      {
        role: "system",
        content: "You are an assistant helping System Test Engineers",
      },
      {
        role: "user",
        content: prompts.replace("##REQUIREMENT##", reqData.primaryText),
      },
    ];

    const res = await chatCompletion(messages);
    const content = res.data[0];

    content?.split("\n").forEach((ln) => {
      if (ln.includes(LIST_OF_KEYWORDS)) return;
      if (!ln.startsWith("- ")) return;

      const signal = ln.slice(2)?.trim();

      if (signal === "") return;

      if (lookupTable[signal] == null) {
        lookupTable[signal] = [];
      }

      lookupTable[signal].push({
        reqId: reqData.id,
        reqURI: reqData.uri,
      });

      if (!lookupKeysSet.has(signal)) lookupKeysSet.add(signal);
    });

    if (Object.keys(lookupTable).length % 50 == 0) console.log(Object.keys(lookupTable).length);
  };

  await processDataInBatches(requirementsData, REQ_PER_TIME, promiseHandler, null, new AbortController());
  const lookupKeys = [...lookupKeysSet];
  const lookupKeysEmbedded = await vectorizeLookupKeys(lookupKeys);

  console.log("Time need: ", performance.now() - start);
  // This takes 280 seconds to complete on 8 cores, 30 requirments at a time.
  return {
    lookupTable,
    lookupKeys,
    lookupKeysEmbedded,
    artifactLookupById,
  };
};
