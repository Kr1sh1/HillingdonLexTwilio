# HillingdonLexTwilio

## Project Structure
Twilio Functions is a serverless environment.

Every JavaScript function under `/functions` is deployed individually to a unique URL. An extension of `.protected.js` ensures the deployed function is only invokable by Twilio and not externally. Each function can reference each other relatively from under the `/functions` directory.

The `transcribe` function is invoked when an inbound phone call is received, this behaviour is currently hardcoded in the deploy workflow but can become configurable.

The `statusCallback` function is invoked whenever the status of a phone call changes. Again, this is hardcoded in the deploy workflow. Typically we are only interested in when the phone call is completed successfully.

## Getting Started

### Installation

The project uses a number of external dependencies, all of which can be installed onto your local machine by running the following command from the root of the repository:

```console
user@computer:~$ npm install
```

### Debugging

The best way to debug right now is to deploy your code and see if it fails. Then make a phone call for the respective branch. If any errors occur, inspect the logs on the Twilio Console.

Eventually we'll add a testing framework you can run locally.

You can also run the server locally, but you won't be able to make a phone call to it.

## How CI/CD works in this repository
This repository has 3 core branches that deploy to different environments on Twilio. Each environment is accessible through a different phone number.

Pushing anything to these branches results in a fresh deployment.

Currently the phone numbers can only be called by phone numbers that have been verified in the Twilio Console. Please request us if you'd like to have your number verified in order to call these numbers.

|Branch Name|Phone Number|
|-----------|------------|
|main|+44 78621 32308|
|dev1|+44 74888 90677|
|dev2|+44 74888 98879|
