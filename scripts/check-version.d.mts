export function validateVersionSources(packageInfo: {version:string}, lockInfo: {version:string;packages:Record<string,{version?:string}>}, manifest: {version:string}): string;
export function checkVersion(): Promise<string>;
