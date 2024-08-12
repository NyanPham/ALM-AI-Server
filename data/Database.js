const fs = require("fs").promises;

class Database {
  constructor(filePath) {
    this.filePath = filePath;

    this.cache = null;
    this.writeTimeout = null;
    this.WRITE_DELAY = 5000;
  }

  async read() {
    if (!this.cache) {
      const data = await fs.readFile(this.filePath, "utf8");
      this.cache = JSON.parse(data);
    }
    return this.cache;
  }

  async write() {
    await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), "utf8");
  }

  scheduleWrite() {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
    }
    this.writeTimeout = setTimeout(() => this.write().catch(console.error), this.WRITE_DELAY);
  }
}

module.exports = Database;
