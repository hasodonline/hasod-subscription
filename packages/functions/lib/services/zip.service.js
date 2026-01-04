"use strict";
/**
 * ZIP Service
 * Creates ZIP archives from multiple files
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZipService = void 0;
exports.getZipService = getZipService;
const archiver_1 = __importDefault(require("archiver"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ZipService {
    /**
     * Create a ZIP archive from multiple files
     */
    async createZip(files, outputPath) {
        return new Promise((resolve, reject) => {
            console.log(`[ZIP] Creating archive with ${files.length} files: ${outputPath}`);
            // Create output stream
            const output = fs.createWriteStream(outputPath);
            const archive = (0, archiver_1.default)('zip', {
                zlib: { level: 9 }, // Maximum compression
            });
            // Handle completion
            output.on('close', () => {
                const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
                console.log(`[ZIP] Archive created: ${outputPath} (${sizeInMB} MB)`);
                resolve(outputPath);
            });
            // Handle errors
            archive.on('error', (err) => {
                console.error(`[ZIP] Archive creation failed:`, err);
                reject(err);
            });
            output.on('error', (err) => {
                console.error(`[ZIP] Output stream error:`, err);
                reject(err);
            });
            // Pipe archive data to the file
            archive.pipe(output);
            // Add files to archive
            for (const file of files) {
                if (fs.existsSync(file.localPath)) {
                    console.log(`[ZIP] Adding file: ${file.nameInZip}`);
                    archive.file(file.localPath, { name: file.nameInZip });
                }
                else {
                    console.warn(`[ZIP] File not found, skipping: ${file.localPath}`);
                }
            }
            // Finalize the archive
            archive.finalize();
        });
    }
    /**
     * Create a ZIP archive from all files in a directory
     */
    async createZipFromDirectory(directoryPath, outputPath, baseFolder) {
        const files = fs.readdirSync(directoryPath);
        const zipFiles = files
            .filter((file) => {
            const filePath = path.join(directoryPath, file);
            return fs.statSync(filePath).isFile();
        })
            .map((file) => ({
            localPath: path.join(directoryPath, file),
            nameInZip: baseFolder ? `${baseFolder}/${file}` : file,
        }));
        return this.createZip(zipFiles, outputPath);
    }
    /**
     * Estimate the size of a ZIP file before creating it
     */
    estimateZipSize(files) {
        let totalSize = 0;
        for (const file of files) {
            if (fs.existsSync(file.localPath)) {
                const stats = fs.statSync(file.localPath);
                totalSize += stats.size;
            }
        }
        // ZIP typically compresses audio by 0-10% (audio is already compressed)
        // We'll assume minimal compression for estimation
        return Math.floor(totalSize * 1.05); // Add 5% overhead for ZIP structure
    }
    /**
     * Check if creating a ZIP is necessary (only one file)
     */
    shouldCreateZip(fileCount) {
        return fileCount > 1;
    }
}
exports.ZipService = ZipService;
// Singleton instance
let zipService = null;
/**
 * Get the singleton ZIP service instance
 */
function getZipService() {
    if (!zipService) {
        zipService = new ZipService();
    }
    return zipService;
}
