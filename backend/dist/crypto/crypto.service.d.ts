export declare class CryptoService {
    private getEncryptionKey;
    encrypt(text: string): {
        encrypted: string;
        iv: string;
        authTag: string;
    };
    decrypt(encryptedText: string, ivHex: string, authTagHex: string): string;
}
