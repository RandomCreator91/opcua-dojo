import express from "express";
import http from "http";
import { Server } from "socket.io";
// @ts-ignore
import { 
    OPCUAClient, 
    MessageSecurityMode, 
    SecurityPolicy,
    OPCUACertificateManager,
    UserIdentityInfo, 
    ClientSession,
    AttributeIds,
    ReferenceDescription,
    ClientSubscription,
    ClientMonitoredItem,
    TimestampsToReturn,
    MonitoringParametersOptions,
    ReadValueIdOptions,
    DataType,
    Variant,
    DataValue,
    BrowseDirection,
    NodeClass,
    VariantArrayType // Required for handling arrays correctly
} from "node-opcua";
import path from "path";
import fs from "fs";

const app = express();
const server = http.createServer(app);

// --- SECURITY: CORS Policy ---
// In a production environment, strictly restrict the origin to your frontend domain.
const CLIENT_URL = "http://localhost:5173"; 
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] } // Kept as '*' for easier local dev, change to CLIENT_URL in prod.
});

const projectRoot = path.join(__dirname, ".."); 
const pkiFolder = path.join(projectRoot, "pki");
// Ensure PKI directory exists
if (!fs.existsSync(pkiFolder)) fs.mkdirSync(pkiFolder, { recursive: true });

let activeSession: ClientSession | null = null;
let activeSubscription: ClientSubscription | null = null;

// Mapping OPC UA Node Class IDs to human-readable strings for the frontend
const nodeClassMap: Record<number, string> = {
    1: "Object", 2: "Variable", 4: "Method", 8: "ObjectType", 16: "VariableType"
};

