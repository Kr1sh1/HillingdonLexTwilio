const Twilio = require('twilio');

class Response {
  constructor() {
    this._body = {};
    this._headers = {};
    this._statusCode = 200;
    this._cookies = {}
    this._attributes = {}
  }

  setBody(body) {
    this._body = body;
  }
    
  setCookie(key, value, attributes) {
      this._cookies[key] = value;
      this._attributes[key] = attributes;
  }

  setStatusCode(code) {
    this._statusCode = code;
  }

  appendHeader(key, value) {
    this._headers[key] = value;
  }
}

const setup = (context = {}) => {
  global.Twilio = Twilio || {};
  
  global.Twilio.Response = Response;
};

const teardown = () => {
  delete global.Twilio;
};

module.exports = {
  setup: setup,
  teardown: teardown,
};
