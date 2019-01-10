import { PebbleCollection, PebbleDocument, readItem, readDate } from "../classes/item";
import { PebbleConnection } from "../classes/connection";
import { createError, PebbleError } from "../classes/error";
import { PebbleFileList } from "../classes/files";

async function get(connection: PebbleConnection, uri: string): Promise<Response> {
  return fetch(connection.server + uri,  connection.username === '' ? undefined : {
    headers: {
      Authorization: 'Basic ' + btoa(connection.username + ':' + connection.password),
    }
  });
}
async function remove(connection: PebbleConnection, uri: string): Promise<Response> {
  const options: any = {
    method: 'DELETE',
  };
  if (connection.username !== '') {
    options.headers = { Authorization: 'Basic ' + btoa(connection.username + ':' + connection.password) };
  }
  return fetch(connection.server + uri, options);
}
async function put(connection: PebbleConnection, uri: string, body: any = '', binary = false): Promise<Response> {
  const isReady = (body instanceof FormData) || (body instanceof File) || (body instanceof Blob);
  const isString = typeof body === 'string';
  const isHeader = body && !isString && 'headers' in body;
  const headers: any = isHeader ? body.headers : {};
  if (connection.username !== '') {
    headers.Authorization = 'Basic ' + btoa(connection.username + ':' + connection.password);
  }
  if (binary) {
    headers['Content-Type'] = 'application/octet-stream';
  }
  if (body && !isReady && !isString) {
    const formData = new FormData();
    let counter = 1;
    for (let i in body) {
      formData.append('file-upload-' + counter++, body[i], i);
    }
    body = formData;
  }
  return fetch(connection.server + uri, {
    headers,
    method: 'PUT',
    body: isHeader ? undefined : body
  });
}
async function readDocument(data: any, connection?: PebbleConnection, uri?: string): Promise<PebbleDocument> {
  return {
    ...readItem(data, 'dba', connection ? connection.username : ''),
    lastModified: readDate(data['lastModified'] || null),
    size: data['size'] || 0,
    mediaType: data['mediaType'] || 'text/plain',
    binaryDoc: data.binaryDoc,
    content: (connection && uri) ? await get(connection, '/exist/restxq/pebble/document?uri=' + uri).then(result => result.text()) : '',
  };
}
async function readCollection(data: any, connection?: PebbleConnection): Promise<PebbleCollection> {
  return {
    ...readItem(data, 'dba', connection ? connection.username : ''),
    collections: await Promise.all((data['collections'] || []).map((collection: any) => readCollection(collection, connection)) as Promise<PebbleCollection>[]),
    documents: await Promise.all((data['documents'] || []).map((docoment: any) => readDocument(docoment, connection)) as Promise<PebbleDocument>[]),
  };
}

async function load(connection: PebbleConnection, uri: string): Promise<PebbleCollection | PebbleDocument> {
  try {
    const result = await get(connection, '/exist/restxq/pebble/explorer?uri=' + uri);
    switch (result.status) {
      case 200:
        const object = await result.json();
        return 'collections' in object ? readCollection(object, connection) : readDocument(object, connection, uri);;
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.permissionDenied, result)
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
}

async function save(connection: PebbleConnection, uri: string, content: string | Blob, binary = false): Promise<boolean> {
  try {
    const result = await put(connection, '/exist/restxq/pebble/document?uri=' + uri, content, binary);
    switch (result.status) {
      case 201: return true;
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.unknown, result);
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
  return false;
}

async function saveDocuments(connection: PebbleConnection, collection: PebbleCollection, documents: PebbleFileList | FormData): Promise<PebbleDocument[]> {
  try {
    const result = await put(connection, '/exist/restxq/pebble/document?uri=' + collection.name, documents);
    switch (result.status) {
      case 201: return Promise.all((await result.json() as any[]).map(doc => readItem(doc, connection ? connection.username : '') as PebbleDocument));
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.unknown, result);
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
}

async function newCollection(connection: PebbleConnection, uri: string): Promise<PebbleCollection> {
  try {
    const result = await put(connection, '/exist/restxq/pebble/collection?uri=' + uri);
    switch (result.status) {
      case 201:
        const json = await result.json();
        return readCollection(json, connection);
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.unknown, result);
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
}

async function connect(connection: PebbleConnection): Promise<PebbleCollection> {
  const root = await load(connection, '/') as PebbleCollection;
  return root;
}
async function removeDoc(connection: PebbleConnection, uri: string, isCollection?: boolean): Promise<boolean> {
  try {
    const result = await remove(connection, '/exist/restxq/pebble/' + (isCollection ? 'collection' : 'document') + '?uri=' + uri);
    switch (result.status) {
      case 204: return true;
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.unknown, result);
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
}

async function move(connection: PebbleConnection, source: string, destination: string, collection: boolean, copy: boolean): Promise<boolean> {
  try {
    const headers = {
      ['x-pebble-' + (copy ? 'copy' : 'move') + '-source']: source,
    };
    const endpoint = collection ? 'collection' : 'document';
    const result = await put(connection, '/exist/restxq/pebble/' + endpoint + '?uri=' + destination, { headers });
    switch (result.status) {
      case 201: return true;
      case 401: throw createError(PebbleError.permissionDenied, result);
      default: throw createError(PebbleError.unknown, result);
    }
  } catch (error) {
    throw createError(PebbleError.unknown, error);
  }
  return false;
}

async function convert(connection: PebbleConnection, document: PebbleDocument): Promise<boolean> {
  return (await put(connection, '/exist/restxq/pebble/document?uri=' + document.name, {
    headers: { 'x-pebble-convert': !document.binaryDoc },
  })).status === 200;
}

export const PebbleApi = {
  load,
  save,
  saveDocuments,
  connect,
  remove: removeDoc,
  move,
  newCollection,
  convert,
};