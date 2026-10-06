export const REQUIRED_MANUAL_CHECKS: string[];
export function validateManualQa(result: Record<string,unknown>, version:string): {version:string;privacyUrl:string;checkedAt:string};
export function checkManualQa(file?:string): Promise<{version:string;privacyUrl:string;checkedAt:string}>;
