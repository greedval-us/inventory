import { randomUUID } from 'node:crypto';
import { openPhotoStream } from '../attachments/photoStream.js';

export const photoScheme = 'inventory-photo';

export function createPhotoProtocol(services, getWindow) {
  // There is one viewer per application window. A new request replaces its previous capability.
  let grant;
  function preview(input) {
    const { id, tableId, recordId, fieldKey } = input ?? {};
    const owner = { id, tableId, recordId, fieldKey };
    services.attachments.photoSource(owner);
    const url = photoScheme + '://preview/' + randomUUID();
    grant = { owner, url, window: getWindow(), database: services.info.databasePath };
    return url;
  }

  async function respond(request) {
    const ticket = grant;
    const valid = () => ticket && grant === ticket && ticket.window === getWindow() && !ticket.window.isDestroyed()
      && ticket.database === services.info.databasePath;
    if (!valid() || request.url !== ticket.url || request.method !== 'GET') return { statusCode: 404, data: null };
    let file;
    try {
      // A draft may have been removed, the row deleted or its field changed after the URL was issued.
      const source = services.attachments.photoSource(ticket.owner);
      file = await openPhotoStream(source, valid);
      if (!file) return { statusCode: 415, data: null };
      if (!valid() || services.attachments.photoSource(ticket.owner).path !== source.path) {
        file.data.destroy();
        return { statusCode: 404, data: null };
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': file.mime,
          'Content-Length': String(file.length),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
        data: file.data,
      };
    } catch {
      file?.data.destroy();
      return { statusCode: 404, data: null };
    }
  }

  return { preview, respond };
}