// --- DATA VALIDATOR HELPER ---
// Handles Arrays, Numeric Ranges, and Complex Types parsing
function validateInput(rawValue: string, dataType: DataType): { isValid: boolean, value: any, arrayType: VariantArrayType, error?: string } {
    let valueStr = String(rawValue).trim();
    let isArray = false;
    let values: string[] = [valueStr];

    // 1. Array Detection (if it contains commas and is not a String/Text type)
    if (valueStr.includes(',') && dataType !== DataType.String && dataType !== DataType.LocalizedText) {
        isArray = true;
        values = valueStr.split(',').map(v => v.trim());
    }

    const parsedValues: any[] = [];

    // 2. Parsing and Validation for each element
    for (const v of values) {
        let parsed: any;

        switch(dataType) {
            case DataType.Boolean:
                const lower = v.toLowerCase();
                if (['true', '1', 'yes', 'on'].includes(lower)) parsed = true;
                else if (['false', '0', 'no', 'off'].includes(lower)) parsed = false;
                else return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Invalid Boolean: '${v}'` };
                break;

            case DataType.SByte: // Range: -128 to 127
                parsed = Number(v);
                if (isNaN(parsed) || parsed < -128 || parsed > 127) 
                    return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Value '${v}' out of range for SByte (-128 to 127)` };
                break;

            case DataType.Byte: // Range: 0 to 255
                parsed = Number(v);
                if (isNaN(parsed) || parsed < 0 || parsed > 255) 
                    return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Value '${v}' out of range for Byte (0 to 255)` };
                break;

            case DataType.Int16: // Range: -32768 to 32767
                parsed = Number(v);
                if (isNaN(parsed) || parsed < -32768 || parsed > 32767) 
                    return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Value '${v}' out of range for Int16 (-32768 to 32767)` };
                break;

            case DataType.UInt16: // Range: 0 to 65535
                parsed = Number(v);
                if (isNaN(parsed) || parsed < 0 || parsed > 65535) 
                    return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Value '${v}' out of range for UInt16 (0 to 65535)` };
                break;

            case DataType.Int32:
            case DataType.Int64: 
                parsed = parseInt(v);
                if (isNaN(parsed)) return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Invalid Integer: '${v}'` };
                break;

            case DataType.UInt32:
            case DataType.UInt64:
                parsed = parseInt(v);
                if (isNaN(parsed) || parsed < 0) return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Invalid UInt: '${v}'` };
                break;

            case DataType.Float:
            case DataType.Double:
                parsed = parseFloat(v);
                if (isNaN(parsed)) return { isValid: false, value: null, arrayType: VariantArrayType.Scalar, error: `Invalid Float: '${v}'` };
                break;

            default:
                parsed = v; // Strings and other types are passed through
        }
        parsedValues.push(parsed);
    }

    // 3. Final Result Construction
    return {
        isValid: true,
        // If it's an array, return the full array, otherwise just the scalar value
        value: isArray ? parsedValues : parsedValues[0],
        arrayType: isArray ? VariantArrayType.Array : VariantArrayType.Scalar
    };
}

io.on("connection", (socket) => {
    console.log("GUI Connected");

    socket.on("connect-plc", async (data) => {
        const { ip, username, password } = data;
        const endpointUrl = ip.includes("opc.tcp") ? ip : `opc.tcp://${ip}:4840`;
        
        socket.emit("log", { type: "info", msg: `Connecting to ${endpointUrl}...` });

        try {
            // --- SECURITY: Certificate Management ---
            // 'automaticallyAcceptUnknownCertificate' is set to FALSE for better security.
            // This means you MUST manually move the server certificate from 'pki/rejected' to 'pki/trusted'
            // upon the first connection attempt.
            const clientCertificateManager = new (OPCUACertificateManager as any)({
                automaticallyAcceptUnknownCertificate: false, 
                rootFolder: pkiFolder,
                name: "pki_client"
            });
            await clientCertificateManager.initialize();

            const client = OPCUAClient.create({
                applicationName: "NeonOpcuaExplorer",
                connectionStrategy: { initialDelay: 2000, maxRetry: 0 },
                securityMode: MessageSecurityMode.SignAndEncrypt,
                securityPolicy: SecurityPolicy.Basic256Sha256,
                endpointMustExist: false,
                certificateFile: path.join(pkiFolder, "client_certificate.pem"),
                privateKeyFile: path.join(pkiFolder, "client_key.pem"),
                clientCertificateManager: clientCertificateManager
            });

            try {
                await client.connect(endpointUrl);
            } catch (connErr: any) {
                // Specific handling for Untrusted Certificate errors to guide the user
                if (connErr.message.includes("BadCertificateUntrusted")) {
                    socket.emit("log", { type: "error", msg: "SECURITY ALERT: Server Certificate Untrusted!" });
                    socket.emit("log", { type: "warning", msg: "ACTION: Move certificate from 'pki/rejected' to 'pki/trusted/certs'." });
                    return; 
                }
                throw connErr;
            }
            
            // Authentication Strategy
            let userIdentity: UserIdentityInfo = { type: 0 } as any; 
            if (username) {
                userIdentity = { type: 1, userName: username, password: password } as any;
            }

            activeSession = await client.createSession(userIdentity);
            socket.emit("log", { type: "success", msg: "SESSION ACTIVE" }); 

            // Initialize Subscription for monitoring
            activeSubscription = await activeSession.createSubscription2({
                requestedPublishingInterval: 500,
                requestedLifetimeCount: 100,
                requestedMaxKeepAliveCount: 10,
                maxNotificationsPerPublish: 100,
                publishingEnabled: true,
                priority: 10
            });

            // Start browsing from standard 'Objects' folder (ns=0;i=85)
            performBrowse(socket, "ns=0;i=85");

        } catch (err: any) {
            socket.emit("log", { type: "error", msg: err.message });
        }
    });

    socket.on("browse-node", async (nodeId) => {
        if (!activeSession) return;
        performBrowse(socket, nodeId);
    });

    socket.on("monitor-item", async (nodeId) => {
        if (!activeSession || !activeSubscription) return;
        try {
            const itemToMonitor: ReadValueIdOptions = { nodeId: nodeId, attributeId: AttributeIds.Value };
            const monitoredItem = ClientMonitoredItem.create(activeSubscription, itemToMonitor, 
                { samplingInterval: 500, discardOldest: true, queueSize: 10 }, TimestampsToReturn.Both);
            
            monitoredItem.on("changed", (dataValue: DataValue) => {
                socket.emit("item-update", {
                    nodeId: nodeId,
                    value: dataValue.value.value,
                    dataType: dataValue.value.dataType,
                    timestamp: dataValue.serverTimestamp
                });
            });
        } catch (err: any) { socket.emit("log", { type: "error", msg: `Monitor Error: ${err.message}` }); }
    });

    socket.on("write-value", async (data) => {
        if (!activeSession) return;
        const { nodeId, value, dataType } = data;
        
        // --- INPUT VALIDATION STEP ---
        const check = validateInput(value, dataType);
        
        if (!check.isValid) {
            socket.emit("log", { type: "error", msg: `Validation Error: ${check.error}` });
            return;
        }

        try {
            // Send Write Request to PLC
            const statusCode = await activeSession.write({
                nodeId: nodeId, 
                attributeId: AttributeIds.Value,
                value: new DataValue({ 
                    value: new Variant({ 
                        dataType: dataType, 
                        value: check.value,
                        arrayType: check.arrayType // Critical for writing Arrays!
                    }) 
                })
            });

            if (statusCode.name === "Good") socket.emit("log", { type: "success", msg: `Write OK` });
            else socket.emit("log", { type: "error", msg: `Write Failed: ${statusCode.name}` });
        } catch (err: any) { socket.emit("log", { type: "error", msg: `Write Error: ${err.message}` }); }
    });
});

