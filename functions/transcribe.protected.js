const Twilio = require('twilio');

exports.handler = function (context, event, callback) {
    // Create a TwiML Voice Response object to build the response
    const twiml = new Twilio.twiml.VoiceResponse();

    // If no previous conversation is present, or if the conversation is empty, start the conversation
    if (!event.request.cookies.convo) {
        // Greet the user with a message using AWS Polly Neural voice
        twiml.say({
            voice: 'Polly.Joanna-Neural',
        },
            "Hey! I'm HillingdonLex, a chatbot created to help the residents of Hillingdon. What would you like to talk about today? I could help you order recycling bags, report a street that needs cleaning, request a housing repair or make an adult social care query among other things."
        );
    }

    // Listen to the user's speech and pass the input to the /respond Function
    twiml.gather({
        speechTimeout: 'auto', // Automatically determine the end of user speech
        speechModel: 'experimental_conversations', // Use the conversation-based speech recognition model
        input: 'speech', // Specify speech as the input type
        action: '/respond', // Send the collected input to /respond
    });

    // Create a Twilio Response object
    const response = new Twilio.Response();

    // Set the response content type to XML (TwiML)
    response.appendHeader('Content-Type', 'application/xml');

    // Set the response body to the generated TwiML
    response.setBody(twiml.toString());

    // If this is the beginning of the call
    if (!event.request.cookies.initiated) {
        response.setCookie('initiated', true, ['Path=/']);
        const logFileName = encodeURIComponent(`${event.From || event.phoneNumber}_${Date.now()}.json`);
        response.setCookie('logFileName', logFileName, ['Path=/']);
    }

    // Return the response to Twilio
    return callback(null, response);
};

