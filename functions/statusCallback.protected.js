export function handler (context, event, callback) {
    // Do stuff
    console.log(context, event, callback)
    const response = new Response();
    return callback(null, response)
}
