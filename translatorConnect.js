const TextTranslationClient = require("@azure-rest/ai-translation-text").default;

const endpoint = process.env.TRANSLATOR_API_BASE || "";
const azureApiKey = process.env.TRANSLATOR_API_KEY || "";
const region = process.env.TRANSLATOR_API_REGION || "global";

const translateCredential = {
    key: azureApiKey,
    region,
};

const translatorClient = TextTranslationClient(endpoint, translateCredential);

module.exports = translatorClient;