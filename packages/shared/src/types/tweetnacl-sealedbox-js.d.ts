declare module "tweetnacl-sealedbox-js" {
  function seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
  function open(
    ciphertext: Uint8Array,
    recipientPublicKey: Uint8Array,
    recipientSecretKey: Uint8Array,
  ): Uint8Array | null;
  const overheadLength: number;
  export { seal, open, overheadLength };
  export default { seal, open, overheadLength };
}
