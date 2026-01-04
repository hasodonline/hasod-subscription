/**
 * ZIP Service
 * Creates ZIP archives from multiple files
 */

import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';

export interface ZipFile {
  localPath: string;
  nameInZip: string;
}

export class ZipService {
  /**
   * Create a ZIP archive from multiple files
   */
  public async createZip(
    files: ZipFile[],
    outputPath: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`[ZIP] Creating archive with ${files.length} files: ${outputPath}`);

      // Create output stream
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      // Handle completion
      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`[ZIP] Archive created: ${outputPath} (${sizeInMB} MB)`);
        resolve(outputPath);
      });

      // Handle errors
      archive.on('error', (err: Error) => {
        console.error(`[ZIP] Archive creation failed:`, err);
        reject(err);
      });

      output.on('error', (err: Error) => {
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
        } else {
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
  public async createZipFromDirectory(
    directoryPath: string,
    outputPath: string,
    baseFolder?: string
  ): Promise<string> {
    const files = fs.readdirSync(directoryPath);

    const zipFiles: ZipFile[] = files
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
  public estimateZipSize(files: ZipFile[]): number {
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
  public shouldCreateZip(fileCount: number): boolean {
    return fileCount > 1;
  }
}

// Singleton instance
let zipService: ZipService | null = null;

/**
 * Get the singleton ZIP service instance
 */
export function getZipService(): ZipService {
  if (!zipService) {
    zipService = new ZipService();
  }
  return zipService;
}
