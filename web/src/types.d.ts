declare module 'lz4js' {
  export function compress(data: Uint8Array): Uint8Array;
  export function decompress(data: Uint8Array): Uint8Array;
}

declare const cordova: { platformId: string; version: string } | undefined;
