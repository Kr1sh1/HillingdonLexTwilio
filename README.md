# HillingdonLexTwilio

## Project Structure
Twilio Functions is a serverless environment.

Every TypeScript function under `/functions` is deployed individually to a unique URL. An extension of `.protected.ts` ensures the deployed function is only invokable by Twilio webhooks. Each function can reference each other relatively from under the `/functions` directory.

The `transcribe` function is invoked when an inbound phone call is received, this behaviour is currently hardcoded in the deploy workflow but can become configurable.

The `statusCallback` function is invoked whenever the status of a phone call changes. Again, this is hardcoded in the deploy workflow. Typically we are only interested in when the phone call is completed successfully.

## Getting Started

### Installation

The project uses a number of external dependencies, all of which can be installed onto your local machine by running the following command from the root of the repository:

```console
user@computer:~$ npm install
```

The following commands will ensure you use a version of node that is compatible with the Twilio runtime when running your code locally.

```console
user@computer:~$ nvm install
user@computer:~$ nvm use
```

Create a .env file that is a copy of the .env.twilio_environment files. Wherever secrets are required, fill them in ONLY in the .env file. This file is in the .gitignore to prevent it from being uploaded. Never add secrets in any file that will be commited to the Git repository.

```console
user@computer:~$ cp .env.twilio_environment .env
```

### Running

The build command compiles your TypeScript files down to JavaScript. Make sure to re-run it any time you make changes to ensure you're running the latest version of your code.

The start command sets up a local Twilio runtime, allowing you to make requests to each local endpoint individually. It does not mimic the flow of a phone call, e.g. calling the Transcribe function will not cause a redirect to the Respond function.

```console
user@computer:~$ npm run build
user@computer:~$ npm run start
```

It's recommended to use a tool like Postman to send requests to these endpoints. You'll need to manage any parameters that need to be sent yourself, besides environment variables which are available by default.

### Debugging

TypeScript can save you from the most common bugs. Run the following command to see if your files compile successfully. The GitHub Actions deploy workflow runs this anyway and will fail to deploy if there are errors, but you can run it locally too and save yourself time.

```console
user@computer:~$ npm run build
```

You can then start a local dev server using the following command. console.log statements are your best friend.

```console
user@computer:~$ npm run start
```

For more fine-grained debugging, you can start the server with debugging enabled. Whatever your IDE, it will need to attach itself to the debug endpoint exposed by the following command.

```console
user@computer:~$ npm run debug
```

For VSCode, you can add a `.vscode/launch.json` file containing the following. In the debug panel, press the green button to attach to your process. You can now set breakpoints inside the TypeScript files. It's normal for the breakpoints to appear as hollow grey circles.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Node Process",
      "port": 9229,
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Eventually we'll add a testing framework you can run locally.

## How CI/CD works in this repository
This repository has 3 core branches that deploy to different environments on Twilio. Each environment is accessible through a different phone number.

Pushing anything to these branches results in a fresh deployment.

Currently the phone numbers can only be called by phone numbers that have been verified in the Twilio Console. Please request us if you'd like to have your number verified in order to call these numbers.

|Branch Name|Phone Number|
|-----------|------------|
|main|+44 78621 32308|
|dev1|+44 74888 90677|
|dev2|+44 74888 98879|
