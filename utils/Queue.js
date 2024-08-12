class Queue {
  constructor(maxConcurrentItems) {
    this.items = []; // Initialize an empty array to store queue elements
    this.maxConcurrentItems = maxConcurrentItems;
  }

  enqueue(item) {
    // Add an item to the end of the queue
    this.items.push(item);
  }

  dequeue() {
    // Remove and return the item from the front of the queue
    if (this.isEmpty()) {
      return null;
    }
    return this.items.shift();
  }

  peek() {
    // Get the front element without removing it
    if (this.isEmpty()) {
      return null;
    }

    return this.items[0];
  }

  isEmpty() {
    // Check whether the queue is empty
    return this.items.length === 0;
  }

  getConcurrentItems() {
    return this.items.slice(0, this.maxConcurrentItems);
  }

  findItemIndex(findCb, { inConcurrent = false } = {}) {
    if (inConcurrent) {
      return this.getConcurrentItems().findIndex(findCb);
    }

    return this.items.findIndex(findCb);
  }

  removeItem(index) {
    return this.items.splice(index, 1);
  }

  printQueue() {
    console.log(this.items);
  }

  getLength() {
    return this.items.length;
  }
}

module.exports = Queue;
