import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const topicManifestRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../topics');
export function listTopicKeys() {
  return fs.readdirSync(topicManifestRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}
export function readTopicManifest(key) {
  const file = path.join(topicManifestRoot, key, 'topic.json');
  const topic = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!topic || typeof topic !== 'object' || topic.key !== key) throw new Error(`${file}: key must equal directory ${key}`);
  if (typeof topic.label !== 'string' || !topic.label.trim()) throw new Error(`${file}: missing label`);
  for (const field of ['signals', 'caseFiles', 'references']) {
    if (topic[field] !== undefined && (!Array.isArray(topic[field]) || topic[field].some(x => typeof x !== 'string' || !x.trim()))) {
      throw new Error(`${file}: ${field} must be an array of nonempty strings`);
    }
  }
  if (topic.protocol !== undefined && (typeof topic.protocol !== 'string' || !topic.protocol.trim())) throw new Error(`${file}: invalid protocol`);
  // Explicit read-only projection: historical task fields never become active contracts.
  return Object.fromEntries(['key', 'label', 'signals', 'protocol', 'caseFiles', 'references'].filter(k => topic[k] !== undefined).map(k => [k, topic[k]]));
}
export function readTopicRegistryFromSource() {
  const topics = listTopicKeys().map(readTopicManifest);
  const keys = new Set();
  for (const topic of topics) {
    if (keys.has(topic.key)) throw new Error(`duplicate topic key: ${topic.key}`);
    keys.add(topic.key);
  }
  if (!topics.length) throw new Error('topics directory contains no topics');
  return topics;
}
