// @ts-ignore: Ignora errori di importazione se i tipi non coincidono
import { OPCUACertificateManager } from "node-opcua"; 
import path from "path";
import fs from "fs";
import os from "os";

// Definiamo i percorsi
const pkiFolder = path.join(__dirname, "../pki");
const certFile = path.join(pkiFolder, "client_certificate.pem");
const keyFile = path.join(pkiFolder, "client_key.pem");

async function createCert() {
    // 1. Setup Cartella
    if (!fs.existsSync(pkiFolder)) {
        fs.mkdirSync(pkiFolder, { recursive: true });
    }

    // 2. Setup Manager
    const certificateManager = new (OPCUACertificateManager as any)({
        automaticallyAcceptUnknownCertificate: true,
        rootFolder: pkiFolder,
    });

    await certificateManager.initialize();

    console.log("✍️  Creazione certificato per NeonOpcuaExplorer...");

    // 3. Creazione Certificato (CORRETTO QUI)
    await certificateManager.createSelfSignedCertificate({
        // IMPORTANTE: Questo URI deve essere identico a quello che il server.ts si aspetta
        applicationUri: `urn:${os.hostname()}:NeonOpcuaExplorer`,
        subject: "CN=NeonOpcuaExplorer", 
        startDate: new Date(),
        validity: 365 * 10,
        dns: [os.hostname(), "localhost"],
        outputFile: certFile,
    });

    // 4. Copia delle chiavi
    const internalKey = path.join(pkiFolder, "own/private/private_key.pem");
    const internalCert = path.join(pkiFolder, "own/certs/self_signed_certificate.pem");

    if (fs.existsSync(internalKey)) {
        fs.copyFileSync(internalKey, keyFile);
    }
    
    if (fs.existsSync(internalCert)) {
        fs.copyFileSync(internalCert, certFile);
    }

    console.log("✅ Certificati 'NeonOpcuaExplorer' generati!");
}

createCert().catch((err) => console.error("Errore:", err));