// --- ROBUST BROWSING FUNCTION ---
async function performBrowse(socket: any, nodeId: string) {
    if (!activeSession) return;
    try {
        console.log(`🔍 Browsing: ${nodeId}`);

        const browseResult = await activeSession.browse({
            nodeId: nodeId,
            referenceTypeId: "References", // 'References' grabs all hierarchical and non-hierarchical links
            browseDirection: BrowseDirection.Forward,
            includeSubtypes: true,
            nodeClassMask: 0,
            resultMask: 63
        });

        let references = browseResult.references || [];
        
        // Filter out system noise (Icons, Server status, etc.)
        references = references.filter(ref => {
            const name = ref.displayName.text?.toString() || "";
            return name !== "Server" && name !== "Icon" && !name.startsWith("Aliase");
        });

        // =========================================================
        // 🚑 SIEMENS RECOVERY PATCH V3
        // TIA Portal sometimes hides global DataBlocks from the browse list.
        // This patch manually injects the known DataBlock if missing.
        // =========================================================
        if (nodeId.includes("DataBlocksGlobal")) {
            const alreadyFound = references.some(r => r.displayName.text === "Datenbaustein_1");
            
            if (!alreadyFound) {
                console.log("⚠️ SIEMENS PATCH: Manual 'Datenbaustein_1' injection...");
                // We use 'any' here to bypass strict TypeScript checks for manual injection
                const fakeRef: any = {
                    nodeId: { toString: () => 'ns=3;s="Datenbaustein_1"' },
                    displayName: { text: "Datenbaustein_1" },
                    nodeClass: NodeClass.Object,
                    browseName: { toString: () => "Datenbaustein_1" },
                    typeDefinition: null 
                };
                references.push(fakeRef);
            }
        }
        
        const children = mapBrowseResult(references);
        socket.emit("browse-result", { parentId: nodeId, children: children });

    } catch (err: any) {
        console.error(`Browse Error: ${err.message}`);
        socket.emit("log", { type: "error", msg: `Browse Error: ${err.message}` });
    }
}

// Helper to format browse results for the Frontend
function mapBrowseResult(references: ReferenceDescription[]) {
    return references.map(ref => {
        const rawClass = ref.nodeClass;
        let readableClass = nodeClassMap[rawClass] || "Unknown";
        if (readableClass === "Object") readableClass = "Object"; 

        return {
            nodeId: ref.nodeId.toString(), 
            displayName: ref.displayName.text?.toString() || "Unknown",
            nodeClass: readableClass 
        };
    });
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});