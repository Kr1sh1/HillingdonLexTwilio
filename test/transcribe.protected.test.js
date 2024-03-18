


jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
    })),
  };
});

jest.mock('@aws-sdk/client-sqs', () => {
  return {
    SQSClient: jest.fn().mockImplementation(() => ({
    })),
  };
});

jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
    })),
  };
});

jest.mock('../functions/helpers/clients', () => {
  return {
    ClientManager: jest.fn().mockImplementation(() => {
      return {
        getOpenAIClient: jest.fn(),
        getS3Client: jest.fn(),
        getSQSClient: jest.fn(),
        getTwilioClient: jest.fn(),
        getSyncClient: jest.fn(),
        // Define other methods as needed
      };
    }),
  };
});

import * as helpers from "./helpers/twilio-runtime"



describe('', () => {

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

  // Add tests for getOpenAIClient, getSQSClient, getTwilioClient, and getSyncClient similarly
});