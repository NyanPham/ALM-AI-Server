const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

const endpoint = process.env.OPEN_API_BASE || "";
const azureApiKey = process.env.OPEN_API_KEY || "";

const openAIClient = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));

module.exports = openAIClient;
