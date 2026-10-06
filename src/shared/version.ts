import { version } from '../../package.json';

/** package.json is canonical; release checks reject manifest/lock drift. */
export const EXTENSION_VERSION = version;
