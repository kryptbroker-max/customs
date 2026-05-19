const fetch = require('node-fetch');
global.fetch = fetch;
if (fetch.Headers) global.Headers = fetch.Headers;
if (fetch.Request) global.Request = fetch.Request;
if (fetch.Response) global.Response = fetch.Response;
module.exports = fetch;
