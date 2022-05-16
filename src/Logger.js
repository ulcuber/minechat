const EventEmitter = require('events');
const Channel = require('./Channel');

class Logger extends EventEmitter {
  constructor(builder) {
    super();
    this.builder = builder;
    this.channels = {};
    this.active = null;
  }

  /**
   * @param {string} name
   * @returns {Channel}
   * @emits created
  */
  channel(name) {
    if (!this.channels[name]) {
      const channel = new Channel(this.builder());
      this.channels[name] = channel;
      this.emit('created', name, channel);
    }
    return this.channels[name];
  }

  /**
   * @param {string} name
   * @emits activated
  */
  activate(name) {
    Object.values(this.channels).forEach((channel) => {
      channel.box.hide();
    });
    this.active = this.channel(name);
    this.active.box.show();
    this.active.read();

    this.emit('activated', name, this.active);
  }
}

module.exports = Logger;
