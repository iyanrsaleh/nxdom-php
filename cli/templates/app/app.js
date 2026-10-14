import nxdom from '@nxdom/client';

export async function listItems() {
  return nxdom.db('items').get();
}

export async function createItem(data) {
  return nxdom.db('items').create(data);
}
