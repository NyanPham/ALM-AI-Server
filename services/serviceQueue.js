const Queue = require("../utils/Queue");

const aiQueue = new Queue(); 

// aiQueue.process(async (job) => {
//     const requestData = job.data; 
//     const aiResult = await processAiRequest(requestData);
// });



module.exports = aiQueue; 