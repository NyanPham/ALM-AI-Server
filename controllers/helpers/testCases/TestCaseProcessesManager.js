class TestCaseProcessesManager {
  constructor() {
    this.processes = new Set();
  }

  static createProcessID(clientID, moduleURI) {
    return clientID + "-" + moduleURI;
  }

  isInProcess(pId) {
    return this.processes.has(pId);
  }

  addProcess(pId) {
    this.processes.add(pId);
  }

  deleteProcess(pId) {
    this.processes.delete(pId);
  }
}

module.exports = TestCaseProcessesManager;
