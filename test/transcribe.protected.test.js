const helpers = require('./helpers/twilio-runtime');
import moment from 'moment';

describe('handler function', () => {
    beforeAll(() => {
        jest.setTimeout(10000);
        helpers.setup();
    });
    afterAll(() => {
        helpers.teardown();
    });
    
    
    test('response content type is set to XML (TwiML)', (done) => {
        const event = {
            request: {
                cookies: {
                    initiated: false
                }
            }
        };
        const tokenFunction = require('../functions/transcribe.protected').handler;

        const callback = (err, response) => {
            try {
                expect(response._headers['Content-Type']).toBe('application/xml');
                done();
            } catch (error) {
                done(error);
            }
        };

        tokenFunction({}, event, callback);
    });
    
    test('initiated cookie is set to true and given correct attributes', (done) => {
        const event = {
            request: {
                cookies: {
                    initiated: false
                }
            }
        };
        const tokenFunction = require('../functions/transcribe.protected').handler;

        const callback = (err, response) => {
            try {
                expect(response._cookies['initiated']).toBe(true);
                expect(response._attributes['initiated']).toContain('Path=/');
                done();
            } catch (error) {
                done(error);
            }
        };
        tokenFunction({}, event, callback);
    });

    test('callStartTimestamp cookies is set correctly and given correct attributes', (done) => {
        const event = {
            request: {
                cookies: {
                    initiated: false
                }
            }
        };
        const tokenFunction = require('../functions/transcribe.protected').handler;

        const callStartTimestamp = encodeURIComponent(moment().utc().format('ddd, DD MMM YYYY HH:mm:ss ZZ'));

        const callback = (err, response) => {
            try {
                expect(response._cookies['callStartTimestamp']).toBe(callStartTimestamp);
                expect(response._attributes['callStartTimestamp']).toContain('Path=/');
                done();
            } catch (error) {
                done(error);
            }
        };
        tokenFunction({}, event, callback);
    });

    test('callStartTimestamp cookies is set correctly and given correct attributes', (done) => {
        const event = {
            request: {
                cookies: {
                    initiated: false
                }
            }
        };
        const tokenFunction = require('../functions/transcribe.protected').handler;

        const callStartTimestamp = encodeURIComponent(moment().utc().format('ddd, DD MMM YYYY HH:mm:ss ZZ'));

        const callback = (err, response) => {
            try {
                expect(response._cookies['callStartTimestamp']).toBe(callStartTimestamp);
                expect(response._attributes['callStartTimestamp']).toContain('Path=/');
                done();
            } catch (error) {
                done(error);
            }
        };
        tokenFunction({}, event, callback);
    });

    test('response body is set to generated TwiML response', (done) => {
        const event = {
            request: {
                cookies: {
                    initiated: false
                }
            }
        };
        const tokenFunction = require('../functions/transcribe.protected').handler;

        const callStartTimestamp = encodeURIComponent(moment().utc().format('ddd, DD MMM YYYY HH:mm:ss ZZ'));

        const callback = (err, response) => {
            try {
                expect(response._body.replace(/<[^>]+>/g, '')).toBe("Hey! I'm HillingdonLex, a chatbot created to help the residents of Hillingdon. What would you like to talk about today? I could help you order recycling bags, report a street that needs cleaning, request a housing repair or make an adult social care query among other things.");
                done();
            } catch (error) {
                done(error);
            }
        };
        tokenFunction({}, event, callback);
    });
    
});
