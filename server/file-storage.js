import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const provider = (process.env.ONRAMP_FILE_STORAGE_PROVIDER ?? "local").toLowerCase();
const localDirectory = path.resolve(process.env.ONRAMP_FILE_STORAGE_PATH ?? path.join(process.cwd(), "storage", "files"));
let azureContainerClient;

function getAzureContainerClient() {
  if (provider !== "azure") throw new Error(`Unsupported file storage provider: ${provider}`);
  if (azureContainerClient) return azureContainerClient;

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "onramp-files";
  if (!accountName || !containerName) throw new Error("Set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER_NAME to use Azure Blob Storage.");

  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  azureContainerClient = service.getContainerClient(containerName);
  return azureContainerClient;
}

export async function storeFile(storageKey, contents, mimeType) {
  if (provider === "local") {
    await mkdir(localDirectory, { recursive: true });
    await writeFile(path.join(localDirectory, storageKey), contents, { flag: "wx", mode: 0o600 });
    return;
  }

  const blob = getAzureContainerClient().getBlockBlobClient(storageKey);
  await blob.uploadData(contents, { blobHTTPHeaders: { blobContentType: mimeType } });
}

export async function readStoredFile(storageKey) {
  if (provider === "local") return readFile(path.join(localDirectory, storageKey));
  return getAzureContainerClient().getBlobClient(storageKey).downloadToBuffer();
}

export async function removeStoredFile(storageKey) {
  if (provider === "local") return unlink(path.join(localDirectory, storageKey));
  await getAzureContainerClient().getBlobClient(storageKey).deleteIfExists();
}

export async function checkFileStorage() {
  if (provider === "local") {
    await mkdir(localDirectory, { recursive: true });
    await access(localDirectory);
    return "local";
  }

  await getAzureContainerClient().getProperties();
  return "azure";
}
