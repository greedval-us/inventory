import { ref, shallowRef } from 'vue';
import { getDesktopApi } from '../infrastructure/desktopApi.js';
import { errorMessage, type Collection, type TableSchema } from '../registry/catalog';

export function useCatalogSchema() {
  const tables = shallowRef<TableSchema[]>([]);
  const collections = shallowRef<Collection[]>([]);
  const schemaError = ref('');
  let listing: Promise<void> | undefined;

  function refreshTables(fresh = false): Promise<void> {
    if (listing) return fresh === true ? listing.then(() => refreshTables()) : listing;
    schemaError.value = '';
    listing = Promise.resolve().then(() => {
      const api = getDesktopApi();
      return Promise.all([api.listTables(), api.listCollections()]);
    })
      .then(([sections, items]) => {
        tables.value = sections;
        collections.value = items;
      })
      .catch(cause => { schemaError.value = errorMessage(cause, 'Не удалось загрузить разделы и коллекции.'); })
      .finally(() => { listing = undefined; });
    return listing;
  }

  return { tables, collections, schemaError, refreshTables };
}
