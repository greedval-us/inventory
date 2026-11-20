// Chromium's debugging pipe is inherited by this child only; it never opens a TCP port.
export function debugPipe(child) {
  const pending = new Map();
  const input = child.stdio[3];
  const output = child.stdio[4];
  let nextId = 1;
  let buffer = '';
  let failure;

  const stop = error => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  input.on('error', stop);
  output.on('error', stop);
  child.once('error', stop);
  output.once('end', () => stop(new Error('The packaged Chromium debugging pipe closed.')));
  output.setEncoding('utf8');
  output.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const request = pending.get(message.id);
      if (!request) continue; // Protocol events have no request id.
      pending.delete(message.id);
      if (message.error) request.reject(new Error(request.method + ': ' + message.error.message));
      else request.resolve(message.result);
    }
  });

  return function send(method, params = {}, sessionId) {
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      input.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  };
}
